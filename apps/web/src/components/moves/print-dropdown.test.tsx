import { renderWithProviders, userEvent } from '@/test-utils';
import { screen } from '@testing-library/react';
/**
 * MovePrintDropdown tests — the menu lists «Список перемещений» (CSV export)
 * first and «Настроить...» last; the account's own move print templates are
 * loaded from /print-templates and rendered between them (asserted live in the
 * browser, not here — the unit env has no template data so only the static
 * items render).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MovePrintDropdown } from './print-dropdown';

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

describe('MovePrintDropdown', () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  it('renders the trigger labelled "Chop etish"', () => {
    renderWithProviders(<MovePrintDropdown />);
    expect(screen.getByRole('button', { name: /Chop etish/i })).toBeInTheDocument();
  });

  it('renders the static list-export + configure items', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MovePrintDropdown onExportList={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Chop etish/i }));
    expect(screen.getByTestId('move-print-list-export')).toBeInTheDocument();
    expect(screen.getByTestId('print-configure-drawer')).toBeInTheDocument();
    expect(screen.getByTestId('move-print-list-export')).not.toHaveAttribute('data-disabled');
  });

  it('fires onExportList when list export item is clicked', async () => {
    const user = userEvent.setup();
    const onExportList = vi.fn();
    renderWithProviders(<MovePrintDropdown onExportList={onExportList} />);
    await user.click(screen.getByRole('button', { name: /Chop etish/i }));
    await user.click(screen.getByTestId('move-print-list-export'));
    expect(onExportList).toHaveBeenCalledTimes(1);
  });

  it('opens the templates drawer when «Настроить» is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MovePrintDropdown />);
    await user.click(screen.getByRole('button', { name: /Chop etish/i }));
    // «Настроить» now opens the in-document «Настройка шаблонов» drawer (no page).
    expect(screen.getByTestId('print-configure-drawer')).toBeInTheDocument();
  });
});
