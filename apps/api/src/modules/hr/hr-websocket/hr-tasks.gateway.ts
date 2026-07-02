import type { IncomingMessage } from 'node:http';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { WebSocket } from 'ws';
import { TokenService } from '../../auth/token.service.js';
import {
  HR_EVENT,
  type HrTaskAnsweredEvent,
  type HrTaskDispatchedEvent,
  type HrTaskLogDeadlineExpiredEvent,
  type HrTaskLogFinalizedEvent,
  type HrTaskPendingReviewEvent,
} from '../hr-shared/hr-events.types.js';

interface ClientInfo {
  /** Employee.id (JWT.sub). */
  sub: string;
  accountId: string;
  isAdmin: boolean;
}

interface OutgoingMessage {
  event:
    | 'connected'
    | 'task_dispatched'
    | 'task_answered'
    | 'pending_review'
    | 'task_finalized'
    | 'task_deadline_expired';
  payload: unknown;
}

/**
 * Extract JWT access token from the upgrade request. Tries query param first
 * (?token=ey…) then falls back to Cookie header (access_token=…). Returns
 * null if no token found.
 *
 * Pure function — exported for unit testing.
 */
export function extractWsToken(req: IncomingMessage): string | null {
  // 1. Query param ?token=…
  const rawUrl = req.url ?? '';
  const qMark = rawUrl.indexOf('?');
  if (qMark >= 0) {
    const params = new URLSearchParams(rawUrl.slice(qMark + 1));
    const t = params.get('token');
    if (t && t.length > 0) return t;
  }
  // 2. Cookie fallback (access_token=…)
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === 'access_token') return rest.join('=');
  }
  return null;
}

/** Decides whether a connected client should receive an event for the given employee. */
export function shouldDeliverTo(
  info: ClientInfo,
  eventAccountId: string,
  eventEmployeeId: string,
): boolean {
  if (info.accountId !== eventAccountId) return false;
  if (info.isAdmin) return true;
  return info.sub === eventEmployeeId;
}

@Injectable()
@WebSocketGateway({ path: '/api/v1/ws/hr/tasks' })
export class HrTasksGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(HrTasksGateway.name);
  private readonly clients = new Map<WebSocket, ClientInfo>();

  constructor(@Inject(TokenService) private readonly tokens: TokenService) {}

  /** Test/observability hook — count connected clients. */
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
      const info: ClientInfo = { sub: user.sub, accountId: user.accountId, isAdmin };
      this.clients.set(client, info);
      this.sendTo(client, {
        event: 'connected',
        payload: { sub: user.sub, isAdmin },
      });
    } catch (e) {
      this.logger.warn(`WS handshake failed: ${(e as Error).message}`);
      client.close(4401, 'invalid_token');
    }
  }

  handleDisconnect(client: WebSocket): void {
    this.clients.delete(client);
  }

  @OnEvent(HR_EVENT.HR_TASK_DISPATCHED)
  onTaskDispatched(payload: HrTaskDispatchedEvent): void {
    this.broadcast({ event: 'task_dispatched', payload }, (info) =>
      shouldDeliverTo(info, payload.accountId, payload.employeeId),
    );
  }

  @OnEvent(HR_EVENT.HR_TASK_ANSWERED)
  onTaskAnswered(payload: HrTaskAnsweredEvent): void {
    this.broadcast({ event: 'task_answered', payload }, (info) =>
      shouldDeliverTo(info, payload.accountId, payload.employeeId),
    );
  }

  @OnEvent(HR_EVENT.HR_TASK_PENDING_REVIEW)
  onTaskPendingReview(payload: HrTaskPendingReviewEvent): void {
    // Deliver to the designated CHECKER (admins always receive too).
    this.broadcast({ event: 'pending_review', payload }, (info) =>
      shouldDeliverTo(info, payload.accountId, payload.checkerId),
    );
  }

  @OnEvent(HR_EVENT.HR_TASK_LOG_FINALIZED)
  onTaskFinalized(payload: HrTaskLogFinalizedEvent): void {
    this.broadcast({ event: 'task_finalized', payload }, (info) =>
      shouldDeliverTo(info, payload.accountId, payload.employeeId),
    );
  }

  @OnEvent(HR_EVENT.HR_TASK_LOG_DEADLINE_EXPIRED)
  onTaskDeadlineExpired(payload: HrTaskLogDeadlineExpiredEvent): void {
    this.broadcast({ event: 'task_deadline_expired', payload }, (info) =>
      shouldDeliverTo(info, payload.accountId, payload.employeeId),
    );
  }

  /** Test hook — invoke broadcast directly without going through EventEmitter. */
  broadcastForTest(message: OutgoingMessage, filter: (info: ClientInfo) => boolean): number {
    return this.broadcast(message, filter);
  }

  private broadcast(message: OutgoingMessage, filter: (info: ClientInfo) => boolean): number {
    let delivered = 0;
    for (const [ws, info] of this.clients) {
      if (!filter(info)) continue;
      if (this.isOpen(ws)) {
        this.sendTo(ws, message);
        delivered++;
      }
    }
    return delivered;
  }

  private sendTo(ws: WebSocket, message: OutgoingMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch (e) {
      this.logger.warn(`WS send failed: ${(e as Error).message}`);
    }
  }

  /**
   * Treat the ws-library OPEN state (1) as "ready to send". Wrapped in a helper
   * so tests can stub clients with just `{ readyState: 1, send: vi.fn() }`.
   */
  private isOpen(ws: WebSocket): boolean {
    return ws.readyState === 1;
  }
}
