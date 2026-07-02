'use client';

import { AlertCircle } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn.ts';
import { Button } from '../primitives/Button.tsx';

/**
 * Imperative confirmation dialog. Replaces `window.confirm()` everywhere
 * — moysklad uses a styled modal with two or three buttons (cancel /
 * confirm; sometimes a third "discard" for unsaved changes).
 *
 * Why imperative:
 *   `if (await confirm({ title: ... })) { do(); }`
 *   reads exactly like `window.confirm` and avoids prop-drilling state
 *   into every page that needs a destructive prompt.
 *
 * Design choices:
 * - Single global mount (one provider) — multiple confirms queued.
 * - Backdrop click + ESC = cancel; Enter = confirm (when destructive=false).
 *   Destructive prompts require explicit click to prevent accidents.
 * - `tone='destructive'` colours the confirm button red (Delete / Remove).
 * - `tone='warning'` for unsaved-changes-style prompts (yellow accent).
 *
 * Usage:
 *   1. Mount once: <ConfirmProvider />
 *   2. Anywhere:
 *        const { confirm } = useConfirm();
 *        const ok = await confirm({
 *          title: "Hujjatni o'chirishni xohlaysizmi?",
 *          description: "Bu amalni qaytarib bo'lmaydi.",
 *          confirmLabel: "O'chirish",
 *          tone: "destructive",
 *        });
 *        if (ok) deleteIt();
 */

export type ConfirmTone = 'default' | 'destructive' | 'warning';

export interface ConfirmInput {
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  /** Optional 3rd button for "discard / don't save" style flows. */
  discardLabel?: string;
}

/** Result of confirm(). For 2-button: true=confirm, false=cancel.
 *  For 3-button (discardLabel set): 'confirm' | 'discard' | 'cancel'. */
export type ConfirmResult = boolean | 'confirm' | 'discard' | 'cancel';

interface ConfirmContextApi {
  confirm: (input: ConfirmInput) => Promise<ConfirmResult>;
}

/** Localized fallbacks for the confirm/cancel buttons when a `confirm()`
 * call omits them. The web app injects these (RU/UZ via next-intl); the
 * design-system keeps an Uzbek hard fallback so it works standalone. */
export interface ConfirmDefaultLabels {
  confirm?: string;
  cancel?: string;
}

const ConfirmContext = React.createContext<ConfirmContextApi | null>(null);

interface PendingConfirm {
  id: string;
  input: ConfirmInput;
  resolve: (r: ConfirmResult) => void;
}

let counter = 0;

export function ConfirmProvider({
  children,
  defaultLabels,
}: {
  children: React.ReactNode;
  defaultLabels?: ConfirmDefaultLabels;
}) {
  const [queue, setQueue] = React.useState<PendingConfirm[]>([]);

  const confirm = React.useCallback((input: ConfirmInput): Promise<ConfirmResult> => {
    return new Promise<ConfirmResult>((resolve) => {
      counter += 1;
      const id = `c-${counter}`;
      setQueue((prev) => [...prev, { id, input, resolve }]);
    });
  }, []);

  const resolveTop = React.useCallback((result: ConfirmResult) => {
    setQueue((prev) => {
      if (prev.length === 0) return prev;
      const [head, ...rest] = prev;
      // For 2-button mode the caller wants boolean; for 3-button (discard
      // present) they typically want the string variant. We pass through
      // both — caller branches with `=== true` or `=== 'discard'`.
      head?.resolve(head.input.discardLabel ? result : result === 'confirm' || result === true);
      return rest;
    });
  }, []);

  const top = queue[0];

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {top ? (
        <ConfirmDialog
          key={top.id}
          input={top.input}
          onResolve={resolveTop}
          defaults={defaultLabels}
        />
      ) : null}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({
  input,
  onResolve,
  defaults,
}: {
  input: ConfirmInput;
  onResolve: (r: ConfirmResult) => void;
  defaults?: ConfirmDefaultLabels;
}) {
  const { title, description, confirmLabel, cancelLabel, tone, discardLabel } = input;
  // Resolve each label: explicit call value → injected localized default →
  // Uzbek hard fallback. Before this the bare 'Bekor qilish' / 'Davom etish'
  // defaults (and the backdrop aria-label) leaked Uzbek into the RU UI.
  const resolvedCancel = cancelLabel ?? defaults?.cancel ?? 'Bekor qilish';
  const resolvedConfirm = confirmLabel ?? defaults?.confirm ?? 'Davom etish';
  const confirmRef = React.useRef<HTMLButtonElement>(null);

  // Focus the confirm button on mount for keyboard users — but for
  // destructive prompts focus the cancel instead, so accidental Enter
  // doesn't delete data.
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    const target = tone === 'destructive' ? cancelRef.current : confirmRef.current;
    target?.focus();
  }, [tone]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onResolve('cancel');
      } else if (e.key === 'Enter' && tone !== 'destructive') {
        // Allow Enter to confirm only for non-destructive prompts. Active
        // element check prevents Enter inside textareas from triggering.
        const active = document.activeElement;
        if (active === confirmRef.current || active === document.body) {
          e.preventDefault();
          onResolve('confirm');
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onResolve, tone]);

  return (
    // biome-ignore lint/a11y/useSemanticElements: imperative confirm overlay (custom backdrop + centered panel); a native <dialog> would override our focus/scroll/ESC handling — role="dialog"+aria-modal is the correct ARIA here
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      data-testid="confirm-dialog"
      // pointer-events-auto: a Radix Modal (Dialog) sets `pointer-events:none`
      // on <body> while open. This confirm overlay renders as a body child
      // OUTSIDE the modal tree, so without this it INHERITS that lock and is
      // visible-but-unclickable when invoked from within an open modal (e.g.
      // the optimistic-lock conflict reload, or an in-modal delete prompt).
      className="pointer-events-auto fixed inset-0 z-[var(--ms-z-confirm)] flex items-center justify-center"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label={resolvedCancel}
        onClick={() => onResolve('cancel')}
        className="absolute inset-0 bg-black/40"
      />
      {/* Panel */}
      <div className="relative w-[400px] max-w-[calc(100vw-2rem)] rounded-[var(--ms-radius-md)] bg-white p-5 shadow-[var(--ms-shadow-lg)]">
        <div className="flex items-start gap-3">
          {tone === 'destructive' || tone === 'warning' ? (
            <AlertCircle
              className={cn(
                'mt-0.5 h-5 w-5 shrink-0',
                tone === 'destructive'
                  ? 'text-[var(--ms-text-destructive)]'
                  : 'text-[var(--ms-text-warning)]',
              )}
              aria-hidden
            />
          ) : null}
          <div className="flex-1 min-w-0">
            <div
              id="confirm-title"
              className="font-semibold text-base text-[var(--ms-text-primary)]"
            >
              {title}
            </div>
            {description ? (
              <div className="mt-1.5 text-[var(--ms-text-muted)] text-sm leading-relaxed">
                {description}
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button
            ref={cancelRef}
            type="button"
            variant="secondary"
            onClick={() => onResolve('cancel')}
            data-testid="confirm-cancel"
          >
            {resolvedCancel}
          </Button>
          {discardLabel ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => onResolve('discard')}
              data-testid="confirm-discard"
            >
              {discardLabel}
            </Button>
          ) : null}
          <Button
            ref={confirmRef}
            type="button"
            variant={tone === 'destructive' ? 'destructive' : 'primary'}
            onClick={() => onResolve('confirm')}
            data-testid="confirm-confirm"
          >
            {resolvedConfirm}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function useConfirm(): ConfirmContextApi {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used inside <ConfirmProvider>');
  }
  return ctx;
}
