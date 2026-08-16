import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service.js';
import { type CounterpartyBalanceChangedEvent, HR_EVENT } from '../hr/hr-shared/hr-events.types.js';
import { buildCounterpartyMessage } from './counterparty-message.util.js';
import { buildDebtMessage } from './debt-notify.util.js';

const BOT_API_TIMEOUT_MS = 10_000;

/**
 * `HrTelegramOutbox.sourceEventType` tag for the counterparty-facing debt/
 * payment notices this service enqueues. Also the dedup key (with sourceDocId)
 * so a re-emitted balance event never double-messages the counterparty.
 */
const COUNTERPARTY_NOTIFY_EVENT = 'debt.counterparty_notify';

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

      const text = buildCounterpartyMessage({
        name,
        currency: payload.currency,
        deltaMinor: payload.deltaMinor,
        newBalanceMinor: payload.newBalanceMinor,
        source: payload.source,
        docNumber: doc?.number,
        docMoment: doc?.moment,
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

      await this.prisma.client.hrTelegramOutbox.create({
        data: {
          accountId: payload.accountId,
          counterpartyId: payload.counterpartyId,
          toPhone,
          messageText: text,
          sourceEventType: COUNTERPARTY_NOTIFY_EVENT,
          sourceDocId: payload.docId ?? null,
          status: 'pending',
        },
      });
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
