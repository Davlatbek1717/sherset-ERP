import { renderWithProviders, screen } from '@/test-utils';
import { Progress } from '@moysklad/ui';
/**
 * Progress (from @moysklad/ui) tests — linear progress bar used by
 * import wizards, bulk-action progress, file-upload spinners,
 * onboarding completion meters.
 *
 * Tests guard the value clamping math, indeterminate mode, tone
 * variants, size variants, label rendering, and the a11y attributes.
 */
import { describe, expect, it } from 'vitest';

describe('Progress', () => {
  describe('basic rendering', () => {
    it('renders role="progressbar"', () => {
      renderWithProviders(<Progress value={42} />);
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('honors ariaLabel', () => {
      renderWithProviders(<Progress value={50} ariaLabel="Upload progress" />);
      expect(screen.getByRole('progressbar', { name: 'Upload progress' })).toBeInTheDocument();
    });
  });

  describe('a11y aria-value attributes', () => {
    it('sets aria-valuemin=0 always', () => {
      renderWithProviders(<Progress value={5} />);
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemin', '0');
    });

    it('sets aria-valuemax=100 by default', () => {
      renderWithProviders(<Progress value={5} />);
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '100');
    });

    it('honors custom max', () => {
      renderWithProviders(<Progress value={50} max={200} />);
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '200');
    });

    it('aria-valuenow reflects clamped value', () => {
      renderWithProviders(<Progress value={42} />);
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
    });

    it('aria-valuenow is omitted in indeterminate mode', () => {
      renderWithProviders(<Progress value={42} indeterminate />);
      expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
    });
  });

  describe('value clamping', () => {
    it('clamps negative value to 0', () => {
      renderWithProviders(<Progress value={-10} />);
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    });

    it('clamps over-max value down to max', () => {
      renderWithProviders(<Progress value={150} max={100} />);
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    });

    it('clamps max=0 to safe minimum 1', () => {
      // safeMax = Math.max(1, max), so passing max=0 still produces a valid bar
      renderWithProviders(<Progress value={0} max={0} />);
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '1');
    });
  });

  describe('width math', () => {
    it('value=50 max=100 fills 50% width', () => {
      const { container } = renderWithProviders(<Progress value={50} />);
      // The fill div is the only one with inline style.width
      const fill = container.querySelector('div[style*="width"]') as HTMLElement | null;
      expect(fill?.style.width).toBe('50%');
    });

    it('value=25 max=200 fills 12.5% width', () => {
      const { container } = renderWithProviders(<Progress value={25} max={200} />);
      const fill = container.querySelector('div[style*="width"]') as HTMLElement | null;
      expect(fill?.style.width).toBe('12.5%');
    });

    it('value=0 fills 0% width', () => {
      const { container } = renderWithProviders(<Progress value={0} />);
      const fill = container.querySelector('div[style*="width"]') as HTMLElement | null;
      expect(fill?.style.width).toBe('0%');
    });
  });

  describe('tone variants', () => {
    it('uses brand by default', () => {
      const { container } = renderWithProviders(<Progress value={50} />);
      const fill = container.querySelector('div[style*="width"]');
      expect(fill?.className).toContain('bg-[var(--ms-action-primary)]');
    });

    it('success tone uses green', () => {
      const { container } = renderWithProviders(<Progress value={50} tone="success" />);
      const fill = container.querySelector('div[style*="width"]');
      expect(fill?.className).toContain('bg-[var(--ms-text-success)]');
    });

    it('warning tone uses orange', () => {
      const { container } = renderWithProviders(<Progress value={50} tone="warning" />);
      const fill = container.querySelector('div[style*="width"]');
      expect(fill?.className).toContain('bg-[var(--ms-text-warning)]');
    });

    it('destructive tone uses red', () => {
      const { container } = renderWithProviders(<Progress value={50} tone="destructive" />);
      const fill = container.querySelector('div[style*="width"]');
      expect(fill?.className).toContain('bg-[var(--ms-action-destructive)]');
    });
  });

  describe('size variants', () => {
    it('uses md (h-2.5) by default', () => {
      renderWithProviders(<Progress value={50} />);
      const bar = screen.getByRole('progressbar');
      expect(bar.className).toContain('h-2.5');
    });

    it('sm renders h-1.5', () => {
      renderWithProviders(<Progress value={50} size="sm" />);
      const bar = screen.getByRole('progressbar');
      expect(bar.className).toContain('h-1.5');
    });
  });

  describe('label rendering', () => {
    it('does NOT render label by default', () => {
      renderWithProviders(<Progress value={42} />);
      expect(screen.queryByText('42/100')).toBeNull();
    });

    it('renders "{value}/{max}" when showLabel=true', () => {
      renderWithProviders(<Progress value={42} max={100} showLabel />);
      expect(screen.getByText('42/100')).toBeInTheDocument();
    });

    it('renders custom max in label', () => {
      renderWithProviders(<Progress value={3} max={10} showLabel />);
      expect(screen.getByText('3/10')).toBeInTheDocument();
    });

    it('does NOT render label when indeterminate (label suppressed)', () => {
      renderWithProviders(<Progress value={42} showLabel indeterminate />);
      expect(screen.queryByText('42/100')).toBeNull();
    });
  });

  describe('indeterminate mode', () => {
    it('renders the animated stripe div instead of the fill', () => {
      const { container } = renderWithProviders(<Progress value={50} indeterminate />);
      // No fill div with style.width (that's the determinate path)
      const fillWithWidth = container.querySelector('div[style*="width"]');
      expect(fillWithWidth).toBeNull();
      // Stripe div uses inline animationName instead
      const stripe = container.querySelector('div[style*="animation"]');
      expect(stripe).toBeTruthy();
    });

    it('indeterminate stripe uses tone color', () => {
      const { container } = renderWithProviders(
        <Progress value={50} indeterminate tone="success" />,
      );
      const stripe = container.querySelector('div[style*="animation"]');
      expect(stripe?.className).toContain('bg-[var(--ms-text-success)]');
    });
  });

  describe('layout baseline', () => {
    it('always rounded-full + overflow-hidden', () => {
      renderWithProviders(<Progress value={50} />);
      const bar = screen.getByRole('progressbar');
      expect(bar.className).toContain('rounded-full');
      expect(bar.className).toContain('overflow-hidden');
    });

    it('merges user className', () => {
      renderWithProviders(<Progress value={50} className="my-extra" />);
      const bar = screen.getByRole('progressbar');
      expect(bar.className).toContain('my-extra');
      expect(bar.className).toContain('h-2.5');
    });
  });
});
