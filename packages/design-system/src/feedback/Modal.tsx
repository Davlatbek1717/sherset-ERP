'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn.ts';

/**
 * Centred modal. Slot-style API on top of Radix Dialog with the
 * moysklad-styled chrome (border + shadow, dimmer overlay, header with
 * close X, optional footer button row).
 *
 * Use this for confirm-input flows that don't fit a slide-in `<Drawer>`:
 * - attribute metadata edit
 * - webhook configuration
 * - email composer
 * - POS payment dialog
 *
 * For destructive yes/no prompts use `<ConfirmDialog>` (and prefer
 * `useConfirm()`); for slide-in side panels (filter, help, command)
 * use `<Drawer>`. Modal is the centred-card variant.
 */
export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Tailwind width class — defaults to "w-[480px]". */
  widthClass?: string;
  /** Optional sticky footer (typically primary + cancel buttons). */
  footer?: React.ReactNode;
  children: React.ReactNode;
  hideClose?: boolean;
  closeLabel?: string;
  testId?: string;
  /** Allow content scroll when body exceeds viewport. Default true. */
  scrollableBody?: boolean;
  /** Radix Dialog close-autofocus hook — fires when the dialog unmounts (after
   *  the 150ms close animation) and Radix is about to restore focus to the
   *  previously-focused element. Call `e.preventDefault()` and focus your own
   *  target to hand focus somewhere else deterministically (e.g. the pick
   *  modal's save → new-row «Кол-во» chain). */
  onCloseAutoFocus?: (e: Event) => void;
}

/**
 * App-root injector for Modal's localized defaults. Without it the
 * close-button `closeLabel` default leaks Uzbek («Yopish») into the RU UI
 * (same design-system-default-leak bug-class as EditForm / ConfirmDialog).
 * A per-`<Modal>` `closeLabel` prop still wins over the injected value.
 */
const ModalLabelsContext = React.createContext<{ closeLabel?: string }>({});

export function ModalLabelsProvider({
  closeLabel,
  children,
}: {
  closeLabel?: string;
  children: React.ReactNode;
}) {
  const value = React.useMemo(() => ({ closeLabel }), [closeLabel]);
  return <ModalLabelsContext.Provider value={value}>{children}</ModalLabelsContext.Provider>;
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  widthClass = 'w-[480px]',
  footer,
  children,
  hideClose,
  closeLabel,
  testId,
  scrollableBody = true,
  onCloseAutoFocus,
}: ModalProps) {
  // Resolve: explicit prop → app-root injected default → Uzbek hard fallback.
  const labelsCtx = React.useContext(ModalLabelsContext);
  const resolvedCloseLabel = closeLabel ?? labelsCtx.closeLabel ?? 'Yopish';
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-[var(--ms-z-overlay)] bg-black/30 backdrop-blur-[1px]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'duration-150',
          )}
        />
        <Dialog.Content
          data-testid={testId}
          // No <Dialog.Description> is rendered unless `description` is set, so opt
          // out of Radix's describedby a11y warning (dev console noise) when absent.
          {...(description ? {} : { 'aria-describedby': undefined })}
          onCloseAutoFocus={onCloseAutoFocus}
          onInteractOutside={(e) => {
            // A ConfirmDialog (useConfirm) layered ABOVE this modal — e.g. the
            // optimistic-lock conflict-reload prompt, or an in-modal delete
            // confirm — renders OUTSIDE this Radix Dialog's tree, so Radix
            // treats clicking it as an "interact outside" and would close the
            // modal underneath. That defeats the conflict UX (reload should
            // re-seed the still-open modal; cancel should leave the form as-is
            // so the user can copy their edits out). Keep the modal open when
            // the interaction targets a confirm dialog.
            const target = (e.detail.originalEvent?.target ?? e.target) as HTMLElement | null;
            if (target?.closest?.('[data-testid="confirm-dialog"]')) {
              e.preventDefault();
            }
          }}
          className={cn(
            // dvh, not vh: on phones the URL bar shrinks the visible viewport
            // below 100vh — an 85vh modal could run under it. dvh === vh on
            // desktop, so ≥768px rendering is unchanged.
            'fixed top-1/2 left-1/2 z-[var(--ms-z-modal)] flex max-h-[85dvh] flex-col',
            '-translate-x-1/2 -translate-y-1/2',
            widthClass,
            'max-w-[calc(100vw-2rem)]',
            'rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] shadow-[var(--ms-shadow-lg)]',
            'focus:outline-none',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'duration-150',
          )}
        >
          <header className="flex items-start gap-3 border-[var(--ms-border-default)] border-b px-4 py-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="truncate font-semibold text-[var(--ms-text-primary)] text-base leading-tight">
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className="mt-0.5 text-[var(--ms-text-muted)] text-xs">
                  {description}
                </Dialog.Description>
              )}
            </div>
            {!hideClose && (
              <Dialog.Close
                className={cn(
                  'shrink-0 rounded-[var(--ms-radius-default)] p-1.5',
                  'text-[var(--ms-text-muted)] transition-colors',
                  'hover:bg-[var(--ms-bg-hover)] hover:text-[var(--ms-text-primary)]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)]',
                )}
                aria-label={resolvedCloseLabel}
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            )}
          </header>

          <div
            className={cn(
              'min-h-0 flex-1',
              scrollableBody ? 'overflow-y-auto' : 'overflow-visible',
            )}
          >
            {children}
          </div>

          {footer && (
            <footer className="flex items-center justify-end gap-2 border-[var(--ms-border-default)] border-t bg-[var(--ms-bg-app)] px-4 py-3">
              {footer}
            </footer>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
