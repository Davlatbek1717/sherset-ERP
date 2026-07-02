import { Injectable, Logger } from '@nestjs/common';
import { type Observable, Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';

/**
 * Notification realtime fan-out — pub/sub bridge between
 * `NotificationService.emit()` (the producer) and the SSE controller
 * stream (the per-user consumer).
 *
 * Design choices:
 * - **One global Subject, server-side filtering**: simpler than a Map of
 *   per-recipient subjects. The expected fan-in is modest (≪1k events/s
 *   for an MVP-scale tenant base) and `.filter()` is O(N subscribers)
 *   per event which is fine at this volume.
 * - **In-memory only**: a multi-instance API would need Redis Pub/Sub
 *   (or PG `LISTEN/NOTIFY`); when we scale past one node we'll swap the
 *   in-process Subject for a Redis-backed one without changing the
 *   public method signatures.
 * - **No-op when nobody is listening**: emitting to a Subject with zero
 *   subscribers is free, so callers don't need to know whether a user
 *   is online before calling `publish()`.
 */
@Injectable()
export class NotificationGateway {
  private readonly logger = new Logger(NotificationGateway.name);
  private readonly stream$ = new Subject<NotificationEvent>();

  /**
   * Push a notification event to subscribers. Called from
   * `NotificationService.emit()` after the row is committed.
   */
  publish(event: NotificationEvent): void {
    this.stream$.next(event);
    this.logger.debug(`event=${event.kind} recipient=${event.recipientId}`);
  }

  /**
   * Subscribe to events for a specific recipient. Returns an Observable
   * suitable for the `@Sse()` decorator (NestJS coerces it into a
   * `MessageEvent` stream).
   */
  subscribe(accountId: string, recipientId: string): Observable<{ data: NotificationEvent }> {
    return this.stream$.pipe(
      filter((e) => e.accountId === accountId && e.recipientId === recipientId),
      map((data) => ({ data })),
    );
  }
}

export interface NotificationEvent {
  /** Notification id — matches the row in the `Notification` table. */
  id: string;
  accountId: string;
  recipientId: string;
  kind: string;
  title: string;
  body: string | null;
  entity: string | null;
  entityId: string | null;
  createdAt: string;
}
