'use client';

import { getAccessToken, useAuth } from '@/lib/auth-store';
import { useToast } from '@moysklad/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

interface StreamEvent {
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

/**
 * Subscribes to the SSE notification stream for the current user.
 * Whenever the server pushes an event we:
 *   1. Invalidate the notifications query (bell badge refreshes).
 *   2. Surface a transient toast so the user notices even if the bell
 *      popover is closed.
 *
 * EventSource has no header support, so we pass the JWT as a query
 * string. The /stream endpoint authenticates from `?token=` exactly the
 * same way the rest of the API authenticates from `Authorization`.
 *
 * Reconnection: EventSource handles transient drops automatically; we
 * only re-create the connection when the user identity changes.
 */
export function useNotificationStream() {
  const auth = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const tKinds = useTranslations('notifications.kinds');

  useEffect(() => {
    if (!auth.user) return;
    const token = getAccessToken();
    if (!token) return;
    if (typeof EventSource === 'undefined') return;

    const url = `/api/v1/notifications/stream?access_token=${encodeURIComponent(token)}`;
    const es = new EventSource(url, { withCredentials: true });

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as StreamEvent;
        // Refresh the bell + drawer; cheap because we only invalidate.
        void qc.invalidateQueries({ queryKey: ['notifications'] });
        // When a picking task is assigned, refresh the omborchi dashboard instantly.
        if (data.kind === 'picking_assigned') {
          void qc.invalidateQueries({ queryKey: ['omborchi-picking'] });
          void qc.invalidateQueries({ queryKey: ['omborchi-ready'] });
        }
        // Toast — title falls back to the kind label so the user always
        // sees something readable, even for kinds we haven't translated.
        toast.info(data.title, {
          description: data.body ?? safeKind(data.kind, tKinds),
          duration: 6000,
        });
      } catch {
        // Malformed payload — ignore. Don't surface to the user.
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects with backoff; we only log noisy
      // errors during dev. No-op in prod prevents toast spam if the
      // server restarts during deploy.
    };

    return () => es.close();
  }, [auth.user, qc, toast, tKinds]);
}

function safeKind(kind: string, t: ReturnType<typeof useTranslations>): string {
  try {
    return t(kind as Parameters<typeof t>[0]);
  } catch {
    return kind;
  }
}
