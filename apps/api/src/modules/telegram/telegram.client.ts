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

export interface TelegramSendMessageArgs {
  chatId: string;
  text: string;
  /** 'HTML' | 'MarkdownV2' | undefined (plain). */
  parseMode?: 'HTML' | 'MarkdownV2';
  disableWebPagePreview?: boolean;
  /** Telegram Business: send ON BEHALF OF the connected Premium account. */
  businessConnectionId?: string;
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
  });
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
