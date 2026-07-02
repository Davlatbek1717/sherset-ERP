'use client';

import './print.css';
import { useAuth } from '@/lib/auth-store';

/**
 * Bare layout for printable doc views — no sidebar, no app chrome.
 * Inherits NextIntl + QueryClient from the root layout.
 *
 * `useAuth()` triggers `bootstrapSession()` on first mount so the
 * in-memory access token is hydrated from the refresh-cookie before
 * child pages issue their `api.get(...)` calls. Without this,
 * loading a print URL directly (or after a server restart that
 * blew away the in-memory token) returns 401 even though the
 * refresh cookie is still valid.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  // Render children only once the auth bootstrap has resolved — otherwise
  // the first paint fires API calls before the token lands and we get
  // a flash of "Not found" / 401 errors.
  if (!auth.initialized) {
    return (
      <div className="print-root">
        <div className="print-page" style={{ textAlign: 'center', padding: '40px 20px' }}>
          Loading…
        </div>
      </div>
    );
  }
  return <div className="print-root">{children}</div>;
}
