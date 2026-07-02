import { act, render, renderHookWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { ConfirmProvider, useConfirm } from '@moysklad/ui';
/**
 * ConfirmDialog (from @moysklad/ui) tests — useConfirm/ConfirmProvider
 * imperative confirmation API. Replaces window.confirm() everywhere.
 *
 * Note: ConfirmDialog hardcodes `data-testid` (no dash) but the
 * project's vitest config has testIdAttribute: 'data-test-id', so
 * we use document.body.querySelector('[data-testid=...]') to find
 * dialog elements.
 *
 * Tests guard the open behavior, the 2-button mode (true/false return),
 * the 3-button mode (string return), the destructive tone (red confirm
 * + AlertCircle + Enter does NOT confirm), backdrop click + Escape
 * resolve cancel, the queue (FIFO).
 */
import { describe, expect, it } from 'vitest';

function findDialog(): Element | null {
  return document.body.querySelector('[data-testid="confirm-dialog"]');
}
function findCancel(): HTMLButtonElement {
  const el = document.body.querySelector('[data-testid="confirm-cancel"]');
  if (!el) throw new Error('confirm-cancel not found');
  return el as HTMLButtonElement;
}
function findConfirm(): HTMLButtonElement {
  const el = document.body.querySelector('[data-testid="confirm-confirm"]');
  if (!el) throw new Error('confirm-confirm not found');
  return el as HTMLButtonElement;
}
function findDiscard(): HTMLButtonElement | null {
  return document.body.querySelector('[data-testid="confirm-discard"]') as HTMLButtonElement | null;
}

describe('useConfirm / ConfirmProvider', () => {
  describe('basic open behavior', () => {
    it('confirm() opens a dialog', () => {
      const { result } = renderHookWithProviders(() => useConfirm());
      act(() => {
        void result.current.confirm({ title: 'Sure?' });
      });
      expect(findDialog()).toBeInTheDocument();
      expect(screen.getByText('Sure?')).toBeInTheDocument();
    });

    it('renders default uz labels (Bekor qilish + Davom etish)', () => {
      const { result } = renderHookWithProviders(() => useConfirm());
      act(() => {
        void result.current.confirm({ title: 'x' });
      });
      expect(findCancel()).toHaveTextContent('Bekor qilish');
      expect(findConfirm()).toHaveTextContent('Davom etish');
    });

    it('honors custom confirmLabel + cancelLabel', () => {
      const { result } = renderHookWithProviders(() => useConfirm());
      act(() => {
        void result.current.confirm({
          title: 'x',
          confirmLabel: 'Yes',
          cancelLabel: 'No',
        });
      });
      expect(findCancel()).toHaveTextContent('No');
      expect(findConfirm()).toHaveTextContent('Yes');
    });

    it('renders description below title when provided', () => {
      const { result } = renderHookWithProviders(() => useConfirm());
      act(() => {
        void result.current.confirm({
          title: 'x',
          description: 'Helpful explanation',
        });
      });
      expect(screen.getByText('Helpful explanation')).toBeInTheDocument();
    });

    it('does NOT render description when omitted', () => {
      const { result } = renderHookWithProviders(() => useConfirm());
      act(() => {
        void result.current.confirm({ title: 'x' });
      });
      expect(screen.queryByText('Helpful explanation')).toBeNull();
    });
  });

  describe('2-button mode (default)', () => {
    it('clicking Confirm resolves with true', async () => {
      const user = userEvent.setup();
      const { result } = renderHookWithProviders(() => useConfirm());
      let resolved: unknown = null;
      act(() => {
        result.current.confirm({ title: 'x' }).then((r) => {
          resolved = r;
        });
      });
      await user.click(findConfirm());
      await waitFor(() => expect(resolved).toBe(true));
      // Dialog gone after resolve
      expect(findDialog()).toBeNull();
    });

    it('clicking Cancel resolves with false', async () => {
      const user = userEvent.setup();
      const { result } = renderHookWithProviders(() => useConfirm());
      let resolved: unknown = null;
      act(() => {
        result.current.confirm({ title: 'x' }).then((r) => {
          resolved = r;
        });
      });
      await user.click(findCancel());
      await waitFor(() => expect(resolved).toBe(false));
    });
  });

  describe('3-button mode (with discardLabel)', () => {
    it('renders the discard button when discardLabel provided', () => {
      const { result } = renderHookWithProviders(() => useConfirm());
      act(() => {
        void result.current.confirm({
          title: "Saqlanmagan o'zgarishlar",
          discardLabel: 'Tashlash',
        });
      });
      expect(findDiscard()).toHaveTextContent('Tashlash');
    });

    it('clicking Confirm in 3-button mode resolves "confirm"', async () => {
      const user = userEvent.setup();
      const { result } = renderHookWithProviders(() => useConfirm());
      let resolved: unknown = null;
      act(() => {
        result.current.confirm({ title: 'x', discardLabel: 'Discard' }).then((r) => {
          resolved = r;
        });
      });
      await user.click(findConfirm());
      await waitFor(() => expect(resolved).toBe('confirm'));
    });

    it('clicking Discard in 3-button mode resolves "discard"', async () => {
      const user = userEvent.setup();
      const { result } = renderHookWithProviders(() => useConfirm());
      let resolved: unknown = null;
      act(() => {
        result.current.confirm({ title: 'x', discardLabel: 'Discard' }).then((r) => {
          resolved = r;
        });
      });
      await user.click(findDiscard()!);
      await waitFor(() => expect(resolved).toBe('discard'));
    });

    it('clicking Cancel in 3-button mode resolves "cancel"', async () => {
      const user = userEvent.setup();
      const { result } = renderHookWithProviders(() => useConfirm());
      let resolved: unknown = null;
      act(() => {
        result.current.confirm({ title: 'x', discardLabel: 'Discard' }).then((r) => {
          resolved = r;
        });
      });
      await user.click(findCancel());
      await waitFor(() => expect(resolved).toBe('cancel'));
    });
  });

  describe('tone variants', () => {
    it('default tone — no warning/destructive icon', () => {
      const { result } = renderHookWithProviders(() => useConfirm());
      act(() => {
        void result.current.confirm({ title: 'x' });
      });
      const dialog = findDialog();
      expect(dialog?.querySelector('svg')).toBeNull();
    });

    it('destructive tone shows AlertCircle icon', () => {
      const { result } = renderHookWithProviders(() => useConfirm());
      act(() => {
        void result.current.confirm({ title: 'x', tone: 'destructive' });
      });
      const dialog = findDialog();
      expect(dialog?.querySelector('svg')).toBeInTheDocument();
    });

    it('destructive tone makes confirm button use destructive variant (red)', () => {
      const { result } = renderHookWithProviders(() => useConfirm());
      act(() => {
        void result.current.confirm({ title: 'x', tone: 'destructive' });
      });
      const btn = findConfirm();
      // Check for the destructive class set by Button variant=destructive
      expect(btn.className).toMatch(/destructive/);
    });

    it('warning tone shows AlertCircle icon (warning color)', () => {
      const { result } = renderHookWithProviders(() => useConfirm());
      act(() => {
        void result.current.confirm({ title: 'x', tone: 'warning' });
      });
      const dialog = findDialog();
      expect(dialog?.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('keyboard interaction', () => {
    it('Escape resolves cancel (false)', async () => {
      const user = userEvent.setup();
      const { result } = renderHookWithProviders(() => useConfirm());
      let resolved: unknown = null;
      act(() => {
        result.current.confirm({ title: 'x' }).then((r) => {
          resolved = r;
        });
      });
      await user.keyboard('{Escape}');
      await waitFor(() => expect(resolved).toBe(false));
    });
  });

  describe('backdrop click', () => {
    it('clicking the backdrop resolves cancel (false)', async () => {
      const user = userEvent.setup();
      const { result } = renderHookWithProviders(() => useConfirm());
      let resolved: unknown = null;
      act(() => {
        result.current.confirm({ title: 'x' }).then((r) => {
          resolved = r;
        });
      });
      // Backdrop is the button with aria-label "Bekor qilish" (background overlay)
      const backdrop = screen
        .getAllByLabelText('Bekor qilish')
        .find((el) => el.classList.contains('absolute'));
      expect(backdrop).toBeTruthy();
      await user.click(backdrop!);
      await waitFor(() => expect(resolved).toBe(false));
    });
  });

  describe('queue (multiple confirms)', () => {
    it('second confirm waits for first to resolve (FIFO)', async () => {
      const user = userEvent.setup();
      const { result } = renderHookWithProviders(() => useConfirm());
      let r1: unknown = null;
      let r2: unknown = null;
      act(() => {
        result.current.confirm({ title: 'First' }).then((r) => {
          r1 = r;
        });
        result.current.confirm({ title: 'Second' }).then((r) => {
          r2 = r;
        });
      });
      // Only first dialog should be visible
      expect(screen.getByText('First')).toBeInTheDocument();
      expect(screen.queryByText('Second')).toBeNull();
      // Confirm the first
      await user.click(findConfirm());
      await waitFor(() => expect(r1).toBe(true));
      // Second now appears
      await waitFor(() => expect(screen.getByText('Second')).toBeInTheDocument());
      // Confirm the second
      await user.click(findConfirm());
      await waitFor(() => expect(r2).toBe(true));
    });
  });

  describe('default-label injection (ConfirmProvider defaultLabels)', () => {
    // The app root injects localized RU/UZ defaults so the bare
    // «Davom etish» / «Bekor qilish» fallbacks don't leak Uzbek into RU.
    function Harness({ explicit }: { explicit?: boolean }) {
      const { confirm } = useConfirm();
      return (
        <button
          type="button"
          onClick={() =>
            void confirm(
              explicit
                ? { title: 'x', confirmLabel: 'Custom', cancelLabel: 'CustomCancel' }
                : { title: 'x' },
            )
          }
        >
          open
        </button>
      );
    }

    it('uses injected defaults when a confirm() omits labels', async () => {
      const user = userEvent.setup();
      render(
        <ConfirmProvider defaultLabels={{ confirm: 'Продолжить', cancel: 'Отмена' }}>
          <Harness />
        </ConfirmProvider>,
      );
      await user.click(screen.getByText('open'));
      expect(findCancel()).toHaveTextContent('Отмена');
      expect(findConfirm()).toHaveTextContent('Продолжить');
    });

    it('explicit per-call labels still win over injected defaults', async () => {
      const user = userEvent.setup();
      render(
        <ConfirmProvider defaultLabels={{ confirm: 'Продолжить', cancel: 'Отмена' }}>
          <Harness explicit />
        </ConfirmProvider>,
      );
      await user.click(screen.getByText('open'));
      expect(findCancel()).toHaveTextContent('CustomCancel');
      expect(findConfirm()).toHaveTextContent('Custom');
    });
  });

  // Regression guard for the confirm-dialog-in-modal bug (found by Phase-2
  // browser-QA 2026-06-08j): when a confirm/conflict dialog is invoked from
  // WITHIN an open Radix Modal, the modal (1) painted OVER the confirm at the
  // same z-index, and (2) put `pointer-events:none` on <body>, which the
  // confirm — a body child outside the modal tree — INHERITED, leaving it
  // visible-but-unclickable. jsdom can't compute real stacking/pointer-events,
  // so these assertions lock the two CSS contracts that fix it at the source.
  describe('stacks above modals (confirm-dialog-in-modal regression guard)', () => {
    it('overlay carries z-[var(--ms-z-confirm)] (outranks --ms-z-modal) + pointer-events-auto', () => {
      const { result } = renderHookWithProviders(() => useConfirm());
      act(() => {
        void result.current.confirm({ title: 'Sure?' });
      });
      const dialog = findDialog();
      expect(dialog).toBeInTheDocument();
      // Must use the dedicated confirm z-token (450), NOT the modal token (400),
      // so it paints above an open Modal.
      expect(dialog?.className).toContain('z-[var(--ms-z-confirm)]');
      expect(dialog?.className).not.toContain('z-[var(--ms-z-modal)]');
      // Must re-enable pointer events: Radix Modal sets body{pointer-events:none}
      // while open and the confirm inherits it otherwise.
      expect(dialog?.className).toContain('pointer-events-auto');
    });
  });
});
