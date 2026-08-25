import { api } from '@/lib/api-client';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OmborchiKontrolPage from './page';

/**
 * G2 — kontrol ekrani (katta omborchi navbati).
 *
 * Qulflanadigan shartnoma: navbat `GET /retail-sales/control-queue` dan
 * o'qiladi; «To'liq» tasdiq bilan `POST …/control-approve` ga boradi;
 * «Tahrirlash»da qator o'chirish/kamaytirish `PATCH …/control-edit` ga
 * `{version, positions: QOLGANLAR}` shaklida ketadi. Server-qoidalar
 * (faqat kamaytirish, FSM, ruxsat) api testlarida — bu fayl UI simlari.
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const SALE_ID = 'sale-1';
const POS_A = '44444444-4444-4444-8444-444444444444';
const POS_B = '55555555-5555-4555-8555-555555555555';

const QUEUE = {
  items: [
    {
      id: SALE_ID,
      name: 'CH-00042',
      moment: '2026-08-24T09:00:00.000Z',
      sumMinor: '250000',
      agent: null,
      session: {
        cashDesk: { name: 'Kassa 1', currency: 'UZS' },
        cashier: { id: 'k-1', name: 'Gulnora' },
      },
      _count: { positions: 2 },
      pickingTasks: [
        { skladNo: 1, assigneeName: 'Ali', status: 'done' },
        { skladNo: 2, assigneeName: 'Vali', status: 'done' },
      ],
    },
  ],
};

const DETAIL = {
  id: SALE_ID,
  name: 'CH-00042',
  state: 'picking',
  version: 4,
  sumMinor: '250000',
  positions: [
    {
      id: POS_A,
      quantity: '5',
      priceMinor: '30000',
      sumMinor: '150000',
      product: { id: 'p1', name: 'Shurup 5mm' },
    },
    {
      id: POS_B,
      quantity: '2',
      priceMinor: '50000',
      sumMinor: '100000',
      product: { id: 'p2', name: 'Gaika 8mm' },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path.startsWith('/retail-sales/control-queue')) return QUEUE;
    if (path === `/retail-sales/${SALE_ID}`) return DETAIL;
    throw new Error(`unexpected GET ${path}`);
  });
  vi.mocked(api.post).mockResolvedValue({ id: SALE_ID, state: 'ready' });
  vi.mocked(api.patch).mockResolvedValue({ ok: true, changed: true });
});

describe('OmborchiKontrolPage — G2 kontrol ekrani', () => {
  it('navbat chiziladi: chek raqami, kassir va sklad-cheklar', async () => {
    renderWithProviders(<OmborchiKontrolPage />);
    expect(await screen.findByText('CH-00042')).toBeInTheDocument();
    expect(screen.getByText(/Gulnora/)).toBeInTheDocument();
    expect(screen.getByText(/Sklad 01/)).toBeInTheDocument();
    expect(screen.getByText(/Sklad 02/)).toBeInTheDocument();
  });

  it("navbat bo'sh — bo'sh holat xabari", async () => {
    vi.mocked(api.get).mockResolvedValue({ items: [] });
    renderWithProviders(<OmborchiKontrolPage />);
    expect(await screen.findByText(/Navbat bo'sh/)).toBeInTheDocument();
  });

  it("«To'liq» tasdiqdan so'ng control-approve'ga boradi", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OmborchiKontrolPage />);
    await user.click(await screen.findByRole('button', { name: /To'liq/ }));
    // ConfirmProvider dialogi — tasdiq tugmasi ham «To'liq» deb nomlangan.
    const dialogButtons = await screen.findAllByRole('button', { name: /To'liq/ });
    await user.click(dialogButtons[dialogButtons.length - 1] as HTMLElement);
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(`/retail-sales/${SALE_ID}/control-approve`, {}),
    );
  });

  it("tahrir: qator o'chirish + son kamaytirish → PATCH control-edit {version, qolganlar}", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OmborchiKontrolPage />);
    await user.click(await screen.findByRole('button', { name: 'Tahrirlash' }));

    // Detal yuklandi — ikkala tovar ko'rinadi.
    expect(await screen.findByText('Shurup 5mm')).toBeInTheDocument();
    expect(screen.getByText('Gaika 8mm')).toBeInTheDocument();

    // Birinchi qator sonini 5 → 2 ga tushiramiz.
    const qtyInputs = screen.getAllByRole('spinbutton');
    await user.clear(qtyInputs[0] as HTMLElement);
    await user.type(qtyInputs[0] as HTMLElement, '2');

    // Ikkinchi qatorni o'chiramiz (har qatorda o'z o'chirish tugmasi bor).
    const removeButtons = screen.getAllByTitle("Qatorni o'chirish");
    await user.click(removeButtons[1] as HTMLElement);

    await user.click(screen.getByRole('button', { name: 'Saqlash' }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(`/retail-sales/${SALE_ID}/control-edit`, {
        version: 4,
        positions: [{ id: POS_A, quantity: '2' }],
      }),
    );
  });

  /**
   * G6 — omborchi TSD'da «topolmadim» degan qatorlar kontrol kartasida
   * KO'RINISHI shart. Chek tarkibida ular HALI turibdi (omborchi chekni
   * o'zgartirmaydi), ya'ni bu belgi ko'rinmasa katta omborchi to'liq
   * bo'lmagan chekni «To'liq» deb yuborardi va mijoz yo'q tovar uchun pul
   * to'lardi.
   */
  it('G6 — yetishmovchilik kartada ko`rinadi (miqdor va izoh bilan)', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path.startsWith('/retail-sales/control-queue')) {
        return {
          items: [
            {
              ...QUEUE.items[0],
              shortages: [
                {
                  productName: 'Shurup 5mm',
                  quantity: '5',
                  shortageQty: '2',
                  note: 'javon bo`sh',
                },
              ],
            },
          ],
        };
      }
      if (path === `/retail-sales/${SALE_ID}`) return DETAIL;
      throw new Error(`unexpected GET ${path}`);
    });

    renderWithProviders(<OmborchiKontrolPage />);
    expect(await screen.findByText('Omborchi topolmadi')).toBeInTheDocument();
    expect(screen.getByText(/Shurup 5mm: 2 ta yetmadi \(5 tadan\)/)).toBeInTheDocument();
    expect(screen.getByText(/kamaytiring yoki o'chiring/)).toBeInTheDocument();
  });

  it('yetishmovchilik yo`q bo`lsa blok umuman chiqmaydi', async () => {
    renderWithProviders(<OmborchiKontrolPage />);
    await screen.findByText('CH-00042');
    expect(screen.queryByText('Omborchi topolmadi')).not.toBeInTheDocument();
  });

  it("hamma qator o'chirilsa Saqlash o'chadi (bo'sh chek yuborilmaydi)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OmborchiKontrolPage />);
    await user.click(await screen.findByRole('button', { name: 'Tahrirlash' }));
    await screen.findByText('Shurup 5mm');

    for (const btn of screen.getAllByTitle("Qatorni o'chirish")) {
      await user.click(btn);
    }
    expect(screen.getByRole('button', { name: 'Saqlash' })).toBeDisabled();
    expect(screen.getByText(/kamida bitta tovar/)).toBeInTheDocument();
  });
});
