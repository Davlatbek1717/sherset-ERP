import { api } from '@/lib/api-client';
import type { DataQualityPanel } from '@/lib/manager-api';
import { renderWithProviders, screen } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataQualityScreen } from './data-quality-screen';

/**
 * MK09 — ma'lumot sifati paneli (menejer KPI TZ §2.4/§0.2).
 *
 * 🔴 EKRAN SHARTNOMASI: **NULL ≠ 0**. O'lchanmagan ulush `0%` bo'lib
 * CHIZILMAYDI — nol foiz «tekshirildi, muammo yo'q» degan xotirjamlik beradi,
 * aslida esa o'lchov umuman bo'lmagan. Aynan shu aralashtirish kassa cheklarini
 * «100% marja» qilib ko'rsatgan (analitika TZ X1).
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

const PANEL = (over: Partial<DataQualityPanel> = {}): DataQualityPanel => ({
  from: '2026-07-11',
  to: '2026-08-09',
  overall: 'complete',
  metrics: [
    {
      key: 'cash_revenue',
      labelUz: 'Kassa tushumi',
      labelRu: 'Выручка кассы',
      source: 'cashier',
      level: 'complete',
      total: 30,
      measured: 30,
      partial: 0,
      coveragePercent: 100,
    },
  ],
  unsourced: [],
  cost: { receipts: 40, receiptsMissingCost: 0, missingPercent: 0, level: 'complete' },
  acceptance: {
    days: 30,
    accepted: 30,
    unaccepted: 0,
    unacceptedPercent: 0,
    byState: [{ state: 'accepted', count: 30 }],
    daysWithoutProfile: 0,
    withoutProfilePercent: 0,
  },
  ...over,
});

function mockPanel(p: DataQualityPanel) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url.startsWith('/manager/kpi/data-quality')) return p;
    return {};
  });
}

describe('DataQualityScreen — 🔴 NULL ≠ 0', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it('o`lchov bo`lmaganda ulush `0%` EMAS — «o`lchanmagan» belgisi', async () => {
    mockPanel(
      PANEL({
        overall: 'uncollected',
        cost: { receipts: 0, receiptsMissingCost: 0, missingPercent: null, level: 'uncollected' },
      }),
    );
    renderWithProviders(<DataQualityScreen />);

    const cell = await screen.findByTestId('dq-cost-percent');
    expect(cell.textContent ?? '').not.toContain('0%');
    expect(cell.textContent ?? '').toContain('—');
  });

  it('haqiqiy nol ulush 0% bo`lib ko`rinadi (belgi emas)', async () => {
    mockPanel(PANEL());
    renderWithProviders(<DataQualityScreen />);

    const cell = await screen.findByTestId('dq-cost-percent');
    expect(cell.textContent ?? '').toContain('0%');
  });

  it('tan narxsiz cheklar ulushi aynan server bergan raqam bilan chiziladi', async () => {
    mockPanel(
      PANEL({
        overall: 'partial',
        cost: { receipts: 40, receiptsMissingCost: 7, missingPercent: 17.5, level: 'partial' },
      }),
    );
    renderWithProviders(<DataQualityScreen />);

    // Ekran o'z formulasini yozmaydi — 7/40 ni qayta hisoblamaydi.
    expect((await screen.findByTestId('dq-cost-percent')).textContent ?? '').toContain('17.5%');
    expect((await screen.findByTestId('dq-cost-missing')).textContent ?? '').toContain('7');
  });

  it('qamrovi NULL bo`lgan ko`rsatkich qatorida ham `0%` chizilmaydi', async () => {
    mockPanel(
      PANEL({
        overall: 'partial',
        metrics: [
          {
            key: 'cash_gross_profit',
            labelUz: 'Kassa yalpi foydasi',
            labelRu: 'Валовая прибыль кассы',
            source: 'cashier',
            level: 'uncollected',
            total: 0,
            measured: 0,
            partial: 0,
            coveragePercent: null,
          },
        ],
      }),
    );
    renderWithProviders(<DataQualityScreen />);

    const row = await screen.findByTestId('dq-metric-cash_gross_profit');
    expect(row.textContent ?? '').not.toContain('0%');
  });
});

describe('DataQualityScreen — panel mazmuni', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it('manbasi yo`q ko`rsatkichlar ALOHIDA ro`yxatda ko`rinadi', async () => {
    mockPanel(
      PANEL({
        overall: 'partial',
        unsourced: [
          {
            key: 'custom_ustoz',
            labelUz: 'Ustoz bahosi',
            labelRu: 'Оценка наставника',
            source: 'manual',
          },
        ],
      }),
    );
    renderWithProviders(<DataQualityScreen />);

    const list = await screen.findByTestId('dq-unsourced');
    expect(list.textContent ?? '').toContain('Ustoz bahosi');
  });

  it('qabul qilinmagan kunlar ulushi ko`rinadi', async () => {
    mockPanel(
      PANEL({
        overall: 'partial',
        acceptance: {
          days: 40,
          accepted: 15,
          unaccepted: 25,
          unacceptedPercent: 62.5,
          byState: [
            { state: 'pending', count: 4 },
            { state: 'accepted', count: 15 },
          ],
          daysWithoutProfile: 3,
          withoutProfilePercent: 7.5,
        },
      }),
    );
    renderWithProviders(<DataQualityScreen />);

    expect((await screen.findByTestId('dq-unaccepted')).textContent ?? '').toContain('25');
    expect((await screen.findByTestId('dq-unaccepted-percent')).textContent ?? '').toContain(
      '62.5%',
    );
  });

  it('umumiy bayroq ko`rinadi va «to`liq» bilan aralashmaydi', async () => {
    mockPanel(PANEL({ overall: 'partial' }));
    renderWithProviders(<DataQualityScreen />);

    const badge = await screen.findByTestId('dq-overall');
    expect(badge.dataset.level).toBe('partial');
  });

  it('panel hech narsani bloklamaydi — amal tugmasi yo`q', async () => {
    mockPanel(PANEL());
    const { container } = renderWithProviders(<DataQualityScreen />);

    await screen.findByTestId('dq-overall');
    // Davr tanlashdan boshqa boshqaruv yo'q: bu ekran faqat ko'rinadi.
    const buttons = [...container.querySelectorAll('button')];
    expect(buttons.filter((b) => !b.dataset.testId?.startsWith('dq-range-'))).toHaveLength(0);
  });
});
