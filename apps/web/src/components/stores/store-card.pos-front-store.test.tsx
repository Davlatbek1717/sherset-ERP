/**
 * G4 (reja: docs/plans/2026-08-23-omborchi-tsd-mijozlar.md, Q1-v2) — ombor
 * kartasidagi «Kassa oldidagi ombor» belgisi.
 *
 * Nega `__posPriority` yetmaydi: prioritet faqat TARTIBNI beradi, egasining
 * qoidasi esa 07 dan IKKI XIL foydalanadi — bitta yacheykasi butun miqdorni
 * qoplasa BIRINCHI (yig'ish kerak emas), bo'linishda esa ENG OXIRGI (donali
 * savdo uchun bo'shab qolmasin). Bitta raqam bu ikki xulqni ifodalay olmaydi.
 */
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StoreCard } from './store-card';

const getMock = vi.fn();
const patchMock = vi.fn();
vi.mock('@/lib/api-client', () => ({
  api: {
    get: (...args: unknown[]) => getMock(...args),
    patch: (...args: unknown[]) => patchMock(...args),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock('@/lib/auth-store', () => ({ useAuth: () => ({ user: { name: 'Tester' } }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const STORE_ID = 'store-7';
const DETAIL = {
  id: STORE_ID,
  version: 5,
  name: 'Ombor 07',
  code: '07',
  externalCode: null,
  description: null,
  address: null,
  addressFull: null,
  parentId: null,
  parent: null,
  group: null,
  owner: null,
  shared: false,
  allowNegativeStock: false,
  cellInventory: true,
  posPriority: 1,
  unassignedSource: false,
  brakStore: false,
  posFrontStore: false,
  archived: false,
  updatedAt: '2026-08-25T10:00:00Z',
};

describe('StoreCard — «Kassa oldidagi ombor» (G4)', () => {
  beforeEach(() => {
    getMock.mockReset();
    patchMock.mockReset();
    getMock.mockImplementation(async (url: string) => {
      if (url === `/admin/stores/${STORE_ID}`) return DETAIL;
      if (url.includes('/address-storage')) return { zones: [], cells: [] };
      return { items: [] };
    });
    patchMock.mockResolvedValue(DETAIL);
  });

  it('belgilanganda `posFrontStore: true` yuboriladi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StoreCard id={STORE_ID} />);

    const field = await screen.findByTestId('field-pos-front-store');
    await waitFor(() => expect(field).toHaveAttribute('data-state', 'unchecked'));

    await user.click(field);
    await user.click(screen.getByTestId('store-save'));

    await waitFor(() => expect(patchMock).toHaveBeenCalled());
    const body = patchMock.mock.calls[0]?.[1] as { posFrontStore: boolean; version: number };
    expect(body.posFrontStore).toBe(true);
    expect(body.version).toBe(5);
  });

  it('serverdagi `true` ko‘rsatiladi va olib tashlanganda `false` ketadi', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url === `/admin/stores/${STORE_ID}`) return { ...DETAIL, posFrontStore: true };
      if (url.includes('/address-storage')) return { zones: [], cells: [] };
      return { items: [] };
    });
    const user = userEvent.setup();
    renderWithProviders(<StoreCard id={STORE_ID} />);

    const field = await screen.findByTestId('field-pos-front-store');
    await waitFor(() => expect(field).toHaveAttribute('data-state', 'checked'));

    await user.click(field);
    await user.click(screen.getByTestId('store-save'));

    await waitFor(() => expect(patchMock).toHaveBeenCalled());
    expect((patchMock.mock.calls[0]?.[1] as { posFrontStore: boolean }).posFrontStore).toBe(false);
  });

  it('BRAK belgisidan MUSTAQIL (ikkalasi alohida maydon)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StoreCard id={STORE_ID} />);

    await user.click(await screen.findByTestId('field-pos-front-store'));
    await user.click(screen.getByTestId('store-save'));

    await waitFor(() => expect(patchMock).toHaveBeenCalled());
    const body = patchMock.mock.calls[0]?.[1] as { posFrontStore: boolean; brakStore: boolean };
    expect(body.posFrontStore).toBe(true);
    expect(body.brakStore).toBe(false);
  });
});
