import { api } from '@/lib/api-client';
import type { SalesPlanCell, SalesPlanReport } from '@/lib/sales-plan-api';
import { renderWithProviders, screen } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SalesPlanScreen } from './sales-plan-screen';

/**
 * MK37/MK38 — sotuv rejasi ekrani (4-bo'lim TZ §6).
 *
 * 🔴 EKRAN SHARTNOMASI: uchta boshqa javob uch xil ko'rinadi —
 * «reja qo'yilmagan» ≠ «fakt o'lchanmagan» ≠ «o'lchangan nol».
 * Ularning ikkitasi «0%» bo'lib chizilsa, menejer mavjud bo'lmagan xulosaga
 * kelardi (MK09/MK12 dagi NULL≠0 bug-klassi, boshqa ekranda).
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

function cell(over: Partial<SalesPlanCell> = {}): SalesPlanCell {
  return {
    planType: 'revenue',
    unit: 'money',
    factSource: 'metrics',
    planId: null,
    targetValue: null,
    targetSource: 'none',
    currency: 'UZS',
    comparable: true,
    factValue: null,
    factComplete: false,
    contributingKeys: [],
    achievedPercent: null,
    remainingValue: null,
    expectedPercent: null,
    projectedPercent: null,
    status: 'no_plan',
    note: null,
    ...over,
  };
}

function report(over: Partial<SalesPlanReport> = {}): SalesPlanReport {
  return {
    yearMonth: '2026-08',
    currency: 'UZS',
    totalDays: 31,
    elapsedDays: 10,
    accountSalesTargetMinor: null,
    types: [
      { planType: 'revenue', unit: 'money', factSource: 'metrics' },
      { planType: 'profit', unit: 'money', factSource: 'metrics' },
      { planType: 'customer_count', unit: 'count', factSource: 'none' },
      { planType: 'collected_debt', unit: 'money', factSource: 'none' },
    ],
    rows: [{ employeeId: 'emp-1', name: 'Anna', cells: [cell()] }],
    ...over,
  };
}

function mockReport(r: SalesPlanReport) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url.startsWith('/sales-plan')) return r;
    return {};
  });
}

describe('SalesPlanScreen — 🔴 reja yo`q ≠ fakt yo`q ≠ nol', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it('reja qo`yilmagan qatorda holat «reja qo`yilmagan», foiz `—`', async () => {
    mockReport(report());
    renderWithProviders(<SalesPlanScreen />);

    const row = await screen.findByTestId('sp-row-emp-1');
    expect(row.getAttribute('data-status')).toBe('no_plan');
    expect(row.textContent).toContain('—');
    expect(row.textContent).not.toContain('0%');
  });

  it('reja bor, fakt o`lchanmagan: holat «o`lchanmagan» (0% EMAS)', async () => {
    mockReport(
      report({
        rows: [
          {
            employeeId: 'emp-1',
            name: 'Anna',
            cells: [cell({ targetValue: '100000', planId: 'p1', status: 'no_fact' })],
          },
        ],
      }),
    );
    renderWithProviders(<SalesPlanScreen />);

    const row = await screen.findByTestId('sp-row-emp-1');
    expect(row.getAttribute('data-status')).toBe('no_fact');
    expect(row.textContent).not.toContain('0%');
  });

  it('o`lchangan NOL fakt `0` bo`lib chiziladi (`—` EMAS)', async () => {
    mockReport(
      report({
        rows: [
          {
            employeeId: 'emp-1',
            name: 'Anna',
            cells: [
              cell({
                targetValue: '100000',
                planId: 'p1',
                factValue: '0',
                factComplete: true,
                achievedPercent: '0.00',
                status: 'behind',
              }),
            ],
          },
        ],
      }),
    );
    renderWithProviders(<SalesPlanScreen />);

    const row = await screen.findByTestId('sp-row-emp-1');
    expect(row.getAttribute('data-status')).toBe('behind');
    expect(row.textContent).toContain('0,00');
  });

  it('reja umumiy sozlamadan kelgani KO`RINADI (menejer o`ylab qolmasin)', async () => {
    mockReport(
      report({
        rows: [
          {
            employeeId: 'emp-1',
            name: 'Anna',
            cells: [cell({ targetValue: '100000', targetSource: 'salary_config' })],
          },
        ],
      }),
    );
    renderWithProviders(<SalesPlanScreen />);

    const row = await screen.findByTestId('sp-row-emp-1');
    // Manba yorlig'i bor va u «rejani olib tashlash» tugmasidan farq qiladi:
    // umumiy sozlamadan kelgan rejaning `planId` si yo'q.
    expect(row.textContent?.length).toBeGreaterThan(0);
    expect(screen.queryByTestId('sp-remove-emp-1')).toBeNull();
  });

  it('chala fakt bayrog`i ko`rinadi (raqamga ishonch darajasi)', async () => {
    mockReport(
      report({
        rows: [
          {
            employeeId: 'emp-1',
            name: 'Anna',
            cells: [cell({ factValue: '5000', factComplete: false })],
          },
        ],
      }),
    );
    renderWithProviders(<SalesPlanScreen />);
    const row = await screen.findByTestId('sp-row-emp-1');
    expect(row.textContent).toContain('chala');
  });
});
