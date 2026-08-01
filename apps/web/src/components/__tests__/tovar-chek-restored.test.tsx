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

  it('shows the discount line when gross exceeds the total', () => {
    const { container } = renderChek();
    // 110 000 000 − 109 000 000 = 1 000 000 tiyin = 10 000 so'm.
    // fmtSom ATAYLAB butun so'mni kasrsiz chizadi (egasining namunasi shunday).
    expect(hasAmount(container, '-10000')).toBe(true);
  });

  it('hides the discount line when there is no discount', () => {
    const { container } = renderChek({ subtotalMinor: '109000000' });
    // «Chegirma» must not appear when gross === total.
    expect(container.textContent).not.toMatch(/Chegirma|Скидка/);
  });

  it('always prints the grand total', () => {
    const { container } = renderChek();
    expect(hasAmount(container, '1090000')).toBe(true);
  });
});
