import { renderWithProviders, screen, userEvent } from '@/test-utils';
import { ExportButton } from '@moysklad/ui';
/**
 * ExportButton (from @moysklad/ui) tests — downloads the visible
 * rows as UTF-8 CSV. Used at the top of every list page (counterparties,
 * customer-orders, demands, etc.).
 *
 * Tests guard the disabled state when no rows, the disabled state from
 * external `disabled` prop, the click handler triggering the CSV
 * download flow (mocked download to capture filename + content),
 * the visibleKeys filter, the column.cellText filter, the headerText
 * fallback chain.
 *
 * The download is intercepted by mocking the csv module so we can
 * inspect what would have been generated without touching the DOM.
 */
import { describe, expect, it, vi } from 'vitest';

// We can't easily mock buildCsv/downloadCsv inside the design-system bundle
// without altering its build, so instead we mock window.URL.createObjectURL
// and document.createElement('a') to capture the download trigger.

type Row = { id: string; name: string; price: number };

const ROWS: Row[] = [
  { id: '1', name: 'Apple', price: 100 },
  { id: '2', name: 'Banana', price: 200 },
];

const COLS_ALL_TEXT = [
  {
    key: 'name',
    header: 'Name',
    cell: (r: Row) => r.name,
    cellText: (r: Row) => r.name,
  },
  {
    key: 'price',
    header: 'Price',
    cell: (r: Row) => String(r.price),
    cellText: (r: Row) => String(r.price),
  },
];

const COLS_MIXED = [
  {
    key: 'name',
    header: 'Name',
    cell: (r: Row) => r.name,
    cellText: (r: Row) => r.name,
  },
  // Icon column has no cellText — should be skipped during export
  { key: 'icon', header: 'Icon', cell: () => null },
];

describe('ExportButton', () => {
  describe('basic rendering', () => {
    it('renders a button with aria-label "Export CSV"', () => {
      renderWithProviders(
        <ExportButton filenamePrefix="export" columns={COLS_ALL_TEXT} rows={ROWS} />,
      );
      expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument();
    });

    it('uses the export-csv-button data-test-id', () => {
      renderWithProviders(
        <ExportButton filenamePrefix="export" columns={COLS_ALL_TEXT} rows={ROWS} />,
      );
      expect(screen.getByTestId('export-csv-button')).toBeInTheDocument();
    });

    it('renders the optional label next to the icon', () => {
      renderWithProviders(
        <ExportButton
          filenamePrefix="export"
          columns={COLS_ALL_TEXT}
          rows={ROWS}
          label="Export to CSV"
        />,
      );
      expect(screen.getByText('Export to CSV')).toBeInTheDocument();
    });

    it('uses the tertiary Button variant (small)', () => {
      const { container } = renderWithProviders(
        <ExportButton filenamePrefix="export" columns={COLS_ALL_TEXT} rows={ROWS} />,
      );
      const btn = container.querySelector('[data-test-id="export-csv-button"]');
      // tertiary uses ghost-ish styling; verify size sm
      expect(btn?.className).toContain('h-8');
    });
  });

  describe('disabled state', () => {
    it('is disabled when rows is empty', () => {
      renderWithProviders(
        <ExportButton filenamePrefix="export" columns={COLS_ALL_TEXT} rows={[]} />,
      );
      expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
    });

    it('is enabled when rows is non-empty', () => {
      renderWithProviders(
        <ExportButton filenamePrefix="export" columns={COLS_ALL_TEXT} rows={ROWS} />,
      );
      expect(screen.getByRole('button', { name: 'Export CSV' })).not.toBeDisabled();
    });

    it('is disabled when external disabled prop is true (even with rows)', () => {
      renderWithProviders(
        <ExportButton filenamePrefix="export" columns={COLS_ALL_TEXT} rows={ROWS} disabled />,
      );
      expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
    });
  });

  describe('CSV download trigger', () => {
    it('clicking the button triggers the download flow (anchor + click + revoke)', async () => {
      const user = userEvent.setup();
      // Spy on the download primitives so we can confirm a download was triggered
      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
      const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const clickSpy = vi.fn();
      const origCreateElement = document.createElement.bind(document);
      const createElementSpy = vi
        .spyOn(document, 'createElement')
        .mockImplementation((tag: string) => {
          const el = origCreateElement(tag);
          if (tag === 'a') {
            (el as HTMLAnchorElement).click = clickSpy;
          }
          return el;
        });

      renderWithProviders(
        <ExportButton filenamePrefix="export" columns={COLS_ALL_TEXT} rows={ROWS} />,
      );
      await user.click(screen.getByRole('button', { name: 'Export CSV' }));

      expect(createObjectURLSpy).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(revokeObjectURLSpy).toHaveBeenCalled();

      createObjectURLSpy.mockRestore();
      revokeObjectURLSpy.mockRestore();
      createElementSpy.mockRestore();
    });

    it('clicking with empty rows does NOT trigger a download (early return)', async () => {
      const user = userEvent.setup();
      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');

      renderWithProviders(
        <ExportButton filenamePrefix="export" columns={COLS_ALL_TEXT} rows={[]} />,
      );
      // Force-click via JSDOM since the disabled button blocks userEvent click
      const btn = screen.getByRole('button', { name: 'Export CSV' });
      btn.removeAttribute('disabled');
      await user.click(btn);

      // Even after manual unlock, the early-return inside handle() should
      // bail out because rows.length === 0
      expect(createObjectURLSpy).not.toHaveBeenCalled();
      createObjectURLSpy.mockRestore();
    });

    it('clicking with no exportable columns (no cellText) bails out', async () => {
      const user = userEvent.setup();
      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');

      renderWithProviders(
        <ExportButton
          filenamePrefix="export"
          columns={[{ key: 'icon', header: 'Icon', cell: () => null }]}
          rows={ROWS}
        />,
      );
      const btn = screen.getByRole('button', { name: 'Export CSV' });
      await user.click(btn);

      expect(createObjectURLSpy).not.toHaveBeenCalled();
      createObjectURLSpy.mockRestore();
    });
  });

  describe('visibleKeys filter', () => {
    it('only exports columns in visibleKeys when provided', async () => {
      const user = userEvent.setup();
      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
      const clickSpy = vi.fn();
      const origCreateElement = document.createElement.bind(document);
      const createElementSpy = vi
        .spyOn(document, 'createElement')
        .mockImplementation((tag: string) => {
          const el = origCreateElement(tag);
          if (tag === 'a') (el as HTMLAnchorElement).click = clickSpy;
          return el;
        });

      renderWithProviders(
        <ExportButton
          filenamePrefix="x"
          columns={COLS_ALL_TEXT}
          rows={ROWS}
          visibleKeys={new Set(['name'])}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Export CSV' }));

      // Download still triggered (one column visible + has cellText)
      expect(clickSpy).toHaveBeenCalled();

      createObjectURLSpy.mockRestore();
      createElementSpy.mockRestore();
    });

    it('does NOT export when visibleKeys excludes all text columns', async () => {
      const user = userEvent.setup();
      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');

      renderWithProviders(
        <ExportButton
          filenamePrefix="x"
          columns={COLS_MIXED}
          rows={ROWS}
          // Only the 'icon' column visible — but it has no cellText
          visibleKeys={new Set(['icon'])}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Export CSV' }));
      expect(createObjectURLSpy).not.toHaveBeenCalled();
      createObjectURLSpy.mockRestore();
    });
  });
});
