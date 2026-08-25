import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from './auth.schema.js';
import { TsdLoginSchema } from './auth.schema.js';
import { TsdLoginService } from './tsd-login.service.js';

const DEVICE_CTX = { id: 'tsd-1', accountId: 'acc-1', storeId: 'store-1', name: 'TSD-1' };

const EMPLOYEE = {
  id: 'emp-1',
  accountId: 'acc-1',
  email: 'omborchi@demo.local',
  name: 'Omborchi',
  position: 'Omborchi',
  username: null,
  hrRoles: [],
  isChecker: false,
  archived: false,
  lockedUntil: null,
  attributes: null,
  account: { plan: 'pro' },
  hrPermissions: [],
  roles: [{ role: { uiMode: 'full' } }],
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
  const svc = new TsdLoginService(
    prisma as never,
    tokens as never,
    devices as never,
    pins as never,
  );
  return { svc, devices, pins, prisma, tokens };
}

const INPUT = {
  deviceId: '11111111-1111-4111-8111-111111111111',
  deviceSecret: 'a'.repeat(64),
  pin: '1234',
};

describe('TsdLoginSchema — qurilma MAJBURIY', () => {
  it('kalitsiz so`rov RAD etiladi (kassadan asosiy farq)', () => {
    // `PosLoginSchema` da bu ixtiyoriy (egasi 2026-08-11). Qo'l terminali
    // yo'qolishi mumkin va uning zaxira yo'li yo'q ⇒ kalit majburiy.
    expect(TsdLoginSchema.safeParse({ pin: '1234' }).success).toBe(false);
  });

  it('noma`lum maydon 400 beradi (`.strict()`)', () => {
    expect(TsdLoginSchema.safeParse({ ...INPUT, cashDeskId: 'x' }).success).toBe(false);
  });

  it('PIN aynan 4 raqam', () => {
    expect(TsdLoginSchema.safeParse({ ...INPUT, pin: '12345' }).success).toBe(false);
    expect(TsdLoginSchema.safeParse(INPUT).success).toBe(true);
  });
});

describe('TsdLoginService.login', () => {
  it('tartib: avval QURILMA, keyin PIN', async () => {
    const { svc, devices, pins } = makeDeps();
    await svc.login(INPUT, {});
    expect(devices.verify).toHaveBeenCalledWith(INPUT.deviceId, INPUT.deviceSecret);
    // PIN qidiruvi QURILMA akkaunti ichida — global qidiruv ishlatilmaydi.
    expect(pins.findByPin).toHaveBeenCalledWith('acc-1', '1234');
    expect(pins.findByPinAnyAccount).not.toHaveBeenCalled();
  });

  it('token `deviceMode: tsd` bilan imzolanadi', async () => {
    const { svc, tokens } = makeDeps();
    await svc.login(INPUT, {});
    const signed = tokens.signAccessToken.mock.calls[0]?.[0] as AuthenticatedUser;
    expect(signed.deviceMode).toBe('tsd');
    expect(signed.sub).toBe('emp-1');
  });

  it('refresh-token QURILMAGA bog`lanadi', async () => {
    // Busiz cheklov birinchi refresh'da yo'qolardi (`auth.service.refresh`).
    const { svc, tokens } = makeDeps();
    await svc.login(INPUT, {});
    expect(tokens.createRefreshToken).toHaveBeenCalledWith('emp-1', {}, undefined, 'tsd-1');
  });

  it('javobda qurilma ombori qaytadi (kassa/tashkilot yo`q)', async () => {
    const { svc } = makeDeps();
    const out = await svc.login(INPUT, {});
    expect(out.device).toEqual({ id: 'tsd-1', name: 'TSD-1', storeId: 'store-1' });
  });

  it('javobdagi xodim kaliti `id` — parol/POS login bilan bir xil', async () => {
    // Ikki nom (`id` va `sub`) bo'lsa klient qaysi biri kelishini bilmasdi.
    const { svc } = makeDeps();
    const out = await svc.login(INPUT, {});
    expect(out.user.id).toBe('emp-1');
    expect(out.user).not.toHaveProperty('sub');
    // Narx/parol izlari javobga tushmaydi.
    expect(JSON.stringify(out.user)).not.toMatch(/pin|hash|price/i);
  });

  it('APK versiyasi qayd etiladi', async () => {
    const { svc, devices } = makeDeps();
    await svc.login({ ...INPUT, appVersion: '0.1.0' }, {});
    expect(devices.registerSuccess).toHaveBeenCalledWith('tsd-1', '0.1.0');
  });
});

describe('TsdLoginService.login — rad etish yo`llari', () => {
  it('PIN topilmasa 401 va qurilma hisoblagichi o`sadi', async () => {
    const { svc, devices } = makeDeps({ pin: { findByPin: vi.fn().mockResolvedValue(null) } });
    await expect(svc.login(INPUT, {})).rejects.toBeInstanceOf(UnauthorizedException);
    expect(devices.registerFailure).toHaveBeenCalledWith('tsd-1');
  });

  it('BOSHQA akkaunt xodimi bo`lsa 401 (tenant chegarasi)', async () => {
    const { svc, devices } = makeDeps({ employee: { ...EMPLOYEE, accountId: 'acc-2' } });
    await expect(svc.login(INPUT, {})).rejects.toBeInstanceOf(UnauthorizedException);
    expect(devices.registerFailure).toHaveBeenCalledWith('tsd-1');
  });

  it('arxivlangan/yo`q xodim — 401', async () => {
    const { svc } = makeDeps({ employee: null });
    await expect(svc.login(INPUT, {})).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('xodim kartasi kirishni taqiqlagan bo`lsa — 401 (umumiy qo`riqchi)', async () => {
    // `assertEmployeeMayLogin` — parol/PIN-login bilan AYNAN bir funksiya.
    const { svc } = makeDeps({
      employee: { ...EMPLOYEE, attributes: { __employee_system: { loginAllowed: false } } },
    });
    await expect(svc.login(INPUT, {})).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('hamma rad etish BIR XIL xabar beradi', async () => {
    const cases = [
      makeDeps({ pin: { findByPin: vi.fn().mockResolvedValue(null) } }),
      makeDeps({ employee: null }),
      makeDeps({ employee: { ...EMPLOYEE, accountId: 'acc-2' } }),
    ];
    const messages: string[] = [];
    for (const { svc } of cases) {
      const err = (await svc.login(INPUT, {}).catch((e: Error) => e)) as Error;
      messages.push(err.message);
    }
    expect(new Set(messages).size).toBe(1);
  });
});
