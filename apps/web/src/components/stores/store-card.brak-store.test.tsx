/**
 * G3 (reja: docs/plans/2026-08-23-omborchi-tsd-mijozlar.md) — ombor
 * kartasidagi «BRAK ombori» belgisi: serverdan ko'rsatiladi va saqlashda
 * boolean bo'lib ketadi (server `false` da `__brakStore` kalitini o'chiradi).
 *
 * Nega ombor darajasida: kassa kaskadi omborni tanlaydi (`__posPriority`),
 * ya'ni «sotilmaydigan» qilish uchun brak ALOHIDA omborda bo'lishi kerak —
 * bir ombor ichidagi «BRAK zonasi» ombor-darajadagi qoldiqni baribir sotuvga
 * ochiq qoldirardi (`sales-return-acceptance.ts` izohi).
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

const STORE_ID = 'store-1';
const DETAIL = {
  id: STORE_ID,
  version: 3,
  name: 'Brak ombori',
  code: '99',
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
  posPriority: null,
  unassignedSource: false,
  brakStore: false,
  archived: false,
  updatedAt: '2026-08-24T10:00:00Z',
};

describe('StoreCard — «BRAK ombori» (G3)', () => {
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

  it('belgilanganda `brakStore: true` yuboriladi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StoreCard id={STORE_ID} />);

    const field = await screen.findByTestId('field-brak-store');
    await waitFor(() => expect(field).toHaveAttribute('data-state', 'unchecked'));

    await user.click(field);
    await user.click(screen.getByTestId('store-save'));

    await waitFor(() => expect(patchMock).toHaveBeenCalled());
    const body = patchMock.mock.calls[0]?.[1] as { brakStore: boolean; version: number };
    expect(body.brakStore).toBe(true);
    expect(body.version).toBe(3);
  });

  it('serverdagi `true` ko‘rsatiladi va olib tashlanganda `false` ketadi', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url === `/admin/stores/${STORE_ID}`) return { ...DETAIL, brakStore: true };
      if (url.includes('/address-storage')) return { zones: [], cells: [] };
      return { items: [] };
    });
    const user = userEvent.setup();
    renderWithProviders(<StoreCard id={STORE_ID} />);

    const field = await screen.findByTestId('field-brak-store');
    await waitFor(() => expect(field).toHaveAttribute('data-state', 'checked'));

    await user.click(field);
    await user.click(screen.getByTestId('store-save'));

    await waitFor(() => expect(patchMock).toHaveBeenCalled());
    expect((patchMock.mock.calls[0]?.[1] as { brakStore: boolean }).brakStore).toBe(false);
  });
});
