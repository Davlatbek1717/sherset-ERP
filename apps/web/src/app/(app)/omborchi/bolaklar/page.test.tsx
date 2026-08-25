import { api } from '@/lib/api-client';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OmborchiBolaklarPage from './page';

/**
 * K2 — bo'lak reyestri ekrani (simlar shartnomasi).
 *
 * Qulflanadigan da'volar:
 *   * butun rulonlar GURUHLANIB ko'rinadi («250 m × 3»), bo'laklar alohida;
 *   * har o'zgarishdan keyin sverka DARHOL yangilanadi (K2/4-vazifa) —
 *     shu jumladan «tugadi» bosilganda chiqadigan FARQ;
 *   * butun rulon qo'shilganda yorliq oynasi OCHILMAYDI (K-Q3), bo'lak
 *     qo'shilganda ochiladi va unda `BLK-` kodi bo'ladi;
 *   * yorliqni skanerlash AYNAN bitta bo'lakni ochadi (7.3).
 * Hisob-mantiq api tomonda (`stock-piece-registry-core.test.ts`) qulflangan.
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ can: () => true }),
}));

const STORE = { id: 's1', name: 'Ombor 07' };
const PRODUCT = { id: 'p1', name: 'UzKabel VVG 2x2.5', code: 'VVG-25', uom: 'm' };

function registry(over: Record<string, unknown> = {}) {
  return {
    product: { ...PRODUCT, pieceTracked: true },
    store: STORE,
    cells: [{ id: 'c1', name: '07-01-01-01' }],
    view: {
      cells: [
        {
          cellId: 'c1',
          cellName: '07-01-01-01',
          stockQty: '1020',
          registryQty: '1020',
          diffQty: '0',
          status: 'ok',
          wholeGroups: [{ length: '250', count: 3, pieceIds: ['w1', 'w2', 'w3'] }],
          pieces: [
            {
              id: 'b1',
              label: 'BLK-000001',
              length: '200',
              sourcePieceId: null,
              updatedAt: '2026-08-25T00:00:00.000Z',
              violations: [],
            },
            {
              id: 'b2',
              label: 'BLK-000002',
              length: '70',
              sourcePieceId: null,
              updatedAt: '2026-08-25T00:00:00.000Z',
              violations: [],
            },
          ],
          longest: '250',
        },
      ],
      totals: {
        stockQty: '1020',
        registryQty: '1020',
        diffQty: '0',
        status: 'ok',
        activePieces: 5,
        wholeCount: 3,
        longest: '250',
      },
      invalidPieces: 0,
      scrapPieces: 0,
    },
    ...over,
  };
}

function mockGet(reg: unknown = registry(), extra?: (url: string) => unknown) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    const custom = extra?.(url);
    if (custom !== undefined) return custom;
    if (url.startsWith('/stores')) return { items: [STORE] };
    if (url.startsWith('/products?search=')) return { items: [PRODUCT] };
    if (url.startsWith('/stock-pieces?')) return reg;
    throw new Error(`kutilmagan so'rov: ${url}`);
  });
}

/** Ombor + tovar tanlash — reyestr so'rovi shundan keyin ketadi. */
async function chooseScope() {
  renderWithProviders(<OmborchiBolaklarPage />);
  // Omborlar ro'yxati kelmaguncha `<option value="s1">` yo'q va `change`
  // jimgina e'tiborsiz qolardi.
  await screen.findByRole('option', { name: 'Ombor 07' });
  fireEvent.change(screen.getByTestId('bolaklar-store'), { target: { value: 's1' } });
  fireEvent.change(screen.getByTestId('bolaklar-search'), { target: { value: 'kabel' } });
  fireEvent.click(await screen.findByText('UzKabel VVG 2x2.5'));
  await screen.findByTestId('bolaklar-totals');
}

describe('Bo`laklar reyestri ekrani', () => {
  beforeEach(() => vi.clearAllMocks());

  it('doira tanlanmaguncha ekran nima kerakligini AYTADI', async () => {
    mockGet();
    renderWithProviders(<OmborchiBolaklarPage />);
    expect(await screen.findByText('Ombor va tovarni tanlang')).toBeInTheDocument();
    expect(
      vi.mocked(api.get).mock.calls.some((c) => String(c[0]).startsWith('/stock-pieces?')),
    ).toBe(false);
  });

  it('doira tanlangach reyestr (ombor × tovar) so`raladi', async () => {
    mockGet();
    await chooseScope();
    const call = vi
      .mocked(api.get)
      .mock.calls.map((c) => String(c[0]))
      .find((u) => u.startsWith('/stock-pieces?'));
    expect(call).toContain('storeId=s1');
    expect(call).toContain('assortmentId=p1');
  });

  it('🔴 butun rulonlar GURUHLANADI, bo`laklar alohida qator (K-reja 3-bo`lim)', async () => {
    mockGet();
    await chooseScope();
    expect(screen.getByTestId('bolaklar-whole-group')).toHaveTextContent('250 m × 3');
    expect(screen.getAllByTestId('bolaklar-piece')).toHaveLength(2);
    expect(screen.getByText('BLK-000001')).toBeInTheDocument();
  });

  it('farq yo`q ⇒ ekran shuni aytadi; farq bor ⇒ QIZIL blok', async () => {
    mockGet();
    await chooseScope();
    expect(screen.getByTestId('bolaklar-no-diff')).toBeInTheDocument();
    expect(screen.queryByTestId('bolaklar-has-diff')).not.toBeInTheDocument();
  });

  it('🔴 «tugadi» bosilgach sverka DARHOL farqni ko`rsatadi (K2/4)', async () => {
    mockGet();
    const closed = registry({
      view: {
        ...registry().view,
        cells: [
          { ...registry().view.cells[0], registryQty: '820', diffQty: '-200', status: 'missing' },
        ],
        totals: {
          ...registry().view.totals,
          registryQty: '820',
          diffQty: '-200',
          status: 'missing',
        },
      },
    });
    vi.mocked(api.post).mockResolvedValue(closed as never);

    await chooseScope();
    fireEvent.click(screen.getAllByTestId('bolaklar-close')[0] as HTMLElement);

    await waitFor(() => expect(screen.getByTestId('bolaklar-has-diff')).toBeInTheDocument());
    expect(vi.mocked(api.post).mock.calls[0]?.[0]).toBe('/stock-pieces/b1/close');
    expect(screen.getByTestId('bolaklar-diff')).toHaveTextContent('-200 m');
    expect(screen.queryByTestId('bolaklar-no-diff')).not.toBeInTheDocument();
  });

  it('🔴 butun rulon qo`shilganda yorliq oynasi OCHILMAYDI (K-Q3)', async () => {
    mockGet();
    vi.mocked(api.post).mockResolvedValue({ ...registry(), labels: [] } as never);

    await chooseScope();
    fireEvent.change(screen.getByTestId('bolaklar-length'), { target: { value: '250' } });
    fireEvent.change(screen.getByTestId('bolaklar-count'), { target: { value: '3' } });
    fireEvent.click(screen.getByTestId('bolaklar-add'));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const body = vi.mocked(api.post).mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body).toMatchObject({ storeId: 's1', assortmentId: 'p1', whole: true, count: 3 });
    expect(screen.queryByTestId('piece-label-overlay')).not.toBeInTheDocument();
  });

  it('bo`lak qo`shilganda yorliq oynasi ochiladi va unda `BLK-` kodi bo`ladi', async () => {
    mockGet();
    vi.mocked(api.post).mockResolvedValue({ ...registry(), labels: ['BLK-000042'] } as never);

    await chooseScope();
    fireEvent.change(screen.getByTestId('bolaklar-kind'), { target: { value: 'piece' } });
    fireEvent.change(screen.getByTestId('bolaklar-length'), { target: { value: '70' } });
    fireEvent.click(screen.getByTestId('bolaklar-add'));

    const overlay = await screen.findByTestId('piece-label-overlay');
    expect(overlay).toHaveTextContent('BLK-000042');
    // Uzunlik yorliqdagi eng katta element — SVG matni sifatida.
    expect(screen.getByTestId('piece-label-length')).toHaveAttribute('aria-label', '70 m');
    const body = vi.mocked(api.post).mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body).toMatchObject({ whole: false, length: '70' });
  });

  it('mavjud bo`lakning yorlig`i QAYTA bosiladi (reja 5-bo`lim)', async () => {
    mockGet();
    await chooseScope();
    fireEvent.click(screen.getAllByTestId('bolaklar-print')[0] as HTMLElement);
    const overlay = await screen.findByTestId('piece-label-overlay');
    expect(overlay).toHaveTextContent('BLK-000001');
    expect(screen.getByTestId('piece-label-length')).toHaveAttribute('aria-label', '200 m');
  });

  it('uzunlik tuzatiladi (kesim yo`qotishi) — PATCH ketadi', async () => {
    mockGet();
    vi.mocked(api.patch).mockResolvedValue(registry() as never);

    await chooseScope();
    fireEvent.click(screen.getAllByTestId('bolaklar-edit')[0] as HTMLElement);
    fireEvent.change(screen.getByTestId('bolaklar-edit-input'), { target: { value: '198' } });
    fireEvent.click(screen.getByTestId('bolaklar-edit-save'));

    await waitFor(() => expect(api.patch).toHaveBeenCalled());
    expect(vi.mocked(api.patch).mock.calls[0]?.[0]).toBe('/stock-pieces/b1');
    expect(vi.mocked(api.patch).mock.calls[0]?.[1]).toEqual({ length: '198' });
  });

  it('🔴 yorliq skaneri AYNAN bitta bo`lakni ochadi (7.3)', async () => {
    mockGet(registry(), (url) =>
      url.startsWith('/stock-pieces/lookup')
        ? {
            piece: {
              id: 'b2',
              label: 'BLK-000002',
              length: '70',
              whole: false,
              status: 'active',
              storeId: 's1',
              storeName: 'Ombor 07',
              cellId: 'c1',
              cellName: '07-01-01-01',
              assortmentId: 'p1',
            },
            product: PRODUCT,
          }
        : undefined,
    );

    await chooseScope();
    fireEvent.change(screen.getByTestId('bolaklar-scan'), { target: { value: 'BLK-000002' } });
    fireEvent.click(screen.getByTestId('bolaklar-scan-btn'));

    await waitFor(() =>
      expect(
        vi.mocked(api.get).mock.calls.some((c) => String(c[0]).startsWith('/stock-pieces/lookup')),
      ).toBe(true),
    );
    const url = vi
      .mocked(api.get)
      .mock.calls.map((c) => String(c[0]))
      .find((u) => u.startsWith('/stock-pieces/lookup'));
    expect(url).toContain('code=BLK-000002');
  });

  it('bayroq O`CHIQ bo`lsa ogohlantirish va yoqish tugmasi chiqadi (K-Q9)', async () => {
    mockGet(registry({ product: { ...PRODUCT, pieceTracked: false } }));
    vi.mocked(api.post).mockResolvedValue({ id: 'p1', pieceTracked: true } as never);

    await chooseScope();
    expect(screen.getByTestId('bolaklar-flag-off')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('bolaklar-flag-on'));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(vi.mocked(api.post).mock.calls[0]?.[0]).toBe('/stock-pieces/flag');
    expect(vi.mocked(api.post).mock.calls[0]?.[1]).toEqual({
      assortmentId: 'p1',
      pieceTracked: true,
    });
  });

  it('bayroq YOQILGAN bo`lsa ogohlantirish yo`q', async () => {
    mockGet();
    await chooseScope();
    expect(screen.queryByTestId('bolaklar-flag-off')).not.toBeInTheDocument();
  });

  it('qoidani buzgan va chiqindi qatorlar JIM qolmaydi', async () => {
    mockGet(
      registry({
        view: { ...registry().view, invalidPieces: 2, scrapPieces: 1 },
      }),
    );
    await chooseScope();
    expect(screen.getByTestId('bolaklar-invalid')).toHaveTextContent('2');
    expect(screen.getByTestId('bolaklar-scrap')).toHaveTextContent('1');
  });

  it('yacheykasiz bo`g`in «Yacheykasiz» deb ko`rinadi', async () => {
    mockGet(
      registry({
        view: {
          ...registry().view,
          cells: [{ ...registry().view.cells[0], cellId: null, cellName: null }],
        },
      }),
    );
    await chooseScope();
    expect(screen.getAllByText('Yacheykasiz').length).toBeGreaterThan(0);
  });
});
