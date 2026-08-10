import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser, LoginResponse, PosLoginInput } from './auth.schema.js';
import { assertEmployeeMayLogin } from './employee-login-guards.js';
import { resolveUiMode } from './kiosk-policy.js';
import { PosDeviceService } from './pos-device.service.js';
import { PosPinService } from './pos-pin.service.js';
import { TokenService } from './token.service.js';

/**
 * Har xato holatida BIR XIL xabar — PIN mavjudligi, xodim holati yoki akkaunt
 * chegarasi sizib chiqmasin. Farqli xabarlar hujumchiga «bu PIN kimningdir
 * PIN'i» degan ma'lumot berardi.
 */
const GENERIC = "PIN noto'g'ri";

/**
 * PIN-only kirish (kassa .exe).
 *
 * Tartib ATAYLAB shunday: avval QURILMA, keyin PIN. Aks holda juftlanmagan
 * qurilmadan ham PIN taxmin qilish mumkin bo'lardi va qurilma tekshiruvi
 * bezakka aylanardi.
 */
@Injectable()
export class PosLoginService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(PosDeviceService) private readonly devices: PosDeviceService,
    @Inject(PosPinService) private readonly pins: PosPinService,
  ) {}

  async login(
    input: PosLoginInput,
    meta: { userAgent?: string; ipAddress?: string },
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    mediaToken: string;
    user: LoginResponse['user'];
    device: {
      id: string;
      name: string;
      storeId: string;
      cashDeskId: string;
      organizationId: string;
    };
  }> {
    const device = await this.devices.verify(input.deviceId, input.deviceSecret);

    // Akkaunt qurilmadan keladi — PIN qidiruvi shu akkaunt ICHIDA bo'ladi
    // (`findByPin` izohi: pepper global, shuning uchun filtrsiz qidiruv begona
    // ijarachining qatoriga tushib, haqiqiy kassirni bloklardi).
    const found = await this.pins.findByPin(device.accountId, input.pin);
    if (!found) {
      await this.devices.registerFailure(device.id);
      throw new UnauthorizedException(GENERIC);
    }

    const employee = await this.prisma.client.employee.findFirst({
      where: { id: found.employeeId, archived: false },
      include: {
        account: { select: { plan: true } },
        hrPermissions: { select: { pageKey: true, section: true, accessLevel: true } },
        // Kiosk rejimi ERP rollaridan hisoblanadi (kassa TZ §3.1).
        roles: { select: { role: { select: { uiMode: true } } } },
      },
    });

    // Tenant chegarasi: PIN qidiruvi akkauntdan mustaqil (kassir kirishdan
    // oldin akkauntni ko'rsatmaydi), shuning uchun moslikni SHU YERDA
    // tekshiramiz — aks holda bir akkauntning PIN'i boshqasining kassasida
    // ishlab ketardi.
    if (!employee || employee.accountId !== device.accountId) {
      await this.devices.registerFailure(device.id);
      throw new UnauthorizedException(GENERIC);
    }

    // Parol-login bilan AYNAN bir xil qo'riqchilar (umumiy funksiya —
    // ikki kirish yo'li bir-biridan uzilib qolmasin).
    assertEmployeeMayLogin(employee, { ipAddress: meta.ipAddress, genericMessage: GENERIC });

    await this.prisma.client.employee.update({
      where: { id: employee.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await this.devices.registerSuccess(device.id);

    const authUser: AuthenticatedUser = {
      sub: employee.id,
      accountId: employee.accountId,
      email: employee.email,
      name: employee.name,
      username: employee.username,
      hrRoles: employee.hrRoles,
      isChecker: employee.isChecker,
      uiMode: resolveUiMode(employee.roles.map((r) => r.role)),
      hrPermissions: employee.hrPermissions.map((p) => ({
        pageKey: p.pageKey,
        section: p.section,
        accessLevel: p.accessLevel as 'full' | 'read' | 'own_only',
      })),
    };

    return {
      accessToken: this.tokens.signAccessToken(authUser),
      refreshToken: await this.tokens.createRefreshToken(employee.id, meta),
      mediaToken: this.tokens.signMediaToken(authUser),
      user: {
        id: employee.id,
        accountId: employee.accountId,
        email: employee.email,
        name: employee.name,
        position: employee.position,
        accountPlan: employee.account.plan,
        username: employee.username,
        hrRoles: employee.hrRoles,
        isChecker: employee.isChecker,
        uiMode: authUser.uiMode,
        hrPermissions: authUser.hrPermissions,
      },
      // Kassir smenani ochganda do'kon/kassa/tashkilotni qayta tanlamasin —
      // ular qurilmaga juftlash paytida muhrlangan.
      device: {
        id: device.id,
        name: device.name,
        storeId: device.storeId,
        cashDeskId: device.cashDeskId,
        organizationId: device.organizationId,
      },
    };
  }
}
