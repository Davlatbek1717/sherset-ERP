import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service.js';
import { type CounterpartyBalanceChangedEvent, HR_EVENT } from '../hr/hr-shared/hr-events.types.js';
import { buildDebtMessage } from './debt-notify.util.js';

const BOT_API_TIMEOUT_MS = 10_000;

/**
 * Owner-facing counterparty debt/payment Telegram notifier.
 *
 * Listens to COUNTERPARTY_BALANCE_CHANGED (emitted by
 * CounterpartyBalanceService.applyDelta) and pushes an Uzbek Markdown message
 * to the OWNER's Telegram group via the Bot API. Mirrors HrAdminNotifier 1:1:
 *   - @OnEvent({ async, promisify }) so it runs OUT-OF-BAND on the event loop,
 *     never inline in the caller's transaction.
 *   - The ENTIRE handler body is try/catch → logger.warn, so it can NEVER throw
 *     back into the event bus / source document flow (proven by test).
 *   - Transport gated on env DEBT_NOTIFY_BOT_TOKEN + DEBT_NOTIFY_CHAT_ID; absent
 *     ⇒ silent no-op (dormant until an owner wires a bot/group).
 *
 * Only "real" debt/payment postings carry a `source` (threaded through
 * applyDelta's `meta`). Reversals (unpost/cancel), rebalances and internal
 * adjustments arrive with `source === undefined` ⇒ buildDebtMessage returns
 * null ⇒ no owner alert, so owners are not spammed by internal churn.
 *
 * Optional env DEBT_NOTIFY_THRESHOLD_MINOR: when set and abs(newBalance)
 * exceeds it, the message gets an extra ⚠️ warning line. It never suppresses a
 * message — absent threshold ⇒ every real change still notifies.
 */
@Injectable()
export class CounterpartyDebtNotifier {
  private readonly logger = new Logger(CounterpartyDebtNotifier.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @OnEvent(HR_EVENT.COUNTERPARTY_BALANCE_CHANGED, { async: true, promisify: true })
  async onBalanceChanged(payload: CounterpartyBalanceChangedEvent): Promise<void> {
    try {
      if (!payload.source) return; // reversal / rebalance / adjustment — no alert
      const cp = await this.prisma.client.counterparty.findFirst({
        where: { id: payload.counterpartyId, accountId: payload.accountId },
        select: { name: true },
      });
      if (!cp) return;

      const text = buildDebtMessage({
        name: cp.name,
        currency: payload.currency,
        deltaMinor: payload.deltaMinor,
        newBalanceMinor: payload.newBalanceMinor,
        source: payload.source,
        overThreshold: this.isOverThreshold(payload.newBalanceMinor),
      });
      if (!text) return;

      await this.sendViaBot(text);
    } catch (e) {
      this.logger.warn(`debt notify failed: ${(e as Error).message}`);
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
