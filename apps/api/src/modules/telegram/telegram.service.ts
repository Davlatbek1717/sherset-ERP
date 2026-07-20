import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttachmentService } from '../attachment/attachment.service.js';
import { decryptPassword, encryptPassword } from '../email/crypto.js';
import { normalizeTelegramPhone } from '../hr/hr-shared/phone-normalize.util.js';
import type { MtprotoInboundHandler } from '../hr/hr-telegram-bridge/mtproto-inbound-handler.js';
import type { IncomingMtprotoMessage } from '../hr/hr-telegram-bridge/telegram-client-factory.js';
import { parseBusinessUpdate } from './telegram-business.util.js';
import { TelegramLookupService } from './telegram-lookup.service.js';
import {
  TelegramApiError,
  tgDeleteWebhook,
  tgDownloadFile,
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
export class TelegramService implements MtprotoInboundHandler {
  private readonly logger = new Logger(TelegramService.name);
  private isRunning = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AttachmentService) private readonly attachments: AttachmentService,
    @Inject(TelegramLookupService) private readonly lookup: TelegramLookupService,
  ) {}

  /**
   * Kontragent Telegram profilini AVTOMATIK topish (panel sarlavhasi) —
   * kontragent telefonini ulangan raqam orqali MTProto'da qidiradi.
   */
  async counterpartyTelegramProfile(accountId: string, counterpartyId: string) {
    const cp = await this.prisma.client.counterparty.findFirst({
      where: { id: counterpartyId, accountId },
      select: { id: true, name: true, phone: true },
    });
    if (!cp) throw new NotFoundException('Kontragent topilmadi');
    const profile = await this.lookup.lookup(accountId, cp.phone);
    return { counterparty: { id: cp.id, name: cp.name, phone: cp.phone }, ...profile };
  }

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
    const parsed = parseBusinessUpdate(update);

    if (parsed.kind === 'business_connection') {
      // Owner connected/disconnected the bot in TG Business settings.
      await this.prisma.client.telegramConfig.updateMany({
        where: { accountId },
        data: parsed.enabled
          ? {
              businessConnectionId: parsed.connectionId,
              businessUserId: BigInt(parsed.user.id),
              businessUserName: parsed.user.name || null,
            }
          : { businessConnectionId: null },
      });
      this.logger.log(
        `Telegram business_connection ${parsed.enabled ? 'ON' : 'OFF'} for ${accountId} (${parsed.user.name})`,
      );
      return { ok: true };
    }

    if (parsed.kind === 'business_message') {
      const cfg = await this.prisma.client.telegramConfig.findUnique({ where: { accountId } });
      if (!cfg) return { ok: true };
      // from == the connected Premium user => owner wrote from the phone (out).
      const direction =
        parsed.fromId != null &&
        cfg.businessUserId != null &&
        BigInt(parsed.fromId) === cfg.businessUserId
          ? 'out'
          : 'in';

      const chat = await this.prisma.client.telegramChat.upsert({
        where: { accountId_chatId: { accountId, chatId: BigInt(parsed.chatId) } },
        update: {
          firstName: parsed.chatFirstName,
          lastName: parsed.chatLastName,
          username: parsed.chatUsername,
          lastMessageAt: new Date(),
          ...(parsed.contactPhone ? { phone: parsed.contactPhone } : {}),
        },
        create: {
          accountId,
          chatId: BigInt(parsed.chatId),
          firstName: parsed.chatFirstName,
          lastName: parsed.chatLastName,
          username: parsed.chatUsername,
          lastMessageAt: new Date(),
          phone: parsed.contactPhone,
          source: parsed.source,
        },
      });

      const msg = await this.prisma.client.telegramChatMessage.create({
        data: {
          accountId,
          chatRefId: chat.id,
          direction,
          text: parsed.text,
          tgMessageId: parsed.tgMessageId != null ? BigInt(parsed.tgMessageId) : null,
          senderName: parsed.fromName,
          kind: parsed.messageKind,
          fileId: parsed.fileId,
          fileName: parsed.fileName,
          mimeType: parsed.mimeType,
          fwdFromName: parsed.fwdFromName,
        },
      });

      // ── CHEK RASMI (2026-07-13) ────────────────────────────────────────────
      // Fayl webhook javobidan TASHQARIDA yuklab olinadi: Telegram webhook'ga
      // tez javob kutadi (sekin bo'lsa qayta yuboradi ⇒ dublikat xabar). Rasm
      // yuklanmasa ham XABAR SAQLANGAN bo'ladi — matn yo'qolmaydi.
      if (parsed.fileId) {
        void this.storeIncomingFile(accountId, msg.id, parsed.fileId, {
          fileName: parsed.fileName,
          mimeType: parsed.mimeType,
        }).catch((e: Error) =>
          this.logger.warn(`Telegram fayl saqlanmadi (xabar saqlandi): ${e.message}`),
        );
      }

      // ── KONTRAGENTGA AVTOMATIK BOG'LASH ───────────────────────────────────
      // Bog'lanmagan chat hech qayerda ko'rinmaydi va unga xabar yuborib
      // bo'lmaydi. Shuning uchun har xabarda urinib ko'ramiz (arzon).
      if (!chat.counterpartyId) {
        void this.autoBind(accountId, chat.id).catch((e: Error) =>
          this.logger.warn(`Telegram avtomatik bog'lash: ${e.message}`),
        );
      }

      return { ok: true };
    }

    this.logger.log(`Telegram inbound for ${accountId}: ${JSON.stringify(update).slice(0, 500)}`);
    return { ok: true };
  }

  // ── MTPROTO KIRUVCHI XABAR (2026-07-20) ──────────────────────────────────
  //
  // Mijoz javobi endi userbot orqali HAM ko'rinadi — ilgari faqat Telegram
  // Business kanali (yuqoridagi handleInbound) ikki-tomonlama edi, userbot
  // esa faqat yuborardi. MtprotoWorkerService har ulangan klientga bitta
  // marta shu metodni chaqiradigan listener biriktiradi (ensureClient()).
  // BIR XIL TelegramChat/TelegramChatMessage jadvaliga yoziladi —
  // counterpartyThread()/OrderTelegramPanel o'zgarishsiz ko'rsatadi.

  /** `MtprotoInboundHandler` — MtprotoWorkerService.ensureClient() chaqiradi. */
  async handleIncoming(
    accountId: string,
    slot: number,
    msg: IncomingMtprotoMessage,
  ): Promise<void> {
    // MTProto shaxsiy chat uchun "chat id" — jo'natuvchining o'z raqami
    // (Telegram Bot API'da ham shaxsiy chatning chat.id xuddi shu — semantika
    // ikkala kanalda bir xil qoladi, @@unique([accountId, chatId]) buziladi).
    const chatId = BigInt(msg.senderId);
    let phone: string | null = null;
    try {
      phone = normalizeTelegramPhone(msg.senderPhone);
    } catch {
      phone = null;
    }

    const chat = await this.prisma.client.telegramChat.upsert({
      where: { accountId_chatId: { accountId, chatId } },
      update: {
        lastMessageAt: new Date(),
        ...(phone ? { phone } : {}),
      },
      create: {
        accountId,
        chatId,
        firstName: msg.senderName,
        phone,
        source: 'mtproto',
        lastMessageAt: new Date(),
      },
    });

    // upsert (create emas) — `@@unique([chatRefId, tgMessageId])` (2026-07-20
    // to'liq-tarix) bilan bir xil xabar ikki marta kelsa (listener redelivery
    // yoki catch-up bilan poyga) throw QILMASIN, idempotent bo'lsin.
    const created = await this.prisma.client.telegramChatMessage.upsert({
      where: {
        chatRefId_tgMessageId: { chatRefId: chat.id, tgMessageId: BigInt(msg.tgMessageId) },
      },
      update: {},
      create: {
        accountId,
        chatRefId: chat.id,
        direction: 'in',
        text: msg.text.slice(0, 4096),
        tgMessageId: BigInt(msg.tgMessageId),
        senderName: msg.senderName,
        kind: msg.kind,
        mimeType: msg.mimeType,
        fileName: msg.fileName,
        fwdFromName: msg.fwdFromName,
      },
    });
    this.logger.debug(`MTProto kiruvchi xabar (acc=${accountId} slot=${slot}): ${created.id}`);

    // Catch-up kursori — uzilganda o'tkazib yuborilgani `minId`dan tortiladi.
    await this.prisma.client.telegramChat
      .update({ where: { id: chat.id }, data: { syncNewestId: BigInt(msg.tgMessageId) } })
      .catch(() => {});

    // Fayl faqat YANGI xabarda yuklab olinadi (dublikatda allaqachon bor).
    if (msg.downloadMedia && !created.attachmentId) {
      void this.storeIncomingMtprotoFile(accountId, created.id, msg).catch((e: Error) =>
        this.logger.warn(`MTProto fayl saqlanmadi (xabar saqlandi): ${e.message}`),
      );
    }

    if (!chat.counterpartyId) {
      void this.autoBind(accountId, chat.id).catch((e: Error) =>
        this.logger.warn(`MTProto avtomatik bog'lash: ${e.message}`),
      );
    }
  }

  /** Bot API'dagi `storeIncomingFile` bilan bir xil maqsad — faqat MTProto o'z fayl-yuklab-olish yo'liga ega (`downloadMedia`), bot token'ga muhtoj emas. */
  private async storeIncomingMtprotoFile(
    accountId: string,
    messageId: string,
    msg: IncomingMtprotoMessage,
  ): Promise<void> {
    if (!msg.downloadMedia) return;
    const buffer = await msg.downloadMedia();
    const attachment = await this.attachments.createFromBuffer(accountId, null, {
      entity: 'TelegramChatMessage',
      entityId: messageId,
      filename: msg.fileName ?? 'telegram-file',
      mime: msg.mimeType ?? 'application/octet-stream',
      buffer,
      description: 'Telegram chat — mijoz yuborgan fayl (MTProto)',
    });
    await this.prisma.client.telegramChatMessage.update({
      where: { id: messageId },
      data: { attachmentId: attachment.id },
    });
  }

  // ── MEDIA + AVTOMATIK BOG'LASH (2026-07-13) ──────────────────────────────

  /**
   * Telegram faylini yuklab olib, o'zimizning `attachments` jadvaliga saqlaydi.
   *
   * NEGA NUSXA OLAMIZ: Telegram `file_id` MUDDATLI — bir necha oydan keyin
   * ishlamay qolishi mumkin. Chek rasmi esa nizoli holatda yillar o'tib ham
   * kerak bo'ladi. Shuning uchun bayt-baytiga o'zimizda turadi.
   */
  private async storeIncomingFile(
    accountId: string,
    messageId: string,
    fileId: string,
    meta: { fileName: string | null; mimeType: string | null },
  ): Promise<void> {
    const cfg = await this.prisma.client.telegramConfig.findUnique({ where: { accountId } });
    if (!cfg) return;

    const buffer = await tgDownloadFile(decryptPassword(cfg.botTokenCipher), fileId);
    const attachment = await this.attachments.createFromBuffer(accountId, null, {
      entity: 'TelegramChatMessage',
      entityId: messageId,
      filename: meta.fileName ?? 'telegram-file',
      mime: meta.mimeType ?? 'application/octet-stream',
      buffer,
      description: 'Telegram chat — mijoz yuborgan fayl',
    });
    await this.prisma.client.telegramChatMessage.update({
      where: { id: messageId },
      data: { attachmentId: attachment.id },
    });
  }

  /** Telefonni solishtirish uchun oxirgi 9 raqam (+998 90 123-45-67 → 901234567). */
  private static phoneKey(raw: string | null | undefined): string | null {
    const d = String(raw ?? '').replace(/\D/g, '');
    return d.length >= 9 ? d.slice(-9) : null;
  }

  /** Ism solishtirish uchun: kichik harf, ortiqcha belgilarsiz. */
  private static nameKey(raw: string | null | undefined): string {
    return String(raw ?? '')
      .toLowerCase()
      .replace(/[`'’‘"]/g, "'")
      .replace(/[^a-zа-яё0-9' ]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Chatni kontragentga AVTOMATIK bog'laydi.
   *
   * Ikki yo'l:
   *   1) TELEFON — mijoz botga kontaktini ulashgan bo'lsa (eng ishonchli).
   *   2) ISM — Telegram Business xabarlarida telefon KELMAYDI (Telegram
   *      bermaydi), lekin egasining telefonida kontakt qanday saqlangan bo'lsa,
   *      chat nomi shunday keladi — odatda kontragent nomi bilan bir xil.
   *      Faqat YAGONA mos kelganda bog'laymiz; ikkita bir xil ismli mijoz
   *      bo'lsa — TEGMAYMIZ (noto'g'ri odamga qarz xabari ketmasin).
   */
  private async autoBind(accountId: string, chatRefId: string): Promise<void> {
    const chat = await this.prisma.client.telegramChat.findFirst({
      where: { id: chatRefId, accountId },
    });
    if (!chat || chat.counterpartyId) return;

    // 1) Telefon bo'yicha
    const pk = TelegramService.phoneKey(chat.phone);
    if (pk) {
      const rows = await this.prisma.client.$queryRaw<{ id: string }[]>`
        SELECT id FROM counterparties
        WHERE account_id = ${accountId}::uuid
          AND right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9) = ${pk}
        LIMIT 2`;
      const only = rows[0];
      if (rows.length === 1 && only) {
        await this.prisma.client.telegramChat.update({
          where: { id: chat.id },
          data: { counterpartyId: only.id, boundBy: 'auto' },
        });
        this.logger.log(`Telegram chat ${chat.id} → kontragent (telefon bo'yicha)`);
        return;
      }
    }

    // 2) Ism bo'yicha — faqat YAGONA mos kelsa
    const chatName = TelegramService.nameKey(
      [chat.firstName, chat.lastName].filter(Boolean).join(' '),
    );
    if (chatName.length < 3) return;

    const candidates = await this.prisma.client.counterparty.findMany({
      where: { accountId, archived: false },
      select: { id: true, name: true },
    });
    const matches = candidates.filter((c) => TelegramService.nameKey(c.name) === chatName);
    const hit = matches[0];
    // FAQAT yagona mos kelganda — ikkita bir xil ismli mijoz bo'lsa tegmaymiz
    // (noto'g'ri odamga qarz xabari ketib qolmasin).
    if (matches.length === 1 && hit) {
      await this.prisma.client.telegramChat.update({
        where: { id: chat.id },
        data: { counterpartyId: hit.id, boundBy: 'auto' },
      });
      this.logger.log(`Telegram chat ${chat.id} → kontragent (ism bo'yicha)`);
    }
  }

  // ── QARZ XABARNOMALARI (2026-07-13) ──────────────────────────────────────

  /**
   * Kontragentga Telegram orqali xabar yuboradi (qarz berildi / to'lov qabul
   * qilindi / qarz yopildi / eslatma).
   *
   * MUHIM: xabar faqat kontragentga BOG'LANGAN chat bo'lsa ketadi. Telegram
   * boti telefon raqamini bilgani uchun notanish odamga YOZOLMAYDI — mijoz
   * avval yozgan bo'lishi (yoki egasining Telegram'ida chat bo'lishi) shart.
   * Chat topilmasa — jimgina `sent:false` qaytadi va qarz oqimi TO'XTAMAYDI.
   */
  async notifyCounterparty(
    accountId: string,
    counterpartyId: string,
    text: string,
    autoKind: 'debt_issued' | 'payment' | 'debt_closed' | 'reminder',
  ): Promise<{ sent: boolean; reason?: string }> {
    // Userbot (shaxsiy raqam) faol bo'lsa — xabar egangizning RAQAMIDAN ketadi:
    // tayyor matnni HrTelegramOutbox'ga qo'yamiz, mavjud MTProto worker yetkazadi
    // (bog'langan TelegramChat SHART EMAS — kontragent telefoni yetarli). Faol
    // userbot yo'q bo'lsa — quyidagi Bot API / Business yo'li (backward-compat).
    const userbot = await this.prisma.client.hrTelegramAccount.findFirst({
      where: { accountId, isActive: true, sessionEncrypted: { not: null } },
      select: { id: true },
    });
    if (userbot) {
      const cp = await this.prisma.client.counterparty.findFirst({
        where: { id: counterpartyId, accountId },
        select: { phone: true },
      });
      let toPhone: string | null = null;
      try {
        toPhone = normalizeTelegramPhone(cp?.phone ?? null);
      } catch {
        toPhone = null;
      }
      if (!toPhone) return { sent: false, reason: 'no_phone' };
      await this.prisma.client.hrTelegramOutbox.create({
        data: {
          accountId,
          counterpartyId,
          toPhone,
          messageText: text,
          status: 'pending',
          sourceEventType: `debt.${autoKind}`.slice(0, 50),
        },
      });
      return { sent: true, reason: 'queued_userbot' };
    }

    const cfg = await this.prisma.client.telegramConfig.findUnique({ where: { accountId } });
    if (!cfg?.enabled) return { sent: false, reason: 'telegram_off' };

    const chat = await this.prisma.client.telegramChat.findFirst({
      where: { accountId, counterpartyId },
      orderBy: { lastMessageAt: 'desc' },
    });
    if (!chat) return { sent: false, reason: 'no_chat' };

    // Business chatga egasining NOMIDAN, bot chatiga oddiy yuboriladi.
    // Noto'g'ri usul Telegram xatosi beradi, shuning uchun `source` saqlanadi.
    const useBusiness = chat.source === 'business';
    if (useBusiness && !cfg.businessConnectionId) {
      return { sent: false, reason: 'business_not_connected' };
    }

    try {
      const result = await tgSendMessage(decryptPassword(cfg.botTokenCipher), {
        chatId: chat.chatId.toString(),
        text,
        parseMode: 'HTML',
        ...(useBusiness ? { businessConnectionId: cfg.businessConnectionId as string } : {}),
      });
      await this.prisma.client.telegramChatMessage.create({
        data: {
          accountId,
          chatRefId: chat.id,
          direction: 'out',
          text,
          tgMessageId: BigInt(result.message_id),
          senderName: cfg.businessUserName,
          kind: 'text',
          autoKind,
        },
      });
      await this.prisma.client.telegramChat.update({
        where: { id: chat.id },
        data: { lastMessageAt: new Date() },
      });
      return { sent: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Telegram xabar yuborilmadi (${autoKind}): ${msg}`);
      return { sent: false, reason: msg.slice(0, 200) };
    }
  }

  // ── UMUMIY CHAT (buyurtma/kontragent kartochkasi paneli, 2026-07-17) ──────
  //
  // Wappi-uslubidagi panel shu ikki metodga tayanadi. Kontragent-ruxsati bilan
  // ishlaydi (sotuvchida HR-ruxsat bo'lmaydi). Yuborish — MTProto userbot
  // (shaxsiy raqam) navbati orqali (notifyCounterparty bilan bir xil yo'l);
  // faol userbot bo'lmasa aniq xato. O'qish — MTProto chiquvchi (HrTelegramOutbox)
  // ∪ Business ikki-tomonlama (TelegramChatMessage) xabarlari birlashtiriladi,
  // eng eskisidan yangisiga.

  /** Panelning yuborish tugmasi — kontragentga shaxsiy raqamdan xabar navbati. */
  async sendChatToCounterparty(accountId: string, counterpartyId: string, rawText: unknown) {
    const text = typeof rawText === 'string' ? rawText.trim() : '';
    if (!text || text.length > 4096) {
      throw new BadRequestException('Xabar matni majburiy (1-4096 belgi)');
    }
    const cp = await this.prisma.client.counterparty.findFirst({
      where: { id: counterpartyId, accountId },
      select: { id: true, phone: true, name: true },
    });
    if (!cp) throw new NotFoundException('Kontragent topilmadi');

    const userbot = await this.prisma.client.hrTelegramAccount.findFirst({
      where: { accountId, isActive: true, sessionEncrypted: { not: null } },
      select: { id: true },
    });
    if (!userbot) {
      throw new BadRequestException(
        "Telegram raqami ulanmagan — avval Sozlamalar → Telegram profillari'da raqamni ulang",
      );
    }
    let toPhone: string | null = null;
    try {
      toPhone = normalizeTelegramPhone(cp.phone);
    } catch {
      toPhone = null;
    }
    if (!toPhone) {
      throw new BadRequestException("Kontragentda to'g'ri telefon raqami yo'q");
    }
    const row = await this.prisma.client.hrTelegramOutbox.create({
      data: {
        accountId,
        counterpartyId,
        toPhone,
        messageText: text,
        status: 'pending',
        sourceEventType: 'manual_chat',
      },
    });
    return { id: row.id, status: 'pending' as const, direction: 'out' as const };
  }

  /**
   * Panel birinchi ochilganda — kontragentning to'liq Telegram tarixini
   * backfill navbatiga qo'yadi (2026-07-20). Idempotent: mavjud job bo'lsa
   * o'zgartirmaydi (queued/running/done/error holatida qoladi). Telefon
   * yo'q bo'lsa `no_phone` (userbot topolmaydi).
   */
  async requestCounterpartySync(
    accountId: string,
    counterpartyId: string,
  ): Promise<{ status: string }> {
    const cp = await this.prisma.client.counterparty.findFirst({
      where: { id: counterpartyId, accountId },
      select: { id: true, phone: true },
    });
    if (!cp) throw new NotFoundException('Kontragent topilmadi');
    let phone: string | null = null;
    try {
      phone = normalizeTelegramPhone(cp.phone);
    } catch {
      phone = null;
    }
    if (!phone) return { status: 'no_phone' };

    const job = await this.prisma.client.telegramBackfillJob.upsert({
      where: { accountId_counterpartyId: { accountId, counterpartyId } },
      update: {},
      create: { accountId, counterpartyId, phone, status: 'queued' },
      select: { status: true },
    });
    return { status: job.status };
  }

  /**
   * Panel xabar oqimi (2026-07-20 to'liq-tarix). KANONIK transkript =
   * `TelegramChatMessage` (backfill + jonli, ikki-tomonlama) + faqat
   * YETKAZILMAGAN `HrTelegramOutbox` overlay (yetkazilgani kanonikda bor,
   * dubl bo'lmaydi). `?before=<ISO>` bilan orqaga sahifalash (uzun tarix).
   */
  async counterpartyThread(
    accountId: string,
    counterpartyId: string,
    raw: Record<string, unknown>,
  ) {
    const limit = Math.min(Number(raw.limit) || 50, 200);
    const before = typeof raw.before === 'string' ? new Date(raw.before) : null;
    const cp = await this.prisma.client.counterparty.findFirst({
      where: { id: counterpartyId, accountId },
      select: { id: true, name: true, phone: true },
    });
    if (!cp) throw new NotFoundException('Kontragent topilmadi');

    // Kontragentga bog'langan chat (peer-id bo'yicha yagona — backfill+jonli birlashgan).
    const chat = await this.prisma.client.telegramChat.findFirst({
      where: { accountId, counterpartyId },
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true },
    });
    // Kanonik: TelegramChatMessage (backfilled + jonli, ikki-tomonlama).
    const canonical = chat
      ? await this.prisma.client.telegramChatMessage.findMany({
          where: {
            accountId,
            chatRefId: chat.id,
            ...(before ? { createdAt: { lt: before } } : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
        })
      : [];
    // Yetkazilgan tgMessageId'lar — mos outbox qatorini overlay'dan chiqarish uchun.
    const deliveredIds = new Set(
      canonical.filter((m) => m.tgMessageId != null).map((m) => String(m.tgMessageId)),
    );

    // Overlay: faqat YETKAZILMAGAN (yoki hali kanonikda yo'q) chiquvchi outbox.
    const outbox = await this.prisma.client.hrTelegramOutbox.findMany({
      where: { accountId, counterpartyId, ...(before ? { createdAt: { lt: before } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const overlay = outbox.filter(
      (m) => m.telegramMessageId == null || !deliveredIds.has(String(m.telegramMessageId)),
    );

    type ThreadItem = {
      id: string;
      direction: 'in' | 'out';
      text: string;
      status: string | null;
      kind: string;
      autoKind: string | null;
      attachmentId: string | null;
      fileName: string | null;
      mimeType: string | null;
      fwdFromName: string | null;
      createdAt: Date;
    };
    const merged: ThreadItem[] = [
      ...canonical.map((m) => ({
        id: `tg-${m.id}`,
        direction: m.direction as 'in' | 'out',
        text: m.text ?? '',
        status: null,
        kind: m.kind ?? 'text',
        autoKind: m.autoKind,
        attachmentId: m.attachmentId,
        fileName: m.fileName,
        mimeType: m.mimeType,
        fwdFromName: m.fwdFromName,
        createdAt: m.createdAt,
      })),
      ...overlay.map((m) => ({
        id: `ob-${m.id}`,
        direction: 'out' as const,
        text: m.messageText,
        status: m.status,
        kind: 'text',
        autoKind: m.sourceEventType === 'manual_chat' ? null : (m.sourceEventType ?? null),
        attachmentId: null,
        fileName: null,
        mimeType: null,
        fwdFromName: null,
        createdAt: m.createdAt,
      })),
    ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const page = merged.slice(-limit);
    const hasMore = merged.length > page.length || canonical.length === limit;
    const oldest = page[0];

    // Ulanish holati — panel «Ulanmagan» ogohlantirishini ko'rsatishi uchun.
    const userbot = await this.prisma.client.hrTelegramAccount.findFirst({
      where: { accountId, isActive: true, sessionEncrypted: { not: null } },
      select: { phoneNumber: true },
    });
    // Backfill holati — panel «Tarix yuklanmoqda…»/«xato» bannerini ko'rsatishi uchun.
    const job = await this.prisma.client.telegramBackfillJob.findFirst({
      where: { accountId, counterpartyId },
      select: { status: true, messagesImported: true },
    });

    return {
      counterparty: { id: cp.id, name: cp.name, phone: cp.phone },
      connected: !!userbot,
      fromNumber: userbot?.phoneNumber ?? null,
      items: page,
      backfill: job ? { status: job.status, messagesImported: job.messagesImported } : null,
      hasMore,
      oldestCursor: oldest ? oldest.createdAt.toISOString() : null,
    };
  }

  // --- Telegram Business (owner-account) chats ---------------------------

  async businessStatus(accountId: string) {
    const cfg = await this.prisma.client.telegramConfig.findUnique({ where: { accountId } });
    return {
      configured: !!cfg,
      botUsername: cfg?.botUsername ?? null,
      webhookSet: !!cfg?.webhookUrl,
      connected: !!cfg?.businessConnectionId,
      businessUserName: cfg?.businessUserName ?? null,
    };
  }

  async listChats(accountId: string, raw: Record<string, unknown>) {
    const counterpartyId =
      typeof raw.counterpartyId === 'string' && raw.counterpartyId ? raw.counterpartyId : undefined;
    const unbound = raw.unbound === 'true';
    const q = typeof raw.q === 'string' && raw.q ? raw.q : undefined;
    const items = await this.prisma.client.telegramChat.findMany({
      where: {
        accountId,
        ...(counterpartyId ? { counterpartyId } : {}),
        ...(unbound ? { counterpartyId: null } : {}),
        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { username: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 50,
      include: { counterparty: { select: { id: true, name: true } } },
    });
    return {
      items: items.map((c) => ({
        id: c.id,
        chatId: c.chatId.toString(),
        name:
          [c.firstName, c.lastName].filter(Boolean).join(' ') || c.username || c.chatId.toString(),
        username: c.username,
        phone: c.phone,
        counterparty: c.counterparty,
        /** 'auto' — tizim topgan, 'manual' — qo'lda tanlangan, null — bog'lanmagan. */
        boundBy: c.boundBy,
        source: c.source,
        lastMessageAt: c.lastMessageAt,
      })),
    };
  }

  async listChatMessages(accountId: string, chatRefId: string, raw: Record<string, unknown>) {
    const limit = Math.min(Number(raw.limit) || 30, 200);
    const chat = await this.prisma.client.telegramChat.findFirst({
      where: { id: chatRefId, accountId },
    });
    if (!chat) throw new NotFoundException('Chat topilmadi');
    const rows = await this.prisma.client.telegramChatMessage.findMany({
      where: { accountId, chatRefId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return {
      items: rows.reverse().map((m) => ({
        id: m.id,
        direction: m.direction,
        text: m.text,
        senderName: m.senderName,
        /** 'text' | 'photo' | 'document' | 'voice' | 'video' | 'contact' */
        kind: m.kind,
        /** Rasm/hujjat bo'lsa — `/attachments/:id/raw` orqali ochiladi. */
        attachmentId: m.attachmentId,
        fileName: m.fileName,
        mimeType: m.mimeType,
        /** Avtomatik xabar bo'lsa sababi (qarz berildi / to'lov / ...). */
        autoKind: m.autoKind,
        /** Forward qilingan xabar bo'lsa — asl jo'natuvchi nomi (2026-07-20, Phase 2). */
        fwdFromName: m.fwdFromName,
        createdAt: m.createdAt,
      })),
    };
  }

  async bindChat(accountId: string, chatRefId: string, counterpartyId: string | null) {
    const chat = await this.prisma.client.telegramChat.findFirst({
      where: { id: chatRefId, accountId },
    });
    if (!chat) throw new NotFoundException('Chat topilmadi');
    if (counterpartyId) {
      const cp = await this.prisma.client.counterparty.findFirst({
        where: { id: counterpartyId, accountId },
        select: { id: true },
      });
      if (!cp) throw new NotFoundException('Kontragent topilmadi');
    }
    await this.prisma.client.telegramChat.update({
      where: { id: chat.id },
      data: { counterpartyId, boundBy: counterpartyId ? 'manual' : null },
    });
    return { ok: true };
  }

  /** Send a message ON BEHALF OF the connected Premium account (owner's name). */
  async sendBusinessMessage(accountId: string, chatRefId: string, raw: unknown) {
    const body = raw as { text?: unknown };
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > 4096) {
      throw new BadRequestException('text majburiy (1-4096 belgi)');
    }
    const cfg = await this.requireConfig(accountId);
    if (!cfg.businessConnectionId) {
      throw new BadRequestException(
        "Telegram Business ulanmagan — Telegram'da Settings -> Telegram Business -> Chatbots'da botni ulang",
      );
    }
    const chat = await this.prisma.client.telegramChat.findFirst({
      where: { id: chatRefId, accountId },
    });
    if (!chat) throw new NotFoundException('Chat topilmadi');
    const result = await tgSendMessage(decryptPassword(cfg.botTokenCipher), {
      chatId: chat.chatId.toString(),
      text,
      businessConnectionId: cfg.businessConnectionId,
    });
    const msg = await this.prisma.client.telegramChatMessage.create({
      data: {
        accountId,
        chatRefId: chat.id,
        direction: 'out',
        text,
        tgMessageId: BigInt(result.message_id),
        senderName: cfg.businessUserName,
      },
    });
    await this.prisma.client.telegramChat.update({
      where: { id: chat.id },
      data: { lastMessageAt: new Date() },
    });
    return { id: msg.id, ok: true };
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
