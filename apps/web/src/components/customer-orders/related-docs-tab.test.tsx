import { renderWithProviders, userEvent } from '@/test-utils';
import { screen } from '@testing-library/react';
/**
 * RelatedDocsTab tests — verify the linked-docs diagram renders the
 * current doc card + each linked-doc card, and the "Привязать
 * документ" CTA fires its callback.
 */
import { describe, expect, it, vi } from 'vitest';
import { RelatedDocsTab } from './related-docs-tab';

describe('RelatedDocsTab', () => {
  const current = {
    id: 'co-1',
    name: '04796',
    moment: '2025-06-04T09:39:00.000Z',
    state: 'confirmed',
    sumMinor: '6400000',
    kind: 'customer-order' as const,
  };

  it('renders the current doc card with the brand ring', () => {
    renderWithProviders(<RelatedDocsTab current={current} />);
    const card = screen.getByTestId(`related-doc-card-customer-order-${current.id}`);
    expect(card).toBeInTheDocument();
    expect(card.className).toMatch(/ring-2/);
  });

  it('shows the empty-state message when no linked docs', () => {
    renderWithProviders(<RelatedDocsTab current={current} />);
    expect(screen.getByTestId('related-docs-empty')).toBeInTheDocument();
  });

  it('renders one card per linked demand', () => {
    renderWithProviders(
      <RelatedDocsTab
        current={current}
        linkedDemands={[
          {
            id: 'd-1',
            name: '05671',
            moment: '2025-06-04T09:43:00.000Z',
            state: 'confirmed',
            sumMinor: '6400000',
            kind: 'demand' as const,
          },
          {
            id: 'd-2',
            name: '05672',
            moment: '2025-06-05T10:00:00.000Z',
            state: 'draft',
            sumMinor: '1000000',
            kind: 'demand' as const,
          },
        ]}
      />,
    );
    expect(screen.getByTestId('related-doc-card-demand-d-1')).toBeInTheDocument();
    expect(screen.getByTestId('related-doc-card-demand-d-2')).toBeInTheDocument();
    expect(screen.queryByTestId('related-docs-empty')).toBeNull();
  });

  it('renders cards for invoices-out as well', () => {
    renderWithProviders(
      <RelatedDocsTab
        current={current}
        linkedInvoicesOut={[
          {
            id: 'i-1',
            name: 'INV-100',
            moment: '2025-06-04T10:00:00.000Z',
            state: 'paid',
            sumMinor: '6400000',
            kind: 'invoice-out' as const,
          },
        ]}
      />,
    );
    expect(screen.getByTestId('related-doc-card-invoice-out-i-1')).toBeInTheDocument();
  });

  // Conv-1 near-miss F: the state badge used to render the RAW state slug
  // with a hardcoded `tone="neutral"`. It now localizes the slug per the
  // doc's kind and colours via documentStateTone (with the invoice override).
  const linkedDemand = (state: string, id = 'd-1') => ({
    id,
    name: '05671',
    moment: '2025-06-04T09:43:00.000Z',
    state,
    sumMinor: '6400000',
    kind: 'demand' as const,
  });
  const linkedInvoice = (state: string, id = 'i-1') => ({
    id,
    name: 'INV-100',
    moment: '2025-06-04T10:00:00.000Z',
    state,
    sumMinor: '6400000',
    kind: 'invoice-out' as const,
  });

  it('renders the localized state label, not the raw slug', () => {
    renderWithProviders(
      <RelatedDocsTab current={current} linkedDemands={[linkedDemand('posted')]} />,
    );
    const badge = screen.getByTestId('related-doc-state-d-1');
    expect(badge).toHaveTextContent("O'tkazilgan"); // uz states.demand.posted
    expect(badge.textContent).not.toBe('posted');
  });

  it('colours per-kind: demand posted = success, invoice-out posted = brand (override)', () => {
    renderWithProviders(
      <RelatedDocsTab
        current={current}
        linkedDemands={[linkedDemand('posted')]}
        linkedInvoicesOut={[linkedInvoice('posted')]}
      />,
    );
    // demand: canonical posted → success
    expect(screen.getByTestId('related-doc-state-d-1').className).toContain(
      'bg-[var(--ms-success-50)]',
    );
    // invoice-out: INVOICE_STATE_TONE override posted → brand (issued, awaiting payment)
    expect(screen.getByTestId('related-doc-state-i-1').className).toContain(
      'bg-[var(--ms-brand-50)]',
    );
  });

  it('draft state → neutral tone', () => {
    renderWithProviders(
      <RelatedDocsTab current={current} linkedDemands={[linkedDemand('draft')]} />,
    );
    expect(screen.getByTestId('related-doc-state-d-1').className).toContain(
      'bg-[var(--ms-bg-muted)]',
    );
  });

  it('unknown state slug → neutral tone + raw-slug fallback (no crash)', () => {
    renderWithProviders(
      <RelatedDocsTab current={current} linkedDemands={[linkedDemand('weird_state')]} />,
    );
    const badge = screen.getByTestId('related-doc-state-d-1');
    expect(badge).toHaveTextContent('weird_state');
    expect(badge.className).toContain('bg-[var(--ms-bg-muted)]');
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

  it('disables the CTA when no callback is provided', () => {
    renderWithProviders(<RelatedDocsTab current={current} />);
    expect(screen.getByTestId('related-docs-link-button')).toBeDisabled();
  });
});
