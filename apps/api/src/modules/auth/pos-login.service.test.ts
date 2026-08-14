import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PosLoginService } from './pos-login.service.js';

const DEVICE_CTX = {
  id: 'dev-1',
  accountId: 'acc-1',
  storeId: 'store-1',
  cashDeskId: 'desk-1',
  organizationId: 'org-1',
  name: '1-kassa',
};

const EMPLOYEE = {
  id: 'emp-1',
  accountId: 'acc-1',
  email: 'kassir@demo.local',
  name: 'Kassir',
  position: 'Kassir',
  username: null,
  hrRoles: [],
  isChecker: false,
  archived: false,
  lockedUntil: null,
  attributes: null,
  account: { plan: 'pro' },
  hrPermissions: [],
  roles: [{ role: { uiMode: 'kiosk' } }],
};

function makeDeps(over: { employee?: unknown; device?: unknown; pin?: unknown } = {}) {
  const devices = {
    verify: vi.fn().mockResolvedValue(DEVICE_CTX),
    registerFailure: vi.fn().mockResolvedValue(undefined),
    registerSuccess: vi.fn().mockResolvedValue(undefined),
    ...((over.device as object) ?? {}),
  };
  const pins = {
    findByPin: vi.fn().mockResolvedValue({ employeeId: 'emp-1' }),
    findByPinAnyAccount: vi.fn().mockResolvedValue({ employeeId: 'emp-1' }),
    verifyPin: vi.fn().mockResolvedValue({ ok: true, remaining: null }),
    ...((over.pin as object) ?? {}),
  };
  const prisma = {
    client: {
      employee: {
        findFirst: vi
          .fn()
          .mockResolvedValue(over.employee === undefined ? EMPLOYEE : over.employee),
        // F7 kassir-tanlash ro'yxati shu so'rovdan chiziladi.
        findMany: vi.fn().mockResolvedValue([{ id: 'emp-2', name: 'Boshqa Kassir' }]),
        update: vi.fn().mockResolvedValue(EMPLOYEE),
      },
      // Qurilmasiz kirishda hisob sukutlari shu yerdan olinadi.
      store: { findFirst: vi.fn().mockResolvedValue({ id: 'store-default' }) },
      cashDesk: { findFirst: vi.fn().mockResolvedValue({ id: 'desk-default' }) },
      organization: { findFirst: vi.fn().mockResolvedValue({ id: 'org-default' }) },
      // F7 switch: joriy kassirning ochiq sessiyasi tekshiriladi.
      cashierSession: { findFirst: vi.fn().mockResolvedValue(null) },
      // F7 switch: almashinuv audit-jurnalga yoziladi.
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    },
  };
  const tokens = {
    signAccessToken: vi.fn().mockReturnValue('access-jwt'),
    createRefreshToken: vi.fn().mockResolvedValue('refresh-raw'),
    signMediaToken: vi.fn().mockReturnValue('media-jwt'),
    revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
  };
  const svc = new PosLoginService(
    prisma as never,
    tokens as never,
    devices as never,
    pins as never,
  );
  return { devices, pins, prisma, tokens, svc };
}

const META = { ipAddress: '10.0.0.5', userAgent: 'kassa-exe' };
const INPUT = { deviceId: 'dev-1', deviceSecret: 'x'.repeat(64), pin: '1234' };

describe('PosLoginService.login', () => {
  it('to`g`ri PIN → token va qurilma konteksti', async () => {
    const { svc, devices } = makeDeps();
    const out = await svc.login(INPUT, META);
    expect(out.accessToken).toBe('access-jwt');
    expect(out.refreshToken).toBe('refresh-raw');
    expect(out.mediaToken).toBe('media-jwt');
    expect(out.device).toMatchObject({ cashDeskId: 'desk-1', storeId: 'store-1' });
    // shellVersion yuborilmagan — undefined uzatiladi (ustun tegilmaydi, K07).
    expect(devices.registerSuccess).toHaveBeenCalledWith('dev-1', undefined);
  });

  it('shellVersion input`dan registerSuccess`ga yetib boradi (K07)', async () => {
    const { svc, devices } = makeDeps();
    await svc.login({ ...INPUT, shellVersion: '1.5.0' }, META);
    expect(devices.registerSuccess).toHaveBeenCalledWith('dev-1', '1.5.0');
  });

  it('PIN topilmadi → 401 va qurilma hisoblagichi oshadi', async () => {
    const { svc, devices } = makeDeps({ pin: { findByPin: vi.fn().mockResolvedValue(null) } });
    await expect(svc.login(INPUT, META)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(devices.registerFailure).toHaveBeenCalledWith('dev-1');
  });

  it('juftlanmagan qurilma → 401, PIN umuman tekshirilmaydi', async () => {
    const { svc, pins } = makeDeps({
      device: {
        verify: vi.fn().mockRejectedValue(new UnauthorizedException('Qurilma tanilmadi')),
      },
    });
    await expect(svc.login(INPUT, META)).rejects.toBeInstanceOf(UnauthorizedException);
    // Tartib muhim: qurilma AVVAL. Aks holda juftlanmagan qurilmadan ham
    // PIN taxmin qilish mumkin bo'lardi.
    expect(pins.findByPin).not.toHaveBeenCalled();
  });

  it('xodim BOSHQA akkauntdan → 401 (tenant chegarasi)', async () => {
    const { svc, devices } = makeDeps({ employee: { ...EMPLOYEE, accountId: 'acc-BOSHQA' } });
    await expect(svc.login(INPUT, META)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(devices.registerFailure).toHaveBeenCalledWith('dev-1');
  });

  it('xodim topilmadi (arxivlangan) → 401', async () => {
    const { svc } = makeDeps({ employee: null });
    await expect(svc.login(INPUT, META)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('loginAllowed=false xodim → 401', async () => {
    const { svc } = makeDeps({
      employee: { ...EMPLOYEE, attributes: { __employee_system: { loginAllowed: false } } },
    });
    await expect(svc.login(INPUT, META)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('bloklangan xodim → 401', async () => {
    const { svc } = makeDeps({
      employee: { ...EMPLOYEE, lockedUntil: new Date(Date.now() + 10 * 60_000) },
    });
    await expect(svc.login(INPUT, META)).rejects.toThrow(/bloklangan/);
  });

  it('xato xabari kim ekanini OSHKOR QILMAYDI', async () => {
    const { svc } = makeDeps({ pin: { findByPin: vi.fn().mockResolvedValue(null) } });
    await expect(svc.login(INPUT, META)).rejects.toThrow(/PIN/);
  });

  it('uiMode kiosk sifatida hisoblanadi va user javobida qaytadi', async () => {
    const { svc } = makeDeps();
    const out = await svc.login(INPUT, META);
    expect(out.user.uiMode).toBe('kiosk');
  });

  it('muvaffaqiyatda xodimning xato hisoblagichi tozalanadi', async () => {
    const { svc, prisma } = makeDeps();
    await svc.login(INPUT, META);
    const data = prisma.client.employee.update.mock.calls[0]?.[0]?.data;
    expect(data).toMatchObject({ failedLoginAttempts: 0, lockedUntil: null });
    expect(data.lastLoginAt).toBeInstanceOf(Date);
  });
});

/**
 * QURILMASIZ KIRISH (2026-08-11 — egasi juftlashni butunlay olib tashlashni
 * buyurdi: «faqat pinkod chiqadi, tamom»).
 *
 * Eski, juftlangan o'rnatmalar buzilmasligi uchun qurilma yo'li YO'QOLMADI —
 * yuqoridagi bloк o'shani tekshiradi. Bu blok esa kalitsiz yo'lni qulflaydi.
 */
describe('PosLoginService.login — qurilma kalitisiz', () => {
  const PIN_ONLY = { pin: '1234' };

  it('kalitsiz kirishda qurilma TEKSHIRILMAYDI va PIN global qidiriladi', async () => {
    const { svc, devices, pins } = makeDeps();
    await svc.login(PIN_ONLY, META);
    expect(devices.verify).not.toHaveBeenCalled();
    expect(pins.findByPin).not.toHaveBeenCalled();
    expect(pins.findByPinAnyAccount).toHaveBeenCalledWith('1234');
  });

  it('do`kon/kassa/tashkilot hisob SUKUTLARIDAN keladi (kassir tanlamaydi)', async () => {
    const { svc } = makeDeps();
    const out = await svc.login(PIN_ONLY, META);
    expect(out.device).toMatchObject({
      id: null,
      storeId: 'store-default',
      cashDeskId: 'desk-default',
      organizationId: 'org-default',
    });
  });

  it('PIN topilmasa RAD ETADI va qurilma hisoblagichiga tegmaydi', async () => {
    const { svc, devices } = makeDeps({
      pin: { findByPinAnyAccount: vi.fn().mockResolvedValue(null) },
    });
    await expect(svc.login(PIN_ONLY, META)).rejects.toThrow(UnauthorizedException);
    // Qurilma yo'q — `registerFailure` chaqirilsa `undefined.id` bilan yiqilardi.
    expect(devices.registerFailure).not.toHaveBeenCalled();
  });

  it('sukut do`kon topilmasa `null` qaytadi (smena ochilishida server aniqlaydi)', async () => {
    const { svc, prisma } = makeDeps();
    prisma.client.store.findFirst.mockResolvedValue(null);
    const out = await svc.login(PIN_ONLY, META);
    expect(out.device.storeId).toBeNull();
  });

  it('kalit BERILSA eski qattiq yo`l ishlaydi (regress qo`rig`i)', async () => {
    const { svc, devices, pins } = makeDeps();
    const out = await svc.login(INPUT, META);
    expect(devices.verify).toHaveBeenCalled();
    expect(pins.findByPin).toHaveBeenCalledWith('acc-1', '1234');
    expect(out.device.storeId).toBe('store-1');
  });
});

/**
 * F7 — KASSIR-TANLASH RO'YXATI (`GET /auth/pos-pin/candidates`).
 *
 * Mezon `openSessionFromSmena` bilan BITTA manba: smena-a'zolik
 * (`smenaEmployee`, faol smena). Do'kon/tashkilot bo'yicha ALOHIDA filtr
 * ATAYLAB yo'q — `openSessionFromSmena` ham smena tanlashda do'konni
 * tekshirmaydi (ombor kassirning sukutidan keladi); ikkinchi mezon kiritish
 * ikki manbaning jimgina ajralishiga olib kelardi.
 */
describe('PosLoginService.candidates (F7)', () => {
  const KIOSK_USER = {
    sub: 'emp-1',
    accountId: 'acc-1',
    email: 'kassir@demo.local',
    name: 'Kassir',
    username: null,
    hrRoles: [],
    isChecker: false,
    uiMode: 'kiosk' as const,
    hrPermissions: [],
  };

  it('smena a`zosi + PIN`li xodimlar qaytadi ({ cashiers: [{ employeeId, name }] })', async () => {
    const { svc } = makeDeps();
    const out = await svc.candidates(KIOSK_USER);
    expect(out).toEqual({ cashiers: [{ employeeId: 'emp-2', name: 'Boshqa Kassir' }] });
  });

  it('mezon: faqat PIN`li, arxivlanmagan, FAOL smenaga biriktirilganlar — o`z akkauntidan', async () => {
    const { svc, prisma } = makeDeps();
    await svc.candidates(KIOSK_USER);
    const where = prisma.client.employee.findMany.mock.calls[0]?.[0]?.where;
    // PIN'siz xodim QAYTMAYDI.
    expect(where.posPinHash).toEqual({ not: null });
    expect(where.archived).toBe(false);
    // Tenant chegarasi: boshqa akkaunt (do'kon) xodimi QAYTMAYDI — a'zolik
    // sharti ham smena orqali AYNAN shu akkauntga bog'langan.
    expect(where.accountId).toBe('acc-1');
    expect(where.smenaAssignments).toEqual({
      some: { smena: { accountId: 'acc-1', archived: false } },
    });
  });

  it('PIN yoki boshqa sir QAYTARILMAYDI — faqat id + name tanlanadi', async () => {
    const { svc, prisma } = makeDeps();
    const out = await svc.candidates(KIOSK_USER);
    expect(prisma.client.employee.findMany.mock.calls[0]?.[0]?.select).toEqual({
      id: true,
      name: true,
    });
    for (const c of out.cashiers) {
      expect(Object.keys(c).sort()).toEqual(['employeeId', 'name']);
    }
  });

  it('kiosk bo`lmagan so`rovda 403 (uiMode full)', async () => {
    const { svc, prisma } = makeDeps();
    await expect(svc.candidates({ ...KIOSK_USER, uiMode: 'full' as const })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // Rad etilganda ro'yxat umuman so'ralmaydi.
    expect(prisma.client.employee.findMany).not.toHaveBeenCalled();
  });

  it('uiMode YO`Q (eski token) ham 403 — kiosk opt-in, sukut ochiq emas', async () => {
    const { svc } = makeDeps();
    await expect(svc.candidates({ ...KIOSK_USER, uiMode: undefined })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
