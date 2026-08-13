/**
 * F2 — savat qatori tahrir oynasi (sensorli monoblok).
 *
 * MUAMMO (jonli o'lchangan, 2026-08-11): savat qatoridagi −/+ tugmalar
 * 24×24px, narx maydoni 96px. 12 dona tovar = 12 marta bosish, sonni
 * to'g'ridan-to'g'ri kiritib bo'lmaydi.
 *
 * Bu yerda QULFLANADIGAN xulq — oynaning **shartnomalari**, chizilishi emas:
 *
 *  🔴 miqdor SATR bo'lib qoladi (`Decimal(20,6)`) — `BigInt(1.5)` RangeError
 *     otib butun POS ni oq ekranga aylantirardi (F8 audit sabog'i);
 *  🔴 narx BO'SH/BUZUQ qoldirilsa ESKI narx JIMGINA KETMAYDI (K-3 shartnomasi:
 *     ko'ringan narsa = yuboriladigan narsa). P12 dan keyin bunday qator
 *     umuman saqlanmaydi — 0 narx taqiqlangan, ya'ni shartnoma kuchaydi;
 *  🔴 soni 0 ga tushsa qator O'CHADI (savatdagi ± bilan bir xil xulq);
 *  🔴 zakazga bog'langan (qulflangan) savatda oyna FAQAT KO'RISH —
 *     `payingOrderId` qulfi kassa tomonidan chetlab o'tilmasin;
 *  · narx tasmasi (ZARAR / optomdan past / «tushirildi») oynada JONLI —
 *    kassir narxni oynada tushiradi, ogohlantirish esa savatda qolib
 *    ketmasin.
 */

import { CartLineEditModal, type CartLineEditTarget } from '@/components/pos/cart-line-edit-modal';
import { renderWithProviders, screen, userEvent, within } from '@/test-utils';
import { describe, expect, it, vi } from 'vitest';

/** `formatMoney` ru-RU uzilmas bo'shlig'ini oddiy probelga keltiradi. */
function norm(text: string | null | undefined): string {
  return (text ?? '').replace(/[   ]/g, ' ');
}

/** Kartochka: sotuv 10 000, optom chegara 8 000, tan narx 6 000 (so'mda). */
const LINE: CartLineEditTarget = {
  productId: 'p-1',
  productName: 'Kabel 2×2.5',
  quantity: '2',
  priceStr: '10000',
  priceMinor: 1_000_000n,
  costMinor: 600_000n,
  wholesaleMinor: 800_000n,
  basePriceMinor: 1_000_000n,
  availableStock: 12,
};

function open(over: Partial<typeof LINE> = {}, props: { readOnly?: boolean } = {}) {
  const onSave = vi.fn();
  const onRemove = vi.fn();
  const onClose = vi.fn();
  renderWithProviders(
    <CartLineEditModal
      line={{ ...LINE, ...over }}
      onSave={onSave}
      onRemove={onRemove}
      onClose={onClose}
      {...props}
    />,
  );
  return { onSave, onRemove, onClose };
}

/** Numpad tugmasini bosadi (oyna ichidan — sahifada boshqa raqamlar bo'lishi mumkin). */
async function tap(user: ReturnType<typeof userEvent.setup>, ...keys: string[]) {
  const pad = screen.getByTestId('pos-line-edit');
  for (const k of keys) await user.click(within(pad).getByRole('button', { name: k }));
}

describe('Savat qatori tahrir oynasi — ochilish', () => {
  it('joriy soni, narxi va qator jamisini ko‘rsatadi', async () => {
    open();

    expect(screen.getByTestId('pos-line-edit')).toHaveTextContent('Kabel 2×2.5');
    expect(norm(screen.getByTestId('pos-line-edit-qty').textContent)).toContain('2');
    expect(norm(screen.getByTestId('pos-line-edit-price').textContent)).toContain('10 000,00');
    // 2 × 10 000 = 20 000
    expect(norm(screen.getByTestId('pos-line-edit-total').textContent)).toContain('20 000,00');
  });

  it('qator YO‘Q bo‘lsa (line=null) hech narsa chizmaydi', () => {
    renderWithProviders(
      <CartLineEditModal line={null} onSave={vi.fn()} onRemove={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.queryByTestId('pos-line-edit')).not.toBeInTheDocument();
  });

  it('ochilganda faol maydon — SONI (asosiy og‘riq nuqtasi)', async () => {
    const user = userEvent.setup();
    const { onSave } = open();

    await tap(user, '7');
    await user.click(screen.getByTestId('pos-line-edit-save'));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: '7', priceStr: '10000' }),
    );
  });
});

describe('Savat qatori tahrir oynasi — numpad', () => {
  it('BIRINCHI bosish maydonni almashtiradi, keyingilari qo‘shiladi', async () => {
    const user = userEvent.setup();
    const { onSave } = open();

    // Joriy soni «2». Birinchi «5» uni almashtiradi (25 EMAS), keyin «0» qo'shiladi.
    await tap(user, '5', '0');
    await user.click(screen.getByTestId('pos-line-edit-save'));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ quantity: '50' }));
  });

  it('kasr miqdor kiritiladi (1.5 kg) va ikkinchi nuqta E‘TIBORSIZ qoladi', async () => {
    const user = userEvent.setup();
    const { onSave } = open();

    await tap(user, '1', '.', '.', '5');
    await user.click(screen.getByTestId('pos-line-edit-save'));

    // 🔴 SATR bo'lib ketadi — `BigInt(1.5)` RangeError otardi (F8 audit).
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ quantity: '1.5' }));
  });

  it('⌫ oxirgi belgini o‘chiradi (almashtirish rejimini ham uzadi)', async () => {
    const user = userEvent.setup();
    const { onSave } = open({ quantity: '12' });

    await tap(user, '⌫');
    await user.click(screen.getByTestId('pos-line-edit-save'));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ quantity: '1' }));
  });

  it('narx maydoniga o‘tib yangi narx kiritiladi (tiyinda)', async () => {
    const user = userEvent.setup();
    const { onSave } = open();

    await user.click(screen.getByTestId('pos-line-edit-price'));
    await tap(user, '9', '0', '0', '0');
    await user.click(screen.getByTestId('pos-line-edit-save'));

    expect(onSave).toHaveBeenCalledWith({
      quantity: '2',
      priceStr: '9000',
      priceMinor: 900_000n,
    });
  });
});

describe('Savat qatori tahrir oynasi — shartnomalar', () => {
  it('🔴 narx BO‘SHATILSA saqlanmaydi va eski narx JIMGINA ketmaydi (K-3 + P12)', async () => {
    const user = userEvent.setup();
    const { onSave } = open();

    await user.click(screen.getByTestId('pos-line-edit-price'));
    await tap(user, '⌫', '⌫', '⌫', '⌫', '⌫');
    await user.click(screen.getByTestId('pos-line-edit-save'));

    // Ilgari bu yerda `0n` SAQLANARDI (K-3: ko'ringan narsa yuboriladi).
    // P12 dan keyin 0 narx umuman qabul qilinmaydi — muhimi o'zgarmadi:
    // 10 000 so'mlik ESKI narx jimgina yuborilmaydi.
    expect(onSave).not.toHaveBeenCalled();
  });

  it('🔴 narxga BUZUQ kiritma (12abc) — 0n bo‘lib qoladi va saqlanmaydi', async () => {
    const user = userEvent.setup();
    const { onSave } = open();

    await user.click(screen.getByTestId('pos-line-edit-price'));
    const input = screen.getByTestId('pos-line-edit-input');
    await user.clear(input);
    await user.type(input, '12abc');
    await user.click(screen.getByTestId('pos-line-edit-save'));

    // «12abc» → 12 so'm deb JIMGINA o'qilmaydi (parse 0n beradi), 0 narx esa
    // saqlanmaydi.
    expect(onSave).not.toHaveBeenCalled();
  });

  it('🔴 P12 — poli YO‘Q tovarda ham 0 narx saqlanmaydi (0-narx taqiqi)', async () => {
    const user = userEvent.setup();
    // Tan narx NULL ⇒ pol yo'q; taqiq baribir kuchda (server ham rad etadi).
    const { onSave } = open({ costMinor: null, basePriceMinor: null });

    await user.click(screen.getByTestId('pos-line-edit-price'));
    await tap(user, '⌫', '⌫', '⌫', '⌫', '⌫');
    await user.click(screen.getByTestId('pos-line-edit-save'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('pos-line-edit-no-price')).toBeInTheDocument();
  });

  it('🔴 soni 0 ga tushsa «Saqlash» qatorni O‘CHIRADI', async () => {
    const user = userEvent.setup();
    const { onSave, onRemove } = open();

    await tap(user, '0');
    await user.click(screen.getByTestId('pos-line-edit-save'));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('«O‘chirish» qatorni o‘chiradi va saqlamaydi', async () => {
    const user = userEvent.setup();
    const { onSave, onRemove } = open();

    await user.click(screen.getByTestId('pos-line-edit-remove'));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('«Yopish» o‘zgarishni SAQLAMAYDI', async () => {
    const user = userEvent.setup();
    const { onSave, onClose } = open();

    await tap(user, '9');
    await user.click(screen.getByTestId('pos-line-edit-close'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('Savat qatori tahrir oynasi — narx tasmalari JONLI', () => {
  it('kartochka narxida tasma `ok`, ogohlantirish yo‘q', () => {
    open();
    expect(screen.getByTestId('pos-line-edit')).toHaveAttribute('data-price-band', 'ok');
    expect(screen.queryByTestId('pos-line-edit-loss')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pos-line-edit-markdown')).not.toBeInTheDocument();
  });

  it('optomdan past narx — sariq tasma QOLADI (optom ≥ tan: bu oraliqda sotish mumkin)', async () => {
    const user = userEvent.setup();
    open();

    await user.click(screen.getByTestId('pos-line-edit-price'));
    await tap(user, '7', '0', '0', '0');

    expect(screen.getByTestId('pos-line-edit')).toHaveAttribute(
      'data-price-band',
      'below-wholesale',
    );
    // P12: «−6 000 tushirildi» summasi endi KO'RSATILMAYDI (egasining qarori) —
    // o'rnida pastki chegara turadi. P03 (2026-08-13): chegara qiymati ham
    // sukutda yashirin — ko'rish uchun «•••» bosiladi.
    expect(screen.queryByTestId('pos-line-edit-markdown')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('pos-line-edit-floor-toggle'));
    expect(norm(screen.getByTestId('pos-line-edit-floor').textContent)).toContain('6 000,00');
  });

  it('🔴 P12 — poldan past narxda ZARAR tasmasi ko‘rsatilmaydi (egasining qarori)', async () => {
    const user = userEvent.setup();
    open();

    await user.click(screen.getByTestId('pos-line-edit-price'));
    await tap(user, '5', '0', '0', '0');

    // Tasma qizil qoladi (kassir ko'radi), lekin «ZARAR −X tushirildi» yozuvi
    // YO'Q: egasi o'rniga faqat pastki chegarani ko'rsatishga qaror qildi.
    expect(screen.getByTestId('pos-line-edit')).toHaveAttribute('data-price-band', 'loss');
    expect(screen.queryByTestId('pos-line-edit-loss')).not.toBeInTheDocument();
  });

  it('jami summa soni bilan JONLI o‘zgaradi', async () => {
    const user = userEvent.setup();
    open();

    await tap(user, '3');
    expect(norm(screen.getByTestId('pos-line-edit-total').textContent)).toContain('30 000,00');
  });
});

/**
 * P12 — NARX POLI (egasining qarori, 2026-08-11/12).
 *
 * Oynada ZARAR belgisi o'rniga **«Minimal»** qatori turadi va poldan past
 * narxni **saqlab bo'lmaydi** — bu ogohlantirish emas, QULF. Pol = min(tan narx,
 * karta chakana narxi); tan narx NULL bo'lsa pol YO'Q (NULL ≠ 0).
 *
 * P03 (2026-08-13, egasi): pol QIYMATI sukutda YASHIRIN — o'rnida bosiladigan
 * «Minimal: •••» turadi, bosilganda ochiladi, boshqa qator ochilsa yana
 * yashirinadi. Eski «Minimal: X doim ochiq» niyati (2026-08-11/12) shu kuni
 * toraytirildi: qiymat mijoz ko'zi oldida ochiq turmasin. QULF esa o'zgarmadi —
 * yashirish faqat KO'RSATISH.
 *
 * Ekran qulfi himoyaning FAQAT ko'rinadigan qismi — haqiqiy chegara serverda
 * (`price-policy-guard.ts`). Ikkalasi bitta manbadan (`@moysklad/money`) o'qiydi.
 */
describe('Savat qatori tahrir oynasi — narx POLI (P12) va yashirin «Minimal» (P03)', () => {
  it('P03 (2026-08-13) — «Minimal» sukutda YASHIRIN, o‘rnida «•••» tugmasi turadi', () => {
    open();
    expect(screen.queryByTestId('pos-line-edit-floor')).not.toBeInTheDocument();
    expect(screen.getByTestId('pos-line-edit-floor-toggle')).toBeInTheDocument();
  });

  it('P03 — «•••» bosilganda pol qiymati OCHILADI (tan narx = pol)', async () => {
    const user = userEvent.setup();
    open();

    await user.click(screen.getByTestId('pos-line-edit-floor-toggle'));

    expect(norm(screen.getByTestId('pos-line-edit-floor').textContent)).toContain('6 000,00');
    expect(screen.queryByTestId('pos-line-edit-floor-toggle')).not.toBeInTheDocument();
  });

  it('P03 — BOSHQA qator ochilsa pol YANA yashirinadi', async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(
      <CartLineEditModal line={LINE} onSave={vi.fn()} onRemove={vi.fn()} onClose={vi.fn()} />,
    );
    await user.click(screen.getByTestId('pos-line-edit-floor-toggle'));
    expect(screen.getByTestId('pos-line-edit-floor')).toBeInTheDocument();

    rerender(
      <CartLineEditModal
        line={{ ...LINE, productId: 'p-2', productName: 'Rozetka' }}
        onSave={vi.fn()}
        onRemove={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('pos-line-edit-floor')).not.toBeInTheDocument();
    expect(screen.getByTestId('pos-line-edit-floor-toggle')).toBeInTheDocument();
  });

  it('tan narx YO‘Q bo‘lsa pol qatori UMUMAN chizilmaydi — «•••» ham (NULL ≠ 0)', () => {
    open({ costMinor: null });
    expect(screen.queryByTestId('pos-line-edit-floor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pos-line-edit-floor-toggle')).not.toBeInTheDocument();
  });

  it('karta narxi tan narxdan past bo‘lsa pol = karta narxi (46 tovar holati)', async () => {
    const user = userEvent.setup();
    // Prod: chakana 3 500 < tan 24 500 ⇒ karta narxida sotish mumkin bo'lib qoladi.
    open({
      costMinor: 2_450_000n,
      basePriceMinor: 350_000n,
      priceMinor: 350_000n,
      priceStr: '3500',
    });
    await user.click(screen.getByTestId('pos-line-edit-floor-toggle'));
    expect(norm(screen.getByTestId('pos-line-edit-floor').textContent)).toContain('3 500,00');
    expect(screen.queryByTestId('pos-line-edit-floor-blocked')).not.toBeInTheDocument();
  });

  it('🔴 poldan past narx SAQLANMAYDI — pol YASHIRIN holatda ham (P03: qulf ≠ ko‘rsatish)', async () => {
    const user = userEvent.setup();
    const { onSave } = open();

    await user.click(screen.getByTestId('pos-line-edit-price'));
    await tap(user, '5', '9', '9', '9'); // 5 999 < pol 6 000
    await user.click(screen.getByTestId('pos-line-edit-save'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('pos-line-edit-floor-blocked')).toBeInTheDocument();
    // Qiymat ochilmagan — qulf baribir ishladi.
    expect(screen.queryByTestId('pos-line-edit-floor')).not.toBeInTheDocument();
  });

  it('polga TENG narx saqlanadi — pol o‘zi ruxsat etilgan', async () => {
    const user = userEvent.setup();
    const { onSave } = open();

    await user.click(screen.getByTestId('pos-line-edit-price'));
    await tap(user, '6', '0', '0', '0');
    await user.click(screen.getByTestId('pos-line-edit-save'));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ priceMinor: 600_000n }));
  });

  it('poldan past narxda ham soni 0 bo‘lsa qator O‘CHADI — chiqish yo‘li berkilmaydi', async () => {
    const user = userEvent.setup();
    const { onRemove } = open({ priceMinor: 100_000n, priceStr: '1000' });

    await tap(user, '0'); // soni = 0
    await user.click(screen.getByTestId('pos-line-edit-save'));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});

describe('Savat qatori tahrir oynasi — qulflangan savat (zakaz)', () => {
  it('🔴 faqat ko‘rish: Saqlash, O‘chirish va numpad YO‘Q', () => {
    open({}, { readOnly: true });

    expect(screen.getByTestId('pos-line-edit-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('pos-line-edit-save')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pos-line-edit-remove')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pos-line-edit-input')).not.toBeInTheDocument();
    // Raqam tugmalari ham chizilmaydi — «bosildi-yu hech nima bo'lmadi» holati
    // kassirni chalg'itardi.
    expect(within(screen.getByTestId('pos-line-edit')).queryByRole('button', { name: '7' })).toBe(
      null,
    );
  });

  it('qulflangan holatda ham soni/narx/jami KO‘RINADI', () => {
    open({}, { readOnly: true });

    expect(norm(screen.getByTestId('pos-line-edit-qty').textContent)).toContain('2');
    expect(norm(screen.getByTestId('pos-line-edit-total').textContent)).toContain('20 000,00');
  });
});
