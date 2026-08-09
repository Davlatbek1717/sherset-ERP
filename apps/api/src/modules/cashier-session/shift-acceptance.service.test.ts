import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  SHIFT_ACCEPTANCE_ACTION as ACT,
  SHIFT_ACCEPTANCE_STATE as ST,
} from './shift-acceptance.js';
import { ShiftAcceptanceService } from './shift-acceptance.service.js';

/**
 * Smena qabuli — bazasiz ULANISH testlari (MK08).
 *
 * Sof qoida `shift-acceptance.test.ts` da qulflangan. Bu yerda faqat
 * **mock'siz chiqarib bo'lmaydigan** shartnomalar:
 *   1. 🔴 qabul SUMMALARGA TEGMAYDI (akt = dalil, tuzatish emas);
 *   2. rad etish → tushuntirish halqasi va sababning SAQLANISHI;
 *   3. optimistik da'vo tegmasa 409 (parallel menejer);
 *   4. begona smenaga kassir tega olmaydi.
 */

const ACC = 'acc-1';
const SID = 'shift-1';
const MANAGER = { accountId: ACC, actor: 'manager' as const, actorId: 'mgr-1' };
const CASHIER = { accountId: ACC, actor: 'cashier' as const, actorId: 'cash-1' };

/** Smena SUMMALARI — qabul yo'lida bironta ham yozilmasligi kerak. */
const SUM_FIELDS = [
  'closingCashMinor',
  'expectedCashMinor',
  'discrepancyMinor',
  'openingCashMinor',
  'salesSumMinor',
  'returnsSumMinor',
  'proceedsCashMinor',
  'proceedsNoCashMinor',
  'receivedCashMinor',
  'receivedNoCashMinor',
  'bankCommissionMinor',
  'qrBankCommissionMinor',
  'salesCount',
  'returnsCount',
  'state',
];

function makeService(opts: { acceptanceState?: string; cashierId?: string; claimCount?: number }) {
  const updateMany = vi.fn().mockResolvedValue({ count: opts.claimCount ?? 1 });
  const eventCreate = vi.fn().mockResolvedValue({ id: 'ev-1' });
  const tx = {
    cashierSession: { updateMany },
    cashierSessionAcceptanceEvent: { create: eventCreate },
  };
  const client = {
    cashierSession: {
      findFirst: vi.fn().mockResolvedValue({
        id: SID,
        acceptanceState: opts.acceptanceState ?? ST.pending,
        cashierId: opts.cashierId ?? CASHIER.actorId,
        state: 'closed',
        closedAt: new Date('2026-08-08T18:00:00Z'),
      }),
    },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const service = new ShiftAcceptanceService({ client } as never, { zReport: vi.fn() } as never);
  return { service, updateMany, eventCreate, client };
}

describe('smena qabuli — 🔴 SUMMALARGA TEGMAYDI', () => {
  it('qabul yozuvida bironta ham summa/holat maydoni YO`Q', async () => {
    const { service, updateMany } = makeService({});
    await service.transition(MANAGER, SID, ACT.accept);

    const data = updateMany.mock.calls[0][0].data;
    for (const field of SUM_FIELDS) expect(data).not.toHaveProperty(field);
    // Yozilishi KERAK bo'lganlar — faqat qabul o'qi.
    expect(data).toMatchObject({ acceptanceState: ST.accepted, acceptedById: MANAGER.actorId });
  });

  it('rad etish ham summalarga tegmaydi', async () => {
    const { service, updateMany } = makeService({});
    await service.transition(MANAGER, SID, ACT.reject, { reasonCode: 'cash_shortage' });

    const data = updateMany.mock.calls[0][0].data;
    for (const field of SUM_FIELDS) expect(data).not.toHaveProperty(field);
  });
});

describe('smena qabuli — rad etish → tushuntirish halqasi', () => {
  it('rad etish smenani KASSIRGA qaytaradi va SABAB jurnalga yoziladi', async () => {
    const { service, updateMany, eventCreate } = makeService({});
    const out = await service.transition(MANAGER, SID, ACT.reject, {
      reasonCode: 'variance_unexplained',
      comment: 'Kamomad tushuntirilmagan',
    });

    expect(out).toMatchObject({ from: ST.pending, to: ST.rejected, changed: true });
    expect(updateMany.mock.calls[0][0].data).toMatchObject({ acceptanceState: ST.rejected });
    expect(eventCreate.mock.calls[0][0].data).toMatchObject({
      sessionId: SID,
      fromState: ST.pending,
      toState: ST.rejected,
      action: ACT.reject,
      actorType: 'manager',
      actorId: MANAGER.actorId,
      reasonCode: 'variance_unexplained',
      comment: 'Kamomad tushuntirilmagan',
    });
  });

  it('rad etilganda oldingi qabul izi TOZALANADI', async () => {
    const { service, updateMany } = makeService({});
    await service.transition(MANAGER, SID, ACT.reject, { reasonCode: 'discipline' });
    expect(updateMany.mock.calls[0][0].data).toMatchObject({
      acceptedById: null,
      acceptedAt: null,
    });
  });

  it('kassir tushuntirishi smenani navbatga qaytaradi va MATN saqlanadi', async () => {
    const { service, updateMany, eventCreate } = makeService({ acceptanceState: ST.rejected });
    const out = await service.transition(CASHIER, SID, ACT.explain, {
      comment: 'Terminal cheki kechikkan',
    });

    expect(out).toMatchObject({ to: ST.pending, changed: true });
    expect(updateMany.mock.calls[0][0].data).toMatchObject({ acceptanceState: ST.pending });
    expect(eventCreate.mock.calls[0][0].data).toMatchObject({
      action: ACT.explain,
      actorType: 'cashier',
      comment: 'Terminal cheki kechikkan',
    });
  });

  it('sababsiz rad etish 400 — jurnal ham, yozuv ham yo`q', async () => {
    const { service, updateMany, eventCreate } = makeService({});
    await expect(service.transition(MANAGER, SID, ACT.reject)).rejects.toThrow();
    expect(updateMany).not.toHaveBeenCalled();
    expect(eventCreate).not.toHaveBeenCalled();
  });
});

describe('smena qabuli — poyga va ruxsat', () => {
  it('da`vo tegmasa 409 (parallel menejer allaqachon o`zgartirgan)', async () => {
    const { service } = makeService({ claimCount: 0 });
    await expect(service.transition(MANAGER, SID, ACT.accept)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('da`vo AYNI holat sharti bilan qo`yiladi (optimistik qulf)', async () => {
    const { service, updateMany } = makeService({});
    await service.transition(MANAGER, SID, ACT.accept);
    expect(updateMany.mock.calls[0][0].where).toMatchObject({
      id: SID,
      accountId: ACC,
      acceptanceState: ST.pending,
    });
  });

  it('takror qabul — no-op: na yozuv, na jurnal', async () => {
    const { service, updateMany, eventCreate } = makeService({ acceptanceState: ST.accepted });
    const out = await service.transition(MANAGER, SID, ACT.accept);
    expect(out).toMatchObject({ changed: false });
    expect(updateMany).not.toHaveBeenCalled();
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it('kassir BEGONA smenaga tega olmaydi — 404 (403 emas: mavjudlik sizardi)', async () => {
    const { service } = makeService({ acceptanceState: ST.rejected, cashierId: 'boshqa-kassir' });
    await expect(service.transition(CASHIER, SID, ACT.explain)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('jurnal va da`vo BITTA tranzaksiyada', async () => {
    const { service, client } = makeService({});
    await service.transition(MANAGER, SID, ACT.accept);
    expect(client.$transaction).toHaveBeenCalledTimes(1);
  });
});
