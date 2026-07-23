import { renderWithProviders, userEvent } from '@/test-utils';
import { screen } from '@testing-library/react';
/**
 * RelatedDocsTab tests — moysklad old-design diagram (re-grounded 2026-07-09):
 * BLACK current card · WHITE linked cards that NAVIGATE to the doc's page ·
 * «Привязать документ» button ABOVE the diagram · no status badges (the ✓
 * mark mirrors posted/draft instead).
 */
import { describe, expect, it, vi } from 'vitest';
import { RelatedDocsTab } from './related-docs-tab';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/customer-orders/co-1',
  useSearchParams: () => new URLSearchParams(),
}));

describe('RelatedDocsTab', () => {
  const current = {
    id: 'co-1',
    name: '04796',
    moment: '2025-06-04T09:39:00.000Z',
    state: 'confirmed',
    sumMinor: '6400000',
    kind: 'customer-order' as const,
  };
  const linkedDemand = (state: string, id = 'd-1') => ({
    id,
    name: '05671',
    moment: '2025-06-04T09:43:00.000Z',
    state,
    sumMinor: '6400000',
    kind: 'demand' as const,
  });

  it('renders NO cards at all while nothing is linked (moysklad: the diagram appears only after «Привязать документ»)', () => {
    renderWithProviders(<RelatedDocsTab current={current} />);
    expect(
      screen.queryByTestId(`related-doc-card-customer-order-${current.id}`),
    ).not.toBeInTheDocument();
  });

  it('renders the current doc as the BLACK card once something is linked', () => {
    renderWithProviders(
      <RelatedDocsTab current={current} linkedDemands={[linkedDemand('posted')]} />,
    );
    const card = screen.getByTestId(`related-doc-card-customer-order-${current.id}`);
    expect(card).toBeInTheDocument();
    expect(card.className).toContain('bg-[#3b3b3b]');
  });

  it('renders card content: №name (no space), sum with currency', () => {
    renderWithProviders(
      <RelatedDocsTab current={current} linkedDemands={[linkedDemand('posted')]} />,
    );
    const card = screen.getByTestId(`related-doc-card-customer-order-${current.id}`);
    expect(card).toHaveTextContent('№04796');
    expect(card).toHaveTextContent('64 000,00');
  });

  it('renders one WHITE card per linked doc, wrapped in a link to its page', () => {
    renderWithProviders(
      <RelatedDocsTab
        current={current}
        linkedDemands={[linkedDemand('posted'), linkedDemand('draft', 'd-2')]}
      />,
    );
    const card = screen.getByTestId('related-doc-card-demand-d-1');
    expect(card.className).toContain('bg-white');
    // band 4.3 — the white card navigates to the linked doc's own page.
    expect(card.closest('a')).toHaveAttribute('href', '/demands/d-1');
    expect(screen.getByTestId('related-doc-card-demand-d-2')).toBeInTheDocument();
  });

  it('shows the "Привязать документ" button enabled when callback provided', () => {
    const onLink = vi.fn();
    renderWithProviders(<RelatedDocsTab current={current} onLinkDocument={onLink} />);
    expect(screen.getByTestId('related-docs-link-button')).not.toBeDisabled();
  });

  it('fires onLinkDocument when CTA clicked', async () => {
    const onLink = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<RelatedDocsTab current={current} onLinkDocument={onLink} />);
    await user.click(screen.getByTestId('related-docs-link-button'));
    expect(onLink).toHaveBeenCalledTimes(1);
  });

  it('disables the CTA when neither callback nor linkable is provided', () => {
    renderWithProviders(<RelatedDocsTab current={current} />);
    expect(screen.getByTestId('related-docs-link-button')).toBeDisabled();
  });
});
