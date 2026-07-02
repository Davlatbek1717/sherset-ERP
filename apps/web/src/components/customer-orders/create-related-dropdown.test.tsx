import { api } from '@/lib/api-client';
import { renderWithProviders, userEvent } from '@/test-utils';
import { screen, waitFor } from '@testing-library/react';
/**
 * CreateRelatedDropdown tests — verify the menu items mirror moysklad
 * 1:1 (7 items captured from i-dropdown-sozdat.dom.html). Отгрузка
 * pre-fills via POST /demands/from-customer-order/:id (single selection);
 * the no-backing items navigate to their /new route.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateRelatedDropdown } from './create-related-dropdown';

vi.mock('@/lib/api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue({ id: 'demand-99' }),
  },
}));

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

describe('CreateRelatedDropdown', () => {
  beforeEach(() => {
    pushMock.mockClear();
    vi.clearAllMocks();
  });

  it('renders the trigger labelled "Yaratish" (uz)', () => {
    renderWithProviders(<CreateRelatedDropdown selectedIds={new Set(['id-1'])} />);
    expect(screen.getByRole('button', { name: /Yaratish/i })).toBeInTheDocument();
  });

  it('disables the trigger when no rows are selected', () => {
    renderWithProviders(<CreateRelatedDropdown selectedIds={new Set()} />);
    expect(screen.getByRole('button', { name: /Yaratish/i })).toBeDisabled();
  });

  it('renders all 7 moysklad menu items', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateRelatedDropdown selectedIds={new Set(['id-1'])} />);
    await user.click(screen.getByRole('button', { name: /Yaratish/i }));
    expect(screen.getByTestId('create-related-purchase-order')).toBeInTheDocument();
    expect(screen.getByTestId('create-related-purchase-order-available')).toBeInTheDocument();
    expect(screen.getByTestId('create-related-picking-wave')).toBeInTheDocument();
    expect(screen.getByTestId('create-related-demand')).toBeInTheDocument();
    expect(screen.getByTestId('create-related-cash-in')).toBeInTheDocument();
    expect(screen.getByTestId('create-related-payment-in')).toBeInTheDocument();
    expect(screen.getByTestId('create-related-supply')).toBeInTheDocument();
  });

  it('pre-fills a demand via from-customer-order endpoint for a single selection', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateRelatedDropdown selectedIds={new Set(['id-1'])} />);
    await user.click(screen.getByRole('button', { name: /Yaratish/i }));
    await user.click(screen.getByTestId('create-related-demand'));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/demands/from-customer-order/id-1', {});
    });
    // Navigates to the freshly-created (pre-filled) demand, not a blank form.
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/demands/demand-99');
    });
  });

  it('disables Отгрузка for multi-selection (merge deferred)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateRelatedDropdown selectedIds={new Set(['id-1', 'id-2'])} />);
    await user.click(screen.getByRole('button', { name: /Yaratish/i }));
    expect(screen.getByTestId('create-related-demand')).toHaveAttribute('data-disabled');
    await user.click(screen.getByTestId('create-related-demand'));
    expect(api.post).not.toHaveBeenCalled();
  });

  it('navigates to /purchase-orders/new?available=1 when "with available" is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateRelatedDropdown selectedIds={new Set(['id-1'])} />);
    await user.click(screen.getByRole('button', { name: /Yaratish/i }));
    await user.click(screen.getByTestId('create-related-purchase-order-available'));
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock.mock.calls[0]?.[0]).toContain('/purchase-orders/new?available=1');
  });
});
