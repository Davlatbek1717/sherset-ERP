/**
 * Telegram Business update parsing — pure functions (unit-tested).
 *
 * A business_connection arrives when the owner (Premium account) connects or
 * disconnects the bot in Settings → Telegram Business → Chatbots. A
 * business_message arrives for every message in the owner's client chats —
 * both what clients write AND what the owner sends from the phone (from.id ==
 * the connected user id ⇒ outgoing).
 */

interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface ParsedBusinessConnection {
  kind: 'business_connection';
  connectionId: string;
  enabled: boolean;
  user: { id: number; name: string };
}

export interface ParsedBusinessMessage {
  kind: 'business_message';
  chatId: number;
  chatFirstName: string | null;
  chatLastName: string | null;
  chatUsername: string | null;
  fromId: number | null;
  fromName: string | null;
  text: string;
  tgMessageId: number | null;
}

export interface ParsedOther {
  kind: 'other';
}

export type ParsedUpdate = ParsedBusinessConnection | ParsedBusinessMessage | ParsedOther;

function fullName(u: TgUser | undefined | null): string {
  if (!u) return '';
  return [u.first_name, u.last_name].filter(Boolean).join(' ');
}

export function parseBusinessUpdate(update: unknown): ParsedUpdate {
  if (!update || typeof update !== 'object') return { kind: 'other' };
  const u = update as Record<string, unknown>;

  const bc = u.business_connection as
    | { id?: string; user?: TgUser; is_enabled?: boolean; rights?: unknown }
    | undefined;
  if (bc?.id && bc.user?.id) {
    return {
      kind: 'business_connection',
      connectionId: bc.id,
      // Telegram sends is_enabled=false when the owner disconnects the bot.
      enabled: bc.is_enabled !== false,
      user: { id: bc.user.id, name: fullName(bc.user).slice(0, 128) },
    };
  }

  const bm = u.business_message as
    | {
        message_id?: number;
        chat?: { id?: number; first_name?: string; last_name?: string; username?: string };
        from?: TgUser;
        text?: string;
        caption?: string;
      }
    | undefined;
  if (bm?.chat?.id != null) {
    const text = bm.text ?? bm.caption ?? '';
    if (!text) return { kind: 'other' }; // stickers/media without caption — skip in V1
    return {
      kind: 'business_message',
      chatId: bm.chat.id,
      chatFirstName: bm.chat.first_name?.slice(0, 128) ?? null,
      chatLastName: bm.chat.last_name?.slice(0, 128) ?? null,
      chatUsername: bm.chat.username?.slice(0, 64) ?? null,
      fromId: bm.from?.id ?? null,
      fromName: bm.from ? fullName(bm.from).slice(0, 128) || null : null,
      text: text.slice(0, 4096),
      tgMessageId: bm.message_id ?? null,
    };
  }

  return { kind: 'other' };
}
