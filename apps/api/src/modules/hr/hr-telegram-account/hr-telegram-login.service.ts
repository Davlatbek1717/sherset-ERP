import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { decryptHrSession } from '../hr-shared/crypto.util.js';
import {
  TELEGRAM_CLIENT_FACTORY,
  type TelegramClientFactory,
  type TelegramClientHandle,
  isGramjsFloodError,
  isSessionPasswordNeededError,
} from '../hr-telegram-bridge/telegram-client-factory.js';
import { HrTelegramAccountService } from './hr-telegram-account.service.js';

interface LoginSessionState {
  /** Connected client awaiting OTP/password. */
  client: TelegramClientHandle;
  accountId: string;
  hrTelegramAccountId: string;
  phoneNumber: string;
  phoneCodeHash: string;
  /** Set to true after signIn raises SESSION_PASSWORD_NEEDED; next submit must include `password`. */
  awaitingPassword: boolean;
  /** Absolute expiry — sessions older than this are purged. */
  expiresAt: Date;
}

/**
 * 3-step OTP wizard for MTProto session bootstrap. State is kept in-memory:
 * single-API-instance only (multi-instance deploy would need Redis). For a
 * solo-admin workspace this is fine — wizard sessions live ≤ 5 minutes.
 *
 * Flow:
 *   1. POST /login/start   { accountId } → server connects gramjs client,
 *      requests OTP from Telegram, returns { loginSessionId, codeSent }.
 *      Admin reads the code from their Telegram app.
 *   2. POST /login/code    { loginSessionId, code } → server signs in.
 *        a) Success            → session encrypted+persisted, account
 *           auto-activated, returns { ok: true, awaitingPassword: false }.
 *        b) SESSION_PASSWORD_NEEDED → returns { awaitingPassword: true }
 *           and the wizard expects the next call to include `password`.
 *   3. (2-FA branch) POST /login/code { loginSessionId, code, password }
 *      → server runs CheckPassword, then proceeds as (a).
 */
@Injectable()
export class HrTelegramLoginService {
  private readonly logger = new Logger(HrTelegramLoginService.name);
  private static readonly TTL_MS = 5 * 60_000;

  private readonly sessions = new Map<string, LoginSessionState>();

  constructor(
    @Inject(TELEGRAM_CLIENT_FACTORY) private readonly factory: TelegramClientFactory,
    @Inject(HrTelegramAccountService) private readonly accounts: HrTelegramAccountService,
  ) {}

  /** Step 1: ask Telegram to send the OTP. */
  async start(
    accountId: string,
    hrTelegramAccountId: string,
  ): Promise<{
    loginSessionId: string;
    codeSent: boolean;
  }> {
    const acct = await this.accounts.findInternal(accountId, hrTelegramAccountId);

    let apiHash: string;
    try {
      apiHash = decryptHrSession(acct.apiHashEncrypted);
    } catch {
      throw new BadRequestException("API hash dekript bo'lmadi — admin maslahat olsin");
    }

    const client = this.factory.createClient({
      apiId: acct.apiId,
      apiHash,
      sessionString: '', // fresh login
      phoneNumber: acct.phoneNumber,
    });

    try {
      await client.connect();
      const { phoneCodeHash } = await client.sendCode({
        apiId: acct.apiId,
        apiHash,
        phoneNumber: acct.phoneNumber,
      });

      const loginSessionId = randomBytes(18).toString('base64url');
      this.gc(); // opportunistic expired-session cleanup
      this.sessions.set(loginSessionId, {
        client,
        accountId,
        hrTelegramAccountId,
        phoneNumber: acct.phoneNumber,
        phoneCodeHash,
        awaitingPassword: false,
        expiresAt: new Date(Date.now() + HrTelegramLoginService.TTL_MS),
      });
      return { loginSessionId, codeSent: phoneCodeHash.length > 0 };
    } catch (e) {
      await client.disconnect().catch(() => {});
      if (isGramjsFloodError(e)) {
        throw new BadRequestException(
          `Telegram FLOOD_WAIT ${e.seconds}s — biroz kutib qayta urinib ko'ring`,
        );
      }
      throw new BadRequestException(HrTelegramLoginService.friendlyError(e));
    }
  }

  /** Step 2: submit the OTP code (and optional 2FA password). */
  async submitCode(opts: {
    loginSessionId: string;
    code: string;
    password?: string;
  }): Promise<{
    ok: boolean;
    awaitingPassword: boolean;
    accountId?: string;
    hrTelegramAccountId?: string;
  }> {
    this.gc();
    const state = this.sessions.get(opts.loginSessionId);
    if (!state) {
      throw new UnauthorizedException(
        "Login sessiyasi topilmadi yoki muddati o'tdi — boshidan qayta boshlang",
      );
    }
    if (state.expiresAt.getTime() < Date.now()) {
      this.discard(opts.loginSessionId);
      throw new UnauthorizedException("Login sessiyasi muddati o'tdi — boshidan qayta boshlang");
    }

    try {
      if (state.awaitingPassword) {
        if (!opts.password || opts.password.length === 0) {
          throw new BadRequestException('2FA paroli kiritilishi shart');
        }
        await state.client.checkPassword(opts.password);
      } else {
        try {
          await state.client.signIn({
            phoneNumber: state.phoneNumber,
            phoneCodeHash: state.phoneCodeHash,
            phoneCode: opts.code,
          });
        } catch (e) {
          if (isSessionPasswordNeededError(e)) {
            // Telegram requires the 2FA password.
            state.awaitingPassword = true;
            // If admin already included `password`, run it now.
            if (opts.password && opts.password.length > 0) {
              await state.client.checkPassword(opts.password);
            } else {
              return { ok: false, awaitingPassword: true };
            }
          } else {
            throw e;
          }
        }
      }

      // At this point the session is authorized — export + persist.
      const sessionString = state.client.saveSession();
      await this.accounts.persistSession(state.accountId, state.hrTelegramAccountId, sessionString);

      this.discard(opts.loginSessionId);
      return {
        ok: true,
        awaitingPassword: false,
        accountId: state.accountId,
        hrTelegramAccountId: state.hrTelegramAccountId,
      };
    } catch (e) {
      if (isGramjsFloodError(e)) {
        throw new BadRequestException(
          `Telegram FLOOD_WAIT ${e.seconds}s — biroz kutib qayta urinib ko'ring`,
        );
      }
      throw new BadRequestException(HrTelegramLoginService.friendlyError(e));
    }
  }

  /**
   * Kodni QAYTA yuborish — «kod kelmadi» holatida. Telegram «keyingi kanal»
   * bilan jo'natadi (birinchi kod ilovaga ketgan bo'lsa, resend odatда SMS).
   * Mavjud login sessiyasidan foydalanadi (yangi client ochmaydi).
   */
  async resend(loginSessionId: string): Promise<{ ok: boolean; codeSent: boolean }> {
    this.gc();
    const state = this.sessions.get(loginSessionId);
    if (!state) {
      throw new UnauthorizedException(
        "Login sessiyasi topilmadi yoki muddati o'tdi — boshidan qayta boshlang",
      );
    }
    if (!state.client.resendCode) {
      throw new BadRequestException("Qayta yuborish qo'llab-quvvatlanmaydi");
    }
    try {
      const { phoneCodeHash } = await state.client.resendCode();
      if (phoneCodeHash) state.phoneCodeHash = phoneCodeHash;
      // Muddatni yangilaymiz — foydalanuvchi yangi kodni kiritishga ulgursin.
      state.expiresAt = new Date(Date.now() + HrTelegramLoginService.TTL_MS);
      return { ok: true, codeSent: phoneCodeHash.length > 0 };
    } catch (e) {
      if (isGramjsFloodError(e)) {
        throw new BadRequestException(
          `Telegram FLOOD_WAIT ${e.seconds}s — biroz kutib qayta urinib ko'ring`,
        );
      }
      throw new BadRequestException(HrTelegramLoginService.friendlyError(e));
    }
  }

  /** Admin cancels the in-progress login (e.g. closed the modal). */
  async cancel(loginSessionId: string): Promise<{ ok: true }> {
    this.discard(loginSessionId);
    return { ok: true };
  }

  /**
   * Telegram xom xatolarini (PHONE_CODE_EXPIRED, ...) TUSHUNARLI o'zbekcha
   * xabarga aylantiradi — operator nima qilishни bilsin.
   */
  private static friendlyError(e: unknown): string {
    const raw = (e as Error)?.message ?? String(e);
    if (raw.includes('PHONE_CODE_EXPIRED')) {
      return "Kod muddati o'tdi — «Qayta yuborish» bilan YANGI kod oling va 1 daqiqa ichида kiriting";
    }
    if (raw.includes('PHONE_CODE_INVALID') || raw.includes('PHONE_CODE_EMPTY')) {
      return "Kod noto'g'ri — Telegram'дан kelgan kodni tekshirib qayta kiriting";
    }
    if (raw.includes('PASSWORD_HASH_INVALID')) {
      return "2FA parol noto'g'ri — qaytadan kiriting";
    }
    if (raw.includes('PHONE_NUMBER_INVALID')) {
      return "Telefon raqami noto'g'ri";
    }
    if (raw.includes('PHONE_NUMBER_BANNED')) {
      return "Bu raqam Telegram'да bloklangan";
    }
    if (raw.includes('PHONE_NUMBER_UNOCCUPIED')) {
      return "Bu raqam Telegram'да ro'yxatdan o'tmagan";
    }
    return `Telegram: ${raw}`.slice(0, 200);
  }

  private discard(loginSessionId: string): void {
    const state = this.sessions.get(loginSessionId);
    if (!state) return;
    void state.client.disconnect().catch(() => {});
    this.sessions.delete(loginSessionId);
  }

  /** GC expired sessions (called opportunistically on each request). */
  private gc(): void {
    const now = Date.now();
    for (const [id, state] of this.sessions) {
      if (state.expiresAt.getTime() < now) {
        this.logger.debug(`GC expired login session ${id}`);
        this.discard(id);
      }
    }
  }
}
