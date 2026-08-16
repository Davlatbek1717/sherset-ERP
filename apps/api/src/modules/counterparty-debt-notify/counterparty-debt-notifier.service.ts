import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service.js';
import { type CounterpartyBalanceChangedEvent, HR_EVENT } from '../hr/hr-shared/hr-events.types.js';
import { buildCounterpartyMessage } from './counterparty-message.util.js';
import { buildDebtMessage } from './debt-notify.util.js';
import { ensureReceiptLink } from './receipt-link.util.js';

const BOT_API_TIMEOUT_MS = 10_000;

/**
 * `HrTelegramOutbox.sourceEventType` tag for the counterparty-facing debt/
 * payment notices this service enqueues. Also the dedup key (with sourceDocId)
 * so a re-emitted balance event never double-messages the counterparty.
 */
const COUNTERPARTY_NOTIFY_EVENT = 'debt.counterparty_notify';

/**
 * Prisma `Decimal` `String()` da «100.000000» beradi — chekda «100 m» bo'lishi
 * kerak. Kasr qismi bo'lsa saqlanadi («2.5 kg»), bo'lmasa nuqta ham olib tashlanadi.
 */
function trimDecimal(v: string): string {
  return v.includes('.') ? v.replace(/0+$/, '').replace(/\.$/, '') : v;
}

/**
 * Counterparty debt/payment Telegram notifier — TWO independent deliveries per
 * balance change (emitted by CounterpartyBalanceService.applyDelta):
 *
 *   1. OWNER alert (Bot API, Uzbek Markdown → the owner's Telegram group).
 *      Gated on env DEBT_NOTIFY_BOT_TOKEN + DEBT_NOTIFY_CHAT_ID; absent ⇒
 *      silent no-op (dormant until an owner wires a bot/group).
 *
 *   2. COUNTERPARTY notice (MTProto outbox → the counterparty's own chat). We
 *      enqueue an `HrTelegramOutbox` row (status='pending') keyed to the
 *      counterparty's phone; the admin-slot outbox worker delivers it. Requires
 *      a phone on the counterparty AND a logged-in admin MTProto slot at
 *      runtime — both absent-safe: no phone ⇒ skip (log, no row); no slot ⇒
 *      the row just sits `pending` until a slot logs in (dormant, no error).
 *
 * The two deliveries are INDEPENDENT: each runs in its own try/catch, so a
 * failure (or missing config) in one never blocks the other. The whole handler
 * mirrors HrAdminNotifier: @OnEvent({ async, promisify }) → OUT-OF-BAND on the
 * event loop, never inline in the caller's transaction, and can NEVER throw
 * back into the event bus / source document flow (proven by test).
 *
 * Only "real" debt/payment postings carry a `source` (threaded through
 * applyDelta's `meta`). Reversals (unpost/cancel), rebalances and internal
 * adjustments arrive with `source === undefined` ⇒ both deliveries skip, so
 * neither owner nor counterparty is spammed by internal churn.
 *
 * Dedup: the counterparty row is keyed by (sourceEventType, sourceDocId=docId);
 * a re-emitted event for the same document never enqueues a second notice.
 *
 * Optional env DEBT_NOTIFY_THRESHOLD_MINOR: when set and abs(newBalance)
 * exceeds it, the OWNER message gets an extra ⚠️ warning line. It never
 * suppresses a message — absent threshold ⇒ every real change still notifies.
 */
@Injectable()
export class CounterpartyDebtNotifier {
  private readonly logger = new Logger(CounterpartyDebtNotifier.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @OnEvent(HR_EVENT.COUNTERPARTY_BALANCE_CHANGED, { async: true, promisify: true })
  async onBalanceChanged(payload: CounterpartyBalanceChangedEvent): Promise<void> {
    // Automatic per-transaction TEXT alerts are OFF by default (owner 2026-07-26:
    // «faqat Excel akt, matn yo'q» — the only counterparty communication is the
    // button-triggered akt-sverka Excel). Opt-in only: an operator must set
    // DEBT_NOTIFY_ENABLED=true to bring the text alerts back.
    if (process.env.DEBT_NOTIFY_ENABLED !== 'true') return;
    if (!payload.source) return; // reversal / rebalance / adjustment — no alert

    // Shared prerequisite for both deliveries: the counterparty's name (owner
    // message) and phone (counterparty outbox). Read once; a lookup failure
    // skips both (nothing to address), never throws into the event bus.
    // `attributes` — «tanish kontakt» qulfi uchun (`tgid` shu yerda turadi).
    let cp: { name: string; phone: string | null; attributes: unknown } | null;
    try {
      cp = await this.prisma.client.counterparty.findFirst({
        where: { id: payload.counterpartyId, accountId: payload.accountId },
        select: { name: true, phone: true, attributes: true },
      });
    } catch (e) {
      this.logger.warn(`debt notify: counterparty lookup failed: ${(e as Error).message}`);
      return;
    }
    if (!cp) return;

    // Report header data — the source document's number + date (best-effort; a
    // miss just omits those header parts). Shared by both deliveries.
    const doc = await this.fetchDocMeta(payload.docType, payload.docId, payload.accountId);

    // Two INDEPENDENT deliveries — each self-contained so one cannot block the
    // other. Awaited sequentially (single event loop); neither can throw.
    await this.notifyOwner(payload, cp.name, doc);
    await this.notifyCounterparty(payload, cp.name, cp.phone, doc, cp.attributes);
  }

  /**
   * Best-effort lookup of the source document's number (`name`) + date
   * (`moment`) for the report header, keyed by the event's docType+docId. Any
   * miss / error ⇒ null (the message builders then omit the header parts).
   */
  /**
   * Avtomatik xabarni KONTRAGENT SUHBAT IPIGA ko'chiradi.
   *
   * Nega kerak: kiruvchi xabarlar (MTProto ham, Business ham)
   * `TelegramChatMessage` ga normallashtiriladi va kartochkadagi ipda
   * ko'rinadi, chiquvchi AVTOMATIK xabar esa faqat outbox'da qolardi.
   * Natijada operator mijozning javobini ko'rib, nimaga javob berganini
   * ko'rmasdi — va o'sha gapni qaytadan yozardi.
   *
   * 🔴 CHEKLOV (o'lchangan): `TelegramChat.chatId` MAJBURIY va u Telegram
   * `userId` siga teng; hali hal qilinmagan raqamning `userId` si faqat
   * YUBORISH paytida (`resolvePhone`) aniqlanadi. Shuning uchun chati YO'Q
   * mijozda bu yerda ip qatori yozilmaydi — soxta `chatId` yozish
   * `@@unique([accountId, chatId])` ni buzardi.
   *
   * Hech qachon throw qilmaydi: ip — KO'RSATISH qatlami, uning nosozligi
   * xabarning o'zini to'xtatmasligi kerak (outbox allaqachon yozilgan).
   */
  private async mirrorToThread(
    payload: CounterpartyBalanceChangedEvent,
    text: string,
    outboxId: string,
    senderName: string,
  ): Promise<void> {
    try {
      const chat = await this.prisma.client.telegramChat.findFirst({
        where: { accountId: payload.accountId, counterpartyId: payload.counterpartyId },
        orderBy: { lastMessageAt: 'desc' },
        select: { id: true },
      });
      if (!chat) return; // chat hali yo'q — birinchi yuborishdan keyin ochiladi

      await this.prisma.client.telegramChatMessage.create({
        data: {
          accountId: payload.accountId,
          chatRefId: chat.id,
          direction: 'out',
          text: text.slice(0, 4096),
          kind: 'text',
          senderName,
          // Yo'nalish ishorasidan: qarz oshdi ⇒ «berildi», kamaydi ⇒ «to'lov».
          autoKind: payload.deltaMinor > 0n ? 'debt_issued' : 'payment',
          outboxId,
        },
      });
    } catch (e) {
      this.logger.warn(`suhbat ipiga yozilmadi: ${(e as Error).message}`);
    }
  }

  /**
   * Kassa cheki tafsiloti — FAQAT `retailsale` uchun o'qiladi (boshqa turlarda
   * ortiqcha so'rov qilinmaydi). Xato bo'lsa `null`: xabar baribir ketadi,
   * shunchaki tovar ro'yxatisiz — chek tafsiloti xabarni BLOKLAMASLIGI kerak.
   */
  private async fetchReceiptDetails(
    accountId: string,
    docId: string | undefined,
  ): Promise<{
    orgName: string | null;
    items: Array<{ name: string; quantity: string; uom: string | null }>;
    paidMinor: bigint | null;
  } | null> {
    if (!docId) return null;
    try {
      const sale = await this.prisma.client.retailSale.findFirst({
        where: { id: docId, accountId },
        select: {
          payedSumMinor: true,
          organization: { select: { name: true } },
          positions: {
            orderBy: { position: 'asc' },
            select: { quantity: true, product: { select: { name: true, uom: true } } },
          },
        },
      });
      if (!sale) return null;
      // 🔴 O'LCHANGAN (2026-08-16): prodda 33 ta to'langan chekning BIRORTASIDA
      // ham `organizationId` yo'q ⇒ do'kon nomi xabarda hech qachon
      // chiqmasdi. Chek tashkilotga bog'lanmagan bo'lsa akkauntning
      // tashkilotiga tushamiz (bu bazada u bitta).
      const orgName =
        sale.organization?.name ??
        (
          await this.prisma.client.organization.findFirst({
            where: { accountId },
            orderBy: { createdAt: 'asc' },
            select: { name: true },
          })
        )?.name ??
        null;
      return {
        orgName,
        items: (sale.positions ?? [])
          .filter((p): p is typeof p & { product: { name: string; uom: string | null } } =>
            Boolean(p.product),
          )
          .map((p) => ({
            name: p.product.name,
            quantity: trimDecimal(String(p.quantity)),
            uom: p.product.uom,
          })),
        paidMinor: sale.payedSumMinor,
      };
    } catch (e) {
      this.logger.warn(`debt notify: chek tafsiloti o'qilmadi: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * Chek uchun OCHIQ HAVOLA (`/p/<token>`) — MoySklad'ning `mskld.ru/...`
   * havolasi ekvivalenti.
   *
   * Havola chek POST qilinganda emas, xabar yuborilayotganda yaratiladi:
   * shu bilan POS'ning pul/stok tranzaksiyasiga yangi bog'liqlik qo'shilmaydi
   * (u ishonchlilik uchun eng sezgir yo'l). Idempotent — mavjud bo'lsa o'sha
   * token qaytariladi, ya'ni takroriy hodisa yangi havola yasamaydi.
   *
   * 🔴 Havola KALITGA TENG: kim topsa chekni ko'radi. Shuning uchun muddat
   * majburiy (`RECEIPT_LINK_TTL_DAYS`, sukut 90 kun).
   */
  // `fetchOrCreateReceiptLink` OLIB TASHLANDI (2026-08-16): aynan shu mantiq
  // «hisob-kitob cheki»ga ham kerak bo'ldi va nusxa ikkiga ajralib ketardi.
  // Endi yagona manba — `./receipt-link.util.ts` (`ensureReceiptLink`).

  private async fetchDocMeta(
    docType: string | undefined,
    docId: string | undefined,
    accountId: string,
  ): Promise<{ number: string; moment: Date } | null> {
    if (!docType || !docId) return null;
    const where = { id: docId, accountId };
    const select = { name: true, moment: true } as const;
    try {
      let row: { name: string; moment: Date } | null = null;
      switch (docType) {
        case 'invoiceOut':
          row = await this.prisma.client.invoiceOut.findFirst({ where, select });
          break;
        case 'invoiceIn':
          row = await this.prisma.client.invoiceIn.findFirst({ where, select });
          break;
        case 'supply':
          row = await this.prisma.client.supply.findFirst({ where, select });
          break;
        case 'cashIn':
          row = await this.prisma.client.cashIn.findFirst({ where, select });
          break;
        case 'cashOut':
          row = await this.prisma.client.cashOut.findFirst({ where, select });
          break;
        case 'paymentIn':
          row = await this.prisma.client.paymentIn.findFirst({ where, select });
          break;
        case 'paymentOut':
          row = await this.prisma.client.paymentOut.findFirst({ where, select });
          break;
        // ── Kassa oqimi (2026-08-16) ────────────────────────────────────────
        // Uchalasi UCH XIL shaklda: `RetailSale` da `moment` bor, `Debt` da
        // faqat `createdAt`, `debtpayment` ning `docId` esa jadval PK'si EMAS —
        // u batch identifikatori (`DebtPayment.batchId`).
        case 'retailsale':
          row = await this.prisma.client.retailSale.findFirst({ where, select });
          break;
        case 'debt': {
          const d = await this.prisma.client.debt.findFirst({
            where,
            select: { name: true, createdAt: true },
          });
          return d ? { number: d.name, moment: d.createdAt } : null;
        }
        case 'debtpayment': {
          // Batch'ning o'z raqami yo'q ⇒ faqat sana beriladi (bo'sh raqam
          // sarlavhada umuman chizilmaydi).
          const p = await this.prisma.client.debtPayment.findFirst({
            where: { accountId, batchId: docId },
            select: { createdAt: true },
            orderBy: { createdAt: 'asc' },
          });
          return p ? { number: '', moment: p.createdAt } : null;
        }
        default:
          return null;
      }
      return row ? { number: row.name, moment: row.moment } : null;
    } catch (e) {
      this.logger.warn(`debt notify: doc meta lookup failed: ${(e as Error).message}`);
      return null;
    }
  }

  /** OWNER alert via the Bot API. Self-contained: never throws. */
  private async notifyOwner(
    payload: CounterpartyBalanceChangedEvent,
    name: string,
    doc: { number: string; moment: Date } | null,
  ): Promise<void> {
    try {
      if (!payload.source) return;
      const text = buildDebtMessage({
        name,
        currency: payload.currency,
        deltaMinor: payload.deltaMinor,
        newBalanceMinor: payload.newBalanceMinor,
        source: payload.source,
        overThreshold: this.isOverThreshold(payload.newBalanceMinor),
        docNumber: doc?.number,
        docMoment: doc?.moment,
      });
      if (!text) return;
      await this.sendViaBot(text);
    } catch (e) {
      this.logger.warn(`owner debt notify failed: ${(e as Error).message}`);
    }
  }

  /**
   * COUNTERPARTY notice: enqueue an HrTelegramOutbox row (admin MTProto slot
   * delivers it). Self-contained: never throws. Skips silently when the
   * counterparty has no phone, when there is nothing meaningful to say, or when
   * a row for this document was already enqueued (dedup).
   */
  private async notifyCounterparty(
    payload: CounterpartyBalanceChangedEvent,
    name: string,
    phone: string | null,
    doc: { number: string; moment: Date } | null,
    attributes: unknown,
  ): Promise<void> {
    try {
      if (!payload.source) return;
      const toPhone = phone?.trim();
      if (!toPhone) {
        this.logger.log(
          `Counterparty ${payload.counterpartyId} has no phone — skip Telegram notice`,
        );
        return;
      }

      // Chek tafsiloti faqat kassa savdosida bor (tovar ro'yxati + to'langan
      // qism). Qolgan manbalarda `null` ⇒ o'sha qatorlar chizilmaydi.
      const receipt =
        payload.source === 'retailsale'
          ? await this.fetchReceiptDetails(payload.accountId, payload.docId)
          : null;

      const text = buildCounterpartyMessage({
        name,
        currency: payload.currency,
        deltaMinor: payload.deltaMinor,
        newBalanceMinor: payload.newBalanceMinor,
        source: payload.source,
        docNumber: doc?.number,
        docMoment: doc?.moment,
        orgName: receipt?.orgName,
        items: receipt?.items,
        paidMinor: receipt?.paidMinor,
        receiptUrl:
          payload.source === 'retailsale'
            ? await ensureReceiptLink(this.prisma.client, payload.accountId, payload.docId)
            : null,
      });
      if (!text) return; // e.g. non-payment change landing on a zero balance

      // ── QULF 1: «BIRINCHI TO'LQIN» — faqat TANISH kontaktlar ─────────────
      // Xabar egasining SHAXSIY raqamidan ketadi. Hech qachon o'zi yozmagan
      // odamga yozish «Report spam» xavfini tug'diradi — bu MTProto
      // FLOOD_WAIT himoyasi qoplamaydigan BOSHQA xavf klassi (u faqat
      // tezlikni boshqaradi). Sukut bo'yicha YOQILGAN.
      if (process.env.DEBT_NOTIFY_ONLY_KNOWN_CONTACTS !== 'false') {
        const attrs =
          attributes && typeof attributes === 'object' && !Array.isArray(attributes)
            ? (attributes as Record<string, unknown>)
            : {};
        const tgid = attrs.tgid;
        let known = tgid !== undefined && tgid !== null && tgid !== '';
        if (!known) {
          const chats = await this.prisma.client.telegramChat.count({
            where: { accountId: payload.accountId, counterpartyId: payload.counterpartyId },
          });
          known = chats > 0;
        }
        if (!known) {
          this.logger.log(
            `Counterparty ${payload.counterpartyId} noma'lum kontakt — xabar yuborilmadi`,
          );
          return;
        }
      }

      // ── QULF 2: OMMAVIY PORTLASH (backfill bombasi) ──────────────────────
      // Ommaviy skript balansni qayta hisoblasa bir zumda yuzlab hodisa
      // chiqadi va mijozlarga spam ketardi. Bu qulf soniga qarab to'xtatadi.
      const maxPerMinute = Number.parseInt(process.env.DEBT_NOTIFY_MAX_PER_MINUTE ?? '20', 10);
      if (Number.isFinite(maxPerMinute) && maxPerMinute > 0) {
        const recent = await this.prisma.client.hrTelegramOutbox.count({
          where: {
            accountId: payload.accountId,
            sourceEventType: COUNTERPARTY_NOTIFY_EVENT,
            createdAt: { gte: new Date(Date.now() - 60_000) },
          },
        });
        if (recent >= maxPerMinute) {
          this.logger.warn(
            `debt notify: daqiqalik chegara (${maxPerMinute}) to'ldi — ` +
              `${payload.counterpartyId} uchun xabar TASHLANDI (ommaviy amal shubhasi)`,
          );
          return;
        }
      }

      // Dedup: one outbox row per (event-type, source document). A re-emitted
      // balance event for the same doc must not double-message the counterparty.
      if (payload.docId) {
        const existing = await this.prisma.client.hrTelegramOutbox.findFirst({
          where: {
            accountId: payload.accountId,
            counterpartyId: payload.counterpartyId,
            sourceEventType: COUNTERPARTY_NOTIFY_EVENT,
            sourceDocId: payload.docId,
          },
          select: { id: true },
        });
        if (existing) return;
      }

      const outbox = await this.prisma.client.hrTelegramOutbox.create({
        data: {
          accountId: payload.accountId,
          counterpartyId: payload.counterpartyId,
          toPhone,
          messageText: text,
          sourceEventType: COUNTERPARTY_NOTIFY_EVENT,
          sourceDocId: payload.docId ?? null,
          status: 'pending',
        },
        select: { id: true },
      });

      await this.mirrorToThread(payload, text, outbox.id, name);
    } catch (e) {
      this.logger.warn(`counterparty debt notify failed: ${(e as Error).message}`);
    }
  }

  /** abs(newBalance) > DEBT_NOTIFY_THRESHOLD_MINOR (if a valid threshold is set). */
  private isOverThreshold(newBalanceMinor: bigint): boolean {
    const raw = process.env.DEBT_NOTIFY_THRESHOLD_MINOR;
    if (!raw) return false;
    let threshold: bigint;
    try {
      threshold = BigInt(raw);
    } catch {
      return false;
    }
    if (threshold <= 0n) return false;
    const abs = newBalanceMinor < 0n ? -newBalanceMinor : newBalanceMinor;
    return abs > threshold;
  }

  /** POST to the Telegram Bot API. No-op (warn) when not configured. */
  async sendViaBot(text: string): Promise<void> {
    const token = process.env.DEBT_NOTIFY_BOT_TOKEN;
    const chatId = process.env.DEBT_NOTIFY_CHAT_ID;
    if (!token || !chatId) {
      this.logger.warn('Debt bot not configured (DEBT_NOTIFY_BOT_TOKEN/CHAT_ID) — skip');
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), BOT_API_TIMEOUT_MS);
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`Bot API ${res.status}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
