import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { decryptPassword, encryptPassword } from '../email/crypto.js';
import {
  TelegramApiError,
  tgDeleteWebhook,
  tgGetMe,
  tgSendMessage,
  tgSetWebhook,
} from './telegram.client.js';
import {
  ListTelegramOutboxSchema,
  type SaveTelegramConfigInput,
  SaveTelegramConfigSchema,
  type SendTelegramInput,
  SendTelegramSchema,
} from './telegram.schema.js';

const BACKOFF_MS = [0, 60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000, 60 * 60 * 1000] as const;
const BATCH_LIMIT = 30;
const ERROR_MSG_MAX = 500;

interface PublicTelegramConfig {
  id: string;
  botUsername: string | null;
  hasBotToken: boolean;
  webhookUrl: string | null;
  defaultChatId: string | null;
  enabled: boolean;
  lastTestedAt: Date | null;
  lastTestOk: boolean | null;
  lastTestMsg: string | null;
}

/**
 * TelegramService — bot config + outbound message queue.
 *
 * Pattern mirrors Email/SMS: caller calls `send()` to enqueue, the
 * @Cron worker drains the queue and calls Telegram API. Backoff
 * 0/1m/5m/15m/1h, DLQ at attempt 5.
 *
 * Inbound webhooks (Telegram → us, when user messages the bot) are
 * received by TelegramController.webhook handler — V1 logs the update
 * for inspection; routing to commands is a future enhancement.
 */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private isRunning = false;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // --- config ----------------------------------------------------------

  async getConfig(accountId: string): Promise<PublicTelegramConfig | null> {
    const row = await this.prisma.client.telegramConfig.findUnique({ where: { accountId } });
    if (!row) return null;
    return this.publicView(row);
  }

  async saveConfig(accountId: string, raw: unknown): Promise<PublicTelegramConfig> {
    const r = SaveTelegramConfigSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    const parsed = r.data as SaveTelegramConfigInput;
    const existing = await this.prisma.client.telegramConfig.findUnique({
      where: { accountId },
    });
    const botTokenCipher =
      parsed.botToken && parsed.botToken.length > 0 ? encryptPassword(parsed.botToken) : undefined;
    if (!botTokenCipher && !existing) {
      throw new BadRequestException('Birinchi sozlash uchun botToken majburiy');
    }
    const data = {
      accountId,
      ...(botTokenCipher !== undefined ? { botTokenCipher } : {}),
      webhookUrl: parsed.webhookUrl ?? null,
      webhookSecret: parsed.webhookSecret ?? null,
      defaultChatId: parsed.defaultChatId ?? null,
      lastTestedAt: null,
      lastTestOk: null,
      lastTestMsg: null,
    };
    const saved = existing
      ? await this.prisma.client.telegramConfig.update({ where: { accountId }, data })
      : await this.prisma.client.telegramConfig.create({
          data: { ...data, botTokenCipher: botTokenCipher as string },
        });
    return this.publicView(saved);
  }

  async deleteConfig(accountId: string): Promise<{ ok: true }> {
    await this.prisma.client.telegramConfig.deleteMany({ where: { accountId } });
    return { ok: true };
  }

  /**
   * Verifies bot token by calling getMe. Caches bot username on the
   * config row so settings UI shows '@MyShopBot' badge.
   */
  async testConnection(accountId: string): Promise<{ ok: boolean; message: string }> {
    const cfg = await this.requireConfig(accountId);
    let ok = false;
    let message = '';
    try {
      const info = await tgGetMe(decryptPassword(cfg.botTokenCipher));
      ok = true;
      message = `@${info.username ?? info.first_name} (id ${info.id})`;
      await this.prisma.client.telegramConfig.update({
        where: { accountId },
        data: { botUsername: info.username ?? null },
      });
    } catch (err) {
      message = (err as Error).message ?? 'Telegram getMe xato';
      this.logger.warn(`Telegram test failed for ${accountId}: ${message}`);
    }
    await this.prisma.client.telegramConfig.update({
      where: { accountId },
      data: { lastTestedAt: new Date(), lastTestOk: ok, lastTestMsg: message.slice(0, 500) },
    });
    return { ok, message };
  }

  /** Register / update Telegram webhook URL via setWebhook. */
  async setWebhook(accountId: string, url: string, secret?: string): Promise<{ ok: true }> {
    const cfg = await this.requireConfig(accountId);
    await tgSetWebhook(decryptPassword(cfg.botTokenCipher), url, secret);
    await this.prisma.client.telegramConfig.update({
      where: { accountId },
      data: { webhookUrl: url, webhookSecret: secret ?? null },
    });
    return { ok: true };
  }

  async deleteWebhook(accountId: string): Promise<{ ok: true }> {
    const cfg = await this.requireConfig(accountId);
    await tgDeleteWebhook(decryptPassword(cfg.botTokenCipher));
    await this.prisma.client.telegramConfig.update({
      where: { accountId },
      data: { webhookUrl: null, webhookSecret: null },
    });
    return { ok: true };
  }

  // --- outbound queue --------------------------------------------------

  async send(accountId: string, raw: unknown) {
    const r = SendTelegramSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    const parsed = r.data as SendTelegramInput;
    const cfg = await this.prisma.client.telegramConfig.findUnique({ where: { accountId } });
    if (!cfg || !cfg.enabled) {
      throw new BadRequestException("Telegram sozlanmagan yoki o'chirilgan");
    }
    const row = await this.prisma.client.telegramOutbox.create({
      data: {
        accountId,
        chatId: parsed.chatId,
        text: parsed.text,
        parseMode: parsed.parseMode,
        status: 'pending',
        attempt: 1,
        maxAttempts: 4,
        nextRetryAt: new Date(),
      },
    });
    return { id: row.id, status: 'pending' };
  }

  async listOutbox(accountId: string, raw: unknown) {
    const filter = ListTelegramOutboxSchema.parse(raw);
    const items = await this.prisma.client.telegramOutbox.findMany({
      where: {
        accountId,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.chatId ? { chatId: filter.chatId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: filter.limit,
    });
    return { items };
  }

  async retryOutbox(accountId: string, id: string) {
    const row = await this.prisma.client.telegramOutbox.findFirst({ where: { id, accountId } });
    if (!row) throw new NotFoundException(`TelegramOutbox ${id} topilmadi`);
    if (row.status === 'sent') {
      throw new BadRequestException('Allaqachon yuborilgan');
    }
    return this.prisma.client.telegramOutbox.update({
      where: { id },
      data: {
        status: 'pending',
        attempt: 1,
        nextRetryAt: new Date(),
        attemptedAt: null,
        errorMsg: null,
      },
    });
  }

  // --- inbound webhook -------------------------------------------------

  /**
   * Process an inbound Telegram update. V1 just logs it; future
   * versions can route /commands to handler functions.
   */
  async handleInbound(accountId: string, update: unknown): Promise<{ ok: true }> {
    this.logger.log(`Telegram inbound for ${accountId}: ${JSON.stringify(update).slice(0, 500)}`);
    // Future: parse `/start`, `/help`, etc. and respond via send().
    return { ok: true };
  }

  // --- cron worker -----------------------------------------------------

  @Cron(CronExpression.EVERY_30_SECONDS)
  async drainOutbox(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      const due = await this.prisma.client.telegramOutbox.findMany({
        where: { status: 'pending', nextRetryAt: { lte: new Date() } },
        orderBy: { nextRetryAt: 'asc' },
        take: BATCH_LIMIT,
        include: { account: { select: { id: true } } },
      });
      if (due.length === 0) return;
      this.logger.debug(`Processing ${due.length} due Telegram messages`);
      for (const row of due) {
        await this.deliverOne(row);
      }
    } catch (err) {
      this.logger.error(`Telegram drain failed: ${String(err)}`);
    } finally {
      this.isRunning = false;
    }
  }

  private async deliverOne(row: Prisma.TelegramOutboxGetPayload<true>): Promise<void> {
    try {
      const cfg = await this.prisma.client.telegramConfig.findUnique({
        where: { accountId: row.accountId },
      });
      if (!cfg || !cfg.enabled) {
        await this.markDead(row.id, 'config missing or disabled');
        return;
      }
      const result = await tgSendMessage(decryptPassword(cfg.botTokenCipher), {
        chatId: row.chatId,
        text: row.text,
        parseMode:
          row.parseMode === 'HTML' || row.parseMode === 'MarkdownV2' ? row.parseMode : undefined,
      });
      await this.prisma.client.telegramOutbox.update({
        where: { id: row.id },
        data: {
          status: 'sent',
          attemptedAt: new Date(),
          sentAt: new Date(),
          providerMessageId: String(result.message_id),
          errorMsg: null,
        },
      });
    } catch (err) {
      const msg = err instanceof TelegramApiError ? err.message : (err as Error).message;
      await this.scheduleRetryOrDie(row, msg);
    }
  }

  private async markDead(id: string, errorMsg: string): Promise<void> {
    await this.prisma.client.telegramOutbox.update({
      where: { id },
      data: {
        status: 'dead',
        attemptedAt: new Date(),
        errorMsg: errorMsg.slice(0, ERROR_MSG_MAX),
      },
    });
  }

  private async scheduleRetryOrDie(
    row: Prisma.TelegramOutboxGetPayload<true>,
    errorMsg: string,
  ): Promise<void> {
    const truncated = errorMsg.slice(0, ERROR_MSG_MAX);
    const nextAttempt = row.attempt + 1;
    if (nextAttempt > row.maxAttempts) {
      await this.markDead(row.id, truncated);
      return;
    }
    const delay = BACKOFF_MS[Math.min(nextAttempt - 1, BACKOFF_MS.length - 1)]!;
    await this.prisma.client.telegramOutbox.update({
      where: { id: row.id },
      data: {
        status: 'pending',
        attempt: nextAttempt,
        nextRetryAt: new Date(Date.now() + delay),
        attemptedAt: new Date(),
        errorMsg: truncated,
      },
    });
  }

  // --- helpers ----------------------------------------------------------

  private async requireConfig(accountId: string) {
    const cfg = await this.prisma.client.telegramConfig.findUnique({ where: { accountId } });
    if (!cfg) throw new NotFoundException('Telegram sozlanmagan');
    return cfg;
  }

  private publicView(row: {
    id: string;
    botUsername: string | null;
    botTokenCipher: string;
    webhookUrl: string | null;
    defaultChatId: string | null;
    enabled: boolean;
    lastTestedAt: Date | null;
    lastTestOk: boolean | null;
    lastTestMsg: string | null;
  }): PublicTelegramConfig {
    return {
      id: row.id,
      botUsername: row.botUsername,
      hasBotToken: row.botTokenCipher.length > 0,
      webhookUrl: row.webhookUrl,
      defaultChatId: row.defaultChatId,
      enabled: row.enabled,
      lastTestedAt: row.lastTestedAt,
      lastTestOk: row.lastTestOk,
      lastTestMsg: row.lastTestMsg,
    };
  }
}
