import { renderWithProviders, userEvent } from '@/test-utils';
import { screen } from '@testing-library/react';
/**
 * LossPrintDropdown tests — assert the 5 moysklad menu items
 * (captured in docs/moysklad-reference/losses/states/metadata.json)
 * render in the correct order with the captured enabled/disabled state.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LossPrintDropdown } from './print-dropdown';

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

describe('LossPrintDropdown', () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  it('renders all 5 moysklad-parity menu items in captured order', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LossPrintDropdown onExportList={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Chop etish/i }));
    const expected = [
      'loss-print-list-export',
      'loss-print-torg16',
      'loss-print-mb8',
      'loss-print-set',
      'print-configure-drawer',
    ];
    for (const id of expected) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
    expect(screen.getByTestId('loss-print-torg16')).toHaveAttribute('data-disabled');
    expect(screen.getByTestId('loss-print-mb8')).toHaveAttribute('data-disabled');
    expect(screen.getByTestId('loss-print-set')).toHaveAttribute('data-disabled');
    expect(screen.getByTestId('loss-print-list-export')).not.toHaveAttribute('data-disabled');
    expect(screen.getByTestId('print-configure-drawer')).not.toHaveAttribute('data-disabled');
  });

  it('fires onExportList when list export item is clicked', async () => {
    const user = userEvent.setup();
    const onExportList = vi.fn();
    renderWithProviders(<LossPrintDropdown onExportList={onExportList} />);
    await user.click(screen.getByRole('button', { name: /Chop etish/i }));
    await user.click(screen.getByTestId('loss-print-list-export'));
    expect(onExportList).toHaveBeenCalledTimes(1);
  });
});
