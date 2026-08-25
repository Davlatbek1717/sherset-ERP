import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationService } from '../notification/notification.service.js';
import {
  claimClientOp,
  findClientOp,
  isDuplicateClientOp,
  normalizeClientOpId,
} from '../shared/client-op.js';
import { planShortage, resolveTaskStatus, sortLinesByRoute } from './restock-task-progress.js';
import {
  ConfirmLineSchema,
  ConfirmScanSchema,
  CreateRestockFromSalesReturnSchema,
  RestockTaskFilterSchema,
  ShortageSchema,
} from './restock-task.schema.js';

/**
 * Tovarning «uy» yacheykasi — climart tizimidan o'qiladi.
 *
 * Sherset'da manzil tovarda 4 songa bo'lingan edi (locSklad/locPolka/
 * locQavat/locYacheyka) va `formatBin()` ularni «01-02-03-05» ko'rinishiga
 * yig'ardi. climart AYNAN shu ko'rinishdagi manzilni BITTA satr sifatida
 * `Product.attributes.__yacheyka` da saqlaydi — yig'ish varag'i va `pick-list`
 * moduli ham shuni o'qiydi. Shuning uchun formatlash emas, o'qish kifoya:
 * ikkita parallel manzil tizimi bo'lmasligi uchun sherset ustunlari
 * QAYTARILMADI (egasining qarori, 2026-08-01).
 *
 * Yo'qolgan ikki xususiyat (climart'da ekvivalenti yo'q, ochiq qarz):
 *   · per-yacheyka miqdori («×30» qo'shimchasi) — sherset uni `locQty` da
 *     qo'lda yuritardi; climart'da miqdor `StockByCell` da, tovarda emas;
 *   · ko'p-yacheyka (`extraLocations`) — climart'da tovarga bitta `__yacheyka`.
 */
function cellOf(attrs: unknown): string {
  if (attrs && typeof attrs === 'object' && '__yacheyka' in attrs) {
    const v = (attrs as Record<string, unknown>).__yacheyka;
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return '';
}

/** «01-02-03-05» → [1, 2, 3, 5]; yetishmagan bo'lak null bo'ladi. */
function binSegs(cell: string): (number | null)[] {
  return [0, 1, 2, 3].map((i) => {
    const v = cell.split('-')[i];
    const n = Number(v);
    return v !== undefined && v !== '' && Number.isInteger(n) ? n : null;
  });
}

/** «01-02-03-05» → 1 (ombor raqami); kod yo'q/noraqamli bo'lsa null. */
function skladNoOf(cell: string): number | null {
  const first = cell.split('-')[0];
  const n = Number(first);
  return first !== '' && Number.isInteger(n) ? n : null;
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
        attributes: true,
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
            const bin = prod ? cellOf(prod.attributes) : '';
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
    // «Товарный чек» sarlavha bloki (climart namunasi): xaridor / sotuvchi /
    // telefon / izoh / sana. Kontragent bo'lmasa (o'tkinchi mijoz) — xaridor
    // o'rniga tashkilot nomi chiqadi, blok bo'sh qolmasin.
    let docDate: Date | null = null;
    let buyerName: string | null = null;
    let buyerPhone: string | null = null;
    let sellerName: string | null = null;
    let comment: string | null = null;

    if (source === 'retailsale') {
      const sale = await this.prisma.client.retailSale.findFirst({
        where: { id: sourceId, accountId, deletedAt: null },
        include: {
          positions: { orderBy: { position: 'asc' } },
          agent: { select: { name: true, phone: true } },
          owner: { select: { name: true } },
          organization: { select: { name: true } },
        },
      });
      if (!sale) throw new NotFoundException('Kassa sotuvi topilmadi');
      sourceName = sale.name;
      storeId = sale.storeId ?? null;
      positions = sale.positions.map((p) => ({ productId: p.productId, quantity: p.quantity }));
      docDate = sale.moment;
      buyerName = sale.agent?.name ?? sale.organization?.name ?? null;
      buyerPhone = sale.agent?.phone ?? null;
      sellerName = sale.owner?.name ?? null;
      comment = sale.description ?? null;
    } else {
      const order = await this.prisma.client.customerOrder.findFirst({
        where: { id: sourceId, accountId, deletedAt: null },
        include: {
          positions: { orderBy: { position: 'asc' } },
          agent: { select: { name: true, phone: true } },
          owner: { select: { name: true } },
          organization: { select: { name: true } },
        },
      });
      if (!order) throw new NotFoundException('Buyurtma topilmadi');
      sourceName = order.name;
      storeId = order.storeId ?? null;
      positions = order.positions.map((p) => ({ productId: p.productId, quantity: p.quantity }));
      docDate = order.moment;
      buyerName = order.agent?.name ?? order.organization?.name ?? null;
      buyerPhone = order.agent?.phone ?? null;
      sellerName = order.owner?.name ?? null;
      comment = order.description ?? null;
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
        attributes: true,
        // «Ед.изм» ustuni (climart namunasi) — chekda har qatorda ko'rinadi.
        uom: true,
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
      // Guruhlash kaliti — yacheyka kodining BIRINCHI bo'lagi (= ombor raqami).
      const key = (prod ? skladNoOf(cellOf(prod.attributes)) : null) ?? NULL_SKLAD;
      const bucket = groups.get(key);
      if (bucket) bucket.push({ pos, prod });
      else groups.set(key, [{ pos, prod }]);
    }

    /**
     * Serpentine (boustrophedon) pick route: walk the aisles (polka) in order,
     * but reverse the cell (yacheyka) direction on every other aisle so the
     * picker snakes through the zone without backtracking. Tier (qavat) is the
     * secondary key; items with no location sort last.
     *
     * Segmentlar yacheyka KODIDAN olinadi (climart: «01-02-03-05»).
     * BIRINCHI segment (ombor) ham hisobga olinadi — varaq endi bir necha
     * omborni birlashtirishi mumkin va marshrut ombordan boshlanishi kerak.
     */
    const byRoute = (a: Entry, b: Entry) => {
      const [sa0, pa0, qa0, ya0] = binSegs(a.prod ? cellOf(a.prod.attributes) : '');
      const [sb0, pb0, qb0, yb0] = binSegs(b.prod ? cellOf(b.prod.attributes) : '');
      const sa = sa0 ?? 9999;
      const sb = sb0 ?? 9999;
      if (sa !== sb) return sa - sb;
      const pa = pa0 ?? 9999;
      const pb = pb0 ?? 9999;
      if (pa !== pb) return pa - pb;
      const qa = qa0 ?? 0;
      const qb = qb0 ?? 0;
      if (qa !== qb) return qa - qb;
      const ya = ya0 ?? 0;
      const yb = yb0 ?? 0;
      return pa % 2 === 0 ? yb - ya : ya - yb;
    };

    const toLine = (e: Entry) => ({
      productId: e.prod?.id ?? null,
      productName: e.prod?.name ?? '—',
      quantity: e.pos.quantity,
      // «01-02-03-05 ×30» — per-cell qty (Phase 2) rides along as a suffix so
      // every existing consumer (omborchi panel + print strip) shows it without
      // a shape change. No qty tracked → plain code.
      binLocation: e.prod ? cellOf(e.prod.attributes) || null : null,
      uom: e.prod?.uom ?? null,
      // climart'da tovarga BITTA `__yacheyka` — qo'shimcha javonlar yo'q.
      extraBins: [],
    });

    /** «01» / «Yacheykasiz» — bitta omborli varaqning sarlavhasi. */
    const labelOf = (skladNo: number | null) =>
      skladNo != null ? String(skladNo).padStart(2, '0') : 'Yacheykasiz';

    /**
     * 🔴 CHEK — BITTA RO'YXAT (egasi, 2026-08-16, ikki bosqichda).
     *
     * (1) Ilgari HAR ombor guruhi alohida varaq edi — bu ombor→printer
     * marshruti bor deb faraz qilardi. Egasi jonli sinovda «yacheykali va
     * yacheykasiz alohida-alohida chiqdi» dedi. Tartib ham teskari edi:
     * `NULL_SKLAD = -1` sonli saralashda birinchi turadi.
     * (2) Keyin egasi marshrutning O'ZINI bekor qildi: «saytdan hech biriga
     * alohida printer ulanmaydi — kompyuterning o'ziga ulangan printerdan
     * chiqsin». Ya'ni bo'linishning yagona sababi ham yo'q.
     *
     * Natija: HAMMA pozitsiya bitta varaqda — avval yacheykalilar (ombor →
     * serpantin marshrut), oxirida yacheykasizlar. Sarlavha faqat guruh
     * YAGONA bo'lganda chiqadi; aralashda `null` (na «01», na «Yacheykasiz»
     * rost bo'lardi — manzil har qatorda turibdi).
     */
    const cellKeys = [...groups.keys()].filter((k) => k !== NULL_SKLAD).sort((a, b) => a - b);
    // Yacheykasizlar OXIRIDA: `NULL_SKLAD = -1` bo'lgani uchun oddiy sonli
    // saralash ularni oldinga chiqarardi — shuning uchun kalit alohida qo'shiladi.
    const ordered = [
      ...cellKeys.flatMap((k) => [...(groups.get(k) ?? [])].sort(byRoute)),
      ...(groups.get(NULL_SKLAD) ?? []),
    ];

    const allKeys = [...groups.keys()];
    const soleKey = allKeys.length === 1 ? allKeys[0] : undefined;
    const sheetSkladNo = soleKey != null && soleKey !== NULL_SKLAD ? soleKey : null;
    const sheets =
      ordered.length > 0
        ? [
            {
              skladNo: sheetSkladNo,
              groupLabel: soleKey === undefined ? null : labelOf(sheetSkladNo),
              // Omborchi nomi — vazifa biriktirmasidan (chop etishga aloqasi
              // yo'q); faqat yagona omborli varaqda ma'noli.
              omborchiName:
                sheetSkladNo != null
                  ? (keeperBySklad.get(sheetSkladNo)?.employeeName ?? null)
                  : null,
              lines: ordered.map(toLine),
            },
          ]
        : [];

    return {
      sourceName,
      storeName,
      // «Товарный чек» sarlavha bloki — chek shabloni shu maydonlar bilan
      // to'ldiriladi (sourceName = chek raqami, eski iste'molchilar uchun qoldi).
      docNumber: sourceName,
      docDate: docDate ? docDate.toISOString() : null,
      buyerName,
      buyerPhone,
      sellerName,
      comment,
      sheets,
    };
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
      include: { lines: { select: { confirmedAt: true, shortageQty: true } } },
    });
    return {
      items: items.map(({ lines, ...t }) => ({
        ...t,
        lineCount: lines.length,
        confirmedCount: lines.filter((l) => l.confirmedAt).length,
        // G6 — TSD ro'yxatida topshiriq kartasi «nechtasi qoldi» ni ko'rsatadi.
        // Yetishmovchilik belgilangan qator ham YOPIQ (sof modul izohi), ya'ni
        // `openCount` omborchi hali TEGMAGAN qatorlar soni.
        shortageCount: lines.filter((l) => l.shortageQty != null).length,
        openCount: lines.filter((l) => l.confirmedAt == null && l.shortageQty == null).length,
      })),
    };
  }

  /**
   * Topshiriq detali. Qatorlar YACHEYKA MARSHRUTI tartibida (G6.1) —
   * `sortLinesByRoute` izohi: omborchi javon bo'ylab bir yo'nalishda yuradi,
   * chek tartibidagi ro'yxat esa uni bir javonga uch marta qaytarardi.
   *
   * Tartib TSD uchun ham, web checklist'i (`/restock-tasks/[id]`) uchun ham
   * bir xil: ish bir xil, ya'ni ikki xil tartib berish ikki xil marshrut
   * demakdi. Qatorning asl `position` i javobda QOLADI.
   */
  async findById(accountId: string, id: string) {
    const task = await this.prisma.client.restockTask.findFirst({
      where: { id, accountId },
      include: { lines: { orderBy: { position: 'asc' } } },
    });
    if (!task) throw new NotFoundException('Joylashtirish vazifasi topilmadi');
    return { ...task, lines: sortLinesByRoute(task.lines) };
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
    // Bu yo'l QATORGA manzillangan (`lineId`) ⇒ takror yuborish baribir o'sha
    // qatorni tasdiqlaydi va `alreadyConfirmed` uni no-op qiladi. Ya'ni
    // idempotentlik kaliti bu yerda SHART emas — klient uni baribir yuboradi
    // (bitta navbat shakli), server esa uni `markConfirmed` da da'vo qiladi.
    await this.markConfirmed(accountId, userId, taskId, line.id, line.confirmedAt != null, {
      clientOpId: normalizeClientOpId(input.clientOpId),
      route: 'restock-tasks/lines/confirm',
    });
    return this.findById(accountId, taskId);
  }

  /** Confirm by SCANNED product (senik QR) — matches the first unconfirmed line. */
  async confirmScan(accountId: string, userId: string, taskId: string, raw: unknown) {
    const input = ConfirmScanSchema.parse(raw);
    const clientOpId = normalizeClientOpId(input.clientOpId);
    const route = 'restock-tasks/confirm-scan';

    // 🔴 BU YO'L QATORGA MANZILLANGAN EMAS — u BIRINCHI ochiq qatorni topadi.
    // Ya'ni bitta tovar topshiriqda IKKI qatorda bo'lsa (kassir uni ikki marta
    // qo'shgan), aloqa uzilib qayta yuborilgan skan IKKINCHI qatorni ham
    // yopardi va omborchi olmagan tovar «olindi» bo'lib qolardi. Shuning
    // uchun aynan shu yo'lda idempotentlik kaliti MAJBURIY ma'noga ega.
    if (await findClientOp(this.prisma.client, { accountId, clientOpId, route })) {
      return this.findById(accountId, taskId);
    }

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
    await this.markConfirmed(accountId, userId, taskId, match.id, false, { clientOpId, route });
    return this.findById(accountId, taskId);
  }

  /**
   * G6 — YETISHMOVCHILIK: «javonda shuncha topolmadim».
   *
   * Nega umuman kerak: qator na tasdiqlanadi, na yopiladi bo'lsa topshiriq
   * abadiy ochiq qoladi ⇒ chek KONTROL NAVBATIGA TUSHMAYDI (G2 sharti) va
   * kassir uni yopolmaydi. Belgisiz yetishmovchilik — 2026-08-24 hodisasining
   * boshqa shakli: tizim ishlayotgandek ko'rinadi, kassa esa to'xtaydi.
   *
   * Chek tarkibi bu yerda O'ZGARMAYDI (qator `quantity` si tegilmaydi) —
   * qaror kontrolda: katta omborchi qatorni chiqarib tashlaydi yoki
   * kamaytiradi (`control-edit`, faqat KAMAYTIRISH).
   */
  async setShortage(
    accountId: string,
    userId: string,
    taskId: string,
    lineId: string,
    raw: unknown,
  ) {
    const input = ShortageSchema.parse(raw ?? {});
    const line = await this.prisma.client.restockTaskLine.findFirst({
      where: { id: lineId, restockTaskId: taskId, accountId },
      select: { id: true, quantity: true, confirmedAt: true, shortageQty: true },
    });
    if (!line) throw new NotFoundException('Vazifa qatori topilmadi');

    const task = await this.prisma.client.restockTask.findFirst({
      where: { id: taskId, accountId },
      select: { status: true },
    });
    if (!task) throw new NotFoundException('Joylashtirish vazifasi topilmadi');
    if (task.status === 'cancelled') {
      throw new BadRequestException('Vazifa bekor qilingan');
    }

    const plan = planShortage(
      {
        quantity: line.quantity.toString(),
        confirmedAt: line.confirmedAt,
        shortageQty: line.shortageQty?.toString() ?? null,
      },
      input.qty,
    );
    if (plan.refusals.length > 0) throw new BadRequestException(plan.refusals.join('; '));
    if (plan.noop) return this.findById(accountId, taskId);

    const employee = await this.prisma.client.employee.findFirst({
      where: { id: userId, accountId },
      select: { name: true },
    });

    await this.prisma.client.$transaction(async (tx) => {
      await tx.restockTaskLine.update({
        where: { id: line.id },
        data: {
          shortageQty: plan.shortageQty,
          shortageNote: plan.shortageQty === null ? null : (input.note ?? null),
          shortageAt: plan.shortageQty === null ? null : new Date(),
          shortageById: plan.shortageQty === null ? null : userId,
          shortageByName: plan.shortageQty === null ? null : (employee?.name ?? null),
        },
      });
      await this.syncTaskStatus(tx, taskId);
    });
    return this.findById(accountId, taskId);
  }

  // ----- Helpers ------------------------------------------------------------

  private async markConfirmed(
    accountId: string,
    userId: string,
    taskId: string,
    lineId: string,
    alreadyConfirmed: boolean,
    op?: { clientOpId: string | null; route: string },
  ): Promise<void> {
    if (alreadyConfirmed) return; // idempotent
    const employee = await this.prisma.client.employee.findFirst({
      where: { id: userId, accountId },
      select: { name: true },
    });
    try {
      await this.prisma.client.$transaction(async (tx) => {
        // Kalit AYNAN shu tranzaksiyada da'vo qilinadi (`shared/client-op.ts`):
        // effekt yiqilsa kalit ham qaytadi, ya'ni qayta yuborish toza ishlaydi.
        if (op) {
          await claimClientOp(tx, {
            accountId,
            clientOpId: op.clientOpId,
            route: op.route,
            employeeId: userId,
          });
        }
        await tx.restockTaskLine.update({
          where: { id: lineId },
          data: {
            confirmedAt: new Date(),
            confirmedById: userId,
            confirmedByName: employee?.name ?? null,
          },
        });
        await this.syncTaskStatus(tx, taskId);
      });
    } catch (e) {
      // Poyga: ikkinchi nusxa AYNI paytda kelgan. Effekt yo'q, xato ham yo'q —
      // chaqiruvchi joriy holatni qaytaradi (idempotent javob).
      if (!isDuplicateClientOp(e)) throw e;
    }
  }

  /**
   * Topshiriq holatini QATORLARDAN qayta hisoblaydi (sof modul —
   * `resolveTaskStatus`). Ilgari bu mantiq shu yerda bitta qatorda edi va
   * FAQAT `confirmedAt` ga qarardi; G6 ikkinchi yopilish yo'lini
   * (yetishmovchilik) qo'shdi, ya'ni qoida endi testda qulflanadi.
   *
   * `cancelled` topshiriq TEGILMAYDI: uni manba hujjatning bekor qilinishi
   * qo'ygan va qatorlardan qayta hisoblash uni jimgina «done» ga
   * ko'tarardi — ya'ni bekor qilingan chek «yig'ib bo'lindi» bo'lib qolardi.
   */
  private async syncTaskStatus(
    tx: {
      restockTaskLine: {
        findMany(args: {
          where: { restockTaskId: string };
          select: { confirmedAt: boolean; shortageQty: boolean };
        }): Promise<Array<{ confirmedAt: Date | null; shortageQty: unknown }>>;
      };
      restockTask: {
        findFirst(args: {
          where: { id: string };
          select: { status: boolean };
        }): Promise<{ status: string } | null>;
        update(args: { where: { id: string }; data: { status: string } }): Promise<unknown>;
      };
    },
    taskId: string,
  ): Promise<void> {
    const current = await tx.restockTask.findFirst({
      where: { id: taskId },
      select: { status: true },
    });
    if (current?.status === 'cancelled') return;
    const lines = await tx.restockTaskLine.findMany({
      where: { restockTaskId: taskId },
      select: { confirmedAt: true, shortageQty: true },
    });
    const status = resolveTaskStatus(
      lines.map((l) => ({
        confirmedAt: l.confirmedAt,
        shortageQty: l.shortageQty == null ? null : String(l.shortageQty),
      })),
    );
    await tx.restockTask.update({ where: { id: taskId }, data: { status } });
  }
}
