import { PrintDoc, type PrintDocPosition } from '@/components/print/print-doc';
import { renderWithProviders, screen } from '@/test-utils';
import { describe, expect, it } from 'vitest';

/**
 * PrintDoc — the elements that make a printed document a valid UZ/CIS
 * PRIMARY document, not just a table on paper (2026-07-31).
 *
 * Before this the form printed: title, two party names, the line table,
 * three total rows and two bare signature lines. Missing were the pieces an
 * accountant actually checks:
 *   - «Сумма прописью» — without it the figure can be altered after signing
 *   - «Всего наименований N, на сумму X» — the standard reconciliation line
 *   - «М.П.» — stamp placeholder on the issuing side
 *   - party requisites (STIR / bank) — the API returned them, the form dropped them
 *
 * These assert the RENDERED output, not the source.
 */

const POSITIONS: PrintDocPosition[] = [
  {
    position: 1,
    productName: 'Kabel VVG 3x2.5',
    productCode: 'K-001',
    uom: 'm',
    quantity: '100',
    priceMinor: '1000000',
    totalMinor: '100000000',
    discount: '0',
    vat: 12,
    vatAmountMinor: '12000000',
  },
  {
    position: 2,
    productName: 'Avtomat 16A',
    productCode: null,
    uom: 'dona',
    quantity: '5',
    priceMinor: '2000000',
    totalMinor: '10000000',
    discount: '0',
    vat: 12,
    vatAmountMinor: '1200000',
  },
];

function renderDoc(over: Partial<React.ComponentProps<typeof PrintDoc>> = {}) {
  return renderWithProviders(
    <PrintDoc
      docTitle="Отгрузка"
      docNumber="00017"
      docDate="2026-07-31T10:00:00.000Z"
      organization={{
        label: 'Организация',
        name: 'MCHJ Demo',
        details: 'Toshkent\nSTIR: 301234567\nH/r: 20208000900123456789',
      }}
      agent={{ label: 'Контрагент', name: 'Zikrillo aka', details: 'STIR: 987654321' }}
      positions={POSITIONS}
      currency="UZS"
      subtotalMinor="110000000"
      vatTotalMinor="13200000"
      grandTotalMinor="123200000"
      signatures={[
        { label: 'Tashkilot rahbari', name: 'Admin User' },
        { label: 'Принял', name: 'Zikrillo aka' },
      ]}
      {...over}
    />,
  );
}

describe('PrintDoc — primary-document elements', () => {
  // The test providers mount the UZ locale, so the assertions below check the
  // Uzbek output — i.e. exactly what an uz-locale operator prints.
  it('prints the spelled-out amount from the GRAND total', () => {
    renderDoc();
    // 123 200 000 tiyin = 1 232 000,00
    expect(screen.getByText(/Bir million ikki yuz o'ttiz ikki ming so'm 00 tiyin/)).toBeTruthy();
  });

  it('spells the grand total, NOT the subtotal', () => {
    renderDoc();
    const words = screen.getByText(/so'm \d{2} tiyin/);
    // Subtotal is 1 100 000 → «bir million bir yuz ming». Must not appear.
    expect(words.textContent).not.toMatch(/bir yuz ming/);
    expect(words.textContent).toMatch(/o'ttiz ikki ming/);
  });

  it('prints the reconciliation line with the real position count', () => {
    renderDoc();
    expect(screen.getByText(/Jami 2 nomdagi tovar/)).toBeTruthy();
  });

  it('prints the stamp placeholder exactly once (issuing side only)', () => {
    renderDoc();
    expect(screen.getAllByText('M.O‘.')).toHaveLength(1);
  });

  it('omits the stamp when the caller opts out', () => {
    renderDoc({ showStamp: false });
    expect(screen.queryByText('M.O‘.')).toBeNull();
  });

  it('omits the spelled-out amount when the caller opts out (money-less slips)', () => {
    renderDoc({ showAmountInWords: false });
    expect(screen.queryByText(/tiyin/)).toBeNull();
  });

  it('renders party requisites (STIR / bank), not just the name', () => {
    renderDoc();
    expect(screen.getByText(/STIR: 301234567/)).toBeTruthy();
    expect(screen.getByText(/20208000900123456789/)).toBeTruthy();
  });

  it('signature lines carry the PERSON and their position, not the company twice', () => {
    renderDoc();
    expect(screen.getByText('Admin User')).toBeTruthy();
    expect(screen.getByText('Tashkilot rahbari')).toBeTruthy();
  });
});
