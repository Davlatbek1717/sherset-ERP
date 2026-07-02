'use client';

import * as React from 'react';

/**
 * Theme = `light` | `dark` | `system`. The `system` option follows the
 * OS-level preference via `prefers-color-scheme` and re-evaluates when
 * the user toggles their OS theme — common ask from accessibility users
 * who flip dark mode at sundown.
 */
export type Theme = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (next: Theme) => void;
  /** The actually-applied theme, never `system`. */
  resolvedTheme: 'light' | 'dark';
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'ms-theme';

/**
 * Wrap your app with `<ThemeProvider />` once near the root to persist
 * the user's choice in localStorage and toggle the `.dark` class on
 * `<html>` so the existing CSS variables flip.
 */
export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = STORAGE_KEY,
  forced,
}: {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
  /**
   * When set, the theme is locked to this value and any stored / OS
   * preference is ignored. Use this when the host app doesn't ship a
   * theme toggle (moysklad.uz parity is light-only). `setTheme` becomes
   * a no-op while forced.
   */
  forced?: Exclude<Theme, 'system'>;
}) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    if (forced) return forced;
    if (typeof window === 'undefined') return defaultTheme;
    try {
      const stored = window.localStorage.getItem(storageKey) as Theme | null;
      if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    } catch {
      // Storage may be blocked (private mode); fall back to default.
    }
    return defaultTheme;
  });

  // If `forced` flips on at runtime (rare), realign state.
  React.useEffect(() => {
    if (forced && theme !== forced) setThemeState(forced);
  }, [forced, theme]);

  const [resolvedTheme, setResolvedTheme] = React.useState<'light' | 'dark'>(() =>
    resolveTheme(theme),
  );

  // Apply the resolved theme to <html> and listen for OS-level changes
  // when the user picked `system`.
  React.useEffect(() => {
    const apply = (t: Theme) => {
      const r = resolveTheme(t);
      setResolvedTheme(r);
      if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle('dark', r === 'dark');
        document.documentElement.dataset.theme = r;
      }
    };
    apply(theme);
    if (theme !== 'system' || typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => apply('system');
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, [theme]);

  const setTheme = React.useCallback(
    (next: Theme) => {
      setThemeState(next);
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        // Same fallback path as on read — fine to silently keep the change in memory.
      }
    },
    [storageKey],
  );

  const value = React.useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, resolvedTheme }),
    [theme, setTheme, resolvedTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }
  return ctx;
}

function resolveTheme(t: Theme): 'light' | 'dark' {
  if (t === 'system') {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return t;
}
