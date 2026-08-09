import { api } from '@/lib/api-client';
import type { EmployeeCard } from '@/lib/hr-api';
import { renderWithProviders, screen } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmployeeCard360 } from './employee-card-360';

/**
 * MK04 — xodim kartasi 360° (4M.4 · TZ §6.2).
 *
 * Menejerning haqiqiy savoli «bu odam bilan nima bo'lyapti»; javob olti xil
 * joyga tarqalgan edi. Ekran YANGI hisob QILMAYDI — serverdagi kartani
 * ko'rsatadi. Shu sababdan bu yerda faqat KO'RSATISH shartnomasi qulflanadi.
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

const CARD: EmployeeCard = {
  employee: {
    id: 'e1',
    name: 'Ali Valiyev',
    email: 'ali@example.com',
    phone: '+998901234567',
    archived: false,
    roles: ['cashier'],
    telegramBound: true,
    hiredAt: '2025-03-01T00:00:00.000Z',
  },
  kpi: { byState: { pending: 4 }, pendingTotal: 4, acceptedTotal: 20, correctionCount: 2 },
  attendance: { monthDays: 18, monthLateMinutes: 37 },
  shifts: {
    openCount: 1,
    lastOpenedAt: '2026-08-08T08:00:00.000Z',
    lastClosedAt: null,
    lastDiscrepancyMinor: null,
  },
  notes: {
    total: 0,
    talkCount: 0,
    warningCount: 0,
    praiseCount: 0,
    activeWarnings: 0,
    hasWarningPattern: false,
    lastAt: null,
    windowDays: 90,
    patternCount: 3,
    items: [],
  },
  offboarding: null,
};

function mockCard(card: EmployeeCard) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/hr/employees/e1/card') return card;
    return {};
  });
}

describe('EmployeeCard360', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it('bitta ekranda: KPI · davomat · smena · jurnal', async () => {
    mockCard(CARD);
    renderWithProviders(<EmployeeCard360 employeeId="e1" />);

    expect((await screen.findByTestId('card-kpi-pending')).textContent ?? '').toContain('4');
    expect(screen.getByTestId('card-late-minutes').textContent ?? '').toContain('37');
    expect(screen.getByTestId('card-open-shifts').textContent ?? '').toContain('1');
    expect(screen.getByTestId('note-journal')).toBeInTheDocument();
  });

  it('bo`shatish boshlanmagan bo`lsa blok umuman ko`rsatilmaydi (soxta «0» yo`q)', async () => {
    mockCard(CARD);
    renderWithProviders(<EmployeeCard360 employeeId="e1" />);

    await screen.findByTestId('card-kpi-pending');
    expect(screen.queryByTestId('card-offboarding')).toBeNull();
  });

  it('bo`shatish boshlangan bo`lsa holat ko`rinadi', async () => {
    mockCard({
      ...CARD,
      offboarding: {
        started: true,
        completedAt: null,
        doneCount: 2,
        total: 5,
        canArchive: false,
      },
    });
    renderWithProviders(<EmployeeCard360 employeeId="e1" />);

    const block = await screen.findByTestId('card-offboarding');
    expect(block.textContent ?? '').toContain('2');
    expect(block.textContent ?? '').toContain('5');
  });

  it('smena ochilmagan bo`lsa «—», 0 emas (NULL ≠ 0)', async () => {
    mockCard({
      ...CARD,
      shifts: { openCount: 0, lastOpenedAt: null, lastClosedAt: null, lastDiscrepancyMinor: null },
    });
    renderWithProviders(<EmployeeCard360 employeeId="e1" />);

    expect((await screen.findByTestId('card-last-shift')).textContent).toBe('—');
  });
});
