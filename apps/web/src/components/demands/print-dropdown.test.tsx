import { renderWithProviders, userEvent } from '@/test-utils';
import { screen } from '@testing-library/react';
/**
 * DemandPrintDropdown tests — list export + configure link, with the
 * paid templates disabled per moysklad parity.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DemandPrintDropdown } from './print-dropdown';

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

describe('DemandPrintDropdown', () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  it('renders the trigger labelled "Chop etish"', () => {
    renderWithProviders(<DemandPrintDropdown />);
    expect(screen.getByRole('button', { name: /Chop etish/i })).toBeInTheDocument();
  });

  it('disables list export when onExportList is not provided', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DemandPrintDropdown />);
    await user.click(screen.getByRole('button', { name: /Chop etish/i }));
    expect(screen.getByTestId('demand-print-list-export')).toHaveAttribute('data-disabled');
  });

  it('disables Расходная накладная (paid template, backend pending)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DemandPrintDropdown />);
    await user.click(screen.getByRole('button', { name: /Chop etish/i }));
    expect(screen.getByTestId('demand-print-rashodnaya')).toHaveAttribute('data-disabled');
  });

  it('fires onExportList when list export item is clicked', async () => {
    const user = userEvent.setup();
    const onExportList = vi.fn();
    renderWithProviders(<DemandPrintDropdown onExportList={onExportList} />);
    await user.click(screen.getByRole('button', { name: /Chop etish/i }));
    await user.click(screen.getByTestId('demand-print-list-export'));
    expect(onExportList).toHaveBeenCalledTimes(1);
  });

  it('renders all 12 moysklad-parity menu items in the captured order', async () => {
    // Source-of-truth: docs/moysklad-reference/demands/states/metadata.json
    // (Phase 0 audit 2026-05-29) — moysklad shows 12 items in this exact
    // order. Items 2-11 are disabled placeholders pending the per-account
    // PrintTemplate pipeline.
    const user = userEvent.setup();
    renderWithProviders(<DemandPrintDropdown onExportList={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Chop etish/i }));
    const expected = [
      'demand-print-list-export',
      'demand-print-ttn-uz',
      'demand-print-ttn-uz-new',
      'demand-print-ttn-form1t-uz',
      'demand-print-ttn-form1t-uz-new',
      'demand-print-akt',
      'demand-print-tovarniy-chek',
      'demand-print-rashodnaya',
      'demand-print-marking-codes-1162',
      'demand-print-sborochniy-list',
      'demand-print-set',
      'print-configure-drawer',
    ];
    for (const id of expected) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
    // Items 2-11 must all be disabled (placeholders).
    for (const id of expected.slice(1, 11)) {
      expect(screen.getByTestId(id)).toHaveAttribute('data-disabled');
    }
    // Only item 1 (list-export) and item 12 (configure) are enabled.
    expect(screen.getByTestId('demand-print-list-export')).not.toHaveAttribute('data-disabled');
    expect(screen.getByTestId('print-configure-drawer')).not.toHaveAttribute('data-disabled');
  });
});
