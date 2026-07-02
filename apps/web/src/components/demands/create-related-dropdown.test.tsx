import { renderWithProviders, userEvent } from '@/test-utils';
import { screen } from '@testing-library/react';
/**
 * DemandCreateRelatedDropdown tests — 4 menu items per moysklad's
 * captured i-dropdown-sozdat for /demands. The 4 routes are:
 *   - /cash-in/new       — Приходные ордеры
 *   - /payments-in/new   — Входящие платежи
 *   - /invoices-out/new  — Счёт покупателю
 *   - /factures-out/new  — Счёт-фактура (disabled, no module yet)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DemandCreateRelatedDropdown } from './create-related-dropdown';

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

describe('DemandCreateRelatedDropdown', () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  it('disables the trigger when no rows are selected', () => {
    renderWithProviders(<DemandCreateRelatedDropdown selectedIds={new Set()} />);
    expect(screen.getByRole('button', { name: /Yaratish/i })).toBeDisabled();
  });

  it('renders all 4 menu items', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DemandCreateRelatedDropdown selectedIds={new Set(['id-1'])} />);
    await user.click(screen.getByRole('button', { name: /Yaratish/i }));
    expect(screen.getByTestId('demand-create-related-cash-in')).toBeInTheDocument();
    expect(screen.getByTestId('demand-create-related-payment-in')).toBeInTheDocument();
    expect(screen.getByTestId('demand-create-related-invoice-out')).toBeInTheDocument();
    expect(screen.getByTestId('demand-create-related-facture-out')).toBeInTheDocument();
  });

  it('navigates to /payments-in/new?fromDemand=<ids> when Входящие платежи is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DemandCreateRelatedDropdown selectedIds={new Set(['id-1', 'id-2'])} />);
    await user.click(screen.getByRole('button', { name: /Yaratish/i }));
    await user.click(screen.getByTestId('demand-create-related-payment-in'));
    expect(pushMock).toHaveBeenCalledTimes(1);
    const url = pushMock.mock.calls[0]?.[0] as string;
    expect(url.startsWith('/payments-in/new?fromDemand=')).toBe(true);
    expect(url).toContain('id-1');
    expect(url).toContain('id-2');
  });

  it('navigates to /invoices-out/new with the same fromDemand param', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DemandCreateRelatedDropdown selectedIds={new Set(['id-1'])} />);
    await user.click(screen.getByRole('button', { name: /Yaratish/i }));
    await user.click(screen.getByTestId('demand-create-related-invoice-out'));
    expect(pushMock).toHaveBeenCalledTimes(1);
    const url = pushMock.mock.calls[0]?.[0] as string;
    expect(url.startsWith('/invoices-out/new?fromDemand=')).toBe(true);
  });
});
