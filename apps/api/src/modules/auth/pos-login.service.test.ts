import { UnauthorizedException } from '@nestjs/common';
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
    ...((over.pin as object) ?? {}),
  };
  const prisma = {
    client: {
      employee: {
        findFirst: vi
          .fn()
          .mockResolvedValue(over.employee === undefined ? EMPLOYEE : over.employee),
        update: vi.fn().mockResolvedValue(EMPLOYEE),
      },
    },
  };
  const tokens = {
    signAccessToken: vi.fn().mockReturnValue('access-jwt'),
    createRefreshToken: vi.fn().mockResolvedValue('refresh-raw'),
    signMediaToken: vi.fn().mockReturnValue('media-jwt'),
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
    expect(devices.registerSuccess).toHaveBeenCalledWith('dev-1');
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
