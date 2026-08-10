import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DebtService } from './debt.service.js';

/**
 * `addCashPayment` — check-then-write qulfi (M-10 naqshining §3.6 tomoni).
 *
 * TUZATISHDAN OLDINGI holat: `remaining` tekshiruvi TRANZAKSIYADAN TASHQARIDA
 * edi va tx ichida FOR UPDATE yo'q edi — ikki parallel to'lov bitta eski
 * snapshot'ni ko'rib, bitta qarzni IKKI MARTA yopardi (`paidMinor > totalMinor`,
 * kontragent balansi manfiyga ketardi). POS yo'li (`pos-debt-payment.service.ts`
 * `lockOpenDebts`) allaqachon qulflangan edi — bu fayl xuddi shu kafolatni
 * `addCashPayment` uchun qulflaydi.
 *
 * Double `pos-debt-payment.service.test.ts` bilan BIR XIL semantikada:
 *   - `$queryRaw` (FOR UPDATE) — kalitli qulf; band bo'lsa KUTADI, qulf
 *     olingandan keyin holat QAYTA baholanadi;
 *   - qulfsiz o'qishlar (`findFirst`) `await` bilan YIELD qiladi — ikki
 *     chaqiruvchi haqiqatan bir-birining orasiga tusha oladi;
 *   - `create`/`update` birinchi await'gacha sinxron = atomik yozuv;
 *   - `$transaction` tugaganda qulflar bo'shaydi.
 *
 * NON-VACUOUS: tuzatishdan oldin 1-testda ikkala to'lov ham o'tib
 * `paidMinor = 200 000` bo'ladi (rad yo'q), 2-testda ham rad yo'q — ikkalasi
 * yiqiladi; 3-test esa `$queryRaw` umuman chaqirilmagani uchun yiqiladi.
 */

const ACC = '11111111-1111-1111-1111-111111111111';
const CP = '22222222-2222-2222-2222-222222222222';
const DEBT = 'debt-1';

interface DebtRow {
  id: string;
  accountId: string;
  counterpartyId: string;
  name: string;
  totalMinor: bigint;
  paidMinor: bigint;
  currency: string;
  status: string;
  nextContactAt: Date | null;
  closedAt: Date | null;
  deletedAt: Date | null;
}

interface PaymentRow {
  id: string;
  debtId: string;
  amountMinor: bigint;
  reversedAt: Date | null;
}

function makeDb(totalMinor: bigint) {
  const row: DebtRow = {
    id: DEBT,
    accountId: ACC,
    counterpartyId: CP,
    name: 'QRZ-1',
    totalMinor,
    paidMinor: 0n,
    currency: 'UZS',
    status: 'unpaid',
    nextContactAt: null,
    closedAt: null,
    deletedAt: null,
  };
  const payments: PaymentRow[] = [];

  // ── kalitli qulf (FOR UPDATE modeli) ─────────────────────────────────────
  const held = new Set<string>();
  const waiters = new Map<string, Array<() => void>>();
  async function acquire(key: string, owned: Set<string>) {
    if (owned.has(key)) return;
    while (held.has(key)) {
      await new Promise<void>((resolve) => {
        const q = waiters.get(key) ?? [];
        q.push(resolve);
        waiters.set(key, q);
      });
    }
    held.add(key);
    owned.add(key);
  }
  function releaseAll(owned: Set<string>) {
    for (const key of owned) {
      held.delete(key);
      waiters.get(key)?.shift()?.();
    }
    owned.clear();
  }

  const queryRawSpy = vi.fn();
  const createSpy = vi.fn();

  function makeTx(owned: Set<string>) {
    return {
      $queryRaw: async (_s: TemplateStringsArray, ...values: unknown[]) => {
        queryRawSpy(...values);
        const [debtId] = values as [string, string];
        await acquire(`debt:${debtId}`, owned);
        // Qulf olingandan KEYIN qayta baholash (EvalPlanQual).
        return row.id === debtId && row.deletedAt === null ? [{ id: row.id }] : [];
      },
      debt: {
        findFirstOrThrow: async () => ({ ...row }),
        update: async (args: { data: Record<string, unknown> }) => {
          for (const [k, v] of Object.entries(args.data)) {
            if (v === undefined) continue;
            (row as unknown as Record<string, unknown>)[k] = v;
          }
          return { ...row };
        },
      },
      debtPayment: {
        create: async (args: { data: { debtId: string; amountMinor: bigint } }) => {
          createSpy();
          const p: PaymentRow = {
            id: `pay-${payments.length + 1}`,
            debtId: args.data.debtId,
            amountMinor: args.data.amountMinor,
            reversedAt: null,
          };
          payments.push(p);
          return { ...p, method: 'cash', cashDeskId: null, currency: 'UZS', batchId: null };
        },
        aggregate: async () => {
          await Promise.resolve(); // qulfsiz o'qish — yield
          return {
            _sum: {
              amountMinor: payments
                .filter((p) => p.reversedAt === null)
                .reduce((a, p) => a + p.amountMinor, 0n),
            },
          };
        },
      },
      debtNote: { create: async () => ({ id: 'note-1' }) },
    };
  }

  const client = {
    debt: {
      // Qulfsiz snapshot (mustFind) — yield, shunda ikki chaqiruvchi bir xil
      // eski holatni ko'ra oladi (aynan bug ssenariysi).
      findFirst: async () => {
        await Promise.resolve();
        return { ...row };
      },
    },
    cashDesk: { findFirst: async () => ({ name: 'Kassa 1' }) },
    $transaction: async <T>(fn: (t: unknown) => Promise<T>): Promise<T> => {
      const owned = new Set<string>();
      try {
        return await fn(makeTx(owned));
      } finally {
        releaseAll(owned);
      }
    },
  };

  const balances = { applyDelta: vi.fn(async () => undefined) };
  const money = { applyDeltas: vi.fn(async () => undefined) };

  const svc = new DebtService(
    { client } as never,
    undefined as never, // attachments
    undefined as never, // htmlPdf
    balances as never,
    { notifyCounterparty: vi.fn() } as never, // telegram
    undefined as never, // sms
    undefined as never, // msgTemplates
    money as never,
  );

  return { svc, row, payments, queryRawSpy, createSpy };
}

const livePaid = (payments: PaymentRow[]) =>
  payments.filter((p) => p.reversedAt === null).reduce((a, p) => a + p.amountMinor, 0n);

describe('DebtService.addCashPayment — check-then-write qulfi', () => {
  it("ikki parallel TO'LIQ to'lov: bittasi rad, paidMinor totaldan oshmaydi", async () => {
    const { svc, row, payments } = makeDb(100_000n);

    const results = await Promise.allSettled([
      svc.addCashPayment(ACC, 'u1', DEBT, { amountMinor: '100000', method: 'cash' }),
      svc.addCashPayment(ACC, 'u2', DEBT, { amountMinor: '100000', method: 'cash' }),
    ]);

    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(BadRequestException);

    expect(livePaid(payments)).toBe(100_000n);
    expect(row.paidMinor).toBe(100_000n);
    expect(row.status).toBe('paid');
  });

  it("ikki parallel QISMAN to'lov: qoldiq tx ichida QAYTA o'qiladi, ortiqchasi rad", async () => {
    const { svc, row, payments } = makeDb(100_000n);
    const partial = {
      amountMinor: '80000',
      method: 'cash',
      comment: 'qisman',
      nextContactAt: '2026-08-20T00:00:00Z',
    };

    const results = await Promise.allSettled([
      svc.addCashPayment(ACC, 'u1', DEBT, partial),
      svc.addCashPayment(ACC, 'u2', DEBT, partial),
    ]);

    // Ikkinchisi qulfdan keyin YANGI qoldiqni (20 000) ko'radi va 80 000 > 20 000
    // bo'lgani uchun rad etiladi — eski snapshot bilan o'tib ketmaydi.
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    const reason = (rejected[0] as PromiseRejectedResult).reason as BadRequestException;
    expect(reason).toBeInstanceOf(BadRequestException);
    expect(reason.message).toContain('qoldiq');

    expect(livePaid(payments)).toBe(80_000n);
    expect(row.paidMinor).toBe(80_000n);
    expect(row.status).toBe('partial');
  });

  it("qulf so'rovi (FOR UPDATE) tx ichida YOZUVDAN OLDIN ketadi", async () => {
    const { svc, queryRawSpy, createSpy } = makeDb(100_000n);

    await svc.addCashPayment(ACC, 'u1', DEBT, {
      amountMinor: '40000',
      method: 'cash',
      // Qisman to'lov shartnomasi (§3.6): izoh + keyingi sana majburiy.
      comment: 'qisman',
      nextContactAt: '2026-08-20T00:00:00Z',
    });

    expect(queryRawSpy).toHaveBeenCalledTimes(1);
    // Qulf parametrlari — aynan shu qarz va akkaunt.
    expect(queryRawSpy).toHaveBeenCalledWith(DEBT, ACC);
    // Qulf yozuvdan OLDIN olinadi, aks holda u hech narsani himoya qilmaydi.
    const lockOrder = queryRawSpy.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY;
    const writeOrder = createSpy.mock.invocationCallOrder[0] ?? 0;
    expect(lockOrder).toBeLessThan(writeOrder);
  });
});
