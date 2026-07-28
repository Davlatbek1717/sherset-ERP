import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PickListPosition } from './pick-list.service.js';
import { picksyncVar } from './picksync-env.util.js';

/**
 * Poller: every 30s pull new/updated «Заказ покупателя» docs from the REAL
 * MoySklad account into MsPickList. The cashiers keep working in MoySklad;
 * the warehouse sees each order here seconds later and prints the pick list.
 *
 * Enabled ONLY when credentials are present in env:
 *   MOYSKLAD_SYNC_LOGIN + MOYSKLAD_SYNC_PASSWORD   (Basic)
 * Optional:
 *   MOYSKLAD_SYNC_ACCOUNT_ID — target tenant (default: seed Demo account)
 *   MOYSKLAD_SYNC_BASE       — API base (default api.moysklad.ru remap 1.2)
 *
 * Cursor = max(msUpdatedAt) stored, minus a 2-minute overlap (upsert makes the
 * overlap idempotent). First run backfills the last 48h only — NOT the whole
 * 33k-order history. Orders are processed in `updated` ascending order and the
 * batch STOPS at the first failure, so the cursor can never jump past an order
 * whose positions failed to download (it retries next tick).
 *
 * Single-server safe: @Cron fires in one process; isRunning prevents overlap.
 */
@Injectable()
export class PickListSyncService {
  private readonly logger = new Logger(PickListSyncService.name);
  private isRunning = false;
  /** After an auth failure, back off (owner may have changed the password). */
  private authFailedUntil = 0;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private get base(): string {
    return process.env.MOYSKLAD_SYNC_BASE ?? 'https://api.moysklad.ru/api/remap/1.2';
  }

  private get accountId(): string {
    return process.env.MOYSKLAD_SYNC_ACCOUNT_ID ?? '00000000-0000-0000-0000-000000000001';
  }

  private authHeader(): string | null {
    const login = picksyncVar('MOYSKLAD_SYNC_LOGIN');
    const password = picksyncVar('MOYSKLAD_SYNC_PASSWORD');
    if (!login || !password) return null;
    return `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`;
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async tick(): Promise<void> {
    if (this.isRunning) return;
    if (Date.now() < this.authFailedUntil) return;
    const auth = this.authHeader();
    if (!auth) return; // not configured on this box (e.g. dev) — feature dormant
    this.isRunning = true;
    try {
      const n = await this.syncOnce(auth);
      if (n > 0) this.logger.log(`MoySklad pick-list sync: ${n} order(s) upserted`);
    } catch (err) {
      const msg = String(err);
      if (msg.includes('HTTP 401') || msg.includes('HTTP 403')) {
        // don't hammer a dead credential — retry in 15 minutes
        this.authFailedUntil = Date.now() + 15 * 60_000;
        this.logger.error(`MoySklad auth failed — pausing sync 15min: ${msg}`);
      } else {
        this.logger.warn(`MoySklad pick-list sync failed (next tick retries): ${msg}`);
      }
    } finally {
      this.isRunning = false;
    }
  }

  /** Manual trigger (POST /pick-lists/sync) — also used by the live tests. */
  async runOnce(): Promise<{ synced: number }> {
    const auth = this.authHeader();
    if (!auth) return { synced: 0 };
    if (this.isRunning) return { synced: 0 };
    this.isRunning = true;
    try {
      return { synced: await this.syncOnce(auth) };
    } finally {
      this.isRunning = false;
    }
  }

  private async fetchJson(auth: string, path: string): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.base}${path}`, {
      headers: { Authorization: auth, 'Accept-Encoding': 'gzip' },
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 200);
      throw new Error(`HTTP ${res.status} on ${path}: ${body}`);
    }
    return (await res.json()) as Record<string, unknown>;
  }

  /** MoySklad filter moment format: `YYYY-MM-DD HH:mm:ss` (account TZ, local). */
  private msMoment(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  /** Parse MoySklad `2026-07-27 11:54:00.000` as server-local time. */
  private parseMoment(s: unknown): Date {
    if (typeof s !== 'string') return new Date(0);
    const d = new Date(s.replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? new Date(0) : d;
  }

  /** Both doc kinds land in the same list: orders AND sales returns (owner
   *  2026-07-28: «возврат bo'lganlar ham ko'rinishi kerak»). */
  private static readonly DOC_TYPES = ['customerorder', 'salesreturn'] as const;

  private async syncOnce(auth: string): Promise<number> {
    const accountId = this.accountId;
    let total = 0;
    for (const docType of PickListSyncService.DOC_TYPES) {
      total += await this.syncType(auth, accountId, docType);
    }
    await this.reconcileDeleted(auth, accountId);
    return total;
  }

  private async syncType(
    auth: string,
    accountId: string,
    docType: (typeof PickListSyncService.DOC_TYPES)[number],
  ): Promise<number> {
    // Per-type cursor: a quiet stretch in one document kind must not let the
    // other kind's cursor skip past it.
    const last = await this.prisma.client.msPickList.aggregate({
      where: { accountId, docType },
      _max: { msUpdatedAt: true },
    });
    const cursor = last._max.msUpdatedAt
      ? new Date(last._max.msUpdatedAt.getTime() - 2 * 60_000)
      : new Date(Date.now() - 48 * 3600_000);

    const filter = encodeURIComponent(`updated>=${this.msMoment(cursor)}`);
    const list = await this.fetchJson(
      auth,
      `/entity/${docType}?filter=${filter}&order=updated,asc&limit=50&expand=agent,store,owner`,
    );
    const rows = (list.rows ?? []) as Array<Record<string, unknown>>;
    let synced = 0;
    for (const row of rows) {
      const id = String(row.id ?? '');
      if (!id) continue;
      // Positions: usually a handful; page through defensively.
      const positions: PickListPosition[] = [];
      let offset = 0;
      for (;;) {
        const page = await this.fetchJson(
          auth,
          `/entity/${docType}/${id}/positions?limit=100&offset=${offset}&expand=assortment.uom`,
        );
        const prows = (page.rows ?? []) as Array<Record<string, unknown>>;
        for (const p of prows) {
          const a = (p.assortment ?? {}) as Record<string, unknown>;
          const barcodes = (a.barcodes ?? []) as Array<Record<string, unknown>>;
          const uom = (a.uom ?? null) as { name?: unknown } | null;
          positions.push({
            msAssortmentId: typeof a.id === 'string' ? a.id : null,
            name: typeof a.name === 'string' ? a.name : '?',
            qty: Number(p.quantity ?? 0),
            code: typeof a.code === 'string' ? a.code : null,
            barcode: barcodes.length ? String(Object.values(barcodes[0] ?? {})[0] ?? '') : null,
            priceMinor: Number(p.price ?? 0),
            discount: Number(p.discount ?? 0),
            uom: typeof uom?.name === 'string' ? uom.name : null,
          });
        }
        const meta = (page.meta ?? {}) as { size?: number };
        offset += prows.length;
        if (prows.length < 100 || offset >= (meta.size ?? 0)) break;
      }

      const nameOf = (v: unknown): string | null => {
        if (v && typeof v === 'object' && 'name' in v) {
          const n = (v as { name?: unknown }).name;
          return typeof n === 'string' ? n : null;
        }
        return null;
      };
      const agentPhone =
        row.agent && typeof row.agent === 'object' && 'phone' in row.agent
          ? typeof (row.agent as { phone?: unknown }).phone === 'string'
            ? ((row.agent as { phone: string }).phone ?? null)
            : null
          : null;
      const fields = {
        name: String(row.name ?? ''),
        moment: this.parseMoment(row.moment),
        msUpdatedAt: this.parseMoment(row.updated),
        agentName: nameOf(row.agent),
        agentPhone,
        storeName: nameOf(row.store),
        ownerName: nameOf(row.owner),
        description: typeof row.description === 'string' ? row.description : null,
        sumMinor: BigInt(Math.round(Number(row.sum ?? 0))),
        // «Проведено» + payment: un-proving or paying bumps `updated`, so the
        // regular cursor re-syncs these fields within a tick.
        applicable: row.applicable !== false,
        payedMinor: BigInt(Math.round(Number(row.payedSum ?? 0))),
        positions: positions as unknown as object[],
      };
      await this.prisma.client.msPickList.upsert({
        where: { accountId_msOrderId: { accountId, msOrderId: id } },
        update: fields,
        create: { accountId, msOrderId: id, docType, ...fields },
      });
      synced++;
      // rate-limit courtesy between orders (each costs 1+ position fetches)
      if (rows.length > 5) await new Promise((r) => setTimeout(r, 120));
    }
    await this.reconcileDeleted(auth, accountId);
    return synced;
  }

  /**
   * Orders DELETED in MoySklad silently vanish from its lists (no `updated`
   * bump reaches us), so once per tick we re-list the last 48h window as
   * id-only rows (1 request, limit 1000) and drop local rows that are gone.
   * Rows older than the window are history and stay.
   */
  private async reconcileDeleted(auth: string, accountId: string): Promise<void> {
    const cutoff = new Date(Date.now() - 48 * 3600_000);
    const filter = encodeURIComponent(
      `moment>=${this.msMoment(new Date(cutoff.getTime() - 3600_000))}`,
    );
    for (const docType of PickListSyncService.DOC_TYPES) {
      const local = await this.prisma.client.msPickList.findMany({
        where: { accountId, docType, moment: { gte: cutoff } },
        select: { id: true, msOrderId: true },
      });
      if (!local.length) continue;
      const alive = new Set<string>();
      let offset = 0;
      for (;;) {
        const page = await this.fetchJson(
          auth,
          `/entity/${docType}?filter=${filter}&limit=1000&offset=${offset}`,
        );
        const rows = (page.rows ?? []) as Array<{ id?: string }>;
        for (const r of rows) if (r.id) alive.add(r.id);
        const size = ((page.meta ?? {}) as { size?: number }).size ?? 0;
        offset += rows.length;
        if (rows.length === 0 || offset >= size) break;
      }
      // Safety valve: an empty/failed listing must never wipe the table.
      if (alive.size === 0) continue;
      const gone = local.filter((r) => !alive.has(r.msOrderId)).map((r) => r.id);
      if (gone.length) {
        await this.prisma.client.msPickList.deleteMany({ where: { id: { in: gone } } });
        this.logger.log(
          `pick-list reconcile(${docType}): ${gone.length} deleted-in-MoySklad row(s) removed`,
        );
      }
    }
  }
}
