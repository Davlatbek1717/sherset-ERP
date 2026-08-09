import { api } from '@/lib/api-client';
import type { MoneyMapBlock, MoneyMapBlockKey, MoneyMapSnapshot } from '@/lib/manager-api';
import { renderWithProviders, screen } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MoneyMapScreen } from './money-map-screen';

/**
 * MK15 — «Korxona puli qayerda» paneli (4M TZ §8.1/1).
 *
 * 🔴 EKRAN SHARTNOMASI: **«hisoblanmadi» ≠ «nol»**. O'lchanmagan blok `0 so'm`
 * bo'lib CHIZILMAYDI — `—` bo'lib chiziladi va yonida sabab turadi. Bu mavhum
 * ehtiyotkorlik emas: `OrganizationAccount.balanceMinor` ni daftar Faza 11
 * gacha umuman yozmagan, ya'ni «bankda 0 so'm» degan katak egaga jonli
 * yolg'on aytardi va u shunga qarab qaror qilardi.
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

const KEYS: MoneyMapBlockKey[] = [
  'cash',
  'bank',
  'customer_debt',
  'supplier_debt',
  'driver_cash',
  'goods_in_transit',
];

function blk(key: MoneyMapBlockKey, over: Partial<MoneyMapBlock> = {}): MoneyMapBlock {
  return {
    key,
    direction: key === 'supplier_debt' ? 'liability' : 'asset',
    source: `stub:${key}`,
    amountMinor: '100000',
    quality: 'complete',
    unconvertedByCurrency: [],
    mixedCurrency: false,
    ...over,
  };
}

function SNAP(over: Partial<MoneyMapSnapshot> = {}): MoneyMapSnapshot {
  return {
    blocks: KEYS.map((k) => blk(k)),
    summary: {
      netMinor: '400000',
      currency: 'UZS',
      quality: 'complete',
      unconvertedByCurrency: [],
    },
    ...over,
  };
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
});

describe('MoneyMapScreen — oltita blok', () => {
  it('har blok chiziladi', async () => {
    vi.mocked(api.get).mockResolvedValue(SNAP());
    renderWithProviders(<MoneyMapScreen />);
    for (const k of KEYS) {
      expect(await screen.findByTestId(`mm-block-${k}`)).toBeInTheDocument();
    }
  });

  it('har blokda uning MANBASI ko‘rinadi (raqam qayerdan kelgani)', async () => {
    vi.mocked(api.get).mockResolvedValue(SNAP());
    renderWithProviders(<MoneyMapScreen />);
    expect(await screen.findByTestId('mm-source-cash')).toHaveTextContent('stub:cash');
  });
});

describe('MoneyMapScreen — «hisoblanmadi» ≠ «nol»', () => {
  it('o‘lchanmagan blok `—` bo‘lib chiziladi, `0` EMAS', async () => {
    vi.mocked(api.get).mockResolvedValue(
      SNAP({
        blocks: KEYS.map((k) =>
          k === 'bank' ? blk(k, { amountMinor: null, quality: 'uncollected' }) : blk(k),
        ),
      }),
    );
    renderWithProviders(<MoneyMapScreen />);
    const cell = await screen.findByTestId('mm-amount-bank');
    expect(cell).toHaveTextContent('—');
    expect(cell.textContent).not.toMatch(/0/);
  });

  it('HAQIQIY nol qoldiq raqam bo‘lib chiziladi (`—` emas)', async () => {
    vi.mocked(api.get).mockResolvedValue(
      SNAP({
        blocks: KEYS.map((k) => (k === 'cash' ? blk(k, { amountMinor: '0' }) : blk(k))),
      }),
    );
    renderWithProviders(<MoneyMapScreen />);
    const cell = await screen.findByTestId('mm-amount-cash');
    expect(cell).not.toHaveTextContent('—');
    expect(cell.textContent).toMatch(/0/);
  });

  it('sof qoldiq o‘lchanmagan bo‘lsa — `—`, yarim yig‘indi EMAS', async () => {
    vi.mocked(api.get).mockResolvedValue(
      SNAP({
        blocks: KEYS.map((k) =>
          k === 'bank' ? blk(k, { amountMinor: null, quality: 'uncollected' }) : blk(k),
        ),
        summary: {
          netMinor: null,
          currency: 'UZS',
          quality: 'partial',
          unconvertedByCurrency: [],
        },
      }),
    );
    renderWithProviders(<MoneyMapScreen />);
    expect(await screen.findByTestId('mm-net')).toHaveTextContent('—');
  });
});

describe('MoneyMapScreen — kurs shartnomasi', () => {
  it('konvertatsiya qilinmagan pul alohida qatorda ko‘rinadi', async () => {
    vi.mocked(api.get).mockResolvedValue(
      SNAP({
        summary: {
          netMinor: '400000',
          currency: 'UZS',
          quality: 'partial',
          unconvertedByCurrency: [{ currency: 'USD', amountMinor: '25000' }],
        },
      }),
    );
    renderWithProviders(<MoneyMapScreen />);
    expect(await screen.findByTestId('mm-unconverted')).toHaveTextContent('USD');
  });

  it('konvertatsiya qilinmagan pul yo‘q — qator umuman chizilmaydi', async () => {
    vi.mocked(api.get).mockResolvedValue(SNAP());
    renderWithProviders(<MoneyMapScreen />);
    await screen.findByTestId('mm-block-cash');
    expect(screen.queryByTestId('mm-unconverted')).toBeNull();
  });
});

describe('MoneyMapScreen — sifat bayrog‘i', () => {
  it('umumiy bayroq ko‘rinadi', async () => {
    vi.mocked(api.get).mockResolvedValue(SNAP());
    renderWithProviders(<MoneyMapScreen />);
    expect(await screen.findByTestId('mm-overall')).toBeInTheDocument();
  });

  it('«qisman» blok bayroq bilan belgilanadi', async () => {
    vi.mocked(api.get).mockResolvedValue(
      SNAP({
        blocks: KEYS.map((k) => (k === 'cash' ? blk(k, { quality: 'partial' }) : blk(k))),
      }),
    );
    renderWithProviders(<MoneyMapScreen />);
    expect(await screen.findByTestId('mm-quality-cash')).toBeInTheDocument();
  });
});
