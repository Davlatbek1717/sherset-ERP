import { describe, expect, it } from 'vitest';
import { GENERIC_DOC_TEMPLATE, wrapDocuments } from './default-templates.js';
import {
  buildDocContext,
  computeLineSumMinor,
  formatDocDate,
  formatMoneyMinor,
  formatQty,
  renderDocTemplate,
} from './print-render.util.js';

describe('formatMoneyMinor', () => {
  it('groups thousands with ASCII space and truncates tiyin', () => {
    expect(formatMoneyMinor(100n)).toBe('1');
    expect(formatMoneyMinor(1_234_500n)).toBe('12 345');
    expect(formatMoneyMinor(100_000_000n)).toBe('1 000 000');
  });

  it('returns — for null/undefined and 0 for zero', () => {
    expect(formatMoneyMinor(null)).toBe('—');
    expect(formatMoneyMinor(undefined)).toBe('—');
    expect(formatMoneyMinor(0n)).toBe('0');
  });

  it('accepts bigint-as-string beyond Number.MAX_SAFE_INTEGER without precision loss', () => {
    expect(formatMoneyMinor('99999999999999999900')).toBe('999 999 999 999 999 999');
  });

  it('handles negatives', () => {
    expect(formatMoneyMinor(-1_234_500n)).toBe('-12 345');
  });

  it('returns — for unparseable input', () => {
    expect(formatMoneyMinor('not-a-number')).toBe('—');
  });
});

describe('formatDocDate', () => {
  it('formats as DD.MM.YYYY (UTC)', () => {
    expect(formatDocDate(new Date('2026-05-29T10:00:00Z'))).toBe('29.05.2026');
    expect(formatDocDate('2026-01-03T00:00:00Z')).toBe('03.01.2026');
  });

  it('returns — for null/invalid', () => {
    expect(formatDocDate(null)).toBe('—');
    expect(formatDocDate('garbage')).toBe('—');
  });
});

describe('formatQty', () => {
  it('trims trailing zeros from decimal strings', () => {
    expect(formatQty('3.000')).toBe('3');
    expect(formatQty('1.500')).toBe('1.5');
    expect(formatQty('10')).toBe('10');
    expect(formatQty(0)).toBe('0');
  });

  it('returns — for empty/null', () => {
    expect(formatQty(null)).toBe('—');
    expect(formatQty('')).toBe('—');
  });
});

describe('computeLineSumMinor', () => {
  it('mirrors the server formula without discount', () => {
    // 1 555 326 so'm × 3 = 4 665 978 so'm (the ANL reference case)
    expect(computeLineSumMinor(155_532_600n, '3', '0')).toBe(466_597_800n);
  });

  it('applies a percentage discount', () => {
    // 1000 so'm × 2 = 2000, −10% = 1800
    expect(computeLineSumMinor(100_000n, '2', '10')).toBe(180_000n);
  });

  it('handles fractional quantities', () => {
    // price 10 000 tiyin, qty 1.5 → 15 000
    expect(computeLineSumMinor(10_000n, '1.5', '0')).toBe(15_000n);
  });

  it('returns 0 for zero/negative/invalid quantity', () => {
    expect(computeLineSumMinor(10_000n, '0', '0')).toBe(0n);
    expect(computeLineSumMinor(10_000n, null, '0')).toBe(0n);
  });

  it('accepts string/number priceMinor', () => {
    expect(computeLineSumMinor('100000', '2', '0')).toBe(200_000n);
  });
});

describe('buildDocContext', () => {
  it('formats money/date and trims empty counterparty/description to null', () => {
    const ctx = buildDocContext({
      title: 'Mijoz buyurtmasi',
      number: 'CO-1',
      date: new Date('2026-05-29T00:00:00Z'),
      sumMinor: 466_597_800n,
      currency: 'UZS',
      description: '   ',
      counterpartyName: '  ',
      organizationName: 'ACME MCHJ',
    });
    expect(ctx.doc.sum).toBe('4 665 978');
    expect(ctx.doc.date).toBe('29.05.2026');
    expect(ctx.doc.description).toBeNull();
    expect(ctx.counterparty).toBeNull();
    expect(ctx.organization).toEqual({ name: 'ACME MCHJ', phone: null });
    expect(ctx.hasPositions).toBe(false);
  });

  it('reconciles positionsTotal to the SUM of line sums, not the doc grand total', () => {
    // On VAT-excluded docs the stored sumMinor adds VAT on top of the net
    // line sums; the printed "Jami" must equal the visible line column so the
    // invoice never visibly disagrees with itself.
    const ctx = buildDocContext({
      title: 't',
      number: 'CO-3',
      sumMinor: 11_800_000n, // doc grand total incl. 18% VAT (gross)
      currency: 'UZS',
      positions: [
        { name: 'A', qty: '1', priceMinor: 5_000_000n, sumMinor: 5_000_000n },
        { name: 'B', qty: '1', priceMinor: 5_000_000n, sumMinor: 5_000_000n },
      ],
    });
    // Σ line sums = 100 000 so'm (net), NOT the 118 000 gross doc total.
    expect(ctx.positionsTotal).toBe('100 000');
    expect(ctx.doc.sum).toBe('118 000');
  });

  it('builds and indexes positions with formatted values', () => {
    const ctx = buildDocContext({
      title: 't',
      number: 'CO-2',
      positions: [
        {
          name: 'Tovar A',
          unit: 'dona',
          qty: '3.000',
          priceMinor: 155_532_600n,
          sumMinor: 466_597_800n,
        },
      ],
    });
    expect(ctx.hasPositions).toBe(true);
    expect(ctx.positions[0]).toEqual({
      idx: 1,
      name: 'Tovar A',
      unit: 'dona',
      qty: '3',
      price: '1 555 326',
      sum: '4 665 978',
    });
  });
});

describe('renderDocTemplate (generic template)', () => {
  it('renders the summary branch when there are no positions', () => {
    const html = renderDocTemplate(
      GENERIC_DOC_TEMPLATE,
      buildDocContext({
        title: 'Mijoz buyurtmasi',
        number: 'CO-100',
        sumMinor: 5_000_000n,
        currency: 'UZS',
      }),
    );
    expect(html).toContain('Mijoz buyurtmasi № CO-100');
    expect(html).toContain('Summa:');
    expect(html).toContain('50 000 UZS');
    expect(html).not.toContain('<table');
  });

  it('renders a positions table with a total row when positions exist', () => {
    const html = renderDocTemplate(
      GENERIC_DOC_TEMPLATE,
      buildDocContext({
        title: 'Mijoz buyurtmasi',
        number: 'CO-101',
        sumMinor: 466_597_800n,
        currency: 'UZS',
        positions: [
          {
            name: 'Tovar A',
            unit: 'dona',
            qty: '3',
            priceMinor: 155_532_600n,
            sumMinor: 466_597_800n,
          },
        ],
      }),
    );
    expect(html).toContain('<table class="pos">');
    expect(html).toContain('Tovar A');
    expect(html).toContain('4 665 978'); // line + total
    expect(html).toContain('Jami:');
    // moysklad-parity: payable total spelled out in words. The literal
    // "Jami to'lov:" label is template markup (unescaped); the interpolated
    // amount is HTML-escaped, so the apostrophe in "so'm" renders as &#39;.
    expect(html).toContain("Jami to'lov:");
    expect(html).toContain('00 tiyin');
  });

  it('renders the organization phone line and the qty total in the Jami row', () => {
    const html = renderDocTemplate(
      GENERIC_DOC_TEMPLATE,
      buildDocContext({
        title: 'Mijoz buyurtmasi',
        number: 'CO-9',
        currency: 'UZS',
        organizationName: 'Kassir Moliyachi',
        organizationPhone: '+998914024777',
        positions: [
          { name: 'A', unit: 'dona', qty: '2', priceMinor: 5_000_000n, sumMinor: 10_000_000n },
          { name: 'B', unit: 'soat', qty: '1.5', priceMinor: 4_000_000n, sumMinor: 6_000_000n },
        ],
      }),
    );
    expect(html).toContain('tel. +998914024777');
    // qty total 2 + 1.5 = 3.5 shown in the Jami row
    expect(html).toContain('3.5');
    // no signature block (moysklad parity)
    expect(html).not.toContain('Topshirdi');
  });

  it('HTML-escapes document data to prevent layout corruption / injection', () => {
    const html = renderDocTemplate(
      GENERIC_DOC_TEMPLATE,
      buildDocContext({
        title: 't',
        number: 'CO-X',
        counterpartyName: '<script>alert(1)</script> & "Co"',
        sumMinor: 0n,
      }),
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
  });

  it('omits counterparty/org/description blocks when absent', () => {
    const html = renderDocTemplate(
      GENERIC_DOC_TEMPLATE,
      buildDocContext({ title: 't', number: 'CO-Y', sumMinor: 0n }),
    );
    expect(html).not.toContain('Kontragent');
    expect(html).not.toContain('Izoh');
  });
});

describe('wrapDocuments', () => {
  it('wraps fragments into one HTML document with shared CSS', () => {
    const doc = wrapDocuments(['<section>A</section>', '<section>B</section>']);
    expect(doc).toContain('<!DOCTYPE html>');
    expect(doc).toContain('<style>');
    expect(doc).toContain('page-break-after');
    expect(doc).toContain('<section>A</section>');
    expect(doc).toContain('<section>B</section>');
  });
});
