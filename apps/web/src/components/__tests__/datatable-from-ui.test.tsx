import { renderWithProviders, screen, userEvent } from '@/test-utils';
import { DataTable, type DataTableColumn } from '@moysklad/ui';
/**
 * DataTable (from @moysklad/ui) tests — the ONE table renderer used
 * by every list page (counterparties, customer-orders, demands, ...).
 * Big surface area: column rendering, row clicks, selection (single +
 * select-all + indeterminate), sortable columns, loading / empty
 * states, sticky footer totals, visibleColumnKeys filter, per-row
 * test-id for E2E lookups.
 */
import { describe, expect, it, vi } from 'vitest';

interface Row {
  id: string;
  name: string;
  amount: number;
  posted?: boolean;
}

const ROWS: Row[] = [
  { id: '1', name: 'Apple', amount: 100, posted: true },
  { id: '2', name: 'Banana', amount: 200, posted: false },
  { id: '3', name: 'Cherry', amount: 300, posted: false },
];

const COLS: DataTableColumn<Row>[] = [
  { key: 'name', header: 'Name', cell: (r) => r.name },
  { key: 'amount', header: 'Amount', cell: (r) => String(r.amount), align: 'right' },
];

describe('DataTable', () => {
  describe('basic rendering', () => {
    it('renders <table> with headers from columns', () => {
      renderWithProviders(<DataTable columns={COLS} rows={ROWS} keyField="id" />);
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Amount')).toBeInTheDocument();
    });

    it('renders one <tr> per row', () => {
      const { container } = renderWithProviders(
        <DataTable columns={COLS} rows={ROWS} keyField="id" />,
      );
      // tbody rows = 3 rows + 0 header rows
      expect(container.querySelectorAll('tbody tr')).toHaveLength(3);
    });

    it('renders cell content via col.cell(row)', () => {
      renderWithProviders(<DataTable columns={COLS} rows={ROWS} keyField="id" />);
      expect(screen.getByText('Apple')).toBeInTheDocument();
      expect(screen.getByText('Banana')).toBeInTheDocument();
      expect(screen.getByText('Cherry')).toBeInTheDocument();
      expect(screen.getByText('100')).toBeInTheDocument();
      expect(screen.getByText('200')).toBeInTheDocument();
      expect(screen.getByText('300')).toBeInTheDocument();
    });

    it('uses the keyField for <tr> React keys', () => {
      // No exception thrown → keys unique → contract met.
      renderWithProviders(<DataTable columns={COLS} rows={ROWS} keyField="id" />);
      // Sanity: 3 rows present
      expect(screen.getAllByText(/^(Apple|Banana|Cherry)$/)).toHaveLength(3);
    });
  });

  describe('column align', () => {
    it('text-left by default (cell + header flex justify-start)', () => {
      const { container } = renderWithProviders(
        <DataTable columns={COLS} rows={ROWS} keyField="id" />,
      );
      // Default-left cell carries the text-left utility…
      const nameCell = container.querySelector('tbody tr:first-child td');
      expect(nameCell?.className).toContain('text-left');
      // …and the header aligns via its inner flex span (justify-start).
      const nameHeader = container.querySelector('th[scope="col"]');
      expect(nameHeader?.querySelector('span')?.className).toContain('justify-start');
    });

    it('align=right applies text-right to cells + justify-end to the header', () => {
      const { container } = renderWithProviders(
        <DataTable columns={COLS} rows={ROWS} keyField="id" />,
      );
      // The header right-aligns via its inner flex span (justify-end), not a
      // th text-align class.
      const headers = container.querySelectorAll('th');
      expect(headers[1]?.querySelector('span')?.className).toContain('justify-end');
      // First body row's amount cell keeps the text-right utility.
      const amountCell = container.querySelector('tbody tr:first-child td:last-child');
      expect(amountCell?.className).toContain('text-right');
    });
  });

  describe('row click', () => {
    it('does NOT add cursor-pointer class when no onRowClick', () => {
      const { container } = renderWithProviders(
        <DataTable columns={COLS} rows={ROWS} keyField="id" />,
      );
      const tr = container.querySelector('tbody tr');
      expect(tr?.className).not.toContain('cursor-pointer');
    });

    it('adds cursor-pointer + hover:bg when onRowClick provided', () => {
      const { container } = renderWithProviders(
        <DataTable columns={COLS} rows={ROWS} keyField="id" onRowClick={vi.fn()} />,
      );
      const tr = container.querySelector('tbody tr');
      expect(tr?.className).toContain('cursor-pointer');
      // moysklad parity: row hover uses a pale-yellow tint (#FFF8E1),
      // not the blue brand --ms-bg-hover used in other components.
      expect(tr?.className).toContain('hover:bg-[#fffb8c]');
    });

    it('clicking a row calls onRowClick with that row', async () => {
      const onRowClick = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <DataTable columns={COLS} rows={ROWS} keyField="id" onRowClick={onRowClick} />,
      );
      await user.click(screen.getByText('Apple'));
      expect(onRowClick).toHaveBeenCalledWith(ROWS[0]);
    });
  });

  describe('selected row vs hover priority', () => {
    it('does NOT apply the lighter bg-hover class when a row is selected', () => {
      // Selected row keeps its darker bg-selected on hover so the
      // selection doesn't disappear when the cursor passes over it.
      const { container } = renderWithProviders(
        <DataTable
          columns={COLS}
          rows={ROWS}
          keyField="id"
          onRowClick={vi.fn()}
          selectable
          selectedIds={new Set(['1'])}
          onSelectionChange={vi.fn()}
        />,
      );
      const rows = container.querySelectorAll('tbody tr');
      const selectedRow = rows[0];
      const unselectedRow = rows[1];
      expect(selectedRow?.className).toContain('bg-[var(--ms-bg-selected)]');
      expect(selectedRow?.className).not.toContain('hover:bg-[#fffb8c]');
      expect(unselectedRow?.className).toContain('hover:bg-[#fffb8c]');
    });

    it('uses a darker hover variant on selected rows (color-mix to black)', () => {
      const { container } = renderWithProviders(
        <DataTable
          columns={COLS}
          rows={ROWS}
          keyField="id"
          onRowClick={vi.fn()}
          selectable
          selectedIds={new Set(['1'])}
          onSelectionChange={vi.fn()}
        />,
      );
      const selectedRow = container.querySelector('tbody tr');
      expect(selectedRow?.className).toContain('color-mix');
    });

    it('exposes data-selected on selected rows for downstream styling', () => {
      const { container } = renderWithProviders(
        <DataTable
          columns={COLS}
          rows={ROWS}
          keyField="id"
          selectable
          selectedIds={new Set(['2'])}
          onSelectionChange={vi.fn()}
        />,
      );
      const rows = container.querySelectorAll('tbody tr');
      expect(rows[0]?.getAttribute('data-selected')).toBeNull();
      expect(rows[1]?.getAttribute('data-selected')).toBe('true');
    });
  });

  describe('rowTestId', () => {
    it('sets data-test-id on each row when rowTestId returns a string', () => {
      const { container } = renderWithProviders(
        <DataTable columns={COLS} rows={ROWS} keyField="id" rowTestId={(r) => `row-${r.id}`} />,
      );
      expect(container.querySelector('[data-test-id="row-1"]')).toBeInTheDocument();
      expect(container.querySelector('[data-test-id="row-2"]')).toBeInTheDocument();
      expect(container.querySelector('[data-test-id="row-3"]')).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('renders "Yuklanmoqda..." text when loading=true', () => {
      renderWithProviders(<DataTable columns={COLS} rows={[]} keyField="id" loading />);
      expect(screen.getByText('Yuklanmoqda...')).toBeInTheDocument();
    });

    it('loading row spans all columns (colSpan)', () => {
      const { container } = renderWithProviders(
        <DataTable columns={COLS} rows={[]} keyField="id" loading />,
      );
      const cell = container.querySelector('tbody td');
      expect(cell).toHaveAttribute('colspan', '2');
    });

    it('loading=true overrides empty content (loading wins)', () => {
      renderWithProviders(
        <DataTable
          columns={COLS}
          rows={[]}
          keyField="id"
          loading
          empty={<div data-test-id="empty-state">Empty!</div>}
        />,
      );
      expect(screen.getByText('Yuklanmoqda...')).toBeInTheDocument();
      expect(screen.queryByTestId('empty-state')).toBeNull();
    });
  });

  describe('empty state', () => {
    it('renders the empty slot when rows=[] and !loading', () => {
      renderWithProviders(
        <DataTable
          columns={COLS}
          rows={[]}
          keyField="id"
          empty={<div data-test-id="empty">Nothing here</div>}
        />,
      );
      expect(screen.getByTestId('empty')).toBeInTheDocument();
    });

    it('empty state spans all columns', () => {
      const { container } = renderWithProviders(
        <DataTable columns={COLS} rows={[]} keyField="id" empty={<div>e</div>} />,
      );
      const cell = container.querySelector('tbody td');
      expect(cell).toHaveAttribute('colspan', '2');
    });
  });

  describe('selection', () => {
    it('does NOT render selection column by default', () => {
      const { container } = renderWithProviders(
        <DataTable columns={COLS} rows={ROWS} keyField="id" />,
      );
      // No "Select all" checkbox header
      expect(container.querySelector('[data-test-id="select-all"]')).toBeNull();
    });

    it('renders selection column when selectable=true', () => {
      const { container } = renderWithProviders(
        <DataTable
          columns={COLS}
          rows={ROWS}
          keyField="id"
          selectable
          selectedIds={new Set()}
          onSelectionChange={vi.fn()}
        />,
      );
      expect(container.querySelector('[data-test-id="select-all"]')).toBeInTheDocument();
      expect(container.querySelector('[data-test-id="select-row-1"]')).toBeInTheDocument();
    });

    it('select-all checkbox checked when all rows selected', () => {
      const { container } = renderWithProviders(
        <DataTable
          columns={COLS}
          rows={ROWS}
          keyField="id"
          selectable
          selectedIds={new Set(['1', '2', '3'])}
          onSelectionChange={vi.fn()}
        />,
      );
      const cb = container.querySelector('[data-test-id="select-all"]');
      expect(cb).toHaveAttribute('data-state', 'checked');
    });

    it('select-all checkbox indeterminate when some (but not all) selected', () => {
      const { container } = renderWithProviders(
        <DataTable
          columns={COLS}
          rows={ROWS}
          keyField="id"
          selectable
          selectedIds={new Set(['1'])}
          onSelectionChange={vi.fn()}
        />,
      );
      const cb = container.querySelector('[data-test-id="select-all"]');
      expect(cb).toHaveAttribute('data-state', 'indeterminate');
    });

    it('select-all click → onSelectionChange with ALL row ids', async () => {
      const onSelectionChange = vi.fn();
      const user = userEvent.setup();
      const { container } = renderWithProviders(
        <DataTable
          columns={COLS}
          rows={ROWS}
          keyField="id"
          selectable
          selectedIds={new Set()}
          onSelectionChange={onSelectionChange}
        />,
      );
      await user.click(container.querySelector('[data-test-id="select-all"]')!);
      const next = onSelectionChange.mock.calls[0]![0] as Set<string>;
      expect(next.has('1')).toBe(true);
      expect(next.has('2')).toBe(true);
      expect(next.has('3')).toBe(true);
    });

    it('select-all click when all selected → onSelectionChange with empty set', async () => {
      const onSelectionChange = vi.fn();
      const user = userEvent.setup();
      const { container } = renderWithProviders(
        <DataTable
          columns={COLS}
          rows={ROWS}
          keyField="id"
          selectable
          selectedIds={new Set(['1', '2', '3'])}
          onSelectionChange={onSelectionChange}
        />,
      );
      await user.click(container.querySelector('[data-test-id="select-all"]')!);
      const next = onSelectionChange.mock.calls[0]![0] as Set<string>;
      expect(next.size).toBe(0);
    });

    it('per-row click → onSelectionChange toggles that single id', async () => {
      const onSelectionChange = vi.fn();
      const user = userEvent.setup();
      const { container } = renderWithProviders(
        <DataTable
          columns={COLS}
          rows={ROWS}
          keyField="id"
          selectable
          selectedIds={new Set(['1'])}
          onSelectionChange={onSelectionChange}
        />,
      );
      // Toggle row 2 ON
      await user.click(container.querySelector('[data-test-id="select-row-2"]')!);
      const next = onSelectionChange.mock.calls[0]![0] as Set<string>;
      expect(next.has('1')).toBe(true);
      expect(next.has('2')).toBe(true);
    });

    it("canSelect=false disables that row's checkbox", () => {
      const { container } = renderWithProviders(
        <DataTable
          columns={COLS}
          rows={ROWS}
          keyField="id"
          selectable
          selectedIds={new Set()}
          onSelectionChange={vi.fn()}
          canSelect={(r) => !r.posted}
        />,
      );
      // Row 1 is posted → disabled
      const row1 = container.querySelector('[data-test-id="select-row-1"]');
      expect(row1).toBeDisabled();
      // Row 2 not posted → enabled
      const row2 = container.querySelector('[data-test-id="select-row-2"]');
      expect(row2).not.toBeDisabled();
    });

    it('select-all only counts selectable rows when canSelect provided', () => {
      const { container } = renderWithProviders(
        <DataTable
          columns={COLS}
          rows={ROWS}
          keyField="id"
          selectable
          // Both selectable rows (2, 3) are picked → "all" should be checked
          selectedIds={new Set(['2', '3'])}
          onSelectionChange={vi.fn()}
          canSelect={(r) => !r.posted}
        />,
      );
      const cb = container.querySelector('[data-test-id="select-all"]');
      expect(cb).toHaveAttribute('data-state', 'checked');
    });
  });

  describe('row click + selection click stopPropagation', () => {
    it('clicking the per-row checkbox does NOT bubble to onRowClick', async () => {
      const onRowClick = vi.fn();
      const onSelectionChange = vi.fn();
      const user = userEvent.setup();
      const { container } = renderWithProviders(
        <DataTable
          columns={COLS}
          rows={ROWS}
          keyField="id"
          selectable
          selectedIds={new Set()}
          onSelectionChange={onSelectionChange}
          onRowClick={onRowClick}
        />,
      );
      await user.click(container.querySelector('[data-test-id="select-row-1"]')!);
      expect(onSelectionChange).toHaveBeenCalled();
      expect(onRowClick).not.toHaveBeenCalled();
    });
  });

  describe('sortable columns', () => {
    const SORTABLE_COLS: DataTableColumn<Row>[] = [
      { key: 'name', header: 'Name', cell: (r) => r.name, sortable: true },
      { key: 'amount', header: 'Amount', cell: (r) => String(r.amount), sortable: true },
    ];

    it('adds cursor-pointer even without onSortChange (built-in client-side sort)', () => {
      // The DataTable now sorts client-side by default when the page hasn't
      // wired server-side onSortChange — so EVERY column header is clickable.
      const { container } = renderWithProviders(
        <DataTable columns={SORTABLE_COLS} rows={ROWS} keyField="id" />,
      );
      const header = container.querySelector('th');
      expect(header?.className).toContain('cursor-pointer');
    });

    it('client-side sort: clicking a header reorders the rows', async () => {
      const user = userEvent.setup();
      const { container } = renderWithProviders(
        <DataTable columns={SORTABLE_COLS} rows={ROWS} keyField="id" />,
      );
      const firstCellText = () => container.querySelector('tbody tr:first-child td')?.textContent;
      // Natural order → Apple first. Click Name (→ desc) → Cherry first.
      expect(firstCellText()).toBe('Apple');
      await user.click(screen.getByText('Name'));
      expect(firstCellText()).toBe('Cherry');
      // Click again (→ asc) → Apple first.
      await user.click(screen.getByText('Name'));
      expect(firstCellText()).toBe('Apple');
    });

    it('adds cursor-pointer to sortable headers when onSortChange provided', () => {
      const { container } = renderWithProviders(
        <DataTable columns={SORTABLE_COLS} rows={ROWS} keyField="id" onSortChange={vi.fn()} />,
      );
      const header = container.querySelector('th');
      expect(header?.className).toContain('cursor-pointer');
    });

    it('clicking a sortable header (no current sort) → onSortChange(key, "desc")', async () => {
      const onSortChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <DataTable columns={SORTABLE_COLS} rows={ROWS} keyField="id" onSortChange={onSortChange} />,
      );
      await user.click(screen.getByText('Name'));
      expect(onSortChange).toHaveBeenCalledWith('name', 'desc');
    });

    it('clicking active sortable header toggles direction', async () => {
      const onSortChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <DataTable
          columns={SORTABLE_COLS}
          rows={ROWS}
          keyField="id"
          onSortChange={onSortChange}
          sortKey="name"
          sortDir="desc"
        />,
      );
      await user.click(screen.getByText('Name'));
      expect(onSortChange).toHaveBeenCalledWith('name', 'asc');
    });

    it('renders the ascending caret (CSS triangle, border-bottom) on the active column', () => {
      const { container } = renderWithProviders(
        <DataTable
          columns={SORTABLE_COLS}
          rows={ROWS}
          keyField="id"
          onSortChange={vi.fn()}
          sortKey="name"
          sortDir="asc"
        />,
      );
      // The sort indicator is a CSS triangle (border styles), not a ▲ glyph.
      const caret = container.querySelector(
        'th[aria-sort="ascending"] span[style*="border-bottom"]',
      );
      expect(caret).toBeInTheDocument();
    });

    it('renders the descending caret (CSS triangle, border-top) on the active column', () => {
      const { container } = renderWithProviders(
        <DataTable
          columns={SORTABLE_COLS}
          rows={ROWS}
          keyField="id"
          onSortChange={vi.fn()}
          sortKey="amount"
          sortDir="desc"
        />,
      );
      const caret = container.querySelector('th[aria-sort="descending"] span[style*="border-top"]');
      expect(caret).toBeInTheDocument();
    });

    it('aria-sort="ascending" set on active sorted column when sortDir="asc"', () => {
      const { container } = renderWithProviders(
        <DataTable
          columns={SORTABLE_COLS}
          rows={ROWS}
          keyField="id"
          onSortChange={vi.fn()}
          sortKey="name"
          sortDir="asc"
        />,
      );
      const headers = container.querySelectorAll('th');
      // First header (Name) should have aria-sort="ascending"
      expect(headers[0]).toHaveAttribute('aria-sort', 'ascending');
      // Other header should NOT
      expect(headers[1]).not.toHaveAttribute('aria-sort');
    });

    it('aria-sort="descending" set on active sorted column when sortDir="desc"', () => {
      const { container } = renderWithProviders(
        <DataTable
          columns={SORTABLE_COLS}
          rows={ROWS}
          keyField="id"
          onSortChange={vi.fn()}
          sortKey="amount"
          sortDir="desc"
        />,
      );
      const headers = container.querySelectorAll('th');
      expect(headers[1]).toHaveAttribute('aria-sort', 'descending');
    });
  });

  describe('visibleColumnKeys filter', () => {
    it('renders only columns whose key is in visibleColumnKeys', () => {
      renderWithProviders(
        <DataTable
          columns={COLS}
          rows={ROWS}
          keyField="id"
          visibleColumnKeys={new Set(['name'])}
        />,
      );
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.queryByText('Amount')).toBeNull();
    });
  });

  describe('footerRow (totals strip)', () => {
    it('does NOT render footer when omitted', () => {
      const { container } = renderWithProviders(
        <DataTable columns={COLS} rows={ROWS} keyField="id" />,
      );
      expect(container.querySelector('tfoot')).toBeNull();
    });

    it('does NOT render footer when rows is empty (even with footerRow)', () => {
      const { container } = renderWithProviders(
        <DataTable columns={COLS} rows={[]} keyField="id" footerRow={{ amount: '600' }} />,
      );
      expect(container.querySelector('tfoot')).toBeNull();
    });

    it('renders footer row with the values mapped to columns by key', () => {
      const { container } = renderWithProviders(
        <DataTable columns={COLS} rows={ROWS} keyField="id" footerRow={{ amount: '600' }} />,
      );
      expect(container.querySelector('tfoot')).toBeInTheDocument();
      // The "amount" footer cell shows 600
      const footerCells = container.querySelectorAll('tfoot td');
      // Should be one cell per column (no selectable column → 2 cells)
      expect(footerCells).toHaveLength(2);
      // Last cell (amount) shows "600"
      expect(footerCells[1]?.textContent).toContain('600');
    });

    it('footer adds the empty selectable cell when selectable=true', () => {
      const { container } = renderWithProviders(
        <DataTable
          columns={COLS}
          rows={ROWS}
          keyField="id"
          selectable
          selectedIds={new Set()}
          onSelectionChange={vi.fn()}
          footerRow={{ amount: '600' }}
        />,
      );
      // 1 (selectable) + 2 (cols) = 3 footer cells
      expect(container.querySelectorAll('tfoot td')).toHaveLength(3);
    });
  });
});
