/**
 * F2 integratsiya (reja: docs/plans/2026-08-23-ombor-restrukturizatsiya.md):
 * yacheyka-tabda tovar guruhiga «+ Yacheyka» orqali TIZIM BILMAGAN yacheyka
 * qatori qo'shiladi (expected=0 dan sanaladi) va untouched store-level qator
 * double-count guard bilan tushiriladi. «Faqat yacheyka» qoidasi buzilmaydi —
 * qo'shilgan qator har doim cellId'li.
 */
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type InventoryPanelRow, InventoryPositionsPanel } from './inventory-positions-panel';

const getMock = vi.fn();
const postMock = vi.fn();
vi.mock('@/lib/api-client', () => ({
  api: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

const META_ITEM = {
  assortmentId: 'p1',
  name: 'Test tovar',
  code: 'T-1',
  article: null,
  description: null,
  uom: 'dona',
  barcodes: [],
  supplierId: null,
  supplierName: null,
  folderId: null,
  folderName: null,
  stockQty: '5',
  unitCostMinor: null,
  cells: [] as Array<{ cellId: string; name: string; qty: string }>,
};

describe('InventoryPositionsPanel — F2 «+ Yacheyka»', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    postMock.mockResolvedValue({ items: [META_ITEM] });
    getMock.mockResolvedValue({
      cells: [{ id: 'c9', name: '03-01-01-01', zoneId: null, zoneName: null }],
    });
  });

  function renderPanel(rows: InventoryPanelRow[], onRowsChange = vi.fn()) {
    renderWithProviders(
      <InventoryPositionsPanel
        mode="detail"
        storeId="s1"
        rows={rows}
        onRowsChange={onRowsChange}
        description=""
      />,
    );
    return onRowsChange;
  }

  it('adds an unknown cell as a new (product × cell) row and drops the untouched store row', async () => {
    const user = userEvent.setup();
    const storeRow: InventoryPanelRow = {
      id: 'r1',
      assortmentId: 'p1',
      productLabel: 'Test tovar',
      productCode: 'T-1',
      productUom: 'dona',
      actualQty: '0',
    };
    const onRowsChange = renderPanel([storeRow]);

    // yacheyka-tab standart; meta kelgach orientation qator + «+ Yacheyka» chiqadi
    await user.click(await screen.findByTestId('inventory-add-cell-p1-open'));
    await waitFor(() => expect(getMock).toHaveBeenCalled());
    await user.type(screen.getByTestId('inventory-add-cell-p1-code'), '03-01-01-01{Enter}');

    expect(onRowsChange).toHaveBeenCalledTimes(1);
    const next = onRowsChange.mock.calls[0]?.[0] as InventoryPanelRow[];
    // «faqat yacheyka»: qo'shilgan yagona qator cellId'li, store-qator tushdi
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      assortmentId: 'p1',
      cellId: 'c9',
      cell: '03-01-01-01',
      actualQty: '0',
      productLabel: 'Test tovar',
    });
  });

  it('keeps an explicitly counted store row (actual > 0) when a cell row is added', async () => {
    const user = userEvent.setup();
    const countedStoreRow: InventoryPanelRow = {
      id: 'r1',
      assortmentId: 'p1',
      productLabel: 'Test tovar',
      actualQty: '7',
    };
    const onRowsChange = renderPanel([countedStoreRow]);

    await user.click(await screen.findByTestId('inventory-add-cell-p1-open'));
    await waitFor(() => expect(getMock).toHaveBeenCalled());
    await user.type(screen.getByTestId('inventory-add-cell-p1-code'), '03-01-01-01{Enter}');

    const next = onRowsChange.mock.calls[0]?.[0] as InventoryPanelRow[];
    expect(next).toHaveLength(2);
    expect(next.find((r) => !r.cellId)?.actualQty).toBe('7');
    expect(next.find((r) => r.cellId === 'c9')).toBeTruthy();
  });
});
