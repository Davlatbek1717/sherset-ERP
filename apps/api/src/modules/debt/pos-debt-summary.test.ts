import { describe, expect, it, vi } from 'vitest';
import { PosDebtPaymentService } from './pos-debt-payment.service.js';

/**
 * F9 — POS mijoz kartasining qarz bloki.
 *
 * `GET /debts/pos/summary/:counterpartyId` endi IKKALA daftarni ham
 * qaytaradi (`pos-customer-debt.ts` qoidasi bo'yicha):
 *   · `outstandingMinor`  — `Debt` reyestri (POS FIFO'si AYNAN shuni yopadi);
 *   · `balanceMinor`      — `CounterpartyBalance` (POS qarz-sotuvi shu yerda);
 *   · `unregisteredMinor` — farq, ya'ni POS'da to'lab BO'LMAYDIGAN qarz.
 *
 * NON-VACUOUS: tuzatishdan OLDINGI servis bu uch maydonning birortasini ham
 * qaytarmasdi (`undefined`) va `orderAt` ni `nextContactAt` dan olardi.
 */

const ACC = '11111111-1111-1111-1111-111111111111';
const CP = '22222222-2222-2222-2222-222222222222';

interface Row {
  id: string;
  name: string;
  totalMinor: bigint;
  paidMinor: bigint;
  currency: string;
  createdAt: Date;
  nextContactAt: Date | null;
}

function makeService(debts: Row[], balances: Array<{ currency: string; balanceMinor: bigint }>) {
  const prisma = {
    client: {
      counterparty: {
        findFirst: vi.fn(async () => ({ id: CP, name: 'Alisher', phone: '+998901234567' })),
      },
      debt: { findMany: vi.fn(async () => debts) },
      counterpartyBalance: { findMany: vi.fn(async () => balances) },
    },
  };
  const service = new PosDebtPaymentService(prisma as never, {} as never, {} as never);
  return { service, prisma };
}

const DEBT: Row = {
  id: 'd1',
  name: 'QRZ-1',
  totalMinor: 40_000n,
  paidMinor: 0n,
  currency: 'UZS',
  createdAt: new Date('2026-08-01T00:00:00Z'),
  // 🔴 KELAJAKDAGI qo'ng'iroq rejasi — qarz sanasi EMAS.
  nextContactAt: new Date('2026-09-15T00:00:00Z'),
};

describe('F9 — pos summary: ikki daftar', () => {
  it('balans reyestrdan katta — «reyestrsiz qarz» qaytadi', async () => {
    const { service } = makeService([DEBT], [{ currency: 'UZS', balanceMinor: 100_000n }]);
    const s = await service.summary(ACC, CP);

    expect(s.outstandingMinor).toBe('40000');
    expect(s.balanceMinor).toBe('100000');
    expect(s.unregisteredMinor).toBe('60000');
    expect(s.registryExceedsBalance).toBe(false);
  });

  it('🔴 NULL ≠ 0 — balans qatori yo`q bo`lsa `null`, «0» EMAS', async () => {
    const { service } = makeService([DEBT], []);
    const s = await service.summary(ACC, CP);

    expect(s.balanceMinor).toBeNull();
    expect(s.unregisteredMinor).toBeNull();
    // Reyestr o'z raqamini baribir beradi — u o'lchangan.
    expect(s.outstandingMinor).toBe('40000');
  });

  it('boshqa valyutadagi qoldiq alohida ro`yxatda qaytadi', async () => {
    const { service } = makeService(
      [DEBT],
      [
        { currency: 'UZS', balanceMinor: 40_000n },
        { currency: 'USD', balanceMinor: 1_500n },
      ],
    );
    const s = await service.summary(ACC, CP);
    expect(s.otherCurrencyBalances).toEqual([{ currency: 'USD', balanceMinor: '1500' }]);
  });

  it('balansni FAQAT shu kontragent va shu akkaunt uchun o`qiydi', async () => {
    const { service, prisma } = makeService([DEBT], [{ currency: 'UZS', balanceMinor: 1n }]);
    await service.summary(ACC, CP);
    expect(prisma.client.counterpartyBalance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId: ACC, counterpartyId: CP } }),
    );
  });
});

describe('F9 — pos summary: qarz sanasi (AUDIT 🟡)', () => {
  it('`orderAt` = qarz OCHILGAN sana, `nextContactAt` EMAS', async () => {
    // Ekran ko'rsatgan tartib server yopadigan tartib (FIFO — `createdAt`)
    // bilan bir xil bo'lishi shart. Ilgari `nextContactAt ?? createdAt`
    // turardi: kassir kelajakdagi qo'ng'iroq sanasini «qarz sanasi» deb
    // o'qirdi va tartib serverdagidan farq qilardi.
    const { service } = makeService([DEBT], []);
    const s = await service.summary(ACC, CP);
    expect(s.debts[0]?.orderAt).toEqual(new Date('2026-08-01T00:00:00Z'));
  });
});
