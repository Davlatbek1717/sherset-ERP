import type { Prisma } from '@moysklad/db';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { decryptHrSession } from '../hr-shared/crypto.util.js';
import { HrTelegramAccountService } from '../hr-telegram-account/hr-telegram-account.service.js';
import { HrTelegramEntityCacheService } from './entity-cache.service.js';
import {
  type MtprotoAdapter,
  MtprotoFloodError,
  type MtprotoSendOptions,
  type MtprotoSendResult,
} from './mtproto-adapter.js';
import {
  TELEGRAM_CLIENT_FACTORY,
  type TelegramClientFactory,
  type TelegramClientHandle,
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
@Injectable()
export class MtprotoWorkerService implements MtprotoAdapter {
  private readonly logger = new Logger(MtprotoWorkerService.name);
  private static readonly SLOTS = [1, 2] as const;

  /** key: `${accountId}:${slot}` → ready-to-send client. */
  private readonly clients = new Map<string, TelegramClientHandle>();

  constructor(
    @Inject(TELEGRAM_CLIENT_FACTORY) private readonly factory: TelegramClientFactory,
    @Inject(HrTelegramAccountService) private readonly accounts: HrTelegramAccountService,
    @Inject(HrTelegramEntityCacheService)
    private readonly entityCache: HrTelegramEntityCacheService,
  ) {}

  async sendMessage(opts: MtprotoSendOptions): Promise<MtprotoSendResult> {
    const errors: Error[] = [];
    for (const slot of MtprotoWorkerService.SLOTS) {
      if (await this.accounts.isFlooded(opts.accountId, slot)) {
        // Slot is in a flood window — skip silently and try the next.
        continue;
      }
      try {
        const client = await this.ensureClient(opts.accountId, slot);
        if (!client) continue; // no account / no session in this slot

        const entity = await this.resolveEntity(client, opts.accountId, slot, opts.toPhone);
        const result = await client.sendMessage(entity, opts.text);
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
    await client.connect();
    if (!(await client.isUserAuthorized())) {
      this.logger.warn(
        `Slot ${slot} acc=${accountId}: session not authorized — admin must re-login`,
      );
      await client.disconnect().catch(() => {});
      return null;
    }
    this.clients.set(this.clientKey(accountId, slot), client);
    return client;
  }

  /**
   * Entity resolution with persistent cache. Cache hit returns immediately;
   * miss falls through to `client.getEntity(phone)` and persists the result.
   * Stored value is opaque JSON from gramjs (`entity.toJSON?.()` or itself).
   */
  private async resolveEntity(
    client: TelegramClientHandle,
    accountId: string,
    slot: number,
    phone: string,
  ): Promise<unknown> {
    const cached = await this.entityCache.get(accountId, slot, phone);
    if (cached) return cached;
    const fresh = await client.getEntity(phone);
    const serialized = serializeEntityForCache(fresh);
    if (serialized !== null) {
      // JSON.parse(JSON.stringify(...)) round-trip guarantees Prisma-JSON-safe.
      await this.entityCache
        .set(accountId, slot, phone, serialized as Prisma.InputJsonValue)
        .catch((e) => this.logger.warn(`entity cache set failed: ${(e as Error).message}`));
    }
    return fresh;
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
