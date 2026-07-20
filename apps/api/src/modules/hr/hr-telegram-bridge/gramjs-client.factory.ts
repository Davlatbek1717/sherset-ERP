import { Injectable, Logger } from '@nestjs/common';
import bigInt from 'big-integer';
import { Api, TelegramClient } from 'telegram';
import { computeCheck } from 'telegram/Password.js';
import { StringSession } from 'telegram/sessions/index.js';
import type {
  TelegramClientFactory,
  TelegramClientFactoryArgs,
  TelegramClientHandle,
} from './telegram-client-factory.js';

/**
 * Production binding: real gramjs `TelegramClient`. Wraps each instance in
 * the narrow `TelegramClientHandle` surface so the adapter doesn't need to
 * know about gramjs internals (Api ctors, StringSession, computeCheck, ...).
 *
 * This file is the ONLY place that imports `telegram` at module load —
 * test runtime swaps the entire factory via DI and never touches gramjs.
 */
@Injectable()
export class GramjsTelegramClientFactory implements TelegramClientFactory {
  private readonly logger = new Logger(GramjsTelegramClientFactory.name);

  createClient(args: TelegramClientFactoryArgs): TelegramClientHandle {
    const session = new StringSession(args.sessionString);
    const client = new TelegramClient(session, args.apiId, args.apiHash, {
      connectionRetries: 5,
      autoReconnect: true,
      useWSS: true,
    });
    return new GramjsClientHandle(client, args.phoneNumber ?? undefined, this.logger);
  }
}

declare module './telegram-client-factory.js' {
  interface TelegramClientFactoryArgs {
    /** Optional — required only for `sendCode`/`signIn` (login wizard). */
    phoneNumber?: string;
  }
}

/** Concrete handle that wraps a single gramjs TelegramClient. */
class GramjsClientHandle implements TelegramClientHandle {
  private phoneCodeHash: string | null = null;

  constructor(
    private readonly client: TelegramClient,
    private readonly phoneNumberForLogin: string | undefined,
    private readonly logger: Logger,
  ) {}

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.disconnect();
    } catch (e) {
      this.logger.debug(`disconnect swallowed: ${(e as Error).message}`);
    }
  }

  async isUserAuthorized(): Promise<boolean> {
    return this.client.isUserAuthorized();
  }

  async getEntity(phone: string): Promise<unknown> {
    return this.client.getEntity(phone);
  }

  /**
   * `contacts.ImportContacts` — resolves a phone number to a User even if
   * it's never been contacted before (unlike `getEntity`, which only works
   * for numbers already resolvable from gramjs's own session cache). This
   * is exactly what Telegram's own "add contact by phone" flow does under
   * the hood; the imported entry is kept (matches the account's own contact
   * list showing customers — harmless, and lets a later cache-miss reuse it
   * via plain `getEntity` too).
   *
   * Returns a PLAIN `{userId, accessHash}` descriptor (strings), not the raw
   * gramjs `Api.User` — the persistent entity cache stores whatever this
   * returns as Prisma Json, and a real gramjs class instance does NOT
   * survive that JSON round-trip (loses `SUBCLASS_OF_ID`, see
   * `hydrateEntity`'s doc comment for the live-confirmed failure mode this
   * avoids). Reconstruct the actual sendable peer via `hydrateEntity`.
   */
  async resolvePhone(phone: string): Promise<unknown> {
    const result = await this.client.invoke(
      new Api.contacts.ImportContacts({
        contacts: [
          new Api.InputPhoneContact({
            clientId: bigInt(Date.now()),
            phone,
            firstName: phone,
            lastName: '',
          }),
        ],
      }),
    );
    const users = (result as unknown as { users?: unknown[] }).users ?? [];
    const user = users[0] as { id?: unknown; accessHash?: unknown } | undefined;
    if (!user || user.id === undefined) {
      throw new Error(`resolvePhone: "${phone}" Telegram'da topilmadi (raqam ro'yxatdan o'tmagan)`);
    }
    return {
      userId: String(user.id),
      accessHash: String(user.accessHash ?? '0'),
    };
  }

  /**
   * Reconstruct a real, sendable `Api.InputPeerUser` from a `{userId,
   * accessHash}` descriptor (fresh from `resolvePhone`, or round-tripped
   * through the JSON entity cache — same shape either way, so this always
   * works). 2026-07-20 incident: without this, a cache HIT handed the
   * JSON-deserialized (class-identity-stripped) object straight to
   * `sendMessage`, which failed with "Cannot cast User to any kind of peer"
   * on gramjs's internal `getInputPeer()` — confirmed live: first send to a
   * phone (cache miss) worked, every later send to the SAME phone (cache
   * hit) failed with exactly that error.
   */
  hydrateEntity(cached: unknown): unknown {
    const c = cached as { userId?: string; accessHash?: string } | undefined;
    if (!c || typeof c.userId !== 'string') {
      throw new Error('hydrateEntity: invalid cached entity shape');
    }
    return new Api.InputPeerUser({
      userId: bigInt(c.userId),
      accessHash: bigInt(c.accessHash ?? '0'),
    });
  }

  async sendMessage(entity: unknown, text: string): Promise<{ messageId: string }> {
    // gramjs `sendMessage` accepts an entity-like and returns a Message
    // with numeric `.id` — string-coerced for the worker.
    const msg = await this.client.sendMessage(entity as never, { message: text });
    const id = (msg as { id?: number | bigint }).id;
    if (id === undefined) {
      throw new Error('gramjs sendMessage returned no id');
    }
    return { messageId: String(id) };
  }

  async sendCode(opts: {
    apiId: number;
    apiHash: string;
    phoneNumber: string;
  }): Promise<{ phoneCodeHash: string }> {
    const result = await this.client.invoke(
      new Api.auth.SendCode({
        phoneNumber: opts.phoneNumber,
        apiId: opts.apiId,
        apiHash: opts.apiHash,
        settings: new Api.CodeSettings({}),
      }),
    );
    // gramjs returns Api.auth.SentCode | Api.auth.SentCodeSuccess. Both
    // shapes carry `phoneCodeHash` on the SentCode variant; SentCodeSuccess
    // means the user is already signed in (e.g. fresh OTP not needed) —
    // we surface an empty hash so the wizard's signIn step is skipped.
    const hash = (result as unknown as { phoneCodeHash?: string }).phoneCodeHash ?? '';
    this.phoneCodeHash = hash;
    return { phoneCodeHash: hash };
  }

  /**
   * Kodni QAYTA yuborish — Telegram «keyingi kanal» bilan jo'natadi (birinchi
   * SendCode ilovaga ketgan bo'lsa, resend odatда SMS bilan keladi). Kod
   * kelmaganда «SMS orqali qayta yuborish» tugmasi shuni chaqiradi.
   */
  async resendCode(): Promise<{ phoneCodeHash: string }> {
    if (!this.phoneNumberForLogin || !this.phoneCodeHash) {
      throw new Error('resendCode: avval sendCode chaqirilishi kerak');
    }
    const result = await this.client.invoke(
      new Api.auth.ResendCode({
        phoneNumber: this.phoneNumberForLogin,
        phoneCodeHash: this.phoneCodeHash,
      }),
    );
    const hash =
      (result as unknown as { phoneCodeHash?: string }).phoneCodeHash ?? this.phoneCodeHash;
    this.phoneCodeHash = hash;
    return { phoneCodeHash: hash };
  }

  async signIn(opts: {
    phoneNumber: string;
    phoneCodeHash: string;
    phoneCode: string;
  }): Promise<void> {
    await this.client.invoke(
      new Api.auth.SignIn({
        phoneNumber: opts.phoneNumber,
        phoneCodeHash: opts.phoneCodeHash,
        phoneCode: opts.phoneCode,
      }),
    );
  }

  async checkPassword(password: string): Promise<void> {
    const pw = await this.client.invoke(new Api.account.GetPassword());
    const check = await computeCheck(pw, password);
    await this.client.invoke(new Api.auth.CheckPassword({ password: check }));
  }

  saveSession(): string {
    const sess = this.client.session as StringSession;
    return sess.save();
  }
}
