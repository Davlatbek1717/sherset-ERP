import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * MoySklad → Sherset one-way sync (Sherset custom).
 *
 * Pulls the live account («Elektro sentr (Sherset)») over remap/1.2 and
 * upserts uom → product folders → products (+ price types) → counterparties.
 * Identity contract is shared with the file importer
 * (packages/db/prisma/import-ms-export.ts): our row's externalCode =
 * `ms:<moysklad id>` — so a sync UPDATES the rows the initial import created
 * instead of duplicating them. Counterparties use the same `ms:<id>` key
 * (the MS record's own externalCode field is a user-facing value, NOT the key).
 *
 * The token comes from env MOYSKLAD_TOKEN (VPS .env, never the DB). The run
 * executes in the background; poll GET /moysklad-sync/status for progress.
 * One run at a time per account.
 */

const MS_BASE = 'https://api.moysklad.ru/api/remap/1.2';
const PAGE = 1000;
const RETRIES = 3;

// ── remap/1.2 row shapes (only the fields we map) ──────────────────────────
interface MsRef {
  meta?: { href?: string };
}
interface MsSalePrice {
  value: number;
  priceType?: { id?: string; name?: string };
}
export interface MsProduct {
  id: string;
  name: string;
  code?: string;
  article?: string;
  description?: string;
  pathName?: string;
  archived?: boolean;
  buyPrice?: { value: number };
  minPrice?: { value: number };
  salePrices?: MsSalePrice[];
  productFolder?: MsRef;
  uom?: MsRef;
  /** moysklad ships typed barcodes: [{ean13: "460…"}, {code128: "…"}, …]. */
  barcodes?: Array<Record<string, string>>;
}
export interface MsFolder {
  id: string;
  name: string;
  pathName?: string;
  archived?: boolean;
}
export interface MsUom {
  id: string;
  name: string;
}
export interface MsCounterparty {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  legalTitle?: string | null;
  actualAddress?: string | null;
  companyType?: string | null;
  description?: string | null;
  code?: string | null;
  archived?: boolean;
}
/** entity/demand row (expand=positions) — only the archive-relevant fields. */
export interface MsDemandPos {
  quantity?: number;
  price?: number;
  discount?: number;
  vat?: number;
  assortment?: { meta?: { href?: string; type?: string } };
}
export interface MsDemandRow {
  id: string;
  name: string;
  /** Moscow-time "YYYY-MM-DD HH:MM:SS.mmm" (remap 1.2 convention). */
  moment?: string;
  sum?: number;
  vatSum?: number;
  payedSum?: number;
  description?: string | null;
  agent?: MsRef;
  positions?: { meta?: { size?: number; href?: string }; rows?: MsDemandPos[] };
}
/** paymentin / paymentout / cashin / cashout rows share this shape. */
export interface MsMoneyDocRow {
  id: string;
  name: string;
  moment?: string;
  sum?: number;
  vatSum?: number;
  description?: string | null;
  paymentPurpose?: string | null;
  agent?: MsRef;
}

/** remap datetimes are Moscow time (UTC+3) without offset — normalise to Date. */
export function msMoment(s: string | undefined | null): Date {
  if (!s) return new Date();
  const d = new Date(`${s.replace(' ', 'T')}+03:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** GET /report/counterparty row — «Показатели контрагентов». */
export interface MsCounterpartyReportRow {
  counterparty?: { meta?: { href?: string }; name?: string };
  /** Mutual-settlement balance, minor units. moysklad sign is the OPPOSITE
   *  of our CounterpartyBalance: MS positive → WE owe the counterparty,
   *  MS negative → the counterparty owes us. Verified against the live
   *  account 2026-07-04: «1покупатель»/usta/quruvchi customers are all
   *  negative; Delixi/Azia Kabel/Uzkabel/Jinko supplier factories are all
   *  positive. Import must therefore INVERT the value. */
  balance?: number;
}

// ── pure mappers (unit-tested) ──────────────────────────────────────────────
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
export function extractMsId(href?: string): string | null {
  if (!href) return null;
  const m = href.match(UUID);
  return m ? m[0] : null;
}
export function priceToMinor(v: number | undefined | null): bigint | null {
  // remap money is already MINOR units (tiyin) — 1:1, just round float noise.
  return v == null ? null : BigInt(Math.round(v));
}
/** MS typed-barcode array → parallel (values, types) arrays, our schema shape.
 *  Index-aligned: barcodeTypes[i] is the GTIN type of barcodes[i]. */
export function mapBarcodes(raw: MsProduct['barcodes']): {
  barcodes: string[];
  barcodeTypes: string[];
} {
  const barcodes: string[] = [];
  const barcodeTypes: string[] = [];
  for (const b of raw ?? []) {
    const entry = Object.entries(b).find(([, v]) => typeof v === 'string' && v.length > 0);
    if (!entry) continue;
    barcodes.push(entry[1].slice(0, 255));
    barcodeTypes.push(entry[0].slice(0, 20));
  }
  return { barcodes, barcodeTypes };
}

export function mapCounterparty(r: MsCounterparty) {
  return {
    name: r.name.slice(0, 255),
    legalTitle: r.legalTitle?.slice(0, 255) ?? null,
    actualAddress: r.actualAddress?.slice(0, 255) ?? null,
    companyType: r.companyType?.slice(0, 20) || 'legalUZ',
    email: r.email?.slice(0, 255) ?? null,
    phone: r.phone?.slice(0, 20) ?? null,
    description: r.description ?? null,
    code: r.code?.slice(0, 50) ?? null,
    archived: r.archived ?? false,
  };
}

// ── job state (in-memory, per account) ──────────────────────────────────────
export interface SyncCounts {
  created: number;
  updated: number;
  skipped: number;
}
/** Balances stage summary — sign totals let the operator sanity-check the
 *  moysklad sign convention against known business numbers BEFORE writing. */
export interface BalanceImportSummary {
  dryRun: boolean;
  rowsFetched: number;
  matched: number;
  unmatched: number;
  nonzero: number;
  written: number;
  /** Σ of positive balances (minor) — counterparties that owe us. */
  positiveSumMinor: string;
  positiveCount: number;
  /** |Σ| of negative balances (minor) — counterparties we owe. */
  negativeSumMinor: string;
  negativeCount: number;
}
export interface SyncStatus {
  state: 'idle' | 'running' | 'done' | 'error';
  startedAt: string | null;
  finishedAt: string | null;
  stage: string | null;
  progress: { done: number; total: number } | null;
  /** Per-stage counts; a string value = that stage failed with this message
   *  (other stages still ran — partial history imports stay visible). */
  result: Record<string, SyncCounts | BalanceImportSummary | string> | null;
  error: string | null;
}
const IDLE: SyncStatus = {
  state: 'idle',
  startedAt: null,
  finishedAt: null,
  stage: null,
  progress: null,
  result: null,
  error: null,
};

@Injectable()
export class MoyskladSyncService {
  private readonly log = new Logger(MoyskladSyncService.name);
  private readonly jobs = new Map<string, SyncStatus>();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  status(accountId: string): SyncStatus {
    return this.jobs.get(accountId) ?? IDLE;
  }

  /** Start a background sync; returns the (new or already-running) status. */
  run(
    accountId: string,
    opts?: { mode?: 'full' | 'balances' | 'history'; dryRun?: boolean },
  ): SyncStatus {
    const cur = this.jobs.get(accountId);
    if (cur?.state === 'running') return cur;
    const token = process.env.MOYSKLAD_TOKEN;
    if (!token) {
      const failed: SyncStatus = {
        ...IDLE,
        state: 'error',
        error: 'MOYSKLAD_TOKEN yo‘q — server .env ga qo‘shing',
      };
      this.jobs.set(accountId, failed);
      return failed;
    }
    const status: SyncStatus = {
      ...IDLE,
      state: 'running',
      startedAt: new Date().toISOString(),
    };
    this.jobs.set(accountId, status);
    const job =
      opts?.mode === 'balances'
        ? this.executeBalances(accountId, token, status, opts?.dryRun ?? false)
        : opts?.mode === 'history'
          ? this.executeHistory(accountId, token, status)
          : this.execute(accountId, token, status);
    void job.catch((e) => {
      status.state = 'error';
      status.error = e instanceof Error ? e.message : String(e);
      status.finishedAt = new Date().toISOString();
      this.log.error(`sync failed: ${status.error}`);
    });
    return status;
  }

  // ── MS fetch with pagination + retry ──────────────────────────────────────
  /**
   * `path` is relative to remap/1.2 root, e.g. 'entity/product' or
   * 'report/counterparty'. `opts.query` appends extra params (e.g.
   * 'expand=positions'); `opts.pageSize` overrides PAGE — moysklad caps
   * limit at 100 whenever expand is used.
   */
  private async fetchAll<T>(
    token: string,
    path: string,
    opts?: { query?: string; pageSize?: number },
  ): Promise<T[]> {
    const pageSize = opts?.pageSize ?? PAGE;
    const extra = opts?.query ? `&${opts.query}` : '';
    const rows: T[] = [];
    let offset = 0;
    for (;;) {
      const url = `${MS_BASE}/${path}?limit=${pageSize}&offset=${offset}${extra}`;
      let lastErr: unknown = null;
      let page: { rows?: T[]; meta?: { size?: number } } | null = null;
      for (let attempt = 0; attempt < RETRIES; attempt++) {
        try {
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}`, 'Accept-Encoding': 'gzip' },
          });
          if (res.status === 401) throw new Error('MoySklad token rad etildi (401)');
          if (!res.ok) throw new Error(`MoySklad ${path} HTTP ${res.status}`);
          page = (await res.json()) as { rows?: T[]; meta?: { size?: number } };
          break;
        } catch (e) {
          lastErr = e;
          if (e instanceof Error && e.message.includes('401')) throw e;
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
      if (!page) throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
      const batch = page.rows ?? [];
      rows.push(...batch);
      offset += batch.length;
      const size = page.meta?.size ?? rows.length;
      if (batch.length === 0 || offset >= size) return rows;
    }
  }

  /** Existing `ms:*` externalCode → our row id, one query per table. */
  private toMsMap(rows: Array<{ id: string; externalCode: string | null }>): Map<string, string> {
    const m = new Map<string, string>();
    for (const r of rows) if (r.externalCode) m.set(r.externalCode, r.id);
    return m;
  }

  private async execute(accountId: string, token: string, s: SyncStatus): Promise<void> {
    const db = this.prisma.client;
    const result: Record<string, SyncCounts> = {};
    const t0 = Date.now();

    // 1 — uom (id → name lookup; products store uom as a plain string)
    s.stage = 'uom';
    s.progress = null;
    const uoms = await this.fetchAll<MsUom>(token, 'entity/uom');
    const uomName = new Map<string, string>();
    for (const u of uoms) uomName.set(u.id, u.name);

    // 2 — product folders
    s.stage = 'folders';
    const folders = await this.fetchAll<MsFolder>(token, 'entity/productfolder');
    const folderExisting = this.toMsMap(
      await db.productFolder.findMany({
        where: { accountId, externalCode: { startsWith: 'ms:' } },
        select: { id: true, externalCode: true },
      }),
    );
    const folderMap = new Map<string, string>(); // ms id → our id
    const fc: SyncCounts = { created: 0, updated: 0, skipped: 0 };
    s.progress = { done: 0, total: folders.length };
    for (const f of folders) {
      if (!f.id || !f.name) {
        fc.skipped++;
        continue;
      }
      const key = `ms:${f.id}`;
      const data = {
        name: f.name.slice(0, 255),
        pathName: f.pathName?.slice(0, 500) ?? null,
        archived: f.archived ?? false,
      };
      const existing = folderExisting.get(key);
      if (existing) {
        await db.productFolder.update({ where: { id: existing }, data });
        folderMap.set(f.id, existing);
        fc.updated++;
      } else {
        const c = await db.productFolder.create({
          data: { ...data, accountId, externalCode: key },
          select: { id: true },
        });
        folderMap.set(f.id, c.id);
        fc.created++;
      }
      s.progress.done++;
    }
    result.folders = fc;

    // 3 — price types (resolved lazily per product price, same as importer)
    const defaultPt = await db.priceType.findFirst({
      where: { accountId, archived: false, isDefault: true },
      select: { id: true },
    });
    const defaultPtId = defaultPt?.id ?? 'default';
    const ptCache = new Map<string, string>();
    const resolvePriceTypeId = async (pt: MsSalePrice['priceType']): Promise<string> => {
      const msId = pt?.id;
      if (!msId) return defaultPtId;
      const cached = ptCache.get(msId);
      if (cached) return cached;
      const externalCode = `ms:${msId}`;
      const name = (pt?.name ?? 'Price').slice(0, 100);
      const existing = await db.priceType.findFirst({
        where: { accountId, OR: [{ externalCode }, { name }] },
        select: { id: true },
      });
      const id =
        existing?.id ??
        (
          await db.priceType.create({
            data: { accountId, name, externalCode },
            select: { id: true },
          })
        ).id;
      ptCache.set(msId, id);
      return id;
    };

    // 4 — products
    s.stage = 'products';
    const products = await this.fetchAll<MsProduct>(token, 'entity/product');
    const productExisting = this.toMsMap(
      await db.product.findMany({
        where: { accountId, externalCode: { startsWith: 'ms:' } },
        select: { id: true, externalCode: true },
      }),
    );
    const pc: SyncCounts = { created: 0, updated: 0, skipped: 0 };
    s.progress = { done: 0, total: products.length };
    for (const r of products) {
      s.progress.done++;
      if (!r.id || !r.name) {
        pc.skipped++;
        continue;
      }
      try {
        const key = `ms:${r.id}`;
        const folderMsId = extractMsId(r.productFolder?.meta?.href);
        const uomMsId = extractMsId(r.uom?.meta?.href);
        const salePrices: Array<{ priceTypeId: string; value: string }> = [];
        for (const sp of r.salePrices ?? []) {
          salePrices.push({
            priceTypeId: await resolvePriceTypeId(sp.priceType),
            value: String(Math.round(sp.value)),
          });
        }
        const data = {
          name: r.name.slice(0, 255),
          code: r.code?.slice(0, 50) ?? null,
          article: r.article?.slice(0, 50) ?? null,
          description: r.description ?? null,
          pathName: r.pathName?.slice(0, 500) ?? null,
          archived: r.archived ?? false,
          buyPrice: priceToMinor(r.buyPrice?.value),
          minPrice: priceToMinor(r.minPrice?.value),
          salePrices,
          uom: uomMsId ? (uomName.get(uomMsId)?.slice(0, 20) ?? null) : null,
          productFolderId: folderMsId ? (folderMap.get(folderMsId) ?? null) : null,
          kind: 'product',
          ...mapBarcodes(r.barcodes),
        };
        const existing = productExisting.get(key);
        if (existing) {
          await db.product.update({ where: { id: existing }, data });
          pc.updated++;
        } else {
          await db.product.create({ data: { ...data, accountId, externalCode: key } });
          pc.created++;
        }
      } catch (e) {
        pc.skipped++;
        if (pc.skipped <= 10)
          this.log.warn(`product «${r.name}»: ${e instanceof Error ? e.message : e}`);
      }
    }
    result.products = pc;

    // 5 — counterparties
    s.stage = 'counterparties';
    const cps = await this.fetchAll<MsCounterparty>(token, 'entity/counterparty');
    const cpExisting = this.toMsMap(
      await db.counterparty.findMany({
        where: { accountId, externalCode: { startsWith: 'ms:' } },
        select: { id: true, externalCode: true },
      }),
    );
    const cc: SyncCounts = { created: 0, updated: 0, skipped: 0 };
    s.progress = { done: 0, total: cps.length };
    for (const r of cps) {
      s.progress.done++;
      if (!r.id || !r.name) {
        cc.skipped++;
        continue;
      }
      try {
        const key = `ms:${r.id}`;
        const data = mapCounterparty(r);
        const existing = cpExisting.get(key);
        if (existing) {
          await db.counterparty.update({ where: { id: existing }, data });
          cc.updated++;
        } else {
          await db.counterparty.create({ data: { ...data, accountId, externalCode: key } });
          cc.created++;
        }
      } catch (e) {
        cc.skipped++;
        if (cc.skipped <= 10)
          this.log.warn(`counterparty «${r.name}»: ${e instanceof Error ? e.message : e}`);
      }
    }
    result.counterparties = cc;

    s.state = 'done';
    s.stage = null;
    s.progress = null;
    s.result = result;
    s.finishedAt = new Date().toISOString();
    this.log.log(
      `sync done in ${Math.round((Date.now() - t0) / 1000)}s: ${JSON.stringify(result)}`,
    );
  }

  /**
   * Balances-only migration import — «Показатели контрагентов» report →
   * counterparty_balances SNAPSHOT (upsert SET, not increment).
   *
   * moysklad's sign is the opposite of ours (see MsCounterpartyReportRow),
   * so the value INVERTS on write: local = −msBalance. After inversion the
   * summary buckets read in OUR convention — positive* = mijoz qarzlari
   * (they owe us), negative* = shaxsiy qarzlar (we owe them).
   *
   * ⚠ Overwrite semantics: this stomps any locally-accumulated debt for the
   * matched counterparties (POS qarz sales, kirim orderlari). Intended as a
   * ONE-TIME migration step while moysklad is still the ledger of record —
   * run dryRun first, verify the sign totals against known business numbers,
   * then write. Not part of the periodic full sync on purpose.
   */
  private async executeBalances(
    accountId: string,
    token: string,
    s: SyncStatus,
    dryRun: boolean,
  ): Promise<void> {
    const db = this.prisma.client;
    const t0 = Date.now();

    s.stage = 'balances';
    const rows = await this.fetchAll<MsCounterpartyReportRow>(token, 'report/counterparty');

    const cpExisting = this.toMsMap(
      await db.counterparty.findMany({
        where: { accountId, externalCode: { startsWith: 'ms:' } },
        select: { id: true, externalCode: true },
      }),
    );

    const summary: BalanceImportSummary = {
      dryRun,
      rowsFetched: rows.length,
      matched: 0,
      unmatched: 0,
      nonzero: 0,
      written: 0,
      positiveSumMinor: '0',
      positiveCount: 0,
      negativeSumMinor: '0',
      negativeCount: 0,
    };
    let posSum = 0n;
    let negSum = 0n;

    s.progress = { done: 0, total: rows.length };
    for (const r of rows) {
      s.progress.done++;
      const msId = extractMsId(r.counterparty?.meta?.href);
      const localId = msId ? cpExisting.get(`ms:${msId}`) : undefined;
      if (!localId) {
        summary.unmatched++;
        continue;
      }
      summary.matched++;

      // Sign inversion — MS positive means WE owe them; ours means they owe us.
      const balance = -BigInt(Math.round(r.balance ?? 0));
      if (balance > 0n) {
        posSum += balance;
        summary.positiveCount++;
      } else if (balance < 0n) {
        negSum += -balance;
        summary.negativeCount++;
      }
      if (balance === 0n) continue;
      summary.nonzero++;

      if (!dryRun) {
        await db.counterpartyBalance.upsert({
          where: { counterpartyId_currency: { counterpartyId: localId, currency: 'UZS' } },
          create: { accountId, counterpartyId: localId, currency: 'UZS', balanceMinor: balance },
          update: { balanceMinor: balance },
        });
        summary.written++;
      }
    }
    summary.positiveSumMinor = posSum.toString();
    summary.negativeSumMinor = negSum.toString();

    s.state = 'done';
    s.stage = null;
    s.progress = null;
    s.result = { balances: summary };
    s.finishedAt = new Date().toISOString();
    this.log.log(
      `balance import (${dryRun ? 'DRY' : 'WRITE'}) done in ${Math.round((Date.now() - t0) / 1000)}s: ${JSON.stringify(summary)}`,
    );
  }

  /**
   * Document-history migration import — old moysklad documents copied as a
   * READ-ONLY ARCHIVE: demands (sotuvlar) + the four money docs. Idempotent
   * via externalCode `ms:<id>` (existing rows are skipped, never edited).
   *
   * ⚠ NO side effects by design: rows are inserted directly with
   * state='posted' — no stock deltas, no CounterpartyBalance deltas, no
   * MoneyService ops. The stock + balance snapshots (already imported) ARE
   * the final outcome of this history; replaying cascades would double it.
   *
   * Mapping compromises (archive, not parity): every doc lands on the first
   * active organization/store/cash-desk; an agent that is missing locally
   * falls back to the «MoySklad arxiv» counterparty; positions whose
   * assortment isn't a locally-known product keep the raw MS uuid in
   * assortmentId with productId=null (line renders without a name).
   */
  private async executeHistory(accountId: string, token: string, s: SyncStatus): Promise<void> {
    const db = this.prisma.client;
    const result: Record<string, SyncCounts | string> = {};
    const t0 = Date.now();

    s.stage = 'history-prep';
    const [org, store, cashDesk] = await Promise.all([
      db.organization.findFirst({ where: { accountId, archived: false }, select: { id: true } }),
      db.store.findFirst({ where: { accountId, archived: false }, select: { id: true } }),
      db.cashDesk.findFirst({ where: { accountId }, select: { id: true } }),
    ]);
    if (!org || !store) throw new Error('Tarix importi uchun organization/store topilmadi');

    const cpMap = this.toMsMap(
      await db.counterparty.findMany({
        where: { accountId, externalCode: { startsWith: 'ms:' } },
        select: { id: true, externalCode: true },
      }),
    );
    const prodMap = this.toMsMap(
      await db.product.findMany({
        where: { accountId, externalCode: { startsWith: 'ms:' } },
        select: { id: true, externalCode: true },
      }),
    );

    // Fallback agent — money/demand docs require agentId NOT NULL.
    const ARCHIVE_CP = 'ms:archive-fallback';
    let archiveCpId = cpMap.get(ARCHIVE_CP);
    if (!archiveCpId) {
      const existing = await db.counterparty.findFirst({
        where: { accountId, externalCode: ARCHIVE_CP },
        select: { id: true },
      });
      archiveCpId =
        existing?.id ??
        (
          await db.counterparty.create({
            data: {
              accountId,
              name: 'MoySklad arxiv kontragent',
              companyType: 'legalUZ',
              externalCode: ARCHIVE_CP,
            },
            select: { id: true },
          })
        ).id;
    }
    const agentOf = (ref?: MsRef): string => {
      const msId = extractMsId(ref?.meta?.href);
      return (msId ? cpMap.get(`ms:${msId}`) : undefined) ?? archiveCpId;
    };

    // moysklad does NOT enforce unique document numbers; our tables do
    // (@@unique accountId+name). On a P2002 collision retry once with a short
    // ms-id suffix so the duplicate still lands in the archive.
    const isUniqueErr = (e: unknown): boolean =>
      e instanceof Error && e.message.includes('Unique constraint failed');
    const dedupName = (name: string, msId: string): string =>
      `${name.slice(0, 90)}~${msId.slice(0, 8)}`;

    // ── demands (sotuvlar) — expand=positions caps the page size at 100 ────
    s.stage = 'history-demands';
    try {
      const existing = this.toMsMap(
        await db.demand.findMany({
          where: { accountId, externalCode: { startsWith: 'ms:' } },
          select: { id: true, externalCode: true },
        }),
      );
      const rows = await this.fetchAll<MsDemandRow>(token, 'entity/demand', {
        pageSize: 100,
        query: 'expand=positions',
      });
      const dc: SyncCounts = { created: 0, updated: 0, skipped: 0 };
      s.progress = { done: 0, total: rows.length };
      for (const r of rows) {
        s.progress.done++;
        try {
          if (!r.id || !r.name || existing.has(`ms:${r.id}`)) {
            dc.skipped++;
            continue;
          }
          // Embedded positions cover ≤100-line docs; bigger docs need the
          // dedicated positions endpoint.
          let positions = r.positions?.rows ?? [];
          const posSize = r.positions?.meta?.size ?? positions.length;
          if (positions.length === 0 && posSize > 0) {
            positions = await this.fetchAll<MsDemandPos>(token, `entity/demand/${r.id}/positions`);
          }
          const moment = msMoment(r.moment);
          const buildDemand = (name: string) => ({
            data: {
              accountId,
              name,
              externalCode: `ms:${r.id}`,
              agentId: agentOf(r.agent),
              organizationId: org.id,
              storeId: store.id,
              moment,
              applicable: true,
              state: 'posted',
              postedAt: moment,
              sumMinor: BigInt(Math.round(r.sum ?? 0)),
              vatSumMinor: BigInt(Math.round(r.vatSum ?? 0)),
              payedSumMinor: BigInt(Math.round(r.payedSum ?? 0)),
              currency: 'UZS',
              description: r.description ?? null,
              positions: {
                create: positions.map((p, i) => {
                  const kind = p.assortment?.meta?.type ?? 'product';
                  const msAssortId = extractMsId(p.assortment?.meta?.href);
                  const localProd =
                    kind === 'product' && msAssortId ? prodMap.get(`ms:${msAssortId}`) : undefined;
                  return {
                    accountId,
                    position: i,
                    assortmentKind: kind.slice(0, 20),
                    assortmentId: localProd ?? msAssortId ?? r.id,
                    productId: localProd ?? null,
                    quantity: p.quantity ?? 0,
                    priceMinor: BigInt(Math.round(p.price ?? 0)),
                    discount: p.discount ?? 0,
                    vat: p.vat ?? null,
                  };
                }),
              },
            },
          });
          try {
            await db.demand.create(buildDemand(r.name.slice(0, 100)));
          } catch (e) {
            if (!isUniqueErr(e)) throw e;
            await db.demand.create(buildDemand(dedupName(r.name, r.id)));
          }
          dc.created++;
        } catch (e) {
          dc.skipped++;
          if (dc.skipped <= 10)
            this.log.warn(`demand «${r.name}»: ${e instanceof Error ? e.message : e}`);
        }
      }
      result.demands = dc;
    } catch (e) {
      result.demands = `xato: ${e instanceof Error ? e.message : String(e)}`;
    }

    // ── money docs (to'lov tarixi) ──────────────────────────────────────────
    const moneyStages: Array<{
      key: string;
      entity: string;
      create: (r: MsMoneyDocRow, moment: Date, name: string) => Promise<unknown>;
      list: () => Promise<Array<{ id: string; externalCode: string | null }>>;
      needsCashDesk: boolean;
    }> = [
      {
        key: 'payments_in',
        entity: 'paymentin',
        needsCashDesk: false,
        list: () =>
          db.paymentIn.findMany({
            where: { accountId, externalCode: { startsWith: 'ms:' } },
            select: { id: true, externalCode: true },
          }),
        create: (r, moment, name) =>
          db.paymentIn.create({
            data: {
              accountId,
              name,
              externalCode: `ms:${r.id}`,
              agentId: agentOf(r.agent),
              organizationId: org.id,
              moment,
              applicable: true,
              state: 'posted',
              postedAt: moment,
              sumMinor: BigInt(Math.round(r.sum ?? 0)),
              currency: 'UZS',
              description: r.description ?? r.paymentPurpose ?? null,
            },
          }),
      },
      {
        key: 'payments_out',
        entity: 'paymentout',
        needsCashDesk: false,
        list: () =>
          db.paymentOut.findMany({
            where: { accountId, externalCode: { startsWith: 'ms:' } },
            select: { id: true, externalCode: true },
          }),
        create: (r, moment, name) =>
          db.paymentOut.create({
            data: {
              accountId,
              name,
              externalCode: `ms:${r.id}`,
              agentId: agentOf(r.agent),
              organizationId: org.id,
              moment,
              applicable: true,
              state: 'posted',
              postedAt: moment,
              sumMinor: BigInt(Math.round(r.sum ?? 0)),
              currency: 'UZS',
              description: r.description ?? r.paymentPurpose ?? null,
            },
          }),
      },
      {
        key: 'cash_in',
        entity: 'cashin',
        needsCashDesk: true,
        list: () =>
          db.cashIn.findMany({
            where: { accountId, externalCode: { startsWith: 'ms:' } },
            select: { id: true, externalCode: true },
          }),
        create: (r, moment, name) =>
          db.cashIn.create({
            data: {
              accountId,
              name,
              externalCode: `ms:${r.id}`,
              agentId: agentOf(r.agent),
              organizationId: org.id,
              // biome-ignore lint/style/noNonNullAssertion: guarded by needsCashDesk check below
              cashDeskId: cashDesk!.id,
              moment,
              applicable: true,
              state: 'posted',
              postedAt: moment,
              sumMinor: BigInt(Math.round(r.sum ?? 0)),
              currency: 'UZS',
              paymentPurpose: r.paymentPurpose?.slice(0, 500) ?? null,
              description: r.description ?? null,
            },
          }),
      },
      {
        key: 'cash_out',
        entity: 'cashout',
        needsCashDesk: true,
        list: () =>
          db.cashOut.findMany({
            where: { accountId, externalCode: { startsWith: 'ms:' } },
            select: { id: true, externalCode: true },
          }),
        create: (r, moment, name) =>
          db.cashOut.create({
            data: {
              accountId,
              name,
              externalCode: `ms:${r.id}`,
              agentId: agentOf(r.agent),
              organizationId: org.id,
              // biome-ignore lint/style/noNonNullAssertion: guarded by needsCashDesk check below
              cashDeskId: cashDesk!.id,
              moment,
              applicable: true,
              state: 'posted',
              postedAt: moment,
              sumMinor: BigInt(Math.round(r.sum ?? 0)),
              currency: 'UZS',
              paymentPurpose: r.paymentPurpose?.slice(0, 500) ?? null,
              description: r.description ?? null,
            },
          }),
      },
    ];

    for (const stage of moneyStages) {
      s.stage = `history-${stage.key}`;
      if (stage.needsCashDesk && !cashDesk) {
        result[stage.key] = 'xato: kassa (cash desk) topilmadi';
        continue;
      }
      try {
        const existing = this.toMsMap(await stage.list());
        const rows = await this.fetchAll<MsMoneyDocRow>(token, `entity/${stage.entity}`);
        const mc: SyncCounts = { created: 0, updated: 0, skipped: 0 };
        s.progress = { done: 0, total: rows.length };
        for (const r of rows) {
          s.progress.done++;
          try {
            if (!r.id || !r.name || existing.has(`ms:${r.id}`)) {
              mc.skipped++;
              continue;
            }
            const moment = msMoment(r.moment);
            try {
              await stage.create(r, moment, r.name.slice(0, 100));
            } catch (e) {
              if (!isUniqueErr(e)) throw e;
              await stage.create(r, moment, dedupName(r.name, r.id));
            }
            mc.created++;
          } catch (e) {
            mc.skipped++;
            if (mc.skipped <= 10)
              this.log.warn(`${stage.entity} «${r.name}»: ${e instanceof Error ? e.message : e}`);
          }
        }
        result[stage.key] = mc;
      } catch (e) {
        result[stage.key] = `xato: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    s.state = 'done';
    s.stage = null;
    s.progress = null;
    s.result = result;
    s.finishedAt = new Date().toISOString();
    this.log.log(
      `history import done in ${Math.round((Date.now() - t0) / 1000)}s: ${JSON.stringify(result)}`,
    );
  }
}
