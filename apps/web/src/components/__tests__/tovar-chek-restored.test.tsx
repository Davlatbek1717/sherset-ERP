import { type ChekPosition, TovarChek } from '@/components/print/tovar-chek';
import { renderWithProviders, screen } from '@/test-utils';
import { describe, expect, it } from 'vitest';

/**
 * «TOVAR CHEKI» — REGRESSION LOCK (2026-07-31).
 *
 * This template was built 2026-07-17 from the owner's own «Elektro sentr»
 * receipt sample and replaced the A4 form on customer-order / demand /
 * sales-return. The climart-adoption commit (55cf3bf) DELETED it together
 * with `thermal-shell.tsx`, the picking print route and the whole
 * `tools/print-agent` — accidentally, as shown by what survived: the
 * `.print-thermal` CSS block and all 16 `chek_*` translation keys were left
 * orphaned with no code reading them.
 *
 * Nothing caught that: no test rendered the component, and an unused i18n key
 * is not a gate failure. This file is the missing guard — if the chek is
 * dropped again, these fail.
 */

const POSITIONS: ChekPosition[] = [
  {
    position: 1,
    name: 'Kabel VVG 3x2.5',
    code: 'K-001',
    uom: 'm',
    quantity: '100',
    priceMinor: '1000000',
    sumMinor: '100000000',
  },
  {
    position: 2,
    name: 'Avtomat 16A',
    code: null,
    uom: 'dona',
    quantity: '5',
    priceMinor: '2000000',
    sumMinor: '9000000',
  },
];

/** formatMoney uses a NON-BREAKING space (U+00A0) as the group separator,
 *  so a literal ' ' never matches. Compare on whitespace-stripped text. */
function hasAmount(container: HTMLElement, digits: string): boolean {
  return container.textContent?.replace(/\s/g, '').includes(digits) ?? false;
}

function renderChek(over: Partial<React.ComponentProps<typeof TovarChek>> = {}) {
  return renderWithProviders(
    <TovarChek
      title="Tovar cheki"
      docNumber="00017"
      docDate="2026-07-31T10:00:00.000Z"
      orgName="MCHJ Demo"
      orgPhone="+998 90 123 45 67"
      sellerName="Admin User"
      buyerName="Zikrillo aka"
      buyerPhone="+998 91 234 56 78"
      comment={null}
      reference={null}
      positions={POSITIONS}
      // gross 110 000 000 vs total 109 000 000 → a 1 000 000 discount line
      subtotalMinor="110000000"
      totalMinor="109000000"
      widthMm={80}
      {...over}
    />,
  );
}

describe('TovarChek — restored receipt template', () => {
  it('renders the shop header: name, phone, doc number', () => {
    renderChek();
    expect(screen.getByText('MCHJ Demo')).toBeTruthy();
    expect(screen.getByText(/\+998 90 123 45 67/)).toBeTruthy();
    expect(screen.getByText(/00017/)).toBeTruthy();
  });

  it('renders seller and buyer lines', () => {
    renderChek();
    expect(screen.getByText(/Admin User/)).toBeTruthy();
    expect(screen.getByText(/Zikrillo aka/)).toBeTruthy();
    expect(screen.getByText(/\+998 91 234 56 78/)).toBeTruthy();
  });

  it('lists every position with its name', () => {
    renderChek();
    expect(screen.getByText('Kabel VVG 3x2.5')).toBeTruthy();
    expect(screen.getByText('Avtomat 16A')).toBeTruthy();
  });

  it('always shows the three summary rows — namunada shunday', () => {
    // chek.png: «Chek bo'yicha umumiy summa» · «Chegirma» · «Jami summa»
    // UCHALASI ham doim chiqadi. Ilgari chegirmasiz chekda faqat JAMI qolardi.
    const { container } = renderChek({ subtotalMinor: '109000000' });
    const txt = container.textContent ?? '';
    expect(txt).toMatch(/Chek bo|Общая сумма/);
    expect(txt).toMatch(/Chegirma|Скидка/);
    expect(txt).toMatch(/Jami summa|Итого/);
  });

  it('prints the discount amount when there is one', () => {
    const { container } = renderChek();
    // 110 000 000 − 109 000 000 = 1 000 000 tiyin = 10 000 so'm (kasrsiz)
    expect(hasAmount(container, '10000')).toBe(true);
  });

  it('prints a literal 0 when there is no discount', () => {
    const { container } = renderChek({ subtotalMinor: '109000000' });
    expect(container.querySelector('[data-test-id="chek-discount"]')?.textContent).toBe('0');
  });

  it('always prints the grand total', () => {
    const { container } = renderChek();
    expect(hasAmount(container, '1090000')).toBe(true);
  });

  it('prints «Jami nomenklaturalar soni» with the row count', () => {
    const { container } = renderChek();
    const txt = (container.textContent ?? '').replace(/\s/g, '');
    expect(txt).toMatch(/(Jaminomenklaturalarsoni|Всегонаименований):?2/);
  });

  it('prints the total in words («Raqam bilan»)', () => {
    const { container } = renderChek();
    const txt = container.textContent ?? '';
    expect(txt).toMatch(/Raqam bilan|прописью/);
    // 1 090 000,00 -> «Bir million to‘qson ming so‘m 00 tiyin»
    expect(txt).toMatch(/million/i);
  });

  it('prints the two footer lines from the sample', () => {
    const { container } = renderChek();
    const txt = container.textContent ?? '';
    expect(txt).toMatch(/tasdiqlovchi hujjat|подтверждающим оплату/);
    expect(txt).toMatch(/Rahmat|Спасибо/);
  });

  // ── 80mm lenta cheklovlari ────────────────────────────────────────────────
  // Egasi 80mm da chop etadi (~302px). Uzun matnlar o'ralmasa, termal printer
  // o'ng chetini QIRQIB tashlaydi — bu qog'ozda ko'rinadi, testda emas.
  it('wraps the long «Raqam bilan» line instead of overflowing', () => {
    const { container } = renderChek();
    const words = [...container.querySelectorAll('div')].find((d) =>
      /Raqam bilan|прописью/.test(d.textContent ?? ''),
    );
    expect(words).toBeTruthy();
    // O'ralish o'z konteynerida yoki ota-blokda e'lon qilingan bo'lsin.
    const withWrap = [...container.querySelectorAll('div')].some(
      (d) => (d as HTMLElement).style.overflowWrap === 'anywhere',
    );
    expect(withWrap).toBe(true);
  });

  it('keeps money cells on ONE line (nowrap) so sums stay readable', () => {
    const { container } = renderChek();
    const cells = [...container.querySelectorAll('td')].filter(
      (td) => (td as HTMLElement).style.whiteSpace === 'nowrap',
    );
    // Narx + Summa ustunlari va jamlanma qiymatlari — kamida bir nechta.
    expect(cells.length).toBeGreaterThan(3);
  });

  it('uses the 80mm font size (58mm strip drops to 9px)', () => {
    const { container } = renderChek({ widthMm: 80 });
    const root = container.querySelector('[data-test-id="tovar-chek"]') as HTMLElement;
    expect(root.style.fontSize).toBe('11px');
    const { container: narrow } = renderChek({ widthMm: 58 });
    const nroot = narrow.querySelector('[data-test-id="tovar-chek"]') as HTMLElement;
    expect(nroot.style.fontSize).toBe('9px');
  });
});
