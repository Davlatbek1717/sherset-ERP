import { api } from '@/lib/api-client';
import { renderWithProviders, userEvent } from '@/test-utils';
import { screen, waitFor } from '@testing-library/react';
/**
 * DemandBulkActionsDropdown tests — verify the moysklad-parity 6 menu
 * items are rendered, FSM gating is correct (Provedeno disabled when
 * all selected are posted), and the API target slug is the verb-style
 * `'post'` / `'unpost'` (matching DemandTransitionSchema, NOT the
 * state names `'posted'` / `'draft'`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DemandBulkActionsDropdown } from './bulk-actions-dropdown';

vi.mock('@/lib/api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue({ total: 1, succeeded: ['id-1'], failed: [] }),
  },
}));

describe('DemandBulkActionsDropdown', () => {
  const baseProps = {
    listQueryKey: ['demands'] as const,
    onClearSelection: vi.fn(),
    postedCount: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disables the trigger when no rows are selected', () => {
    renderWithProviders(<DemandBulkActionsDropdown {...baseProps} selectedIds={new Set()} />);
    expect(screen.getByRole('button', { name: /O'zgartirish/i })).toBeDisabled();
  });

  it('opens the menu and shows the 6 demand-specific items', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DemandBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    expect(screen.getByTestId('demand-bulk-action-delete')).toBeInTheDocument();
    expect(screen.getByTestId('demand-bulk-action-copy')).toBeInTheDocument();
    expect(screen.getByTestId('demand-bulk-action-mass-edit')).toBeInTheDocument();
    expect(screen.getByTestId('demand-bulk-action-confirm')).toBeInTheDocument();
    expect(screen.getByTestId('demand-bulk-action-unconfirm')).toBeInTheDocument();
    expect(screen.getByTestId('demand-bulk-action-merge')).toBeInTheDocument();
    // Reserve / clear-reserve are NOT present on demand (unlike CO).
    expect(screen.queryByTestId('demand-bulk-action-reserve')).toBeNull();
  });

  it('sends bulk-transition with target="post" (verb-style, NOT "posted") when Provedeno is selected', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DemandBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} postedCount={0} />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    await user.click(screen.getByTestId('demand-bulk-action-confirm'));
    const confirmBtn = await screen.findByRole('button', { name: 'Tasdiqlash' });
    await user.click(confirmBtn);
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/demands/bulk-transition', {
        ids: ['id-1'],
        target: 'post',
      });
    });
  });

  it('sends bulk-transition with target="unpost" when Snyat-provedenie is selected', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DemandBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} postedCount={1} />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    await user.click(screen.getByTestId('demand-bulk-action-unconfirm'));
    const confirmBtn = await screen.findByRole('button', {
      name: /Tasdiqlanishni olib tashlash/i,
    });
    await user.click(confirmBtn);
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/demands/bulk-transition', {
        ids: ['id-1'],
        target: 'unpost',
      });
    });
  });

  it('disables Provedeno when every selected row is already posted', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DemandBulkActionsDropdown
        {...baseProps}
        selectedIds={new Set(['id-1', 'id-2'])}
        postedCount={2}
      />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    expect(screen.getByTestId('demand-bulk-action-confirm')).toHaveAttribute('data-disabled');
  });
});
