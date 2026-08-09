'use client';

import * as React from 'react';

/**
 * Bind a global keyboard shortcut.
 *
 * @example
 *   useHotkey('mod+k', () => setOpen(true));
 *   useHotkey('?', () => setHelpOpen(true), { ignoreInputs: true });
 *   useHotkey('Escape', () => setOpen(false));
 *
 * Combo grammar: `mod+k`, `shift+/`, `ctrl+s`, plain key like `Escape`.
 * `mod` resolves to ⌘ on macOS and Ctrl on every other platform — the
 * standard cross-platform convention, same as VS Code / Linear.
 *
 * Default behaviour: ignores keystrokes typed inside `<input>`,
 * `<textarea>`, `<select>`, and contenteditable elements so a shortcut
 * like `?` does not fire while the user is typing into a form. Pass
 * `{ ignoreInputs: false }` to override (rare — usually for `Escape`).
 *
 * NB: this is per-element, not per-overlay. A dialog that renders its own
 * buttons still needs `{ enabled: !open }` on the page-level hotkeys —
 * focus can sit on the dialog body, which is not an input.
 */
export interface UseHotkeyOptions {
  /** Don't fire when focus is inside an input/textarea. Default true. */
  ignoreInputs?: boolean;
  /** Disable the binding entirely. Useful for conditionally-active palettes. */
  enabled?: boolean;
  /** Prevent default browser behaviour. Default true. */
  preventDefault?: boolean;
  /** Element to bind on. Defaults to window. */
  target?: 'window' | 'document';
}

export function useHotkey(
  combo: string,
  handler: (e: KeyboardEvent) => void,
  opts: UseHotkeyOptions = {},
): void {
  const { ignoreInputs = true, enabled = true, preventDefault = true, target = 'window' } = opts;
  const handlerRef = React.useRef(handler);
  React.useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  React.useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const parts = combo
      .toLowerCase()
      .split('+')
      .map((p) => p.trim());
    const wantMod = parts.includes('mod') || parts.includes('cmd') || parts.includes('ctrl');
    const wantShift = parts.includes('shift');
    const wantAlt = parts.includes('alt') || parts.includes('option');
    const key = parts[parts.length - 1];

    const listener = (e: KeyboardEvent) => {
      if (ignoreInputs) {
        const t = e.target as HTMLElement | null;
        // SELECT is in this list because a native <select> does type-ahead:
        // pressing "a" while it has focus is the user searching its options,
        // not firing a shortcut. Leaving it out cost a real data change —
        // MK14 browser QA caught a manager pressing "a" in the reject
        // dialog's reason picker and silently ACCEPTING the day instead.
        if (
          t &&
          (t.tagName === 'INPUT' ||
            t.tagName === 'TEXTAREA' ||
            t.tagName === 'SELECT' ||
            t.isContentEditable)
        ) {
          return;
        }
      }
      const isMac =
        typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/.test(navigator.platform);
      const modPressed = isMac ? e.metaKey : e.ctrlKey;
      if (wantMod && !modPressed) return;
      if (!wantMod && modPressed) return;
      if (wantShift !== e.shiftKey) return;
      if (wantAlt !== e.altKey) return;
      if (e.key.toLowerCase() !== key) return;
      if (preventDefault) e.preventDefault();
      handlerRef.current(e);
    };

    const el: Window | Document = target === 'document' ? document : window;
    el.addEventListener('keydown', listener as EventListener);
    return () => el.removeEventListener('keydown', listener as EventListener);
  }, [combo, enabled, ignoreInputs, preventDefault, target]);
}
