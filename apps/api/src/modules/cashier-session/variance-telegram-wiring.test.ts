import { describe, expect, it, vi } from 'vitest';
import { CashierSessionService } from './cashier-session.service.js';

/**
 * H7 (P4) — FARQ XABARI HAQIQATAN YETIB BORADIGAN YO'LGA YOZILADI.
 *
 * ## Nega bu test bor
 * Reja H7 ni «wiring BOR, jonli yetkazish sinalmagan» deb belgilagan edi.
 * 2026-08-12 prod o'lchovi sababni ko'rsatdi: xabar `toSelf: true` bilan
 * yozilardi, `toSelf` esa MTProto **slot 0** ni talab qiladi va prodda
 * slot 0 UMUMAN ulanmagan (`hr_telegram_account` da faqat slot 1). Natija —
 * `to_self=true` qatorlarning 4/4 tasi `failed`
 * (`mtproto_self_no_client`), telefonli qatorlarning 32/32 tasi esa `sent`.
 *
 * Ya'ni kod «xabar yubordim» deb hisoblardi, egasi esa hech qachon
 * olmasdi — `orphan-module-dead-feature` bilan bir klass: ulanish
 * ko'rinadi, oqim yo'q.
 *
 * ## Nimani qulflaydi
 * 1. Qabul qiluvchi bo'lsa — TELEFONGA yoziladi (`toSelf` emas).
 * 2. Qabul qiluvchi topilmasa — eski `toSelf` yo'li ZAXIRA sifatida qoladi
 *    (xabar butunlay yo'qolmasin) va jurnalga OCHIQ yoziladi.
 * 3. Nomzod so'rovi `approve` bo'yicha (kassirning `update` ruxsati bilan
 *    xabar kassirlarga tarqamasin).
 */

const ACC = 'acc-1';
const SESSION = 'sess-1';
const CASHIER = 'cash-1';

interface EmpRow {
  id: string;
  telegramPhone: string | null;
  groupId: string | null;
  roles: { role: { name: string; permissions: { scope: string }[] } }[];
  permissionOverrides: { scope: string }[];
}

const emp = (p: Partial<EmpRow> & { id: string }): EmpRow => ({
  telegramPhone: '+998880803717',
  groupId: null,
  roles: [{ role: { name: 'Administrator', permissions: [{ scope: 'ALL' }] } }],
  permissionOverrides: [],
  ...p,
});

function makeService(employees: EmpRow[], sessionGroupId: string | null = null) {
  const createMany = vi.fn().mockResolvedValue({ count: employees.length });
  const create = vi.fn().mockResolvedValue({ id: 'outbox-1' });
  const empFindMany = vi.fn().mockResolvedValue(employees);
  const client = {
    cashierSessionVariance: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    cashierSession: {
      findFirst: vi.fn().mockResolvedValue({
        closedAt: new Date('2026-08-12T10:00:00Z'),
        groupId: sessionGroupId,
        cashier: { name: 'Kassir 1' },
        cashDesk: { name: 'Asosiy kassa' },
      }),
    },
    employee: { findMany: empFindMany },
    hrTelegramOutbox: { create, createMany },
  };
  const service = new CashierSessionService({ client } as never);
  return { service, create, createMany, empFindMany };
}

/** `recordVariance` — `close()` ning ichki qadami; to'g'ridan-to'g'ri chaqiramiz. */
function record(service: CashierSessionService) {
  return (
    service as unknown as {
      recordVariance(args: Record<string, unknown>): Promise<unknown>;
    }
  ).recordVariance({
    accountId: ACC,
    sessionId: SESSION,
    cashierId: CASHIER,
    // 5 000 so'm kamomad — jonli sinovdagi summa.
    expectedCash: 500_000n,
    closingCash: 0n,
    expectedUsd: 0n,
    closingCashUsd: null,
    varianceNote: 'sinov',
  });
}

describe('smena farqi xabari — qabul qiluvchilar', () => {
  it('🔴 telefonga yoziladi, `toSelf` ga EMAS', async () => {
    const { service, create, createMany } = makeService([emp({ id: 'admin-1' })]);
    await record(service);

    expect(create).not.toHaveBeenCalled();
    expect(createMany).toHaveBeenCalledTimes(1);
    const rows = createMany.mock.calls[0][0].data as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0].toPhone).toBe('+998880803717');
    expect(rows[0].employeeId).toBe('admin-1');
    expect(rows[0].toSelf).toBeUndefined();
    expect(rows[0].sourceEventType).toBe('kassa.smena_farqi');
    expect(rows[0].sourceDocId).toBe(SESSION);
    expect(String(rows[0].messageText)).toContain('Kassir 1');
  });

  it('qabul qiluvchi YO`Q bo`lsa — `toSelf` zaxirasi (xabar yo`qolmaydi)', async () => {
    const { service, create, createMany } = makeService([]);
    await record(service);

    expect(createMany).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
    const row = create.mock.calls[0][0].data as Record<string, unknown>;
    expect(row.toSelf).toBe(true);
    expect(row.status).toBe('pending');
  });

  it('nomzodlar `cashiersession.approve` bo`yicha so`raladi (`update` EMAS)', async () => {
    const { service, empFindMany } = makeService([emp({ id: 'admin-1' })]);
    await record(service);
    const where = JSON.stringify(empFindMany.mock.calls[0][0].where);
    expect(where).toContain('"action":"approve"');
    expect(where).not.toContain('"action":"update"');
    // Arxivlangan yoki telefonsiz xodim so'ralmaydi.
    expect(where).toContain('"archived":false');
  });

  it('MK26 override ruxsatni TUSHIRSA — xabar bormaydi', async () => {
    // Roli `ALL`, lekin xodim darajasida `NO` qilingan: override rol
    // natijasini bekor qiladi (MAX emas, G'OLIB).
    const { service, create, createMany } = makeService([
      emp({ id: 'ex-admin', permissionOverrides: [{ scope: 'NO' }] }),
    ]);
    await record(service);
    expect(createMany).not.toHaveBeenCalled();
    // Hech kim qolmadi ⇒ zaxira yo'li.
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('MK26 override ruxsat BERSA — rolda bo`lmasa ham xabar boradi', async () => {
    const { service, createMany } = makeService([
      emp({
        id: 'mgr-1',
        roles: [{ role: { name: 'ReadOnly', permissions: [] } }],
        permissionOverrides: [{ scope: 'ALL' }],
      }),
    ]);
    await record(service);
    expect(createMany).toHaveBeenCalledTimes(1);
  });

  it('nol farqda umuman xabar yo`q', async () => {
    const { service, create, createMany } = makeService([emp({ id: 'admin-1' })]);
    await (
      service as unknown as { recordVariance(a: Record<string, unknown>): Promise<unknown> }
    ).recordVariance({
      accountId: ACC,
      sessionId: SESSION,
      cashierId: CASHIER,
      expectedCash: 100_000n,
      closingCash: 100_000n,
      expectedUsd: 0n,
      closingCashUsd: null,
      varianceNote: null,
    });
    expect(create).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });
});
