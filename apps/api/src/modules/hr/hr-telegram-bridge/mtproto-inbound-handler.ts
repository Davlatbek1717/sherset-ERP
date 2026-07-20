import type { IncomingMtprotoMessage } from './telegram-client-factory.js';

/**
 * Sink for customer→us MTProto messages, called by `MtprotoWorkerService`
 * once per incoming message (see `telegram-client-factory.ts`'s
 * `onIncomingMessage` doc comment for why this exists — 2026-07-20, the
 * userbot connection previously only ever sent).
 *
 * Production binding is `TelegramService.handleIncoming` (implements this
 * interface) — it already owns the `TelegramChat`/`TelegramChatMessage`
 * storage + auto-bind + attachment-download logic for the Business-API
 * inbound path, so MTProto messages are normalized into the SAME tables and
 * show up in the SAME `OrderTelegramPanel` thread, no parallel UI needed.
 */
export const MTPROTO_INBOUND_HANDLER = Symbol('MTPROTO_INBOUND_HANDLER');

export interface MtprotoInboundHandler {
  handleIncoming(accountId: string, slot: number, msg: IncomingMtprotoMessage): Promise<void>;
}
