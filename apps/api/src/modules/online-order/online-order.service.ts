import { randomBytes } from 'node:crypto';
import type { Prisma } from '@moysklad/db';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { decryptPassword, encryptPassword } from '../email/crypto.js';
import { INBOUND_SIGNATURE_HEADER, verifyInboundSignature } from './online-order.inbound.js';
import {
  ConvertOnlineOrderSchema,
  CreateOnlineOrderSchema,
  InboundOnlineOrderSchema,
  OnlineOrderFilterSchema,
  RejectOnlineOrderSchema,
} from './online-order.schema.js';

/** `SalesChannel.settings` ichida kiruvchi webhook sirining shifrlangan kaliti. */
const SECRET_SETTINGS_KEY = 'inboundWebhookSecretCipher';

/**
 * OnlineOrderService — list, accept, reject, convertToCustomerOrder.
 *
 * `convertToCustomerOrder` mavjud CustomerOrder ga **bog'laydi** (batafsil izoh
 * metodning o'zida). Buyurtmani `items` dan **avtomatik qurish** hali yo'q —
 * `OnlineOrder.items` erkin JSON bo'lgani uchun mahsulot moslashtirish kerak;
 * u 2-bo'lim TZ B1 bosqichida qilinadi.
 */
@Injectable()
export class OnlineOrderService {
  private readonly logger = new Logger(OnlineOrderService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = OnlineOrderFilterSchema.parse(rawFilter);

    const where: Prisma.OnlineOrderWhereInput = {
      accountId,
      ...(filter.channelId ? { channelId: filter.channelId } : {}),
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.dateFrom || filter.dateTo
        ? {
            receivedAt: {
              ...(filter.dateFrom ? { gte: filter.dateFrom } : {}),
              ...(filter.dateTo ? { lte: filter.dateTo } : {}),
            },
          }
        : {}),
      ...(filter.search
        ? {
            OR: [
              { customerName: { contains: filter.search, mode: 'insensitive' } },
              { customerPhone: { contains: filter.search, mode: 'insensitive' } },
              { externalOrderId: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(filter.cursor ? { id: { lt: filter.cursor } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.client.onlineOrder.findMany({
        where,
        orderBy: { [filter.sortBy]: filter.sortDir },
        take: filter.limit,
        include: {
          channel: { select: { id: true, name: true, kind: true } },
        },
      }),
      this.prisma.client.onlineOrder.count({ where }),
    ]);

    const nextCursor = items.length === filter.limit ? items[items.length - 1]?.id : undefined;

    // BigInt → string serialization
    const serialized = items.map((o) => ({
      ...o,
      sumMinor: o.sumMinor.toString(),
    }));

    return { items: serialized, total, nextCursor };
  }

  async findById(accountId: string, id: string) {
    const order = await this.prisma.client.onlineOrder.findFirst({
      where: { id, accountId },
      include: {
        channel: { select: { id: true, name: true, kind: true } },
      },
    });
    if (!order) throw new NotFoundException('Online order not found');
    return { ...order, sumMinor: order.sumMinor.toString() };
  }

  async create(accountId: string, rawBody: unknown) {
    const data = CreateOnlineOrderSchema.parse(rawBody);

    // Verify channel belongs to this account
    const channel = await this.prisma.client.salesChannel.findFirst({
      where: { id: data.channelId, accountId },
    });
    if (!channel) throw new NotFoundException('Sales channel not found');

    try {
      const created = await this.prisma.client.onlineOrder.create({
        data: {
          accountId,
          channelId: data.channelId,
          externalOrderId: data.externalOrderId,
          customerName: data.customerName ?? null,
          customerPhone: data.customerPhone ?? null,
          customerAddress: data.customerAddress ?? null,
          sumMinor: data.sumMinor,
          currency: data.currency,
          items: data.items ?? undefined,
          receivedAt: data.receivedAt ?? new Date(),
        },
      });
      return { ...created, sumMinor: created.sumMinor.toString() };
    } catch (e: unknown) {
      if (
        typeof e === 'object' &&
        e !== null &&
        'code' in e &&
        (e as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException(
          `Order ${data.externalOrderId} already exists for this channel`,
        );
      }
      throw e;
    }
  }

  async accept(accountId: string, id: string) {
    const order = await this.findById(accountId, id);
    if (order.state !== 'pending') {
      throw new BadRequestException(`Cannot accept order in state '${order.state}'`);
    }
    const updated = await this.prisma.client.onlineOrder.update({
      where: { id },
      data: { state: 'accepted' },
    });
    return { ...updated, sumMinor: updated.sumMinor.toString() };
  }

  async reject(accountId: string, id: string, rawBody: unknown) {
    const order = await this.findById(accountId, id);
    if (order.state !== 'pending') {
      throw new BadRequestException(`Cannot reject order in state '${order.state}'`);
    }
    const body = RejectOnlineOrderSchema.parse(rawBody ?? {});
    const updated = await this.prisma.client.onlineOrder.update({
      where: { id },
      data: {
        state: 'rejected',
        // Store rejection reason in lastSyncMsg-style field
        // TODO V2: add rejectionReason column
      },
    });
    void body; // reason acknowledged but not yet persisted (V2 column)
    return { ...updated, sumMinor: updated.sumMinor.toString() };
  }

  /**
   * convertToCustomerOrder — onlayn buyurtmani HAQIQIY xaridor buyurtmasiga bog'laydi.
   *
   * Ilgari (V1 stub) bu yer `customerOrderId` ga **tasodifiy generatsiya qilingan
   * UUID** yozardi — bazada hech qayerga ishora qilmaydigan havola qolardi. Bu
   * shunchaki «bajarilmagan funksiya» emas, **ma'lumot yaxlitligining buzilishi**:
   * hisobot yoki integratsiya o'sha id bo'yicha buyurtma qidirsa topa olmaydi va
   * sababi ko'rinmaydi (TZ 2-bo'lim §0.1/1).
   *
   * Hozirgi xulq:
   *   1. Holat `accepted` ekanini tekshiradi
   *   2. Berilgan `customerOrderId` **shu ijarachida mavjud** ekanini tekshiradi
   *   3. Faqat shundan keyin `converted` ga o'tkazadi va bog'laydi
   * Aks holda hech narsa yozilmaydi — hujjat `accepted` da qoladi.
   *
   * Avtomatik yaratish (`CustomerOrder` ni `items` dan qurish) hozir imkonsiz:
   * `OnlineOrder.items` — erkin JSON (`{name, qty, price}`), `productId` yo'q,
   * `agentId`/`organizationId` ham yo'q. U 2-bo'lim TZ B1 bosqichida, mahsulot
   * moslashtirish bilan birga qilinadi va **shu bog'lash yo'lini** chaqiradi.
   */
  async convertToCustomerOrder(accountId: string, id: string, rawBody: unknown) {
    const { customerOrderId } = ConvertOnlineOrderSchema.parse(rawBody ?? {});

    const order = await this.findById(accountId, id);
    if (order.state !== 'accepted') {
      throw new BadRequestException(
        `Cannot convert order in state '${order.state}'. Order must be accepted first.`,
      );
    }

    // Ijarachi ichida mavjudligini tasdiqlash — soxta/begona id yozilmasin.
    const target = await this.prisma.client.customerOrder.findFirst({
      where: { id: customerOrderId, accountId, deletedAt: null },
      select: { id: true },
    });
    if (!target) {
      throw new NotFoundException('Bog‘lanadigan xaridor buyurtmasi topilmadi');
    }

    const updated = await this.prisma.client.onlineOrder.update({
      where: { id },
      data: { state: 'converted', customerOrderId },
    });
    return { ...updated, sumMinor: updated.sumMinor.toString() };
  }

  // --- F042: tashqi kanaldan webhook qabul qilish (TZ §4.4) ---------------

  /**
   * Kanalning kiruvchi webhook sirini yangilaydi (rotatsiya) va ochiq matnni
   * **bir marta** qaytaradi — bazada faqat AES-GCM shifri saqlanadi
   * (`email/crypto.ts` naqshi, Payme/Click creds bilan bir xil).
   *
   * `settings` PATCH-semantikada yangilanadi: kanalning boshqa kalitlari (do'kon
   * URL'i, API versiyasi…) saqlanadi. Butun obyektni almashtirish INT-13 dagi
   * «jimgina o'chib ketgan callback URL» hodisasining aynan o'zi bo'lardi.
   */
  async rotateWebhookSecret(accountId: string, channelId: string) {
    const channel = await this.prisma.client.salesChannel.findFirst({
      where: { id: channelId, accountId },
      select: { id: true, settings: true },
    });
    if (!channel) throw new NotFoundException('Sales channel not found');

    const secret = randomBytes(32).toString('hex');
    const current =
      channel.settings && typeof channel.settings === 'object' && !Array.isArray(channel.settings)
        ? (channel.settings as Prisma.JsonObject)
        : {};

    await this.prisma.client.salesChannel.update({
      where: { id: channelId },
      data: { settings: { ...current, [SECRET_SETTINGS_KEY]: encryptPassword(secret) } },
    });

    return {
      channelId,
      /** Ochiq matn FAQAT shu javobda — keyin qayta ko'rsatib bo'lmaydi. */
      secret,
      headerName: INBOUND_SIGNATURE_HEADER,
      path: `/api/v1/webhooks/online-orders/${channelId}`,
    };
  }

  /**
   * Tashqi kanaldan kelgan buyurtmani qabul qiladi (guard'siz, ochiq endpoint).
   *
   * Tartib ATAYLAB shunday:
   *   1. **Autentifikatsiya** — kanal siri bilan xom tana imzosi (constant-time).
   *      Kanal topilmasa ham, siri sozlanmagan bo'lsa ham, imzo mos kelmasa ham —
   *      bir xil `401`. Sabab farqlanmaydi: aks holda javob kanal id'sini yoki
   *      sozlanganlik holatini oshkor qiluvchi oracle bo'lardi.
   *   2. **Avtorizatsiya** — kanal arxivlanganmi. Faqat imzo o'tgandan keyin, aks
   *      holda arxiv holatini imzosiz aniqlash mumkin bo'lardi.
   *   3. **Validatsiya** — Zod (yaroqsiz tana → 400, global filtr orqali).
   *   4. **Idempotentlik** — `(channelId, externalOrderId)`. Mavjud bo'lsa yangi hujjat
   *      YARATILMAYDI; `duplicate: true` qaytadi. Ikki so'rov bir vaqtda kelsa
   *      `P2002` tutiladi va o'sha mavjud yozuv qaytariladi (500 emas).
   *
   * Sir, kutilgan imzo va tana MATNI hech qachon log'ga yoki javobga chiqmaydi.
   */
  async ingestWebhook(
    channelId: string,
    rawBody: Buffer | string | undefined,
    signatureHeader: string | undefined,
  ) {
    const channel = await this.prisma.client.salesChannel.findUnique({
      where: { id: channelId },
      select: { id: true, accountId: true, archived: true, settings: true },
    });

    const secret = channel ? this.readWebhookSecret(channel.settings) : null;
    if (!channel || !verifyInboundSignature(rawBody, signatureHeader, secret)) {
      // Bitta umumiy xabar — 401 ning sababi tashqariga ko'rinmaydi.
      this.logger.warn(`Rejected online-order webhook for channel ${channelId}: bad signature`);
      throw new UnauthorizedException('Invalid signature');
    }

    if (channel.archived) {
      throw new ForbiddenException('Sales channel is archived');
    }

    const text = typeof rawBody === 'string' ? rawBody : (rawBody as Buffer).toString('utf8');
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(text);
    } catch {
      throw new BadRequestException('Body is not valid JSON');
    }
    const data = InboundOnlineOrderSchema.parse(parsedJson);

    const key = { channelId_externalOrderId: { channelId, externalOrderId: data.externalOrderId } };
    const existing = await this.prisma.client.onlineOrder.findUnique({ where: key });
    if (existing) return this.ingestResult(existing, true);

    try {
      const created = await this.prisma.client.onlineOrder.create({
        data: {
          accountId: channel.accountId,
          channelId,
          externalOrderId: data.externalOrderId,
          customerName: data.customerName ?? null,
          customerPhone: data.customerPhone ?? null,
          customerAddress: data.customerAddress ?? null,
          sumMinor: data.sumMinor,
          currency: data.currency,
          items: data.items ?? undefined,
          receivedAt: data.receivedAt ?? new Date(),
        },
      });
      return this.ingestResult(created, false);
    } catch (e: unknown) {
      // Poyga: bir xil hodisa ikki so'rovda bir vaqtda keldi. Unique indeks
      // ikkinchisini to'sdi — bu xato emas, aynan kutilgan idempotentlik.
      if (typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002') {
        const raced = await this.prisma.client.onlineOrder.findUnique({ where: key });
        if (raced) return this.ingestResult(raced, true);
      }
      throw e;
    }
  }

  /** Shifrlangan sirni `settings` dan o'qiydi. Kalit yo'q/buzuq → `null` (fail-closed). */
  private readWebhookSecret(settings: unknown): string | null {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null;
    const cipher = (settings as Record<string, unknown>)[SECRET_SETTINGS_KEY];
    if (typeof cipher !== 'string' || cipher.length === 0) return null;
    try {
      return decryptPassword(cipher);
    } catch {
      // Kalit rotatsiyasi yoki buzilgan yozuv — sir yo'q deb hisoblanadi.
      return null;
    }
  }

  private ingestResult(order: { id: string; state: string }, duplicate: boolean) {
    return { ok: true as const, id: order.id, state: order.state, duplicate };
  }

  async counts(accountId: string) {
    const [pending, accepted, total] = await Promise.all([
      this.prisma.client.onlineOrder.count({ where: { accountId, state: 'pending' } }),
      this.prisma.client.onlineOrder.count({ where: { accountId, state: 'accepted' } }),
      this.prisma.client.onlineOrder.count({ where: { accountId } }),
    ]);
    return { pending, accepted, total };
  }
}
