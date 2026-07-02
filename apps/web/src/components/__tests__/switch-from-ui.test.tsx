import { renderWithProviders, screen, userEvent } from '@/test-utils';
import { Switch } from '@moysklad/ui';
/**
 * Switch (from @moysklad/ui) tests — Radix-backed toggle used by
 * settings flags (notifications, dark mode, feature toggles).
 *
 * Tests guard the controlled checked/onChange contract, disabled
 * state, and the visual data-state attributes Radix sets.
 */
import { describe, expect, it, vi } from 'vitest';

describe('Switch', () => {
  describe('basic rendering', () => {
    it('renders as role="switch"', () => {
      renderWithProviders(<Switch aria-label="Notifications" />);
      expect(screen.getByRole('switch', { name: 'Notifications' })).toBeInTheDocument();
    });

    it('starts unchecked by default', () => {
      renderWithProviders(<Switch aria-label="x" />);
      const sw = screen.getByRole('switch');
      expect(sw).toHaveAttribute('data-state', 'unchecked');
      expect(sw).toHaveAttribute('aria-checked', 'false');
    });

    it('renders the thumb (visual circle inside)', () => {
      const { container } = renderWithProviders(<Switch aria-label="x" />);
      const thumb = container.querySelector('[data-state]')?.querySelector('span');
      expect(thumb).toBeTruthy();
    });
  });

  describe('controlled checked prop', () => {
    it('checked=true sets data-state="checked"', () => {
      renderWithProviders(<Switch aria-label="x" checked onCheckedChange={vi.fn()} />);
      const sw = screen.getByRole('switch');
      expect(sw).toHaveAttribute('data-state', 'checked');
      expect(sw).toHaveAttribute('aria-checked', 'true');
    });

    it('checked=false sets data-state="unchecked"', () => {
      renderWithProviders(<Switch aria-label="x" checked={false} onCheckedChange={vi.fn()} />);
      const sw = screen.getByRole('switch');
      expect(sw).toHaveAttribute('data-state', 'unchecked');
    });
  });

  describe('toggle behavior', () => {
    it('clicking calls onCheckedChange with the new value', async () => {
      const onCheckedChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <Switch aria-label="x" checked={false} onCheckedChange={onCheckedChange} />,
      );
      await user.click(screen.getByRole('switch'));
      expect(onCheckedChange).toHaveBeenCalledWith(true);
    });

    it('clicking when checked=true calls onCheckedChange(false)', async () => {
      const onCheckedChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<Switch aria-label="x" checked onCheckedChange={onCheckedChange} />);
      await user.click(screen.getByRole('switch'));
      expect(onCheckedChange).toHaveBeenCalledWith(false);
    });

    it('Space key toggles state (Radix default)', async () => {
      const onCheckedChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <Switch aria-label="x" checked={false} onCheckedChange={onCheckedChange} />,
      );
      const sw = screen.getByRole('switch');
      sw.focus();
      await user.keyboard(' ');
      expect(onCheckedChange).toHaveBeenCalledWith(true);
    });
  });

  describe('disabled state', () => {
    it('renders with disabled attribute', () => {
      renderWithProviders(<Switch aria-label="x" disabled />);
      expect(screen.getByRole('switch')).toBeDisabled();
    });

    it('disabled clicks do NOT fire onCheckedChange', async () => {
      const onCheckedChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<Switch aria-label="x" disabled onCheckedChange={onCheckedChange} />);
      await user.click(screen.getByRole('switch'));
      expect(onCheckedChange).not.toHaveBeenCalled();
    });

    it('disabled adds disabled:cursor-not-allowed class', () => {
      renderWithProviders(<Switch aria-label="x" disabled />);
      const sw = screen.getByRole('switch');
      expect(sw.className).toContain('disabled:cursor-not-allowed');
      expect(sw.className).toContain('disabled:opacity-50');
    });
  });

  describe('layout baseline', () => {
    it('has the standard h-5 w-9 pill shape', () => {
      renderWithProviders(<Switch aria-label="x" />);
      const sw = screen.getByRole('switch');
      expect(sw.className).toContain('h-5');
      expect(sw.className).toContain('w-9');
      expect(sw.className).toContain('rounded-full');
    });

    it('has data-[state=checked]:bg primary class for green when on', () => {
      renderWithProviders(<Switch aria-label="x" />);
      const sw = screen.getByRole('switch');
      expect(sw.className).toContain('data-[state=checked]:bg-[var(--ms-action-primary)]');
    });
  });

  describe('forwarded ref + className merge', () => {
    it('merges user className', () => {
      renderWithProviders(<Switch aria-label="x" className="my-extra" />);
      const sw = screen.getByRole('switch');
      expect(sw.className).toContain('my-extra');
      expect(sw.className).toContain('rounded-full');
    });
  });
});
