import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from './auth.schema.js';
import { AuthService } from './auth.service.js';

/**
 * 🔴 TSD sessiyasi REFRESH'dan keyin ham cheklangan qoladimi (G-reja G5).
 *
 * Bu testning sababi konkret: `AuthService.refresh()` yangi access-JWT ni
 * XODIMDAN qayta quradi (rollar, hr-ruxsatlar). Ya'ni `deviceMode` da'vosi
 * tabiiy ravishda YO'QOLARDI va terminal sessiyasi 15 daqiqadan keyin
 * jimgina TO'LIQ ERP sessiyasiga aylanardi — cheklov o'z-o'zini yechardi.
 * Bog'lanish shuning uchun `refresh_tokens.tsd_device_id` da saqlanadi.
 */

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
  attributes: null,
  account: { plan: 'pro' },
  hrPermissions: [],
  roles: [{ role: { uiMode: 'full' } }],
};

function makeService(over: { tsdDeviceId?: string | null; device?: unknown } = {}) {
  const prisma = {
    client: { employee: { findUnique: vi.fn().mockResolvedValue(EMPLOYEE) } },
  };
  const tokens = {
    rotateRefreshToken: vi.fn().mockResolvedValue({
      raw: 'refresh-2',
      employeeId: 'emp-1',
      tsdDeviceId: over.tsdDeviceId ?? null,
    }),
    signAccessToken: vi.fn().mockReturnValue('access-2'),
    signMediaToken: vi.fn().mockReturnValue('media-2'),
  };
  const tsdDevices = {
    loadActive: vi
      .fn()
      .mockResolvedValue(
        over.device === undefined
          ? { id: 'tsd-1', accountId: 'acc-1', storeId: 'store-1', name: 'TSD-1' }
          : over.device,
      ),
  };
  const svc = new AuthService(prisma as never, tokens as never, tsdDevices as never);
  return { svc, tokens, tsdDevices };
}

describe('refresh — TSD cheklovi SAQLANADI', () => {
  it('qurilmaga bog`langan sessiya yangi tokenda ham `deviceMode: tsd`', async () => {
    const { svc, tokens } = makeService({ tsdDeviceId: 'tsd-1' });
    await svc.refresh('refresh-1', {});
    const signed = tokens.signAccessToken.mock.calls[0]?.[0] as AuthenticatedUser;
    expect(signed.deviceMode).toBe('tsd');
  });

  it('qurilma HALI HAM tirikligi tekshiriladi', async () => {
    const { svc, tsdDevices } = makeService({ tsdDeviceId: 'tsd-1' });
    await svc.refresh('refresh-1', {});
    expect(tsdDevices.loadActive).toHaveBeenCalledWith('tsd-1');
  });

  it('BEKOR QILINGAN qurilma → 401 (yo`qolgan terminal ≤15 daqiqada o`ladi)', async () => {
    const { svc } = makeService({ tsdDeviceId: 'tsd-1', device: null });
    await expect(svc.refresh('refresh-1', {})).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('qurilma BOSHQA akkauntga o`tib qolgan bo`lsa → 401', async () => {
    const { svc } = makeService({
      tsdDeviceId: 'tsd-1',
      device: { id: 'tsd-1', accountId: 'acc-2', storeId: 's', name: 'X' },
    });
    await expect(svc.refresh('refresh-1', {})).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('refresh — oddiy sessiyaga TEGILMAYDI', () => {
  it('qurilmaga bog`lanmagan sessiyada `deviceMode` yozilmaydi', async () => {
    const { svc, tokens, tsdDevices } = makeService({ tsdDeviceId: null });
    await svc.refresh('refresh-1', {});
    const signed = tokens.signAccessToken.mock.calls[0]?.[0] as AuthenticatedUser;
    expect(signed.deviceMode).toBeUndefined();
    // Ortiqcha so'rov ham qilinmaydi.
    expect(tsdDevices.loadActive).not.toHaveBeenCalled();
  });
});
