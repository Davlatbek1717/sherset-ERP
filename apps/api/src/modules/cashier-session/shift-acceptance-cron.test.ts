import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ShiftAcceptanceCron } from './shift-acceptance.cron.js';
import { SHIFT_ESCALATE_AFTER_DAYS, SHIFT_ACCEPTANCE_STATE as ST } from './shift-acceptance.js';
import { ShiftAcceptanceService } from './shift-acceptance.service.js';

/**
 * F13 — smena-qabul avtomatikasi TIRIK (audit topilmasi 2026-08-11).
 *
 * BO'LGAN ISH: `ShiftAcceptanceService.escalateOverdue` yozilgan, testlangan va
 * modulga ulangan edi — lekin uni HECH KIM chaqirmasdi (yagona ishlatuvchi —
 * o'z test fayllari). Ya'ni `SHIFT_ESCALATE_AFTER_DAYS` hech qachon ishlamagan
 * va menejer javobsiz qoldirgan smena navbatda ABADIY qolardi. Bu «yetim modul
 * = o'lik funksiya» bug-klassi: kod bor, kompilyatsiya bo'ladi, testlari
 * yashil — faqat hech qachon YURMAYDI.
 *
 * Shu sababli bu yerda IKKI QATLAM qulflanadi:
 *   1. XULQ — cron metodi har hisob uchun `escalateOverdue` ni HAQIQATAN
 *      chaqiradi (mock servis bilan o'lchanadi);
 *   2. SIMLAR — cron provayder sifatida ro'yxatdan o'tgan, `@Cron` jadvali bor
 *      va ilova `ScheduleModule` ni ko'taradi. Faqat xulq testi bo'lsa, kimdir
 *      provayderni ro'yxatdan olib tashlaganda test YASHIL qolardi va funksiya
 *      yana o'lardi.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// ── 1. Eskalatsiya oynasi (soxta soat) ───────────────────────────────────────

function makeService(rows: { id: string }[]) {
  const findMany = vi.fn().mockResolvedValue(rows);
  const findFirst = vi.fn(async ({ where }: { where: { id: string } }) => ({
    id: where.id,
    acceptanceState: ST.pending,
    cashierId: 'cash-1',
  }));
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const eventCreate = vi.fn().mockResolvedValue({ id: 'ev-1' });
  const tx = {
    cashierSession: { updateMany },
    cashierSessionAcceptanceEvent: { create: eventCreate },
  };
  const client = {
    cashierSession: { findMany, findFirst },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const service = new ShiftAcceptanceService({ client } as never, { zReport: vi.fn() } as never);
  return { service, findMany, updateMany, eventCreate };
}

describe('F13 — eskalatsiya oynasi soxta soat bilan', () => {
  const NOW = new Date('2026-08-11T09:00:00Z');

  it('kesim = now − SHIFT_ESCALATE_AFTER_DAYS va u `acceptanceChangedAt` bo`yicha', async () => {
    const { service, findMany } = makeService([]);
    await service.escalateOverdue('acc-1', NOW);

    const where = findMany.mock.calls[0]?.[0]?.where;
    expect(where.accountId).toBe('acc-1');
    // `updatedAt` YARAMAYDI — u har tahrirda yangilanadi va javobsiz smena
    // hech qachon eskirmasdi.
    expect(where.acceptanceChangedAt.lt.getTime()).toBe(
      NOW.getTime() - SHIFT_ESCALATE_AFTER_DAYS * DAY_MS,
    );
    expect(where.updatedAt).toBeUndefined();
    expect(where.acceptanceState.in).toEqual([ST.pending, ST.rejected]);
  });

  it('kesimdan eski smena `escalated` ga o`tadi va jurnalga sabab yoziladi', async () => {
    const { service, updateMany, eventCreate } = makeService([{ id: 'shift-old' }]);
    const out = await service.escalateOverdue('acc-1', NOW);

    expect(out.escalated).toBe(1);
    expect(updateMany.mock.calls[0]?.[0]?.data?.acceptanceState).toBe(ST.escalated);
    const ev = eventCreate.mock.calls[0]?.[0]?.data;
    expect(ev.toState).toBe(ST.escalated);
    expect(ev.actorType).toBe('system');
    expect(ev.reasonCode).toBe('no_response');
  });

  it('kesimdan yangi smena tanlanmaydi — hech narsa o`zgarmaydi', async () => {
    const { service, updateMany } = makeService([]);
    const out = await service.escalateOverdue('acc-1', NOW);
    expect(out.escalated).toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });
});

// ── 2. Cron XULQI ────────────────────────────────────────────────────────────

function makeCron(accounts: string[], acceptance: { escalateOverdue: ReturnType<typeof vi.fn> }) {
  const prisma = {
    client: { account: { findMany: vi.fn().mockResolvedValue(accounts.map((id) => ({ id }))) } },
  };
  const cron = new ShiftAcceptanceCron(acceptance as never, prisma as never);
  return { cron, prisma };
}

describe('F13 — cron `escalateOverdue` ni HAQIQATAN chaqiradi', () => {
  it('har hisob uchun bir marta chaqiriladi', async () => {
    const escalateOverdue = vi.fn().mockResolvedValue({ escalated: 0 });
    const { cron } = makeCron(['acc-1', 'acc-2'], { escalateOverdue });

    await cron.nightlyEscalate();

    expect(escalateOverdue).toHaveBeenCalledTimes(2);
    expect(escalateOverdue.mock.calls.map((c) => c[0])).toEqual(['acc-1', 'acc-2']);
  });

  it('bitta hisobning xatosi qolganlarini TO`XTATMAYDI', async () => {
    const escalateOverdue = vi
      .fn()
      .mockRejectedValueOnce(new Error('db yiqildi'))
      .mockResolvedValue({ escalated: 1 });
    const { cron } = makeCron(['acc-1', 'acc-2'], { escalateOverdue });

    await expect(cron.nightlyEscalate()).resolves.toBeUndefined();
    expect(escalateOverdue).toHaveBeenCalledTimes(2);
  });

  it('ustma-ust tushish qo`riqchisi — oldingi yurish tugamaguncha yangisi yo`q', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const escalateOverdue = vi.fn().mockImplementation(async () => {
      await gate;
      return { escalated: 0 };
    });
    const { cron } = makeCron(['acc-1'], { escalateOverdue });

    const first = cron.nightlyEscalate();
    await cron.nightlyEscalate(); // ikkinchisi darhol qaytadi
    expect(escalateOverdue).toHaveBeenCalledTimes(1);

    release();
    await first;
    await cron.nightlyEscalate(); // qulf bo'shadi
    expect(escalateOverdue).toHaveBeenCalledTimes(2);
  });
});

// ── 3. SIMLAR (manba-skan) ───────────────────────────────────────────────────

/**
 * `@Module({ … })` dekoratoridagi bitta massivning ichi.
 *
 * ⚠️ Massiv izohida kvadrat qavs ISHLATMA — bu parser birinchi yopuvchi
 * qavsda to'xtaydi (`briefing-wiring.test.ts` bilan bir xil naqsh).
 */
function moduleArray(src: string, key: 'imports' | 'exports' | 'providers'): string {
  const at = src.indexOf(`${key}: [`);
  if (at < 0) return '';
  const start = at + `${key}: [`.length;
  const end = src.indexOf(']', start);
  return src.slice(start, end);
}

const SRC = path.join(process.cwd(), 'src');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

describe('F13 — cron simlari (yetim qolmasin)', () => {
  const cronSrc = read('modules/cashier-session/shift-acceptance.cron.ts');
  const moduleSrc = read('modules/cashier-session/cashier-session.module.ts');
  const appSrc = read('app.module.ts');

  it('cron manbasida `escalateOverdue` chaqiruvi BOR', () => {
    // Mutatsiya sinovi: chaqiruvni olib tashlansa shu qator qizaradi.
    expect(cronSrc).toContain('.escalateOverdue(');
  });

  it('cron metodida `@Cron` jadvali bor (dekoratorsiz hech qachon yurmaydi)', () => {
    expect(/@Cron\(\s*['"`][^'"`]+['"`]/.test(cronSrc)).toBe(true);
  });

  it('`ShiftAcceptanceCron` CashierSessionModule provayderi', () => {
    expect(moduleArray(moduleSrc, 'providers')).toContain('ShiftAcceptanceCron');
  });

  it('modul `PrismaModule` ni OSHKORA import qiladi (@Global tasodifiga tayanmaydi)', () => {
    expect(moduleArray(moduleSrc, 'imports')).toContain('PrismaModule');
  });

  it('ilova `ScheduleModule` ni ko`taradi va CashierSessionModule ni ro`yxatga oladi', () => {
    expect(appSrc).toContain('ScheduleModule.forRoot()');
    expect(moduleArray(appSrc, 'imports')).toContain('CashierSessionModule');
  });

  it('skaner vakuum emas — manbalar haqiqatan o`qildi', () => {
    expect(cronSrc.length).toBeGreaterThan(400);
    expect(moduleSrc).toContain('ShiftAcceptanceService');
    expect(appSrc.length).toBeGreaterThan(1000);
  });
});
