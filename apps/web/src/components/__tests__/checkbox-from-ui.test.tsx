import { renderWithProviders, screen, userEvent } from '@/test-utils';
import { Checkbox } from '@moysklad/ui';
/**
 * Checkbox (from @moysklad/ui) tests — Radix-backed checkbox used
 * everywhere: row-select column on lists, vatEnabled / vatIncluded
 * toggles in DetailTotalsSidebar, applicable Provedeno toggle in
 * DetailHeader, bulk-select header.
 *
 * A regression silently breaks every form's checked-state read.
 */
import { describe, expect, it, vi } from 'vitest';

describe('Checkbox', () => {
  describe('basic rendering', () => {
    it('renders a button with role="checkbox" (Radix convention)', () => {
      renderWithProviders(<Checkbox data-test-id="cb" />);
      expect(screen.getByTestId('cb')).toHaveAttribute('role', 'checkbox');
    });

    it('applies layout baseline (h-4 w-4 rounded-sm + border)', () => {
      renderWithProviders(<Checkbox data-test-id="cb" />);
      const el = screen.getByTestId('cb');
      expect(el.className).toContain('h-4');
      expect(el.className).toContain('w-4');
      expect(el.className).toContain('rounded');
      expect(el.className).toContain('border');
    });

    it('uses surface bg + strong border by default', () => {
      renderWithProviders(<Checkbox data-test-id="cb" />);
      const el = screen.getByTestId('cb');
      expect(el.className).toContain('ms-bg-surface');
      expect(el.className).toContain('ms-border-strong');
    });
  });

  describe('checked state', () => {
    it('starts unchecked by default (data-state="unchecked")', () => {
      renderWithProviders(<Checkbox data-test-id="cb" />);
      expect(screen.getByTestId('cb')).toHaveAttribute('data-state', 'unchecked');
    });

    it('respects defaultChecked=true (data-state="checked")', () => {
      renderWithProviders(<Checkbox defaultChecked data-test-id="cb" />);
      expect(screen.getByTestId('cb')).toHaveAttribute('data-state', 'checked');
    });

    it('respects controlled checked=true', () => {
      renderWithProviders(<Checkbox checked={true} onCheckedChange={vi.fn()} data-test-id="cb" />);
      expect(screen.getByTestId('cb')).toHaveAttribute('data-state', 'checked');
    });

    it('renders the check icon when checked (Radix Indicator)', () => {
      const { container } = renderWithProviders(<Checkbox defaultChecked data-test-id="cb" />);
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('does NOT render the check icon when unchecked', () => {
      const { container } = renderWithProviders(<Checkbox data-test-id="cb" />);
      // Indicator only mounts when checked. Container should have no svg.
      expect(container.querySelector('svg')).toBeNull();
    });

    it('applies brand bg + brand border when checked', () => {
      renderWithProviders(<Checkbox defaultChecked data-test-id="cb" />);
      const cls = screen.getByTestId('cb').className;
      expect(cls).toContain('data-[state=checked]:bg-[var(--ms-action-primary)]');
      expect(cls).toContain('data-[state=checked]:border-[var(--ms-action-primary)]');
    });
  });

  describe('user interaction', () => {
    it('clicking toggles the checked state (uncontrolled)', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Checkbox data-test-id="cb" />);
      const cb = screen.getByTestId('cb');
      expect(cb).toHaveAttribute('data-state', 'unchecked');
      await user.click(cb);
      expect(cb).toHaveAttribute('data-state', 'checked');
      await user.click(cb);
      expect(cb).toHaveAttribute('data-state', 'unchecked');
    });

    it('fires onCheckedChange with the new boolean value', async () => {
      const onCheckedChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<Checkbox onCheckedChange={onCheckedChange} data-test-id="cb" />);
      await user.click(screen.getByTestId('cb'));
      expect(onCheckedChange).toHaveBeenCalledWith(true);
    });

    it('Space key toggles (keyboard a11y)', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Checkbox data-test-id="cb" />);
      const cb = screen.getByTestId('cb');
      cb.focus();
      await user.keyboard(' ');
      expect(cb).toHaveAttribute('data-state', 'checked');
    });
  });

  describe('disabled state', () => {
    it('renders disabled when disabled prop is true', () => {
      renderWithProviders(<Checkbox disabled data-test-id="cb" />);
      expect(screen.getByTestId('cb')).toBeDisabled();
    });

    it('disabled checkbox does NOT toggle on click', async () => {
      const onCheckedChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <Checkbox disabled onCheckedChange={onCheckedChange} data-test-id="cb" />,
      );
      await user.click(screen.getByTestId('cb'));
      expect(onCheckedChange).not.toHaveBeenCalled();
    });

    it('applies disabled visual classes (opacity + cursor-not-allowed)', () => {
      renderWithProviders(<Checkbox disabled data-test-id="cb" />);
      const cls = screen.getByTestId('cb').className;
      expect(cls).toContain('disabled:cursor-not-allowed');
      expect(cls).toContain('disabled:opacity-50');
    });
  });

  describe('controlled value flips', () => {
    it('checked prop change updates data-state on rerender', () => {
      const { rerender } = renderWithProviders(
        <Checkbox checked={false} onCheckedChange={vi.fn()} data-test-id="cb" />,
      );
      expect(screen.getByTestId('cb')).toHaveAttribute('data-state', 'unchecked');
      rerender(<Checkbox checked={true} onCheckedChange={vi.fn()} data-test-id="cb" />);
      expect(screen.getByTestId('cb')).toHaveAttribute('data-state', 'checked');
    });
  });

  describe('indeterminate (select-all "some rows" third state)', () => {
    it('checked="indeterminate" sets data-state and renders a visible Minus (not Check)', () => {
      const { container } = renderWithProviders(
        <Checkbox checked="indeterminate" onCheckedChange={vi.fn()} data-test-id="cb" />,
      );
      const root = screen.getByTestId('cb');
      expect(root).toHaveAttribute('data-state', 'indeterminate');
      // filled box (same brand bg as checked) so the white icon is visible
      expect(root.className).toContain('data-[state=indeterminate]:bg-[var(--ms-action-primary)]');
      // Minus icon, not the Check icon
      expect(container.querySelector('svg.lucide-minus')).not.toBeNull();
      expect(container.querySelector('svg.lucide-check')).toBeNull();
    });

    it('clicking an indeterminate checkbox reports a boolean (true) to onCheckedChange', async () => {
      const onCheckedChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <Checkbox checked="indeterminate" onCheckedChange={onCheckedChange} data-test-id="cb" />,
      );
      await user.click(screen.getByTestId('cb'));
      expect(onCheckedChange).toHaveBeenCalledWith(true);
    });
  });

  describe('forwarded ref + className merge', () => {
    it('forwards ref to the underlying button (Radix Root renders as button)', () => {
      let captured: HTMLButtonElement | null = null;
      renderWithProviders(
        <Checkbox
          ref={(el) => {
            captured = el;
          }}
          data-test-id="cb"
        />,
      );
      expect(captured).toBeInstanceOf(HTMLButtonElement);
    });

    it('merges user className', () => {
      renderWithProviders(<Checkbox className="my-cb-extra" data-test-id="cb" />);
      expect(screen.getByTestId('cb').className).toContain('my-cb-extra');
    });
  });
});
