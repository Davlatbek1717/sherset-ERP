import { Injectable, Logger } from '@nestjs/common';
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
