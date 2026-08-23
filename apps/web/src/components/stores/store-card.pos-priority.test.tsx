/**
 * F6 (reja: docs/plans/2026-08-23-ombor-restrukturizatsiya.md) — ombor
 * kartasidagi «Kassa prioriteti (POS)» maydoni: serverdan ko'rsatiladi,
 * saqlashda musbat butun son yoki NULL (bo'sh = kaskaddan chiqarish) ketadi.
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
  posPriority: 5,
  archived: false,
  updatedAt: '2026-08-23T10:00:00Z',
};

describe('StoreCard — «Kassa prioriteti (POS)» (F6)', () => {
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

  it('serverdagi qiymatni ko‘rsatadi va o‘zgartirilganini butun son qilib yuboradi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StoreCard id={STORE_ID} />);

    const field = await screen.findByTestId('field-pos-priority');
    await waitFor(() => expect(field).toHaveValue(5));

    await user.clear(field);
    await user.type(field, '1');
    await user.click(screen.getByTestId('store-save'));

    await waitFor(() => expect(patchMock).toHaveBeenCalled());
    const body = patchMock.mock.calls[0]?.[1] as { posPriority: number | null; version: number };
    expect(body.posPriority).toBe(1);
    expect(body.version).toBe(3);
  });

  it('bo‘sh qoldirilsa NULL ketadi — ombor kaskaddan chiqadi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StoreCard id={STORE_ID} />);

    const field = await screen.findByTestId('field-pos-priority');
    await waitFor(() => expect(field).toHaveValue(5));

    await user.clear(field);
    await user.click(screen.getByTestId('store-save'));

    await waitFor(() => expect(patchMock).toHaveBeenCalled());
    expect((patchMock.mock.calls[0]?.[1] as { posPriority: number | null }).posPriority).toBeNull();
  });
});
