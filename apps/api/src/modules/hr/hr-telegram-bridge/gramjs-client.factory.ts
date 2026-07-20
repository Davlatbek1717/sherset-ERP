import { Injectable, Logger } from '@nestjs/common';
import bigInt from 'big-integer';
import { Api, TelegramClient } from 'telegram';
import { computeCheck } from 'telegram/Password.js';
import { NewMessage, type NewMessageEvent } from 'telegram/events/index.js';
import { MarkdownV2Parser } from 'telegram/extensions/markdownv2.js';
import { StringSession } from 'telegram/sessions/index.js';
import { mediaKindFromFlags } from './backfill-plan.util.js';
import type {
  HistoryMtprotoMessage,
  IncomingMtprotoMessage,
  TelegramClientFactory,
  TelegramClientFactoryArgs,
  TelegramClientHandle,
  TgVideoRef,
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

  async sendMessage(
    entity: unknown,
    text: string,
    opts?: { format?: 'default' | 'markdown-v2' },
  ): Promise<{ messageId: string }> {
    // gramjs `sendMessage` accepts an entity-like and returns a Message
    // with numeric `.id` — string-coerced for the worker. `parseMode` is
    // omitted for the default dialect so the client's own default parser
    // (`**bold**`) keeps handling every non-debt caller exactly as before.
    const msg = await this.client.sendMessage(entity as never, {
      message: text,
      ...(opts?.format === 'markdown-v2' ? { parseMode: MarkdownV2Parser } : {}),
    });
    const id = (msg as { id?: number | bigint }).id;
    if (id === undefined) {
      throw new Error('gramjs sendMessage returned no id');
    }
    return { messageId: String(id) };
  }

  /**
   * Videoni «Saved Messages»ga (`'me'`) yuklaydi va hujjat-referensini oladi.
   * `supportsStreaming: true` — video oqim sifatida ko'rinadi (fayl emas).
   * Qaytgan Message.media.document'dan {id, accessHash, fileReference} olinadi;
   * fileReference bytes → base64 (JSON-xavfsiz saqlash uchun).
   */
  async uploadVideoToSelf(filePath: string): Promise<TgVideoRef> {
    const msg = await this.client.sendFile('me', {
      file: filePath,
      forceDocument: false,
      supportsStreaming: true,
    });
    const media = (msg as Api.Message).media;
    if (
      !media ||
      media.className !== 'MessageMediaDocument' ||
      !media.document ||
      media.document.className !== 'Document'
    ) {
      throw new Error('uploadVideoToSelf: yuklangan xabarda hujjat topilmadi');
    }
    const doc = media.document;
    return {
      id: String(doc.id),
      accessHash: String(doc.accessHash),
      fileReference: Buffer.from(doc.fileReference).toString('base64'),
    };
  }

  /**
   * Yuklangan video-referensni `entity`ga yuboradi. `file`ga qayta-qurilgan
   * `Api.InputMediaDocument` beriladi (gramjs uni QAYTA yuklamaydi — referensni
   * ishlatadi). `formattingEntities` — bold oraliqlar to'g'ridan-to'g'ri
   * Api.MessageEntityBold'ga aylanadi (markdown/escape yo'q).
   */
  async sendVideoByRef(
    entity: unknown,
    ref: TgVideoRef,
    caption: string,
    boldRanges: { offset: number; length: number }[],
    quoteRanges?: { offset: number; length: number }[],
  ): Promise<{ messageId: string }> {
    const media = new Api.InputMediaDocument({
      id: new Api.InputDocument({
        id: bigInt(ref.id),
        accessHash: bigInt(ref.accessHash),
        fileReference: Buffer.from(ref.fileReference, 'base64'),
      }),
    });
    // Blockquote (kulrang quti) + bold — ANIQ entity'lar (markdown/escape yo'q).
    // Blockquote'ni oldin qo'yamiz (Telegram entity tartibiga sezgir emas, lekin
    // izchillik uchun); ikkalasi bir oraliqda ustma-ust kelishi mumkin (title).
    const entities = [
      ...(quoteRanges ?? []).map(
        (r) => new Api.MessageEntityBlockquote({ offset: r.offset, length: r.length }),
      ),
      ...boldRanges.map((r) => new Api.MessageEntityBold({ offset: r.offset, length: r.length })),
    ];
    const msg = await this.client.sendFile(entity as never, {
      file: media,
      caption,
      ...(entities.length ? { formattingEntities: entities } : {}),
    });
    const id = (msg as { id?: number | bigint }).id;
    return { messageId: id === undefined ? '' : String(id) };
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

  /**
   * `NewMessage({ incoming: true })` — gramjs's own filter excludes
   * everything WE sent (no echo loop back into `handler`). `event.isPrivate`
   * additionally drops group/channel chatter — only 1:1 customer DMs matter
   * here. Media kind is resolved via gramjs's own `Message` getters (`.photo`
   * / `.voice` / `.video` / `.videoNote` / `.document`, checked in that order
   * since a voice note IS a document under the hood — the specific getter
   * must win over the generic one). One handler failure must never kill the
   * client's update loop, hence the outer try/catch.
   */
  onIncomingMessage(handler: (msg: IncomingMtprotoMessage) => void): void {
    this.client.addEventHandler(
      async (event: NewMessageEvent) => {
        try {
          if (!event.isPrivate) return;
          const msg = event.message;
          const sender = (await msg.getSender().catch(() => undefined)) as Api.User | undefined;
          const fwdFromName = extractFwdFromName(msg);

          let kind: IncomingMtprotoMessage['kind'] = 'text';
          let mimeType: string | null = null;
          let fileName: string | null = null;
          if (msg.photo) {
            kind = 'photo';
            mimeType = 'image/jpeg';
          } else if (msg.voice) {
            kind = 'voice';
            mimeType = msg.voice.mimeType ?? 'audio/ogg';
          } else if (msg.videoNote || msg.video) {
            const doc = msg.video ?? msg.videoNote;
            kind = 'video';
            mimeType = doc?.mimeType ?? 'video/mp4';
          } else if (msg.document) {
            kind = 'document';
            mimeType = msg.document.mimeType ?? 'application/octet-stream';
            const nameAttr = msg.document.attributes.find(
              (a): a is Api.DocumentAttributeFilename =>
                a.className === 'DocumentAttributeFilename',
            );
            fileName = nameAttr?.fileName ?? null;
          }

          handler({
            senderId: String(msg.senderId ?? ''),
            senderPhone: sender?.phone ?? null,
            senderName: [sender?.firstName, sender?.lastName].filter(Boolean).join(' ') || null,
            text: msg.text ?? '',
            tgMessageId: msg.id,
            fwdFromName,
            kind,
            mimeType,
            fileName,
            downloadMedia:
              kind === 'text'
                ? null
                : async () => {
                    const data = await msg.downloadMedia();
                    if (!Buffer.isBuffer(data)) {
                      throw new Error('downloadMedia: Buffer kutilgan edi');
                    }
                    return data;
                  },
          });
        } catch (e) {
          this.logger.warn(`Kiruvchi xabarni o'qishda xato: ${(e as Error).message}`);
        }
      },
      new NewMessage({ incoming: true }),
    );
  }

  /**
   * `getMessages(entity, {limit, offsetId, minId})` — dialog tarixini
   * sahifalab beradi (yangi→eski). Bizning OWN chiquvchi xabarlarimiz ham
   * qaytadi (`msg.out === true`), shuning uchun transkriptning ikkala tomoni
   * quriladi. Xizmat-xabarlar (MessageService — matn ham media ham yo'q)
   * o'tkaziladi. Media `resolveGramjsMedia` bilan aniqlanadi (kind
   * `mediaKindFromFlags` sof mantiqidan, mime/fileName aniq gramjs'dan).
   */
  async getHistory(
    entity: unknown,
    opts: { limit: number; offsetId?: number; minId?: number },
  ): Promise<HistoryMtprotoMessage[]> {
    const msgs = await this.client.getMessages(entity as never, {
      limit: opts.limit,
      ...(opts.offsetId ? { offsetId: opts.offsetId } : {}),
      ...(opts.minId ? { minId: opts.minId } : {}),
    });
    const out: HistoryMtprotoMessage[] = [];
    for (const raw of msgs) {
      const m = raw as Api.Message;
      const media = resolveGramjsMedia(m);
      const text = m.message ?? '';
      // Xizmat-xabar / bo'sh — na matn, na media: transkriptga kirmaydi.
      if (!text && media.kind === 'text') continue;
      const sender = (await m.getSender().catch(() => undefined)) as Api.User | undefined;
      out.push({
        tgMessageId: m.id,
        direction: m.out ? 'out' : 'in',
        text,
        date: m.date,
        senderName: m.out
          ? null
          : [sender?.firstName, sender?.lastName].filter(Boolean).join(' ') || null,
        fwdFromName: extractFwdFromName(m),
        replyToTgMessageId: m.replyTo?.replyToMsgId ?? null,
        kind: media.kind,
        mimeType: media.mimeType,
        fileName: media.fileName,
        downloadMedia:
          media.kind === 'text'
            ? null
            : async () => {
                const data = await m.downloadMedia();
                if (!Buffer.isBuffer(data)) throw new Error('downloadMedia: Buffer kutilgan edi');
                return data;
              },
      });
    }
    return out;
  }
}

/**
 * gramjs `Message` → media kind/mime/fileName. Kind `mediaKindFromFlags` sof
 * mantiqidan (unit-test qilingan); mime/fileName gramjs'ning aniq
 * qiymatlaridan (`onIncomingMessage` bilan bir xil intizom). Voice aslida
 * document ostida — aniqroq getter umumiy `document`dan ustun turadi.
 */
function resolveGramjsMedia(msg: Api.Message): {
  kind: IncomingMtprotoMessage['kind'];
  mimeType: string | null;
  fileName: string | null;
} {
  const kind = mediaKindFromFlags({
    photo: !!msg.photo,
    voice: !!msg.voice,
    video: !!(msg.video || msg.videoNote),
    document: !!msg.document,
  });
  if (kind === 'photo') return { kind, mimeType: 'image/jpeg', fileName: null };
  if (kind === 'voice')
    return { kind, mimeType: msg.voice?.mimeType ?? 'audio/ogg', fileName: null };
  if (kind === 'video') {
    const doc = msg.video ?? msg.videoNote;
    return { kind, mimeType: doc?.mimeType ?? 'video/mp4', fileName: null };
  }
  if (kind === 'document') {
    const nameAttr = msg.document?.attributes.find(
      (a): a is Api.DocumentAttributeFilename => a.className === 'DocumentAttributeFilename',
    );
    return {
      kind,
      mimeType: msg.document?.mimeType ?? 'application/octet-stream',
      fileName: nameAttr?.fileName ?? null,
    };
  }
  return { kind: 'text', mimeType: null, fileName: null };
}

/**
 * `message.forward.sender` is resolved SYNCHRONOUSLY from the entities map
 * that ships with the update (no extra round-trip) — preferred over the raw
 * `fwdFrom.fromId` peer reference. Falls back to `fwdFrom.fromName`, which is
 * what Telegram sends instead of a resolvable sender when the ORIGINAL
 * author has forward-privacy turned on (shows as a plain name string, not a
 * peer — matches the "Переслано от: ABDIXAMIDOVICH" style seen live).
 */
function extractFwdFromName(msg: Api.Message): string | null {
  const fwd = msg.fwdFrom;
  if (!fwd) return null;
  const sender = msg.forward?.sender;
  if (sender) {
    if (sender.className === 'User') {
      const name = [sender.firstName, sender.lastName].filter(Boolean).join(' ');
      if (name) return name;
    } else if ('title' in sender && sender.title) {
      return sender.title;
    }
  }
  return fwd.fromName ?? null;
}
