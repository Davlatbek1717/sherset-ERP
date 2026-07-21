/**
 * Thin abstraction over the gramjs `TelegramClient` so the adapter and
 * the login wizard can be unit-tested with stubs and the production
 * runtime is the only place that hard-imports `telegram`.
 *
 * The handle covers the *minimum* surface we use:
 *   • connect / disconnect / isUserAuthorized — lifecycle
 *   • getEntity(phone)                         — peer resolution
 *   • sendMessage(entity, text)                — outbox delivery
 *   • sendCode / signIn / checkPassword        — OTP login wizard
 *   • saveSession()                            — export StringSession
 *
 * Errors:
 *   • FLOOD_WAIT — thrown as plain Error with `.className==='FloodWaitError'`
 *     AND `.seconds` (gramjs default shape). Adapter normalizes to
 *     MtprotoFloodError before reaching the worker.
 *   • SESSION_PASSWORD_NEEDED — thrown when 2FA is required after signIn;
 *     login wizard treats this as a re-prompt for password.
 */

export interface TelegramClientHandle {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isUserAuthorized(): Promise<boolean>;
  getEntity(phone: string): Promise<unknown>;
  /**
   * Resolve a phone number to a sendable peer WITHOUT requiring it to
   * already be a saved contact (2026-07-20 fix — `getEntity(phone)` only
   * resolves numbers gramjs already has cached/contacted; for a brand-new
   * customer phone it throws "Cannot find any entity", so reminders to
   * first-time customers never went out). Uses `contacts.ImportContacts`,
   * the same mechanism a normal Telegram client uses when you add someone
   * by phone number — works for any number that's on Telegram, contact or
   * not. Throws if the number isn't on Telegram at all.
   */
  resolvePhone(phone: string): Promise<unknown>;
  /**
   * Turn a value returned by `resolvePhone` (possibly round-tripped through
   * JSON — the persistent entity cache stores it as Prisma Json) back into
   * something gramjs can actually send to. 2026-07-20 incident: caching the
   * raw gramjs peer object and handing the JSON-deserialized copy straight
   * to `sendMessage` on a cache HIT failed every time with "Cannot cast User
   * to any kind of peer" — JSON round-tripping strips the class identity
   * (`SUBCLASS_OF_ID`) gramjs's `getInputPeer()` requires. Confirmed live:
   * the FIRST send to a phone (cache miss, fresh real object) went through;
   * every later send to the SAME phone (cache hit) failed with that exact
   * error. `resolvePhone` now returns/caches a plain `{userId, accessHash}`
   * descriptor; `hydrateEntity` reconstructs a real `Api.InputPeerUser` from
   * it every time, cache hit or miss — so the class-identity loss can never
   * bite again.
   */
  hydrateEntity(cached: unknown): unknown;
  /**
   * `format` selects the GramJS markdown dialect for THIS message only —
   * omitted/`'default'` keeps the client's normal `**bold**`/`__italic__`
   * parser untouched (every existing caller: HR/supply/task notifications).
   * `'markdown-v2'` switches to GramJS's `MarkdownV2Parser` for this call,
   * which is the ONLY dialect that supports underline (`__x__`); its bold
   * syntax is a single `*x*`, not `**x**`. 2026-07-20: added so debt-reminder
   * messages (`debt-telegram.util.ts`) can underline the amount while
   * leaving every other notification's formatting untouched.
   */
  sendMessage(
    entity: unknown,
    text: string,
    opts?: { format?: 'default' | 'markdown-v2' },
  ): Promise<{ messageId: string }>;

  /**
   * Videoni Telegram'ga BIR MARTA yuklaydi (o'zining «Saved Messages»iga) va
   * qayta ishlatiladigan hujjat-referensini qaytaradi (2026-07-20 video-tarqatma).
   * Broadcast har mijozga videoni QAYTA yuklamaydi — bir marta yuklab, shu
   * referensni `sendVideoByRef` bilan hammaga qayta-yuboradi (tez + trafik tejaydi).
   */
  uploadVideoToSelf(filePath: string, thumbPath?: string): Promise<TgVideoRef>;

  /**
   * `uploadVideoToSelf` bergan referens bo'yicha videoni `entity`ga yuboradi,
   * caption + ANIQ bold-entity'lar bilan. Markdown ISHLATILMAYDI (offset/length
   * bold oraliqlar to'g'ridan-to'g'ri Api.MessageEntityBold'ga aylanadi) —
   * emoji/tinish-belgili caption'da escape xatosi bo'lmaydi.
   */
  sendVideoByRef(
    entity: unknown,
    ref: TgVideoRef,
    caption: string,
    boldRanges: { offset: number; length: number }[],
    quoteRanges?: { offset: number; length: number }[],
  ): Promise<{ messageId: string }>;

  /** Login step 1 — server sends OTP via SMS/Telegram. */
  sendCode(opts: { apiId: number; apiHash: string; phoneNumber: string }): Promise<{
    phoneCodeHash: string;
  }>;

  /** Kod kelmasa — «keyingi kanal»da (odatda SMS) qayta yuborish. */
  resendCode(): Promise<{ phoneCodeHash: string }>;

  /** Login step 2a — submit OTP. May throw SESSION_PASSWORD_NEEDED on 2FA. */
  signIn(opts: {
    phoneNumber: string;
    phoneCodeHash: string;
    phoneCode: string;
  }): Promise<void>;

  /** Login step 2b — submit 2FA password after SESSION_PASSWORD_NEEDED. */
  checkPassword(password: string): Promise<void>;

  /** Serialize the active session to a StringSession blob (encrypted by caller). */
  saveSession(): string;

  /**
   * Register a listener for incoming (customer→us) PRIVATE-chat messages on
   * this connected client. 2026-07-20: added because the userbot connection
   * previously only ever SENT — a customer's reply vanished into nothing,
   * so `OrderTelegramPanel` never showed it. Group/channel messages and our
   * OWN outgoing messages are filtered out before `handler` is called.
   * Call ONCE per client (`MtprotoWorkerService.ensureClient()` does this
   * right after creating a fresh connection) — the handler lives for the
   * client's lifetime.
   */
  onIncomingMessage(handler: (msg: IncomingMtprotoMessage) => void): void;

  /**
   * Dialog tarixini sahifalab o'qiydi (yangi→eski) — to'liq-tarix backfill
   * (2026-07-20). `entity` — `resolvePhone`→`hydrateEntity` natijasi.
   * `offsetId` 0/undefined = eng yangidan; eskiroq sahifa uchun oldingi
   * sahifaning eng kichik `tgMessageId`sini uzat. `minId` > 0 bo'lsa — faqat
   * `minId`dan yangi xabarlar (catch-up). BIZNING chiquvchi xabarlarimiz ham
   * qaytadi (`direction:'out'`) — `onIncomingMessage` faqat kiruvchini beradi,
   * bu esa transkriptning ikkala tomonini quradi.
   */
  getHistory(
    entity: unknown,
    opts: { limit: number; offsetId?: number; minId?: number },
  ): Promise<HistoryMtprotoMessage[]>;
}

/**
 * Normalized incoming-message shape handed to `onIncomingMessage` — no raw
 * gramjs `Api.*` types leak past `gramjs-client.factory.ts` (same boundary
 * discipline as `resolvePhone`'s plain `{userId, accessHash}` descriptor).
 */
export interface IncomingMtprotoMessage {
  /** Gramjs numeric sender id, stringified. */
  senderId: string;
  /** Raw digit phone (e.g. "998901234567", no `+`) — null if unresolvable. */
  senderPhone: string | null;
  senderName: string | null;
  text: string;
  tgMessageId: number;
  /**
   * Original sender's display name (or channel/chat title) if this message
   * was forwarded from elsewhere — 2026-07-20 Phase 2, mirrors Telegram's
   * own "Переслано от: X" indicator. `null` for an ordinary message.
   */
  fwdFromName: string | null;
  kind: 'text' | 'photo' | 'document' | 'voice' | 'video';
  mimeType: string | null;
  fileName: string | null;
  /** Present only when `kind !== 'text'` — call to fetch the raw file bytes. */
  downloadMedia: (() => Promise<Buffer>) | null;
}

/**
 * Backfill (dialog tarixi) uchun normalizatsiyalangan xabar — `IncomingMtprotoMessage`
 * bilan bir xil media-yuklash intizomi, LEKIN `direction` bor (tarix ikkala
 * yo'nalishni ham qaytaradi) va `date` (Telegram unix soniyasi — `createdAt`
 * uchun) + `replyToTgMessageId` (Faza-2 reply/quote uchun oldindan).
 */
export interface HistoryMtprotoMessage {
  tgMessageId: number;
  direction: 'in' | 'out';
  text: string;
  /** Telegram unix vaqti (soniya) — TelegramChatMessage.createdAt uchun. */
  date: number;
  senderName: string | null;
  fwdFromName: string | null;
  replyToTgMessageId: number | null;
  kind: 'text' | 'photo' | 'document' | 'voice' | 'video';
  mimeType: string | null;
  fileName: string | null;
  /** Present only when `kind !== 'text'` — call to fetch the raw file bytes. */
  downloadMedia: (() => Promise<Buffer>) | null;
}

/**
 * Telegram'ga bir marta yuklangan videoning qayta ishlatiladigan referensi.
 * JSON-xavfsiz (string) — broadcast row'da saqlanadi va har mijozga
 * `sendVideoByRef` bilan qayta-ishlatiladi (Api.InputDocument qayta quriladi).
 */
export interface TgVideoRef {
  /** Api.Document.id (bigint → string). */
  id: string;
  /** Api.Document.accessHash (bigint → string). */
  accessHash: string;
  /** Api.Document.fileReference (bytes → base64). Eskirsa qayta yuklanadi. */
  fileReference: string;
}

export interface TelegramClientFactoryArgs {
  apiId: number;
  apiHash: string;
  /** Empty string when starting a fresh login; otherwise the StringSession blob. */
  sessionString: string;
}

export interface TelegramClientFactory {
  createClient(args: TelegramClientFactoryArgs): TelegramClientHandle;
}

export const TELEGRAM_CLIENT_FACTORY = Symbol('TELEGRAM_CLIENT_FACTORY');

/** True when the error is a gramjs FLOOD_WAIT. Duck-typed for resilience across minor versions. */
export function isGramjsFloodError(
  e: unknown,
): e is Error & { seconds: number; className: string } {
  if (typeof e !== 'object' || e === null) return false;
  const obj = e as { className?: unknown; errorMessage?: unknown; seconds?: unknown };
  const looksLikeFlood =
    obj.className === 'FloodWaitError' ||
    (typeof obj.errorMessage === 'string' && obj.errorMessage.startsWith('FLOOD_WAIT'));
  return looksLikeFlood && typeof obj.seconds === 'number';
}

/** True when gramjs signals that 2FA is required after a phone-code signIn. */
export function isSessionPasswordNeededError(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const obj = e as { className?: unknown; errorMessage?: unknown };
  return (
    obj.className === 'SessionPasswordNeededError' ||
    (typeof obj.errorMessage === 'string' && obj.errorMessage.includes('SESSION_PASSWORD_NEEDED'))
  );
}
