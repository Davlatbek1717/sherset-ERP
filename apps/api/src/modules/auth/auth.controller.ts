import {
  Body,
  Controller,
  Get,
  Inject,
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
import { type AuthenticatedUser, ChangePasswordSchema, UpdateMeSchema } from './auth.schema.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

const REFRESH_COOKIE = 'ms_rt';
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/api/v1/auth',
  maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
};

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
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
    const { accessToken, refreshToken, user } = await this.auth.login(body, meta);
    res.setCookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTS);
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
    const { accessToken, refreshToken, user } = await this.auth.refresh(rt, meta);
    res.setCookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTS);
    return { accessToken, user };
  }

  @Post('logout')
  async logout(@Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    const rt = req.cookies?.[REFRESH_COOKIE];
    await this.auth.logout(rt ?? null);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
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
}
