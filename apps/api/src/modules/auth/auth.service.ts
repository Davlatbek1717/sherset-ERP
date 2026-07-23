import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service.js';
import { readEmployeeSystemAttrs } from '../hr/hr-employee/hr-employee.service.js';
import { isIpAllowed } from '../shared/ip-match.js';
import {
  type AuthenticatedUser,
  type LoginInput,
  type LoginResponse,
  LoginSchema,
} from './auth.schema.js';
import { TokenService } from './token.service.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TokenService) private readonly tokens: TokenService,
  ) {}

  /** Authenticate email+password; throws on bad creds; returns tokens. */
  async login(
    raw: unknown,
    meta: { userAgent?: string; ipAddress?: string },
  ): Promise<{ accessToken: string; refreshToken: string; user: LoginResponse['user'] }> {
    const parsed = this.parseLogin(raw);

    // The identifier may be an email OR a username. moysklad-style usernames
    // are «prefix@account» (owner 2026-07-19), so an «@» no longer means
    // email-only — match either field. A bare username can never collide with
    // an email (emails always carry @), so one OR-lookup covers both shapes.
    const employee = await this.prisma.client.employee.findFirst({
      where: {
        archived: false,
        OR: [{ email: parsed.identifier.toLowerCase() }, { username: parsed.identifier }],
      },
      include: {
        account: { select: { plan: true } },
        hrPermissions: { select: { pageKey: true, section: true, accessLevel: true } },
      },
    });

    if (!employee) {
      // Uniform timing: pretend-verify with dummy hash to avoid enumeration.
      await argon2
        .verify('$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzYWx0MTIzNDU$invalid', parsed.password)
        .catch(() => false);
      throw new UnauthorizedException("Email yoki parol noto'g'ri");
    }

    if (employee.lockedUntil && employee.lockedUntil > new Date()) {
      const remaining = Math.ceil((employee.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new UnauthorizedException(`Hisob vaqtincha bloklangan (${remaining} daqiqa qoldi)`);
    }

    // moysklad employee card guards: «Разрешить вход в систему» unchecked →
    // no login at all; «Сеть» allowlists (IPs/CIDR nets) → only from there.
    // Both live in attributes.__employee_system (no dedicated columns).
    const sysAttrs = readEmployeeSystemAttrs(employee.attributes);
    if (sysAttrs.loginAllowed === false) {
      // Same generic message as bad credentials — do not leak account state.
      throw new UnauthorizedException("Email yoki parol noto'g'ri");
    }
    if (!isIpAllowed(meta.ipAddress, sysAttrs.allowedIps, sysAttrs.allowedNetworks)) {
      throw new UnauthorizedException('Bu IP-manzildan kirish taqiqlangan');
    }

    const valid = employee.passwordHash
      ? await argon2.verify(employee.passwordHash, parsed.password).catch(() => false)
      : false;

    if (!valid) {
      const attempts = employee.failedLoginAttempts + 1;
      const locked = attempts >= MAX_FAILED_ATTEMPTS;
      await this.prisma.client.employee.update({
        where: { id: employee.id },
        data: {
          failedLoginAttempts: attempts,
          lockedUntil: locked ? new Date(Date.now() + LOCKOUT_MS) : null,
        },
      });
      throw new UnauthorizedException("Email yoki parol noto'g'ri");
    }

    // Success — reset counters, update last login
    await this.prisma.client.employee.update({
      where: { id: employee.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    const authUser: AuthenticatedUser = {
      sub: employee.id,
      accountId: employee.accountId,
      email: employee.email,
      name: employee.name,
      username: employee.username,
      hrRoles: employee.hrRoles,
      isChecker: employee.isChecker,
      hrPermissions: employee.hrPermissions.map((p) => ({
        pageKey: p.pageKey,
        section: p.section,
        accessLevel: p.accessLevel as 'full' | 'read' | 'own_only',
      })),
    };
    const accessToken = this.tokens.signAccessToken(authUser);
    const refreshToken = await this.tokens.createRefreshToken(employee.id, meta);

    return {
      accessToken,
      refreshToken,
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
        hrPermissions: authUser.hrPermissions,
      },
    };
  }

  async refresh(
    refreshTokenRaw: string,
    meta: { userAgent?: string; ipAddress?: string },
  ): Promise<{ accessToken: string; refreshToken: string; user: LoginResponse['user'] }> {
    const rotated = await this.tokens.rotateRefreshToken(refreshTokenRaw, meta);
    if (!rotated) throw new UnauthorizedException('Sessiya tugadi');

    const employee = await this.prisma.client.employee.findUnique({
      where: { id: rotated.employeeId },
      include: {
        account: { select: { plan: true } },
        hrPermissions: { select: { pageKey: true, section: true, accessLevel: true } },
      },
    });
    if (!employee || employee.archived) {
      throw new UnauthorizedException('Hisob mavjud emas');
    }

    // Same employee-card guards as login(): a session must die on refresh
    // once «Разрешить вход» is unchecked or the IP leaves the allowlist —
    // otherwise a live refresh token outlives the admin's restriction.
    const sysAttrs = readEmployeeSystemAttrs(employee.attributes);
    if (sysAttrs.loginAllowed === false) {
      throw new UnauthorizedException('Hisob mavjud emas');
    }
    if (!isIpAllowed(meta.ipAddress, sysAttrs.allowedIps, sysAttrs.allowedNetworks)) {
      throw new UnauthorizedException('Bu IP-manzildan kirish taqiqlangan');
    }

    const authUser: AuthenticatedUser = {
      sub: employee.id,
      accountId: employee.accountId,
      email: employee.email,
      name: employee.name,
      username: employee.username,
      hrRoles: employee.hrRoles,
      isChecker: employee.isChecker,
      hrPermissions: employee.hrPermissions.map((p) => ({
        pageKey: p.pageKey,
        section: p.section,
        accessLevel: p.accessLevel as 'full' | 'read' | 'own_only',
      })),
    };

    return {
      accessToken: this.tokens.signAccessToken(authUser),
      refreshToken: rotated.raw,
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
        hrPermissions: authUser.hrPermissions,
      },
    };
  }

  async logout(refreshTokenRaw: string | null): Promise<void> {
    if (refreshTokenRaw) {
      await this.tokens.revokeRefreshToken(refreshTokenRaw);
    }
  }

  async setPassword(employeeId: string, newPassword: string): Promise<void> {
    if (newPassword.length < 8) {
      throw new BadRequestException("Parol kamida 8 belgidan iborat bo'lishi kerak");
    }
    const hash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.prisma.client.employee.update({
      where: { id: employeeId },
      data: { passwordHash: hash, failedLoginAttempts: 0, lockedUntil: null },
    });
  }

  /**
   * Change own password — verifies the current one before setting the new.
   * Throws 401 on a wrong current password (uniform message; we deliberately
   * don't say which side was wrong).
   */
  async changePassword(
    employeeId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    const employee = await this.prisma.client.employee.findUnique({
      where: { id: employeeId },
      select: { passwordHash: true },
    });
    if (!employee?.passwordHash) {
      throw new UnauthorizedException('Joriy parol noto‘g‘ri');
    }
    const valid = await argon2.verify(employee.passwordHash, oldPassword).catch(() => false);
    if (!valid) {
      throw new UnauthorizedException('Joriy parol noto‘g‘ri');
    }
    await this.setPassword(employeeId, newPassword);
  }

  private parseLogin(raw: unknown): LoginInput {
    const parsed = LoginSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }
    return parsed.data;
  }
}
