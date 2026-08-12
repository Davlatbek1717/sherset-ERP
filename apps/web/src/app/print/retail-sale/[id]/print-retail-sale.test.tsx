import { api } from '@/lib/api-client';
import { renderWithProviders, screen, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PrintRetailSalePage from './page';

/**
 * F5 — chekning UCHINCHI renderer'i (brauzer, `/print/retail-sale/:id`).
 *
 * Matnli/HTML renderer'lar bilan BIR manbadan (`receiptPaymentLines`) oziqlanadi;
 * bu test aynan shuni qulflaydi — ilgari bu sahifa faqat `cashAmountMinor` va
 * `cardAmountMinor` ni chizardi, ya'ni terminal · qarz · dollar chekda umuman
 * ko'rinmasdi (xotira: «ombor cheki uch renderer»).
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 's-1' }),
  useSearchParams: () => new URLSearchParams(''),
}));

const SALE = (over: Record<string, unknown> = {}) => ({
  id: 's-1',
  name: 'CHEK-00042',
  state: 'posted',
  moment: '2026-08-11T05:30:00.000Z',
  sumMinor: '15000000',
  cashAmountMinor: '0',
  cardAmountMinor: '0',
  changeMinor: '0',
  description: null,
  agent: null,
  session: {
    cashDesk: { name: 'Asosiy kassa', currency: 'UZS' },
    cashier: { name: 'Kassir Aliyev' },
    store: { name: 'Markaziy dokon' },
    organization: {
      name: 'Sherset elektro tovarlar',
      legalTitle: 'MCHJ Demo',
      phone: '+998908769900',
    },
  },
  positions: [
    {
      id: 'pos-1',
      position: 1,
      quantity: '1',
      priceMinor: '15000000',
      discount: '0',
      sumMinor: '15000000',
      product: { id: 'p-1', name: 'Kabel', code: 'K-1', uom: 'm' },
    },
  ],
  payments: [],
  ...over,
});

beforeEach(() => {
  vi.mocked(api.get).mockReset();
});

describe('/print/retail-sale — to‘lov qatlami', () => {
  it('dollar, terminal va qarz qatorlarini chiqaradi', async () => {
    vi.mocked(api.get).mockResolvedValue(
      SALE({
        payments: [
          {
            method: 'CASH_UZS',
            amountMinor: '5000000',
            currency: 'UZS',
            rateMinor: null,
            amountBaseMinor: '5000000',
          },
          {
            method: 'CASH_USD',
            amountMinor: '1250',
            currency: 'USD',
            rateMinor: '1245027000000',
            amountBaseMinor: '15562837',
          },
          {
            method: 'TERMINAL',
            amountMinor: '3000000',
            currency: 'UZS',
            rateMinor: null,
            amountBaseMinor: '3000000',
          },
          {
            method: 'DEBT',
            amountMinor: '2000000',
            currency: 'UZS',
            rateMinor: null,
            amountBaseMinor: '2000000',
          },
        ],
      }),
    );
    renderWithProviders(<PrintRetailSalePage />);

    await waitFor(() => expect(screen.getByText('Naqd:')).toBeInTheDocument());
    expect(screen.getByText('Dollar:')).toBeInTheDocument();
    expect(screen.getByText('$12.50')).toBeInTheDocument();
    // Muzlatilgan kurs chekda ko'rinadi — mijoz nima bo'yicha hisoblanganini bilsin.
    expect(screen.getByText(/12450\.27/)).toBeInTheDocument();
    expect(screen.getByText('Terminal:')).toBeInTheDocument();
    expect(screen.getByText('Qarz:')).toBeInTheDocument();
  });

  it('eski chekda (to‘lov qatorlari yo‘q) legacy ustunlar chiziladi', async () => {
    vi.mocked(api.get).mockResolvedValue(
      SALE({ payments: [], cashAmountMinor: '8000000', cardAmountMinor: '7000000' }),
    );
    renderWithProviders(<PrintRetailSalePage />);

    await waitFor(() => expect(screen.getByText('Naqd:')).toBeInTheDocument());
    expect(screen.getByText('Karta:')).toBeInTheDocument();
    expect(screen.queryByText('Terminal:')).not.toBeInTheDocument();
  });
});

/**
 * 🔴 SHABLON QULFI (2026-08-12) — bu sahifa endi egasining namunasini
 * (`chek.png`) chizadi, ya'ni ESC/POS va Electron renderer'lari bilan
 * AYNI bloklar. Ilgari u o'zining «termal tasma» ko'rinishida edi va
 * namunadagi yarim blok (o'lchov birligi, chegirma, nomenklatura soni,
 * summa so'z bilan, huquqiy izoh) umuman yo'q edi.
 */
describe('/print/retail-sale — namuna shabloni', () => {
  it('shapka, rekvizit, jadval, jamilar va pastki bloklar chiqadi', async () => {
    vi.mocked(api.get).mockResolvedValue(SALE());
    const { container } = renderWithProviders(<PrintRetailSalePage />);

    await waitFor(() => expect(screen.getByTestId('tovar-chek')).toBeInTheDocument());
    const text = (container.textContent ?? '').replace(/\s+/g, ' ');

    // Shapka: DO'KON nomi (yuridik nom EMAS) + telefon + sarlavha + sana.
    expect(text).toContain('Sherset elektro tovarlar');
    expect(text).not.toContain('MCHJ Demo');
    expect(text).toContain('+998908769900');
    expect(text).toContain('SAVDO CHEKI');
    expect(text).toContain('CHEK-00042');
    expect(text).toContain('11.08.2026');

    // Rekvizitlar + jadval sarlavhalari.
    for (const block of [
      'Sotuvchi',
      'Xaridor',
      'Izoh',
      'Nomi',
      "O'lch. birligi",
      'Soni',
      'Narxi',
      'Summa',
    ]) {
      expect(text, `«${block}» yo'q`).toContain(block);
    }

    // Jamilar: uchalasi ham DOIM (chegirma 0 bo'lsa ham).
    expect(text).toContain("Chek bo'yicha umumiy summa");
    expect(text).toContain('Chegirma');
    expect(text).toContain('Jami summa');

    // Pastki bloklar.
    expect(text).toContain('Jami nomenklaturalar soni');
    expect(text).toContain('Raqam bilan');
    expect(text).toContain("Ushbu chek to'lovni tasdiqlovchi hujjat hisoblanadi.");
    expect(text).toContain('Rahmat, bizni tanlaganingiz uchun!');

    // Eski ko'rinishning izlari qaytib kelmasin.
    expect(text).not.toContain('Xarid uchun rahmat!');
  });
});
