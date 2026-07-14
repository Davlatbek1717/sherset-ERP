/**
 * Telegram update parsing — pure functions (unit-tested).
 *
 * A business_connection arrives when the owner (Premium account) connects or
 * disconnects the bot in Settings → Telegram Business → Chatbots. A
 * business_message arrives for every message in the owner's client chats —
 * both what clients write AND what the owner sends from the phone (from.id ==
 * the connected user id ⇒ outgoing).
 *
 * ── 2026-07-13: MEDIA ───────────────────────────────────────────────────────
 * Ilgari matnsiz xabar butunlay tashlab yuborilardi («skip in V1»). Ya'ni mijoz
 * CHEK RASMINI yuborsa — u hech qayerda ko'rinmasdi, holbuki qarz undirishda
 * eng kerakli narsa aynan shu. Endi rasm/hujjat/ovoz/video ham tahlil qilinadi:
 * `messageKind` + `fileId` qaytadi, servis faylni Telegram'dan yuklab olib
 * `attachments` ga saqlaydi (Telegram file_id muddatli — nusxa o'zimizda turadi).
 *
 * Oddiy `message` (bot bilan to'g'ridan-to'g'ri chat) ham tushuniladi: mijoz
 * botga kontaktini ulashsa, telefon shu yerdan keladi va kontragent avtomatik
 * topiladi (Business xabarlarida telefon KELMAYDI — Telegram bermaydi).
 */

interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TgPhotoSize {
  file_id: string;
  file_unique_id?: string;
  width?: number;
  height?: number;
  file_size?: number;
}

interface TgDocument {
  file_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

interface TgMessage {
  message_id?: number;
  chat?: { id?: number; first_name?: string; last_name?: string; username?: string };
  from?: TgUser;
  text?: string;
  caption?: string;
  photo?: TgPhotoSize[];
  document?: TgDocument;
  voice?: { file_id: string; mime_type?: string };
  video?: { file_id: string; mime_type?: string; file_name?: string };
  contact?: { phone_number?: string; user_id?: number; first_name?: string };
}

/** Chat xabarining turi — DB'dagi `kind` ustuni bilan bir xil. */
export type TgMessageKind = 'text' | 'photo' | 'document' | 'voice' | 'video' | 'contact';

export interface ParsedBusinessConnection {
  kind: 'business_connection';
  connectionId: string;
  enabled: boolean;
  user: { id: number; name: string };
}

export interface ParsedBusinessMessage {
  kind: 'business_message';
  /** Business chat (egasining nomidan) yoki oddiy bot chati. */
  source: 'business' | 'bot';
  chatId: number;
  chatFirstName: string | null;
  chatLastName: string | null;
  chatUsername: string | null;
  fromId: number | null;
  fromName: string | null;
  /** Matn yoki rasm izohi. Media'da izoh bo'lmasa — «📷 Rasm» kabi yorliq. */
  text: string;
  tgMessageId: number | null;
  messageKind: TgMessageKind;
  fileId: string | null;
  fileName: string | null;
  mimeType: string | null;
  /** Mijoz «Kontaktni ulashish» bosgan bo'lsa — telefon raqami. */
  contactPhone: string | null;
}

export interface ParsedOther {
  kind: 'other';
}

export type ParsedUpdate = ParsedBusinessConnection | ParsedBusinessMessage | ParsedOther;

function fullName(u: TgUser | undefined | null): string {
  if (!u) return '';
  return [u.first_name, u.last_name].filter(Boolean).join(' ');
}

/** Rasm bir necha o'lchamda keladi — ENG KATTASI olinadi (chek o'qilarli bo'lsin). */
function largestPhoto(photos: TgPhotoSize[] | undefined): TgPhotoSize | null {
  if (!photos?.length) return null;
  return photos.reduce((a, b) => ((b.file_size ?? 0) > (a.file_size ?? 0) ? b : a));
}

interface Media {
  messageKind: TgMessageKind;
  fileId: string | null;
  fileName: string | null;
  mimeType: string | null;
  contactPhone: string | null;
}

function extractMedia(m: TgMessage): Media {
  const photo = largestPhoto(m.photo);
  if (photo) {
    return {
      messageKind: 'photo',
      fileId: photo.file_id,
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      contactPhone: null,
    };
  }
  if (m.document?.file_id) {
    return {
      messageKind: 'document',
      fileId: m.document.file_id,
      fileName: m.document.file_name?.slice(0, 255) ?? 'hujjat',
      mimeType: m.document.mime_type?.slice(0, 100) ?? 'application/octet-stream',
      contactPhone: null,
    };
  }
  if (m.video?.file_id) {
    return {
      messageKind: 'video',
      fileId: m.video.file_id,
      fileName: m.video.file_name?.slice(0, 255) ?? 'video.mp4',
      mimeType: m.video.mime_type?.slice(0, 100) ?? 'video/mp4',
      contactPhone: null,
    };
  }
  if (m.voice?.file_id) {
    return {
      messageKind: 'voice',
      fileId: m.voice.file_id,
      fileName: 'ovoz.ogg',
      mimeType: m.voice.mime_type?.slice(0, 100) ?? 'audio/ogg',
      contactPhone: null,
    };
  }
  if (m.contact?.phone_number) {
    return {
      messageKind: 'contact',
      fileId: null,
      fileName: null,
      mimeType: null,
      contactPhone: m.contact.phone_number.slice(0, 32),
    };
  }
  return { messageKind: 'text', fileId: null, fileName: null, mimeType: null, contactPhone: null };
}

/** Izoh bo'lmasa chatda ko'rinadigan yorliq. */
function fallbackText(kind: TgMessageKind, phone: string | null): string {
  switch (kind) {
    case 'photo':
      return '📷 Rasm';
    case 'document':
      return '📎 Hujjat';
    case 'voice':
      return '🎤 Ovozli xabar';
    case 'video':
      return '🎬 Video';
    case 'contact':
      return `📱 Kontakt: ${phone ?? ''}`.trim();
    default:
      return '';
  }
}

function parseMessage(m: TgMessage, source: 'business' | 'bot'): ParsedUpdate {
  if (m.chat?.id == null) return { kind: 'other' };

  const media = extractMedia(m);
  const caption = m.text ?? m.caption ?? '';
  const text = caption || fallbackText(media.messageKind, media.contactPhone);
  // Na matn, na media (masalan stiker) — saqlashga arzimaydi.
  if (!text) return { kind: 'other' };

  return {
    kind: 'business_message',
    source,
    chatId: m.chat.id,
    chatFirstName: m.chat.first_name?.slice(0, 128) ?? null,
    chatLastName: m.chat.last_name?.slice(0, 128) ?? null,
    chatUsername: m.chat.username?.slice(0, 64) ?? null,
    fromId: m.from?.id ?? null,
    fromName: m.from ? fullName(m.from).slice(0, 128) || null : null,
    text: text.slice(0, 4096),
    tgMessageId: m.message_id ?? null,
    ...media,
  };
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

  const bm = u.business_message as TgMessage | undefined;
  if (bm) return parseMessage(bm, 'business');

  // Oddiy bot chati — mijoz botga to'g'ridan-to'g'ri yozgan yoki /start bosgan.
  const m = u.message as TgMessage | undefined;
  if (m) return parseMessage(m, 'bot');

  return { kind: 'other' };
}
