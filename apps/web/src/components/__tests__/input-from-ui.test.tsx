import { renderWithProviders, screen, userEvent } from '@/test-utils';
import { Input } from '@moysklad/ui';
/**
 * Input (re-exported from @moysklad/ui) tests — every form field
 * across the app uses this. Has invalid state, leading/trailing
 * adornments, and pads the input differently when adornments
 * are present.
 *
 * Hosted in apps/web because design-system has no DOM env wired up.
 */
import { describe, expect, it, vi } from 'vitest';

describe('Input', () => {
  describe('basic rendering', () => {
    it('renders an <input> element', () => {
      renderWithProviders(<Input data-test-id="i" />);
      expect(screen.getByTestId('i').tagName).toBe('INPUT');
    });

    it('applies the moysklad control height token + padding', () => {
      renderWithProviders(<Input data-test-id="i" />);
      const el = screen.getByTestId('i');
      // moysklad form controls are 19px tall (--ms-control-h), not the old h-9 (27px).
      expect(el.className).toContain('h-[var(--ms-control-h)]');
      expect(el.className).toContain('px-2');
    });

    it('uses the surface bg + primary text by default', () => {
      renderWithProviders(<Input data-test-id="i" />);
      const el = screen.getByTestId('i');
      expect(el.className).toContain('ms-bg-surface');
      expect(el.className).toContain('ms-text-primary');
    });

    it('forwards placeholder + value', () => {
      renderWithProviders(<Input placeholder="Search..." defaultValue="ABC" data-test-id="i" />);
      const el = screen.getByTestId('i') as HTMLInputElement;
      expect(el.placeholder).toBe('Search...');
      expect(el.value).toBe('ABC');
    });

    it('forwards type prop (text/email/number/etc)', () => {
      renderWithProviders(<Input type="email" data-test-id="i" />);
      expect(screen.getByTestId('i')).toHaveAttribute('type', 'email');
    });
  });

  describe('disabled state', () => {
    it('renders disabled when disabled prop is true', () => {
      renderWithProviders(<Input disabled data-test-id="i" />);
      expect(screen.getByTestId('i')).toBeDisabled();
    });

    it('applies disabled visual styling (muted bg, disabled text, not-allowed cursor)', () => {
      renderWithProviders(<Input disabled data-test-id="i" />);
      const el = screen.getByTestId('i');
      expect(el.className).toContain('disabled:bg-[var(--ms-bg-muted)]');
      expect(el.className).toContain('disabled:cursor-not-allowed');
    });

    it('does not fire onChange when disabled (browser blocks the event)', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<Input disabled onChange={onChange} data-test-id="i" />);
      await user.type(screen.getByTestId('i'), 'hello');
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('invalid state', () => {
    it('sets aria-invalid="true" when invalid prop is true', () => {
      renderWithProviders(<Input invalid data-test-id="i" />);
      expect(screen.getByTestId('i')).toHaveAttribute('aria-invalid', 'true');
    });

    it('does NOT set aria-invalid when invalid is false/omitted', () => {
      renderWithProviders(<Input data-test-id="i" />);
      expect(screen.getByTestId('i')).not.toHaveAttribute('aria-invalid');
    });

    it('uses destructive border class when invalid', () => {
      renderWithProviders(<Input invalid data-test-id="i" />);
      expect(screen.getByTestId('i').className).toContain('ms-action-destructive');
    });

    it('uses the crisp dark (#333) resting border, with no radius and no outer ring', () => {
      // user 2026-06-23: input border must read black/crisp (ms-border-input),
      // moysklad parity → sharp corners (no border-radius) and NO outer focus
      // ring/offset (focus just turns the border blue, no second line).
      renderWithProviders(<Input data-test-id="i" />);
      const cls = screen.getByTestId('i').className;
      expect(cls).toContain('ms-border-input');
      expect(cls).not.toContain('rounded-[var(--ms-radius-default)]');
      expect(cls).not.toContain('ring-offset');
    });
  });

  describe('leading/trailing adornments', () => {
    it('renders WITHOUT a wrapper div when no adornments', () => {
      const { container } = renderWithProviders(<Input data-test-id="i" />);
      const input = screen.getByTestId('i');
      // The parent of the input should be the container itself (no relative wrapper).
      expect(input.parentElement).toBe(container);
    });

    it('wraps in a relative div when leading is provided', () => {
      const { container } = renderWithProviders(
        <Input leading={<span data-test-id="lead">🔍</span>} data-test-id="i" />,
      );
      const input = screen.getByTestId('i');
      // Now the input lives in a wrapper, not directly in container.
      expect(input.parentElement).not.toBe(container);
      expect(input.parentElement?.className).toContain('relative');
    });

    it('renders the leading slot content', () => {
      renderWithProviders(<Input leading={<span data-test-id="lead">🔍</span>} data-test-id="i" />);
      expect(screen.getByTestId('lead')).toBeInTheDocument();
    });

    it('pads the input pl-9 when leading is present', () => {
      renderWithProviders(<Input leading={<span>🔍</span>} data-test-id="i" />);
      expect(screen.getByTestId('i').className).toContain('pl-9');
    });

    it('renders the trailing slot content', () => {
      renderWithProviders(
        <Input trailing={<span data-test-id="trail">×</span>} data-test-id="i" />,
      );
      expect(screen.getByTestId('trail')).toBeInTheDocument();
    });

    it('pads the input pr-9 when trailing is present', () => {
      renderWithProviders(<Input trailing={<span>×</span>} data-test-id="i" />);
      expect(screen.getByTestId('i').className).toContain('pr-9');
    });

    it('supports both leading + trailing simultaneously', () => {
      renderWithProviders(
        <Input
          leading={<span data-test-id="lead">🔍</span>}
          trailing={<span data-test-id="trail">×</span>}
          data-test-id="i"
        />,
      );
      expect(screen.getByTestId('lead')).toBeInTheDocument();
      expect(screen.getByTestId('trail')).toBeInTheDocument();
      const cls = screen.getByTestId('i').className;
      expect(cls).toContain('pl-9');
      expect(cls).toContain('pr-9');
    });
  });

  describe('events', () => {
    it('fires onChange when the user types', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<Input onChange={onChange} data-test-id="i" />);
      await user.type(screen.getByTestId('i'), 'hi');
      expect(onChange).toHaveBeenCalled();
    });

    it('forwards the typed value via the change event', async () => {
      let captured = '';
      const user = userEvent.setup();
      renderWithProviders(
        <Input
          onChange={(e) => {
            captured = e.target.value;
          }}
          data-test-id="i"
        />,
      );
      await user.type(screen.getByTestId('i'), 'X');
      expect(captured).toBe('X');
    });
  });

  describe('forwarded ref + className merge', () => {
    it('forwards ref to the underlying input element', () => {
      let captured: HTMLInputElement | null = null;
      renderWithProviders(
        <Input
          ref={(el) => {
            captured = el;
          }}
          data-test-id="i"
        />,
      );
      expect(captured).toBeInstanceOf(HTMLInputElement);
    });

    it('merges user className with the default classes', () => {
      renderWithProviders(<Input className="custom-w" data-test-id="i" />);
      const el = screen.getByTestId('i');
      expect(el.className).toContain('custom-w');
      // Defaults still applied
      expect(el.className).toContain('h-[var(--ms-control-h)]');
    });
  });
});
