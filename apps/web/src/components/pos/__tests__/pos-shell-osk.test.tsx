import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CustomersPanel } from '@/components/pos/customers-panel';
import { RasmiyashtirishModal } from '@/components/pos/rasmilashtirish-modal';
import { api } from '@/lib/api-client';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Qobiq ekran-klaviaturasi (OSK) bilan yashash qoidalari (2026-08-15,
 * monoblokda o'lchangan uch shikoyat):
 *
 *  1) To'lov oynasining summa maydoni HAQIQIY `<input>` bo'lib `autoFocus`
 *     olganda qobiq (`desktop/preload.js`) o'z raqam-klaviaturasini chiqarib,
 *     oynaning O'Z numpadini bosib qo'yardi → qobiqda maydon KO'RSATKICH-DIV.
 *  2) Radix Dialog `modal` rejimi `<body>`ga `pointer-events:none` qo'yadi;
 *     OSK esa AYNAN body'ga chizilgan — tugmalari bosilmay, bosish overlay'ga
 *     tushib fokus inputdan chiqib ketardi (mijoz qidiruvida harf yozib
 *     bo'lmasdi) → POS oynalari `modal={false}`.
 *  3) Qidiruv inputidagi `inputMode="tel"` OSK'ni faqat-raqam rejimga
 *     o'tkazardi — «telefon YOKI ISM» qidiruvida harf yo'q edi.
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path.startsWith('/exchange-rates/rate')) {
      return {
        date: '2026-08-14',
        currency: 'USD',
        rate: '11937.89',
        rateMinor: '1193789000000',
      };
    }
    if (path.startsWith('/counterparties')) return { items: [] };
    throw new Error(`kutilmagan so'rov: ${path}`);
  });
});

afterEach(() => {
  (window as { electronAPI?: unknown }).electronAPI = undefined;
});

describe('RasmiyashtirishModal — qobiqda summa maydoni input EMAS', () => {
  it('qobiqda `pos-amount-display` chiziladi, input yo‘q; numpad yozadi', async () => {
    (window as { electronAPI?: unknown }).electronAPI = { isSherset: true };
    const user = userEvent.setup();
    renderWithProviders(
      <RasmiyashtirishModal open onOpenChange={vi.fn()} sumMinor={100_000n} onConfirm={vi.fn()} />,
    );

    const display = await screen.findByTestId('pos-amount-display');
    expect(display).toHaveTextContent('0');
    // Haqiqiy input yo'q — fokus bo'lmaydi, qobiq OSK'si chiqmaydi.
    expect(screen.queryByPlaceholderText('0')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '5' }));
    await user.click(screen.getByRole('button', { name: '000' }));
    await waitFor(() => expect(display).toHaveTextContent('5000'));
  });

  it('brauzerda (qobiqsiz) haqiqiy input QOLADI — qurilma klaviaturasi ishlaydi', async () => {
    renderWithProviders(
      <RasmiyashtirishModal open onOpenChange={vi.fn()} sumMinor={100_000n} onConfirm={vi.fn()} />,
    );
    expect(await screen.findByPlaceholderText('0')).toBeInTheDocument();
    expect(screen.queryByTestId('pos-amount-display')).not.toBeInTheDocument();
  });

  it('🔴 modal={false} — body `pointer-events:none` OLMAYDI (OSK bosiladi)', async () => {
    renderWithProviders(
      <RasmiyashtirishModal open onOpenChange={vi.fn()} sumMinor={100_000n} onConfirm={vi.fn()} />,
    );
    await screen.findByPlaceholderText('0');
    // Radix modal rejimi buni 'none' qilardi — OSK (body farzandi) o'lardi.
    expect(document.body.style.pointerEvents).not.toBe('none');
  });
});

describe('CustomersPanel — qidiruv inputi OSK uchun matn rejimida', () => {
  it('qidiruv inputida raqam-rejim atributi YO‘Q (harf ham yoziladi)', async () => {
    renderWithProviders(
      <CustomersPanel onOpenCustomerCard={vi.fn()} onPayDebt={vi.fn()} onOpenChek={vi.fn()} />,
    );
    const input = await screen.findByTestId('pos-customers-search');
    expect(input.getAttribute('inputmode')).toBeNull();
    expect(input.getAttribute('type')).toBe('text');
  });
});

/**
 * Statik qulf: POS oynalari `modal={false}` da qoladi. Radix modal rejimga
 * qaytish OSK'ni jimgina o'ldiradi va buni hech bir jsdom-test tutmaydi
 * (pointer-events zanjiri faqat real brauzer/qobiqda ko'rinadi).
 */
describe('POS oynalari modal={false} (statik qulf)', () => {
  const POS_DIR = join(__dirname, '..');
  const FILES = [
    'rasmilashtirish-modal.tsx',
    'debt-payment-dialog.tsx',
    'cart-line-edit-modal.tsx',
    'customer-card-panel.tsx',
    'cash-out-dialog.tsx',
  ];

  for (const file of FILES) {
    it(`${file} — Dialog.Root modal={false}`, () => {
      const src = readFileSync(join(POS_DIR, file), 'utf8');
      expect(src, `${file} Radix modal rejimga qaytibdi — OSK o'ladi`).toMatch(
        /<Dialog\.Root[^>]*modal=\{false\}/s,
      );
      // Radix `Dialog.Overlay` modal={false} da UMUMAN chizilmaydi — fon
      // o'z div'imiz bo'lishi shart, aks holda orqa sahifa ochiq qolardi.
      expect(src, `${file} da Dialog.Overlay qolibdi (modal={false} da u bo'sh)`).not.toContain(
        '<Dialog.Overlay',
      );
    });
  }
});
