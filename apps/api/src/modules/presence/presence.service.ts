import { Injectable } from '@nestjs/common';

/**
 * In-memory document presence registry powering moysklad's «Смотрит» (who-is-
 * viewing) indicator. Each viewer sends a heartbeat while their document detail
 * page is open; the indicator shows the OTHER viewers currently looking at the
 * same document (so two employees opening the same order see each other).
 *
 * Scope/limits (honest): this is a single-process in-memory store — it does NOT
 * share state across multiple API instances (fine for the current single-node
 * deploy; a horizontal scale-out would need Redis/pub-sub). A viewer is counted
 * "present" for `TTL_MS` after their last heartbeat; stale entries are pruned on
 * the next heartbeat to the same document. No DB writes — presence is ephemeral.
 */

interface Viewer {
  userId: string;
  name: string;
  /** epoch ms of the last heartbeat. */
  ts: number;
}

export interface PresenceViewer {
  userId: string;
  name: string;
}

/** A viewer is "present" for 30s after their last heartbeat (FE polls every ~12s,
 *  so two missed beats drop them). */
const TTL_MS = 30_000;

@Injectable()
export class PresenceService {
  /** key = `${accountId}:${entity}:${entityId}` → userId → Viewer */
  private readonly rooms = new Map<string, Map<string, Viewer>>();

  private key(accountId: string, entity: string, entityId: string): string {
    return `${accountId}:${entity}:${entityId}`;
  }

  /**
   * Record a heartbeat for `userId` viewing `entity/entityId`, prune stale
   * viewers, and return the OTHER current viewers (caller excluded — moysklad's
   * «Смотрит» shows who ELSE is looking, never yourself).
   */
  heartbeat(
    accountId: string,
    entity: string,
    entityId: string,
    userId: string,
    name: string,
  ): PresenceViewer[] {
    const key = this.key(accountId, entity, entityId);
    let room = this.rooms.get(key);
    if (!room) {
      room = new Map();
      this.rooms.set(key, room);
    }
    const now = Date.now();
    room.set(userId, { userId, name, ts: now });
    for (const [uid, v] of room) {
      if (now - v.ts > TTL_MS) room.delete(uid);
    }
    if (room.size === 0) {
      this.rooms.delete(key);
      return [];
    }
    return [...room.values()]
      .filter((v) => v.userId !== userId)
      .map((v) => ({ userId: v.userId, name: v.name }));
  }

  /** Best-effort explicit leave (FE calls this on unmount / navigation away). */
  leave(accountId: string, entity: string, entityId: string, userId: string): void {
    const key = this.key(accountId, entity, entityId);
    const room = this.rooms.get(key);
    if (!room) return;
    room.delete(userId);
    if (room.size === 0) this.rooms.delete(key);
  }
}
