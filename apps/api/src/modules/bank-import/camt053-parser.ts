/**
 * camt.053 (ISO 20022 Bank-to-Customer Statement) parser.
 *
 * Emits the SAME `ParsedRow[]` shape the CSV parser produces, so the
 * upload/auto-match/commit pipeline is reused unchanged. Handles both
 * namespaced (`<ns:Ntry>`) and bare element forms, CRDT/DBIT, multiple
 * Stmt/Ntry/TxDtls, and decodes XML entities. Amounts are kept as
 * STRINGS until converted to integer minor units by string math —
 * never IEEE-754 (money discipline).
 *
 * Reconciliation: the statement's declared control figures (OPBD/CLBD
 * balances, or TxsSummry totals) are checked against the sum of parsed
 * entries; a mismatch is reported (not silently ignored).
 */
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { ParsedRow } from './csv-parser.js';

export interface Camt053Reconciliation {
  available: boolean;
  balanced: boolean;
  /** 'totals' = TxsSummry gross check · 'net' = OPBD/CLBD net check · 'none'. */
  mode: 'totals' | 'net' | 'none';
  computedCreditMinor: string;
  computedDebitMinor: string;
  computedNetMinor: string;
  declaredCreditMinor: string | null;
  declaredDebitMinor: string | null;
  declaredNetMinor: string | null;
  message: string;
}

export interface Camt053Result {
  rows: ParsedRow[];
  reconciliation: Camt053Reconciliation;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false, // keep money/text as strings
  parseAttributeValue: false,
  processEntities: true,
});

/** Always-array helper — fast-xml-parser collapses single children. */
function arr<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function txt(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  // element with attributes — fast-xml-parser puts text under '#text'
  const t = (v as { '#text'?: unknown })['#text'];
  return t == null ? null : String(t).trim() || null;
}

/** "1234.56" / "1 234,56" → integer minor units (2 dp), exact string math. */
function amountToMinor(raw: string): bigint | null {
  const s = raw.replace(/\s+/g, '').replace(/,/g, '.');
  const m = /^(-?)(\d+)(?:\.(\d{1,6}))?$/.exec(s);
  if (!m) return null;
  const frac = (m[3] ?? '').padEnd(2, '0').slice(0, 2);
  const minor = BigInt(m[2] ?? '0') * 100n + BigInt(frac);
  return m[1] === '-' ? -minor : minor;
}

function parseDate(node: unknown): Date | null {
  // BookgDt / ValDt → { Dt: "2026-05-19" } | { DtTm: "2026-05-19T10:00:00" }
  if (node == null || typeof node !== 'object') return null;
  const o = node as Record<string, unknown>;
  const raw = txt(o.Dt) ?? txt(o.DtTm);
  if (!raw) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!iso) return null;
  return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
}

/** Extract a counterparty INN/STIR from a Party node's OrgId/Othr/Id. */
function partyInn(party: unknown): string | null {
  if (!party || typeof party !== 'object') return null;
  const id = (party as Record<string, unknown>).Id;
  if (!id || typeof id !== 'object') return null;
  const orgId = (id as Record<string, unknown>).OrgId ?? (id as Record<string, unknown>).PrvtId;
  if (!orgId || typeof orgId !== 'object') return null;
  for (const o of arr((orgId as Record<string, unknown>).Othr)) {
    const v = txt((o as Record<string, unknown>).Id);
    if (v) return v;
  }
  return null;
}

function partyAccount(acct: unknown): string | null {
  if (!acct || typeof acct !== 'object') return null;
  const id = (acct as Record<string, unknown>).Id;
  if (!id || typeof id !== 'object') return null;
  const iban = txt((id as Record<string, unknown>).IBAN);
  if (iban) return iban;
  const othr = (id as Record<string, unknown>).Othr;
  for (const o of arr(othr)) {
    const v = txt((o as Record<string, unknown>).Id);
    if (v) return v;
  }
  return null;
}

function balSigned(bal: unknown): { code: string | null; minor: bigint } | null {
  if (!bal || typeof bal !== 'object') return null;
  const b = bal as Record<string, unknown>;
  const code =
    txt(
      ((b.Tp as Record<string, unknown>)?.CdOrPrtry as Record<string, unknown>)?.Cd ??
        (b.Tp as Record<string, unknown>)?.CdOrPrtry,
    ) ?? null;
  const amt = amountToMinor(txt(b.Amt) ?? '');
  if (amt == null) return null;
  const sign = txt(b.CdtDbtInd) === 'DBIT' ? -1n : 1n;
  return { code, minor: sign * amt };
}

export function parseBankStatementCamt053(content: string): Camt053Result {
  // Money-integrity: a truncated/corrupt statement must be REJECTED,
  // never silently half-parsed (fast-xml-parser is lenient by default).
  const valid = XMLValidator.validate(content);
  if (valid !== true) {
    throw new Error(`camt.053: malformed XML — ${valid.err.msg} (line ${valid.err.line})`);
  }
  let doc: unknown;
  try {
    doc = parser.parse(content);
  } catch (e) {
    throw new Error(`camt.053: malformed XML — ${(e as Error).message}`);
  }
  const root = (doc as Record<string, unknown>)?.Document;
  const bkToCstmr = (root as Record<string, unknown>)?.BkToCstmrStmt;
  if (!bkToCstmr) {
    throw new Error('camt.053: missing Document/BkToCstmrStmt — not a camt.053 statement');
  }
  const stmts = arr((bkToCstmr as Record<string, unknown>).Stmt);

  const rows: ParsedRow[] = [];
  let computedCredit = 0n;
  let computedDebit = 0n;
  let declaredCredit: bigint | null = null;
  let declaredDebit: bigint | null = null;
  let declaredNet: bigint | null = null;
  let line = 0;

  for (const stmt of stmts) {
    const s = stmt as Record<string, unknown>;

    // Reconciliation source A: TxsSummry totals.
    const summ = s.TxsSummry as Record<string, unknown> | undefined;
    if (summ) {
      const c = amountToMinor(txt((summ.TtlCdtNtries as Record<string, unknown>)?.Sum) ?? '');
      const d = amountToMinor(txt((summ.TtlDbtNtries as Record<string, unknown>)?.Sum) ?? '');
      if (c != null) declaredCredit = (declaredCredit ?? 0n) + c;
      if (d != null) declaredDebit = (declaredDebit ?? 0n) + d;
    }
    // Reconciliation source B (fallback): OPBD/CLBD balances → expected net.
    if (!summ) {
      let opbd: bigint | null = null;
      let clbd: bigint | null = null;
      for (const bal of arr(s.Bal)) {
        const bs = balSigned(bal);
        if (!bs) continue;
        if (bs.code === 'OPBD') opbd = bs.minor;
        if (bs.code === 'CLBD') clbd = bs.minor;
      }
      if (opbd != null && clbd != null) {
        // OPBD/CLBD only constrain the NET movement, not gross cr/db.
        declaredNet = (declaredNet ?? 0n) + (clbd - opbd);
      }
    }

    for (const ntry of arr(s.Ntry)) {
      const e = ntry as Record<string, unknown>;
      const entryDir = txt(e.CdtDbtInd) === 'DBIT' ? 'out' : 'in';
      const entryDate = parseDate(e.BookgDt) ?? parseDate(e.ValDt) ?? new Date(0);
      const entryAmt = txt(e.Amt);

      const txDtls = arr(
        (e.NtryDtls as Record<string, unknown>)?.TxDtls ?? (e.NtryDtls as Record<string, unknown>),
      );
      const details = txDtls.length > 0 ? txDtls : [null];

      for (const td of details) {
        line += 1;
        const t = (td ?? {}) as Record<string, unknown>;
        const amtRaw = txt((t.Amt as Record<string, unknown>) ?? t.Amt) ?? entryAmt;
        const dir =
          txt((t.CdtDbtInd as unknown) ?? '') === 'DBIT'
            ? 'out'
            : txt(t.CdtDbtInd as unknown) === 'CRDT'
              ? 'in'
              : entryDir;
        const amtMinor = amtRaw == null ? null : amountToMinor(amtRaw);
        const errors: string[] = [];
        if (amtMinor == null) errors.push(`invalid amount: "${amtRaw ?? ''}"`);

        const parties = (t.RltdPties ?? {}) as Record<string, unknown>;
        // For an inflow the counterparty is the Debtor; for an outflow, the Creditor.
        const cp = dir === 'in' ? parties.Dbtr : parties.Cdtr;
        const cpAcct = dir === 'in' ? parties.DbtrAcct : parties.CdtrAcct;
        const cpName =
          txt((cp as Record<string, unknown>)?.Nm) ??
          txt((parties.Dbtr as Record<string, unknown>)?.Nm) ??
          txt((parties.Cdtr as Record<string, unknown>)?.Nm);

        const rmt = (t.RmtInf ?? {}) as Record<string, unknown>;
        const purpose =
          arr(rmt.Ustrd)
            .map((u) => txt(u))
            .filter(Boolean)
            .join(' ') || null;

        const refs = (t.Refs ?? {}) as Record<string, unknown>;
        const docNum =
          txt(refs.EndToEndId) ?? txt(refs.InstrId) ?? txt(refs.TxId) ?? txt(e.NtryRef) ?? null;

        const absMinor = amtMinor == null ? 0n : amtMinor < 0n ? -amtMinor : amtMinor;
        if (amtMinor != null) {
          if (dir === 'in') computedCredit += absMinor;
          else computedDebit += absMinor;
        }

        rows.push({
          lineNumber: line,
          direction: dir,
          moment: parseDate(t.BookgDt) ?? entryDate,
          amountMinor: absMinor,
          counterpartyName: cpName,
          counterpartyInn: partyInn(cp) ?? partyInn(parties.Dbtr) ?? partyInn(parties.Cdtr),
          counterpartyAccount: partyAccount(cpAcct),
          paymentPurpose: purpose,
          documentNumber: docNum,
          error: errors.length > 0 ? errors.join('; ') : null,
        });
      }
    }
  }

  const computedNet = computedCredit - computedDebit;
  const hasTotals = declaredCredit != null || declaredDebit != null;
  const mode: 'totals' | 'net' | 'none' = hasTotals
    ? 'totals'
    : declaredNet != null
      ? 'net'
      : 'none';

  let balanced = false;
  if (mode === 'totals') {
    balanced =
      (declaredCredit == null || declaredCredit === computedCredit) &&
      (declaredDebit == null || declaredDebit === computedDebit);
  } else if (mode === 'net') {
    balanced = declaredNet === computedNet;
  }

  const message =
    mode === 'none'
      ? 'No control totals in statement — reconciliation skipped'
      : balanced
        ? 'Reconciled: parsed entries match statement control figures'
        : mode === 'totals'
          ? `Reconciliation MISMATCH — declared cr/db ${declaredCredit ?? '—'}/${declaredDebit ?? '—'} vs computed ${computedCredit}/${computedDebit}`
          : `Reconciliation MISMATCH — declared net ${declaredNet} vs computed net ${computedNet}`;

  return {
    rows,
    reconciliation: {
      available: mode !== 'none',
      balanced,
      mode,
      computedCreditMinor: computedCredit.toString(),
      computedDebitMinor: computedDebit.toString(),
      computedNetMinor: computedNet.toString(),
      declaredCreditMinor: declaredCredit == null ? null : declaredCredit.toString(),
      declaredDebitMinor: declaredDebit == null ? null : declaredDebit.toString(),
      declaredNetMinor: declaredNet == null ? null : declaredNet.toString(),
      message,
    },
  };
}
