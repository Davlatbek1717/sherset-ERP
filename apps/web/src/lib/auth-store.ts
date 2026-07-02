'use client';

/**
 * In-memory access token store + session bootstrap.
 *
 * Access token lives in memory (not localStorage — XSS protection).
 * Refresh token is HttpOnly cookie set by the API.
 *
 * On page load, try /auth/refresh to get a fresh access token from cookie.
 * On 401 during a request, attempt refresh once before giving up.
 *
 * Soft persistence: a `ms:auth-hint` flag in sessionStorage records that a
 * session WAS established. The flag carries no secret — its only role is to
 * tell the layout "don't redirect to /login during the brief async bootstrap
 * window after an HMR reload or tab restore." Once bootstrap completes (with
 * either success or genuine refresh failure) the flag is updated. Without
 * this, every Next.js dev HMR chunk reload would flash the user back to /login
 * even though the refresh cookie is valid.
 */

import { useEffect, useSyncExternalStore } from 'react';

const AUTH_HINT_KEY = 'ms:auth-hint';

function readAuthHint(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(AUTH_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

function writeAuthHint(authed: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (authed) window.sessionStorage.setItem(AUTH_HINT_KEY, '1');
    else window.sessionStorage.removeItem(AUTH_HINT_KEY);
  } catch {
    /* sessionStorage may be unavailable in private mode — non-fatal */
  }
}

export type HrAccessLevel = 'full' | 'read' | 'own_only';

export interface HrPermissionRow {
  pageKey: string;
  section: string | null;
  accessLevel: HrAccessLevel;
}

export interface User {
  id: string;
  accountId: string;
  email: string;
  name: string;
  position: string | null;
  /**
   * Subscription plan code from the account (`'trial' | 'basic' | 'pro' | …`).
   * Drives the moysklad-style trial banner — when `accountPlan === 'trial'`
   * the AppShell renders the yellow "Перейдите на платный тариф" strip.
   */
  accountPlan: string;
  // === HR kengaytma (P1) ===
  username: string | null;
  hrRoles: string[];
  isChecker: boolean;
  hrPermissions: HrPermissionRow[];
}

interface State {
  accessToken: string | null;
  user: User | null;
  initialized: boolean;
}

let state: State = { accessToken: null, user: null, initialized: false };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getSnapshot(): State {
  return state;
}

const BASE = '/api/v1';

export async function login(identifier: string, password: string): Promise<void> {
  const isEmail = identifier.includes('@');
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(
      isEmail ? { email: identifier, password } : { username: identifier, password },
    ),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  const data = (await res.json()) as { accessToken: string; user: User };
  state = { accessToken: data.accessToken, user: data.user, initialized: true };
  writeAuthHint(true);
  emit();
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch {
    /* ignore */
  }
  state = { accessToken: null, user: null, initialized: true };
  writeAuthHint(false);
  emit();
}

/**
 * Single-flight guard. The API ROTATES the refresh cookie on every /auth/refresh
 * (old token is consumed). Two CONCURRENT refresh calls therefore race: the
 * first wins and rotates, the second sends the now-consumed token, gets 401 and
 * logs the session out. This really happens — React StrictMode double-fires the
 * bootstrap effect in dev, and a 401-retry can overlap a route-change bootstrap
 * — and it presented as the long-misdiagnosed "automation context bounces to
 * /login on hard nav" artifact (NEXT.md 06-03g). Concurrent callers must share
 * ONE in-flight request. (Cross-TAB races still exist — two tabs have separate
 * JS contexts — closing that needs a server-side rotation grace window; see
 * QA-backlog.)
 */
let refreshInFlight: Promise<boolean> | null = null;

export function refresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { accessToken: string; user: User };
      state = { accessToken: data.accessToken, user: data.user, initialized: true };
      writeAuthHint(true);
      emit();
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function bootstrapSession(): Promise<void> {
  if (state.initialized) return;
  await refresh();
  if (!state.initialized) {
    state = { accessToken: null, user: null, initialized: true };
    writeAuthHint(false);
    emit();
  }
}

export function useAuth() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    if (!snapshot.initialized) void bootstrapSession();
  }, [snapshot.initialized]);
  return snapshot;
}

/**
 * `true` if a session was established at any point this tab's lifetime.
 * Layout uses this to suppress the redirect-to-login flash during the
 * brief bootstrap window after an HMR reload or a route change — the user
 * still has a valid refresh cookie, we just haven't called /auth/refresh
 * yet, so showing /login mid-fetch is a wrong UX cue.
 */
export function hasAuthHint(): boolean {
  return readAuthHint();
}

export function getAccessToken(): string | null {
  return state.accessToken;
}
