'use client';

/**
 * Subscribes to the HR Tasks WebSocket (/api/v1/ws/hr/tasks) for the current
 * user. Server pushes JSON messages on these event types:
 *   • task_dispatched   → invalidate my-tasks/logs/templates + toast "new task"
 *   • task_answered     → invalidate logs + my-tasks
 *   • pending_review    → invalidate review queue (delivered to the checker)
 *   • task_finalized    → invalidate everything + ['hr-review-pending']
 *   • task_deadline_expired → same as finalized
 *
 * Auth: JWT access token passed via `?token=` query (raw-WS handshake cannot
 * carry custom headers; mirrors use-notification-stream.ts). The subscription
 * employee is derived from the JWT server-side — never client-supplied.
 *
 * Reconnect: simple exponential backoff (1s → 2s → 4s → 8s, capped at 16s)
 * on non-clean close. Cleans up on unmount and on user identity change.
 */

import { getAccessToken, useAuth } from '@/lib/auth-store';
import { useToast } from '@moysklad/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

interface IncomingMessage {
  event:
    | 'connected'
    | 'task_dispatched'
    | 'task_answered'
    | 'pending_review'
    | 'task_finalized'
    | 'task_deadline_expired';
  payload: unknown;
}

const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 16_000;

export function useHrTasksSocket(): void {
  const auth = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const t = useTranslations('pages.hrTasks');
  // Keep latest toast/t in refs so the WS effect doesn't reconnect each render.
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const tRef = useRef(t);
  tRef.current = t;

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
        // No token (refresh in-flight) — retry shortly.
        reconnectTimer = setTimeout(connect, RECONNECT_MIN_MS);
        return;
      }
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${window.location.host}/api/v1/ws/hr/tasks?token=${encodeURIComponent(token)}`;

      try {
        ws = new WebSocket(url);
      } catch {
        // Browser rejected the URL — bail; will retry on next user change.
        return;
      }

      ws.onmessage = (event) => {
        let msg: IncomingMessage;
        try {
          msg = JSON.parse(event.data as string) as IncomingMessage;
        } catch {
          return;
        }
        switch (msg.event) {
          case 'task_dispatched':
            void qc.invalidateQueries({ queryKey: ['hr-my-tasks'] });
            void qc.invalidateQueries({ queryKey: ['hr-task-logs'] });
            void qc.invalidateQueries({ queryKey: ['hr-task-templates'] });
            toastRef.current.info(tRef.current('toast_new_task'));
            break;
          case 'task_answered':
            void qc.invalidateQueries({ queryKey: ['hr-task-logs'] });
            void qc.invalidateQueries({ queryKey: ['hr-my-tasks'] });
            break;
          case 'pending_review':
            void qc.invalidateQueries({ queryKey: ['hr-review-pending'] });
            break;
          case 'task_finalized':
          case 'task_deadline_expired':
            void qc.invalidateQueries({ queryKey: ['hr-my-tasks'] });
            void qc.invalidateQueries({ queryKey: ['hr-task-logs'] });
            void qc.invalidateQueries({ queryKey: ['hr-review-pending'] });
            break;
          case 'connected':
            // Handshake OK — reset backoff.
            reconnectMs = RECONNECT_MIN_MS;
            break;
        }
      };

      ws.onclose = (event) => {
        ws = null;
        if (aborted) return;
        // 4401 = our explicit unauthorized close; refresh in-flight or token
        // genuinely invalid. Either way the next user-change re-arms us;
        // don't hammer the server.
        if (event.code === 4401) return;
        reconnectTimer = setTimeout(connect, reconnectMs);
        reconnectMs = Math.min(reconnectMs * 2, RECONNECT_MAX_MS);
      };

      ws.onerror = () => {
        // Defer to onclose for backoff. ws.close() will fire close handler.
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
        // 1000 = normal closure
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(1000, 'unmount');
        }
      }
    };
  }, [auth.user, qc]);
}
