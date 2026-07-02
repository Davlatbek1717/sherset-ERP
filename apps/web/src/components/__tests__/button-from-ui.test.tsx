import { renderWithProviders, screen, userEvent } from '@/test-utils';
import { Button } from '@moysklad/ui';
/**
 * Button (re-exported from @moysklad/ui) tests — guard the variant +
 * size + state matrix used everywhere in the app. The Button got the
 * new `variant="success"` for the moysklad-parity green Save button
 * (commit cd4a3fa); a regression in that mapping silently flips
 * every Save button back to blue.
 *
 * Hosted in apps/web because the design-system package doesn't have
 * React Testing Library + a DOM environment configured. apps/web
 * already does, and the import works against the published package.
 */
import { describe, expect, it, vi } from 'vitest';

describe('Button', () => {
  describe('variants', () => {
    it('renders with primary classes by default', () => {
      renderWithProviders(<Button>Save</Button>);
      const btn = screen.getByRole('button', { name: 'Save' });
      expect(btn.className).toContain('ms-action-primary');
    });

    it('renders moysklad FILLED lime-green save (gradient + white text + lime border) when variant="success"', () => {
      renderWithProviders(<Button variant="success">Saqlash</Button>);
      const btn = screen.getByRole('button', { name: 'Saqlash' });
      // moysklad «Сохранить» = FILLED lime-green gradient (#cce255→#a1b900) +
      // white text + 1px #a1b900 border (live customerorder/edit?new), NOT the
      // old surface-bg outline read.
      expect(btn.className).toContain('from-[var(--ms-success-100)]');
      expect(btn.className).toContain('to-[var(--ms-action-success-border)]');
      expect(btn.className).toContain('ms-action-success-border');
      expect(btn.className).toContain('text-white');
    });

    it('renders with secondary classes when variant="secondary"', () => {
      renderWithProviders(<Button variant="secondary">Bekor</Button>);
      const btn = screen.getByRole('button', { name: 'Bekor' });
      expect(btn.className).toContain('ms-bg-surface');
      expect(btn.className).toContain('ms-border-strong');
    });

    it('renders with destructive classes when variant="destructive"', () => {
      renderWithProviders(<Button variant="destructive">Delete</Button>);
      const btn = screen.getByRole('button', { name: 'Delete' });
      expect(btn.className).toContain('ms-action-destructive');
    });

    it('renders with tertiary (transparent bg) when variant="tertiary"', () => {
      renderWithProviders(<Button variant="tertiary">Print</Button>);
      const btn = screen.getByRole('button', { name: 'Print' });
      expect(btn.className).toContain('bg-transparent');
    });

    it('renders with ghost (transparent + secondary text) when variant="ghost"', () => {
      renderWithProviders(<Button variant="ghost">×</Button>);
      const btn = screen.getByRole('button', { name: '×' });
      expect(btn.className).toContain('bg-transparent');
      expect(btn.className).toContain('ms-text-secondary');
    });

    it('renders with link (no padding, brand color, underline on hover) when variant="link"', () => {
      renderWithProviders(<Button variant="link">More</Button>);
      const btn = screen.getByRole('button', { name: 'More' });
      expect(btn.className).toContain('ms-text-brand');
      expect(btn.className).toContain('underline');
    });
  });

  describe('sizes', () => {
    it('renders md (h-9) by default', () => {
      renderWithProviders(<Button>Default</Button>);
      const btn = screen.getByRole('button', { name: 'Default' });
      expect(btn.className).toContain('h-9');
    });

    it('renders sm (h-8) when size="sm"', () => {
      renderWithProviders(<Button size="sm">Small</Button>);
      expect(screen.getByRole('button', { name: 'Small' }).className).toContain('h-8');
    });

    it('renders lg (h-11) when size="lg"', () => {
      renderWithProviders(<Button size="lg">Large</Button>);
      expect(screen.getByRole('button', { name: 'Large' }).className).toContain('h-11');
    });

    it('renders icon (h-9 w-9) when size="icon"', () => {
      renderWithProviders(
        <Button size="icon" aria-label="cog">
          ⚙
        </Button>,
      );
      const btn = screen.getByRole('button', { name: 'cog' });
      expect(btn.className).toContain('h-9');
      expect(btn.className).toContain('w-9');
    });

    it('renders icon-sm (h-7 w-7) when size="icon-sm"', () => {
      renderWithProviders(
        <Button size="icon-sm" aria-label="x">
          ×
        </Button>,
      );
      const btn = screen.getByRole('button', { name: 'x' });
      expect(btn.className).toContain('h-7');
      expect(btn.className).toContain('w-7');
    });
  });

  describe('disabled state', () => {
    it('renders disabled when disabled prop is true', () => {
      renderWithProviders(<Button disabled>Save</Button>);
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('does not fire onClick when disabled', async () => {
      const onClick = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <Button disabled onClick={onClick}>
          Save
        </Button>,
      );
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe('loading state', () => {
    it('renders disabled when loading is true', () => {
      renderWithProviders(<Button loading>Save</Button>);
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('sets aria-busy when loading', () => {
      renderWithProviders(<Button loading>Save</Button>);
      expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-busy', 'true');
    });

    it('renders the spinner span when loading', () => {
      renderWithProviders(<Button loading>Save</Button>);
      const btn = screen.getByRole('button', { name: 'Save' });
      const spinner = btn.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('does not render spinner when not loading', () => {
      renderWithProviders(<Button>Save</Button>);
      const btn = screen.getByRole('button', { name: 'Save' });
      expect(btn.querySelector('.animate-spin')).toBeNull();
    });

    it('does not have aria-busy when not loading', () => {
      renderWithProviders(<Button>Save</Button>);
      expect(screen.getByRole('button', { name: 'Save' })).not.toHaveAttribute('aria-busy');
    });
  });

  describe('events', () => {
    it('calls onClick when clicked', async () => {
      const onClick = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<Button onClick={onClick}>Click me</Button>);
      await user.click(screen.getByRole('button', { name: 'Click me' }));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('forwards type="submit" through to the button element', () => {
      renderWithProviders(<Button type="submit">Send</Button>);
      const btn = screen.getByRole('button', { name: 'Send' });
      expect(btn).toHaveAttribute('type', 'submit');
    });
  });

  describe('asChild composition', () => {
    it('renders the child element instead of a <button> when asChild=true', () => {
      renderWithProviders(
        <Button asChild>
          <a href="/test">Anchor</a>
        </Button>,
      );
      const link = screen.getByRole('link', { name: 'Anchor' });
      expect(link.tagName).toBe('A');
      expect(link).toHaveAttribute('href', '/test');
    });

    it('the rendered child still gets the variant classes', () => {
      renderWithProviders(
        <Button asChild variant="success">
          <a href="/test">Anchor</a>
        </Button>,
      );
      expect(screen.getByRole('link').className).toContain('ms-action-success');
    });
  });

  describe('className merge', () => {
    it('merges user className with the variant classes', () => {
      renderWithProviders(<Button className="custom-class">Save</Button>);
      const btn = screen.getByRole('button', { name: 'Save' });
      expect(btn.className).toContain('custom-class');
      // Default variant classes still applied
      expect(btn.className).toContain('ms-action-primary');
    });
  });

  describe('forwarded ref', () => {
    it('forwards ref to the underlying button element', () => {
      let capturedRef: HTMLButtonElement | null = null;
      renderWithProviders(
        <Button
          ref={(el) => {
            capturedRef = el;
          }}
        >
          Save
        </Button>,
      );
      expect(capturedRef).toBeInstanceOf(HTMLButtonElement);
    });
  });
});
