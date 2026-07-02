import { renderWithProviders, userEvent } from '@/test-utils';
import { screen } from '@testing-library/react';
/**
 * EnterPrintDropdown tests — assert the 4 moysklad menu items render in order.
 * Source-of-truth: docs/moysklad-reference/enters/states/metadata.json
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EnterPrintDropdown } from './print-dropdown';

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

describe('EnterPrintDropdown', () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  it('renders all 4 moysklad-parity menu items in captured order', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EnterPrintDropdown onExportList={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Chop etish/i }));
    const expected = [
      'enter-print-list-export',
      'enter-print-oprixodovanie',
      'enter-print-set',
      'print-configure-drawer',
    ];
    for (const id of expected) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
    expect(screen.getByTestId('enter-print-oprixodovanie')).toHaveAttribute('data-disabled');
    expect(screen.getByTestId('enter-print-set')).toHaveAttribute('data-disabled');
    expect(screen.getByTestId('enter-print-list-export')).not.toHaveAttribute('data-disabled');
    expect(screen.getByTestId('print-configure-drawer')).not.toHaveAttribute('data-disabled');
  });
});
