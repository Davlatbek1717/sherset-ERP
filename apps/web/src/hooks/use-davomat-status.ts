'use client';

import { hrDavomatApi } from '@/lib/hr-api';
import { useQuery } from '@tanstack/react-query';

/**
 * Employee davomat status (my/today). Fallback/seed channel — the primary live
 * update is the ping response. Polls every 30s (for a stationary device whose
 * pings are throttled) and refreshes on window focus (tab resume).
 */
export function useDavomatStatus() {
  return useQuery({
    queryKey: ['davomat', 'my-today'],
    queryFn: () => hrDavomatApi.myToday(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });
}
