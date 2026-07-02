import { renderWithProviders, screen } from '@/test-utils';
import { InfoGrid } from '@moysklad/ui';
/**
 * InfoGrid (from @moysklad/ui) tests — read-only label/value table
 * used by every detail page (Asosiy ma'lumotlar, Aloqa, Ombor,
 * Statistika sections in counterparties/products + Meta sections
 * in money documents).
 *
 * Tests guard the column count (1/2/3), the tabular vs default
 * value rendering, the empty value fallback ("—"), and the
 * fullWidth row.
 */
import { describe, expect, it } from 'vitest';

describe('InfoGrid', () => {
  describe('basic rendering', () => {
    it('renders as a <dl>', () => {
      const { container } = renderWithProviders(<InfoGrid items={[{ label: 'L', value: 'V' }]} />);
      expect(container.querySelector('dl')).toBeInTheDocument();
    });

    it('renders one <dt>+<dd> pair per item', () => {
      const { container } = renderWithProviders(
        <InfoGrid
          items={[
            { label: 'A', value: '1' },
            { label: 'B', value: '2' },
            { label: 'C', value: '3' },
          ]}
        />,
      );
      expect(container.querySelectorAll('dt')).toHaveLength(3);
      expect(container.querySelectorAll('dd')).toHaveLength(3);
    });

    it('renders the label text in the dt', () => {
      const { container } = renderWithProviders(
        <InfoGrid items={[{ label: 'STIR', value: '12345' }]} />,
      );
      const dt = container.querySelector('dt');
      expect(dt?.textContent).toBe('STIR');
    });

    it('renders the value text in the dd', () => {
      const { container } = renderWithProviders(
        <InfoGrid items={[{ label: 'STIR', value: '12345' }]} />,
      );
      const dd = container.querySelector('dd');
      expect(dd?.textContent).toBe('12345');
    });
  });

  describe('empty value fallback', () => {
    it('renders "—" when value is null', () => {
      const { container } = renderWithProviders(<InfoGrid items={[{ label: 'L', value: null }]} />);
      expect(container.querySelector('dd')?.textContent).toBe('—');
    });

    it('renders "—" when value is undefined', () => {
      const { container } = renderWithProviders(
        <InfoGrid items={[{ label: 'L', value: undefined }]} />,
      );
      expect(container.querySelector('dd')?.textContent).toBe('—');
    });

    it('the "—" fallback uses muted text color', () => {
      const { container } = renderWithProviders(<InfoGrid items={[{ label: 'L', value: null }]} />);
      const dash = container.querySelector('dd > span');
      expect(dash?.className).toContain('ms-text-muted');
    });

    it('does NOT render the fallback when value is the string "0"', () => {
      const { container } = renderWithProviders(<InfoGrid items={[{ label: 'L', value: '0' }]} />);
      expect(container.querySelector('dd')?.textContent).toBe('0');
    });

    it('does NOT render the fallback when value is the number 0', () => {
      const { container } = renderWithProviders(<InfoGrid items={[{ label: 'L', value: 0 }]} />);
      expect(container.querySelector('dd')?.textContent).toBe('0');
    });
  });

  describe('tabular variant', () => {
    it('applies font-mono + tabular-nums + text-xs to tabular dd', () => {
      const { container } = renderWithProviders(
        <InfoGrid items={[{ label: 'Sum', value: '64 000,00', tabular: true }]} />,
      );
      const dd = container.querySelector('dd');
      expect(dd?.className).toContain('font-mono');
      expect(dd?.className).toContain('tabular-nums');
      expect(dd?.className).toContain('text-xs');
    });

    it('does NOT apply tabular classes when tabular is false/omitted', () => {
      const { container } = renderWithProviders(
        <InfoGrid items={[{ label: 'L', value: 'plain text' }]} />,
      );
      const dd = container.querySelector('dd');
      expect(dd?.className ?? '').not.toContain('font-mono');
      expect(dd?.className ?? '').not.toContain('tabular-nums');
    });
  });

  describe('fullWidth variant', () => {
    it('applies col-span-full to fullWidth dd', () => {
      const { container } = renderWithProviders(
        <InfoGrid items={[{ label: 'Address', value: 'Long address line', fullWidth: true }]} />,
      );
      const dd = container.querySelector('dd');
      expect(dd?.className).toContain('col-span-full');
    });
  });

  describe('columns prop', () => {
    it('uses 1-column layout by default', () => {
      const { container } = renderWithProviders(<InfoGrid items={[{ label: 'L', value: 'V' }]} />);
      const dl = container.querySelector('dl');
      // colsMap[1] = 'sm:grid-cols-[160px,1fr]'
      expect(dl?.className).toContain('sm:grid-cols-[160px,1fr]');
    });

    it('uses 2-column layout when columns=2', () => {
      const { container } = renderWithProviders(
        <InfoGrid columns={2} items={[{ label: 'L', value: 'V' }]} />,
      );
      const dl = container.querySelector('dl');
      expect(dl?.className).toContain('sm:grid-cols-[160px,1fr_160px,1fr]');
    });

    it('uses 3-column layout when columns=3', () => {
      const { container } = renderWithProviders(
        <InfoGrid columns={3} items={[{ label: 'L', value: 'V' }]} />,
      );
      const dl = container.querySelector('dl');
      expect(dl?.className).toContain('sm:grid-cols-[140px,1fr_140px,1fr_140px,1fr]');
    });
  });

  describe('layout baseline', () => {
    it('applies grid + gap-x-4 + gap-y-2 + text-sm to the dl', () => {
      const { container } = renderWithProviders(<InfoGrid items={[{ label: 'L', value: 'V' }]} />);
      const dl = container.querySelector('dl');
      expect(dl?.className).toContain('grid');
      expect(dl?.className).toContain('gap-x-4');
      expect(dl?.className).toContain('gap-y-2');
      expect(dl?.className).toContain('text-sm');
    });

    it('label gets muted color', () => {
      const { container } = renderWithProviders(<InfoGrid items={[{ label: 'L', value: 'V' }]} />);
      expect(container.querySelector('dt')?.className).toContain('ms-text-muted');
    });

    it('value gets primary color', () => {
      const { container } = renderWithProviders(<InfoGrid items={[{ label: 'L', value: 'V' }]} />);
      expect(container.querySelector('dd')?.className).toContain('ms-text-primary');
    });
  });

  describe('content nesting', () => {
    it('supports React node values (links, badges, custom)', () => {
      renderWithProviders(
        <InfoGrid
          items={[
            {
              label: 'Linked',
              value: (
                <a href="/x" data-test-id="link">
                  Open
                </a>
              ),
            },
          ]}
        />,
      );
      expect(screen.getByTestId('link')).toBeInTheDocument();
    });

    it('supports React node labels (for translation interpolation)', () => {
      renderWithProviders(
        <InfoGrid
          items={[
            {
              label: <span data-test-id="lbl">Custom label</span>,
              value: 'V',
            },
          ]}
        />,
      );
      expect(screen.getByTestId('lbl')).toBeInTheDocument();
    });
  });

  describe('forwarded ref + className merge', () => {
    it('forwards ref to the underlying <dl>', () => {
      let captured: HTMLDListElement | null = null;
      renderWithProviders(
        <InfoGrid
          ref={(el) => {
            captured = el;
          }}
          items={[{ label: 'L', value: 'V' }]}
        />,
      );
      expect(captured).toBeInstanceOf(HTMLDListElement);
    });

    it('merges user className', () => {
      const { container } = renderWithProviders(
        <InfoGrid className="my-grid-extra" items={[{ label: 'L', value: 'V' }]} />,
      );
      const dl = container.querySelector('dl');
      expect(dl?.className).toContain('my-grid-extra');
    });
  });
});
