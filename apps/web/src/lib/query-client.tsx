'use client';

import { QueryClient, QueryClientProvider, keepPreviousData } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // Keep the previous page's data on screen while the next query
            // (pagination / sort / filter / search) is in flight, instead of
            // dropping to a skeleton and remounting every row. Removes the
            // flash + full re-render that read as "lag" on every list
            // interaction across ~90 list pages. First-ever load still shows
            // the skeleton (no previous data to keep).
            placeholderData: keepPreviousData,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
