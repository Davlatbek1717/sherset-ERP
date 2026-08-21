'use client';

import * as React from 'react';
import {
  formatMoney,
  groupMajorDraft,
  majorToMinorInput,
  minorToMajorInput,
} from '../lib/format.ts';
import { Input, type InputProps } from './Input.tsx';

/** Index just after the `sig`-th significant char (digit or comma) in `s` — used
 *  to keep the caret anchored to the same digit after thin-spaces are re-grouped. */
function caretAfterSignificant(s: string, sig: number): number {
  if (sig <= 0) return 0;
  let count = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch !== undefined && /[\d,]/.test(ch)) {
      count++;
      if (count === sig) return i + 1;
    }
  }
  return s.length;
}

export interface MoneyInputProps
  extends Omit<InputProps, 'value' | 'onChange' | 'type' | 'inputMode'> {
  /** Stored amount in minor units (tiyin) — the caller's source of truth. */
  valueMinor: string;
  /** Emits the new minor (tiyin) string as the user edits the major (som) amount. */
  onChangeMinor: (minor: string) => void;
  /**
   * When true, clearing the field emits `''` instead of `'0'`. List «Сумма от/до»
   * filters need to tell "no bound" (cleared → omit the query param) apart from
   * "0", which `majorToMinorInput('')` → `'0'` would otherwise collapse into a
   * silent `≥ 0` filter that matches every row. Default `false` keeps the money-
   * entry contract (a cleared price emits `'0'` so save-time `sum > 0` rejects it).
   */
  allowEmpty?: boolean;
  /**
   * Shows the fully-formatted amount («9 990,00» — comma decimals, thin-space
   * thousands) at REST *and keeps the thousands grouping LIVE while editing*
   * (re-grouping on each keystroke, caret preserved) so it never jumps to a plain
   * «9990» on focus. moysklad formats EVERY money field this way, so this defaults
   * to `true` (small-fn parity audit 2026-07-06, gap 2.5 — money «Сумма» fields
   * were showing plain «3000000» instead of «3 000 000,00»). Pass `false` only for
   * the rare field that must display an ungrouped integer. Display-only: the
   * emitted minor value is `majorToMinorInput(raw)` regardless of this flag.
   */
  displayFormatted?: boolean;
}

/**
 * Money field that DISPLAYS and ACCEPTS the major amount (som) while
 * storing/emitting minor units (tiyin) — a drop-in for the old
 * `<Input value={x.sumMinor} onChange={e => set(e.target.value)} />` pattern:
 * swap `value`→`valueMinor` and `onChange`→`onChangeMinor` and the caller's
 * minor-based state, line-total math, and save payload stay untouched.
 *
 * Why it exists: every money input in the app bound the raw minor value, so a
 * user typing "300000" booked a 3 000,00 сум document (100× too small). This
 * shows "300000" as 300 000 сум. Scale is /100 (UZS), matching `formatMoney`'s
 * display scale; full non-UZS support is a separate, grounding-gated effort.
 *
 * Mid-typing: an internal draft holds what the user types (in `displayFormatted`
 * mode it's re-grouped to «9 990,00» live, caret kept anchored), and the parsed
 * minor value is emitted on every keystroke so dependent totals stay live. On
 * blur — and on external `valueMinor` changes while not editing — the draft
 * re-syncs to the canonical form ("300000." → "300000" / «300 000,00»).
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ valueMinor, onChangeMinor, allowEmpty = false, displayFormatted = true, ...rest }, ref) => {
    // Canonical at-rest text: «9 990,00» for a formatted money cell, else plain «9990».
    const canonical = React.useCallback(
      (v: string) =>
        displayFormatted && v !== '' && v != null
          ? formatMoney(v, 'UZS', { displayAs: 'none' })
          : minorToMajorInput(v),
      [displayFormatted],
    );

    const [draft, setDraft] = React.useState(() => canonical(valueMinor));
    const [editing, setEditing] = React.useState(false);

    // Merge the forwarded ref with an internal one (needed to restore the caret
    // after re-grouping a formatted draft).
    const innerRef = React.useRef<HTMLInputElement | null>(null);
    const setRefs = React.useCallback(
      (el: HTMLInputElement | null) => {
        innerRef.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      },
      [ref],
    );
    // Caret to apply after a formatted re-group (set in onChange, applied post-render).
    const pendingCaret = React.useRef<number | null>(null);
    React.useLayoutEffect(() => {
      if (pendingCaret.current != null && innerRef.current) {
        innerRef.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
        pendingCaret.current = null;
      }
    });

    React.useEffect(() => {
      if (!editing) setDraft(canonical(valueMinor));
    }, [valueMinor, editing, canonical]);

    return (
      <Input
        ref={setRefs}
        {...rest}
        type="text"
        inputMode="decimal"
        value={draft}
        onFocus={(e) => {
          setEditing(true);
          // 🔴 Tiyin kiritish shu yerda buzilardi (egasi, 2026-08-21).
          // Maydon dam olishda «1 000,00» ko'rsatadi — ikkita tiyin raqami
          // ALLAQACHON bor. Matn tanlanmasa, foydalanuvchi oxiriga bosib
          // yozgan belgi kasr 2 xonaga kesilgani uchun jimgina yo'qolardi
          // («umuman ishlamayapti»). Fokusda butun qiymat tanlanadi, ya'ni
          // «1000,50» deb yozish eski qiymat ustiga tushadi.
          e.currentTarget.select();
          rest.onFocus?.(e);
        }}
        onBlur={() => {
          setEditing(false);
          setDraft(canonical(valueMinor));
        }}
        onChange={(e) => {
          const el = e.target;
          const raw = el.value;
          if (allowEmpty && raw.trim() === '') {
            setDraft('');
            onChangeMinor('');
            return;
          }
          if (displayFormatted) {
            // moysklad parity: keep the «9 990,00» grouping LIVE while typing (no
            // jump to plain «9990» on focus). Re-group the draft and re-anchor the
            // caret to the same digit so inserted thin-spaces don't shift it.
            const caret = el.selectionStart ?? raw.length;
            const sig = raw.slice(0, caret).replace(/[^\d,]/g, '').length;
            const formatted = groupMajorDraft(raw);
            setDraft(formatted);
            pendingCaret.current = caretAfterSignificant(formatted, sig);
          } else {
            setDraft(raw);
          }
          onChangeMinor(majorToMinorInput(raw));
        }}
      />
    );
  },
);
MoneyInput.displayName = 'MoneyInput';
