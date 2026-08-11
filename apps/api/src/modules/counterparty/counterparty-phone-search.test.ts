import { describe, expect, it, vi } from 'vitest';
import { CounterpartyService } from './counterparty.service.js';

/**
 * F9 — `GET /counterparties?search=901234567` telefonni TOPADI.
 *
 * 🔴 O'LCHANGAN bo'shliq: mavjud `search` `phone contains` qiladi, ya'ni
 * `901234567` so'rovi bazadagi `+998 90 123 45 67` ga MOS KELMAYDI (LIKE
 * ajratgichlarni bilmaydi). Kassada esa telefon — eng tez identifikator.
 *
 * Yechim: so'rov telefon shaklida bo'lsa (`isPhoneQuery`), qo'shimcha
 * RAQAMLASHTIRILGAN qidiruv yuguradi (`regexp_replace(phone,'\D','','g')`)
 * va topilgan id'lar mavjud `OR` ga QO'SHILADI — eski shoxlar o'chmaydi.
 *
 * NON-VACUOUS: qo'shishdan oldin `$queryRaw` UMUMAN chaqirilmasdi va `OR`
 * da 8 ta shox bor edi (id shoxisiz).
 */

const ACC = 'acc-1';

function makeHarness(phoneIds: string[] = []) {
  const findMany = vi.fn(async () => [] as unknown[]);
  const count = vi.fn(async () => 0);
  const queryRaw = vi.fn(async () => phoneIds.map((id) => ({ id })));
  const client = {
    counterparty: { findMany, count },
    counterpartyBalance: { aggregate: vi.fn(async () => ({ _sum: { balanceMinor: 0n } })) },
    demand: { groupBy: vi.fn(async () => []) },
    salesReturn: { groupBy: vi.fn(async () => []) },
    $queryRaw: queryRaw,
  };
  const svc = new CounterpartyService({ client } as never);
  return { svc, findMany, queryRaw };
}

function orBranches(findMany: ReturnType<typeof vi.fn>) {
  const args = findMany.mock.calls[0]?.[0] as { where?: { OR?: unknown[] } } | undefined;
  return args?.where?.OR ?? [];
}

describe('F9 — telefon bo`yicha qidiruv', () => {
  it('telefon shaklidagi so`rov RAQAMLASHTIRILGAN qidiruvni yuguradi', async () => {
    const h = makeHarness(['cp-7']);
    await h.svc.list(ACC, { search: '+998 90 123-45-67', limit: 20 });

    expect(h.queryRaw).toHaveBeenCalledTimes(1);
    // Argument — `Prisma.sql` obyekti; unda faqat RAQAMLAR bo'lishi kerak
    // (ajratgichlar olib tashlangan), va u parametr sifatida uzatiladi —
    // SQL matniga yopishtirilmaydi (in'yeksiya yo'li ochilmasin).
    const sql = h.queryRaw.mock.calls[0]?.[0] as { values?: unknown[]; sql?: string };
    expect(sql.values).toContain('%998901234567%');
    expect(sql.sql).toContain('regexp_replace');
  });

  it('topilgan id`lar mavjud OR ga QO`SHILADI (ism/kod shoxlari o`chmaydi)', async () => {
    const h = makeHarness(['cp-7', 'cp-9']);
    await h.svc.list(ACC, { search: '901234567', limit: 20 });

    const or = orBranches(h.findMany) as Array<Record<string, unknown>>;
    // Eski shoxlar joyida.
    expect(or.some((b) => 'name' in b)).toBe(true);
    expect(or.some((b) => 'phone' in b)).toBe(true);
    // Yangi shox — aynan topilgan id'lar.
    expect(or).toContainEqual({ id: { in: ['cp-7', 'cp-9'] } });
  });

  it('ism yozilsa qimmat skan YUGURMAYDI', async () => {
    const h = makeHarness();
    await h.svc.list(ACC, { search: 'Alisher', limit: 20 });

    expect(h.queryRaw).not.toHaveBeenCalled();
    const or = orBranches(h.findMany) as Array<Record<string, unknown>>;
    expect(or.some((b) => 'id' in b)).toBe(false);
  });

  it('raqam bo`yicha hech kim topilmasa OR ga bo`sh `in` qo`shilmaydi', async () => {
    // `{ id: { in: [] } }` mantiqan zararsiz, lekin so'rovni shovqinlaydi.
    const h = makeHarness([]);
    await h.svc.list(ACC, { search: '901234567', limit: 20 });

    const or = orBranches(h.findMany) as Array<Record<string, unknown>>;
    expect(or.some((b) => 'id' in b)).toBe(false);
  });

  it('`search` umuman berilmasa skan ham, OR ham yo`q', async () => {
    const h = makeHarness();
    await h.svc.list(ACC, { limit: 20 });

    expect(h.queryRaw).not.toHaveBeenCalled();
    expect(orBranches(h.findMany)).toEqual([]);
  });
});
