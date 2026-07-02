import { renderWithProviders, screen } from '@/test-utils';
import { Label } from '@moysklad/ui';
/**
 * Label (from @moysklad/ui) tests — Radix-backed label used by every
 * FormField across the app (every detail page form). Adds the moysklad
 * required-asterisk + optional hint markup beyond the Radix primitive.
 */
import { describe, expect, it } from 'vitest';

describe('Label', () => {
  describe('basic rendering', () => {
    it('renders as a <label> element', () => {
      const { container } = renderWithProviders(<Label>My label</Label>);
      expect(container.querySelector('label')).toBeInTheDocument();
    });

    it('renders the children text', () => {
      renderWithProviders(<Label>Kontragent</Label>);
      expect(screen.getByText('Kontragent')).toBeInTheDocument();
    });

    it('forwards htmlFor attribute', () => {
      const { container } = renderWithProviders(<Label htmlFor="email-input">Email</Label>);
      expect(container.querySelector('label')).toHaveAttribute('for', 'email-input');
    });
  });

  describe('layout + typography baseline', () => {
    it('applies text-sm + font-medium + leading-snug', () => {
      const { container } = renderWithProviders(<Label>X</Label>);
      const lbl = container.querySelector('label');
      expect(lbl?.className).toContain('text-sm');
      expect(lbl?.className).toContain('font-medium');
      expect(lbl?.className).toContain('leading-snug');
    });

    it('uses primary text color', () => {
      const { container } = renderWithProviders(<Label>X</Label>);
      const lbl = container.querySelector('label');
      expect(lbl?.className).toContain('ms-text-primary');
    });

    it('peer-disabled styling enabled (cursor-not-allowed + opacity)', () => {
      const { container } = renderWithProviders(<Label>X</Label>);
      const lbl = container.querySelector('label');
      expect(lbl?.className).toContain('peer-disabled:cursor-not-allowed');
      expect(lbl?.className).toContain('peer-disabled:opacity-70');
    });
  });

  describe('required indicator', () => {
    it('does NOT render the asterisk when required is omitted', () => {
      renderWithProviders(<Label>Comment</Label>);
      expect(screen.queryByText('*')).toBeNull();
    });

    it('does NOT render the asterisk when required=false', () => {
      renderWithProviders(<Label required={false}>Comment</Label>);
      expect(screen.queryByText('*')).toBeNull();
    });

    it('renders the asterisk when required=true', () => {
      renderWithProviders(<Label required>Email</Label>);
      expect(screen.getByText('*')).toBeInTheDocument();
    });

    it('asterisk uses destructive color', () => {
      const { container } = renderWithProviders(<Label required>Email</Label>);
      const star = Array.from(container.querySelectorAll('span')).find(
        (s) => s.textContent === '*',
      );
      expect(star?.className).toContain('ms-action-destructive');
    });

    it('asterisk has aria-hidden so screen readers do not read "star"', () => {
      const { container } = renderWithProviders(<Label required>Email</Label>);
      const star = Array.from(container.querySelectorAll('span')).find(
        (s) => s.textContent === '*',
      );
      expect(star).toHaveAttribute('aria-hidden');
    });
  });

  describe('hint slot', () => {
    it('does NOT render hint by default', () => {
      const { container } = renderWithProviders(<Label>X</Label>);
      // Only one span (the asterisk wrapper) potentially; no hint.
      expect(container.textContent).toBe('X');
    });

    it('renders hint text when provided', () => {
      renderWithProviders(<Label hint="(optional)">Comment</Label>);
      expect(screen.getByText('(optional)')).toBeInTheDocument();
    });

    it('hint uses muted color + text-xs + font-normal', () => {
      const { container } = renderWithProviders(<Label hint="hint">X</Label>);
      const hint = Array.from(container.querySelectorAll('span')).find(
        (s) => s.textContent === 'hint',
      );
      expect(hint?.className).toContain('ms-text-muted');
      expect(hint?.className).toContain('text-xs');
      expect(hint?.className).toContain('font-normal');
    });
  });

  describe('required + hint together', () => {
    it('both render when both props provided', () => {
      renderWithProviders(
        <Label required hint="(strict)">
          Email
        </Label>,
      );
      expect(screen.getByText('*')).toBeInTheDocument();
      expect(screen.getByText('(strict)')).toBeInTheDocument();
    });
  });

  describe('forwarded ref + className merge', () => {
    it('forwards ref to the underlying label element', () => {
      let captured: HTMLLabelElement | null = null;
      renderWithProviders(
        <Label
          ref={(el) => {
            captured = el;
          }}
        >
          X
        </Label>,
      );
      expect(captured).toBeInstanceOf(HTMLLabelElement);
    });

    it('merges user className', () => {
      const { container } = renderWithProviders(<Label className="my-extra">X</Label>);
      const lbl = container.querySelector('label');
      expect(lbl?.className).toContain('my-extra');
      expect(lbl?.className).toContain('text-sm');
    });
  });
});
