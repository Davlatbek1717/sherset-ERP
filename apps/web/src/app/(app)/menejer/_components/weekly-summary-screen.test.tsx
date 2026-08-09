import { api } from '@/lib/api-client';
import type { OwnerWeeklySummary } from '@/lib/manager-api';
import { renderWithProviders, screen } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WeeklySummaryScreen } from './weekly-summary-screen';

/**
 * MK04 — egaga haftalik xulosa ekrani (M-Q7 · TZ §7).
 *
 * REGRESSIYA QULFI: «yo'qdan kiritilgan» tuzatma (`noBaselineCount`) sof
 * modulda hisoblanardi, lekin HTTP javobida yo'q edi — ekranda jami DOIM 0
 * chiqardi. «500 000 ni 440 000 ga tuzatdi» bilan «hech narsa yo'q edi,
 * 500 000 yozdi» — nazorat uchun boshqa-boshqa ish, ular ajratilishi SHART.
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

const SUMMARY = (over: Partial<OwnerWeeklySummary> = {}): OwnerWeeklySummary => ({
  weekStart: '2026-08-03T00:00:00.000Z',
  weekEndExclusive: '2026-08-10T00:00:00.000Z',
  totalAccepted: 12,
  totalAdjust: 0,
  totalAdjustedAbsMinor: '0',
  totalForceAccepted: 0,
  totalNoBaseline: 0,
  pendingDays: 0,
  staleDays: 0,
  topAdjuster: null,
  activity: [],
  ...over,
});

const MANAGER = {
  managerId: 'm1',
  managerName: 'Menejer Bir',
  acceptedCount: 12,
  rejectedCount: 1,
  adjustCount: 5,
  adjustedAbsMinor: '300000',
  noBaselineCount: 2,
  forceAcceptedCount: 1,
};

function mockSummary(s: OwnerWeeklySummary) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url.startsWith('/manager/kpi/weekly-summary')) return s;
    return {};
  });
}

describe('WeeklySummaryScreen — egaga haftalik xulosa', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it('«yo`qdan kiritilgan» tuzatma ALOHIDA sanaladi', async () => {
    mockSummary(
      SUMMARY({
        totalAdjust: 5,
        totalAdjustedAbsMinor: '300000',
        totalNoBaseline: 2,
        topAdjuster: MANAGER,
        activity: [MANAGER],
      }),
    );
    renderWithProviders(<WeeklySummaryScreen />);

    const tile = await screen.findByTestId('weekly-no-baseline');
    expect(tile.textContent ?? '').toContain('2');
    // Jami tuzatma bilan aralashib ketmasin.
    expect((await screen.findByTestId('weekly-adjust-total')).textContent ?? '').toContain('5');
  });

  it('menejer qatorida ham «yo`qdan kiritilgan» ko`rinadi', async () => {
    mockSummary(SUMMARY({ totalAdjust: 5, totalNoBaseline: 2, activity: [MANAGER] }));
    renderWithProviders(<WeeklySummaryScreen />);

    const row = await screen.findByTestId('weekly-row-m1');
    expect(row.textContent ?? '').toContain('Menejer Bir');
    expect(screen.getByTestId('weekly-row-no-baseline-m1').textContent ?? '').toContain('2');
  });

  it('tuzatma bo`lmagan hafta — «tuzatma yo`q», jim sukunat EMAS', async () => {
    mockSummary(SUMMARY());
    renderWithProviders(<WeeklySummaryScreen />);

    expect(await screen.findByTestId('weekly-no-adjust')).toBeInTheDocument();
  });

  it('majburiy yopilgan kunlar alohida ko`rinadi (eng kuchli amal)', async () => {
    mockSummary(SUMMARY({ totalForceAccepted: 3, activity: [MANAGER] }));
    renderWithProviders(<WeeklySummaryScreen />);

    expect((await screen.findByTestId('weekly-force-accepted')).textContent ?? '').toContain('3');
  });

  it('bu ekran hech narsani bloklamaydi — faqat ko`rsatadi (amal tugmasi yo`q)', async () => {
    mockSummary(SUMMARY({ totalAdjust: 5, totalNoBaseline: 2, activity: [MANAGER] }));
    const { container } = renderWithProviders(<WeeklySummaryScreen />);

    await screen.findByTestId('weekly-row-m1');
    // §7: xulosa faqat ko'rinadi. Hafta tanlashdan boshqa boshqaruv yo'q.
    const buttons = [...container.querySelectorAll('button')];
    expect(buttons.filter((b) => !b.dataset.testId?.startsWith('weekly-week-'))).toHaveLength(0);
  });
});
