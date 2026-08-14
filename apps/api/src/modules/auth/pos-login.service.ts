import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser, LoginResponse, PosLoginInput } from './auth.schema.js';
import { PosSwitchSchema } from './auth.schema.js';
import { assertEmployeeMayLogin } from './employee-login-guards.js';
import { resolveUiMode } from './kiosk-policy.js';
import { type PosDeviceContext, PosDeviceService } from './pos-device.service.js';
import { PosPinService } from './pos-pin.service.js';
import { TokenService } from './token.service.js';

/**
 * Har xato holatida BIR XIL xabar — PIN mavjudligi, xodim holati yoki akkaunt
 * chegarasi sizib chiqmasin. Farqli xabarlar hujumchiga «bu PIN kimningdir
 * PIN'i» degan ma'lumot berardi.
 */
const GENERIC = "PIN noto'g'ri";

/**
 * Login-javob qurish uchun xodimdan kerak bo'ladigan kesim — `LOGIN_INCLUDE`
 * bilan yuklangan Prisma qatori shu shaklni qanoatlantiradi. Strukturaviy tip,
 * chunki `login()` va `switchCashier()` BITTA javob-quruvchini bo'lishadi
 * (nusxa ajralib ketmasin — `copy-paste-loses-a-branch` bug-klassi).
 */
interface LoginEmployee {
  id: string;
  accountId: string;
  email: string;
  name: string;
  position: string | null;
  username: string | null;
  hrRoles: string[];
  isChecker: boolean;
  account: { plan: string };
  hrPermissions: Array<{ pageKey: string; section: string | null; accessLevel: string }>;
  roles: Array<{ role: { uiMode: string | null } }>;
}

/** Ikkala kirish yo'li (login/switch) xodimni AYNAN bir xil kesimda yuklaydi. */
const LOGIN_INCLUDE = {
  account: { select: { plan: true } },
  hrPermissions: { select: { pageKey: true, section: true, accessLevel: true } },
  // Kiosk rejimi ERP rollaridan hisoblanadi (kassa TZ §3.1).
  roles: { select: { role: { select: { uiMode: true } } } },
} as const;

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
      id: string | null;
      name: string;
      storeId: string | null;
      cashDeskId: string | null;
      organizationId: string | null;
    };
  }> {
    // Qurilma kaliti IXTIYORIY (2026-08-11, egasining qarori — `auth.schema.ts`
    // dagi izoh). Berilsa avvalgi qattiq yo'l ishlaydi; berilmasa PIN o'zi
    // yetarli va akkaunt xodimning o'zidan aniqlanadi.
    const device =
      input.deviceId && input.deviceSecret
        ? await this.devices.verify(input.deviceId, input.deviceSecret)
        : null;

    // Qurilma bo'lsa akkaunt undan keladi va PIN qidiruvi shu akkaunt ICHIDA
    // bo'ladi (`findByPin` izohi). Bo'lmasa — global qidiruv, noaniqlikda rad.
    const found = device
      ? await this.pins.findByPin(device.accountId, input.pin)
      : await this.pins.findByPinAnyAccount(input.pin);
    if (!found) {
      if (device) await this.devices.registerFailure(device.id);
      throw new UnauthorizedException(GENERIC);
    }

    const employee = await this.prisma.client.employee.findFirst({
      where: { id: found.employeeId, archived: false },
      include: LOGIN_INCLUDE,
    });

    // Tenant chegarasi: PIN qidiruvi akkauntdan mustaqil (kassir kirishdan
    // oldin akkauntni ko'rsatmaydi), shuning uchun moslikni SHU YERDA
    // tekshiramiz — aks holda bir akkauntning PIN'i boshqasining kassasida
    // ishlab ketardi.
    if (!employee || (device && employee.accountId !== device.accountId)) {
      if (device) await this.devices.registerFailure(device.id);
      throw new UnauthorizedException(GENERIC);
    }

    // Parol-login bilan AYNAN bir xil qo'riqchilar (umumiy funksiya —
    // ikki kirish yo'li bir-biridan uzilib qolmasin).
    assertEmployeeMayLogin(employee, { ipAddress: meta.ipAddress, genericMessage: GENERIC });

    await this.prisma.client.employee.update({
      where: { id: employee.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    if (device) await this.devices.registerSuccess(device.id, input.shellVersion);

    return this.issueBundle(employee, device, meta);
  }

  /**
   * F7 — kassirni almashtirish (`POST /auth/pos-pin/switch`, spec §8).
   *
   * Tekshiruv TARTIBI reja shartnomasi (o'zgartirmang, testlar qulflagan):
   *  (1) kiosk-juftlik — qurilma kaliti berilsa `devices.verify` (pos-login
   *      bilan bir xil ixtiyoriylik, 2026-08-11 egasi qarori), berilmasa
   *      token `uiMode === 'kiosk'` (mavjud kiosk-belgisi, `KioskGuard` mezoni);
   *  (2) JORIY kassirning ochiq sessiyasi yo'q — bor bo'lsa 409 (almashinuv
   *      har doim TOZA nuqtada: avval smena yopiladi, spec §8.1);
   *  (3) target `candidates` mezonida (a'zolik/PIN/arxiv — BITTA where-shakl);
   *  (4) PIN — MAVJUD lockout hisoblagichi (`verifyPin`, 5 xato → 401 lockout),
   *      target xodimga nisbatan;
   *  (5) audit-yozuv (kim → kimga, qurilma, IP) — fail-closed: jurnal yozilmasa
   *      almashinuv ham bo'lmaydi (izsiz almashinuv bo'lishi mumkin emas).
   *
   * TOKEN-INVALIDATSIYA SEMANTIKASI (F8 shunga qaraydi): muvaffaqiyatda
   * joriy kassirning SHU QURILMADAGI refresh-tokeni (`ms_rt` cookie qiymati)
   * bekor qilinadi va cookie yangi kassirniki bilan USTIDAN yoziladi. Eski
   * kassirning access-JWT'i (≤15 daqiqa) va BOSHQA qurilmalardagi sessiyalari
   * tegilmaydi — bu ataylab: `revokeAllForEmployee` + deny-list floor xodimni
   * hamma joydan chiqarib yuborardi (u offboarding vositasi, almashinuv emas).
   */
  async switchCashier(
    user: AuthenticatedUser,
    raw: unknown,
    meta: { userAgent?: string; ipAddress?: string },
    oldRefreshToken: string | null,
  ): Promise<Awaited<ReturnType<PosLoginService['login']>>> {
    const input = PosSwitchSchema.parse(raw);

    // (1) Kiosk-juftlik. Tartib pos-login bilan bir xil: avval QURILMA.
    const device =
      input.deviceId && input.deviceSecret
        ? await this.devices.verify(input.deviceId, input.deviceSecret)
        : null;
    if (device && device.accountId !== user.accountId) {
      // Tenant chegarasi: begona akkauntning qurilma kaliti bilan bu hisobda
      // almashinuv qilib bo'lmaydi.
      throw new ForbiddenException('Kassir almashtirish faqat kassa rejimida');
    }
    if (!device && user.uiMode !== 'kiosk') {
      throw new ForbiddenException('Kassir almashtirish faqat kassa rejimida');
    }

    // (2) Joriy kassirning ochiq sessiyasi — smena yopilmasdan almashinuv yo'q.
    const open = await this.prisma.client.cashierSession.findFirst({
      where: { accountId: user.accountId, cashierId: user.sub, state: 'open' },
      select: { id: true, name: true },
    });
    if (open) {
      throw new ConflictException(
        `Avval smenani yoping — ochiq smena mavjud (${open.name ?? open.id})`,
      );
    }

    // (3) Target mezoni `candidates()` bilan BITTA (ro'yxatda ko'ringan har
    // kim almashina oladi, ko'rinmagan hech kim almashina olmaydi).
    const employee = await this.prisma.client.employee.findFirst({
      where: {
        id: input.employeeId,
        accountId: user.accountId,
        archived: false,
        posPinHash: { not: null },
        smenaAssignments: {
          some: { smena: { accountId: user.accountId, archived: false } },
        },
      },
      include: LOGIN_INCLUDE,
    });
    if (!employee) {
      throw new ForbiddenException('Bu xodim bu kassada ishlay olmaydi');
    }

    // Parol/PIN-login bilan AYNAN bir xil xodim-qo'riqchilari.
    assertEmployeeMayLogin(employee, { ipAddress: meta.ipAddress, genericMessage: GENERIC });

    // (4) PIN — mavjud lockout hisoblagichi (xato/lockout 401 shu yerdan otiladi).
    await this.pins.verifyPin(user.accountId, employee.id, input.pin);

    // (5) Audit — fail-closed (best-effort EMAS: auth-amal izsiz qolmasin).
    await this.prisma.client.auditLog.create({
      data: {
        accountId: user.accountId,
        userId: user.sub,
        entity: 'employee',
        entityId: employee.id,
        action: 'pos-cashier-switch',
        context: {
          from: user.sub,
          to: employee.id,
          deviceId: device?.id ?? null,
          ip: meta.ipAddress ?? null,
          userAgent: meta.userAgent ?? null,
        },
      },
    });

    // Eski kassirning shu-qurilma refresh-zanjiri o'ladi (cookie baribir
    // ustidan yoziladi, lekin DB'dagi qator ham tirik qolmasin).
    if (oldRefreshToken) await this.tokens.revokeRefreshToken(oldRefreshToken);

    await this.prisma.client.employee.update({
      where: { id: employee.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    if (device) await this.devices.registerSuccess(device.id);

    return this.issueBundle(employee, device, meta);
  }

  /**
   * Muvaffaqiyatli autentifikatsiyadan keyingi YAGONA javob-quruvchi —
   * `login()` va `switchCashier()` shuni bo'lishadi, javob shakli hech qachon
   * ikkiga ajralmaydi (F8 auth-store ikkalasini bir xil qabul qiladi).
   */
  private async issueBundle(
    employee: LoginEmployee,
    device: PosDeviceContext | null,
    meta: { userAgent?: string; ipAddress?: string },
  ) {
    // Qurilmasiz kirishda do'kon/kassa/tashkilot hisobning SUKUT qiymatlaridan
    // olinadi — kassirdan tanlash SO'RALMAYDI (egasining talabi). Bittasi
    // topilmasa `null` qaytadi: smena ochilishida server o'zi ham shu tartibda
    // aniqlaydi (`smena.service.ts` — eng eski arxivlanmagan yozuv).
    const fallback = device ? null : await this.resolveAccountDefaults(employee.accountId);

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
      // qurilma bo'lsa juftlashda muhrlangan, bo'lmasa hisob sukutlaridan.
      device: {
        id: device?.id ?? null,
        name: device?.name ?? 'Kassa',
        storeId: device?.storeId ?? fallback?.storeId ?? null,
        cashDeskId: device?.cashDeskId ?? fallback?.cashDeskId ?? null,
        organizationId: device?.organizationId ?? fallback?.organizationId ?? null,
      },
    };
  }

  /**
   * F7 — kassir-tanlash ro'yxati (`GET /auth/pos-pin/candidates`).
   *
   * Mezon `openSessionFromSmena` (smena.service.ts) bilan BITTA manba:
   * faol (arxivlanmagan) smenaga biriktirilgan (`smenaEmployee`), PIN
   * o'rnatgan, arxivlanmagan xodimlar — so'rovchining o'z akkauntidan.
   * Do'kon/tashkilot bo'yicha QO'SHIMCHA filtr ataylab yo'q:
   * `openSessionFromSmena` ham smena ochishda do'konni a'zolikdan tashqari
   * tekshirmaydi (ombor kassir sukutidan keladi) — ikkinchi mezon shu yerda
   * paydo bo'lsa, ikki ro'yxat jimgina ajralib ketardi.
   *
   * PIN yoki boshqa sir QAYTARILMAYDI — faqat `employeeId` + `name`.
   *
   * Kiosk sharti: faqat `uiMode === 'kiosk'` token (mavjud kiosk-aniqlash —
   * `KioskGuard` bilan bir mezon). GET so'rovda qurilma kalitini xavfsiz
   * uzatib bo'lmaydi (query-string logga tushadi), shuning uchun bu yerda
   * qurilma-muqobili yo'q; to'liq-rejim foydalanuvchi oddiy login ishlatadi.
   */
  async candidates(
    user: AuthenticatedUser,
  ): Promise<{ cashiers: Array<{ employeeId: string; name: string }> }> {
    if (user.uiMode !== 'kiosk') {
      throw new ForbiddenException('Kassir almashtirish faqat kassa rejimida');
    }
    const rows = await this.prisma.client.employee.findMany({
      where: {
        accountId: user.accountId,
        archived: false,
        posPinHash: { not: null },
        smenaAssignments: {
          some: { smena: { accountId: user.accountId, archived: false } },
        },
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return { cashiers: rows.map((r) => ({ employeeId: r.id, name: r.name })) };
  }

  /**
   * Hisobning sukut do'kon/kassa/tashkiloti — eng eski arxivlanmagan yozuv.
   *
   * AYNAN shu tartib `smena.service.ts` dagi smena ochish mantiqi bilan bir xil
   * bo'lishi shart: aks holda kirishda bir do'kon, smenada boshqasi ko'rinib,
   * kassir qaysi omborga sotayotganini bilmay qolardi.
   */
  private async resolveAccountDefaults(accountId: string) {
    const [store, cashDesk, organization] = await Promise.all([
      this.prisma.client.store.findFirst({
        where: { accountId, archived: false },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      }),
      this.prisma.client.cashDesk.findFirst({
        where: { accountId, archived: false },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      }),
      this.prisma.client.organization.findFirst({
        where: { accountId, archived: false },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      }),
    ]);
    return {
      storeId: store?.id ?? null,
      cashDeskId: cashDesk?.id ?? null,
      organizationId: organization?.id ?? null,
    };
  }
}
