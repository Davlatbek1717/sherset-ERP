import { api } from '@/lib/api-client';
import { renderWithProviders, screen } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerAssignmentScreen } from './customer-assignment-screen';

/**
 * MK38 — mijoz taqsimoti ekrani (4-bo'lim TZ §6).
 *
 * Ikki shartnoma qulflanadi:
 *   • egalik o'zgarishi TARIXI ekrandan ochiladi (jurnal ko'rinmasa, uning
 *     yozilayotganiga ishonib bo'lmaydi);
 *   • «egasiz qilish» ATAYLAB alohida tanlov — «tegmaslik» bilan
 *     aralashmaydi.
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

const LIST = {
  rows: [
    {
      id: 'cp-1',
      name: 'Romashka MChJ',
      ownerId: 'emp-1',
      ownerName: 'Anna',
      phone: '+998901112233',
      updatedAt: '2026-08-01T10:00:00.000Z',
    },
    {
      id: 'cp-2',
      name: 'Vasilek MChJ',
      ownerId: null,
      ownerName: null,
      phone: null,
      updatedAt: null,
    },
  ],
  distribution: {
    total: 2,
    unassigned: 1,
    owners: [{ ownerId: 'emp-1', name: 'Anna', count: 1 }],
  },
};

/** MK17 paneli uchun eng kichik javob (to'liq qamrov o'z faylida). */
const LOST = {
  rows: [
    {
      counterpartyId: 'cp-9',
      name: 'Lotos MChJ',
      phone: null,
      ownerId: null,
      ownerName: null,
      firstPurchaseAt: null,
      lastPurchaseAt: '2026-05-01T00:00:00.000Z',
      purchaseCount: 2,
      inactiveDays: 101,
      bucket: 'lost',
      reasonCode: null,
      reasonRaw: null,
      reasonNote: null,
      reasonAt: null,
      reasonAuthorName: null,
      releaseDue: false,
    },
  ],
  summary: {
    lostCount: 1,
    activeCount: 0,
    neverPurchasedCount: 0,
    byOwner: [{ ownerId: null, ownerName: null, lostCount: 1 }],
    byReason: [],
    unmarkedCount: 1,
    releaseDueCount: 0,
    ownershipConflict: false,
  },
  config: {
    lostDays: 60,
    lostDaysConfigured: false,
    lostSignalEnabled: true,
    ownershipReleaseDays: 90,
    lostDaysRejectReason: null,
  },
  totalCount: 1,
  truncated: false,
  generatedAt: '2026-08-10T09:00:00.000Z',
};

function mockApi(history: unknown = { counterpartyId: 'cp-1', events: [] }) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url.includes('/owner-history')) return history;
    if (url.startsWith('/manager/customers')) return LIST;
    return {};
  });
}

describe('CustomerAssignmentScreen', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    mockApi();
  });

  it('havza manzarasi ko`rinadi: jami, egasiz va xodimlar kesimi', async () => {
    renderWithProviders(<CustomerAssignmentScreen />);
    const box = await screen.findByTestId('ca-distribution');
    expect(box.textContent).toContain('2');
    expect(box.textContent).toContain('Anna');
  });

  it('egasiz mijoz `egasiz` deb belgilanadi (bo`sh katak EMAS)', async () => {
    renderWithProviders(<CustomerAssignmentScreen />);
    const row = await screen.findByTestId('ca-row-cp-2');
    expect(row.textContent).toMatch(/egasiz|без владельца/i);
  });

  it('🔴 «erkin havzaga qaytarish» ALOHIDA tanlov sifatida turadi', async () => {
    renderWithProviders(<CustomerAssignmentScreen />);
    const select = (await screen.findByTestId('ca-target-owner')) as HTMLSelectElement;
    // Bo'sh qiymatli tanlov = havzaga qaytarish; xodimlar undan keyin.
    expect(select.options[0]?.value).toBe('');
    expect([...select.options].map((o) => o.value)).toContain('emp-1');
  });

  it('hech narsa tanlanmaganda «egasini o`zgartirish» O`CHIQ', async () => {
    renderWithProviders(<CustomerAssignmentScreen />);
    const btn = (await screen.findByTestId('ca-reassign')) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('har qatordan TARIX ochish tugmasi bor', async () => {
    renderWithProviders(<CustomerAssignmentScreen />);
    expect(await screen.findByTestId('ca-history-cp-1')).not.toBeNull();
  });

  // MK17 — «yo'qolgan mijozlar» SHU ekranning ichida yashaydi (ikkinchi mijoz
  // ekrani ataylab qurilmadi). Ulanish testsiz qolsa, prop/import uzilishi
  // typecheck'dan jim o'tardi ([[documenteditor-prop-drop-bug]]).
  it('MK17 «yo`qolgan mijozlar» bo`limi shu ekrandan ochiladi', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url.startsWith('/manager/customers/lost')) return LOST;
      if (url.includes('/owner-history')) return { counterpartyId: 'cp-1', events: [] };
      return LIST;
    });
    renderWithProviders(<CustomerAssignmentScreen />);
    await userEvent.click(await screen.findByTestId('ca-tab-lost'));
    expect(await screen.findByTestId('lc-summary')).toBeTruthy();
    expect(await screen.findByTestId('lc-row-cp-9')).toBeTruthy();
  });
});
