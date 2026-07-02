import { renderWithProviders, screen, waitFor } from '@/test-utils';
import { FieldHelp, Tooltip, TooltipProvider } from '@moysklad/ui';
/**
 * Tooltip + FieldHelp (from @moysklad/ui) tests — Radix-backed
 * tooltip used for icon button hints, status pill explanations,
 * field-help "?" markers across the app.
 *
 * Tests guard the disabled-when-content-empty escape hatch (so
 * dynamic content doesn't crash the trigger).
 */
import { describe, expect, it } from 'vitest';

function withProvider(ui: React.ReactElement) {
  return <TooltipProvider delayDuration={0}>{ui}</TooltipProvider>;
}

describe('Tooltip', () => {
  describe('disabled / empty content escape hatch', () => {
    it('returns children unwrapped when disabled=true', () => {
      renderWithProviders(
        withProvider(
          <Tooltip disabled content="hint">
            <button type="button" data-test-id="t">btn</button>
          </Tooltip>,
        ),
      );
      // Trigger renders normally (no Radix wrapper changes the tag)
      expect(screen.getByTestId('t')).toBeInTheDocument();
    });

    it('returns children unwrapped when content is null', () => {
      renderWithProviders(
        withProvider(
          <Tooltip content={null}>
            <button type="button" data-test-id="t">btn</button>
          </Tooltip>,
        ),
      );
      expect(screen.getByTestId('t')).toBeInTheDocument();
    });

    it('returns children unwrapped when content is empty string', () => {
      renderWithProviders(
        withProvider(
          <Tooltip content="">
            <button type="button" data-test-id="t">btn</button>
          </Tooltip>,
        ),
      );
      expect(screen.getByTestId('t')).toBeInTheDocument();
    });
  });

  describe('rendering on hover/focus', () => {
    it('does NOT render the tooltip popup before hover', () => {
      renderWithProviders(
        withProvider(
          <Tooltip content="My hint">
            <button type="button" data-test-id="t">btn</button>
          </Tooltip>,
        ),
      );
      // The trigger renders, but the portaled popup body is not in DOM
      expect(screen.queryByText('My hint')).toBeNull();
    });

    it('renders the tooltip popup after focus (keyboard a11y)', async () => {
      renderWithProviders(
        withProvider(
          <Tooltip content="My hint">
            <button type="button" data-test-id="t">btn</button>
          </Tooltip>,
        ),
      );
      const t = screen.getByTestId('t');
      t.focus();
      await waitFor(() => {
        // Radix may render the same content twice (once for screen-reader
        // dup), so use queryAllByText.
        const hints = screen.queryAllByText('My hint');
        expect(hints.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('controlled open prop', () => {
    it('open=true forces popup visible without hover', async () => {
      renderWithProviders(
        withProvider(
          <Tooltip content="Forced" open>
            <button type="button" data-test-id="t">btn</button>
          </Tooltip>,
        ),
      );
      await waitFor(() => {
        const hints = screen.queryAllByText('Forced');
        expect(hints.length).toBeGreaterThanOrEqual(1);
      });
    });
  });
});

describe('FieldHelp', () => {
  describe('rendering', () => {
    it('renders a "?" button with default aria-label "Yordam"', () => {
      renderWithProviders(withProvider(<FieldHelp content="Help text" />));
      expect(screen.getByRole('button', { name: 'Yordam' })).toBeInTheDocument();
    });

    it('honors custom ariaLabel', () => {
      renderWithProviders(withProvider(<FieldHelp content="Help" ariaLabel="What's this?" />));
      expect(screen.getByRole('button', { name: "What's this?" })).toBeInTheDocument();
    });

    it('button has the moysklad chip styling (small circle, border)', () => {
      renderWithProviders(withProvider(<FieldHelp content="Help" />));
      const btn = screen.getByRole('button', { name: 'Yordam' });
      expect(btn.className).toContain('rounded-full');
      expect(btn.className).toContain('h-4');
      expect(btn.className).toContain('w-4');
      expect(btn.className).toContain('border');
    });

    it('button text content is "?"', () => {
      renderWithProviders(withProvider(<FieldHelp content="Help" />));
      const btn = screen.getByRole('button', { name: 'Yordam' });
      expect(btn.textContent).toBe('?');
    });
  });

  describe('hover/focus reveals tooltip content', () => {
    it('focus reveals the help text', async () => {
      renderWithProviders(withProvider(<FieldHelp content="My helpful explanation" />));
      const btn = screen.getByRole('button', { name: 'Yordam' });
      btn.focus();
      await waitFor(() => {
        const matches = screen.queryAllByText('My helpful explanation');
        expect(matches.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('className merge', () => {
    it('merges user className onto the button', () => {
      renderWithProviders(withProvider(<FieldHelp content="Help" className="my-extra-margin" />));
      const btn = screen.getByRole('button', { name: 'Yordam' });
      expect(btn.className).toContain('my-extra-margin');
      expect(btn.className).toContain('rounded-full');
    });
  });
});
