/**
 * F2 «+ Yacheyka» (reja: docs/plans/2026-08-23-ombor-restrukturizatsiya.md) —
 * skaner-do'st kod terish (aniq moslik, topilmasa kod bilan xato), ro'yxatdan
 * tanlash, dublikatga aniq xato.
 */
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryAddCell, resolveCellByCode } from './add-cell-picker';

const getMock = vi.fn();
vi.mock('@/lib/api-client', () => ({
  api: {
    get: (...args: unknown[]) => getMock(...args),
    post: vi.fn(),
  },
}));

const CELLS = [
  { id: 'c1', name: '01-02-03-04' },
  { id: 'c2', name: '03-01-01-01' },
];

describe('resolveCellByCode', () => {
  it('matches the exact trimmed code (case-insensitive)', () => {
    expect(resolveCellByCode(CELLS, ' 03-01-01-01 ')?.id).toBe('c2');
    expect(resolveCellByCode([{ id: 'x', name: 'A-1' }], 'a-1')?.id).toBe('x');
  });

  it('returns null for a partial, unknown or empty code', () => {
    expect(resolveCellByCode(CELLS, '03-01')).toBeNull();
    expect(resolveCellByCode(CELLS, '99-99-99-99')).toBeNull();
    expect(resolveCellByCode(CELLS, '   ')).toBeNull();
  });
});

describe('InventoryAddCell', () => {
  beforeEach(() => {
    getMock.mockReset();
    getMock.mockResolvedValue({ cells: CELLS });
  });

  async function openPanel(onAdd = vi.fn(), existing = new Set<string>()) {
    const user = userEvent.setup();
    renderWithProviders(<InventoryAddCell storeId="s1" existingCellIds={existing} onAdd={onAdd} />);
    await user.click(screen.getByTestId('inventory-add-cell-open'));
    await waitFor(() => expect(getMock).toHaveBeenCalled());
    return { user, onAdd };
  }

  it('adds the exact cell on Enter (scanner flow)', async () => {
    const { user, onAdd } = await openPanel();
    await user.type(screen.getByTestId('inventory-add-cell-code'), '03-01-01-01{Enter}');
    expect(onAdd).toHaveBeenCalledWith({ id: 'c2', name: '03-01-01-01' });
    // panel skaner uchun ochiq qoladi, kod tozalanadi
    expect(screen.getByTestId('inventory-add-cell-code')).toHaveValue('');
  });

  it('shows a precise not-found error carrying the typed code', async () => {
    const { user, onAdd } = await openPanel();
    await user.type(screen.getByTestId('inventory-add-cell-code'), '99-99-99-99{Enter}');
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByTestId('inventory-add-cell-error').textContent).toContain('99-99-99-99');
  });

  it('rejects a cell already present in the grid with a precise error', async () => {
    const { user, onAdd } = await openPanel(vi.fn(), new Set(['c1']));
    await user.type(screen.getByTestId('inventory-add-cell-code'), '01-02-03-04{Enter}');
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByTestId('inventory-add-cell-error').textContent).toContain('01-02-03-04');
  });

  it('adds a cell picked from the filtered list', async () => {
    const { user, onAdd } = await openPanel();
    await user.type(screen.getByTestId('inventory-add-cell-code'), '03-01');
    expect(screen.queryByTestId('inventory-add-cell-opt-c1')).not.toBeInTheDocument();
    await user.click(await screen.findByTestId('inventory-add-cell-opt-c2'));
    expect(onAdd).toHaveBeenCalledWith({ id: 'c2', name: '03-01-01-01' });
  });
});
