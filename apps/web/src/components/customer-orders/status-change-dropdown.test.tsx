import { api } from '@/lib/api-client';
import { renderWithProviders, userEvent } from '@/test-utils';
import { screen, waitFor } from '@testing-library/react';
/**
 * StatusChangeDropdown tests — verify that all 8 OrderStateSchema enum
 * values are rendered as menu items with their colored squares, and
 * that clicking an item sends bulk-transition with the correct slug.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusChangeDropdown } from './status-change-dropdown';

vi.mock('@/lib/api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue({ total: 1, succeeded: ['id-1'], failed: [] }),
  },
}));

describe('StatusChangeDropdown', () => {
  const baseProps = {
    listQueryKey: ['customer-orders'] as const,
    onClearSelection: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the trigger labelled "Holat" (uz)', () => {
    renderWithProviders(<StatusChangeDropdown {...baseProps} selectedIds={new Set(['id-1'])} />);
    expect(screen.getByRole('button', { name: /Holat/i })).toBeInTheDocument();
  });

  it('disables the trigger when no rows are selected', () => {
    renderWithProviders(<StatusChangeDropdown {...baseProps} selectedIds={new Set()} />);
    expect(screen.getByRole('button', { name: /Holat/i })).toBeDisabled();
  });

  it('renders all 8 OrderStateSchema enum values as menu items', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StatusChangeDropdown {...baseProps} selectedIds={new Set(['id-1'])} />);
    await user.click(screen.getByRole('button', { name: /Holat/i }));
    expect(screen.getByTestId('status-change-option-draft')).toBeInTheDocument();
    expect(screen.getByTestId('status-change-option-confirmed')).toBeInTheDocument();
    expect(screen.getByTestId('status-change-option-awaiting_payment')).toBeInTheDocument();
    expect(screen.getByTestId('status-change-option-paid')).toBeInTheDocument();
    expect(screen.getByTestId('status-change-option-partially_shipped')).toBeInTheDocument();
    expect(screen.getByTestId('status-change-option-fully_shipped')).toBeInTheDocument();
    expect(screen.getByTestId('status-change-option-closed')).toBeInTheDocument();
    expect(screen.getByTestId('status-change-option-cancelled')).toBeInTheDocument();
  });

  it('sends bulk-transition with the actual state slug as target', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <StatusChangeDropdown {...baseProps} selectedIds={new Set(['id-1', 'id-2'])} />,
    );
    await user.click(screen.getByRole('button', { name: /Holat/i }));
    await user.click(screen.getByTestId('status-change-option-paid'));

    // ConfirmDialog opens with the localized state label
    const confirmButton = await screen.findByRole('button', { name: /Tulanidi|To'langan/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/customer-orders/bulk-transition', {
        ids: ['id-1', 'id-2'],
        target: 'paid',
      });
    });
  });

  it('renders a colored square icon next to each state', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StatusChangeDropdown {...baseProps} selectedIds={new Set(['id-1'])} />);
    await user.click(screen.getByRole('button', { name: /Holat/i }));

    // Radix portals the popup content outside the render `container`,
    // so we query document.body. Inline `background-color` on each
    // `span[aria-hidden]` is what mirrors moysklad's `b-color-square`.
    const colorSquares = document.body.querySelectorAll(
      'span[aria-hidden="true"][style*="background-color"]',
    );
    expect(colorSquares.length).toBeGreaterThanOrEqual(8);
  });
});
