import { api } from '@/lib/api-client';
import { renderWithProviders, screen } from '@/test-utils';
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
});
