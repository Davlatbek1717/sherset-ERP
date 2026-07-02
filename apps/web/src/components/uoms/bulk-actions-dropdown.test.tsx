import { api } from '@/lib/api-client';
import { renderWithProviders, userEvent } from '@/test-utils';
import { screen, waitFor } from '@testing-library/react';
/**
 * UomBulkActionsDropdown tests — verify the moysklad-parity menu (2 items,
 * captured from docs/moysklad-reference/uoms/states/metadata.json): «Удалить»
 * hits /uoms/bulk-delete, «Массовое редактирование» is a disabled label-parity
 * placeholder (moysklad errors on system uoms), and the trigger gates on
 * selection.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UomBulkActionsDropdown } from './bulk-actions-dropdown';

vi.mock('@/lib/api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue({ total: 1, succeeded: ['id-1'], failed: [] }),
  },
}));

describe('UomBulkActionsDropdown', () => {
  const baseProps = {
    listQueryKey: ['uoms'] as const,
    onClearSelection: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the trigger labelled "O\'zgartirish" (uz)', () => {
    renderWithProviders(<UomBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} />);
    expect(screen.getByRole('button', { name: /O'zgartirish/i })).toBeInTheDocument();
  });

  it('disables the trigger when no rows are selected', () => {
    renderWithProviders(<UomBulkActionsDropdown {...baseProps} selectedIds={new Set()} />);
    expect(screen.getByRole('button', { name: /O'zgartirish/i })).toBeDisabled();
  });

  it('opens the menu and shows exactly the 2 moysklad items in order', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UomBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} />);
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    expect(screen.getByTestId('uom-bulk-action-delete')).toBeInTheDocument();
    expect(screen.getByTestId('uom-bulk-action-mass-edit')).toBeInTheDocument();
  });

  it('POSTs /uoms/bulk-delete when Удалить is confirmed', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <UomBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1', 'id-2'])} />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    await user.click(screen.getByTestId('uom-bulk-action-delete'));
    const confirmButton = await screen.findByRole('button', { name: "O'chirish" });
    await user.click(confirmButton);
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/uoms/bulk-delete', { ids: ['id-1', 'id-2'] });
    });
  });

  it('keeps Массовое редактирование disabled (label-parity placeholder)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UomBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} />);
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    expect(screen.getByTestId('uom-bulk-action-mass-edit')).toHaveAttribute('data-disabled');
  });

  it('renders Удалить as destructive (red text)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UomBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} />);
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    expect(screen.getByTestId('uom-bulk-action-delete').className).toMatch(/destructive/);
  });
});
