import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { OpenSessionFromSmenaSchema } from './smena.schema.js';
import { SmenaService, isWithinShift } from './smena.service.js';

/**
 * Smena moduli — bazasiz birlik testlari.
 *
 * To'rt bug-klass qulflanadi:
 *   1. 🔴 `isWithinShift` vaqt formulasi host-TZ'ga bog'liq edi
 *      (`getTimezoneOffset()` a'zosi UTC+5 hostda +10 soat qilib yuborardi).
 *      Endi formula epoch + qat'iy +5 soat — host qayerda bo'lsa ham bir xil.
 *      Xotira sabog'i («tz-yorliq testi yolg'on bo'lishi mumkin»): instantlar
 *      KUN O'RTASIDAN tanlangan, chegara-nuqtadan emas — chegara testi
 *      yaxlitlash xatosini yeb yuborishi mumkin.
 *   2. 🔴 `openingCashMinor` manfiyni qabul qilardi — kamomad yashirish yo'li.
 *   3. 🟠 kassir smenaga BIRIKTIRILMAGAN bo'lsa ham ochish mumkin edi —
 *      out-of-shift nazorati chetlanardi.
 *   4. 🟡 parallel ochilishda xom P2002 500 bo'lib chiqardi (asosiy
 *      `open()` dagi ConflictException naqshi bu yo'lda yo'q edi).
 */

describe('isWithinShift — Toshkent devor-vaqti (UTC+5), host-TZ dan mustaqil', () => {
  it('2026-08-10T09:00:00Z = Toshkent 14:00 → 09:00–18:00 smenada TRUE', () => {
    // Eski formula UTC+5 hostda buni 19:00 deb o'qib FALSE qaytarardi.
    expect(isWithinShift('09:00', '18:00', new Date('2026-08-10T09:00:00Z'))).toBe(true);
  });

  it('2026-08-10T23:00:00Z = Toshkent 04:00 → 09:00–18:00 smenada FALSE', () => {
    expect(isWithinShift('09:00', '18:00', new Date('2026-08-10T23:00:00Z'))).toBe(false);
  });

  it('tungi smena 22:00–06:00: Toshkent 04:00 → TRUE', () => {
    expect(isWithinShift('22:00', '06:00', new Date('2026-08-10T23:00:00Z'))).toBe(true);
  });

  it('tungi smena 22:00–06:00: Toshkent 14:00 → FALSE', () => {
    expect(isWithinShift('22:00', '06:00', new Date('2026-08-10T09:00:00Z'))).toBe(false);
  });
});

const SMENA_ID = '11111111-1111-4111-8111-111111111111';

describe('OpenSessionFromSmenaSchema — openingCashMinor manfiy bo`lolmaydi', () => {
  it('"-5000000" → parse XATO (kamomad yashirish yo`li yopiq)', () => {
    const res = OpenSessionFromSmenaSchema.safeParse({
      smenaId: SMENA_ID,
      openingCashMinor: '-5000000',
    });
    expect(res.success).toBe(false);
  });

  it('musbat qiymat o`tadi, berilmasa default 0', () => {
    const ok = OpenSessionFromSmenaSchema.safeParse({
      smenaId: SMENA_ID,
      openingCashMinor: '5000000',
    });
    expect(ok.success).toBe(true);
    const dflt = OpenSessionFromSmenaSchema.parse({ smenaId: SMENA_ID });
    // Asosiy `OpenSessionSchema` naqshi: string ko'rinishida, servis BigInt qiladi.
    expect(String(dflt.openingCashMinor)).toBe('0');
  });
});

const ACC = 'acc-1';
const CASHIER = 'cash-1';

/**
 * `openSessionFromSmena` uchun mock-klient. `outOfShiftReason` DOIM beriladi —
 * test vaqt-formulasiga bog'lanib qolmasin (vaqt alohida qulflangan yuqorida).
 */
function makeService(opts: { member?: boolean; createRejects?: unknown } = {}) {
  const sessionCreate = opts.createRejects
    ? vi.fn().mockRejectedValue(opts.createRejects)
    : vi.fn().mockResolvedValue({ id: 'sess-1' });
  const tx = {
    cashierSession: { create: sessionCreate },
    cashierAuditEvent: { create: vi.fn().mockResolvedValue({ id: 'ev-1' }) },
  };
  const membershipFindFirst = vi
    .fn()
    .mockResolvedValue(
      opts.member === false ? null : { id: 'se-1', smenaId: SMENA_ID, employeeId: CASHIER },
    );
  const client = {
    smena: {
      findFirst: vi.fn().mockResolvedValue({
        id: SMENA_ID,
        name: 'Kunduzgi',
        organizationId: 'org-1',
        schedule: { startTime: '09:00', endTime: '18:00' },
      }),
    },
    smenaEmployee: { findFirst: membershipFindFirst },
    cashierSession: { findFirst: vi.fn().mockResolvedValue(null) },
    userSettings: { findUnique: vi.fn().mockResolvedValue(null) },
    store: { findFirst: vi.fn().mockResolvedValue({ id: 'store-1' }) },
    cashDesk: { findFirst: vi.fn().mockResolvedValue({ id: 'desk-1' }) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const service = new SmenaService({ client } as never);
  return { service, client, sessionCreate, membershipFindFirst };
}

const OPEN_INPUT = { smenaId: SMENA_ID, outOfShiftReason: 'test-sabab' };

describe('openSessionFromSmena — a`zolik tekshiruvi', () => {
  it('smenaga biriktirilmagan kassir → 400', async () => {
    const { service } = makeService({ member: false });
    await expect(service.openSessionFromSmena(ACC, CASHIER, OPEN_INPUT)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.openSessionFromSmena(ACC, CASHIER, OPEN_INPUT)).rejects.toThrow(
      /biriktirilmagansiz/,
    );
  });

  it('a`zo kassir → sessiya ochiladi', async () => {
    const { service, sessionCreate, membershipFindFirst } = makeService({ member: true });
    const res = (await service.openSessionFromSmena(ACC, CASHIER, OPEN_INPUT)) as { id: string };
    expect(res.id).toBe('sess-1');
    expect(sessionCreate).toHaveBeenCalledTimes(1);
    // Tekshiruv aynan {smenaId, employeeId} juftligi bo'yicha bo'lsin —
    // boshqa smenaning a'zoligi bu smenaga o'tmasin.
    expect(membershipFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ smenaId: SMENA_ID, employeeId: CASHIER }),
      }),
    );
  });
});

describe('openSessionFromSmena — parallel ochilish (P2002)', () => {
  it('unique-indeks poygasi ConflictException bo`lib chiqadi, 500 emas', async () => {
    // DB'dagi `cashier_sessions_open_per_cashier_idx` pre-check'dan o'tgan
    // ikkinchi so'rovni P2002 bilan uradi — mijozga 409 qaytishi kerak.
    const { service } = makeService({ createRejects: { code: 'P2002' } });
    await expect(service.openSessionFromSmena(ACC, CASHIER, OPEN_INPUT)).rejects.toThrow(
      ConflictException,
    );
  });

  it('boshqa xatolar o`z holicha o`tadi (yashirilmaydi)', async () => {
    const boom = new Error('db down');
    const { service } = makeService({ createRejects: boom });
    await expect(service.openSessionFromSmena(ACC, CASHIER, OPEN_INPUT)).rejects.toThrow('db down');
  });
});

// ── P11 — xodim kartasidan biriktirish + `mine()` tanlovi ────────────────────

const EMP = 'emp-1';
const SM_A = '22222222-2222-4222-8222-222222222222';
const SM_B = '33333333-3333-4333-8333-333333333333';

/**
 * `employeeSmenas` / `setEmployeeSmenas` uchun mock-klient.
 *
 * Qulflanadigan bug-klasslar:
 *   1. 🔴 ijara: begona hisobning xodimiga biriktirish (xodim tekshiruvisiz
 *      `smenaEmployee.deleteMany` boshqa ijarachining qatorlarini o'chirardi);
 *   2. 🔴 `deleteMany` faqat SHU hisob smenalari bilan cheklangan bo'lishi —
 *      `smenaEmployee` da `accountId` maydoni YO'Q, ya'ni filtrsiz o'chirish
 *      xodimning boshqa hisobdagi biriktirmasini ham yo'q qilardi;
 *   3. 🟠 arxivlangan/begona smenaga biriktirish jimgina o'tib ketmasin.
 */
function makeAssignService(opts: { employee?: boolean; smenaIds?: string[] } = {}) {
  const known = opts.smenaIds ?? [SM_A, SM_B];
  const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
  const createMany = vi.fn().mockResolvedValue({ count: 1 });
  const tx = { smenaEmployee: { deleteMany, createMany } };
  const client = {
    employee: {
      findFirst: vi.fn().mockResolvedValue(opts.employee === false ? null : { id: EMP }),
    },
    smena: {
      findMany: vi.fn(async (args: { where?: { id?: { in?: string[] } } }) => {
        const wanted = args?.where?.id?.in;
        const rows = (wanted ?? known).filter((id) => known.includes(id));
        return rows.map((id) => ({
          id,
          name: id,
          schedule: { name: 'j', startTime: '00:00', endTime: '23:59' },
          organization: { name: 'org' },
        }));
      }),
    },
    smenaEmployee: { findMany: vi.fn().mockResolvedValue([{ smenaId: SM_A }]) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const service = new SmenaService({ client } as never);
  return { service, client, deleteMany, createMany };
}

describe('setEmployeeSmenas — xodim kartasidan biriktirish (P11)', () => {
  it('begona hisobning xodimi → 404 (hech nima o`chirilmaydi)', async () => {
    const { service, deleteMany } = makeAssignService({ employee: false });
    await expect(service.setEmployeeSmenas(ACC, EMP, { smenaIds: [SM_A] })).rejects.toThrow(
      NotFoundException,
    );
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('noma`lum/arxivlangan smena → 400, yozuv yo`q', async () => {
    const { service, deleteMany, createMany } = makeAssignService({ smenaIds: [SM_A] });
    await expect(service.setEmployeeSmenas(ACC, EMP, { smenaIds: [SM_B] })).rejects.toThrow(
      BadRequestException,
    );
    expect(deleteMany).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });

  it('to`liq almashtiradi va o`chirishni SHU hisob smenalari bilan cheklaydi', async () => {
    const { service, deleteMany, createMany } = makeAssignService();
    await service.setEmployeeSmenas(ACC, EMP, { smenaIds: [SM_B, SM_B] });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { employeeId: EMP, smenaId: { in: [SM_A, SM_B] } },
    });
    // Takroriy id bir marta yoziladi (kompozit PK'ni buzmaslik uchun).
    expect(createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [{ smenaId: SM_B, employeeId: EMP }] }),
    );
  });

  it('bo`sh ro`yxat = hamma biriktirmani olib tashlash (createMany chaqirilmaydi)', async () => {
    const { service, deleteMany, createMany } = makeAssignService();
    await service.setEmployeeSmenas(ACC, EMP, { smenaIds: [] });
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(createMany).not.toHaveBeenCalled();
  });
});

describe('mine — bir nechta smenada VAQTI KELGANI tanlanadi (P11)', () => {
  /** `smenaEmployee.findMany` faqat biriktirmalarni qaytaradigan mock. */
  function makeMineService(rows: Array<{ name: string; startTime: string; endTime: string }>) {
    const client = {
      smenaEmployee: {
        findMany: vi.fn().mockResolvedValue(
          rows.map((r) => ({
            smena: {
              id: r.name,
              name: r.name,
              schedule: { startTime: r.startTime, endTime: r.endTime },
              organization: { id: 'org-1', name: 'org' },
            },
          })),
        ),
      },
    };
    return new SmenaService({ client } as never);
  }

  it('ro`yxatdagi birinchi smena vaqtdan tashqari bo`lsa ham, faol smena olinadi', async () => {
    // Toshkent 14:00 (kun O'RTASI — chegara-nuqta emas): tungi smena YOPIQ,
    // kunduzgi OCHIQ. Eski kod `assignments[0]` ni olib «vaqtdan tashqari»
    // deb sabab so'rardi.
    vi.setSystemTime(new Date('2026-08-10T09:00:00Z'));
    const service = makeMineService([
      { name: 'Tungi', startTime: '22:00', endTime: '06:00' },
      { name: 'Kunduzgi', startTime: '09:00', endTime: '18:00' },
    ]);
    const res = (await service.mine(ACC, EMP)) as {
      smena: { name: string } | null;
      withinShift: boolean;
    };
    expect(res.smena?.name).toBe('Kunduzgi');
    expect(res.withinShift).toBe(true);
    vi.useRealTimers();
  });

  it('hech biri faol bo`lmasa — birinchisi, withinShift=false', async () => {
    vi.setSystemTime(new Date('2026-08-10T09:00:00Z')); // Toshkent 14:00
    const service = makeMineService([
      { name: 'Tungi', startTime: '22:00', endTime: '06:00' },
      { name: 'Erta', startTime: '05:00', endTime: '08:00' },
    ]);
    const res = (await service.mine(ACC, EMP)) as {
      smena: { name: string } | null;
      withinShift: boolean;
    };
    expect(res.smena?.name).toBe('Tungi');
    expect(res.withinShift).toBe(false);
    vi.useRealTimers();
  });

  it('biriktirma yo`q → smena null', async () => {
    const service = makeMineService([]);
    const res = (await service.mine(ACC, EMP)) as { smena: unknown };
    expect(res.smena).toBeNull();
  });
});
