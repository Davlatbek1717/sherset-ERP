import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { decryptPassword, encryptPassword } from '../email/crypto.js';
import {
  EskizApiError,
  type EskizCredentials,
  eskizGetUser,
  eskizLogin,
  eskizSend,
} from './eskiz.client.js';
import {
  ListSmsLogsSchema,
  type SaveSmsConfigInput,
  SaveSmsConfigSchema,
  type SendSmsInput,
  SendSmsSchema,
} from './sms.schema.js';

interface PublicSmsConfig {
  id: string;
  provider: string;
  email: string;
  senderId: string | null;
  hasPassword: boolean;
  enabled: boolean;
  lastTestedAt: Date | null;
  lastTestOk: boolean | null;
  lastTestMsg: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * SmsService — per-account SMS config + enqueue path.
 *
 * Mirrors EmailService architecture (Sprint 17.4):
 *   - send() validates config + writes SmsLog row (status='pending').
 *   - SmsDeliveryService cron drains the queue, calls Eskiz/etc.
 *   - On 401, refreshes the cached token and retries once.
 *
 * Eskiz token lifetime ~30 days; we cache it on SmsConfig.token and
 * refresh lazily when the worker hits 401.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // --- config -----------------------------------------------------------

  async getConfig(accountId: string): Promise<PublicSmsConfig | null> {
    const row = await this.prisma.client.smsConfig.findUnique({ where: { accountId } });
    if (!row) return null;
    return this.publicView(row);
  }

  async saveConfig(accountId: string, raw: unknown): Promise<PublicSmsConfig> {
    const r = SaveSmsConfigSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    const parsed = r.data as SaveSmsConfigInput;
    const existing = await this.prisma.client.smsConfig.findUnique({ where: { accountId } });

    let passwordCipher: string | undefined;
    if (parsed.password && parsed.password.length > 0) {
      passwordCipher = encryptPassword(parsed.password);
    } else if (!existing) {
      throw new BadRequestException('Birinchi sozlash uchun parol majburiy');
    }

    const data = {
      accountId,
      provider: parsed.provider,
      email: parsed.email,
      senderId: parsed.senderId ?? null,
      ...(passwordCipher ? { passwordCipher } : {}),
      // Saving config invalidates last-test result.
      lastTestedAt: null,
      lastTestOk: null,
      lastTestMsg: null,
      // Force token refresh on next use (cleared so worker re-auths).
      token: null,
      tokenIssuedAt: null,
    };

    const saved = existing
      ? await this.prisma.client.smsConfig.update({ where: { accountId }, data })
      : await this.prisma.client.smsConfig.create({
          data: { ...data, passwordCipher: passwordCipher as string },
        });
    return this.publicView(saved);
  }

  async deleteConfig(accountId: string): Promise<{ ok: true }> {
    await this.prisma.client.smsConfig.deleteMany({ where: { accountId } });
    return { ok: true };
  }

  /**
   * Open an Eskiz session and check the user endpoint. Persists verdict.
   * Real credentials required — without them, returns ok=false with the
   * provider error and the settings UI shows it as a red badge.
   */
  async testConnection(accountId: string): Promise<{ ok: boolean; message: string }> {
    const cfg = await this.requireConfig(accountId);
    let ok = false;
    let message = '';
    try {
      const token = await eskizLogin(this.eskizCreds(cfg));
      const verify = await eskizGetUser(token);
      if (verify.ok) {
        ok = true;
        message = `Ulanish OK${verify.balance != null ? ` · balans: ${verify.balance}` : ''}`;
        // Cache the fresh token so the worker doesn't re-login.
        await this.prisma.client.smsConfig.update({
          where: { accountId },
          data: { token, tokenIssuedAt: new Date() },
        });
      } else {
        message = 'Token olindi, lekin /auth/user javob bermadi';
      }
    } catch (err) {
      message = (err as Error).message ?? 'Ulanish xatosi';
      this.logger.warn(`SMS connection test failed for account ${accountId}: ${message}`);
    }
    await this.prisma.client.smsConfig.update({
      where: { accountId },
      data: { lastTestedAt: new Date(), lastTestOk: ok, lastTestMsg: message.slice(0, 500) },
    });
    return { ok, message };
  }

  // --- send / queue -----------------------------------------------------

  async send(accountId: string, userId: string, raw: unknown) {
    const r = SendSmsSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    const parsed = r.data as SendSmsInput;

    const cfg = await this.prisma.client.smsConfig.findUnique({ where: { accountId } });
    if (!cfg || !cfg.enabled) {
      throw new BadRequestException(
        "SMS sozlanmagan — Sozlamalar > SMS bo'limida Eskiz hisobini qo'shing",
      );
    }

    const log = await this.prisma.client.smsLog.create({
      data: {
        accountId,
        senderId: userId,
        entity: parsed.entity ?? null,
        entityId: parsed.entityId ?? null,
        toPhone: parsed.toPhone,
        body: parsed.body,
        status: 'pending',
        attempt: 1,
        maxAttempts: 4,
        nextRetryAt: new Date(),
      },
    });
    return { id: log.id, status: 'pending' };
  }

  /**
   * Worker entry point — sends a single queued SMS. Re-auths Eskiz on
   * 401 and retries once before giving up. Throws on failure so the
   * worker can decide retry vs dead.
   */
  async sendQueuedNow(logId: string): Promise<{ providerMessageId: string }> {
    const log = await this.prisma.client.smsLog.findUnique({ where: { id: logId } });
    if (!log) throw new BadRequestException(`SmsLog ${logId} topilmadi`);

    const cfg = await this.prisma.client.smsConfig.findUnique({
      where: { accountId: log.accountId },
    });
    if (!cfg) throw new Error('SMS config missing');

    let token = cfg.token;
    if (!token) {
      token = await eskizLogin(this.eskizCreds(cfg));
      await this.prisma.client.smsConfig.update({
        where: { accountId: log.accountId },
        data: { token, tokenIssuedAt: new Date() },
      });
    }

    try {
      const result = await eskizSend(token, {
        mobilePhone: log.toPhone,
        message: log.body,
        from: cfg.senderId ?? undefined,
      });
      return { providerMessageId: result.id };
    } catch (err) {
      // 401 → token expired → re-auth + single retry
      if (err instanceof EskizApiError && err.status === 401) {
        const fresh = await eskizLogin(this.eskizCreds(cfg));
        await this.prisma.client.smsConfig.update({
          where: { accountId: log.accountId },
          data: { token: fresh, tokenIssuedAt: new Date() },
        });
        const result = await eskizSend(fresh, {
          mobilePhone: log.toPhone,
          message: log.body,
          from: cfg.senderId ?? undefined,
        });
        return { providerMessageId: result.id };
      }
      throw err;
    }
  }

  // --- log read ---------------------------------------------------------

  async listLogs(accountId: string, raw: unknown) {
    const filter = ListSmsLogsSchema.parse(raw);
    const items = await this.prisma.client.smsLog.findMany({
      where: {
        accountId,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.toPhone ? { toPhone: { contains: filter.toPhone } } : {}),
        ...(filter.entity ? { entity: filter.entity } : {}),
        ...(filter.entityId ? { entityId: filter.entityId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: filter.limit,
    });
    return { items };
  }

  async retryLog(accountId: string, logId: string) {
    const log = await this.prisma.client.smsLog.findFirst({
      where: { id: logId, accountId },
    });
    if (!log) throw new NotFoundException(`SmsLog ${logId} topilmadi`);
    if (log.status === 'sent') {
      throw new BadRequestException('Bu SMS muvaffaqiyatli yuborilgan');
    }
    return this.prisma.client.smsLog.update({
      where: { id: logId },
      data: {
        status: 'pending',
        attempt: 1,
        nextRetryAt: new Date(),
        attemptedAt: null,
        errorMsg: null,
      },
    });
  }

  // --- helpers ----------------------------------------------------------

  private async requireConfig(accountId: string) {
    const cfg = await this.prisma.client.smsConfig.findUnique({ where: { accountId } });
    if (!cfg) throw new NotFoundException('SMS sozlamalari topilmadi');
    return cfg;
  }

  private eskizCreds(cfg: { email: string; passwordCipher: string }): EskizCredentials {
    return {
      email: cfg.email,
      password: decryptPassword(cfg.passwordCipher),
    };
  }

  private publicView(row: {
    id: string;
    provider: string;
    email: string;
    senderId: string | null;
    passwordCipher: string;
    enabled: boolean;
    lastTestedAt: Date | null;
    lastTestOk: boolean | null;
    lastTestMsg: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): PublicSmsConfig {
    return {
      id: row.id,
      provider: row.provider,
      email: row.email,
      senderId: row.senderId,
      hasPassword: row.passwordCipher.length > 0,
      enabled: row.enabled,
      lastTestedAt: row.lastTestedAt,
      lastTestOk: row.lastTestOk,
      lastTestMsg: row.lastTestMsg,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
