'use client';

/**
 * Subscribes to the admin HR Telegram-sync WebSocket (/api/v1/ws/hr/sync) and
 * returns the latest {@link HrSyncStatus} snapshot (worker state + outbox
 * counters). The server pushes a snapshot on connect and every ~10s.
 *
 * Admin-only: a non-admin handshake is closed 4403 server-side; we then stop
 * (no reconnect). Auth via `?token=` query, mirroring use-hr-tasks-socket.
 *
 * Reconnect: exponential backoff (1s → 16s) on non-clean close.
 */

import { getAccessToken, useAuth } from '@/lib/auth-store';
import { useEffect, useState } from 'react';

export interface HrSyncStatus {
  /** Telegram worker enabled (false ⇒ HR_TELEGRAM_DISABLED / noop adapter). */
  workerEnabled: boolean;
  /** Outbox rows awaiting delivery (pending + retry). */
  pending: number;
  /** Messages delivered since today's Asia/Tashkent midnight. */
  sentToday: number;
  /** Rows that exhausted retries (need admin re-enqueue). */
  failed: number;
}

interface IncomingMessage {
  event: 'connected' | 'sync_status';
  payload: unknown;
}

const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 16_000;

export function useHrSyncSocket(): HrSyncStatus | null {
  const auth = useAuth();
  const [status, setStatus] = useState<HrSyncStatus | null>(null);

  useEffect(() => {
    if (!auth.user) return;
    if (typeof WebSocket === 'undefined') return;

    let ws: WebSocket | null = null;
    let reconnectMs = RECONNECT_MIN_MS;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let aborted = false;

    const connect = () => {
      if (aborted) return;
      const token = getAccessToken();
      if (!token) {
        reconnectTimer = setTimeout(connect, RECONNECT_MIN_MS);
        return;
      }
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${window.location.host}/api/v1/ws/hr/sync?token=${encodeURIComponent(token)}`;

      try {
        ws = new WebSocket(url);
      } catch {
        return;
      }

      ws.onmessage = (event) => {
        let msg: IncomingMessage;
        try {
          msg = JSON.parse(event.data as string) as IncomingMessage;
        } catch {
          return;
        }
        if (msg.event === 'sync_status') {
          setStatus(msg.payload as HrSyncStatus);
          reconnectMs = RECONNECT_MIN_MS; // healthy connection — reset backoff
        }
      };

      ws.onclose = (event) => {
        ws = null;
        if (aborted) return;
        // 4401 = unauthorized, 4403 = not an admin — neither should be retried.
        if (event.code === 4401 || event.code === 4403) return;
        reconnectTimer = setTimeout(connect, reconnectMs);
        reconnectMs = Math.min(reconnectMs * 2, RECONNECT_MAX_MS);
      };

      ws.onerror = () => {
        // Defer to onclose for backoff.
      };
    };

    connect();

    return () => {
      aborted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(1000, 'unmount');
        }
      }
    };
  }, [auth.user]);

  return status;
}
