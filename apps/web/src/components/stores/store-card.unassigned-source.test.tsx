/**
 * F7 (reja: docs/plans/2026-08-23-ombor-restrukturizatsiya.md) — ombor
 * kartasidagi «Joylashtirish manbai (Taqsimlanmagan hovuzi)» belgisi:
 * serverdan ko'rsatiladi, saqlashda boolean ketadi (false = belgini olib
 * tashlash — server `__unassignedSource` kalitini o'chiradi).
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
  name: 'Taqsimlanmagan',
  code: null,
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
  unassignedSource: true,
  archived: false,
  updatedAt: '2026-08-24T10:00:00Z',
};

describe('StoreCard — «Joylashtirish manbai» (F7)', () => {
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

  it("serverdagi belgini ko'rsatadi va saqlashda yuboradi", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StoreCard id={STORE_ID} />);

    const box = await screen.findByTestId('field-unassigned-source');
    await waitFor(() => expect(box).toBeChecked());

    await user.click(screen.getByTestId('store-save'));
    await waitFor(() => expect(patchMock).toHaveBeenCalled());
    const body = patchMock.mock.calls[0]?.[1] as { unassignedSource: boolean; version: number };
    expect(body.unassignedSource).toBe(true);
    expect(body.version).toBe(3);
  });

  it("o'chirilsa false ketadi — server kalitni olib tashlaydi", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StoreCard id={STORE_ID} />);

    const box = await screen.findByTestId('field-unassigned-source');
    await waitFor(() => expect(box).toBeChecked());

    await user.click(box);
    await user.click(screen.getByTestId('store-save'));
    await waitFor(() => expect(patchMock).toHaveBeenCalled());
    expect((patchMock.mock.calls[0]?.[1] as { unassignedSource: boolean }).unassignedSource).toBe(
      false,
    );
  });
});
