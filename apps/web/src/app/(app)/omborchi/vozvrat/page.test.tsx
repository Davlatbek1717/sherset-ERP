import { api } from '@/lib/api-client';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OmborchiVozvratPage from './page';

/**
 * G3 — vozvrat qabul ekrani.
 *
 * Qulflanadigan shartnoma: chek `…/acceptance/receipts` dan tanlanadi,
 * qatorlar `…/acceptance/source/:id` dan keladi, qabul
 * `POST …/acceptance/from-retail-sale/:id` ga `{positions:[{productId,
 * quantity, cellId}]}` shaklida ketadi — NARX YUBORILMAYDI (server chekdan
 * oladi; ombor xodimi narx bilan ishlamaydi). «Brak» tanlansa yacheyka BRAK
 * omborining yacheykalaridan qidiriladi. Server qoidalari (cap, hujjat
 * bo'linishi, ruxsat) api testlarida.
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const SALE_ID = '11111111-1111-4111-8111-000000000001';
const P1 = '11111111-1111-4111-8111-000000000004';
const GOOD_STORE = 'store-07';
const BRAK_STORE = 'store-brak';
const CELL_GOOD = '11111111-1111-4111-8111-000000000006';
const CELL_BRAK = '11111111-1111-4111-8111-000000000007';

const TARGETS = {
  stores: [
    { id: GOOD_STORE, name: 'Ombor 07', brak: false, posPriority: 1 },
    { id: BRAK_STORE, name: 'Brak ombori', brak: true, posPriority: null },
  ],
  defaultStoreId: GOOD_STORE,
  brakStoreId: BRAK_STORE,
};

const RECEIPTS = {
  items: [
    {
      id: SALE_ID,
      name: 'CH-00042',
      moment: '2026-08-24T09:00:00.000Z',
      sumMinor: '250000',
      state: 'posted',
      agent: { id: 'a-1', name: 'Mijoz A' },
      positionCount: 2,
    },
  ],
};

const SOURCE = {
  sale: {
    id: SALE_ID,
    name: 'CH-00042',
    moment: '2026-08-24T09:00:00.000Z',
    sumMinor: '250000',
    agent: { id: 'a-1', name: 'Mijoz A' },
  },
  lines: [
    {
      productId: P1,
      productName: 'Shurup 5mm',
      barcode: '4780000000001',
      soldQty: '5',
      posRefundedQty: '1',
      warehouseReturnedQty: '0',
      remainingQty: '4',
      priceMinor: '30000',
      discount: '0',
    },
  ],
};

const ACCEPTED_POSITION = {
  productId: P1,
  productName: 'Shurup 5mm',
  barcode: '4780000000001',
  quantity: '2',
  cellId: CELL_GOOD,
  cellName: '07-01-01-01',
};

const ACCEPTED_DOC = {
  id: 'sr-1',
  name: 'ВП-2026-00007',
  brak: false,
  state: 'posted',
  sumMinor: '60000',
  positions: [ACCEPTED_POSITION],
};

const ACCEPTED = { returns: [ACCEPTED_DOC] };

function mockGet(overrides: Record<string, unknown> = {}) {
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    for (const [needle, value] of Object.entries(overrides)) {
      if (path.includes(needle)) return value;
    }
    if (path.includes('acceptance/targets')) return TARGETS;
    if (path.includes('acceptance/receipts')) return RECEIPTS;
    if (path.includes('acceptance/source')) return SOURCE;
    if (path.includes(`stores/${BRAK_STORE}/address-storage`)) {
      return { cells: [{ id: CELL_BRAK, name: '99-01-01-01' }] };
    }
    if (path.includes('address-storage')) {
      return { cells: [{ id: CELL_GOOD, name: '07-01-01-01' }] };
    }
    throw new Error(`unexpected GET ${path}`);
  });
}

/** Chekni tanlab qatorlar ekraniga o'tadi. */
async function openReceipt(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(screen.getByText('CH-00042')).toBeInTheDocument());
  await user.click(screen.getByTestId('vozvrat-receipt-row'));
  await waitFor(() => expect(screen.getByText('Shurup 5mm')).toBeInTheDocument());
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGet();
  vi.mocked(api.post).mockResolvedValue(ACCEPTED);
});

describe('vozvrat qabuli — chek tanlash', () => {
  it('cheklar ro‘yxati ko‘rinadi va tanlansa qatorlar ochiladi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OmborchiVozvratPage />);
    await openReceipt(user);
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining(`acceptance/source/${SALE_ID}`));
  });

  it('qolgan miqdor chek raqamlari bilan ko‘rsatiladi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OmborchiVozvratPage />);
    await openReceipt(user);
    // «Qaytarish mumkin: 4 (sotilgan 5)» — kassada 1 tasi allaqachon qaytarilgan.
    expect(screen.getByText(/Qaytarish mumkin: 4/)).toBeInTheDocument();
  });

  it('chek topilmasa bo‘sh holat ko‘rinadi', async () => {
    mockGet({ 'acceptance/receipts': { items: [] } });
    renderWithProviders(<OmborchiVozvratPage />);
    await waitFor(() => expect(screen.getByText(/Chek topilmadi/)).toBeInTheDocument());
  });
});

describe('vozvrat qabuli — qabul so‘rovi', () => {
  it('son + yacheyka kiritilgach POST ketadi, NARXSIZ', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OmborchiVozvratPage />);
    await openReceipt(user);

    await user.type(screen.getByTestId('vozvrat-qty'), '2');
    await user.type(screen.getByTestId('vozvrat-cell'), '07-01-01-01');
    await waitFor(() => expect(screen.getByTestId('vozvrat-accept')).toBeEnabled());
    await user.click(screen.getByTestId('vozvrat-accept'));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith(`/sales-returns/acceptance/from-retail-sale/${SALE_ID}`, {
      positions: [{ productId: P1, quantity: '2', cellId: CELL_GOOD }],
    });
    const body = vi.mocked(api.post).mock.calls[0]?.[1] as {
      positions: Array<Record<string, unknown>>;
    };
    expect(body.positions[0]).not.toHaveProperty('priceMinor');
  });

  it('«Brak» tanlansa yacheyka BRAK omboridan qidiriladi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OmborchiVozvratPage />);
    await openReceipt(user);

    await user.type(screen.getByTestId('vozvrat-qty'), '1');
    await user.click(screen.getByTestId('vozvrat-quality-brak'));
    // Sifatli ombor yacheykasi endi TOPILMAYDI (boshqa ombor).
    await user.type(screen.getByTestId('vozvrat-cell'), '07-01-01-01');
    expect(screen.getByText('Yacheyka topilmadi')).toBeInTheDocument();

    await user.clear(screen.getByTestId('vozvrat-cell'));
    await user.type(screen.getByTestId('vozvrat-cell'), '99-01-01-01');
    await waitFor(() => expect(screen.getByTestId('vozvrat-accept')).toBeEnabled());
    await user.click(screen.getByTestId('vozvrat-accept'));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const body = vi.mocked(api.post).mock.calls[0]?.[1] as {
      positions: Array<{ cellId: string }>;
    };
    expect(body.positions[0]?.cellId).toBe(CELL_BRAK);
  });

  it('yacheykasiz qator yuborilmaydi — tugma o‘chiq', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OmborchiVozvratPage />);
    await openReceipt(user);
    await user.type(screen.getByTestId('vozvrat-qty'), '2');
    expect(screen.getByTestId('vozvrat-accept')).toBeDisabled();
  });

  it('qabuldan so‘ng YORLIQ oynasi ochiladi (shtrix + yacheyka kodi)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OmborchiVozvratPage />);
    await openReceipt(user);
    await user.type(screen.getByTestId('vozvrat-qty'), '2');
    await user.type(screen.getByTestId('vozvrat-cell'), '07-01-01-01');
    await user.click(screen.getByTestId('vozvrat-accept'));

    await waitFor(() => expect(screen.getByTestId('return-label-overlay')).toBeInTheDocument());
    expect(screen.getByTestId('return-label-barcode')).toHaveAttribute(
      'aria-label',
      '4780000000001',
    );
    expect(screen.getByTestId('return-label-cell')).toHaveAttribute('aria-label', '07-01-01-01');
  });

  it('BRAK hujjat yorlig‘ida BRAK belgisi bo‘ladi', async () => {
    vi.mocked(api.post).mockResolvedValue({
      returns: [
        {
          ...ACCEPTED_DOC,
          brak: true,
          positions: [{ ...ACCEPTED_POSITION, cellName: '99-01-01-01' }],
        },
      ],
    });
    const user = userEvent.setup();
    renderWithProviders(<OmborchiVozvratPage />);
    await openReceipt(user);
    await user.type(screen.getByTestId('vozvrat-qty'), '1');
    await user.click(screen.getByTestId('vozvrat-quality-brak'));
    await user.type(screen.getByTestId('vozvrat-cell'), '99-01-01-01');
    await user.click(screen.getByTestId('vozvrat-accept'));

    await waitFor(() => expect(screen.getByTestId('return-label-brak')).toBeInTheDocument());
  });
});

describe('vozvrat qabuli — BRAK ombori sozlanmagan', () => {
  it('«Brak» tugmasi o‘chiq va ogohlantirish ko‘rinadi', async () => {
    mockGet({ 'acceptance/targets': { ...TARGETS, brakStoreId: null } });
    const user = userEvent.setup();
    renderWithProviders(<OmborchiVozvratPage />);
    await openReceipt(user);
    expect(screen.getByTestId('vozvrat-quality-brak')).toBeDisabled();
    expect(screen.getByText(/BRAK ombori sozlanmagan/)).toBeInTheDocument();
  });
});
