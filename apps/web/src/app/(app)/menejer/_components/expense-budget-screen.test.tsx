import { api } from '@/lib/api-client';
import type { BudgetReport, BudgetReportRow } from '@/lib/expense-budget-api';
import { renderWithProviders, screen } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpenseBudgetScreen, majorToMinor, minorToMajor } from './expense-budget-screen';

/**
 * MK12 — xarajat byudjeti ekrani (4M TZ §8).
 *
 * 🔴 EKRAN SHARTNOMASI: **reja yo'q ≠ reja 0**. Reja qo'yilmagan qatorda
 * og'ish va foiz `—` bo'lib chiziladi. «0%» yoki «100%» yozilsa menejer
 * mavjud bo'lmagan xulosaga kelardi — MK09 dagi NULL≠0 bug-klassining aynan
 * o'zi, faqat boshqa ekranda.
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

function row(over: Partial<BudgetReportRow> = {}): BudgetReportRow {
  return {
    expenseItemId: 'item-rent',
    name: 'Аренда',
    archived: false,
    budgetId: null,
    plannedMinor: null,
    planCurrency: null,
    planUnconvertible: false,
    actualMinor: '50000',
    varianceMinor: null,
    usedPercent: null,
    status: 'no_plan',
    note: null,
    ...over,
  };
}

function report(over: Partial<BudgetReport> = {}): BudgetReport {
  return {
    yearMonth: '2026-08',
    currency: 'UZS',
    warnPercent: 90,
    rows: [row()],
    totals: {
      plannedMinor: '0',
      actualMinor: '0',
      varianceMinor: '0',
      usedPercent: null,
      status: 'within',
    },
    unplannedActualMinor: '50000',
    untaggedMinor: '0',
    unconvertedByCurrency: [],
    ambiguousNames: [],
    ...over,
  };
}

function mockReport(r: BudgetReport) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url.startsWith('/expense-budget')) return r;
    if (url.startsWith('/expense-items')) return { items: [] };
    return {};
  });
}

describe('ExpenseBudgetScreen — 🔴 reja yo`q ≠ reja 0', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it('reja qo`yilmagan qatorda og`ish va foiz `—`, 0% EMAS', async () => {
    mockReport(report());
    renderWithProviders(<ExpenseBudgetScreen />);

    const tr = await screen.findByTestId('eb-row-item-rent');
    expect(tr.dataset.status).toBe('no_plan');
    const cells = tr.querySelectorAll('td');
    // 0-modda · 1-reja · 2-fakt · 3-og'ish · 4-foiz · 5-status
    expect(cells[3]?.textContent).toBe('—');
    expect(cells[4]?.textContent).toBe('—');
    expect(cells[4]?.textContent).not.toContain('0%');
    expect(cells[4]?.textContent).not.toContain('100%');
  });

  it('kursi yo`q valyutadagi reja `—` bo`lib chiziladi (0 emas)', async () => {
    mockReport(
      report({
        rows: [
          row({
            budgetId: 'b1',
            plannedMinor: null,
            planCurrency: 'USD',
            planUnconvertible: true,
          }),
        ],
      }),
    );
    renderWithProviders(<ExpenseBudgetScreen />);

    const btn = await screen.findByTestId('eb-plan-item-rent');
    expect(btn.textContent).toBe('—');
  });

  it('reja bor qatorda haqiqiy raqamlar chiziladi', async () => {
    mockReport(
      report({
        rows: [
          row({
            budgetId: 'b1',
            plannedMinor: '100000',
            planCurrency: 'UZS',
            varianceMinor: '-50000',
            usedPercent: '50.00',
            status: 'within',
          }),
        ],
      }),
    );
    renderWithProviders(<ExpenseBudgetScreen />);

    const tr = await screen.findByTestId('eb-row-item-rent');
    expect(tr.dataset.status).toBe('within');
    expect(tr.querySelectorAll('td')[4]?.textContent).toBe('50.00%');
  });
});

describe('ExpenseBudgetScreen — pul yashirilmaydi', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it('moddasiz pul alohida qatorda va tahrirlab bo`lmaydi', async () => {
    mockReport(
      report({
        rows: [row({ expenseItemId: null, name: null, actualMinor: '3300' })],
        untaggedMinor: '3300',
      }),
    );
    renderWithProviders(<ExpenseBudgetScreen />);

    const tr = await screen.findByTestId('eb-row-untagged');
    expect(tr).toBeTruthy();
    // Moddasiz qatorga reja qo'yib bo'lmaydi — u modda emas.
    expect(screen.getByTestId('eb-plan-untagged')).toBeDisabled();
  });

  it('jamdan tashqaridagi pul (rejasiz + moddasiz) ko`rsatiladi', async () => {
    mockReport(report({ unplannedActualMinor: '50000', untaggedMinor: '3300' }));
    renderWithProviders(<ExpenseBudgetScreen />);

    const outside = await screen.findByTestId('eb-outside');
    expect(outside.textContent).toContain('500');
    expect(outside.textContent).toContain('33');
  });

  it('konvertatsiya qilinmagan valyuta alohida qatorda', async () => {
    mockReport(report({ unconvertedByCurrency: [{ currency: 'USD', amountMinor: '10000' }] }));
    renderWithProviders(<ExpenseBudgetScreen />);

    expect((await screen.findByTestId('eb-unconverted')).textContent).toContain('USD');
  });
});

describe('summa konvertatsiyasi — BigInt aniqligi', () => {
  it('major → minor: butun va kasrli', () => {
    expect(majorToMinor('1000')).toBe('100000');
    expect(majorToMinor('1000.5')).toBe('100050');
    expect(majorToMinor('1000,05')).toBe('100005');
    expect(majorToMinor('1 000')).toBe('100000');
  });

  it('major → minor: yaroqsiz kiritma `null` (jimgina 0 EMAS)', () => {
    expect(majorToMinor('abc')).toBeNull();
    expect(majorToMinor('-5')).toBeNull();
    expect(majorToMinor('1.234')).toBeNull();
    expect(majorToMinor('')).toBeNull();
  });

  it('major → minor: `Number.MAX_SAFE_INTEGER` dan katta summa buzilmaydi', () => {
    expect(majorToMinor('90071992547409.93')).toBe('9007199254740993');
  });

  it('minor → major: reja yo`q = BO`SH maydon (0 emas)', () => {
    expect(minorToMajor(null)).toBe('');
    expect(minorToMajor('100000')).toBe('1000');
    expect(minorToMajor('100050')).toBe('1000.50');
    expect(minorToMajor('5')).toBe('0.05');
  });
});
