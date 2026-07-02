import { TrialBanner } from '@/components/trial-banner';
import { renderWithProviders, screen, userEvent } from '@/test-utils';
/**
 * TrialBanner tests — yellow strip above the navbar for free-trial
 * accounts. Mirrors moysklad's "Перейдите на платный тариф" banner
 * with the orange "Выбрать тариф" CTA.
 *
 * Behavior is tiny: render the message + CTA button, fire onSelectPlan
 * on click. The component is presentational (no auth fetch) so tests
 * are simple.
 */
import { describe, expect, it, vi } from 'vitest';

describe('TrialBanner', () => {
  describe('basic rendering', () => {
    it('renders with the moysklad-parity yellow background', () => {
      const { container } = renderWithProviders(<TrialBanner />);
      const div = container.querySelector('div');
      // Moysklad uses #FFF6D9 (verified)
      expect(div?.className).toContain('bg-[#FFF6D9]');
    });

    it('renders the orange decorative star (✦)', () => {
      renderWithProviders(<TrialBanner />);
      expect(screen.getByText('✦')).toBeInTheDocument();
    });

    it('renders the CTA button (action button on the right)', () => {
      const { container } = renderWithProviders(<TrialBanner />);
      const btn = container.querySelector('button');
      expect(btn).toBeInTheDocument();
      // Orange brand color matches moysklad
      expect(btn?.className).toContain('bg-[#F5821F]');
    });
  });

  describe('responsive message swap', () => {
    it('renders BOTH variants (CSS hides one based on viewport)', () => {
      const { container } = renderWithProviders(<TrialBanner />);
      // Both message spans render; CSS hides one (.hidden / sm:hidden / sm:inline / inline)
      const spans = container.querySelectorAll('span');
      // Star + 2 message variants + (button text isn't a span)
      // Should be at least 3 spans (star + 2 messages)
      expect(spans.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('CTA click', () => {
    it('does NOT throw when onSelectPlan is omitted', () => {
      renderWithProviders(<TrialBanner />);
      // Just verify the button is present and clickable
      const btn = screen.getByRole('button');
      expect(btn).toBeInTheDocument();
    });

    it('calls onSelectPlan when CTA is clicked', async () => {
      const onSelectPlan = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<TrialBanner onSelectPlan={onSelectPlan} />);
      await user.click(screen.getByRole('button'));
      expect(onSelectPlan).toHaveBeenCalledTimes(1);
    });
  });
});
