'use client';

import { useAuth } from '@/lib/auth-store';
import { Spinner } from '@moysklad/ui';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Client auth-gate + touch-density shell for /davomat.
 *
 * `useAuth()` triggers bootstrapSession() so a direct-URL / installed-PWA load
 * hydrates the token from the refresh cookie before children fire api calls
 * (same reason as print/layout.tsx). Unauthenticated employees are sent to
 * /login. The shell re-scales the ERP's dense 12px baseline to a 16px
 * touch baseline for this subtree only (tokens still apply globally).
 */
export function DavomatGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.initialized && !auth.user) router.replace('/login?next=/davomat');
  }, [auth.initialized, auth.user, router]);

  if (!auth.initialized) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--ms-bg-app)]">
        <Spinner />
      </div>
    );
  }
  if (!auth.user) return null;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[var(--ms-bg-app)] text-[16px] text-[var(--ms-text-primary)] antialiased">
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))]">
        {children}
      </div>
    </div>
  );
}
