'use client';

import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { useQuery } from '@tanstack/react-query';

interface TasksBadgeResponse {
  count: number;
}

/**
 * Active-task count for the current user, polled every 60 seconds so
 * the red number on the navbar Задачи tab reflects what the user owes
 * without forcing a manual refresh. Returns 0 until auth resolves so
 * the badge stays hidden during bootstrap.
 *
 * Backed by GET /tasks/badge-count which counts tasks assigned to the
 * caller that aren't in a terminal status (done/cancelled) and aren't
 * archived. Moysklad parity: their navbar shows e.g. "7" in red when
 * the user has open tasks.
 */
export function useTasksBadgeCount(): number {
  const auth = useAuth();
  const { data } = useQuery<TasksBadgeResponse>({
    queryKey: ['tasks', 'badge-count'],
    queryFn: () => api.get<TasksBadgeResponse>('/tasks/badge-count'),
    enabled: !!auth.user,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  return data?.count ?? 0;
}
