import { api } from '@/lib/api-client';
import { renderWithProviders, userEvent } from '@/test-utils';
import { screen, waitFor } from '@testing-library/react';
/**
 * BulkActionsDropdown tests — verify the moysklad-parity menu items
 * are rendered, the FSM gating is correct (Provedeno disabled when
 * all selected are confirmed; Snyat provedenie disabled when none
 * are confirmed), and the API target slug sent to bulk-transition is
 * the actual OrderStateSchema enum value (NOT a verb like 'confirm').
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BulkActionsDropdown } from './bulk-actions-dropdown';

vi.mock('@/lib/api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue({ total: 1, succeeded: ['id-1'], failed: [] }),
  },
}));

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe('BulkActionsDropdown', () => {
  const baseProps = {
    listQueryKey: ['customer-orders'] as const,
    onClearSelection: vi.fn(),
    confirmedCount: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    pushMock.mockClear();
  });

  it('renders the trigger labelled "O\'zgartirish" (uz)', () => {
    renderWithProviders(<BulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} />);
    expect(screen.getByRole('button', { name: /O'zgartirish/i })).toBeInTheDocument();
  });

  it('keeps the trigger enabled at 0-selection (moysklad parity), items disabled', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BulkActionsDropdown {...baseProps} selectedIds={new Set()} />);
    const trigger = screen.getByRole('button', { name: /O'zgartirish/i });
    // moysklad opens «Изменить» even with nothing selected so the user can see the
    // available actions; the items themselves stay disabled until a selection.
    expect(trigger).toBeEnabled();
    await user.click(trigger);
    expect(screen.getByTestId('bulk-action-delete')).toHaveAttribute('data-disabled');
  });

  it('opens the menu and shows all 8 moysklad items', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} />);
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    // All 8 items from i-dropdown-izmenit.dom.html are rendered.
    expect(screen.getByTestId('bulk-action-delete')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-action-copy')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-action-mass-edit')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-action-confirm')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-action-unconfirm')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-action-merge')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-action-reserve')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-action-clear-reserve')).toBeInTheDocument();
  });

  it('sends bulk-transition with target="confirmed" (NOT "confirm") when Provedeno is selected', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <BulkActionsDropdown
        {...baseProps}
        selectedIds={new Set(['id-1', 'id-2'])}
        confirmedCount={0}
      />,
    );

    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    await user.click(screen.getByTestId('bulk-action-confirm'));

    // ConfirmDialog opens — accept it.
    const confirmButton = await screen.findByRole('button', { name: 'Tasdiqlash' });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/customer-orders/bulk-transition', {
        ids: ['id-1', 'id-2'],
        target: 'confirmed', // not 'confirm' — must be the actual OrderState slug
      });
    });
  });

  it('sends bulk-transition with target="draft" (NOT "unpost") when Snyat provedenie is selected', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <BulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} confirmedCount={1} />,
    );

    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    await user.click(screen.getByTestId('bulk-action-unconfirm'));

    const confirmButton = await screen.findByRole('button', {
      name: /Tasdiqlanishni olib tashlash/i,
    });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/customer-orders/bulk-transition', {
        ids: ['id-1'],
        target: 'draft',
      });
    });
  });

  it('clones each selected order via POST :id/clone when Копировать is confirmed', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <BulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1', 'id-2'])} />,
    );

    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    await user.click(screen.getByTestId('bulk-action-copy'));

    // ConfirmDialog confirm label === bulk_actions.copy ("Nusxa olish").
    const confirmButton = await screen.findByRole('button', { name: 'Nusxa olish' });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/customer-orders/id-1/clone', {});
      expect(api.post).toHaveBeenCalledWith('/customer-orders/id-2/clone', {});
    });
  });

  it('merges via POST /merge and navigates to the new draft (≥2 rows)', async () => {
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'merged-99' });
    const user = userEvent.setup();
    renderWithProviders(
      <BulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1', 'id-2'])} />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    await user.click(screen.getByTestId('bulk-action-merge'));
    const confirmButton = await screen.findByRole('button', { name: 'Birlashtirish' });
    await user.click(confirmButton);
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/customer-orders/merge', { ids: ['id-1', 'id-2'] });
      expect(pushMock).toHaveBeenCalledWith('/customer-orders/merged-99');
    });
  });

  it("disables Объединить with a single selected row (can't merge one)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} />);
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    expect(screen.getByTestId('bulk-action-merge')).toHaveAttribute('data-disabled');
  });

  it('reserves via POST /bulk-reserve when Зарезервировать is confirmed', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <BulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1', 'id-2'])} />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    await user.click(screen.getByTestId('bulk-action-reserve'));
    const confirmButton = await screen.findByRole('button', { name: 'Bron qilish' });
    await user.click(confirmButton);
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/customer-orders/bulk-reserve', {
        ids: ['id-1', 'id-2'],
      });
    });
  });

  it('clears the reserve via POST /bulk-clear-reserve when Очистить резерв is confirmed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} />);
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    await user.click(screen.getByTestId('bulk-action-clear-reserve'));
    const confirmButton = await screen.findByRole('button', { name: 'Bronni tozalash' });
    await user.click(confirmButton);
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/customer-orders/bulk-clear-reserve', {
        ids: ['id-1'],
      });
    });
  });

  it('disables Provedeno when every selected row is already confirmed', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <BulkActionsDropdown
        {...baseProps}
        selectedIds={new Set(['id-1', 'id-2'])}
        confirmedCount={2}
      />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    expect(screen.getByTestId('bulk-action-confirm')).toHaveAttribute('data-disabled');
  });

  it('disables Snyat provedenie when no row is confirmed', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <BulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} confirmedCount={0} />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    expect(screen.getByTestId('bulk-action-unconfirm')).toHaveAttribute('data-disabled');
  });

  it('renders Удалить as destructive (red text)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} />);
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    const deleteItem = screen.getByTestId('bulk-action-delete');
    expect(deleteItem.className).toMatch(/destructive/);
  });
});
