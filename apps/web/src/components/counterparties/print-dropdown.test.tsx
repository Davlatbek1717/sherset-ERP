import { renderWithProviders, userEvent } from '@/test-utils';
import { screen } from '@testing-library/react';
/**
 * CounterpartyPrintDropdown tests — 3 moysklad menu items in order.
 * Source-of-truth: docs/moysklad-reference/counterparties/states/metadata.json
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CounterpartyPrintDropdown } from './print-dropdown';

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

describe('CounterpartyPrintDropdown', () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  it('renders the moysklad-parity list-export items in captured order', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CounterpartyPrintDropdown onExportList={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Chop etish/i }));
    // «Настроить» removed — counterparties have no print templates; moysklad
    // manages templates from documents, not a counterparty settings page.
    const expected = ['counterparty-print-list-export', 'counterparty-print-list-export-uz'];
    for (const id of expected) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
    // All 3 items are enabled per moysklad metadata.
    for (const id of expected) {
      expect(screen.getByTestId(id)).not.toHaveAttribute('data-disabled');
    }
  });

  it('fires onExportList when generic list export item is clicked', async () => {
    const user = userEvent.setup();
    const onExportList = vi.fn();
    renderWithProviders(<CounterpartyPrintDropdown onExportList={onExportList} />);
    await user.click(screen.getByRole('button', { name: /Chop etish/i }));
    await user.click(screen.getByTestId('counterparty-print-list-export'));
    expect(onExportList).toHaveBeenCalledTimes(1);
  });
});
