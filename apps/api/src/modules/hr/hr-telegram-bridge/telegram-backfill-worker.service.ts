import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AttachmentService } from '../../attachment/attachment.service.js';
import { olderCursor } from './backfill-plan.util.js';
import { MTPROTO_ADAPTER, type MtprotoAdapter, isMtprotoFloodError } from './mtproto-adapter.js';
import type { HistoryMtprotoMessage } from './telegram-client-factory.js';

/**
 * Talab-bo'yicha to'liq-tarix backfill (2026-07-20). Panel `POST
 * /counterparty/:id/sync` bilan `TelegramBackfillJob` (queued) qo'yadi; bu
 * worker har 20s bitta `queued` job'ni oladi va dialog tarixini sahifalab
 * (yangi→eski) `TelegramChatMessage`ga yozadi (dedup `@@unique([chatRefId,
 * tgMessageId])` — idempotent). Har tick faqat N sahifa (klientni uzoq
 * ushlamaslik + flood hurmati) — qolgani job 'queued' holida keyingi tick'ga
 * qoladi. Dialog boshiga yetganda `historyComplete=true`, job='done'.
 *
 * Media (chek/rasm) DARHOL `Attachment`ga yuklab olinadi — MTProto
 * `file_reference` eskirgani uchun lazy ishonchsiz. 10MB'dan katta fayl
 * `createFromBuffer`da rad etiladi → xato yutiladi (xabar attachmentsiz
 * saqlanadi, backfill bloklanmaydi).
 */
@Injectable()
export class TelegramBackfillWorkerService {
  private readonly logger = new Logger(TelegramBackfillWorkerService.name);
  private static readonly MAX_PAGES_PER_TICK = 3;
  private static readonly PAGE_SIZE = 100;
  private running = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MTPROTO_ADAPTER) private readonly adapter: MtprotoAdapter,
    @Inject(AttachmentService) private readonly attachments: AttachmentService,
  ) {}

  @Cron('*/20 * * * * *')
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.runOnce();
    } catch (e) {
      this.logger.error(`Backfill tick failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** Test/observability — bitta queued job'ni bir tick (≤N sahifa) qayta ishlaydi. */
  async runOnce(): Promise<{ imported: number; done: number }> {
    const job = await this.prisma.client.telegramBackfillJob.findFirst({
      where: { status: 'queued' },
      orderBy: { requestedAt: 'asc' },
    });
    if (!job) return { imported: 0, done: 0 };

    // Atomik claim: queued → running (parallel instansiya poygasini yopadi).
    const claim = await this.prisma.client.telegramBackfillJob.updateMany({
      where: { id: job.id, status: 'queued' },
      data: { status: 'running', startedAt: new Date() },
    });
    if (claim.count === 0) return { imported: 0, done: 0 };

    let imported = 0;
    let offsetId = job.cursorOffsetId != null ? Number(job.cursorOffsetId) : undefined;
    let complete = false;
    try {
      for (let page = 0; page < TelegramBackfillWorkerService.MAX_PAGES_PER_TICK; page++) {
        const { messages, peerId } = await this.adapter.fetchHistory({
          accountId: job.accountId,
          phone: job.phone,
          limit: TelegramBackfillWorkerService.PAGE_SIZE,
          offsetId,
        });
        if (messages.length === 0) {
          complete = true;
          break;
        }
        const chat = await this.ensureChat(job.accountId, job.counterpartyId, job.phone, peerId);
        for (const m of messages) {
          await this.persistMessage(job.accountId, chat.id, m);
          imported++;
        }
        const oldest = olderCursor(messages.map((m) => ({ tgMessageId: m.tgMessageId })));
        if (oldest != null) offsetId = oldest;
        await this.prisma.client.telegramChat.update({
          where: { id: chat.id },
          data: { historyOldestId: offsetId != null ? BigInt(offsetId) : undefined },
        });
        // To'liq sahifadan kam keldi = dialog boshiga yetildi.
        if (messages.length < TelegramBackfillWorkerService.PAGE_SIZE) {
          complete = true;
          break;
        }
      }

      await this.prisma.client.telegramBackfillJob.update({
        where: { id: job.id },
        data: {
          status: complete ? 'done' : 'queued',
          cursorOffsetId: offsetId != null ? BigInt(offsetId) : null,
          messagesImported: { increment: imported },
          ...(complete ? { finishedAt: new Date() } : {}),
        },
      });
      if (complete) await this.markChatComplete(job.accountId, job.counterpartyId);
      return { imported, done: complete ? 1 : 0 };
    } catch (e) {
      const flood = isMtprotoFloodError(e);
      await this.prisma.client.telegramBackfillJob.update({
        where: { id: job.id },
        // Flood → keyin qayta urinish uchun 'queued' (1 daqiqadan keyin);
        // boshqa xato → 'error' (panel «tarixni yuklab bo'lmadi» ko'rsatadi).
        data: flood
          ? { status: 'queued', requestedAt: new Date(Date.now() + 60_000) }
          : { status: 'error', failReason: `${(e as Error).message}`.slice(0, 500) },
      });
      this.logger.warn(
        `Backfill job ${job.id} ${flood ? 'flood→requeue' : 'error'}: ${(e as Error).message}`,
      );
      return { imported, done: 0 };
    }
  }

  /**
   * Catch-up — doimiy listener uzilgan payt o'tkazib yuborilgan xabarlarni
   * to'ldiradi (2026-07-20). `syncNewestId`li bog'langan chatlar uchun `minId`
   * bilan yangi xabarlarni tortadi, kursorni ilgarilaydi. Past chastota +
   * tick'ga cheklov (flood-xavfsiz).
   */
  @Cron('0 */5 * * * *') // har 5 daqiqa
  async catchUpTick(): Promise<void> {
    const chats = await this.prisma.client.telegramChat.findMany({
      where: {
        counterpartyId: { not: null },
        syncNewestId: { not: null },
        phone: { not: null },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 20,
      select: { id: true, accountId: true, phone: true, syncNewestId: true },
    });
    for (const chat of chats) {
      if (!chat.phone || chat.syncNewestId == null) continue;
      const from = Number(chat.syncNewestId);
      try {
        const { messages } = await this.adapter.fetchHistory({
          accountId: chat.accountId,
          phone: chat.phone,
          limit: 50,
          minId: from,
        });
        let newest = from;
        for (const m of messages) {
          await this.persistMessage(chat.accountId, chat.id, m);
          if (m.tgMessageId > newest) newest = m.tgMessageId;
        }
        if (newest > from) {
          await this.prisma.client.telegramChat.update({
            where: { id: chat.id },
            data: { syncNewestId: BigInt(newest) },
          });
        }
      } catch (e) {
        this.logger.warn(`catch-up chat=${chat.id}: ${(e as Error).message}`);
      }
    }
  }

  /**
   * Bitta tarix/catch-up xabarini idempotent yozadi (`@@unique([chatRefId,
   * tgMessageId])`) + media'ni (yangi bo'lsa) darhol `Attachment`ga yuklaydi.
   * Backfill va catch-up shu yagona yo'ldan foydalanadi (DRY).
   */
  private async persistMessage(
    accountId: string,
    chatRefId: string,
    m: HistoryMtprotoMessage,
  ): Promise<void> {
    const created = await this.prisma.client.telegramChatMessage.upsert({
      where: { chatRefId_tgMessageId: { chatRefId, tgMessageId: BigInt(m.tgMessageId) } },
      update: {},
      create: {
        accountId,
        chatRefId,
        direction: m.direction,
        text: m.text.slice(0, 4096),
        tgMessageId: BigInt(m.tgMessageId),
        senderName: m.senderName,
        kind: m.kind,
        mimeType: m.mimeType,
        fileName: m.fileName,
        fwdFromName: m.fwdFromName,
        replyToTgMessageId: m.replyToTgMessageId != null ? BigInt(m.replyToTgMessageId) : null,
        createdAt: new Date(m.date * 1000),
      },
    });
    if (m.downloadMedia && !created.attachmentId) {
      await this.storeMedia(accountId, created.id, m).catch((e: Error) =>
        this.logger.warn(`media saqlanmadi (xabar saqlandi): ${e.message}`),
      );
    }
  }

  /**
   * Chat'ni peer'ning Telegram user-id'si (`chatId`) bo'yicha topadi/ochadi —
   * `handleIncoming` ham xuddi shu `chatId` (senderId) ni ishlatadi, shuning
   * uchun backfill va jonli kiruvchi BIR chatga birlashadi (dublikat yo'q,
   * `chatId=0` to'qnashuvi yo'q). `counterpartyId`ni ham o'rnatadi (chat shu
   * kontragentga bog'lanadi — avto-bog'lash muvaffaqiyatsiz bo'lsa ham).
   * `peerId` aniqlanmasa — chat yaratib bo'lmaydi (job 'error' bo'ladi).
   */
  private async ensureChat(
    accountId: string,
    counterpartyId: string,
    phone: string,
    peerId: string | null,
  ) {
    if (!peerId) throw new Error("backfill: peer user-id aniqlanmadi (chat kalitlab bo'lmaydi)");
    const chatId = BigInt(peerId);
    return this.prisma.client.telegramChat.upsert({
      where: { accountId_chatId: { accountId, chatId } },
      // Mavjud (jonli) chat'ni shu kontragentga bog'laymiz; lastMessageAt'ga
      // TEGMAYMIZ (backfill tarixiy — recent-chats tartibini buzmaslik uchun).
      update: { counterpartyId, phone },
      create: {
        accountId,
        chatId,
        phone,
        source: 'mtproto',
        counterpartyId,
        boundBy: 'auto',
        lastMessageAt: new Date(),
      },
    });
  }

  private async markChatComplete(accountId: string, counterpartyId: string): Promise<void> {
    await this.prisma.client.telegramChat.updateMany({
      where: { accountId, counterpartyId },
      data: { historyComplete: true },
    });
  }

  private async storeMedia(
    accountId: string,
    messageId: string,
    m: Pick<HistoryMtprotoMessage, 'downloadMedia' | 'fileName' | 'mimeType'>,
  ): Promise<void> {
    if (!m.downloadMedia) return;
    const buffer = await m.downloadMedia();
    const attachment = await this.attachments.createFromBuffer(accountId, null, {
      entity: 'TelegramChatMessage',
      entityId: messageId,
      filename: m.fileName ?? 'telegram-file',
      mime: m.mimeType ?? 'application/octet-stream',
      buffer,
      description: 'Telegram chat — backfill fayli (MTProto)',
    });
    await this.prisma.client.telegramChatMessage.update({
      where: { id: messageId },
      data: { attachmentId: attachment.id },
    });
  }
}
