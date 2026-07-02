import { renderWithProviders, screen } from '@/test-utils';
import { FormField, Input } from '@moysklad/ui';
/**
 * FormField (from @moysklad/ui) tests — universal form-field wrapper
 * used by every EditForm field across the app: detail pages, /new
 * forms, settings pages. Wraps a label + control + hint/error.
 *
 * A regression in label↔control wiring breaks accessibility silently
 * (screen reader can't read the label, click-on-label doesn't focus
 * the control); these tests guard the contract.
 */
import { describe, expect, it } from 'vitest';

describe('FormField', () => {
  describe('label + htmlFor wiring', () => {
    it('renders the label text', () => {
      renderWithProviders(
        <FormField id="agent" label="Kontragent">
          <Input id="agent" />
        </FormField>,
      );
      expect(screen.getByText('Kontragent')).toBeInTheDocument();
    });

    it('label htmlFor matches the id prop (clicking label focuses control)', () => {
      const { container } = renderWithProviders(
        <FormField id="agent" label="Kontragent">
          <Input id="agent" />
        </FormField>,
      );
      const lbl = container.querySelector('label');
      expect(lbl).toHaveAttribute('for', 'agent');
    });

    it('does NOT render a label when label prop is omitted', () => {
      const { container } = renderWithProviders(
        <FormField id="just">
          <Input id="just" />
        </FormField>,
      );
      expect(container.querySelector('label')).toBeNull();
    });
  });

  describe('required indicator', () => {
    it('renders the required asterisk when required=true', () => {
      const { container } = renderWithProviders(
        <FormField id="email" label="Email" required>
          <Input id="email" />
        </FormField>,
      );
      // Label component renders the * separately; assert by visible text.
      expect(container.textContent).toContain('*');
    });

    it('does NOT render the asterisk when required is omitted', () => {
      const { container } = renderWithProviders(
        <FormField id="comment" label="Izoh">
          <Input id="comment" />
        </FormField>,
      );
      expect(container.textContent).not.toContain('*');
    });
  });

  describe('layout: stacked vs inline', () => {
    it('uses flex-col by default (stacked label above control)', () => {
      const { container } = renderWithProviders(
        <FormField id="x" label="X">
          <Input id="x" />
        </FormField>,
      );
      const root = container.firstElementChild;
      expect(root?.className).toContain('flex-col');
    });

    it('uses flex-row when inline=true (label beside control)', () => {
      const { container } = renderWithProviders(
        <FormField id="x" label="X" inline>
          <Input id="x" />
        </FormField>,
      );
      const root = container.firstElementChild;
      expect(root?.className).toContain('flex-row');
      expect(root?.className).toContain('items-center');
    });

    it('inline label gets min-w-[140px] for column alignment', () => {
      const { container } = renderWithProviders(
        <FormField id="x" label="X" inline>
          <Input id="x" />
        </FormField>,
      );
      const lbl = container.querySelector('label');
      expect(lbl?.className).toContain('min-w-[140px]');
    });
  });

  describe('description (above control)', () => {
    it('renders description text in a muted <p> when provided in stacked mode', () => {
      const { container } = renderWithProviders(
        <FormField id="x" label="X" description="Optional helper text">
          <Input id="x" />
        </FormField>,
      );
      expect(screen.getByText('Optional helper text')).toBeInTheDocument();
      const p = Array.from(container.querySelectorAll('p')).find(
        (el) => el.textContent === 'Optional helper text',
      );
      expect(p?.className).toContain('text-xs');
      expect(p?.className).toContain('ms-text-muted');
    });

    it('does NOT render description in inline mode (kept compact)', () => {
      renderWithProviders(
        <FormField id="x" label="X" description="Helper" inline>
          <Input id="x" />
        </FormField>,
      );
      expect(screen.queryByText('Helper')).toBeNull();
    });
  });

  describe('hint (below control)', () => {
    it('renders hint when provided and no error', () => {
      renderWithProviders(
        <FormField id="x" hint="Format: +998 90 123 45 67">
          <Input id="x" />
        </FormField>,
      );
      expect(screen.getByText(/Format:/)).toBeInTheDocument();
    });

    it('hides hint when error is also present (error wins)', () => {
      renderWithProviders(
        <FormField id="x" hint="Hint shown when valid" error="Bad input!">
          <Input id="x" />
        </FormField>,
      );
      expect(screen.queryByText('Hint shown when valid')).toBeNull();
      expect(screen.getByText('Bad input!')).toBeInTheDocument();
    });
  });

  describe('error (below control)', () => {
    it('renders error text in destructive color', () => {
      const { container } = renderWithProviders(
        <FormField id="x" error="Required field">
          <Input id="x" />
        </FormField>,
      );
      const p = Array.from(container.querySelectorAll('p')).find(
        (el) => el.textContent === 'Required field',
      );
      expect(p?.className).toContain('ms-text-destructive');
    });

    it('error <p> has role="alert" so screen readers announce it', () => {
      renderWithProviders(
        <FormField id="x" error="Required field">
          <Input id="x" />
        </FormField>,
      );
      const alert = screen.getByText('Required field');
      expect(alert).toHaveAttribute('role', 'alert');
    });
  });

  describe('children render', () => {
    it('renders the control as a child', () => {
      renderWithProviders(
        <FormField id="x" label="X">
          <Input id="x" data-test-id="my-input" />
        </FormField>,
      );
      expect(screen.getByTestId('my-input')).toBeInTheDocument();
    });

    it('supports arbitrary control elements (custom picker, multiple inputs, etc)', () => {
      renderWithProviders(
        <FormField id="x" label="X">
          <div data-test-id="custom-control">Custom picker</div>
        </FormField>,
      );
      expect(screen.getByTestId('custom-control')).toBeInTheDocument();
    });
  });

  describe('className merge', () => {
    it('merges user className with the layout classes', () => {
      const { container } = renderWithProviders(
        <FormField id="x" className="my-special-spacing">
          <Input id="x" />
        </FormField>,
      );
      const root = container.firstElementChild;
      expect(root?.className).toContain('my-special-spacing');
      expect(root?.className).toContain('flex-col');
    });
  });
});
