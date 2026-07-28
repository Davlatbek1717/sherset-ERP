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
  // `demand-bulk-action-mass-edit` is gated on `!onMassEdit` (0-selection falls
  // back to all listed rows) and `merge` has its own >=2-rows rule.
  it('keeps the trigger enabled at 0-selection (moysklad parity), items disabled', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DemandBulkActionsDropdown {...baseProps} selectedIds={new Set()} />);
    const trigger = screen.getByRole('button', { name: /O'zgartirish/i });
    expect(trigger).toBeEnabled();
    await user.click(trigger);
    expect(
      screen.getByTestId('demand-bulk-action-delete'),
      'demand-bulk-action-delete must stay disabled at 0-selection',
    ).toHaveAttribute('data-disabled');
    expect(
      screen.getByTestId('demand-bulk-action-copy'),
      'demand-bulk-action-copy must stay disabled at 0-selection',
    ).toHaveAttribute('data-disabled');
    expect(
      screen.getByTestId('demand-bulk-action-confirm'),
      'demand-bulk-action-confirm must stay disabled at 0-selection',
    ).toHaveAttribute('data-disabled');
    expect(
      screen.getByTestId('demand-bulk-action-unconfirm'),
      'demand-bulk-action-unconfirm must stay disabled at 0-selection',
    ).toHaveAttribute('data-disabled');
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
