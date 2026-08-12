import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OptimisticLockException } from '../../shared/optimistic-lock.js';
import { HrEmployeeService } from './hr-employee.service.js';

/** Prisma-shaped P2002 (grounded: meta.target is the field array). */
function p2002(target: string[]) {
  return Object.assign(new Error('Unique constraint failed'), {
    code: 'P2002',
    meta: { target },
  });
}

/**
 * Xodimni to'liq o'chirishda tekshiriladigan bog'lanishlar (jonli bazadan
 * o'lchangan: `employees.id` ga RESTRICT bilan qaraydigan 12 ta FK).
 * Har biri `count` + `deleteMany` beradi; sukut bo'yicha 0 — test faqat
 * o'zi qiziqadigan jadvalni «to'ldiradi».
 */
const RELATION_MODELS = [
  'payroll',
  'cashierSession',
  'cashierSessionVariance',
  'cashierAuditEvent',
  'publication',
  'hrAttendance',
  'hrBonusFineLog',
  'hrKpiDailyLog',
  'hrKpiMonthlyScore',
  'hrTaskLog',
  'salesPlan',
  'labelPrintJob',
] as const;

type RelationMock = { count: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> };

function makePrisma() {
  const client: Record<string, unknown> = {
    employee: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    // Callback shaklidagi tranzaksiya — o'chirish AYNAN shu yerda bo'ladi
    // (yarim o'chirilgan xodim qolmasin).
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === 'function' ? await (arg as (tx: unknown) => Promise<unknown>)(client) : arg,
    ),
  };
  for (const m of RELATION_MODELS) {
    client[m] = { count: vi.fn(async () => 0), deleteMany: vi.fn(async () => ({ count: 0 })) };
  }
  return { client } as {
    client: Record<string, unknown> & {
      employee: Record<string, ReturnType<typeof vi.fn>>;
      $transaction: ReturnType<typeof vi.fn>;
    };
  };
}

/** Fikstura yordamchisi: `model` jadvalida `n` qator bordek ko'rsatadi. */
function withRows(
  prisma: ReturnType<typeof makePrisma>,
  model: (typeof RELATION_MODELS)[number],
  n: number,
) {
  (prisma.client[model] as RelationMock).count.mockResolvedValue(n);
}

describe('HrEmployeeService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: HrEmployeeService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new HrEmployeeService(prisma as never);
  });

  it('list filters by accountId and archived=false', async () => {
    prisma.client.$transaction.mockResolvedValue([[], 0]);
    await service.list('acc1', { page: 1, limit: 50 });
    expect(prisma.client.$transaction).toHaveBeenCalled();
    const result = await service.list('acc1', { page: 1, limit: 50 });
    expect(result).toEqual({ rows: [], total: 0, page: 1, limit: 50 });
  });

  it('list applies search across name/phone/email/username', async () => {
    prisma.client.$transaction.mockResolvedValue([[], 0]);
    await service.list('acc1', { search: 'Ahmad', page: 1, limit: 50 });
    expect(prisma.client.$transaction).toHaveBeenCalled();
  });

  it('findOne throws NotFound when employee missing', async () => {
    prisma.client.employee.findFirst.mockResolvedValue(null);
    await expect(service.findOne('acc1', 'e1')).rejects.toThrow(NotFoundException);
  });

  it('findOne returns employee merged with __employee_system attrs', async () => {
    const emp = {
      id: 'e1',
      name: 'X',
      email: 'x@y',
      attributes: {
        __employee_system: { loginAllowed: false, allowedIps: ['1.2.3.4'] },
      },
    };
    prisma.client.employee.findFirst.mockResolvedValue(emp as never);
    await expect(service.findOne('acc1', 'e1')).resolves.toEqual({
      id: 'e1',
      name: 'X',
      email: 'x@y',
      loginAllowed: false,
      allowedIps: ['1.2.3.4'],
      allowedNetworks: [],
      notifications: {},
      hasImage: false,
      imageName: null,
    });
  });

  it('findOne defaults loginAllowed=true when attributes are empty', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'e1', attributes: null } as never);
    const res = await service.findOne('acc1', 'e1');
    expect(res.loginAllowed).toBe(true);
  });

  it('create with all fields re-reads the card shape after insert', async () => {
    prisma.client.employee.create.mockResolvedValue({ id: 'new' } as never);
    // create() chains into findOne('new') → give the re-read something to return.
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'new', attributes: null } as never);
    await service.create('acc1', {
      name: 'Yangi',
      email: 'y@y.uz',
      phone: '+998901234567',
      telegramPhone: '+998901234567',
      department: 'Sotuv',
      hrRoles: ['cashier'],
      isChecker: false,
      moyskladAgentId: null,
    });
    expect(prisma.client.employee.create).toHaveBeenCalled();
    const call = prisma.client.employee.create.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    // No card extras in the payload → attributes stays untouched.
    expect(call.data.attributes).toBeUndefined();
  });

  it('create writes card extras into attributes.__employee_system', async () => {
    prisma.client.employee.create.mockResolvedValue({ id: 'new' } as never);
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'new', attributes: null } as never);
    await service.create('acc1', {
      name: 'Yangi',
      hrRoles: [],
      isChecker: false,
      loginAllowed: false,
      allowedIps: ['192.168.1.10'],
      salaryMinor: '250000',
    });
    const call = prisma.client.employee.create.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(call.data.salaryMinor).toBe(250000n);
    expect(call.data.attributes).toEqual({
      __employee_system: { loginAllowed: false, allowedIps: ['192.168.1.10'] },
    });
  });

  it('update passes only provided fields', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'e1' } as never);
    prisma.client.employee.update.mockResolvedValue({} as never);
    await service.update('acc1', 'e1', { name: 'Yangi nom' });
    const call = prisma.client.employee.update.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    expect((call as { data: { name?: string } }).data.name).toBe('Yangi nom');
    expect((call as { data: Record<string, unknown> }).data.email).toBeUndefined();
  });

  it('update merges __employee_system without clobbering other attribute keys', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({
      id: 'e1',
      attributes: { customField: 'keep', __employee_system: { allowedIps: ['9.9.9.9'] } },
    } as never);
    prisma.client.employee.update.mockResolvedValue({ id: 'e1' } as never);
    await service.update('acc1', 'e1', { version: 3, loginAllowed: false });
    const call = prisma.client.employee.update.mock.calls[0]?.[0] as {
      data: { attributes?: Record<string, unknown> };
    };
    expect(call.data.attributes).toEqual({
      customField: 'keep',
      __employee_system: { allowedIps: ['9.9.9.9'], loginAllowed: false },
    });
  });

  it('setPassword fails on duplicate username', async () => {
    prisma.client.employee.findFirst
      .mockResolvedValueOnce({ id: 'e1' } as never)
      .mockResolvedValueOnce({ id: 'other' } as never);
    await expect(
      service.setPassword('acc1', 'e1', { username: 'taken', password: 'abcd' }),
    ).rejects.toThrow(ConflictException);
  });

  it('setPassword hashes via argon2 + writes', async () => {
    prisma.client.employee.findFirst
      .mockResolvedValueOnce({ id: 'e1' } as never)
      .mockResolvedValueOnce(null);
    prisma.client.employee.update.mockResolvedValue({} as never);
    await service.setPassword('acc1', 'e1', { username: 'ozod', password: 'verysecure' });
    const updateCall = prisma.client.employee.update.mock.calls[0]?.[0] as {
      data: { username: string; passwordHash: string };
    };
    expect(updateCall.data.username).toBe('ozod');
    expect(updateCall.data.passwordHash).toMatch(/^\$argon2/);
  });

  // ─── Uniqueness: duplicate email/username → 409, not a raw 500 ───────
  // HR create/update have NO app pre-check, so a duplicate (sequential OR a
  // concurrent race) hits the DB unique index directly → Prisma P2002. Without
  // mapping it falls through to a 500 (no global Prisma exception filter).

  it('create: maps a duplicate email (P2002) to ConflictException, not a raw error', async () => {
    prisma.client.employee.create.mockRejectedValue(p2002(['account_id', 'email']));
    await expect(
      service.create('acc1', { name: 'X', email: 'taken@y.uz', hrRoles: [], isChecker: false }),
    ).rejects.toThrow(ConflictException);
  });

  it('create: rethrows a non-P2002 error unchanged', async () => {
    prisma.client.employee.create.mockRejectedValue(new Error('connection lost'));
    await expect(
      service.create('acc1', { name: 'X', email: 'a@y.uz', hrRoles: [], isChecker: false }),
    ).rejects.toThrow('connection lost');
  });

  it('update: maps a duplicate email (P2002) to ConflictException', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'e1' } as never); // findOne ok
    prisma.client.employee.update.mockRejectedValue(p2002(['account_id', 'email']));
    await expect(service.update('acc1', 'e1', { email: 'taken@y.uz', version: 1 })).rejects.toThrow(
      ConflictException,
    );
  });

  it('update: still maps a P2025 (stale version) to OptimisticLockException', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'e1' } as never);
    prisma.client.employee.update.mockRejectedValue(
      Object.assign(new Error('not found'), { code: 'P2025' }),
    );
    await expect(service.update('acc1', 'e1', { name: 'Y', version: 1 })).rejects.toThrow(
      OptimisticLockException,
    );
  });

  it('setPassword: maps a P2002 username race (past the pre-check) to ConflictException', async () => {
    prisma.client.employee.findFirst
      .mockResolvedValueOnce({ id: 'e1' } as never) // findOne
      .mockResolvedValueOnce(null); // pre-check: username free
    prisma.client.employee.update.mockRejectedValue(p2002(['account_id', 'username']));
    await expect(
      service.setPassword('acc1', 'e1', { username: 'racey', password: 'verysecure' }),
    ).rejects.toThrow(ConflictException);
  });

  // ─── Adversarial QA: telegramPhone normalization on write ────────────

  it('create: normalizes Uzbek 9-digit mobile to canonical +998…', async () => {
    prisma.client.employee.create.mockResolvedValue({ id: 'new' } as never);
    // create() re-reads the card shape via findOne after insert.
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'new', attributes: null } as never);
    await service.create('acc1', {
      name: 'Anvar',
      telegramPhone: '901234567',
      hrRoles: [],
      isChecker: false,
    });
    const args = prisma.client.employee.create.mock.calls[0]?.[0] as {
      data: { telegramPhone: string };
    };
    expect(args.data.telegramPhone).toBe('+998901234567');
  });

  it('create: strips separators in telegramPhone (+998 (90) 123-45-67)', async () => {
    prisma.client.employee.create.mockResolvedValue({ id: 'new' } as never);
    // create() re-reads the card shape via findOne after insert.
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'new', attributes: null } as never);
    await service.create('acc1', {
      name: 'Anvar',
      telegramPhone: '+998 (90) 123-45-67',
      hrRoles: [],
      isChecker: false,
    });
    const args = prisma.client.employee.create.mock.calls[0]?.[0] as {
      data: { telegramPhone: string };
    };
    expect(args.data.telegramPhone).toBe('+998901234567');
  });

  it('create: rejects garbage telegramPhone via BadRequest', async () => {
    await expect(
      service.create('acc1', {
        name: 'Anvar',
        telegramPhone: 'not-a-number',
        hrRoles: [],
        isChecker: false,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.client.employee.create).not.toHaveBeenCalled();
  });

  it('update: omitting telegramPhone leaves it unchanged (no field in update data)', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'e1' } as never);
    prisma.client.employee.update.mockResolvedValue({} as never);
    await service.update('acc1', 'e1', { name: 'Anvar' });
    const call = prisma.client.employee.update.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(call.data.telegramPhone).toBeUndefined();
  });

  it('update: normalizing telegramPhone runs on update too', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'e1' } as never);
    prisma.client.employee.update.mockResolvedValue({} as never);
    await service.update('acc1', 'e1', { telegramPhone: '998901234567' });
    const call = prisma.client.employee.update.mock.calls[0]?.[0] as {
      data: { telegramPhone: string };
    };
    expect(call.data.telegramPhone).toBe('+998901234567');
  });

  // ─── Bulk «Изменить»: archive / restore / hard-delete + self-guard ───────

  it('list: archived=true flips the where filter to the archived view', async () => {
    prisma.client.$transaction.mockResolvedValue([[], 0]);
    await service.list('acc1', { archived: true, page: 1, limit: 50 });
    const findManyArgs = prisma.client.employee.findMany.mock.calls[0]?.[0] as {
      where: { accountId: string; archived: boolean };
    };
    expect(findManyArgs.where.archived).toBe(true);
    expect(findManyArgs.where.accountId).toBe('acc1');
  });

  it('setArchived: archives via tenant-scoped lookup (findFirst by id+accountId)', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'e1', archived: false } as never);
    prisma.client.employee.update.mockResolvedValue({} as never);
    await service.setArchived('acc1', 'e1', true, 'me');
    const lookup = prisma.client.employee.findFirst.mock.calls[0]?.[0] as {
      where: { id: string; accountId: string };
    };
    expect(lookup.where).toEqual({ id: 'e1', accountId: 'acc1' });
    const upd = prisma.client.employee.update.mock.calls[0]?.[0] as { data: { archived: boolean } };
    expect(upd.data.archived).toBe(true);
  });

  it('setArchived: restore (archived=false) is allowed even for self', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'me', archived: true } as never);
    prisma.client.employee.update.mockResolvedValue({} as never);
    await expect(service.setArchived('acc1', 'me', false, 'me')).resolves.toEqual({ ok: true });
    const upd = prisma.client.employee.update.mock.calls[0]?.[0] as { data: { archived: boolean } };
    expect(upd.data.archived).toBe(false);
  });

  it('setArchived: cannot archive YOURSELF (self-lockout) → BadRequest, no update', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'me', archived: false } as never);
    await expect(service.setArchived('acc1', 'me', true, 'me')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.client.employee.update).not.toHaveBeenCalled();
  });

  it('setArchived: throws NotFound when employee is missing / other tenant', async () => {
    prisma.client.employee.findFirst.mockResolvedValue(null);
    await expect(service.setArchived('acc1', 'ghost', true, 'me')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.client.employee.update).not.toHaveBeenCalled();
  });

  it('hardDelete: deletes scoped by id + accountId after tenant ownership check', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'e1', archived: true } as never);
    prisma.client.employee.delete.mockResolvedValue({} as never);
    await expect(service.hardDelete('acc1', 'e1', 'me')).resolves.toEqual({ ok: true });
    const del = prisma.client.employee.delete.mock.calls[0]?.[0] as {
      where: { id: string; accountId: string };
    };
    expect(del.where).toEqual({ id: 'e1', accountId: 'acc1' });
  });

  it('hardDelete: cannot delete YOURSELF → BadRequest, no delete', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'me', archived: false } as never);
    await expect(service.hardDelete('acc1', 'me', 'me')).rejects.toThrow(BadRequestException);
    expect(prisma.client.employee.delete).not.toHaveBeenCalled();
  });

  it('hardDelete: translates FK violation (P2003) to a clear Conflict message', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'e1', archived: false } as never);
    prisma.client.employee.delete.mockRejectedValue(
      Object.assign(new Error('FK constraint'), { code: 'P2003' }),
    );
    await expect(service.hardDelete('acc1', 'e1', 'me')).rejects.toThrow(ConflictException);
  });

  it('hardDelete: rethrows non-FK errors unchanged', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'e1', archived: false } as never);
    prisma.client.employee.delete.mockRejectedValue(new Error('connection lost'));
    await expect(service.hardDelete('acc1', 'e1', 'me')).rejects.toThrow('connection lost');
  });
});

/**
 * Xodimni TO'LIQ o'chirish (2026-08-12, egasining shikoyati bo'yicha).
 *
 * MUAMMO: «O'chirish» tugmasi aslida `archived = true` qilardi — xodim
 * ro'yxatdan yo'qolardi-yu, bazada qolib, login/e-mail/ism-familiyani BAND
 * qilib turardi (`err_login_taken_archived` xatosi shu yerdan). Tasdiq oynasi
 * esa «bu amalni qaytarib bo'lmaydi» der edi — ya'ni matn ham yolg'on edi.
 *
 * YANGI SHARTNOMA (jonli bazadan o'lchangan 12 ta RESTRICT FK asosida):
 *  🔴 PUL va KASSA izi hech qachon o'chmaydi — oylik, kassa smenasi, kassa
 *     farqi, kassa audit yozuvi yoki publikatsiya bo'lsa o'chirish RAD etiladi
 *     va sabab AYNAN nima ushlab turgani bilan aytiladi (arxiv — alternativa);
 *  · HR ning ichki hosila loglari (davomat · bonus/jarima · kunlik va oylik
 *    KPI · vazifa jurnali · savdo rejasi · yorliq chop navbati) xodim bilan
 *    BIRGA o'chadi — aks holda hech bir xodimni umuman o'chirib bo'lmasdi
 *    (prodda o'lchangan: 15 arxivlangan xodimning har birida 17 tadan
 *    `hr_kpi_daily_log` qatori bor edi va YAGONA to'siq shu edi);
 *  · hammasi BITTA tranzaksiyada — yarim o'chirilgan xodim qolmaydi.
 */
describe('HrEmployeeService — xodimni to‘liq o‘chirish', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: HrEmployeeService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new HrEmployeeService(prisma as never);
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'e1', archived: true } as never);
    prisma.client.employee.delete.mockResolvedValue({} as never);
  });

  it('🔴 oyligi bor xodim O‘CHMAYDI — sabab aniq aytiladi', async () => {
    withRows(prisma, 'payroll', 3);
    await expect(service.hardDelete('acc1', 'e1', 'me')).rejects.toThrow(ConflictException);
    await expect(service.hardDelete('acc1', 'e1', 'me')).rejects.toThrow(/oylik/i);
    expect(prisma.client.employee.delete).not.toHaveBeenCalled();
  });

  it('🔴 kassa smenasi bor xodim O‘CHMAYDI (chek izi uziladi)', async () => {
    withRows(prisma, 'cashierSession', 1);
    await expect(service.hardDelete('acc1', 'e1', 'me')).rejects.toThrow(ConflictException);
    expect(prisma.client.employee.delete).not.toHaveBeenCalled();
  });

  it('🔴 kassa audit yozuvi ham to‘sadi', async () => {
    withRows(prisma, 'cashierAuditEvent', 5);
    await expect(service.hardDelete('acc1', 'e1', 'me')).rejects.toThrow(ConflictException);
    expect(prisma.client.employee.delete).not.toHaveBeenCalled();
  });

  it('faqat HR loglari bo‘lsa — ular ham, xodim ham O‘CHADI', async () => {
    withRows(prisma, 'hrKpiDailyLog', 17);
    withRows(prisma, 'hrAttendance', 4);

    await expect(service.hardDelete('acc1', 'e1', 'me')).resolves.toEqual({ ok: true });

    const kpi = prisma.client.hrKpiDailyLog as RelationMock;
    const att = prisma.client.hrAttendance as RelationMock;
    expect(kpi.deleteMany).toHaveBeenCalledWith({ where: { employeeId: 'e1' } });
    expect(att.deleteMany).toHaveBeenCalledWith({ where: { employeeId: 'e1' } });
    expect(prisma.client.employee.delete).toHaveBeenCalledTimes(1);
  });

  it('o‘chirish BITTA tranzaksiyada bo‘ladi (yarim o‘chirilgan xodim yo‘q)', async () => {
    withRows(prisma, 'hrKpiDailyLog', 17);
    await service.hardDelete('acc1', 'e1', 'me');
    expect(prisma.client.$transaction).toHaveBeenCalledTimes(1);
  });

  it('PUL izi tekshiruvi o‘chirishdan OLDIN — hech narsa o‘chmaydi', async () => {
    withRows(prisma, 'payroll', 1);
    withRows(prisma, 'hrKpiDailyLog', 17);
    await expect(service.hardDelete('acc1', 'e1', 'me')).rejects.toThrow(ConflictException);
    const kpi = prisma.client.hrKpiDailyLog as RelationMock;
    expect(kpi.deleteMany).not.toHaveBeenCalled();
    expect(prisma.client.$transaction).not.toHaveBeenCalled();
  });

  it('o‘zini o‘chirish hamon TAQIQ (self-lockout)', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'me', archived: false } as never);
    await expect(service.hardDelete('acc1', 'me', 'me')).rejects.toThrow(BadRequestException);
    expect(prisma.client.employee.delete).not.toHaveBeenCalled();
  });
});

/**
 * Tasdiq oynasi «nima bo'ladi»ni OLDIN ko'rsatishi uchun — ekran taxmin
 * qilmasin. Bu `hardDelete` bilan AYNI ro'yxatlardan o'qiydi, ya'ni oynada
 * ko'ringan narsa serverda bo'ladigan narsa.
 */
describe('HrEmployeeService — o‘chirish oldidan tekshiruv (preflight)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: HrEmployeeService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new HrEmployeeService(prisma as never);
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'e1', archived: true } as never);
  });

  it('tarixsiz xodim: canDelete=true, ro‘yxatlar bo‘sh', async () => {
    await expect(service.deletePreflight('acc1', 'e1')).resolves.toEqual({
      canDelete: true,
      blockers: [],
      cascade: [],
    });
  });

  it('HR loglari bor xodim: canDelete=true, lekin nima o‘chishi SANALADI', async () => {
    withRows(prisma, 'hrKpiDailyLog', 17);
    const out = await service.deletePreflight('acc1', 'e1');
    expect(out.canDelete).toBe(true);
    expect(out.blockers).toEqual([]);
    expect(out.cascade).toContainEqual({ key: 'hrKpiDailyLog', label: 'kunlik KPI', count: 17 });
  });

  it('oyligi bor xodim: canDelete=false va to‘siq nomi bilan qaytadi', async () => {
    withRows(prisma, 'payroll', 2);
    const out = await service.deletePreflight('acc1', 'e1');
    expect(out.canDelete).toBe(false);
    expect(out.blockers).toContainEqual({ key: 'payroll', label: 'oylik', count: 2 });
  });

  it('nol qatorli bog‘lanish ro‘yxatga TUSHMAYDI (shovqin yo‘q)', async () => {
    withRows(prisma, 'hrAttendance', 0);
    withRows(prisma, 'hrTaskLog', 2);
    const out = await service.deletePreflight('acc1', 'e1');
    expect(out.cascade.map((c) => c.key)).toEqual(['hrTaskLog']);
  });

  it('begona/yo‘q xodim → NotFound', async () => {
    prisma.client.employee.findFirst.mockResolvedValue(null);
    await expect(service.deletePreflight('acc1', 'ghost')).rejects.toThrow(NotFoundException);
  });
});

/**
 * HR-10 — imtiyoz chegarasi. `employees:full` egasi O'ZIGA (yoki o'zi admin
 * bo'lmay turib boshqaga) HR-admin rolini bera olmasligi kerak.
 */
describe('HrEmployeeService — hrRoles self-eskalatsiya (HR-10)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: HrEmployeeService;

  /** findFirst'ni `where.id` bo'yicha ajratadi: tahrirlanayotgan xodim vs aktor. */
  function employees(rows: Record<string, unknown>) {
    prisma.client.employee.findFirst.mockImplementation(
      (async (args: {
        where: { id: string };
      }) => rows[args.where.id] ?? null) as never,
    );
  }

  beforeEach(() => {
    prisma = makePrisma();
    service = new HrEmployeeService(prisma as never);
    prisma.client.employee.update.mockResolvedValue({ id: 'e1' } as never);
    prisma.client.employee.create.mockResolvedValue({ id: 'new1', version: 1 } as never);
  });

  it('update: o`ziga hrRoles yozishga urinish → 403, update chaqirilmaydi', async () => {
    employees({ me: { id: 'me', attributes: null, hrRoles: [] } });
    await expect(
      service.update('acc1', 'me', { hrRoles: ['admin'], version: 1 }, 'me'),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.client.employee.update).not.toHaveBeenCalled();
  });

  it('update: admin bo`lmagan aktor boshqaga admin rolini beryapti → 403', async () => {
    employees({
      e1: { id: 'e1', attributes: null, hrRoles: ['kassir'] },
      me: { id: 'me', hrRoles: ['hr'] },
    });
    await expect(
      service.update('acc1', 'e1', { hrRoles: ['kassir', 'admin'], version: 1 }, 'me'),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.client.employee.update).not.toHaveBeenCalled();
  });

  it('update: admin aktor boshqaga admin rolini beradi → o`tadi', async () => {
    employees({
      e1: { id: 'e1', attributes: null, hrRoles: [] },
      me: { id: 'me', hrRoles: ['admin'] },
    });
    await service.update('acc1', 'e1', { hrRoles: ['admin'], version: 1 }, 'me');
    const call = prisma.client.employee.update.mock.calls[0]?.[0] as {
      data: { hrRoles?: string[] };
    };
    expect(call.data.hrRoles).toEqual(['admin']);
  });

  it('update: admin bo`lmagan aktor admin bo`lmagan rol beradi → o`tadi', async () => {
    employees({
      e1: { id: 'e1', attributes: null, hrRoles: [] },
      me: { id: 'me', hrRoles: ['hr'] },
    });
    await service.update('acc1', 'e1', { hrRoles: ['kassir'], version: 1 }, 'me');
    expect(prisma.client.employee.update).toHaveBeenCalled();
  });

  it('create: admin bo`lmagan aktor admin rolli xodim yarata olmaydi → 403', async () => {
    employees({ me: { id: 'me', hrRoles: ['hr'] } });
    await expect(
      service.create('acc1', { name: 'X', hrRoles: ['admin'], isChecker: false } as never, 'me'),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.client.employee.create).not.toHaveBeenCalled();
  });
});
