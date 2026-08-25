import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import {
  type AuthenticatedUser,
  ChangePasswordSchema,
  PairPosDeviceSchema,
  PairTsdDeviceSchema,
  PosLoginSchema,
  SetEmployeePosPinSchema,
  SetPosPinSchema,
  TsdLoginSchema,
  UpdateMeSchema,
} from './auth.schema.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { MEDIA_TOKEN_COOKIE, MEDIA_TOKEN_TTL_SEC } from './media-token.js';
import { PosDeviceService } from './pos-device.service.js';
import { PosLoginService } from './pos-login.service.js';
import { PosPinService } from './pos-pin.service.js';
import { TsdDeviceService } from './tsd-device.service.js';
import { TsdLoginService } from './tsd-login.service.js';

const REFRESH_COOKIE = 'ms_rt';
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/api/v1/auth',
  maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
};

/**
 * Faza Q13 — media cookie. `path` refresh cookie'dan KENGROQ (`/api/v1`),
 * chunki media yo'llari to'rt xil modulda (`/images`, `/attachments`,
 * `/hr/employees`, `/purchase-orders`) — bitta cookie ularning hammasini
 * qoplashi kerak. Kengaytirilgan path xavf tug'dirmaydi: token faqat
 * `extract-token.ts` dagi 4 media regexida qabul qilinadi va u umuman
 * boshqa (hosila) kalit bilan imzolangan ⇒ access-token o'rnida yaramaydi.
 * `sameSite: strict` — cross-site `<img>`/navigatsiya cookie'ni yubormaydi.
 */
const MEDIA_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/api/v1',
  maxAge: MEDIA_TOKEN_TTL_SEC,
};

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PosPinService) private readonly posPin: PosPinService,
    @Inject(PosLoginService) private readonly posLogin: PosLoginService,
    @Inject(PosDeviceService) private readonly posDevices: PosDeviceService,
    @Inject(TsdLoginService) private readonly tsdLogin: TsdLoginService,
    @Inject(TsdDeviceService) private readonly tsdDevices: TsdDeviceService,
  ) {}

  @Post('login')
  async login(
    @Body() body: unknown,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const meta = {
      userAgent: req.headers['user-agent'],
      ipAddress: (req.headers['x-forwarded-for'] as string | undefined) ?? req.ip,
    };
    const { accessToken, refreshToken, mediaToken, user } = await this.auth.login(body, meta);
    res.setCookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTS);
    res.setCookie(MEDIA_TOKEN_COOKIE, mediaToken, MEDIA_COOKIE_OPTS);
    return { accessToken, user };
  }

  @Post('refresh')
  async refresh(@Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    const rt = req.cookies?.[REFRESH_COOKIE];
    if (!rt) throw new UnauthorizedException('Sessiya topilmadi');

    const meta = {
      userAgent: req.headers['user-agent'],
      ipAddress: (req.headers['x-forwarded-for'] as string | undefined) ?? req.ip,
    };
    const { accessToken, refreshToken, mediaToken, user } = await this.auth.refresh(rt, meta);
    res.setCookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTS);
    // Media cookie HAR refresh'da yangilanadi — access-JWT (15 daqiqa) bilan
    // birga aylanadi, shuning uchun 60 daqiqalik TTL amalda tugamaydi.
    res.setCookie(MEDIA_TOKEN_COOKIE, mediaToken, MEDIA_COOKIE_OPTS);
    return { accessToken, user };
  }

  @Post('logout')
  async logout(@Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    const rt = req.cookies?.[REFRESH_COOKIE];
    await this.auth.logout(rt ?? null);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    res.clearCookie(MEDIA_TOKEN_COOKIE, { path: '/api/v1' });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthenticatedUser) {
    const employee = await this.prisma.client.employee.findUnique({
      where: { id: user.sub },
      select: {
        id: true,
        accountId: true,
        email: true,
        name: true,
        fullName: true,
        firstName: true,
        lastName: true,
        position: true,
        phone: true,
        username: true,
        archived: true,
        lastLoginAt: true,
        groupId: true,
      },
    });
    if (!employee) throw new UnauthorizedException();
    // «Отдел» (department) — Employee.groupId is a raw FK (no Prisma relation here), so
    // resolve its name separately. Create forms («Доступ» section) pre-fill the new
    // record's owner = this user + department = this group, matching moysklad's defaults.
    const group = employee.groupId
      ? await this.prisma.client.group.findUnique({
          where: { id: employee.groupId },
          select: { id: true, name: true },
        })
      : null;
    return { ...employee, group };
  }

  /**
   * Self-update — only fullName + phone. Anything more sensitive (email,
   * username, position, roles, archived) requires admin permission via
   * /analitika/staff. JWT-only, no special RBAC needed.
   */
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateMe(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const parsed = UpdateMeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    }
    const data: { fullName?: string | null; phone?: string | null } = {};
    if (parsed.data.fullName !== undefined) data.fullName = parsed.data.fullName ?? null;
    if (parsed.data.phone !== undefined) data.phone = parsed.data.phone ?? null;
    // Bump-only optimistic lock: fullName/phone are ALSO editable from the two
    // admin forms (/hr/employees, /analitika/staff), so a self-profile edit must
    // bump the version — otherwise an admin with a stale edit-form open could
    // silently clobber the user's just-changed phone. We do NOT version-check
    // here (no `version` in the WHERE): /auth/me is a core auth endpoint kept
    // contract-stable, and a self-profile edit is single-user / low-conflict.
    await this.prisma.client.employee.update({
      where: { id: user.sub },
      data: { ...data, version: { increment: 1 } },
    });
    return this.me(user);
  }

  /** Change own password — verifies current, sets new. Requires JWT. */
  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const r = ChangePasswordSchema.safeParse(body);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    await this.auth.changePassword(user.sub, r.data.oldPassword, r.data.newPassword);
    return { ok: true };
  }

  // ── POS PIN-qulf (kassa TZ §3.2) ──────────────────────────────────────────

  /** PIN o'rnatilganmi — FE qulf ekranini shunga qarab ko'rsatadi. */
  @UseGuards(JwtAuthGuard)
  @Get('pos-pin')
  hasPosPin(@CurrentUser() user: AuthenticatedUser) {
    return this.posPin.hasPin(user.accountId, user.sub);
  }

  /** PIN o'rnatish / almashtirish (AYNAN 4 raqam). */
  @UseGuards(JwtAuthGuard)
  @Post('pos-pin')
  setPosPin(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { pin } = SetPosPinSchema.parse(body);
    return this.posPin.setPin(user.accountId, user.sub, pin);
  }

  /**
   * ADMIN boshqa xodimga PIN qo'yadi / o'chiradi (2026-08-11).
   *
   * 🔴 NEGA KERAK: yuqoridagi `POST pos-pin` FAQAT o'ziga ishlaydi (`user.sub`),
   * kassir esa kiosk rejimida — u sozlamalarga umuman kira olmaydi. Natijada
   * yangi kassir qo'shilganda PIN qo'yadigan joy HECH QAYERDA yo'q edi va PIN
   * faqat ops-skript bilan yozilardi (egasi 2026-08-11 da aynan shunga urildi).
   *
   * `employee.update` — parol tiklash bilan bir xil daraja: PIN kassa hisobiga
   * kirish yo'li, ya'ni xodim boshqaruvi amali.
   *
   * `pin: null` → PIN o'chiriladi (xodim ketganda kirish yo'li yopilsin).
   */
  // 🔴 Dekorator TARTIBI: marshrut (`@Post`) BIRINCHI. `pos-endpoint-guards`
  // qo'riqchisi blokni `@Post(...)` qatoridan metod imzosigacha o'qiydi —
  // undan yuqorida turgan `@UseGuards`/`@RequirePermission` ni KO'RMAYDI va
  // himoyalangan endpoint «qo'riqchisiz» bo'lib ko'rinardi (aksincha emas,
  // ya'ni test yolg'on qizarardi). `pos-device/pair` ham shu tartibda.
  @Post('pos-pin/employee/:employeeId')
  @UseGuards(JwtAuthGuard)
  @RequirePermission({ entity: 'employee', action: 'update' })
  setEmployeePosPin(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Body() body: unknown,
  ) {
    const { pin } = SetEmployeePosPinSchema.parse(body);
    return pin === null
      ? this.posPin.clearPin(user.accountId, employeeId)
      : this.posPin.setPin(user.accountId, employeeId, pin);
  }

  /** Xodimda PIN bormi (admin ko'rinishi) — qiymat hech qachon qaytmaydi. */
  @Get('pos-pin/employee/:employeeId')
  @UseGuards(JwtAuthGuard)
  @RequirePermission({ entity: 'employee', action: 'view' })
  hasEmployeePosPin(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
  ) {
    return this.posPin.hasPin(user.accountId, employeeId);
  }

  /**
   * F7 — kassir-tanlash ro'yxati (ko'p-kassir, spec §8).
   *
   * Shu akkauntning faol smenalariga biriktirilgan, PIN o'rnatgan xodimlar —
   * sir QAYTARILMAYDI. Kiosk sharti (`uiMode==='kiosk'`) servisda: bu GET
   * qurilma kalitini xavfsiz olib yura olmaydi (query-string logga tushadi),
   * shuning uchun kiosk-belgisi sifatida token da'vosi ishlatiladi.
   */
  @Get('pos-pin/candidates')
  @UseGuards(JwtAuthGuard)
  posPinCandidates(@CurrentUser() user: AuthenticatedUser) {
    return this.posLogin.candidates(user);
  }

  /**
   * F7 — kassirni almashtirish (ko'p-kassir, spec §8).
   *
   * Tekshiruvlar servisda (kiosk-juftlik · ochiq sessiya 409 · a'zolik ·
   * PIN lockout · audit). Cookie'lar va javob shakli `pos-login` bilan
   * AYNAN bir xil — F8 javobni auth-store'ga to'g'ridan-to'g'ri beradi.
   * Joriy refresh-cookie servisga uzatiladi va u yerda BEKOR qilinadi
   * (eski kassirning shu-qurilma zanjiri o'lsin), keyin ustidan yangisi
   * yoziladi.
   */
  @Post('pos-pin/switch')
  @UseGuards(JwtAuthGuard)
  async switchPosCashier(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const meta = {
      userAgent: req.headers['user-agent'],
      ipAddress: (req.headers['x-forwarded-for'] as string | undefined) ?? req.ip,
    };
    const oldRefreshToken = req.cookies?.[REFRESH_COOKIE] ?? null;
    const {
      accessToken,
      refreshToken,
      mediaToken,
      user: switchedUser,
      device,
    } = await this.posLogin.switchCashier(user, body, meta, oldRefreshToken);
    res.setCookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTS);
    res.setCookie(MEDIA_TOKEN_COOKIE, mediaToken, MEDIA_COOKIE_OPTS);
    return { accessToken, user: switchedUser, device };
  }

  /**
   * Qulfni ochish. Ketma-ket 5 xato → 401 `lockout: true` (FE to'liq chiqaradi).
   * Bu QAYTA LOGIN emas: to'g'ri PIN'da savat saqlanib qoladi.
   */
  @UseGuards(JwtAuthGuard)
  @Post('pos-pin/verify')
  verifyPosPin(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { pin } = SetPosPinSchema.parse(body);
    return this.posPin.verifyPin(user.accountId, user.sub, pin);
  }

  // ── PIN-only KIRISH (kassa .exe) ──────────────────────────────────────────
  // Yuqoridagi `pos-pin/verify` dan farqi: u ochiq sessiyani qulfdan chiqaradi
  // (JWT talab qiladi, savat saqlanadi), bu esa YANGI sessiya beradi.

  /**
   * Kassa qurilmasidan PIN bilan kirish — tokensiz.
   *
   * Qurilma kaliti «kim so'rayapti» savoliga javob beradi, PIN esa «qaysi
   * kassir». Cookie'lar parol-login bilan AYNAN bir xil qo'yiladi, shuning
   * uchun refresh/logout/media yo'llari o'zgarmaydi.
   */
  @Post('pos-login')
  async posLoginHandler(
    @Body() body: unknown,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const input = PosLoginSchema.parse(body);
    const meta = {
      userAgent: req.headers['user-agent'],
      ipAddress: (req.headers['x-forwarded-for'] as string | undefined) ?? req.ip,
    };
    const { accessToken, refreshToken, mediaToken, user, device } = await this.posLogin.login(
      input,
      meta,
    );
    res.setCookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTS);
    res.setCookie(MEDIA_TOKEN_COOKIE, mediaToken, MEDIA_COOKIE_OPTS);
    return { accessToken, user, device };
  }

  /**
   * Qurilmani do'kon/kassa/tashkilotga bog'lash. Kalit FAQAT shu javobda
   * qaytadi — keyin bazada faqat argon2 xeshi qoladi.
   *
   * 🔴 RUXSAT DEKORATORI TANLOVI: bu yerda `@RequirePermission` ishlatiladi,
   * `@RequireHrPermission` EMAS. Sabab — `PermissionsGuard` global `APP_GUARD`
   * (permissions.module.ts), `HrPermissionGuard` esa har controllerda qo'lda
   * ulanadi va bu controllerda ulanmagan. HR dekoratori qo'yilsa u jimgina
   * BEZAK bo'lib qolardi: istalgan kirgan foydalanuvchi (kiosk kassiri ham)
   * qurilma juftlay olardi. Qo'riqchi: `pos-endpoint-guards.test.ts`.
   *
   * `employee`+`update` tanlandi: qurilma juftlash kassaga kirish yo'lini
   * ochadi, ya'ni xodim boshqaruvi darajasidagi amal.
   */
  @Post('pos-device/pair')
  @UseGuards(JwtAuthGuard)
  @RequirePermission({ entity: 'employee', action: 'update' })
  async pairPosDevice(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const input = PairPosDeviceSchema.parse(body);
    return this.posDevices.pair(user.accountId, user.sub, input);
  }

  // ── TSD (omborchi qo'l terminali) — G-reja G5 ─────────────────────────────

  /**
   * Terminaldan kirish — qurilma kaliti + PIN, tokensiz.
   *
   * Kassa (`pos-login`) dan farqi: kalit MAJBURIY (`TsdLoginSchema` izohi) va
   * sessiya `deviceMode: 'tsd'` bilan muhrlanib, `TsdGuard` uni tor marshrut
   * ro'yxatiga qamaydi.
   *
   * Cookie'lar parol-login bilan AYNAN bir xil qo'yiladi — refresh/logout
   * yo'llari o'zgarmaydi. (Android klienti cookie'ni saqlaydi; `mediaToken`
   * unga kerak emas, lekin javob shakli ajralib ketmasin.)
   */
  @Post('tsd-login')
  async tsdLoginHandler(
    @Body() body: unknown,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const input = TsdLoginSchema.parse(body);
    const meta = {
      userAgent: req.headers['user-agent'],
      ipAddress: (req.headers['x-forwarded-for'] as string | undefined) ?? req.ip,
    };
    const { accessToken, refreshToken, mediaToken, user, device } = await this.tsdLogin.login(
      input,
      meta,
    );
    res.setCookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTS);
    res.setCookie(MEDIA_TOKEN_COOKIE, mediaToken, MEDIA_COOKIE_OPTS);
    // 🔴 Refresh-token JAVOBDA ham qaytadi (kassadan farq). Sabab: Android
    // klienti brauzer emas — cookie idorasi OkHttp'da o'z-o'zidan yo'q va
    // ilova tokenni shifrlangan holda o'zi saqlaydi. Cookie ham qo'yiladi
    // (kelajakdagi WebView qobig'i uchun), lekin ilova tanani o'qiydi.
    return { accessToken, refreshToken, user, device };
  }

  /**
   * Terminalni omborga bog'lash. Kalit FAQAT shu javobda qaytadi.
   *
   * 🔴 `@RequirePermission` (HR dekoratori EMAS) — `pairPosDevice` izohidagi
   * bilan aynan bir sabab: `PermissionsGuard` global, `HrPermissionGuard` esa
   * bu controllerda ulanmagan va HR dekoratori jimgina BEZAK bo'lib qolardi.
   * Qo'riqchi: `pos-endpoint-guards.test.ts`.
   */
  @Post('tsd-device/pair')
  @UseGuards(JwtAuthGuard)
  @RequirePermission({ entity: 'employee', action: 'update' })
  async pairTsdDevice(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const input = PairTsdDeviceSchema.parse(body);
    return this.tsdDevices.pair(user.accountId, user.sub, input);
  }
}
