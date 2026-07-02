import { act, renderHookWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { useToast } from '@moysklad/ui';
/**
 * Toast (from @moysklad/ui) tests — useToast/ToastProvider system.
 * Mirrors moysklad's top-right notification stack: 4 tones, auto-
 * dismiss, manual close, action button, queue with max stack size.
 *
 * Note: The Toast component hardcodes `data-testid` (no dash) but
 * the project's vitest config has testIdAttribute: 'data-test-id',
 * so we use document.body.querySelector('[data-testid=...]') to
 * find toast elements.
 *
 * Tests guard the per-tone push (success/info/warning/error), the
 * tone-determined aria-live (assertive for destructive, polite
 * otherwise), the description + action slots, the manual close
 * button, the auto-dismiss timer (with fake timers), the dismiss/
 * dismissAll APIs, and the id de-dup.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function findToast(tone: 'success' | 'info' | 'warning' | 'destructive'): Element | null {
  return document.body.querySelector(`[data-testid="toast-${tone}"]`);
}
function findViewport(): Element | null {
  return document.body.querySelector('[data-testid="toast-viewport"]');
}

describe('useToast / ToastProvider', () => {
  describe('per-tone push', () => {
    it('toast.success pushes a success-tone toast', () => {
      const { result } = renderHookWithProviders(() => useToast());
      act(() => {
        result.current.toast.success('Saved!');
      });
      expect(findToast('success')).toBeInTheDocument();
      expect(screen.getByText('Saved!')).toBeInTheDocument();
    });

    it('toast.info pushes an info-tone toast', () => {
      const { result } = renderHookWithProviders(() => useToast());
      act(() => {
        result.current.toast.info('FYI');
      });
      expect(findToast('info')).toBeInTheDocument();
    });

    it('toast.warning pushes a warning-tone toast', () => {
      const { result } = renderHookWithProviders(() => useToast());
      act(() => {
        result.current.toast.warning('Heads up');
      });
      expect(findToast('warning')).toBeInTheDocument();
    });

    it('toast.error pushes a destructive-tone toast', () => {
      const { result } = renderHookWithProviders(() => useToast());
      act(() => {
        result.current.toast.error('Boom');
      });
      expect(findToast('destructive')).toBeInTheDocument();
    });
  });

  describe('aria-live (a11y)', () => {
    it('non-destructive tones use aria-live="polite"', () => {
      const { result } = renderHookWithProviders(() => useToast());
      act(() => {
        result.current.toast.success('Ok');
      });
      expect(findToast('success')).toHaveAttribute('aria-live', 'polite');
    });

    it('destructive tone uses aria-live="assertive"', () => {
      const { result } = renderHookWithProviders(() => useToast());
      act(() => {
        result.current.toast.error('Bad');
      });
      expect(findToast('destructive')).toHaveAttribute('aria-live', 'assertive');
    });
  });

  describe('description + action slots', () => {
    it('renders description below title when provided', () => {
      const { result } = renderHookWithProviders(() => useToast());
      act(() => {
        result.current.toast.error('Failed', { description: 'Network timeout' });
      });
      expect(screen.getByText('Network timeout')).toBeInTheDocument();
    });

    it('renders action button + clicking calls handler + dismisses', async () => {
      const onClick = vi.fn();
      const user = userEvent.setup();
      const { result } = renderHookWithProviders(() => useToast());
      act(() => {
        result.current.toast.success('Saved', {
          action: { label: 'Undo', onClick },
        });
      });
      const action = screen.getByRole('button', { name: 'Undo' });
      await user.click(action);
      expect(onClick).toHaveBeenCalled();
      // Toast should be dismissed after action
      await waitFor(() => expect(findToast('success')).toBeNull());
    });
  });

  describe('manual close (X)', () => {
    it('renders the close X button (aria-label "Yopish")', () => {
      const { result } = renderHookWithProviders(() => useToast());
      act(() => {
        result.current.toast.success('hi');
      });
      expect(screen.getByRole('button', { name: 'Yopish' })).toBeInTheDocument();
    });

    it('clicking close removes the toast', async () => {
      const user = userEvent.setup();
      const { result } = renderHookWithProviders(() => useToast());
      act(() => {
        result.current.toast.success('hi');
      });
      await user.click(screen.getByRole('button', { name: 'Yopish' }));
      await waitFor(() => expect(findToast('success')).toBeNull());
    });
  });

  describe('auto-dismiss timer', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('auto-dismisses after default 5000ms', () => {
      const { result } = renderHookWithProviders(() => useToast());
      act(() => {
        result.current.toast.success('hi');
      });
      expect(findToast('success')).toBeInTheDocument();
      // Advance just shy of 5s — still there
      act(() => {
        vi.advanceTimersByTime(4900);
      });
      expect(findToast('success')).toBeInTheDocument();
      // Advance past 5s — gone
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(findToast('success')).toBeNull();
    });

    it('honors custom duration', () => {
      const { result } = renderHookWithProviders(() => useToast());
      act(() => {
        result.current.toast.info('hi', { duration: 1000 });
      });
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      expect(findToast('info')).toBeNull();
    });

    it('duration=0 makes the toast sticky (no auto-dismiss)', () => {
      const { result } = renderHookWithProviders(() => useToast());
      act(() => {
        result.current.toast.success('sticky', { duration: 0 });
      });
      // Advance well past 5s
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(findToast('success')).toBeInTheDocument();
    });
  });

  describe('dismiss / dismissAll', () => {
    it('dismiss(id) removes a specific toast', () => {
      const { result } = renderHookWithProviders(() => useToast());
      let id1 = '';
      act(() => {
        id1 = result.current.toast.success('a');
        result.current.toast.error('b');
      });
      expect(screen.getByText('a')).toBeInTheDocument();
      expect(screen.getByText('b')).toBeInTheDocument();
      act(() => {
        result.current.toast.dismiss(id1);
      });
      expect(screen.queryByText('a')).toBeNull();
      expect(screen.getByText('b')).toBeInTheDocument();
    });

    it('dismissAll removes every toast', () => {
      const { result } = renderHookWithProviders(() => useToast());
      act(() => {
        result.current.toast.success('a');
        result.current.toast.info('b');
        result.current.toast.warning('c');
      });
      expect(screen.queryAllByRole('status').length).toBeGreaterThanOrEqual(3);
      act(() => {
        result.current.toast.dismissAll();
      });
      expect(screen.queryByText('a')).toBeNull();
      expect(screen.queryByText('b')).toBeNull();
      expect(screen.queryByText('c')).toBeNull();
    });
  });

  describe('id de-dup', () => {
    it('pushing with the same id replaces the existing toast', () => {
      const { result } = renderHookWithProviders(() => useToast());
      act(() => {
        result.current.toast.success('first', { id: 'shared' });
      });
      expect(screen.getByText('first')).toBeInTheDocument();
      act(() => {
        result.current.toast.success('second', { id: 'shared' });
      });
      // Old replaced with new
      expect(screen.queryByText('first')).toBeNull();
      expect(screen.getByText('second')).toBeInTheDocument();
    });
  });

  describe('viewport', () => {
    it('renders the viewport in the DOM (always present)', () => {
      renderHookWithProviders(() => useToast());
      expect(findViewport()).toBeInTheDocument();
    });

    it('viewport is positioned top-right with fixed positioning', () => {
      renderHookWithProviders(() => useToast());
      const vp = findViewport();
      expect(vp?.className).toContain('fixed');
      expect(vp?.className).toContain('top-4');
      expect(vp?.className).toContain('right-4');
    });
  });
});
