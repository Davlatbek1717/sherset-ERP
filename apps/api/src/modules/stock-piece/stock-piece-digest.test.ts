import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { StockPieceDigestCron } from './stock-piece-digest.cron.js';
import { StockPieceDigestService } from './stock-piece-digest.service.js';

/**
 * K6/5 — kunlik sverka signali: XULQ + SIMLAR.
 *
 * Ikki qatlam ataylab (F13 `shift-acceptance-cron.test.ts` naqshi):
 *   1. XULQ — servis farq bo'lganda bildirishnoma yuboradi, bo'lmaganda YO'Q;
 *   2. SIMLAR — cron provayder sifatida ro'yxatdan o'tgan, `@Cron` jadvali
 *      bor va ilova `ScheduleModule` ni ko'taradi. Faqat xulq testi bo'lsa,
 *      kimdir provayderni olib tashlaganda test YASHIL qolardi va funksiya
 *      «yetim modul = o'lik funksiya» bo'lib qolardi.
 */

interface ReconStub {
  diffBuckets?: number;
  rows?: Array<{
    storeName: string;
    cellName: string | null;
    productName: string | null;
    diffQty: string;
    status: 'ok' | 'excess' | 'missing';
  }>;
  warnings?: Array<{ code: string; productName: string | null; count: number }>;
}

function makeService(
  recon: ReconStub = {},
  perms: {
    roles?: Array<{ employeeId: string; scopes: string[] }>;
    overrides?: Array<{ employeeId: string; scope: string }>;
  } = {},
) {
  const reconcile = vi.fn().mockResolvedValue({
    totals: {
      trackedProducts: 1,
      diffBuckets: recon.diffBuckets ?? 0,
      diffQty: '0',
      activePieces: 0,
    },
    rows: recon.rows ?? [],
    warnings: recon.warnings ?? [],
  });
  const employeeRoleFindMany = vi.fn().mockResolvedValue(
    (perms.roles ?? []).map((r) => ({
      employeeId: r.employeeId,
      role: { permissions: r.scopes.map((scope) => ({ scope })) },
    })),
  );
  const employeePermissionFindMany = vi.fn().mockResolvedValue(perms.overrides ?? []);
  const emit = vi.fn().mockResolvedValue(undefined);

  const client = {
    employeeRole: { findMany: employeeRoleFindMany },
    employeePermission: { findMany: employeePermissionFindMany },
  };
  const svc = new StockPieceDigestService(
    { client } as never,
    { reconcile } as never,
    { emit } as never,
  );
  return { svc, reconcile, emit, employeeRoleFindMany, employeePermissionFindMany };
}

const DIFF_ROW = {
  storeName: 'Ombor 07',
  cellName: '07-01-01-01',
  productName: 'Kabel VVG',
  diffQty: '-20',
  status: 'missing' as const,
};

// ── 1. XULQ ─────────────────────────────────────────────────────────────────

describe('K6/5 — kunlik sverka xulqi', () => {
  it('🔴 farq YO`Q — hech kimga xabar yuborilmaydi va ruxsat ham SO`RALMAYDI', async () => {
    const { svc, emit, employeeRoleFindMany } = makeService();
    const out = await svc.runForAccount('acc-1');

    expect(out.notified).toBe(false);
    expect(emit).not.toHaveBeenCalled();
    // Bekorga so'rov yubormaydi — jimlik arzon bo'lishi kerak.
    expect(employeeRoleFindMany).not.toHaveBeenCalled();
  });

  it('farq bor — `piecetracking.view` bo`lgan HAR xodimga bitta xabar', async () => {
    const { svc, emit } = makeService(
      { diffBuckets: 1, rows: [DIFF_ROW] },
      {
        roles: [
          { employeeId: 'e1', scopes: ['ALL'] },
          { employeeId: 'e2', scopes: ['OWN'] },
        ],
      },
    );
    const out = await svc.runForAccount('acc-1');

    expect(out.recipients).toBe(2);
    expect(emit).toHaveBeenCalledTimes(2);
    const [accountId, recipientId, kind, title, body, entity] = emit.mock.calls[0] ?? [];
    expect(accountId).toBe('acc-1');
    expect(recipientId).toBe('e1');
    expect(kind).toBe('piece_reconciliation_diff');
    expect(title).toContain('1');
    expect(body).toContain('Kabel VVG');
    expect(entity).toBe('PieceReconciliation');
  });

  it('sverka FAQAT farqli qatorlarni so`raydi (bildirishnoma matni uchun yetarli)', async () => {
    const { svc, reconcile } = makeService({ diffBuckets: 1, rows: [DIFF_ROW] });
    await svc.runForAccount('acc-1');
    expect(reconcile).toHaveBeenCalledWith('acc-1', expect.objectContaining({ onlyDiff: true }));
  });

  it('🔴 xodim OVERRIDE bilan taqiqlangan bo`lsa — unga xabar YO`Q', async () => {
    const { svc, emit } = makeService(
      { diffBuckets: 1, rows: [DIFF_ROW] },
      {
        roles: [{ employeeId: 'e1', scopes: ['ALL'] }],
        overrides: [{ employeeId: 'e1', scope: 'NO' }],
      },
    );
    const out = await svc.runForAccount('acc-1');
    expect(out.recipients).toBe(0);
    expect(emit).not.toHaveBeenCalled();
  });

  it('farq bor, lekin ruxsatli xodim yo`q — `notified` false (log ogohlantiradi)', async () => {
    const { svc, emit } = makeService({ diffBuckets: 2, rows: [DIFF_ROW] }, { roles: [] });
    const out = await svc.runForAccount('acc-1');
    expect(out.summary.shouldNotify).toBe(true);
    expect(out.notified).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });

  it('ogohlantirish ham signal beradi (farqsiz)', async () => {
    const { svc, emit } = makeService(
      { diffBuckets: 0, warnings: [{ code: 'pieces-without-flag', productName: 'Sim', count: 3 }] },
      { roles: [{ employeeId: 'e1', scopes: ['ALL'] }] },
    );
    await svc.runForAccount('acc-1');
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('faqat ARXIVLANMAGAN xodimlar so`raladi', async () => {
    const { svc, employeeRoleFindMany } = makeService(
      { diffBuckets: 1, rows: [DIFF_ROW] },
      { roles: [{ employeeId: 'e1', scopes: ['ALL'] }] },
    );
    await svc.runForAccount('acc-1');
    const where = employeeRoleFindMany.mock.calls[0]?.[0]?.where;
    expect(where.employee).toEqual({ accountId: 'acc-1', archived: false });
  });

  it('🔴 servis qoldiqqa ham, reyestrga ham YOZMAYDI', () => {
    const src = [
      StockPieceDigestService.prototype.runForAccount,
      // biome-ignore lint/complexity/useLiteralKeys: private metodni manba sifatida o'qish
      (StockPieceDigestService.prototype as unknown as Record<string, () => unknown>)['recipients'],
    ]
      .map((f) => f?.toString() ?? '')
      .join('\n');
    expect(src).not.toMatch(/\.(create|update|upsert|delete|createMany|updateMany)\(/);
    expect(src).not.toMatch(/executeRaw/);
    expect(src).not.toMatch(/stockByCell|applyDeltas/);
  });
});

// ── 2. CRON XULQI ───────────────────────────────────────────────────────────

function makeCron(accounts: string[], digest: { runForAccount: ReturnType<typeof vi.fn> }) {
  const prisma = {
    client: { account: { findMany: vi.fn().mockResolvedValue(accounts.map((id) => ({ id }))) } },
  };
  return new StockPieceDigestCron(digest as never, prisma as never);
}

const QUIET = { summary: { shouldNotify: false, diffBuckets: 0, warnings: 0 }, recipients: 0 };

describe('K6/5 — cron `runForAccount` ni HAQIQATAN chaqiradi', () => {
  it('har hisob uchun bir marta', async () => {
    const runForAccount = vi.fn().mockResolvedValue(QUIET);
    await makeCron(['acc-1', 'acc-2'], { runForAccount }).nightlyDigest();
    expect(runForAccount.mock.calls.map((c) => c[0])).toEqual(['acc-1', 'acc-2']);
  });

  it('bitta hisobning xatosi qolganlarini TO`XTATMAYDI', async () => {
    const runForAccount = vi
      .fn()
      .mockRejectedValueOnce(new Error('db yiqildi'))
      .mockResolvedValue(QUIET);
    const cron = makeCron(['acc-1', 'acc-2'], { runForAccount });
    await expect(cron.nightlyDigest()).resolves.toBeUndefined();
    expect(runForAccount).toHaveBeenCalledTimes(2);
  });

  it('ustma-ust tushish qo`riqchisi', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const runForAccount = vi.fn().mockImplementation(async () => {
      await gate;
      return QUIET;
    });
    const cron = makeCron(['acc-1'], { runForAccount });

    const first = cron.nightlyDigest();
    await cron.nightlyDigest();
    expect(runForAccount).toHaveBeenCalledTimes(1);

    release();
    await first;
    await cron.nightlyDigest();
    expect(runForAccount).toHaveBeenCalledTimes(2);
  });
});

// ── 3. SIMLAR (manba-skan) ──────────────────────────────────────────────────

function moduleArray(src: string, key: 'imports' | 'exports' | 'providers'): string {
  const at = src.indexOf(`${key}: [`);
  if (at < 0) return '';
  const start = at + `${key}: [`.length;
  const end = src.indexOf(']', start);
  return src.slice(start, end);
}

const SRC = path.join(process.cwd(), 'src');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

describe('K6/5 — cron simlari (yetim qolmasin)', () => {
  const cronSrc = read('modules/stock-piece/stock-piece-digest.cron.ts');
  const moduleSrc = read('modules/stock-piece/stock-piece.module.ts');
  const appSrc = read('app.module.ts');

  it('cron manbasida `runForAccount` chaqiruvi BOR', () => {
    expect(cronSrc).toContain('.runForAccount(');
  });

  it('cron metodida `@Cron` jadvali bor (dekoratorsiz hech qachon yurmaydi)', () => {
    expect(/@Cron\(\s*['"`][^'"`]+['"`]/.test(cronSrc)).toBe(true);
  });

  it('🔴 jadval SAVDODAN KEYIN — soat 20:00 (kunduzgi farq normal holat)', () => {
    expect(cronSrc).toContain("@Cron('0 20 * * *'");
    expect(cronSrc).toContain('HR_TZ');
  });

  it('`StockPieceDigestCron` StockPieceModule provayderi', () => {
    expect(moduleArray(moduleSrc, 'providers')).toContain('StockPieceDigestCron');
  });

  it('modul `NotificationModule` ni import qiladi (signal usiz ketmaydi)', () => {
    expect(moduleArray(moduleSrc, 'imports')).toContain('NotificationModule');
  });

  it('ilova `ScheduleModule` ni ko`taradi va StockPieceModule ni ro`yxatga oladi', () => {
    expect(appSrc).toContain('ScheduleModule.forRoot()');
    expect(moduleArray(appSrc, 'imports')).toContain('StockPieceModule');
  });

  it('skaner vakuum emas — manbalar haqiqatan o`qildi', () => {
    expect(cronSrc.length).toBeGreaterThan(400);
    expect(moduleSrc).toContain('StockPieceDigestService');
    expect(appSrc.length).toBeGreaterThan(1000);
  });
});
