import { renderWithProviders, screen } from '@/test-utils';
import { Spinner } from '@moysklad/ui';
/**
 * Spinner (from @moysklad/ui) tests — standalone loading indicator
 * (Lucide Loader2 underneath). Used inline next to text, table cells,
 * skeletons. Button has its OWN spinner via `loading` prop, not this.
 *
 * Tests guard the size variants, accessible label, role="status", and
 * the spin animation class.
 */
import { describe, expect, it } from 'vitest';

describe('Spinner', () => {
  describe('basic rendering', () => {
    it('renders an svg with role="status"', () => {
      renderWithProviders(<Spinner />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('uses default aria-label "Loading"', () => {
      renderWithProviders(<Spinner />);
      expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    });

    it('honors custom label', () => {
      renderWithProviders(<Spinner label="Yuklanmoqda..." />);
      expect(screen.getByRole('status', { name: 'Yuklanmoqda...' })).toBeInTheDocument();
    });

    it('always applies animate-spin class', () => {
      renderWithProviders(<Spinner />);
      const svg = screen.getByRole('status');
      expect(svg.getAttribute('class')).toContain('animate-spin');
    });

    it('uses muted text color', () => {
      renderWithProviders(<Spinner />);
      const svg = screen.getByRole('status');
      expect(svg.getAttribute('class')).toContain('text-[var(--ms-text-muted)]');
    });
  });

  describe('size variants', () => {
    it('uses sm (h-4 w-4) by default', () => {
      renderWithProviders(<Spinner />);
      const svg = screen.getByRole('status');
      const cls = svg.getAttribute('class') ?? '';
      expect(cls).toContain('h-4');
      expect(cls).toContain('w-4');
    });

    it('xs renders h-3 w-3', () => {
      renderWithProviders(<Spinner size="xs" />);
      const svg = screen.getByRole('status');
      const cls = svg.getAttribute('class') ?? '';
      expect(cls).toContain('h-3');
      expect(cls).toContain('w-3');
    });

    it('md renders h-5 w-5', () => {
      renderWithProviders(<Spinner size="md" />);
      const svg = screen.getByRole('status');
      const cls = svg.getAttribute('class') ?? '';
      expect(cls).toContain('h-5');
      expect(cls).toContain('w-5');
    });

    it('lg renders h-6 w-6', () => {
      renderWithProviders(<Spinner size="lg" />);
      const svg = screen.getByRole('status');
      const cls = svg.getAttribute('class') ?? '';
      expect(cls).toContain('h-6');
      expect(cls).toContain('w-6');
    });
  });

  describe('className merge', () => {
    it('merges user className with size + spin classes', () => {
      renderWithProviders(<Spinner className="my-extra" />);
      const svg = screen.getByRole('status');
      const cls = svg.getAttribute('class') ?? '';
      expect(cls).toContain('my-extra');
      expect(cls).toContain('animate-spin');
      expect(cls).toContain('h-4'); // default size still applied
    });
  });
});
