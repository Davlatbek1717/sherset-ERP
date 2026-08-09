import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { PrismaService } from '../../prisma/prisma.service.js';
import { OUTBOX_SENDING } from '../shared/outbox-claim.js';
import { decryptPassword, encryptPassword } from './crypto.js';
import {
  ListEmailLogsSchema,
  type SaveEmailConfigInput,
  SaveEmailConfigSchema,
  type SendEmailInput,
  SendEmailSchema,
} from './email.schema.js';

// Emailable DOCUMENT entities (SendEmailSchema's EMAIL_ENTITIES minus the non-document
// Counterparty / Opportunity) → their Prisma model delegate. Sending one by email sets
// its `published` flag so the list «Отправлено» column shows the «Отправлен» pill.
const ENTITY_PUBLISH_DELEGATE: Record<string, string> = {
  CustomerOrder: 'customerOrder',
  Demand: 'demand',
  InvoiceOut: 'invoiceOut',
  Supply: 'supply',
  PurchaseOrder: 'purchaseOrder',
  InvoiceIn: 'invoiceIn',
  PaymentIn: 'paymentIn',
  PaymentOut: 'paymentOut',
  SalesReturn: 'salesReturn',
  PurchaseReturn: 'purchaseReturn',
  CashIn: 'cashIn',
  CashOut: 'cashOut',
};

interface PublicEmailConfig {
  id: string;
  provider: string;
  fromName: string | null;
  fromEmail: string;
  replyTo: string | null;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  hasPassword: boolean;
  lastTestedAt: Date | null;
  lastTestOk: boolean | null;
  lastTestMsg: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------
  // Config
  // -------------------------------------------------------------------

  async getConfig(accountId: string): Promise<PublicEmailConfig | null> {
    const row = await this.prisma.client.emailConfig.findFirst({
      where: { accountId },
    });
    if (!row) return null;
    return this.publicView(row);
  }

  async saveConfig(accountId: string, raw: unknown): Promise<PublicEmailConfig> {
    const parsed = this.parseSave(raw);

    const existing = await this.prisma.client.emailConfig.findFirst({
      where: { accountId },
    });

    let passwordCipher: string | undefined;
    if (parsed.password && parsed.password.length > 0) {
      passwordCipher = encryptPassword(parsed.password);
    } else if (!existing) {
      throw new BadRequestException('Birinchi sozlash uchun parol majburiy');
    }

    // PATCH-semantika (`INT-13`, faza 21 naqshi / faza Q11 klass-auditi):
    // kelmagan (`undefined`) ixtiyoriy maydon TEGILMAYDI. Ilgari
    // `parsed.fromName ?? null` uslubi ularsiz yuborilgan yangilashda
    // (masalan faqat SMTP host/port almashtirilganda) jo'natuvchi nomi va
    // «reply-to» manzilini JIMGINA o'chirardi. Ataylab bo'sh string
    // yuborilsa schema uni `null` qiladi ⇒ tozalash yo'li saqlanadi.
    const data = {
      accountId,
      provider: parsed.provider,
      ...(parsed.fromName !== undefined ? { fromName: parsed.fromName } : {}),
      fromEmail: parsed.fromEmail,
      ...(parsed.replyTo !== undefined ? { replyTo: parsed.replyTo } : {}),
      host: parsed.host,
      port: parsed.port,
      secure: parsed.secure,
      username: parsed.username,
      ...(passwordCipher ? { passwordCipher } : {}),
      // Saving config invalidates last-test result.
      lastTestedAt: null,
      lastTestOk: null,
      lastTestMsg: null,
    };

    const saved = existing
      ? await this.prisma.client.emailConfig.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.client.emailConfig.create({
          // For create, passwordCipher is required by schema, so the
          // BadRequestException above guarantees we reach here only
          // when passwordCipher is set.
          data: { ...data, passwordCipher: passwordCipher as string },
        });

    return this.publicView(saved);
  }

  async deleteConfig(accountId: string): Promise<{ ok: true }> {
    await this.prisma.client.emailConfig.deleteMany({ where: { accountId } });
    return { ok: true };
  }

  // -------------------------------------------------------------------
  // Test connection — verifies credentials by opening + closing an
  // SMTP session. Persists the verdict on the config row.
  // -------------------------------------------------------------------

  async testConnection(accountId: string): Promise<{ ok: boolean; message: string }> {
    const cfg = await this.prisma.client.emailConfig.findFirst({
      where: { accountId },
    });
    if (!cfg) throw new NotFoundException('Email sozlamalari topilmadi');

    let ok = false;
    let message = '';
    try {
      const transporter = this.makeTransporter(cfg);
      await transporter.verify();
      transporter.close();
      ok = true;
      message = 'Ulanish muvaffaqiyatli';
    } catch (err) {
      ok = false;
      message = (err as Error).message ?? 'Ulanish xatosi';
      this.logger.warn(`Email connection test failed for account ${accountId}: ${message}`);
    }

    await this.prisma.client.emailConfig.update({
      where: { id: cfg.id },
      data: {
        lastTestedAt: new Date(),
        lastTestOk: ok,
        lastTestMsg: message.slice(0, 500),
      },
    });
    return { ok, message };
  }

  // -------------------------------------------------------------------
  // Send — Sprint 17.4 enqueues onto the EmailLog queue. Actual SMTP
  // delivery is performed asynchronously by EmailDeliveryService.
  // -------------------------------------------------------------------

  /**
   * Enqueue an email for asynchronous delivery. Validates SMTP config
   * exists and attachment IDs resolve, then writes an EmailLog row with
   * status='pending' and nextRetryAt=NOW. The cron worker picks it up
   * within 30 seconds.
   *
   * Returns immediately — the controller responds 200 with the log id
   * the moment the queue row is persisted, not when the SMTP server
   * accepts the message. Clients poll /email/log to observe final status.
   */
  async send(
    accountId: string,
    userId: string,
    raw: unknown,
  ): Promise<{ id: string; status: string }> {
    const parsed = this.parseSend(raw);

    const cfg = await this.prisma.client.emailConfig.findFirst({
      where: { accountId },
    });
    if (!cfg) {
      throw new BadRequestException(
        "Email sozlanmagan — Sozlamalar > Pochta bo'limida SMTP'ni to'ldiring",
      );
    }

    // Pre-flight attachment validation — reject fast if any ID is bogus.
    if (parsed.attachmentIds.length > 0) {
      const attachmentCount = await this.prisma.client.attachment.count({
        where: { id: { in: parsed.attachmentIds }, accountId },
      });
      if (attachmentCount !== parsed.attachmentIds.length) {
        throw new BadRequestException("Ba'zi biriktirilgan fayllar topilmadi");
      }
    }

    const log = await this.prisma.client.emailLog.create({
      data: {
        accountId,
        senderId: userId,
        entity: parsed.entity ?? null,
        entityId: parsed.entityId ?? null,
        toAddresses: parsed.to,
        ccAddresses: parsed.cc,
        subject: parsed.subject,
        bodyHtml: parsed.bodyHtml,
        attachmentIds: parsed.attachmentIds,
        status: 'pending',
        attempt: 1,
        maxAttempts: 4,
        nextRetryAt: new Date(),
      },
    });

    // moysklad «Отправлено»: emailing a DOCUMENT marks it `published=true` (the list
    // then shows the cyan «Отправлен» pill). Applied on enqueue — the «Отправить»
    // action — across every emailable document type, so the column is no longer always
    // empty. Best-effort: a doc-type without a `published` column (Counterparty /
    // Opportunity) or an already-deleted row must NOT break the email send.
    if (parsed.entity && parsed.entityId) {
      const delegate = ENTITY_PUBLISH_DELEGATE[parsed.entity];
      const model = delegate
        ? (
            this.prisma.client as unknown as Record<
              string,
              | {
                  updateMany(args: {
                    where: Record<string, unknown>;
                    data: { published: boolean };
                  }): Promise<unknown>;
                }
              | undefined
            >
          )[delegate]
        : undefined;
      if (model) {
        try {
          await model.updateMany({
            where: { id: parsed.entityId, accountId, deletedAt: null },
            data: { published: true },
          });
        } catch {
          // entity lacks a `published` column or the row is gone — ignore.
        }
      }
    }

    return { id: log.id, status: 'pending' };
  }

  /**
   * Send a single EmailLog row via SMTP. Called by EmailDeliveryService
   * worker. Resolves attachments at call time (not enqueue time). On
   * SMTP/network error, throws — caller decides retry vs dead.
   */
  async sendQueuedNow(logId: string): Promise<void> {
    const log = await this.prisma.client.emailLog.findUnique({ where: { id: logId } });
    if (!log) throw new BadRequestException(`EmailLog ${logId} topilmadi`);

    const cfg = await this.prisma.client.emailConfig.findFirst({
      where: { accountId: log.accountId },
    });
    if (!cfg) {
      throw new Error('SMTP config missing — email cannot be delivered');
    }

    const attachments = log.attachmentIds.length
      ? await this.prisma.client.attachment.findMany({
          where: { id: { in: log.attachmentIds }, accountId: log.accountId },
          select: { filename: true, mime: true, content: true },
        })
      : [];

    const transporter = this.makeTransporter(cfg);
    try {
      const fromHeader = cfg.fromName ? `"${cfg.fromName}" <${cfg.fromEmail}>` : cfg.fromEmail;
      await transporter.sendMail({
        from: fromHeader,
        to: log.toAddresses.join(', '),
        cc: log.ccAddresses.length > 0 ? log.ccAddresses.join(', ') : undefined,
        replyTo: cfg.replyTo ?? undefined,
        subject: log.subject,
        html: log.bodyHtml,
        attachments: attachments.map((a) => ({
          filename: a.filename,
          content: Buffer.from(a.content),
          contentType: a.mime,
        })),
      });
    } finally {
      transporter.close();
    }
  }

  // -------------------------------------------------------------------
  // List logs — used by the AttachmentsSection-like history panel.
  // -------------------------------------------------------------------

  async listLogs(accountId: string, raw: unknown) {
    const filter = ListEmailLogsSchema.parse(raw);
    const rows = await this.prisma.client.emailLog.findMany({
      where: {
        accountId,
        ...(filter.entity ? { entity: filter.entity } : {}),
        ...(filter.entityId ? { entityId: filter.entityId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: filter.limit,
      select: {
        id: true,
        entity: true,
        entityId: true,
        toAddresses: true,
        ccAddresses: true,
        subject: true,
        status: true,
        attempt: true,
        maxAttempts: true,
        errorMsg: true,
        nextRetryAt: true,
        attemptedAt: true,
        sentAt: true,
        createdAt: true,
        sender: { select: { id: true, name: true } },
      },
    });
    return { items: rows };
  }

  /**
   * Manually re-enqueue a failed/dead email log row for another attempt.
   * Resets attempt counter to 1 and nextRetryAt to NOW.
   */
  async retryLog(accountId: string, logId: string) {
    const log = await this.prisma.client.emailLog.findFirst({
      where: { id: logId, accountId },
    });
    if (!log) throw new NotFoundException(`EmailLog ${logId} topilmadi`);
    if (log.status === 'sent') {
      throw new BadRequestException('Bu xat muvaffaqiyatli yuborilgan, qayta yuborish shart emas');
    }
    // Faza 28: 'sending' = worker hozir SMTP bilan gaplashmoqda — navbatga
    // qaytarish ikkinchi nusxani yuborishga olib keladi.
    if (log.status === OUTBOX_SENDING) {
      throw new BadRequestException("Yuborilmoqda — tugashini kuting, so'ng qayta urinib ko'ring");
    }
    return this.prisma.client.emailLog.update({
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

  // -------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------

  private makeTransporter(cfg: {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    passwordCipher: string;
  }): Transporter {
    return nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: {
        user: cfg.username,
        pass: decryptPassword(cfg.passwordCipher),
      },
      // Sensible production defaults: 60s connection, 30s greeting,
      // 60s socket idle. Plays nicely with most managed SMTP services.
      connectionTimeout: 60_000,
      greetingTimeout: 30_000,
      socketTimeout: 60_000,
    });
  }

  private publicView(row: {
    id: string;
    provider: string;
    fromName: string | null;
    fromEmail: string;
    replyTo: string | null;
    host: string;
    port: number;
    secure: boolean;
    username: string;
    passwordCipher: string;
    lastTestedAt: Date | null;
    lastTestOk: boolean | null;
    lastTestMsg: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): PublicEmailConfig {
    return {
      id: row.id,
      provider: row.provider,
      fromName: row.fromName,
      fromEmail: row.fromEmail,
      replyTo: row.replyTo,
      host: row.host,
      port: row.port,
      secure: row.secure,
      username: row.username,
      hasPassword: row.passwordCipher.length > 0,
      lastTestedAt: row.lastTestedAt,
      lastTestOk: row.lastTestOk,
      lastTestMsg: row.lastTestMsg,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private parseSave(raw: unknown): SaveEmailConfigInput {
    const r = SaveEmailConfigSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseSend(raw: unknown): SendEmailInput {
    const r = SendEmailSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }
}
