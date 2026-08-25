import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser, TsdLoginInput } from './auth.schema.js';
import { assertEmployeeMayLogin } from './employee-login-guards.js';
import { resolveUiMode } from './kiosk-policy.js';
import { PosPinService } from './pos-pin.service.js';
import { TokenService } from './token.service.js';
import { TsdDeviceService } from './tsd-device.service.js';
import { DEVICE_MODE_TSD } from './tsd-policy.js';

/**
 * Har xato holatida BIR XIL xabar — `PosLoginService` bilan aynan bir sabab:
 * farqli xabar hujumchiga «bu PIN kimningdir PIN'i» degan ma'lumot berardi.
 */
const GENERIC = "PIN noto'g'ri";

/** Login-javob qurish uchun kerak bo'ladigan xodim kesimi. */
const LOGIN_INCLUDE = {
  account: { select: { plan: true } },
  hrPermissions: { select: { pageKey: true, section: true, accessLevel: true } },
  roles: { select: { role: { select: { uiMode: true } } } },
} as const;

/**
 * TSD kirishi — qurilma kaliti + PIN (G-reja G5).
 *
 * Tartib `PosLoginService` bilan bir xil: avval QURILMA, keyin PIN. Aks holda
 * juftlanmagan qurilmadan ham PIN taxmin qilish mumkin bo'lardi.
 *
 * 🔴 KASSADAN IKKI FARQ:
 *  1. **Qurilma MAJBURIY** (`TsdLoginSchema` izohi) — kassadagi «kalitsiz ham
 *     bo'ladi» yengilligi bu yerda YO'Q.
 *  2. **Sessiya `deviceMode: 'tsd'` bilan muhrlanadi** va refresh qatoriga
 *     qurilma yoziladi, ya'ni cheklov refresh'dan keyin ham qoladi.
 *
 * Bu servis kassaga UMUMAN tegmaydi: `pos_devices` o'qilmaydi, smena/kassa
 * yaratilmaydi, `PosLoginService` fayli o'zgarmagan.
 */
@Injectable()
export class TsdLoginService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(TsdDeviceService) private readonly devices: TsdDeviceService,
    @Inject(PosPinService) private readonly pins: PosPinService,
  ) {}

  async login(
    input: TsdLoginInput,
    meta: { userAgent?: string; ipAddress?: string },
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    mediaToken: string;
    user: {
      id: string;
      accountId: string;
      email: string;
      name: string;
      position: string | null;
      accountPlan: string;
      deviceMode: 'tsd';
    };
    device: { id: string; name: string; storeId: string };
  }> {
    // (1) Qurilma. Xato/qulf holatlari shu yerdan otiladi (401/423).
    const device = await this.devices.verify(input.deviceId, input.deviceSecret);

    // (2) PIN — QURILMA AKKAUNTI ichida. Global qidiruv (`findByPinAnyAccount`)
    // ATAYLAB ishlatilmaydi: qurilma majburiy bo'lgani uchun akkaunt allaqachon
    // ma'lum va qidiruvni torroq qilish ijobiy.
    const found = await this.pins.findByPin(device.accountId, input.pin);
    if (!found) {
      await this.devices.registerFailure(device.id);
      throw new UnauthorizedException(GENERIC);
    }

    const employee = await this.prisma.client.employee.findFirst({
      where: { id: found.employeeId, archived: false },
      include: LOGIN_INCLUDE,
    });
    // Tenant chegarasi — bir akkauntning PIN'i boshqasining terminalida
    // ishlab ketmasin.
    if (!employee || employee.accountId !== device.accountId) {
      await this.devices.registerFailure(device.id);
      throw new UnauthorizedException(GENERIC);
    }

    // Parol/PIN-login bilan AYNAN bir xil xodim-qo'riqchilari (umumiy funksiya).
    assertEmployeeMayLogin(employee, { ipAddress: meta.ipAddress, genericMessage: GENERIC });

    await this.prisma.client.employee.update({
      where: { id: employee.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await this.devices.registerSuccess(device.id, input.appVersion);

    const authUser: AuthenticatedUser = {
      sub: employee.id,
      accountId: employee.accountId,
      email: employee.email,
      name: employee.name,
      username: employee.username,
      hrRoles: employee.hrRoles,
      isChecker: employee.isChecker,
      uiMode: resolveUiMode(employee.roles.map((r) => r.role)),
      // 🔴 Sessiya belgisi — `TsdGuard` shuni o'qiydi.
      deviceMode: DEVICE_MODE_TSD,
      hrPermissions: employee.hrPermissions.map((p) => ({
        pageKey: p.pageKey,
        section: p.section,
        accessLevel: p.accessLevel as 'full' | 'read' | 'own_only',
      })),
    };

    return {
      accessToken: this.tokens.signAccessToken(authUser),
      // Qurilma refresh QATORIGA yoziladi — cheklov rotatsiyadan keyin ham
      // qoladi (`auth.service.refresh`).
      refreshToken: await this.tokens.createRefreshToken(employee.id, meta, undefined, device.id),
      mediaToken: this.tokens.signMediaToken(authUser),
      // Javob shakli parol/POS login bilan bir xil kalitni ishlatadi (`id`,
      // `sub` EMAS) — klient ikki nomni bilib yurmasin.
      user: {
        id: employee.id,
        accountId: employee.accountId,
        email: employee.email,
        name: employee.name,
        position: employee.position,
        accountPlan: employee.account.plan,
        deviceMode: DEVICE_MODE_TSD,
      },
      device: { id: device.id, name: device.name, storeId: device.storeId },
    };
  }
}
