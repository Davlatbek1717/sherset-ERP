import { describe, expect, it, vi } from 'vitest';
import { MoneyService } from './money.service.js';

/**
 * MK15 — `MoneyService.sourceBalances` provenance shartnomasi.
 *
 * `OrganizationAccount.balanceMinor` ni Faza 11 gacha HECH KIM yozmagan
 * (`money.service.ts` dagi `allowNegative` izohi) — saqlangan `0` u yerda
 * «o'lchanmagan», «pul yo'q» degani EMAS. Shu sababdan qoldiq daftarda
 * yozuvi BOR manba uchungina o'lchangan hisoblanadi.
 */

interface Row {
  id: string;
  currency: string;
  balanceMinor: bigint;
}

function makeService(opts: { rows: Row[]; ledgeredIds: string[]; kindColumn: 'org' | 'cash' }) {
  const findMany = vi.fn().mockResolvedValue(opts.rows);
  const groupBy = vi
    .fn()
    .mockResolvedValue(
      opts.ledgeredIds.map((id) =>
        opts.kindColumn === 'org' ? { organizationAccountId: id } : { cashDeskId: id },
      ),
    );
  const client = {
    organizationAccount: { findMany: opts.kindColumn === 'org' ? findMany : vi.fn() },
    cashDesk: { findMany: opts.kindColumn === 'cash' ? findMany : vi.fn() },
    moneyOperation: { groupBy },
  };
  // biome-ignore lint/suspicious/noExplicitAny: test stub for the Prisma surface used here
  const service = new MoneyService({ client } as any);
  return { service, findMany, groupBy };
}

describe('MoneyService.sourceBalances — bank hisoblari', () => {
  it('daftarda yozuvi BOR hisob — o‘lchangan', async () => {
    const { service } = makeService({
      rows: [{ id: 'a', currency: 'UZS', balanceMinor: 500n }],
      ledgeredIds: ['a'],
      kindColumn: 'org',
    });
    const rows = await service.sourceBalances('acc', 'organization_account');
    expect(rows).toEqual([{ id: 'a', currency: 'UZS', balanceMinor: 500n, ledgered: true }]);
  });

  it('daftarda yozuvi YO‘Q hisob — qoldiq `null` («o‘lchanmagan»), `0` EMAS', async () => {
    const { service } = makeService({
      rows: [{ id: 'a', currency: 'UZS', balanceMinor: 0n }],
      ledgeredIds: [],
      kindColumn: 'org',
    });
    const rows = await service.sourceBalances('acc', 'organization_account');
    expect(rows).toEqual([{ id: 'a', currency: 'UZS', balanceMinor: null, ledgered: false }]);
  });

  it('yozuvsiz hisobda NOLDAN farqli qoldiq turgan bo‘lsa ham — o‘lchanmagan', async () => {
    // Bunday qator faqat qo'lda/migratsiya orqali paydo bo'ladi; uni «haqiqiy
    // o'lchov» deb qabul qilish provenance qoidasini teshadi.
    const { service } = makeService({
      rows: [{ id: 'a', currency: 'UZS', balanceMinor: 99n }],
      ledgeredIds: [],
      kindColumn: 'org',
    });
    const rows = await service.sourceBalances('acc', 'organization_account');
    expect(rows[0]?.balanceMinor).toBeNull();
  });

  it('arxivlanganlar chiqarib tashlanadi va tenant bo‘yicha filtrlanadi', async () => {
    const { service, findMany } = makeService({
      rows: [],
      ledgeredIds: [],
      kindColumn: 'org',
    });
    await service.sourceBalances('acc-1', 'organization_account');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId: 'acc-1', archived: false } }),
    );
  });
});

describe('MoneyService.sourceBalances — kassalar', () => {
  it('kassa qoldig‘i daftar yozuvisiz ham o‘lchangan (har harakat doim daftardan o‘tgan)', async () => {
    const { service } = makeService({
      rows: [{ id: 'k', currency: 'UZS', balanceMinor: 0n }],
      ledgeredIds: [],
      kindColumn: 'cash',
    });
    const rows = await service.sourceBalances('acc', 'cash_desk');
    expect(rows).toEqual([{ id: 'k', currency: 'UZS', balanceMinor: 0n, ledgered: true }]);
  });

  it('kassa uchun daftar umuman so‘ralmaydi (ortiqcha so‘rov yo‘q)', async () => {
    const { service, groupBy } = makeService({
      rows: [{ id: 'k', currency: 'UZS', balanceMinor: 10n }],
      ledgeredIds: [],
      kindColumn: 'cash',
    });
    await service.sourceBalances('acc', 'cash_desk');
    expect(groupBy).not.toHaveBeenCalled();
  });
});
