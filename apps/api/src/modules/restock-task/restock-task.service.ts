import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationService } from '../notification/notification.service.js';
import {
  ConfirmLineSchema,
  ConfirmScanSchema,
  CreateRestockFromSalesReturnSchema,
  RestockTaskFilterSchema,
} from './restock-task.schema.js';

/** Compose «NN-NN-NN-NN» from 4 numeric bin segments. '' when all unset. */
function formatBin(s: number | null, p: number | null, q: number | null, y: number | null): string {
  if (s == null && p == null && q == null && y == null) return '';
  const pad = (n: number | null) => String(n ?? 0).padStart(2, '0');
  return [s, p, q, y].map(pad).join('-');
}

/**
 * Append the per-cell qty (Phase 2, manually maintained) to a bin code:
 * «01-02-03-05 ×30». null qty (not tracked) or empty code → unchanged.
 */
function withCellQty(bin: string, qty: Prisma.Decimal | null): string | null {
  if (!bin) return null;
  return qty != null ? `${bin} ×${qty.toString()}` : bin;
}

/**
 * RestockTaskService — create a restock task from a SalesReturn (snapshotting
 * products + bin locations), notify the omborchi, and confirm placement per line
 * (manual or by scanning the senik QR). Tenant-scoped by accountId throughout.
 */
@Injectable()
export class RestockTaskService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  async createFromSalesReturn(accountId: string, authorId: string, raw: unknown) {
    const input = CreateRestockFromSalesReturnSchema.parse(raw);

    const ret = await this.prisma.client.salesReturn.findFirst({
      where: { id: input.salesReturnId, accountId, deletedAt: null },
      include: { positions: { orderBy: { position: 'asc' } } },
    });
    if (!ret) throw new NotFoundException('Vozvrat hujjati topilmadi');
    if (ret.positions.length === 0) {
      throw new BadRequestException('Vozvratda mahsulot yo‘q');
    }

    const assignee = await this.prisma.client.employee.findFirst({
      where: { id: input.assigneeId, accountId },
      select: { id: true, name: true },
    });
    if (!assignee) throw new BadRequestException('Omborchi (xodim) topilmadi');

    const author = await this.prisma.client.employee.findFirst({
      where: { id: authorId, accountId },
      select: { name: true },
    });

    let storeName: string | null = null;
    if (ret.storeId) {
      const store = await this.prisma.client.store.findFirst({
        where: { id: ret.storeId, accountId },
        select: { name: true },
      });
      storeName = store?.name ?? null;
    }

    // Snapshot each returned product's name + home bin location.
    const productIds = ret.positions.map((p) => p.productId).filter((id): id is string => !!id);
    const products = await this.prisma.client.product.findMany({
      where: { id: { in: productIds }, accountId },
      select: {
        id: true,
        name: true,
        locSklad: true,
        locPolka: true,
        locQavat: true,
        locYacheyka: true,
        // Multi-bin: additional shelves this product also sits on — shown
        // alongside the primary bin so the picker knows every place to look.
        extraLocations: {
          select: { sklad: true, polka: true, qavat: true, yacheyka: true },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    const task = await this.prisma.client.restockTask.create({
      data: {
        accountId,
        sourceType: 'salesreturn',
        sourceId: ret.id,
        sourceName: ret.name,
        storeId: ret.storeId ?? null,
        storeName,
        assigneeId: assignee.id,
        assigneeName: assignee.name,
        createdById: authorId,
        createdByName: author?.name ?? null,
        status: 'pending',
        note: input.note ?? null,
        lines: {
          create: ret.positions.map((pos, i) => {
            const prod = pos.productId ? byId.get(pos.productId) : null;
            const bin = prod
              ? formatBin(prod.locSklad, prod.locPolka, prod.locQavat, prod.locYacheyka)
              : '';
            return {
              accountId,
              productId: pos.productId ?? null,
              productName: prod?.name ?? '—',
              quantity: pos.quantity,
              binLocation: bin || null,
              position: i,
            };
          }),
        },
      },
      include: { lines: { orderBy: { position: 'asc' } } },
    });

    // Notify the omborchi (best-effort SSE + bell).
    await this.notifications.emit(
      accountId,
      assignee.id,
      'restock_assigned',
      'Vozvratni joylashtirish vazifasi',
      `${task.lines.length} ta mahsulot${ret.name ? ` — ${ret.name}` : ''}`,
      'RestockTask',
      task.id,
    );

    return task;
  }

  /**
   * Compute per-sklad picking SHEETS for a sales document (read-only — creates
   * NO tasks and sends NO notifications). Lines are grouped by each product's
   * sklad (bin-code 1st segment); each sheet carries the sklad's configured
   * keeper (omborchi) name + each product's bin location «NN-NN-NN-NN». Products
   * with no location fall into an «unassigned» (skladNo null) sheet. Powers the
   * print-only «Omborchi yig'ish varaqalari».
   */
  async getPickingSheets(accountId: string, source: string, sourceId: string) {
    let sourceName: string | null = null;
    let storeId: string | null = null;
    let positions: Array<{ productId: string | null; quantity: Prisma.Decimal }> = [];

    if (source === 'retailsale') {
      const sale = await this.prisma.client.retailSale.findFirst({
        where: { id: sourceId, accountId, deletedAt: null },
        include: { positions: { orderBy: { position: 'asc' } } },
      });
      if (!sale) throw new NotFoundException('Kassa sotuvi topilmadi');
      sourceName = sale.name;
      storeId = sale.storeId ?? null;
      positions = sale.positions.map((p) => ({ productId: p.productId, quantity: p.quantity }));
    } else {
      const order = await this.prisma.client.customerOrder.findFirst({
        where: { id: sourceId, accountId, deletedAt: null },
        include: { positions: { orderBy: { position: 'asc' } } },
      });
      if (!order) throw new NotFoundException('Buyurtma topilmadi');
      sourceName = order.name;
      storeId = order.storeId ?? null;
      positions = order.positions.map((p) => ({ productId: p.productId, quantity: p.quantity }));
    }

    if (positions.length === 0) {
      throw new BadRequestException('Hujjatda mahsulot topilmadi');
    }

    let storeName: string | null = null;
    if (storeId) {
      const store = await this.prisma.client.store.findFirst({
        where: { id: storeId, accountId },
        select: { name: true },
      });
      storeName = store?.name ?? null;
    }

    const productIds = positions.map((p) => p.productId).filter((id): id is string => !!id);
    const products = await this.prisma.client.product.findMany({
      where: { id: { in: productIds }, accountId },
      select: {
        id: true,
        name: true,
        locSklad: true,
        locPolka: true,
        locQavat: true,
        locYacheyka: true,
        // Per-cell qty of the primary bin (Phase 2) — shown as a «×N» suffix.
        locQty: true,
        // Multi-bin: additional shelves this product also sits on — shown
        // alongside the primary bin so the picker knows every place to look.
        extraLocations: {
          select: { sklad: true, polka: true, qavat: true, yacheyka: true, qty: true },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    const keepers = await this.prisma.client.skladKeeper.findMany({ where: { accountId } });
    const keeperBySklad = new Map(keepers.map((k) => [k.skladNo, k]));

    // Group positions by sklad (product.locSklad). NULL_SKLAD groups products
    // with no location set (skladNo 0..99999 are all valid keys).
    const NULL_SKLAD = -1;
    type Entry = { pos: (typeof positions)[number]; prod: (typeof products)[number] | null };
    const groups = new Map<number, Entry[]>();
    for (const pos of positions) {
      const prod = pos.productId ? (byId.get(pos.productId) ?? null) : null;
      const key = prod?.locSklad ?? NULL_SKLAD;
      const bucket = groups.get(key);
      if (bucket) bucket.push({ pos, prod });
      else groups.set(key, [{ pos, prod }]);
    }

    const sheets = [...groups.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([key, entries]) => {
        const skladNo = key === NULL_SKLAD ? null : key;
        const keeper = skladNo != null ? keeperBySklad.get(skladNo) : undefined;
        // Serpentine (boustrophedon) pick route: walk the aisles (polka) in
        // order, but reverse the cell (yacheyka) direction on every other aisle
        // so the picker snakes through the zone without backtracking. Tier
        // (qavat) is the secondary key; items with no location sort last.
        const routed = [...entries].sort((a, b) => {
          const pa = a.prod?.locPolka ?? 9999;
          const pb = b.prod?.locPolka ?? 9999;
          if (pa !== pb) return pa - pb;
          const qa = a.prod?.locQavat ?? 0;
          const qb = b.prod?.locQavat ?? 0;
          if (qa !== qb) return qa - qb;
          const ya = a.prod?.locYacheyka ?? 0;
          const yb = b.prod?.locYacheyka ?? 0;
          return pa % 2 === 0 ? yb - ya : ya - yb;
        });
        return {
          skladNo,
          omborchiName: keeper?.employeeName ?? null,
          // Named printer this sklad's strip is routed to (via the local
          // print-agent). null ⇒ no per-printer routing → browser print.
          printerName: keeper?.printerName ?? null,
          lines: routed.map((e) => ({
            productId: e.prod?.id ?? null,
            productName: e.prod?.name ?? '—',
            quantity: e.pos.quantity,
            // «01-02-03-05 ×30» — per-cell qty (Phase 2) rides along as a
            // suffix so every existing consumer (omborchi panel + print strip)
            // shows it without a shape change. No qty tracked → plain code.
            binLocation: e.prod
              ? withCellQty(
                  formatBin(e.prod.locSklad, e.prod.locPolka, e.prod.locQavat, e.prod.locYacheyka),
                  e.prod.locQty,
                )
              : null,
            // Multi-bin: every ADDITIONAL shelf this product also sits on, so
            // the picker/omborchi can look in any of them.
            extraBins: (e.prod?.extraLocations ?? [])
              .map((x) => withCellQty(formatBin(x.sklad, x.polka, x.qavat, x.yacheyka), x.qty))
              .filter((s): s is string => !!s),
          })),
        };
      });

    return { sourceName, storeName, sheets };
  }
  async list(accountId: string, userId: string, raw: unknown) {
    const f = RestockTaskFilterSchema.parse(raw);
    const items = await this.prisma.client.restockTask.findMany({
      where: {
        accountId,
        ...(f.status ? { status: f.status } : {}),
        ...(f.type ? { type: f.type } : {}),
        ...(f.sourceId ? { sourceId: f.sourceId } : {}),
        ...(f.assigneeId ? { assigneeId: f.assigneeId } : {}),
        ...(f.mine ? { assigneeId: userId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: f.limit,
      include: { lines: { select: { confirmedAt: true } } },
    });
    return {
      items: items.map(({ lines, ...t }) => ({
        ...t,
        lineCount: lines.length,
        confirmedCount: lines.filter((l) => l.confirmedAt).length,
      })),
    };
  }

  async findById(accountId: string, id: string) {
    const task = await this.prisma.client.restockTask.findFirst({
      where: { id, accountId },
      include: { lines: { orderBy: { position: 'asc' } } },
    });
    if (!task) throw new NotFoundException('Joylashtirish vazifasi topilmadi');
    return task;
  }

  /** Confirm a specific line (manual «placed» button). */
  async confirmLine(
    accountId: string,
    userId: string,
    taskId: string,
    lineId: string,
    raw: unknown,
  ) {
    const input = ConfirmLineSchema.parse(raw ?? {});
    const line = await this.prisma.client.restockTaskLine.findFirst({
      where: { id: lineId, restockTaskId: taskId, accountId },
    });
    if (!line) throw new NotFoundException('Vazifa qatori topilmadi');
    if (input.productId && line.productId && input.productId !== line.productId) {
      throw new BadRequestException('Mahsulot bu qatorga mos kelmaydi');
    }
    await this.markConfirmed(accountId, userId, taskId, line.id, line.confirmedAt != null);
    return this.findById(accountId, taskId);
  }

  /** Confirm by SCANNED product (senik QR) — matches the first unconfirmed line. */
  async confirmScan(accountId: string, userId: string, taskId: string, raw: unknown) {
    const input = ConfirmScanSchema.parse(raw);
    const lines = await this.prisma.client.restockTaskLine.findMany({
      where: { restockTaskId: taskId, accountId },
      orderBy: { position: 'asc' },
    });
    if (lines.length === 0) throw new NotFoundException('Joylashtirish vazifasi topilmadi');
    const match = lines.find((l) => l.productId === input.productId && l.confirmedAt == null);
    if (!match) {
      const exists = lines.some((l) => l.productId === input.productId);
      throw new BadRequestException(
        exists ? 'Bu mahsulot allaqachon tasdiqlangan' : 'Skanerlangan mahsulot bu vazifada yo‘q',
      );
    }
    await this.markConfirmed(accountId, userId, taskId, match.id, false);
    return this.findById(accountId, taskId);
  }

  // ----- Helpers ------------------------------------------------------------

  private async markConfirmed(
    accountId: string,
    userId: string,
    taskId: string,
    lineId: string,
    alreadyConfirmed: boolean,
  ): Promise<void> {
    if (alreadyConfirmed) return; // idempotent
    const employee = await this.prisma.client.employee.findFirst({
      where: { id: userId, accountId },
      select: { name: true },
    });
    await this.prisma.client.$transaction(async (tx) => {
      await tx.restockTaskLine.update({
        where: { id: lineId },
        data: {
          confirmedAt: new Date(),
          confirmedById: userId,
          confirmedByName: employee?.name ?? null,
        },
      });
      const lines = await tx.restockTaskLine.findMany({
        where: { restockTaskId: taskId },
        select: { confirmedAt: true },
      });
      const allDone = lines.every((l) => l.confirmedAt != null);
      const anyDone = lines.some((l) => l.confirmedAt != null);
      await tx.restockTask.update({
        where: { id: taskId },
        data: { status: allDone ? 'done' : anyDone ? 'in_progress' : 'pending' },
      });
    });
  }
}
