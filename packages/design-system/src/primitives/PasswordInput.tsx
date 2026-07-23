'use client';

import { Eye, EyeOff } from 'lucide-react';
import * as React from 'react';
import { Input, type InputProps } from './Input.tsx';

export interface PasswordInputProps extends Omit<InputProps, 'type' | 'trailing'> {
  /** Eye-toggle aria-labels — localize from the page (uz fallbacks match the
   *  design-system default-leak convention used by Modal/ConfirmDialog). */
  showLabel?: string;
  hideLabel?: string;
  /** data-test-id for the eye button (the input keeps its own via ...rest). */
  toggleTestId?: string;
}

/**
 * Password field with a show/hide eye toggle (owner 2026-07-19: «parolni
 * ko'rish tugmasi barcha joylarga»). Renders the standard Input with a
 * trailing eye button; clicking it flips the input between `password` and
 * `text` so the typed value can be checked before submitting. The toggle is
 * kept OUT of the tab order (tabIndex -1) so Enter-flows and form tabbing
 * are unchanged; the value/state is never touched by the toggle.
 */
export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  (
    {
      showLabel = "Parolni ko'rsatish",
      hideLabel = 'Parolni yashirish',
      toggleTestId = 'password-toggle',
      ...rest
    },
    ref,
  ) => {
    const [visible, setVisible] = React.useState(false);
    return (
      <Input
        ref={ref}
        type={visible ? 'text' : 'password'}
        trailing={
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? hideLabel : showLabel}
            title={visible ? hideLabel : showLabel}
            className="flex items-center justify-center text-[var(--ms-text-muted)] transition-colors hover:text-[var(--ms-text-primary)] focus:outline-none"
            data-test-id={toggleTestId}
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        }
        {...rest}
      />
    );
  },
);
PasswordInput.displayName = 'PasswordInput';
