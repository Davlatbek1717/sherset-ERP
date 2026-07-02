'use client';

import { api } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

export interface PresenceViewer {
  userId: string;
  name: string;
}

/**
 * moysklad «Смотрит» — document presence. While the detail page is open this
 * sends a heartbeat every ~12s and returns the OTHER employees currently viewing
 * the same document (the backend excludes the caller). Two people opening the
 * same order therefore see each other's avatar. Pauses while the tab is hidden
 * (no point heartbeating when nobody's looking) and sends a best-effort `leave`
 * on unmount so the indicator clears promptly for the others.
 */
export function usePresence(entity: string, entityId: string | undefined): PresenceViewer[] {
  const { data } = useQuery<{ viewers: PresenceViewer[] }>({
    queryKey: ['presence', entity, entityId],
    queryFn: () => api.post(`/presence/${entity}/${entityId}/heartbeat`, {}),
    enabled: !!entityId,
    refetchInterval: 12_000,
    refetchIntervalInBackground: false,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  useEffect(() => {
    if (!entityId) return;
    return () => {
      api.post(`/presence/${entity}/${entityId}/leave`, {}).catch(() => {});
    };
  }, [entity, entityId]);

  return data?.viewers ?? [];
}
