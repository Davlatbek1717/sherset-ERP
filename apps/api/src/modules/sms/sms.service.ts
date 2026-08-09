import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { decryptPassword, encryptPassword } from '../email/crypto.js';
import { OUTBOX_SENDING } from '../shared/outbox-claim.js';
import {
  EskizApiError,
  type EskizCredentials,
  eskizGetUser,
  eskizLogin,
  eskizSend,
} from './eskiz.client.js';
import {
  type PhoneGatewayCredentials,
  phoneGatewayCheck,
  phoneGatewaySend,
} from './phone-gateway.client.js';
import { DEFAULT_MESSAGING_CONTACT, renderSmsTemplate } from './sms-render.util.js';
import { MessageTemplateService } from './sms-template.service.js';
import {
  BroadcastSmsSchema,
  ListSmsLogsSchema,
  SaveContactsSchema,
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

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MessageTemplateService) private readonly templates: MessageTemplateService,
  ) {}

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
      if (cfg.provider === 'phone_gateway') {
        // Telefon-gateway: login/parolni SMS yubormasdan tekshiradi.
        const verdict = await phoneGatewayCheck(this.phoneGatewayCreds(cfg));
        ok = verdict.ok;
        message = verdict.message;
      } else {
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

  // --- messaging contacts (CompanySettings) -----------------------------

  /** Sozlama formasi uchun — REAL qiymatlar (bo'sh = null). */
  async getRawContacts(accountId: string) {
    const s = await this.prisma.client.companySettings.findUnique({
      where: { accountId },
      select: { messagingPhone: true, messagingCard: true, messagingCardOwner: true },
    });
    return {
      phone: s?.messagingPhone ?? null,
      card: s?.messagingCard ?? null,
      cardOwner: s?.messagingCardOwner ?? null,
    };
  }

  /** Render uchun — bo'sh maydonlar Sherset default bilan to'ldiriladi. */
  async getContacts(accountId: string) {
    const r = await this.getRawContacts(accountId);
    return {
      phone: r.phone || DEFAULT_MESSAGING_CONTACT.phone,
      card: r.card || DEFAULT_MESSAGING_CONTACT.card,
      cardOwner: r.cardOwner || DEFAULT_MESSAGING_CONTACT.cardOwner,
    };
  }

  async saveContacts(accountId: string, raw: unknown) {
    const p = SaveContactsSchema.safeParse(raw);
    if (!p.success) {
      throw new BadRequestException(p.error.issues.map((i) => i.message).join(', '));
    }
    const { phone, card, cardOwner } = p.data;
    await this.prisma.client.companySettings.upsert({
      where: { accountId },
      create: {
        accountId,
        messagingPhone: phone ?? null,
        messagingCard: card ?? null,
        messagingCardOwner: cardOwner ?? null,
      },
      update: {
        messagingPhone: phone ?? null,
        messagingCard: card ?? null,
        messagingCardOwner: cardOwner ?? null,
      },
    });
    return this.getRawContacts(accountId);
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
   * Umumiy SMS-tarqatma (qarzdan alohida) — tanlangan kontragentlar + qo'lda
   * kiritilgan raqamlarga tayyor shablon bilan. Har biri navbatga (SmsLog)
   * qo'yiladi; halol xulosa qaytadi (queued + o'tkazib yuborilganlar sabab bilan).
   * Debt o'zgaruvchilari bu yerda bo'sh ('—') — shablon umumiy bo'lishi kutiladi.
   */
  async broadcast(accountId: string, userId: string, raw: unknown) {
    const { templateId, counterpartyIds, phones } = BroadcastSmsSchema.parse(raw);

    const cfg = await this.prisma.client.smsConfig.findUnique({ where: { accountId } });
    if (!cfg || !cfg.enabled) {
      throw new BadRequestException(
        "SMS sozlanmagan — Sozlamalar > SMS bo'limida provayderni qo'shing",
      );
    }
    const template = await this.templates.findOne(accountId, templateId); // 404 + tenant guard
    if (template.channel !== 'sms') {
      throw new BadRequestException('Bu shablon SMS kanali uchun emas');
    }
    const contact = await this.getContacts(accountId);

    const cps = counterpartyIds.length
      ? await this.prisma.client.counterparty.findMany({
          where: { id: { in: counterpartyIds }, accountId },
          select: { id: true, name: true, phone: true },
        })
      : [];
    const recipients: Array<{ name: string; phone: string | null }> = [
      ...cps.map((c) => ({ name: c.name, phone: c.phone })),
      ...phones.map((p) => ({ name: '', phone: p })),
    ];

    const skipped: Array<{ name: string; phone: string; reason: string }> = [];
    const seen = new Set<string>();
    let queued = 0;
    for (const r of recipients) {
      const trimmed = r.phone?.trim() ?? '';
      const phone = trimmed.replace(/[^0-9+]/g, ''); // bo'sh joy/chiziqchani olib tashlash
      if (!phone || phone.replace(/\D/g, '').length < 9) {
        skipped.push({ name: r.name, phone: trimmed, reason: 'no_phone' });
        continue;
      }
      if (seen.has(phone)) continue; // dublikat raqam bir marta
      seen.add(phone);
      const body = renderSmsTemplate(template.body, {
        counterparty: { name: r.name || phone },
        debt: { remainingFormatted: '—', totalFormatted: '—' },
        company: contact,
      });
      try {
        await this.send(accountId, userId, { toPhone: phone, body, entity: 'Broadcast' });
        queued += 1;
      } catch {
        skipped.push({ name: r.name, phone, reason: 'send_error' });
      }
    }
    return { queued, skipped };
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

    // Telefon-gateway (o'z SIM) — Eskiz token oqimi kerak emas, to'g'ridan-to'g'ri POST.
    if (cfg.provider === 'phone_gateway') {
      const result = await phoneGatewaySend(this.phoneGatewayCreds(cfg), {
        phone: log.toPhone,
        text: log.body,
      });
      return { providerMessageId: result.id };
    }

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
    // Faza 28: 'sending' = worker hozir provayder bilan gaplashmoqda. Uni
    // navbatga qaytarish ikkinchi workerga xuddi shu SMS'ni beradi.
    if (log.status === OUTBOX_SENDING) {
      throw new BadRequestException("Yuborilmoqda — tugashini kuting, so'ng qayta urinib ko'ring");
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

  /** Telefon-gateway: `email` = login, `passwordCipher` = parol (deshifrlangan). */
  private phoneGatewayCreds(cfg: {
    email: string;
    passwordCipher: string;
  }): PhoneGatewayCredentials {
    return {
      username: cfg.email,
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
