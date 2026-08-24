'use client';

import { getAccessToken, useAuth } from '@/lib/auth-store';
import {
  armNotificationSound,
  playNotificationSound,
  showBrowserNotification,
} from '@/lib/notification-sound';
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

    // F2: unlock the audible signal (and the browser Notification permission)
    // on the user's first gesture — after that the ding plays even when this
    // tab sits in another window.
    armNotificationSound();

    const url = `/api/v1/notifications/stream?access_token=${encodeURIComponent(token)}`;
    const es = new EventSource(url, { withCredentials: true });

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as StreamEvent;
        // Refresh the bell + drawer; cheap because we only invalidate.
        void qc.invalidateQueries({ queryKey: ['notifications'] });
        // G2 — kontrol oqimi: katta omborchi chek tarkibini o'zgartirdi
        // (`sale_edited`) yoki «To'liq» dedi (`sale_ready`). Kassirning ochiq
        // POS ro'yxatlari 8s poll'ni KUTMASDAN yangilansin — kassir mijoz
        // oldida turibdi. Prefiks-invalidatsiya: kalitlar sessionId bilan
        // tugaydi, prefiks hammasini qamraydi. Kontrol navbati ham yangilanadi
        // (boshqa kontrolchi tahrir qilgan bo'lishi mumkin).
        if (data.kind === 'sale_edited' || data.kind === 'sale_ready') {
          void qc.invalidateQueries({ queryKey: ['retail-sales-picking'] });
          void qc.invalidateQueries({ queryKey: ['retail-sales-ready'] });
          void qc.invalidateQueries({ queryKey: ['retail-sales-session'] });
          void qc.invalidateQueries({ queryKey: ['kontrol-queue'] });
          if (data.entityId) {
            void qc.invalidateQueries({ queryKey: ['kontrol-sale', data.entityId] });
          }
        }
        // F2 «signal-xabar»: audible ding — works in background tabs too
        // (AudioContext was unlocked by a prior gesture).
        playNotificationSound();
        // Other-window/minimized case: the in-app toast is invisible there —
        // raise an OS-level notification instead.
        if (document.hidden) {
          showBrowserNotification(data.title, data.body ?? safeKind(data.kind, tKinds));
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
