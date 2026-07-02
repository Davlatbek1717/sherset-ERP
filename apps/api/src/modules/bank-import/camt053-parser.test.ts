import { describe, expect, it } from 'vitest';
import { parseBankStatementCamt053 } from './camt053-parser.js';

const STMT = (entries: string, extra = '') => `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
 <BkToCstmrStmt>
  <Stmt>
   <Id>ST-1</Id>
   ${extra}
   ${entries}
  </Stmt>
 </BkToCstmrStmt>
</Document>`;

const NTRY_IN = `
<Ntry>
  <Amt Ccy="UZS">1500000.50</Amt>
  <CdtDbtInd>CRDT</CdtDbtInd>
  <BookgDt><Dt>2026-05-19</Dt></BookgDt>
  <NtryDtls><TxDtls>
    <Refs><EndToEndId>DOC-7788</EndToEndId></Refs>
    <RltdPties>
      <Dbtr><Nm>OOO Postavshik</Nm>
        <Id><OrgId><Othr><Id>305123456</Id></Othr></OrgId></Id></Dbtr>
      <DbtrAcct><Id><Othr><Id>20208000900000000001</Id></Othr></Id></DbtrAcct>
    </RltdPties>
    <RmtInf><Ustrd>Tovar uchun to&amp;#39;lov &amp; xizmat</Ustrd></RmtInf>
  </TxDtls></NtryDtls>
</Ntry>`;

const NTRY_OUT = `
<Ntry>
  <Amt Ccy="UZS">300000.00</Amt>
  <CdtDbtInd>DBIT</CdtDbtInd>
  <ValDt><Dt>2026-05-18</Dt></ValDt>
  <NtryDtls><TxDtls>
    <RltdPties>
      <Cdtr><Nm>Soliq Inspeksiya</Nm></Cdtr>
      <CdtrAcct><Id><IBAN>UZ99TEST00000000000000</IBAN></Id></CdtrAcct>
    </RltdPties>
    <RmtInf><Ustrd>Soliq</Ustrd></RmtInf>
  </TxDtls></NtryDtls>
</Ntry>`;

describe('parseBankStatementCamt053 — entry mapping', () => {
  it('maps CRDT→in / DBIT→out with exact minor amounts, dates, refs', () => {
    const { rows } = parseBankStatementCamt053(STMT(NTRY_IN + NTRY_OUT));
    expect(rows).toHaveLength(2);

    const [a, b] = rows;
    expect(a?.direction).toBe('in');
    expect(a?.amountMinor).toBe(150_000_050n); // 1 500 000.50 → minor
    expect(a?.moment.toISOString().slice(0, 10)).toBe('2026-05-19');
    expect(a?.counterpartyName).toBe('OOO Postavshik');
    expect(a?.counterpartyInn).toBe('305123456');
    expect(a?.counterpartyAccount).toBe('20208000900000000001');
    expect(a?.documentNumber).toBe('DOC-7788');
    expect(a?.paymentPurpose).toContain('xizmat'); // entity decoded, no crash
    expect(a?.error).toBeNull();

    expect(b?.direction).toBe('out');
    expect(b?.amountMinor).toBe(30_000_000n);
    expect(b?.counterpartyName).toBe('Soliq Inspeksiya');
    expect(b?.counterpartyAccount).toBe('UZ99TEST00000000000000');
  });

  it('handles a namespace-prefixed document (removeNSPrefix)', () => {
    const xml = `<?xml version="1.0"?>
<ns:Document xmlns:ns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
 <ns:BkToCstmrStmt><ns:Stmt><ns:Id>S</ns:Id>
  <ns:Ntry><ns:Amt Ccy="UZS">100.00</ns:Amt><ns:CdtDbtInd>CRDT</ns:CdtDbtInd>
   <ns:BookgDt><ns:Dt>2026-01-02</ns:Dt></ns:BookgDt></ns:Ntry>
 </ns:Stmt></ns:BkToCstmrStmt></ns:Document>`;
    const { rows } = parseBankStatementCamt053(xml);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.direction).toBe('in');
    expect(rows[0]?.amountMinor).toBe(10_000n);
  });

  it('emits one row per TxDtls when an entry batches several', () => {
    const multi = `<Ntry><Amt Ccy="UZS">500.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
      <BookgDt><Dt>2026-03-03</Dt></BookgDt><NtryDtls>
      <TxDtls><Amt Ccy="UZS">200.00</Amt><RmtInf><Ustrd>A</Ustrd></RmtInf></TxDtls>
      <TxDtls><Amt Ccy="UZS">300.00</Amt><RmtInf><Ustrd>B</Ustrd></RmtInf></TxDtls>
      </NtryDtls></Ntry>`;
    const { rows } = parseBankStatementCamt053(STMT(multi));
    expect(rows).toHaveLength(2);
    expect(rows[0]?.amountMinor).toBe(20_000n);
    expect(rows[1]?.amountMinor).toBe(30_000n);
  });
});

describe('parseBankStatementCamt053 — reconciliation', () => {
  it('balances against TxsSummry totals', () => {
    const summ = `<TxsSummry>
      <TtlCdtNtries><Sum>1500000.50</Sum></TtlCdtNtries>
      <TtlDbtNtries><Sum>300000.00</Sum></TtlDbtNtries></TxsSummry>`;
    const { reconciliation } = parseBankStatementCamt053(STMT(NTRY_IN + NTRY_OUT, summ));
    expect(reconciliation.available).toBe(true);
    expect(reconciliation.balanced).toBe(true);
    expect(reconciliation.computedCreditMinor).toBe('150000050');
    expect(reconciliation.computedDebitMinor).toBe('30000000');
  });

  it('flags a MISMATCH when control totals disagree', () => {
    const summ = `<TxsSummry>
      <TtlCdtNtries><Sum>999999.99</Sum></TtlCdtNtries>
      <TtlDbtNtries><Sum>300000.00</Sum></TtlDbtNtries></TxsSummry>`;
    const { reconciliation } = parseBankStatementCamt053(STMT(NTRY_IN + NTRY_OUT, summ));
    expect(reconciliation.balanced).toBe(false);
    expect(reconciliation.message).toContain('MISMATCH');
  });

  it('falls back to OPBD/CLBD balances for the expected net', () => {
    const bals = `<Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="UZS">1000000.00</Amt><CdtDbtInd>CRDT</CdtDbtInd></Bal>
      <Bal><Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="UZS">2200000.50</Amt><CdtDbtInd>CRDT</CdtDbtInd></Bal>`;
    // net = 2 200 000.50 − 1 000 000.00 = 1 200 000.50 ; entries: +1 500 000.50 −300 000.00 = +1 200 000.50
    const { reconciliation } = parseBankStatementCamt053(STMT(NTRY_IN + NTRY_OUT, bals));
    expect(reconciliation.available).toBe(true);
    expect(reconciliation.balanced).toBe(true);
  });

  it('reports reconciliation unavailable when no control figures', () => {
    const { reconciliation } = parseBankStatementCamt053(STMT(NTRY_IN));
    expect(reconciliation.available).toBe(false);
    expect(reconciliation.balanced).toBe(false);
  });
});

describe('parseBankStatementCamt053 — adversarial', () => {
  it('throws on malformed XML', () => {
    expect(() => parseBankStatementCamt053('<Document><BkToCstmrStmt><Stmt>')).toThrow();
  });

  it('throws when the document is not a camt.053', () => {
    expect(() =>
      parseBankStatementCamt053('<?xml version="1.0"?><Document><Foo/></Document>'),
    ).toThrow(/not a camt\.053/);
  });

  it('flags an unparseable amount as a row error (no crash)', () => {
    const bad = `<Ntry><Amt Ccy="UZS">abc</Amt><CdtDbtInd>CRDT</CdtDbtInd>
      <BookgDt><Dt>2026-04-04</Dt></BookgDt></Ntry>`;
    const { rows } = parseBankStatementCamt053(STMT(bad));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.error).toContain('invalid amount');
    expect(rows[0]?.amountMinor).toBe(0n);
  });

  it('handles an empty statement (no entries) gracefully', () => {
    const { rows, reconciliation } = parseBankStatementCamt053(STMT(''));
    expect(rows).toHaveLength(0);
    expect(reconciliation.available).toBe(false);
  });
});
