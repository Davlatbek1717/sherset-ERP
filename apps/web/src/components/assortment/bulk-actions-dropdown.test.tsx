import { api } from '@/lib/api-client';
import { renderWithProviders, userEvent } from '@/test-utils';
import { screen, waitFor } from '@testing-library/react';
/**
 * AssortmentBulkActionsDropdown tests — verify the moysklad-parity menu
 * (7 items, captured from docs/moysklad-reference/products/states/metadata.json)
 * renders, the three backed actions (delete / archive / restore) hit the
 * right endpoints, and the four placeholder items (copy / mass-edit / move /
 * prices) are disabled until their backends land. Shared by Товары / Услуги /
 * Комплекты.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssortmentBulkActionsDropdown } from './bulk-actions-dropdown';

vi.mock('@/lib/api-client', () => ({
  api: {
    // URL-aware: the «Изменить цены» drawer fetches /price-types on mount
    // (usePriceTypeIds); the folder picker fetches /product-folders. Keep them
    // separate so one query doesn't consume the other's mock.
    get: vi.fn().mockImplementation((url: string) => {
      if (url.includes('/price-types')) {
        return Promise.resolve({
          items: [
            {
              id: 'pt-default',
              name: 'Розничная цена',
              isDefault: true,
              position: 0,
              currency: 'UZS',
              archived: false,
            },
          ],
        });
      }
      if (url.includes('/product-folders')) {
        return Promise.resolve({ items: [{ id: 'folder-9', name: 'Акфа' }] });
      }
      return Promise.resolve({ items: [] });
    }),
    post: vi.fn().mockResolvedValue({ total: 1, succeeded: ['id-1'], failed: [] }),
  },
}));

describe('AssortmentBulkActionsDropdown', () => {
  const baseProps = {
    listQueryKey: ['products'] as const,
    onClearSelection: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the trigger labelled "O\'zgartirish" (uz)', () => {
    renderWithProviders(
      <AssortmentBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} />,
    );
    expect(screen.getByRole('button', { name: /O'zgartirish/i })).toBeInTheDocument();
  });

  // MASTER-TODO #13 (2026-07-28). This used to assert the TRIGGER is disabled at
  // 0-selection. The climart adoption overlay (a52c3c7) deliberately moved that
  // gate onto the ITEMS — moysklad opens «Изменить» with nothing selected so the
  // user can see what is available, greying every selection-bound action. The
  // product code carries that grounding (see the sibling comment in
  // components/assortment/bulk-actions-dropdown.tsx:479-481), and the
  // customer-orders test was already migrated to this shape. The overlay
  // replaced the components but not these five specs, so they kept asserting the
  // pre-adoption Sherset shape.
  //
  // Re-expressed, NOT deleted: the original bug — firing a bulk mutation with an
  // empty selection — is still caught, now at the level where the gate lives.
  it('keeps the trigger enabled at 0-selection (moysklad parity), items disabled', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AssortmentBulkActionsDropdown {...baseProps} selectedIds={new Set()} />);
    const trigger = screen.getByRole('button', { name: /O'zgartirish/i });
    expect(trigger).toBeEnabled();
    await user.click(trigger);
    expect(
      screen.getByTestId('assortment-bulk-action-delete'),
      'assortment-bulk-action-delete must stay disabled at 0-selection',
    ).toHaveAttribute('data-disabled');
    expect(
      screen.getByTestId('assortment-bulk-action-copy'),
      'assortment-bulk-action-copy must stay disabled at 0-selection',
    ).toHaveAttribute('data-disabled');
    expect(
      screen.getByTestId('assortment-bulk-action-mass-edit'),
      'assortment-bulk-action-mass-edit must stay disabled at 0-selection',
    ).toHaveAttribute('data-disabled');
    expect(
      screen.getByTestId('assortment-bulk-action-move'),
      'assortment-bulk-action-move must stay disabled at 0-selection',
    ).toHaveAttribute('data-disabled');
    expect(
      screen.getByTestId('assortment-bulk-action-archive'),
      'assortment-bulk-action-archive must stay disabled at 0-selection',
    ).toHaveAttribute('data-disabled');
    expect(
      screen.getByTestId('assortment-bulk-action-restore'),
      'assortment-bulk-action-restore must stay disabled at 0-selection',
    ).toHaveAttribute('data-disabled');
    expect(
      screen.getByTestId('assortment-bulk-action-prices'),
      'assortment-bulk-action-prices must stay disabled at 0-selection',
    ).toHaveAttribute('data-disabled');
  });

  it('opens the menu and shows all 7 moysklad items in order', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AssortmentBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    for (const id of [
      'assortment-bulk-action-delete',
      'assortment-bulk-action-copy',
      'assortment-bulk-action-mass-edit',
      'assortment-bulk-action-move',
      'assortment-bulk-action-archive',
      'assortment-bulk-action-restore',
      'assortment-bulk-action-prices',
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
  });

  it('POSTs /products/bulk-delete when Удалить is confirmed', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AssortmentBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1', 'id-2'])} />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    await user.click(screen.getByTestId('assortment-bulk-action-delete'));
    const confirmButton = await screen.findByRole('button', { name: "O'chirish" });
    await user.click(confirmButton);
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/products/bulk-delete', { ids: ['id-1', 'id-2'] });
    });
  });

  it('POSTs /products/bulk-archive when Поместить в архив is confirmed', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AssortmentBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    await user.click(screen.getByTestId('assortment-bulk-action-archive'));
    const confirmButton = await screen.findByRole('button', { name: 'Arxivlash' });
    await user.click(confirmButton);
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/products/bulk-archive', { ids: ['id-1'] });
    });
  });

  it('POSTs /products/bulk-restore when Извлечь из архива is confirmed', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AssortmentBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    await user.click(screen.getByTestId('assortment-bulk-action-restore'));
    const confirmButton = await screen.findByRole('button', { name: 'Tiklash' });
    await user.click(confirmButton);
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/products/bulk-restore', { ids: ['id-1'] });
    });
  });

  it('all 7 Изменить actions are functional with a selection (none disabled)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AssortmentBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    for (const id of [
      'assortment-bulk-action-delete',
      'assortment-bulk-action-copy',
      'assortment-bulk-action-mass-edit',
      'assortment-bulk-action-move',
      'assortment-bulk-action-archive',
      'assortment-bulk-action-restore',
      'assortment-bulk-action-prices',
    ]) {
      expect(screen.getByTestId(id)).not.toHaveAttribute('data-disabled');
    }
  });

  it('POSTs /products/bulk-clone when Копировать is selected', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AssortmentBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1', 'id-2'])} />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    await user.click(screen.getByTestId('assortment-bulk-action-copy'));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/products/bulk-clone', { ids: ['id-1', 'id-2'] });
    });
  });

  it('Цены… opens the «Изменить цены» drawer and POSTs bulk-set-prices (fixed mode)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AssortmentBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1', 'id-2'])} />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    await user.click(screen.getByTestId('assortment-bulk-action-prices'));
    // moysklad parity: nothing is pre-selected (greyed «Выберите тип цены»
    // placeholder) and the default mode is «На основании другой цены». To set a
    // fixed price the user picks the target type + the «Задать конкретную цену»
    // radio explicitly.
    const target = await screen.findByTestId('bulk-prices-target');
    await user.selectOptions(target, 'pt-default');
    await user.click(screen.getByTestId('bulk-prices-mode-fixed'));
    const value = await screen.findByTestId('bulk-prices-fixed-value');
    await user.type(value, '5000');
    await user.click(screen.getByTestId('bulk-prices-apply'));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/products/bulk-set-prices',
        expect.objectContaining({
          ids: ['id-1', 'id-2'],
          targetPriceTypeId: 'pt-default',
          mode: 'fixed',
          valueMinor: expect.any(String),
        }),
      );
    });
  });

  it('Переместить opens a folder picker and POSTs /products/bulk-move on select', async () => {
    const user = userEvent.setup();
    // /product-folders → «Акфа» is provided by the URL-aware base mock above.
    renderWithProviders(
      <AssortmentBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1', 'id-2'])} />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    await user.click(screen.getByTestId('assortment-bulk-action-move'));
    // folder picker fetches /product-folders, then selecting one moves the rows
    const folder = await screen.findByText('Акфа');
    await user.click(folder);
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/products/bulk-move', {
        ids: ['id-1', 'id-2'],
        productFolderId: 'folder-9',
      });
    });
  });

  it('Массовое редактирование 2-step wizard: tick НДС, Далее → Применить → POST bulk-update', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AssortmentBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1', 'id-2'])} />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    await user.click(screen.getByTestId('assortment-bulk-action-mass-edit'));
    // Step 1 «Настройка параметров»: opt-in НДС, then its input appears.
    await user.click(await screen.findByTestId('bulk-massedit-toggle-vat'));
    await user.type(screen.getByTestId('bulk-massedit-vat'), '12');
    // Step 2 «Подтверждение» → apply.
    await user.click(screen.getByTestId('bulk-massedit-next'));
    await user.click(screen.getByTestId('bulk-massedit-apply'));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/products/bulk-update', {
        ids: ['id-1', 'id-2'],
        vat: 12,
      });
    });
  });

  it('invokes onMassEdit when explicitly wired (page-owned modal override)', async () => {
    const user = userEvent.setup();
    const onMassEdit = vi.fn();
    renderWithProviders(
      <AssortmentBulkActionsDropdown
        {...baseProps}
        selectedIds={new Set(['id-1'])}
        onMassEdit={onMassEdit}
      />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    await user.click(screen.getByTestId('assortment-bulk-action-mass-edit'));
    expect(onMassEdit).toHaveBeenCalledOnce();
  });

  it('renders Удалить as destructive (red text)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AssortmentBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    expect(screen.getByTestId('assortment-bulk-action-delete').className).toMatch(/destructive/);
  });
});
