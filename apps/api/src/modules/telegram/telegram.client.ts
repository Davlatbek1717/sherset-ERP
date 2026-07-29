/**
 * Telegram Bot API client.
 *
 * Bot tokens are obtained from @BotFather (free). API base:
 *   https://api.telegram.org/bot<TOKEN>/<METHOD>
 *
 * V1 supports: sendMessage, getMe, setWebhook, deleteWebhook.
 * Other methods (sendPhoto, sendDocument, replyMarkup, etc.) are
 * straightforward extensions if needed.
 */
const TG_BASE = 'https://api.telegram.org/bot';
const REQUEST_TIMEOUT_MS = 15_000;

export class TelegramApiError extends Error {
  constructor(
    public readonly errorCode: number,
    message: string,
    public readonly description?: string,
  ) {
    super(message);
  }
}

interface TgResponse<T> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
}

async function call<T>(
  token: string,
  method: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(`${TG_BASE}${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as TgResponse<T>;
  if (!json.ok) {
    throw new TelegramApiError(
      json.error_code ?? res.status,
      `Telegram ${method} failed: ${json.description ?? `HTTP ${res.status}`}`,
      json.description,
    );
  }
  return json.result as T;
}

/** Inline button — a callback button (`callback_data`) or a URL button. */
export interface TelegramInlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}
/** reply_markup: inline keyboard (rows of buttons) or a force-reply prompt. */
export type TelegramReplyMarkup =
  | { inline_keyboard: TelegramInlineButton[][] }
  | { force_reply: true; input_field_placeholder?: string };

export interface TelegramSendMessageArgs {
  chatId: string;
  text: string;
  /** 'HTML' | 'MarkdownV2' | undefined (plain). */
  parseMode?: 'HTML' | 'MarkdownV2';
  disableWebPagePreview?: boolean;
  /** Telegram Business: send ON BEHALF OF the connected Premium account. */
  businessConnectionId?: string;
  /** Inline keyboard / force-reply — e.g. supply-approval confirm/reject buttons. */
  replyMarkup?: TelegramReplyMarkup;
}

export interface TelegramSendMessageResult {
  message_id: number;
  date: number;
  chat: { id: number };
  text: string;
}

export async function tgSendMessage(
  token: string,
  args: TelegramSendMessageArgs,
): Promise<TelegramSendMessageResult> {
  return call<TelegramSendMessageResult>(token, 'sendMessage', {
    chat_id: args.chatId,
    text: args.text,
    parse_mode: args.parseMode,
    disable_web_page_preview: args.disableWebPagePreview ?? true,
    ...(args.businessConnectionId ? { business_connection_id: args.businessConnectionId } : {}),
    ...(args.replyMarkup ? { reply_markup: args.replyMarkup } : {}),
  });
}

/** Acknowledge a callback_query (button tap) — stops the client's spinner. */
export async function tgAnswerCallbackQuery(
  token: string,
  args: { callbackQueryId: string; text?: string; showAlert?: boolean },
): Promise<true> {
  await call(token, 'answerCallbackQuery', {
    callback_query_id: args.callbackQueryId,
    ...(args.text ? { text: args.text } : {}),
    ...(args.showAlert ? { show_alert: true } : {}),
  });
  return true;
}

export interface TelegramEditMessageArgs {
  chatId: string;
  messageId: number;
  text: string;
  parseMode?: 'HTML' | 'MarkdownV2';
  replyMarkup?: TelegramReplyMarkup;
  businessConnectionId?: string;
}

/** Edit a message's text (+ optional new keyboard) — used for the two-step confirm. */
export async function tgEditMessageText(
  token: string,
  args: TelegramEditMessageArgs,
): Promise<true> {
  await call(token, 'editMessageText', {
    chat_id: args.chatId,
    message_id: args.messageId,
    text: args.text,
    parse_mode: args.parseMode,
    ...(args.replyMarkup ? { reply_markup: args.replyMarkup } : {}),
    ...(args.businessConnectionId ? { business_connection_id: args.businessConnectionId } : {}),
  });
  return true;
}

export interface TelegramBotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
}

export async function tgGetMe(token: string): Promise<TelegramBotInfo> {
  return call<TelegramBotInfo>(token, 'getMe');
}

export async function tgSetWebhook(
  token: string,
  url: string,
  secretToken?: string,
): Promise<true> {
  await call<true>(token, 'setWebhook', {
    url,
    secret_token: secretToken,
    // business_* updates power the Telegram Business (owner-account) chats.
    allowed_updates: [
      'message',
      'callback_query',
      'inline_query',
      'business_connection',
      'business_message',
    ],
  });
  return true;
}

export async function tgDeleteWebhook(token: string): Promise<true> {
  await call<true>(token, 'deleteWebhook', { drop_pending_updates: false });
  return true;
}

// ── FAYL YUKLAB OLISH (2026-07-13) ──────────────────────────────────────────
// Mijoz chek rasmini yuborganda Telegram bizga faqat `file_id` beradi. Rasmni
// olish ikki qadam: getFile → file_path, keyin file/bot<TOKEN>/<path> dan yuklab
// olish. MUHIM: `file_id` VAQTINCHA (Telegram uni o'chirib yuborishi mumkin) —
// shuning uchun nusxasini o'z `attachments` jadvalimizga saqlaymiz.

/** Chek rasmi uchun chegara — katta fayl serverni bo'g'masin. */
const MAX_FILE_BYTES = 20 * 1024 * 1024;

interface TelegramFile {
  file_id: string;
  file_path?: string;
  file_size?: number;
}

export async function tgGetFile(token: string, fileId: string): Promise<TelegramFile> {
  return call<TelegramFile>(token, 'getFile', { file_id: fileId });
}

/**
 * `file_id` → Buffer. Fayl topilmasa yoki juda katta bo'lsa — xato.
 * Chaqiruvchi buni ushlab, xabarni rasmsiz saqlashi mumkin (xabar yo'qolmasin).
 */
export async function tgDownloadFile(token: string, fileId: string): Promise<Buffer> {
  const file = await tgGetFile(token, fileId);
  if (!file.file_path) {
    throw new TelegramApiError(404, 'Telegram getFile: file_path yo‘q');
  }
  if ((file.file_size ?? 0) > MAX_FILE_BYTES) {
    throw new TelegramApiError(413, `Telegram fayl juda katta: ${file.file_size} bayt`);
  }
  const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`, {
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new TelegramApiError(res.status, `Telegram fayl yuklab olinmadi: HTTP ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
