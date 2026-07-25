import { Logger } from '@nestjs/common';
import type { HistoryMtprotoMessage, TgVideoRef } from './telegram-client-factory.js';

/**
 * MTProto delivery contract. Decouples the queue worker from any specific
 * Telegram client library so the worker can be unit-tested with a stub,
 * and the production binding (gramjs) can be swapped without churn.
 *
 * Errors raised from `sendMessage` are classified by `classifyMtprotoError`
 * — flood-wait pauses the slot; other errors trigger retry-backoff.
 */
export const MTPROTO_ADAPTER = Symbol('MTPROTO_ADAPTER');

export interface MtprotoSendOptions {
  /** Account that owns the outbox row — adapter resolves a slot for this tenant. */
  accountId: string;
  toPhone: string;
  text: string;
  /**
   * Self-send (2026-07-25 davomat notify): deliver to the sender's own
   * «Saved Messages» (`'me'`) instead of resolving `toPhone`. Used for the
   * director attendance notifier — the message lands in the director's own
   * Telegram Saqlangan xabarlar via their MTProto slot (`viaSlot`).
   */
  toSelf?: boolean;
  /**
   * When `toSelf` is set, the specific MTProto slot (the director's account)
   * that must deliver the self-send — bypasses the usual 1→2 slot failover
   * since only that account can write to its own Saved Messages.
   */
  viaSlot?: number;
  /**
   * `HrTelegramOutbox.sourceEventType` (e.g. `debt.reminder`), passed
   * through so the adapter can opt specific message families into a
   * different GramJS markdown dialect (2026-07-20: `debt.*` messages use
   * `MarkdownV2Parser` for underline support) without affecting any other
   * notification family's formatting.
   */
  sourceEventType?: string | null;
}

export interface MtprotoSendResult {
  /** Which of the (typically 2) MTProto slots delivered the message. */
  slot: number;
  /** Telegram-issued message id (string for portability). */
  messageId: string;
}

export interface MtprotoAdapter {
  /**
   * Send a single message. MUST throw `MtprotoFloodError` on FLOOD_WAIT
   * responses and a plain `Error` on any other failure. Implementations
   * are expected to manage their own connection pool / failover.
   */
  sendMessage(opts: MtprotoSendOptions): Promise<MtprotoSendResult>;

  /**
   * Sends a local file as a Telegram DOCUMENT (акт-сверка .xlsx) to `toPhone`
   * with a caption. Same slot-loop + flood discipline as `sendMessage`.
   */
  sendDocument(opts: {
    accountId: string;
    toPhone: string;
    filePath: string;
    caption: string;
  }): Promise<MtprotoSendResult>;

  /**
   * Dialog tarixidan bitta sahifa oladi (talab-bo'yicha backfill + catch-up,
   * 2026-07-20). FLOOD_WAIT'da `MtprotoFloodError`, boshqa xatoда plain Error.
   * Implementatsiya o'z pool/failover'ini boshqaradi (sendMessage kabi).
   */
  fetchHistory(opts: {
    accountId: string;
    phone: string;
    limit: number;
    offsetId?: number;
    minId?: number;
  }): Promise<{ slot: number; peerId: string | null; messages: HistoryMtprotoMessage[] }>;

  /**
   * Videoni Telegram'ga BIR MARTA yuklaydi (video-tarqatma, 2026-07-20) va
   * qayta ishlatiladigan referensni qaytaradi. sendMessage kabi slot-loop +
   * flood-failover: FLOOD_WAIT'da `MtprotoFloodError`, boshqa xatoда plain Error.
   */
  uploadBroadcastVideo(opts: {
    accountId: string;
    filePath: string;
    /** Video POSTER (JPEG) yo'li — berilmasa Telegram qora poster ko'rsatadi. */
    thumbPath?: string;
    /** Video o'lchami/davomiyligi — to'g'ri nisbat (9:16) uchun. */
    videoMeta?: { width: number; height: number; durationSec: number };
  }): Promise<{ slot: number; ref: TgVideoRef }>;

  /**
   * Yuklangan video-referensni bitta mijozga (toPhone) caption + bold-entity
   * bilan yuboradi. sendMessage bilan bir xil slot-loop/flood intizomi.
   */
  sendVideoByRef(opts: {
    accountId: string;
    toPhone: string;
    ref: TgVideoRef;
    caption: string;
    boldRanges: { offset: number; length: number }[];
    quoteRanges?: { offset: number; length: number }[];
  }): Promise<MtprotoSendResult>;
}

/**
 * Telegram FLOOD_WAIT response. Slots that throw this should be put to
 * sleep for `retryAfterSeconds` and skipped in the worker until then.
 */
export class MtprotoFloodError extends Error {
  readonly isFlood = true as const;
  constructor(
    public readonly slot: number,
    public readonly retryAfterSeconds: number,
    message?: string,
  ) {
    super(message ?? `FLOOD_WAIT slot=${slot} retryAfter=${retryAfterSeconds}s`);
    this.name = 'MtprotoFloodError';
  }
}

export function isMtprotoFloodError(e: unknown): e is MtprotoFloodError {
  return typeof e === 'object' && e !== null && (e as { isFlood?: unknown }).isFlood === true;
}

/**
 * Dev / disabled adapter. Logs the attempt and throws a generic Error so
 * the worker schedules a retry — production deploys MUST swap this for the
 * real gramjs binding (P4b). Used when credentials aren't configured so the
 * outbox table still grows and worker exercises FSM in CI/dev.
 */
export class NoopMtprotoAdapter implements MtprotoAdapter {
  private readonly logger = new Logger(NoopMtprotoAdapter.name);

  async sendMessage(opts: MtprotoSendOptions): Promise<MtprotoSendResult> {
    this.logger.warn(
      `NoopMtprotoAdapter — Telegram delivery NOT configured. Pretending to fail send for account=${opts.accountId} to=${opts.toPhone} (${opts.text.length} chars). Configure HR_TELEGRAM_CREDENTIALS in production.`,
    );
    throw new Error('mtproto_adapter_not_configured');
  }

  async sendDocument(opts: { accountId: string; toPhone: string }): Promise<MtprotoSendResult> {
    this.logger.warn(
      `NoopMtprotoAdapter — document send NOT configured (acc=${opts.accountId} to=${opts.toPhone}).`,
    );
    throw new Error('mtproto_adapter_not_configured');
  }

  async fetchHistory(): Promise<{
    slot: number;
    peerId: string | null;
    messages: HistoryMtprotoMessage[];
  }> {
    // Telegram sozlanmaган — bo'sh sahifa (backfill job'ni bloklamaydi).
    return { slot: 0, peerId: null, messages: [] };
  }

  async uploadBroadcastVideo(opts: { accountId: string }): Promise<{
    slot: number;
    ref: TgVideoRef;
  }> {
    this.logger.warn(`NoopMtprotoAdapter — video yuklash NOT configured (acc=${opts.accountId}).`);
    throw new Error('mtproto_adapter_not_configured');
  }

  async sendVideoByRef(opts: { accountId: string }): Promise<MtprotoSendResult> {
    this.logger.warn(`NoopMtprotoAdapter — video yuborish NOT configured (acc=${opts.accountId}).`);
    throw new Error('mtproto_adapter_not_configured');
  }
}
