import { renderWithProviders, screen } from '@/test-utils';
import { DetailView } from '@moysklad/ui';
/**
 * DetailView (from @moysklad/ui) tests — top-level page wrapper that
 * combines Container + PageHeader + Breadcrumb. Used by detail pages
 * that don't use the heavier DetailHeader/DetailToolbar combo.
 *
 * Tests guard the title rendering, breadcrumb wiring, optional status
 * badge slot in the title, optional subtitle, optional actions slot,
 * children render, and the testId data attribute.
 */
import { describe, expect, it } from 'vitest';

const BC = [
  { label: 'Home', href: '/' },
  { label: 'Items', href: '/items' },
];

describe('DetailView', () => {
  describe('basic rendering', () => {
    it('renders the title in the entity-name slot', () => {
      renderWithProviders(
        <DetailView title="My Entity">
          <div>Body</div>
        </DetailView>,
      );
      const name = screen.getByTestId('entity-name');
      expect(name).toHaveTextContent('My Entity');
    });

    it('renders the children below the header', () => {
      renderWithProviders(
        <DetailView title="x">
          <div data-test-id="my-child">Body content</div>
        </DetailView>,
      );
      expect(screen.getByTestId('my-child')).toBeInTheDocument();
    });

    it('renders the testId on the outer container', () => {
      const { container } = renderWithProviders(
        <DetailView title="x" testId="my-detail-view">
          <div>Body</div>
        </DetailView>,
      );
      expect(container.querySelector('[data-test-id="my-detail-view"]')).toBeInTheDocument();
    });
  });

  describe('subtitle', () => {
    it('renders the subtitle when provided', () => {
      renderWithProviders(
        <DetailView title="x" subtitle="Helpful subtitle">
          <div>Body</div>
        </DetailView>,
      );
      expect(screen.getByText('Helpful subtitle')).toBeInTheDocument();
    });

    it('does NOT render subtitle when omitted', () => {
      renderWithProviders(
        <DetailView title="x">
          <div>Body</div>
        </DetailView>,
      );
      expect(screen.queryByText('Helpful subtitle')).toBeNull();
    });
  });

  describe('breadcrumbs', () => {
    it('renders breadcrumb items when provided', () => {
      renderWithProviders(
        <DetailView title="x" breadcrumbs={BC}>
          <div>Body</div>
        </DetailView>,
      );
      expect(screen.getByText('Home')).toBeInTheDocument();
      expect(screen.getByText('Items')).toBeInTheDocument();
    });

    it('does NOT render breadcrumbs when omitted', () => {
      renderWithProviders(
        <DetailView title="x">
          <div>Body</div>
        </DetailView>,
      );
      expect(screen.queryByText('Home')).toBeNull();
    });
  });

  describe('status slot in title', () => {
    it('renders a status node next to the title', () => {
      renderWithProviders(
        <DetailView title="My Entity" status={<span data-test-id="status-badge">Posted</span>}>
          <div>Body</div>
        </DetailView>,
      );
      expect(screen.getByTestId('status-badge')).toBeInTheDocument();
    });

    it('status sits in the same row as the entity name', () => {
      renderWithProviders(
        <DetailView title="x" status={<span data-test-id="status">Y</span>}>
          <div>Body</div>
        </DetailView>,
      );
      const name = screen.getByTestId('entity-name');
      const status = screen.getByTestId('status');
      // Same parent (the flex container)
      expect(name.parentElement).toBe(status.parentElement);
    });
  });

  describe('actions slot', () => {
    it('renders action nodes provided via actions prop', () => {
      renderWithProviders(
        <DetailView title="x" actions={<button data-test-id="my-action">Click</button>}>
          <div>Body</div>
        </DetailView>,
      );
      expect(screen.getByTestId('my-action')).toBeInTheDocument();
    });
  });
});
