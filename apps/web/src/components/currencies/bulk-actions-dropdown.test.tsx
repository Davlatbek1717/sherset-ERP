import { api } from '@/lib/api-client';
import { renderWithProviders, userEvent } from '@/test-utils';
import { screen, waitFor } from '@testing-library/react';
/**
 * CurrencyBulkActionsDropdown tests — verify the moysklad-parity menu (4 items,
 * captured from docs/moysklad-reference/currencies/states/metadata.json): the
 * three backed actions (delete / archive / restore) hit /currencies/bulk-*, and
 * «Массовое редактирование» is a disabled label-parity placeholder (moysklad's
 * currency mass-edit only edits the Доступ block, which our model lacks).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CurrencyBulkActionsDropdown } from './bulk-actions-dropdown';

vi.mock('@/lib/api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue({ total: 1, succeeded: ['id-1'], failed: [] }),
  },
}));

describe('CurrencyBulkActionsDropdown', () => {
  const baseProps = {
    listQueryKey: ['currencies'] as const,
    onClearSelection: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the trigger labelled "O\'zgartirish" (uz)', () => {
    renderWithProviders(
      <CurrencyBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} />,
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
    renderWithProviders(<CurrencyBulkActionsDropdown {...baseProps} selectedIds={new Set()} />);
    const trigger = screen.getByRole('button', { name: /O'zgartirish/i });
    expect(trigger).toBeEnabled();
    await user.click(trigger);
    expect(
      screen.getByTestId('currency-bulk-action-delete'),
      'currency-bulk-action-delete must stay disabled at 0-selection',
    ).toHaveAttribute('data-disabled');
    expect(
      screen.getByTestId('currency-bulk-action-archive'),
      'currency-bulk-action-archive must stay disabled at 0-selection',
    ).toHaveAttribute('data-disabled');
    expect(
      screen.getByTestId('currency-bulk-action-restore'),
      'currency-bulk-action-restore must stay disabled at 0-selection',
    ).toHaveAttribute('data-disabled');
  });

  it('opens the menu and shows the 4 moysklad items in order', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CurrencyBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    for (const id of [
      'currency-bulk-action-delete',
      'currency-bulk-action-mass-edit',
      'currency-bulk-action-archive',
      'currency-bulk-action-restore',
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
  });

  it('POSTs /currencies/bulk-delete when Удалить is confirmed', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CurrencyBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1', 'id-2'])} />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    await user.click(screen.getByTestId('currency-bulk-action-delete'));
    const confirmButton = await screen.findByRole('button', { name: "O'chirish" });
    await user.click(confirmButton);
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/currencies/bulk-delete', { ids: ['id-1', 'id-2'] });
    });
  });

  it('POSTs /currencies/bulk-archive when Поместить в архив is confirmed', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CurrencyBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    await user.click(screen.getByTestId('currency-bulk-action-archive'));
    const confirmButton = await screen.findByRole('button', { name: 'Arxivlash' });
    await user.click(confirmButton);
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/currencies/bulk-archive', { ids: ['id-1'] });
    });
  });

  it('POSTs /currencies/bulk-restore when Извлечь из архива is confirmed', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CurrencyBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    await user.click(screen.getByTestId('currency-bulk-action-restore'));
    const confirmButton = await screen.findByRole('button', { name: 'Tiklash' });
    await user.click(confirmButton);
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/currencies/bulk-restore', { ids: ['id-1'] });
    });
  });

  it('keeps Массовое редактирование disabled (label-parity placeholder)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CurrencyBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    expect(screen.getByTestId('currency-bulk-action-mass-edit')).toHaveAttribute('data-disabled');
  });

  it('renders Удалить as destructive (red text)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CurrencyBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    expect(screen.getByTestId('currency-bulk-action-delete').className).toMatch(/destructive/);
  });
});
