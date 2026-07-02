import { renderWithProviders, screen } from '@/test-utils';
import { type RelatedDocsGroup, RelatedDocsPanel } from '@moysklad/ui';
/**
 * RelatedDocsPanel (from @moysklad/ui) tests — right-column panel for
 * the detail page that surfaces sibling documents (cascaded off the
 * current entity). Matches moysklad.uz "Связанные документы".
 *
 * Tests guard the empty state, the group header rendering (label +
 * "Create" link), the doc row rendering (link + state badge + total/
 * date), the conditional total-vs-date display, and the per-doc
 * test-id wiring.
 */
import { describe, expect, it } from 'vitest';

const GROUPS: RelatedDocsGroup[] = [
  {
    label: 'Fakturalar',
    docs: [
      {
        id: 'd1',
        href: '/invoices/d1',
        name: 'INV-00001',
        stateLabel: 'Provedeno',
        stateTone: 'success',
        sumMinor: '120000',
      },
      {
        id: 'd2',
        href: '/invoices/d2',
        name: 'INV-00002',
        at: '2026-04-24T12:00:00Z',
      },
    ],
  },
  {
    label: 'Demands',
    docs: [],
    createHref: '/demands/new',
    createLabel: '+ yangi',
  },
];

describe('RelatedDocsPanel', () => {
  describe('empty state', () => {
    it('renders the empty message when all groups are empty', () => {
      renderWithProviders(<RelatedDocsPanel groups={[{ label: 'X', docs: [] }]} />);
      const empty = screen.getByTestId('related-docs-empty');
      expect(empty).toBeInTheDocument();
      expect(empty.textContent).toContain('Bog');
    });

    it('honors custom emptyLabel', () => {
      renderWithProviders(<RelatedDocsPanel groups={[]} emptyLabel="No related docs" />);
      expect(screen.getByText('No related docs')).toBeInTheDocument();
    });

    it('does NOT render the panel wrapper when empty', () => {
      const { container } = renderWithProviders(
        <RelatedDocsPanel groups={[{ label: 'X', docs: [] }]} />,
      );
      expect(container.querySelector('[data-test-id="related-docs-panel"]')).toBeNull();
    });
  });

  describe('group header rendering', () => {
    it('renders the panel wrapper when at least one group has docs', () => {
      renderWithProviders(<RelatedDocsPanel groups={GROUPS} />);
      expect(screen.getByTestId('related-docs-panel')).toBeInTheDocument();
    });

    it('renders the group label as <h4>', () => {
      const { container } = renderWithProviders(<RelatedDocsPanel groups={GROUPS} />);
      const h4 = container.querySelector('h4');
      expect(h4?.textContent).toBe('Fakturalar');
    });

    it('renders the createHref + createLabel as a link in the header', () => {
      renderWithProviders(<RelatedDocsPanel groups={GROUPS} />);
      const createLink = screen.getByText('+ yangi') as HTMLAnchorElement;
      expect(createLink.tagName).toBe('A');
      expect(createLink).toHaveAttribute('href', '/demands/new');
    });

    it('uses default "+" symbol when createLabel omitted', () => {
      // Note: panel collapses to empty state if NO group has docs at all,
      // so we add a sibling group with one doc to keep the panel mounted.
      renderWithProviders(
        <RelatedDocsPanel
          groups={[
            { label: 'X', docs: [], createHref: '/x/new' },
            { label: 'Y', docs: [{ id: '1', href: '/y', name: 'Y' }] },
          ]}
        />,
      );
      const link = screen.getByText('+');
      expect(link).toHaveAttribute('href', '/x/new');
    });

    it('does NOT render the create link when createHref omitted', () => {
      renderWithProviders(
        <RelatedDocsPanel
          groups={[{ label: 'Only', docs: [{ id: '1', href: '/x', name: 'X' }] }]}
        />,
      );
      // No "+" link in the header for this group
      const links = screen.queryAllByRole('link');
      // Only the doc-name link
      expect(links).toHaveLength(1);
    });
  });

  describe('group with empty docs but createHref still renders header', () => {
    it('still renders section + header for the createHref-only group', () => {
      renderWithProviders(<RelatedDocsPanel groups={GROUPS} />);
      // "Demands" group has docs=[] but createHref → its label should still appear
      expect(screen.getByText('Demands')).toBeInTheDocument();
    });

    it('does NOT render <ul> when docs is empty (only the header)', () => {
      const { container } = renderWithProviders(
        <RelatedDocsPanel
          groups={[
            { label: 'EmptyGroup', docs: [], createHref: '/x' },
            { label: 'OneItem', docs: [{ id: '1', href: '/y', name: 'Y' }] },
          ]}
        />,
      );
      // 1 ul total (for OneItem only — EmptyGroup has no docs to render)
      const lists = container.querySelectorAll('ul');
      expect(lists).toHaveLength(1);
    });
  });

  describe('doc row rendering', () => {
    it('renders the doc name as a link to href', () => {
      renderWithProviders(<RelatedDocsPanel groups={GROUPS} />);
      const link = screen.getByText('INV-00001') as HTMLAnchorElement;
      expect(link.tagName).toBe('A');
      expect(link).toHaveAttribute('href', '/invoices/d1');
    });

    it('renders one <li> per doc with the per-doc testId', () => {
      renderWithProviders(<RelatedDocsPanel groups={GROUPS} />);
      expect(screen.getByTestId('related-doc-d1')).toBeInTheDocument();
      expect(screen.getByTestId('related-doc-d2')).toBeInTheDocument();
    });

    it('renders the stateLabel as a Badge when provided', () => {
      renderWithProviders(<RelatedDocsPanel groups={GROUPS} />);
      // The "Provedeno" string should appear (rendered inside Badge)
      expect(screen.getByText('Provedeno')).toBeInTheDocument();
    });

    it('does NOT render Badge when stateLabel omitted', () => {
      renderWithProviders(
        <RelatedDocsPanel groups={[{ label: 'X', docs: [{ id: '1', href: '/x', name: 'X' }] }]} />,
      );
      // No state-related text — "Provedeno" not in DOM
      expect(screen.queryByText('Provedeno')).toBeNull();
    });
  });

  describe('total vs date display', () => {
    it('renders sumMinor as money when present', () => {
      renderWithProviders(<RelatedDocsPanel groups={GROUPS} />);
      // sumMinor=120000 → formatMoney → some money-formatted string with 1200
      const row = screen.getByTestId('related-doc-d1');
      expect(row.textContent).toMatch(/1[\s,.]?200/);
    });

    it('renders date when at present and sumMinor absent', () => {
      renderWithProviders(<RelatedDocsPanel groups={GROUPS} />);
      const row = screen.getByTestId('related-doc-d2');
      expect(row.textContent).toMatch(/24/); // formatDate "24.04.2026"
    });

    it('prefers sumMinor over date when both present', () => {
      renderWithProviders(
        <RelatedDocsPanel
          groups={[
            {
              label: 'X',
              docs: [
                {
                  id: 'd3',
                  href: '/x',
                  name: 'X',
                  sumMinor: '500000',
                  at: '2026-04-24T12:00:00Z',
                },
              ],
            },
          ]}
        />,
      );
      const row = screen.getByTestId('related-doc-d3');
      // Money present, date NOT shown (rule: sumMinor wins)
      expect(row.textContent).toMatch(/5[\s,.]?000/);
      // Date string would have "24" but so does the row from sumMinor formatting,
      // so the cleanest check is no second timestamp span — just verify money side
      expect(row.textContent).not.toMatch(/24\.04\.2026/);
    });
  });
});
