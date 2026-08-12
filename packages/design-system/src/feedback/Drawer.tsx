'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type * as React from 'react';
import { cn } from '../lib/cn.ts';
import { parkInitialFocus } from '../lib/dialog-guards.ts';

/**
 * Generic right-side slide-in panel. Wraps Radix Dialog with the
 * moysklad-styled overlay + transition. Used by HelpDrawer, FilterDrawer,
 * and any future side-sheet (preferences, attachments preview, etc.).
 *
 * Usage:
 *   <Drawer
 *     open={open}
 *     onOpenChange={setOpen}
 *     title="Yordam"
 *     widthClass="w-[420px]"
 *     footer={<Button onClick={save}>Saqlash</Button>}
 *   >
 *     {body}
 *   </Drawer>
 */

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Tailwind width class — defaults to "w-[400px]". */
  widthClass?: string;
  /** Optional toolbar rendered to the right of the title. */
  toolbar?: React.ReactNode;
  /** Optional sticky footer (typically primary + cancel buttons). */
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** Hide the default close (X) button. */
  hideClose?: boolean;
  closeLabel?: string;
  testId?: string;
  /**
   * Let Escape / a click outside close the panel. **Default false** — same
   * contract as `<Modal>`: a panel that can hold half-entered work closes
   * only on a deliberate ✕ / Cancel / Save.
   *
   * Pass `dismissible` for read-only or navigational panels (help, command
   * palette, history viewer) where a quick Escape costs the user nothing.
   */
  dismissible?: boolean;
}

export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  widthClass = 'w-[400px]',
  toolbar,
  footer,
  children,
  hideClose,
  closeLabel = 'Yopish',
  testId,
  dismissible = false,
}: DrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-[var(--ms-z-overlay)] bg-black/30 backdrop-blur-[1px]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
            'duration-150',
          )}
        />
        <Dialog.Content
          data-testid={testId}
          // Opt out of Radix's describedby warning when no <Dialog.Description>.
          {...(description ? {} : { 'aria-describedby': undefined })}
          // Accidental-close guard — see `dismissible` on DrawerProps.
          onOpenAutoFocus={dismissible ? undefined : parkInitialFocus}
          onEscapeKeyDown={(e) => {
            if (!dismissible) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (!dismissible) e.preventDefault();
          }}
          className={cn(
            // h-dvh, not h-screen: on phones the URL bar overlaps the bottom of
            // a 100vh panel — the footer buttons became unreachable. dvh tracks
            // the real visible viewport; identical to vh on desktop.
            'fixed top-0 right-0 z-[var(--ms-z-modal)] flex h-dvh flex-col',
            widthClass,
            'max-w-[100vw] bg-[var(--ms-bg-surface)] shadow-[var(--ms-shadow-lg)]',
            'border-[var(--ms-border-default)] border-l',
            'focus:outline-none',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right',
            'duration-200',
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
            {toolbar && <div className="flex shrink-0 items-center gap-1">{toolbar}</div>}
            {!hideClose && (
              <Dialog.Close
                className={cn(
                  'shrink-0 rounded-[var(--ms-radius-default)] p-1.5',
                  'text-[var(--ms-text-muted)] transition-colors',
                  'hover:bg-[var(--ms-bg-hover)] hover:text-[var(--ms-text-primary)]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)]',
                )}
                aria-label={closeLabel}
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            )}
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

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
