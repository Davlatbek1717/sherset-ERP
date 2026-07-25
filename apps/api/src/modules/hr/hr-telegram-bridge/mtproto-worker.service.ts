import type { Prisma } from '@moysklad/db';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { decryptHrSession } from '../hr-shared/crypto.util.js';
import { HrTelegramAccountService } from '../hr-telegram-account/hr-telegram-account.service.js';
import { HrTelegramEntityCacheService } from './entity-cache.service.js';
import {
  type MtprotoAdapter,
  MtprotoFloodError,
  type MtprotoSendOptions,
  type MtprotoSendResult,
} from './mtproto-adapter.js';
import { MTPROTO_INBOUND_HANDLER, type MtprotoInboundHandler } from './mtproto-inbound-handler.js';
import {
  type HistoryMtprotoMessage,
  TELEGRAM_CLIENT_FACTORY,
  type TelegramClientFactory,
  type TelegramClientHandle,
  type TgVideoRef,
  isGramjsFloodError,
} from './telegram-client-factory.js';

/**
 * Real-world MTProto adapter. Maintains a connected-client pool keyed by
 * `(accountId, slot)`, transparently fails over from slot 1 → slot 2
 * when the primary is flooded, persists `flood_wait_until` so other rows
 * skip the same slot too, and merges Telegram entity lookups into the
 * persistent cache to avoid `getEntity(phone)` round-trips.
 *
 * Tests inject a `TelegramClientFactory` stub; production wires the real
 * gramjs binding via `GramjsTelegramClientFactory`.
 */
/**
 * Hard ceiling for any single gramjs call (connect/auth-check/getEntity/
 * sendMessage). 2026-07-20 incident: this VPS's network path to Telegram had
 * intermittent connectivity trouble (recurring `_updateLoop` TIMEOUT errors
 * in the logs) — a gramjs call that never settles has NO built-in timeout of
 * its own, so it hung forever. Since every call sat behind `await` with no
 * race, `HrTelegramOutboxWorker`'s `running` guard never reset to false,
 * permanently wedging the ENTIRE outbound queue — confirmed reproducible
 * even immediately after a fresh `pm2 restart` (stuck again within ~20s,
 * same tick). This wrapper turns a hang into an ordinary thrown Error, which
 * the existing retry-backoff path (retry-backoff.util.ts) already handles
 * correctly — no other behavior change.
 */
const MTPROTO_CALL_TIMEOUT_MS = 25_000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`mtproto_timeout: ${label} exceeded ${MTPROTO_CALL_TIMEOUT_MS}ms`));
    }, MTPROTO_CALL_TIMEOUT_MS);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Sessiya-O'LIMI signallari (2026-07-21): Telegram serveri sessiyani BEKOR
 * qilgan — bu FLOOD emas (u vaqtinchalik), balki qat'iy: userbot boshqa
 * qurilmadan chiqarilgan / spam uchun o'chirilgan / auth-key bekor qilingan.
 * Bunда slotni «o'lik» deb belgilaymiz (DB tozalanadi) — behuda urinishни
 * to'xtatadi va UI'да yolg'on «Ulangan» o'rniga qayta-login formasi chiqadi.
 * FLOOD_WAIT bu yerга KIRMAYDI (u alohida, vaqtinchalik yo'l bilan boshqariladi).
 */
const AUTH_LOSS_RE = /AUTH_KEY_UNREGISTERED|AUTH_KEY_INVALID|SESSION_REVOKED|USER_DEACTIVATED/i;

@Injectable()
export class MtprotoWorkerService implements MtprotoAdapter, OnModuleInit {
  private readonly logger = new Logger(MtprotoWorkerService.name);
  private static readonly SLOTS = [1, 2] as const;

  /** key: `${accountId}:${slot}` → ready-to-send client. */
  private readonly clients = new Map<string, TelegramClientHandle>();

  /**
   * Ban-himoya throttle (2026-07-21): har AKKAUNT uchun ketma-ket yuborishlar
   * orasidagi MINIMAL bo'shliq (default 3s, `TELEGRAM_SEND_GAP_MS` bilan
   * sozlanadi). Bu MARKAZIY qatlam — HAM qarz-eslatma (outbox), HAM video-tarqatma
   * shu `sendMessage`/`sendVideoByRef` orqali o'tadi, shuning uchun bitta bu
   * yerdagi bo'shliq ikkalasini ham cheklaydi. `nextSendAt` — akkaunt bo'yicha
   * "keyingi ruxsat etilgan yuborish vaqti" (token-bucket: parallel chaqiruvlar
   * ham navbatlanadi). VITEST'da 0 — ko'p-yuborishli testlar sekinlashmasin.
   */
  private readonly nextSendAt = new Map<string, number>();

  private sendGapMs(): number {
    if (process.env.VITEST) return 0;
    return Number(process.env.TELEGRAM_SEND_GAP_MS) || 3000;
  }

  private async pace(accountId: string): Promise<void> {
    const gap = this.sendGapMs();
    if (gap <= 0) return;
    const now = Date.now();
    const at = Math.max(now, this.nextSendAt.get(accountId) ?? 0);
    this.nextSendAt.set(accountId, at + gap);
    const wait = at - now;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }

  /**
   * Xato sessiya-o'limi (AUTH_KEY_UNREGISTERED va o'xshash) bo'lsa: DB'да slotni
   * o'lik deb belgilaymiz (`markSessionLost`) + keshdagi o'lik client'ni tashlaymiz
   * (`releaseClient`). Aks holda keshli o'lik client qayta-qayta AUTH_KEY berardi
   * va UI yolg'on «Ulangan» ko'rsatib turardi. FLOOD bunда emas (u alohida).
   */
  private async handleAuthLossIfAny(accountId: string, slot: number, e: unknown): Promise<void> {
    const msg = (e as Error)?.message ?? String(e);
    if (!AUTH_LOSS_RE.test(msg)) return;
    this.logger.warn(
      `Sessiya bekor qilingan (acc=${accountId} slot=${slot}) — DB tozalanmoqda, qayta-login kerak`,
    );
    await this.accounts.markSessionLost(accountId, slot).catch((err) => {
      this.logger.warn(`markSessionLost xato: ${(err as Error).message}`);
    });
    this.releaseClient(accountId, slot);
  }

  constructor(
    @Inject(TELEGRAM_CLIENT_FACTORY) private readonly factory: TelegramClientFactory,
    @Inject(HrTelegramAccountService) private readonly accounts: HrTelegramAccountService,
    @Inject(HrTelegramEntityCacheService)
    private readonly entityCache: HrTelegramEntityCacheService,
    @Inject(MTPROTO_INBOUND_HANDLER) private readonly inbound: MtprotoInboundHandler,
  ) {}

  /**
   * Boot'da barcha faol userbotlarga ulanamiz + kiruvchi listener biriktiramiz
   * — SEND'GA BOG'LIQ EMAS. Ilgari listener faqat birinchi send'da
   * (`ensureClient`) ulanardi → hech qachon xabar yubormagan mijoz javobi
   * TINGLANMAS edi (bug ildizi). Boot ulanishini bloklamaymiz (fire-and-forget).
   */
  async onModuleInit(): Promise<void> {
    void this.startReceivers();
  }

  /** Har faol (accountId, slot)ga `ensureClient` — listener biriktiradi. */
  async startReceivers(): Promise<void> {
    let slots: { accountId: string; slot: number }[] = [];
    try {
      slots = await this.accounts.listActiveSlots();
    } catch (e) {
      this.logger.warn(`startReceivers: slot ro'yxati xato: ${(e as Error).message}`);
      return;
    }
    for (const { accountId, slot } of slots) {
      // Xato bitta akkauntni to'xtatmasin (flood/auth-loss/tarmoq).
      try {
        const c = await this.ensureClient(accountId, slot);
        if (c) this.logger.log(`Telegram receiver tayyor acc=${accountId} slot=${slot}`);
      } catch (e) {
        this.logger.warn(
          `receiver ulanmadi acc=${accountId} slot=${slot}: ${(e as Error).message}`,
        );
      }
    }
  }

  async sendMessage(opts: MtprotoSendOptions): Promise<MtprotoSendResult> {
    await this.pace(opts.accountId); // ban-himoya: yuborishlar orasi min bo'shliq

    // Self-send (davomat notify): the director's OWN account writes to its own
    // «Saved Messages» via 'me'. No phone/entity resolution, no 1→2 failover —
    // only `viaSlot` (that director account) can reach its own Saved Messages.
    if (opts.toSelf) {
      const slot = opts.viaSlot ?? 0;
      const client = await this.ensureClient(opts.accountId, slot);
      if (!client) {
        throw new Error(`mtproto_self_no_client: acc=${opts.accountId} slot=${slot}`);
      }
      try {
        const res = await withTimeout(client.sendMessage('me', opts.text), 'sendSelf');
        return { slot, messageId: res.messageId };
      } catch (e) {
        if (isGramjsFloodError(e)) {
          const until = new Date(Date.now() + e.seconds * 1000);
          await this.accounts.setFloodWaitUntil(opts.accountId, slot, until).catch(() => {});
          throw new MtprotoFloodError(slot, e.seconds);
        }
        await this.handleAuthLossIfAny(opts.accountId, slot, e);
        throw e;
      }
    }

    const errors: Error[] = [];
    for (const slot of MtprotoWorkerService.SLOTS) {
      if (await this.accounts.isFlooded(opts.accountId, slot)) {
        // Slot is in a flood window — skip silently and try the next.
        continue;
      }
      try {
        const client = await this.ensureClient(opts.accountId, slot);
        if (!client) continue; // no account / no session in this slot

        const { entity } = await this.resolveEntity(client, opts.accountId, slot, opts.toPhone);
        // debt-telegram.util.ts messages (sourceEventType `debt.*`) opt into
        // MarkdownV2Parser for underline support; every other notification
        // family keeps the client's default `**bold**` parser untouched.
        const format = opts.sourceEventType?.startsWith('debt.') ? 'markdown-v2' : 'default';
        const result = await withTimeout(
          client.sendMessage(entity, opts.text, { format }),
          'sendMessage',
        );
        return { slot, messageId: result.messageId };
      } catch (e) {
        if (isGramjsFloodError(e)) {
          // Persist + record so worker + other rows skip this slot.
          const until = new Date(Date.now() + e.seconds * 1000);
          await this.accounts.setFloodWaitUntil(opts.accountId, slot, until).catch(() => {});
          this.logger.warn(
            `FLOOD_WAIT slot=${slot} acc=${opts.accountId} ${e.seconds}s → failover`,
          );
          // Propagate as MtprotoFloodError ONLY if no other slot succeeds —
          // keep trying first. Otherwise, the worker would think a
          // partial-flood is a "row" issue.
          errors.push(new MtprotoFloodError(slot, e.seconds));
          continue;
        }
        errors.push(e as Error);
        this.logger.warn(`Send failed slot=${slot} acc=${opts.accountId}: ${(e as Error).message}`);
        await this.handleAuthLossIfAny(opts.accountId, slot, e);
      }
    }

    // All slots failed. If any failure was a flood, surface that so the
    // worker uses the longer retryAfter window; otherwise generic Error.
    const flood = errors.find((e): e is MtprotoFloodError => e instanceof MtprotoFloodError);
    if (flood) throw flood;
    throw new Error(
      errors.length === 0
        ? 'mtproto_no_active_slot'
        : `mtproto_all_slots_failed: ${errors.map((e) => e.message).join(' | ')}`.slice(0, 500),
    );
  }

  /**
   * Send a local file as a Telegram DOCUMENT (акт-сверка .xlsx) — same slot-loop
   * + flood-failover + `withTimeout` discipline as `sendMessage`.
   */
  async sendDocument(opts: {
    accountId: string;
    toPhone: string;
    filePath: string;
    caption: string;
  }): Promise<MtprotoSendResult> {
    await this.pace(opts.accountId);
    const errors: Error[] = [];
    for (const slot of MtprotoWorkerService.SLOTS) {
      if (await this.accounts.isFlooded(opts.accountId, slot)) continue;
      try {
        const client = await this.ensureClient(opts.accountId, slot);
        if (!client) continue;
        const { entity } = await this.resolveEntity(client, opts.accountId, slot, opts.toPhone);
        const result = await withTimeout(
          client.sendDocument(entity, opts.filePath, opts.caption),
          'sendDocument',
        );
        return { slot, messageId: result.messageId };
      } catch (e) {
        if (isGramjsFloodError(e)) {
          const until = new Date(Date.now() + e.seconds * 1000);
          await this.accounts.setFloodWaitUntil(opts.accountId, slot, until).catch(() => {});
          errors.push(new MtprotoFloodError(slot, e.seconds));
          continue;
        }
        errors.push(e as Error);
        this.logger.warn(
          `sendDocument failed slot=${slot} acc=${opts.accountId}: ${(e as Error).message}`,
        );
        await this.handleAuthLossIfAny(opts.accountId, slot, e);
      }
    }
    const flood = errors.find((e): e is MtprotoFloodError => e instanceof MtprotoFloodError);
    if (flood) throw flood;
    throw new Error(
      errors.length === 0
        ? 'mtproto_no_active_slot'
        : `mtproto_all_slots_failed: ${errors.map((e) => e.message).join(' | ')}`.slice(0, 500),
    );
  }

  /**
   * Dialog tarixidan bitta sahifa oladi — `sendMessage` bilan bir xil
   * slot-loop + flood-failover + `withTimeout` intizomi (2026-07-20
   * to'liq-tarix backfill). Entity resolutsiyasi (`resolveEntity`) va
   * klient pool (`ensureClient`) qayta ishlatiladi.
   */
  async fetchHistory(opts: {
    accountId: string;
    phone: string;
    limit: number;
    offsetId?: number;
    minId?: number;
  }): Promise<{ slot: number; peerId: string | null; messages: HistoryMtprotoMessage[] }> {
    const errors: Error[] = [];
    for (const slot of MtprotoWorkerService.SLOTS) {
      if (await this.accounts.isFlooded(opts.accountId, slot)) continue;
      try {
        const client = await this.ensureClient(opts.accountId, slot);
        if (!client) continue; // no account / no session in this slot
        const { entity, userId } = await this.resolveEntity(
          client,
          opts.accountId,
          slot,
          opts.phone,
        );
        const messages = await withTimeout(
          client.getHistory(entity, {
            limit: opts.limit,
            offsetId: opts.offsetId,
            minId: opts.minId,
          }),
          'getHistory',
        );
        // peerId = peer'ning Telegram user-id'si — backfill chat'ni handleIncoming
        // bilan bir xil (accountId, chatId) bo'yicha birlashtiradi (dublikat yo'q).
        return { slot, peerId: userId, messages };
      } catch (e) {
        if (isGramjsFloodError(e)) {
          const until = new Date(Date.now() + e.seconds * 1000);
          await this.accounts.setFloodWaitUntil(opts.accountId, slot, until).catch(() => {});
          this.logger.warn(
            `FLOOD_WAIT (history) slot=${slot} acc=${opts.accountId} ${e.seconds}s → failover`,
          );
          errors.push(new MtprotoFloodError(slot, e.seconds));
          continue;
        }
        errors.push(e as Error);
        this.logger.warn(
          `fetchHistory failed slot=${slot} acc=${opts.accountId}: ${(e as Error).message}`,
        );
        await this.handleAuthLossIfAny(opts.accountId, slot, e);
      }
    }
    const flood = errors.find((e): e is MtprotoFloodError => e instanceof MtprotoFloodError);
    if (flood) throw flood;
    throw new Error(
      errors.length === 0
        ? 'mtproto_no_active_slot'
        : `mtproto_history_failed: ${errors.map((e) => e.message).join(' | ')}`.slice(0, 500),
    );
  }

  /**
   * Videoni «Saved Messages»ga BIR MARTA yuklaydi va referensni qaytaradi
   * (video-tarqatma, 2026-07-20). sendMessage bilan bir xil slot-loop +
   * flood-failover + withTimeout. Entity resolutsiyasi SHART EMAS — 'me'ga
   * yuklanadi.
   */
  async uploadBroadcastVideo(opts: {
    accountId: string;
    filePath: string;
    thumbPath?: string;
    videoMeta?: { width: number; height: number; durationSec: number };
  }): Promise<{
    slot: number;
    ref: TgVideoRef;
  }> {
    const errors: Error[] = [];
    for (const slot of MtprotoWorkerService.SLOTS) {
      if (await this.accounts.isFlooded(opts.accountId, slot)) continue;
      try {
        const client = await this.ensureClient(opts.accountId, slot);
        if (!client) continue;
        // Video yuklash sekundlar oladi — matn-call timeout (25s)dan uzunroq
        // bo'lishi mumkin, shuning uchun withTimeout O'RALMAYDI (gramjs o'z
        // connectionRetries bilan boshqaradi; hang bo'lsa broadcast-worker
        // keyingi urinishda qayta ishlaydi).
        const ref = await client.uploadVideoToSelf(opts.filePath, opts.thumbPath, opts.videoMeta);
        return { slot, ref };
      } catch (e) {
        if (isGramjsFloodError(e)) {
          const until = new Date(Date.now() + e.seconds * 1000);
          await this.accounts.setFloodWaitUntil(opts.accountId, slot, until).catch(() => {});
          errors.push(new MtprotoFloodError(slot, e.seconds));
          continue;
        }
        errors.push(e as Error);
        this.logger.warn(
          `uploadVideo failed slot=${slot} acc=${opts.accountId}: ${(e as Error).message}`,
        );
        await this.handleAuthLossIfAny(opts.accountId, slot, e);
      }
    }
    const flood = errors.find((e): e is MtprotoFloodError => e instanceof MtprotoFloodError);
    if (flood) throw flood;
    throw new Error(
      errors.length === 0
        ? 'mtproto_no_active_slot'
        : `mtproto_upload_failed: ${errors.map((e) => e.message).join(' | ')}`.slice(0, 500),
    );
  }

  /**
   * Yuklangan video-referensni bitta mijozga (toPhone) yuboradi — sendMessage
   * bilan bir xil slot-loop + resolveEntity (telefon→peer, keshli) + flood.
   */
  async sendVideoByRef(opts: {
    accountId: string;
    toPhone: string;
    ref: TgVideoRef;
    caption: string;
    boldRanges: { offset: number; length: number }[];
    quoteRanges?: { offset: number; length: number }[];
  }): Promise<MtprotoSendResult> {
    await this.pace(opts.accountId); // ban-himoya: yuborishlar orasi min bo'shliq
    const errors: Error[] = [];
    for (const slot of MtprotoWorkerService.SLOTS) {
      if (await this.accounts.isFlooded(opts.accountId, slot)) continue;
      try {
        const client = await this.ensureClient(opts.accountId, slot);
        if (!client) continue;
        const { entity } = await this.resolveEntity(client, opts.accountId, slot, opts.toPhone);
        const result = await withTimeout(
          client.sendVideoByRef(entity, opts.ref, opts.caption, opts.boldRanges, opts.quoteRanges),
          'sendVideoByRef',
        );
        return { slot, messageId: result.messageId };
      } catch (e) {
        if (isGramjsFloodError(e)) {
          const until = new Date(Date.now() + e.seconds * 1000);
          await this.accounts.setFloodWaitUntil(opts.accountId, slot, until).catch(() => {});
          this.logger.warn(
            `FLOOD_WAIT (video) slot=${slot} acc=${opts.accountId} ${e.seconds}s → failover`,
          );
          errors.push(new MtprotoFloodError(slot, e.seconds));
          continue;
        }
        errors.push(e as Error);
        this.logger.warn(
          `sendVideo failed slot=${slot} acc=${opts.accountId}: ${(e as Error).message}`,
        );
        await this.handleAuthLossIfAny(opts.accountId, slot, e);
      }
    }
    const flood = errors.find((e): e is MtprotoFloodError => e instanceof MtprotoFloodError);
    if (flood) throw flood;
    throw new Error(
      errors.length === 0
        ? 'mtproto_no_active_slot'
        : `mtproto_video_failed: ${errors.map((e) => e.message).join(' | ')}`.slice(0, 500),
    );
  }

  // ─── private helpers ────────────────────────────────────────────────

  private clientKey(accountId: string, slot: number): string {
    return `${accountId}:${slot}`;
  }

  /** Get a connected & authorized client, or null if slot is unconfigured. */
  private async ensureClient(
    accountId: string,
    slot: number,
  ): Promise<TelegramClientHandle | null> {
    const cached = this.clients.get(this.clientKey(accountId, slot));
    if (cached) {
      // Trust the cache; on auth loss send() will throw and we'll bubble up.
      return cached;
    }

    const acct = await this.accounts.findActiveBySlot(accountId, slot);
    if (!acct || !acct.sessionEncrypted) return null;

    let apiHash: string;
    let sessionString: string;
    try {
      apiHash = decryptHrSession(acct.apiHashEncrypted);
      sessionString = decryptHrSession(acct.sessionEncrypted);
    } catch (e) {
      this.logger.error(
        `Failed to decrypt credentials for acc=${accountId} slot=${slot}: ${(e as Error).message}`,
      );
      return null;
    }

    const client = this.factory.createClient({
      apiId: acct.apiId,
      apiHash,
      sessionString,
    });
    await withTimeout(client.connect(), 'connect');
    if (!(await withTimeout(client.isUserAuthorized(), 'isUserAuthorized'))) {
      this.logger.warn(
        `Slot ${slot} acc=${accountId}: session not authorized — admin must re-login`,
      );
      await client.disconnect().catch(() => {});
      // Sessiya yaroqsiz — DB'да tozalaymiz (UI qayta-login formasini ko'rsatadi,
      // yolg'on «Ulangan» emas; boot-receiver ham qayta urinmaydi).
      await this.accounts.markSessionLost(accountId, slot).catch(() => {});
      return null;
    }
    // Attach ONCE, right after this fresh connection comes up — a customer's
    // reply to ANY of our sends (not just the one that triggered this
    // ensureClient call) must be captured, so the listener lives for the
    // client's whole lifetime, not just this one send.
    client.onIncomingMessage((msg) => {
      void this.inbound.handleIncoming(accountId, slot, msg).catch((e: Error) => {
        this.logger.warn(
          `Kiruvchi xabarni saqlash xatosi (acc=${accountId} slot=${slot}): ${e.message}`,
        );
      });
    });
    this.clients.set(this.clientKey(accountId, slot), client);
    return client;
  }

  /**
   * Entity resolution with persistent cache. Cache hit → `hydrateEntity`
   * reconstructs a real peer from the stored descriptor. Miss →
   * `client.resolvePhone(phone)`, cache the (plain, JSON-safe) result, then
   * ALSO `hydrateEntity` it before returning — both paths must produce a
   * real, class-intact object; only `hydrateEntity`'s output is ever handed
   * to `sendMessage`.
   *
   * 2026-07-20 (two separate fixes, in order):
   *  1. Was `client.getEntity(phone)`, which ONLY resolves numbers gramjs
   *     already has cached (existing contacts/prior chats) — a brand-new
   *     customer's phone threw "Cannot find any entity", so their FIRST
   *     reminder never went out (confirmed live: debt.debt_issued failed
   *     with exactly that error). Switched to `resolvePhone`
   *     (`contacts.ImportContacts` — resolves ANY Telegram number, contact
   *     or not).
   *  2. Then: returning the raw cached JSON blob on a cache HIT failed
   *     EVERY time with "Cannot cast User to any kind of peer" — JSON
   *     round-tripping strips gramjs's class identity. Confirmed live: the
   *     first send to a phone (cache miss, fresh object) went through; the
   *     next send to the SAME phone (cache hit) failed with that error.
   *     `hydrateEntity` reconstructs a real `Api.InputPeerUser` every time.
   *  3. Then: rows cached by an OLDER build (before fix #2 shipped) store a
   *     different descriptor shape — `hydrateEntity` correctly throws
   *     `hydrateEntity: invalid cached entity shape` on those, which used to
   *     hard-fail the whole send. Confirmed live: a phone cached before this
   *     deploy failed every retry with exactly that error. A malformed cache
   *     entry is just a cache MISS in disguise — fall through to a fresh
   *     `resolvePhone` (which also overwrites the stale row) instead of
   *     failing the send.
   */
  private async resolveEntity(
    client: TelegramClientHandle,
    accountId: string,
    slot: number,
    phone: string,
  ): Promise<{ entity: unknown; userId: string | null }> {
    const cached = await this.entityCache.get(accountId, slot, phone);
    // Both branches go through hydrateEntity — cache hit AND miss must end
    // up with a real, class-intact peer object, never the raw JSON blob
    // (see hydrateEntity's doc comment for the live-confirmed bug this
    // prevents: cache hit → "Cannot cast User to any kind of peer").
    // `userId` — descriptor'dagi peer user-id: backfill chat'ni jonli
    // kiruvchi bilan bir xil chatId bo'yicha birlashtirish uchun (send yo'liga
    // ta'sir qilmaydi — u faqat `entity`ni ishlatadi).
    if (cached) {
      try {
        return { entity: client.hydrateEntity(cached), userId: peerUserId(cached) };
      } catch (e) {
        this.logger.warn(
          `stale/incompatible cached entity for acc=${accountId} slot=${slot} — refetching: ${(e as Error).message}`,
        );
      }
    }
    const fresh = await withTimeout(client.resolvePhone(phone), 'resolvePhone');
    const serialized = serializeEntityForCache(fresh);
    if (serialized !== null) {
      // JSON.parse(JSON.stringify(...)) round-trip guarantees Prisma-JSON-safe.
      await this.entityCache
        .set(accountId, slot, phone, serialized as Prisma.InputJsonValue)
        .catch((e) => this.logger.warn(`entity cache set failed: ${(e as Error).message}`));
    }
    return { entity: client.hydrateEntity(fresh), userId: peerUserId(fresh) };
  }

  /** Drop a connected client (e.g. on auth invalidation by HR ops). */
  releaseClient(accountId: string, slot: number): void {
    const key = this.clientKey(accountId, slot);
    const c = this.clients.get(key);
    if (c) {
      void c.disconnect().catch(() => {});
      this.clients.delete(key);
    }
  }
}

/**
 * `{userId, accessHash}` descriptor'dan (resolvePhone natijasi yoki keshdan)
 * peer'ning Telegram user-id'sini string sifatida ajratadi. Backfill shu
 * id'ni `TelegramChat.chatId` qiladi — `handleIncoming` ham xuddi shu
 * (senderId) ni ishlatadi, shuning uchun ikkovi bir chatga birlashadi.
 */
function peerUserId(desc: unknown): string | null {
  if (desc && typeof desc === 'object') {
    const u = (desc as { userId?: unknown }).userId;
    if (typeof u === 'string') return u;
    if (typeof u === 'number' || typeof u === 'bigint') return String(u);
  }
  return null;
}

/** Best-effort serialization — preserves what gramjs accepts on the wire. */
function serializeEntityForCache(entity: unknown): unknown {
  if (entity === null || entity === undefined) return null;
  // gramjs entities usually have a toJSON method.
  if (typeof entity === 'object') {
    const obj = entity as { toJSON?: () => unknown };
    if (typeof obj.toJSON === 'function') {
      try {
        return obj.toJSON();
      } catch {
        return null;
      }
    }
    // Fall back to the object itself if Prisma's Json column will accept it.
    try {
      // Round-trip through JSON to strip functions/symbols.
      return JSON.parse(JSON.stringify(entity));
    } catch {
      return null;
    }
  }
  return entity;
}
