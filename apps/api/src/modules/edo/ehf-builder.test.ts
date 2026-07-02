import { describe, expect, it } from 'vitest';
import {
  type EhfPayload,
  buildEhfXml,
  formatDate,
  sumPositions,
  tiyinToDecimal,
} from './ehf-builder.js';

describe('tiyinToDecimal', () => {
  it.each([
    [0n, '0.00'],
    [100n, '1.00'],
    [12345n, '123.45'],
    [99n, '0.99'],
    [-12345n, '-123.45'],
    [10000000n, '100000.00'],
  ])('formats %s tiyin → %s', (input, expected) => {
    expect(tiyinToDecimal(input)).toBe(expected);
  });
});

describe('formatDate', () => {
  it('formats date as YYYY-MM-DD UTC', () => {
    expect(formatDate(new Date(Date.UTC(2026, 4, 30)))).toBe('2026-05-30');
    expect(formatDate(new Date(Date.UTC(2026, 0, 1)))).toBe('2026-01-01');
  });
});

describe('sumPositions', () => {
  it('sums sum/nds/total over positions', () => {
    const totals = sumPositions([
      {
        ordNo: 1,
        mxik: '01',
        name: 'A',
        measureCode: '108',
        count: '2',
        priceMinor: 1000n,
        sumMinor: 2000n,
        ndsRate: 12,
        ndsSumMinor: 240n,
        totalMinor: 2240n,
      },
      {
        ordNo: 2,
        mxik: '02',
        name: 'B',
        measureCode: '108',
        count: '5',
        priceMinor: 500n,
        sumMinor: 2500n,
        ndsRate: 12,
        ndsSumMinor: 300n,
        totalMinor: 2800n,
      },
    ]);
    expect(totals.sum).toBe(4500n);
    expect(totals.nds).toBe(540n);
    expect(totals.total).toBe(5040n);
  });

  it('returns zeros for empty list', () => {
    const totals = sumPositions([]);
    expect(totals).toEqual({ sum: 0n, nds: 0n, total: 0n });
  });
});

describe('buildEhfXml', () => {
  const payload: EhfPayload = {
    facturaId: '123e4567-e89b-12d3-a456-426614174000',
    facturaNo: 'СФ-2026-00001',
    facturaDate: new Date(Date.UTC(2026, 4, 30)),
    facturaType: 1,
    seller: {
      tin: '300123456',
      nameCyrl: 'Test Sotuvchi MChJ',
      address: "Toshkent, Test ko'chasi 1",
      bankAccount: '20208000300000000001',
      bankMfo: '00014',
    },
    buyer: {
      tin: '300654321',
      nameCyrl: 'Test Xaridor MChJ',
    },
    positions: [
      {
        ordNo: 1,
        mxik: '01.01.01.001',
        name: 'Тест маҳсулоти',
        measureCode: '108',
        count: '10',
        priceMinor: 100000n,
        sumMinor: 1000000n,
        ndsRate: 12,
        ndsSumMinor: 120000n,
        totalMinor: 1120000n,
      },
    ],
  };

  it('includes the XML declaration and root', () => {
    const xml = buildEhfXml(payload);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<FacturaDoc>');
    expect(xml).toContain('</FacturaDoc>');
  });

  it('includes seller TIN + name', () => {
    const xml = buildEhfXml(payload);
    expect(xml).toContain('<Tin>300123456</Tin>');
    expect(xml).toContain('Test Sotuvchi MChJ');
  });

  it('renders position with formatted decimals', () => {
    const xml = buildEhfXml(payload);
    expect(xml).toContain('<Sum>10000.00</Sum>');
    expect(xml).toContain('<NdsSum>1200.00</NdsSum>');
    expect(xml).toContain('<Total>11200.00</Total>');
    expect(xml).toContain('<Mxik>01.01.01.001</Mxik>');
  });

  it('renders document totals from positions when not supplied', () => {
    const xml = buildEhfXml(payload);
    // sum: 10000.00, nds: 1200.00, total: 11200.00 — same as line totals
    // since there's only one line. We check the doc-level tags appear.
    const sumOccurrences = (xml.match(/<Sum>10000.00<\/Sum>/g) ?? []).length;
    expect(sumOccurrences).toBeGreaterThanOrEqual(2); // line + doc total
  });

  it('escapes XML special characters in seller name', () => {
    const xml = buildEhfXml({
      ...payload,
      seller: { ...payload.seller, nameCyrl: 'AT&T <Test> "ОАО"' },
    });
    expect(xml).toContain('AT&amp;T &lt;Test&gt; &quot;ОАО&quot;');
  });

  it('omits empty optional fields', () => {
    const xml = buildEhfXml(payload);
    expect(xml).not.toContain('<DistrictCode></DistrictCode>');
    expect(xml).not.toContain('<ContractNo></ContractNo>');
  });

  it('renders contract block when provided', () => {
    const xml = buildEhfXml({
      ...payload,
      contractNo: 'C-2026-1',
      contractDate: new Date(Date.UTC(2026, 0, 15)),
    });
    expect(xml).toContain('<ContractNo>C-2026-1</ContractNo>');
    expect(xml).toContain('<ContractDate>2026-01-15</ContractDate>');
  });

  it('honours pre-computed totals override', () => {
    const xml = buildEhfXml({
      ...payload,
      totalSumMinor: 10n,
      totalNdsMinor: 1n,
      totalWithNdsMinor: 11n,
    });
    // Doc-level totals come from override, not positions.
    expect(xml).toContain('<Sum>0.10</Sum>');
    expect(xml).toContain('<NdsSum>0.01</NdsSum>');
    expect(xml).toContain('<TotalWithNds>0.11</TotalWithNds>');
  });
});
