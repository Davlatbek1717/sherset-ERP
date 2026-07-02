import type { IncomingMessage } from 'node:http';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { WebSocket } from 'ws';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { TokenService } from '../../auth/token.service.js';
import { extractWsToken } from './hr-tasks.gateway.js';

/** Admin-only HR Telegram sync dashboard channel. */
interface SyncClient {
  accountId: string;
}

export interface SyncSnapshot {
  /** Telegram worker enabled (false ⇒ HR_TELEGRAM_DISABLED=true / noop adapter). */
  workerEnabled: boolean;
  /** Outbox rows awaiting delivery (pending + retry). */
  pending: number;
  /** Messages successfully delivered since today's Asia/Tashkent midnight. */
  sentToday: number;
  /** Rows that exhausted retries (need admin re-enqueue). */
  failed: number;
}

interface SyncMessage {
  event: 'connected' | 'sync_status';
  payload: unknown;
}

/** Asia/Tashkent is UTC+5 year-round (no DST) — UTC instant of local midnight. */
function startOfTashkentToday(now = Date.now()): Date {
  const OFFSET_MIN = 5 * 60;
  const local = new Date(now + OFFSET_MIN * 60_000);
  const localMidnightUtc = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
  );
  return new Date(localMidnightUtc - OFFSET_MIN * 60_000);
}

/**
 * HR Sync gateway — admin telegram-worker dashboard (/ws/hr/sync).
 *
 * Pushes a {@link SyncSnapshot} on connect and every 10s thereafter to each
 * connected admin (scoped to their account). Self-contained: reads the outbox
 * directly, so the delivery-critical HrTelegramOutboxWorker stays untouched.
 * Non-admins are rejected at handshake (close 4403).
 */
@Injectable()
@WebSocketGateway({ path: '/api/v1/ws/hr/sync' })
export class HrSyncGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(HrSyncGateway.name);
  private readonly clients = new Map<WebSocket, SyncClient>();

  constructor(
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  /** Test/observability hook. */
  get clientCount(): number {
    return this.clients.size;
  }

  async handleConnection(client: WebSocket, req: IncomingMessage): Promise<void> {
    const token = extractWsToken(req);
    if (!token) {
      client.close(4401, 'unauthorized');
      return;
    }
    try {
      const user = await this.tokens.verifyAccessToken(token);
      const isAdmin = user.hrRoles?.includes('admin') ?? false;
      if (!isAdmin) {
        client.close(4403, 'forbidden'); // admin-only channel
        return;
      }
      this.clients.set(client, { accountId: user.accountId });
      const snapshot = await this.snapshot(user.accountId);
      this.sendTo(client, { event: 'connected', payload: { isAdmin: true } });
      this.sendTo(client, { event: 'sync_status', payload: snapshot });
    } catch (e) {
      this.logger.warn(`Sync WS handshake failed: ${(e as Error).message}`);
      client.close(4401, 'invalid_token');
    }
  }

  handleDisconnect(client: WebSocket): void {
    this.clients.delete(client);
  }

  /** Poll the outbox every 10s and push a fresh snapshot to connected admins. */
  @Cron('*/10 * * * * *')
  async pushUpdates(): Promise<void> {
    if (this.clients.size === 0) return;
    // One snapshot query per distinct account, fanned out to its admins.
    const byAccount = new Map<string, WebSocket[]>();
    for (const [ws, info] of this.clients) {
      if (!this.isOpen(ws)) continue;
      const arr = byAccount.get(info.accountId) ?? [];
      arr.push(ws);
      byAccount.set(info.accountId, arr);
    }
    for (const [accountId, sockets] of byAccount) {
      const snapshot = await this.snapshot(accountId);
      for (const ws of sockets) this.sendTo(ws, { event: 'sync_status', payload: snapshot });
    }
  }

  /** Compute the current outbox snapshot for one account. Exposed for tests. */
  async snapshot(accountId: string): Promise<SyncSnapshot> {
    const [pending, sentToday, failed] = await Promise.all([
      this.prisma.client.hrTelegramOutbox.count({
        where: { accountId, status: { in: ['pending', 'retry'] } },
      }),
      this.prisma.client.hrTelegramOutbox.count({
        where: { accountId, status: 'sent', sentAt: { gte: startOfTashkentToday() } },
      }),
      this.prisma.client.hrTelegramOutbox.count({ where: { accountId, status: 'failed' } }),
    ]);
    return {
      workerEnabled: process.env.HR_TELEGRAM_DISABLED !== 'true',
      pending,
      sentToday,
      failed,
    };
  }

  private sendTo(ws: WebSocket, message: SyncMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch (e) {
      this.logger.warn(`Sync WS send failed: ${(e as Error).message}`);
    }
  }

  private isOpen(ws: WebSocket): boolean {
    return ws.readyState === 1;
  }
}
