import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * POS «Qarz to'lovi» ulanish qulfi (kassa TZ §7.2 / §8.4).
 *
 * Bu yerda ikki xato-klassi qulflanadi — ikkalasini ham typecheck, biome va
 * odatiy testlar JIM o'tkazib yuboradi:
 *
 * 1. **`retailShiftId` tushib qolishi.** Prop ixtiyoriy: dialog uni uzatmasa
 *    ham hamma narsa kompilyatsiya bo'ladi va to'lov muvaffaqiyatli o'tadi —
 *    faqat pul yashiqda bor-u smena hisobida YO'Q, ya'ni kassir har safar
 *    o'sha summaga «ortiqcha» chiqadi. Aynan shu bug backend tomonda
 *    tuzatilgan edi; FE uni qaytarib keltirmasin.
 *
 * 2. **PKO havolasining yo'li.** `window.open('/print/...')` — oddiy satr:
 *    yo'l noto'g'ri bo'lsa 404 sahifa ochiladi va hech bir gate shikoyat
 *    qilmaydi. Shuning uchun havola va route fayli birga tekshiriladi.
 */
const WEB_SRC = join(__dirname, '..');
const DIALOG = readFileSync(join(WEB_SRC, 'components', 'pos', 'debt-payment-dialog.tsx'), 'utf8');
const POS_PAGE = readFileSync(join(WEB_SRC, 'app', '(app)', 'sotuv', 'page.tsx'), 'utf8');

describe('POS qarz to`lovi — ulanish', () => {
  it('dialog to`lovni JORIY SMENAGA bog`laydi', () => {
    expect(DIALOG).toMatch(/retailShiftId:\s*sessionId/);
  });

  it('POS sahifasi dialogga haqiqiy smena id sini uzatadi', () => {
    // `sessionId={session.id}` bo'lmasa dialog ichidagi bog'lash ma'nosiz.
    expect(POS_PAGE).toMatch(/<DebtPaymentDialog[\s\S]{0,400}?sessionId=\{session\.id\}/);
  });

  it('to`lovdan keyin PKO cheki ochiladi va route MAVJUD', () => {
    // Sahifada bir nechta chek ochiladi (qarz to'lovi, xarajat/inkassatsiya) —
    // shuning uchun HAMMASI yig'iladi va oralaridan qarz cheki qidiriladi.
    // «Birinchi topilgani» deb olish yangi chek qo'shilishi bilan buzilardi.
    const paths = [...POS_PAGE.matchAll(/window\.open\(`(\/print\/[^`?]+)/g)].map((m) => m[1]);
    expect(paths.length, 'chek ochuvchi window.open topilmadi').toBeGreaterThan(0);
    const urlPath = paths.find((p) => p?.includes('/print/debt-payment/')) ?? '';
    expect(urlPath, `qarz cheki havolasi yo'q — topilganlar: ${paths.join(', ')}`).toContain(
      '/print/debt-payment/',
    );

    // Havoladagi yo'l uchun haqiqiy App Router fayli borligini tekshiramiz.
    const routeFile = join(WEB_SRC, 'app', 'print', 'debt-payment', '[batchId]', 'page.tsx');
    expect(existsSync(routeFile), `route yo'q: ${routeFile}`).toBe(true);
  });

  it('chek pay() qaytargan batchId bilan ochiladi (qator id bilan emas)', () => {
    // Bitta to'lov = N qator: qator id bilan ochilsa chek CHALA chiqadi.
    expect(POS_PAGE).toMatch(/\/print\/debt-payment\/\$\{result\.batchId\}/);
  });

  it('ortiqcha to`lov tugmasi OLDINDAN bloklanadi', () => {
    // Server ham rad etadi, lekin kassir xatoni bosgandan keyin emas,
    // oldin ko'rishi kerak (§6.2 — qaytim naqddan).
    expect(DIALOG).toMatch(/overpay\s*===\s*0n/);
  });

  it('«Hammasi» tugmasi qoldiqni Number orqali emas, aniq qo`yadi', () => {
    // Number(bigint)/100 katta summada yaxlitlaydi → server bir tiyinlik
    // ortiqchani rad etardi. FE-09'dan keyin lokal `minorToInput` o'rniga
    // umumiy `formatAmountInput` (valyuta-scale bilan) ishlatiladi.
    // F6: qiymat `payAllInput` orqali o'tadi — dollarda PASTGA yaxlitlangan
    // sent, so'mda esa aynan qoldiq.
    expect(DIALOG).toMatch(
      /payAllInput = formatAmountInput\(payAllMinor, isUsd \? 'USD' : currency\)/,
    );
    expect(DIALOG).toMatch(/setAmountInput\(payAllInput\)/);
    expect(DIALOG).not.toMatch(/Number\(outstanding\)/);
  });

  it('summa float EMAS, umumiy parse orqali o`qiladi (FE-09)', () => {
    // Lokal `BigInt(Math.round(n * 100))` nusxasi qaytib kelmasin: u float
    // orqali yaxlitlardi va scale'ni qattiq 100 deb olardi.
    // F6: dollar ALOHIDA valyutada parse qilinadi (sent ≠ tiyin).
    expect(DIALOG).toMatch(/parseAmountToMinor\(amountInput, isUsd \? 'USD' : currency\)/);
    expect(DIALOG).not.toMatch(/Math\.round\([^)]*\*\s*100\)/);
  });

  /**
   * F6 — dollar qarz to'lovining ulanish qulflari. Bularning har biri
   * typecheck'dan JIM o'tadi va faqat PULDA ko'rinadi:
   *  · kurs FE'da qo'lda kiritilsa yoki qayta hisoblansa — chek serverdagi
   *    summadan farq qiladi;
   *  · so'm ekvivalenti payload'ga qo'shilsa — ikki manba paydo bo'ladi.
   */
  it('kurs SERVERDAN olinadi (qo`lda kiritilmaydi)', () => {
    expect(DIALOG).toMatch(/exchange-rates\/rate\?currency=USD/);
  });

  it('payload`ga serverdan olingan `rateMinor` AYNAN uzatiladi', () => {
    expect(DIALOG).toMatch(/exchangeRate: usdRate\.rateMinor/);
  });

  it('so`m ekvivalenti payload`ga QO`SHILMAYDI (yagona manba — server)', () => {
    const body = DIALOG.slice(DIALOG.indexOf("api.post<PayResult>('/debts/pos/pay'"));
    const call = body.slice(0, body.indexOf('}),'));
    expect(call).toContain('amountMinor: amountMinor.toString()');
    expect(call).not.toContain('somMinor');
  });
});
