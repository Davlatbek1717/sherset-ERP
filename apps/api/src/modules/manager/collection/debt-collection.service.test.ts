import { describe, expect, it, vi } from 'vitest';
import { DebtCollectionService } from './debt-collection.service.js';

/**
 * MK16 — undirish ro'yxatining I/O qatlami. Prisma qo'lda mock qilingan
 * (`telegram.service.test.ts` uslubi) — DB yo'q.
 *
 * Bu yerda tekshiriladigan uch shartnoma:
 *  1. **Jo'natgich QAYTA QURILMAYDI** — `DebtService.sendBulkReminders` ga
 *     delegatsiya (SMS/Telegram yo'llari, shablonlar, kontakt — o'sha yerda).
 *  2. **Idempotent** — bugun eslatma ketgan qarz jo'natgichga UMUMAN
 *     uzatilmaydi (mijozga ikkinchi xabar ketishi mumkin emas).
 *  3. **Jurnal FAQAT haqiqatan ketganga yoziladi** — yuborilmagan (skipped)
 *     qarz bugun qayta urinishga OCHIQ qoladi.
 */

const NOW = new Date('2026-08-09T09:00:00.000Z'); // Toshkentda 14:00

interface DebtSeed {
  id: string;
  name?: string;
  totalMinor?: bigint;
  paidMinor?: bigint;
  currency?: string;
  status?: string;
  problem?: boolean;
  nextContactAt?: Date | null;
  lastCallAt?: Date | null;
  lastCallOutcome?: string | null;
  phone?: string | null;
  ownerName?: string | null;
  issuerName?: string | null;
}

function makeService(opts: {
  debts: DebtSeed[];
  /** debtId → eng yangi `kind='reminder'` yozuv vaqti. */
  reminderMax?: Record<string, Date>;
  /** debtId → eng yangi (bekor qilinmagan) izoh vaqti. */
  noteMax?: Record<string, Date>;
  /** `sendBulkReminders` javobi. */
  sendResult?: { queued: number; skipped: Array<{ id: string; name: string; reason: string }> };
}) {
  const rows = opts.debts.map((d) => ({
    id: d.id,
    name: d.name ?? `QRZ-${d.id}`,
    counterpartyId: `cp-${d.id}`,
    totalMinor: d.totalMinor ?? 1_000_00n,
    paidMinor: d.paidMinor ?? 0n,
    currency: d.currency ?? 'UZS',
    status: d.status ?? 'unpaid',
    problem: d.problem ?? false,
    nextContactAt:
      d.nextContactAt === undefined ? new Date('2026-08-04T09:00:00.000Z') : d.nextContactAt,
    lastCallAt: d.lastCallAt ?? null,
    lastCallOutcome: d.lastCallOutcome ?? null,
    counterparty: { name: `CP ${d.id}`, phone: d.phone === undefined ? '901234567' : d.phone },
    owner: d.ownerName ? { id: `own-${d.id}`, name: d.ownerName } : null,
    issuedBy: d.issuerName ? { id: `iss-${d.id}`, name: d.issuerName } : null,
  }));

  const findMany = vi.fn(async () => rows);
  const noteCreateMany = vi.fn(async (args: { data: unknown[] }) => ({ count: args.data.length }));
  const groupBy = vi.fn(async (args: { where?: { kind?: string } }) => {
    const src = args.where?.kind === 'reminder' ? (opts.reminderMax ?? {}) : (opts.noteMax ?? {});
    return Object.entries(src).map(([debtId, createdAt]) => ({
      debtId,
      _max: { createdAt },
    }));
  });

  const prisma = {
    client: {
      debt: { findMany },
      debtNote: { groupBy, createMany: noteCreateMany },
    },
  };
  const sendBulkReminders = vi.fn(async () => opts.sendResult ?? { queued: 0, skipped: [] });
  const debtService = { sendBulkReminders };

  const service = new DebtCollectionService(prisma as never, debtService as never);
  return { service, findMany, groupBy, noteCreateMany, sendBulkReminders };
}

describe('DebtCollectionService.list', () => {
  it("faqat FAOL qarzlarni o'qiydi (to'langanlar so'rovdayoq chiqarib tashlanadi)", async () => {
    const { service, findMany } = makeService({ debts: [{ id: 'a' }] });
    await service.list('acc', { scope: 'all', limit: 200 }, NOW);
    const where = findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      accountId: 'acc',
      deletedAt: null,
      status: { in: ['unpaid', 'partial'] },
    });
  });

  it("qatorlar + valyuta bo'yicha jam qaytadi", async () => {
    const { service } = makeService({
      debts: [
        { id: 'a', totalMinor: 300n, nextContactAt: new Date('2026-08-01T09:00:00.000Z') },
        { id: 'b', totalMinor: 100n, nextContactAt: new Date('2026-08-07T09:00:00.000Z') },
      ],
    });
    const res = await service.list('acc', { scope: 'all', limit: 200 }, NOW);
    expect(res.rows.map((r) => r.debtId)).toEqual(['a', 'b']); // 8 kun > 2 kun
    expect(res.summary.byCurrency).toEqual([{ currency: 'UZS', remainingMinor: 400n, count: 2 }]);
  });

  it("scope='due' muddati kelgan/o'tganlarni qoldiradi, kelajakdagini olib tashlaydi", async () => {
    const { service } = makeService({
      debts: [
        { id: 'past', nextContactAt: new Date('2026-08-01T09:00:00.000Z') },
        { id: 'today', nextContactAt: new Date('2026-08-09T02:00:00.000Z') },
        { id: 'future', nextContactAt: new Date('2026-08-20T09:00:00.000Z') },
        { id: 'nodate', nextContactAt: null },
      ],
    });
    const res = await service.list('acc', { scope: 'due', limit: 200 }, NOW);
    // Muddatsizlar ham qoladi: ular «kelajakda» deb isbotlanmagan — menejer
    // ularni ko'rishi kerak (ma'lumot-sifati signali).
    expect(res.rows.map((r) => r.debtId)).toEqual(['past', 'today', 'nodate']);
  });

  it('eslatma jurnali qatorga tushadi (bugun eslatilgan ⇒ qayta yuborilmaydi)', async () => {
    const { service } = makeService({
      debts: [{ id: 'a' }, { id: 'b' }],
      reminderMax: { a: new Date('2026-08-09T04:00:00.000Z') },
    });
    const res = await service.list('acc', { scope: 'all', limit: 200 }, NOW);
    const a = res.rows.find((r) => r.debtId === 'a');
    const b = res.rows.find((r) => r.debtId === 'b');
    expect(a?.remindedToday).toBe(true);
    expect(a?.canRemind).toBe(false);
    expect(b?.canRemind).toBe(true);
  });

  it("javobgar: mas'ul bo'lmasa qarzni BERGAN xodim ko'rsatiladi", async () => {
    const { service } = makeService({
      debts: [
        { id: 'a', ownerName: 'Operator O', issuerName: 'Kassir K' },
        { id: 'b', issuerName: 'Kassir K' },
        { id: 'c' },
      ],
    });
    const res = await service.list('acc', { scope: 'all', limit: 200 }, NOW);
    const by = Object.fromEntries(res.rows.map((r) => [r.debtId, r.responsible]));
    expect(by.a).toMatchObject({ name: 'Operator O', role: 'owner' });
    expect(by.b).toMatchObject({ name: 'Kassir K', role: 'issuer' });
    expect(by.c).toBeNull(); // javobgarsiz — yashirilmaydi, OSHKORA null
  });

  it('limitdan oshsa kesilgani OSHKORA aytiladi', async () => {
    const { service } = makeService({
      debts: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    });
    const res = await service.list('acc', { scope: 'all', limit: 2 }, NOW);
    expect(res.rows).toHaveLength(2);
    expect(res.truncated).toBe(true);
    expect(res.totalCount).toBe(3);
  });
});

describe('DebtCollectionService.remind — idempotent + jurnal', () => {
  it("bugun eslatilgan qarz jo'natgichga UMUMAN uzatilmaydi", async () => {
    const { service, sendBulkReminders } = makeService({
      debts: [{ id: 'a' }, { id: 'b' }],
      reminderMax: { a: new Date('2026-08-09T04:00:00.000Z') },
      sendResult: { queued: 1, skipped: [] },
    });
    const res = await service.remind(
      'acc',
      'u1',
      'admin',
      { debtIds: ['a', 'b'], channel: 'sms' },
      NOW,
    );
    expect(sendBulkReminders).toHaveBeenCalledTimes(1);
    expect(sendBulkReminders.mock.calls[0][2]).toMatchObject({ ids: ['b'], channel: 'sms' });
    expect(res.skipped).toContainEqual(
      expect.objectContaining({ debtId: 'a', reason: 'reminded_today' }),
    );
  });

  it("haqiqatan ketgan eslatma JURNALGA yoziladi (kind='reminder')", async () => {
    const { service, noteCreateMany } = makeService({
      debts: [{ id: 'a' }],
      sendResult: { queued: 1, skipped: [] },
    });
    const res = await service.remind(
      'acc',
      'u1',
      'admin',
      { debtIds: ['a'], channel: 'telegram' },
      NOW,
    );
    expect(res.journaled).toBe(1);
    expect(noteCreateMany).toHaveBeenCalledTimes(1);
    expect(noteCreateMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({
        accountId: 'acc',
        debtId: 'a',
        kind: 'reminder',
        authorId: 'u1',
        authorRole: 'admin',
      }),
    ]);
  });

  it('YUBORILMAGAN qarz jurnalga TUSHMAYDI — bugun qayta urinish ochiq qoladi', async () => {
    const { service, noteCreateMany } = makeService({
      debts: [{ id: 'a' }, { id: 'b' }],
      sendResult: { queued: 1, skipped: [{ id: 'a', name: 'CP a', reason: 'no_phone' }] },
    });
    const res = await service.remind(
      'acc',
      'u1',
      'admin',
      { debtIds: ['a', 'b'], channel: 'sms' },
      NOW,
    );
    expect(res.journaled).toBe(1);
    expect(noteCreateMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ debtId: 'b' }),
    ]);
    expect(res.skipped).toContainEqual(
      expect.objectContaining({ debtId: 'a', reason: 'no_phone' }),
    );
  });

  it("hech kim qolmasa jo'natgich CHAQIRILMAYDI va jurnal yozilmaydi", async () => {
    const { service, sendBulkReminders, noteCreateMany } = makeService({
      debts: [{ id: 'a' }],
      reminderMax: { a: new Date('2026-08-09T04:00:00.000Z') },
    });
    const res = await service.remind('acc', 'u1', 'admin', { debtIds: ['a'], channel: 'sms' }, NOW);
    expect(sendBulkReminders).not.toHaveBeenCalled();
    expect(noteCreateMany).not.toHaveBeenCalled();
    expect(res.queued).toBe(0);
  });

  it("topilmagan/yopilgan qarz sabab bilan o'tkaziladi", async () => {
    const { service } = makeService({ debts: [], sendResult: { queued: 0, skipped: [] } });
    const res = await service.remind('acc', 'u1', 'admin', { debtIds: ['x'], channel: 'sms' }, NOW);
    expect(res.skipped).toEqual([
      expect.objectContaining({ debtId: 'x', reason: 'not_found_or_settled' }),
    ]);
  });

  it('ikkinchi chaqiruv (jurnal yozilgandan keyin) hech kimga yubormaydi', async () => {
    // Birinchi chaqiruvdan keyingi holat: jurnalda bugungi yozuv bor.
    const { service, sendBulkReminders } = makeService({
      debts: [{ id: 'a' }],
      reminderMax: { a: new Date('2026-08-09T08:00:00.000Z') },
      sendResult: { queued: 1, skipped: [] },
    });
    const res = await service.remind('acc', 'u1', 'admin', { debtIds: ['a'], channel: 'sms' }, NOW);
    expect(sendBulkReminders).not.toHaveBeenCalled();
    expect(res.queued).toBe(0);
    expect(res.journaled).toBe(0);
  });
});
