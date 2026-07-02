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
  sendMessage(entity: unknown, text: string): Promise<{ messageId: string }>;

  /** Login step 1 — server sends OTP via SMS/Telegram. */
  sendCode(opts: { apiId: number; apiHash: string; phoneNumber: string }): Promise<{
    phoneCodeHash: string;
  }>;

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
