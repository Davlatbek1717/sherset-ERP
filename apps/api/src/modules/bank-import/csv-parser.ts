/**
 * CSV parser for Uzbek bank statements.
 *
 * Expected column set (header row is required, order is free):
 *   date              — dd.mm.yyyy OR yyyy-mm-dd
 *   amount            — decimal, dot or comma
 *   direction         — "in" / "out"  OR  "приход" / "расход"
 *   counterparty_inn  — STIR / INN
 *   counterparty_name — legal title
 *   counterparty_account — bank account number
 *   payment_purpose   — назначение платежа
 *   document_number   — bank order number
 *
 * Tolerant to:
 *   - BOM (stripped from the first field).
 *   - Quoted fields containing commas (RFC 4180 double-quote escaping).
 *   - Both LF and CRLF line endings.
 *   - Extra whitespace in cells.
 */

export interface ParsedRow {
  lineNumber: number;
  direction: 'in' | 'out';
  moment: Date;
  amountMinor: bigint;
  counterpartyName: string | null;
  counterpartyInn: string | null;
  counterpartyAccount: string | null;
  paymentPurpose: string | null;
  documentNumber: string | null;
  error: string | null;
}

export interface ParseResult {
  rows: ParsedRow[];
  headers: string[];
  skippedHeaderLines: number;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',' || ch === ';') {
        fields.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  fields.push(cur);
  return fields.map((f) => f.trim());
}

function parseDate(raw: string): Date | null {
  const s = raw.trim();
  // yyyy-mm-dd
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  // dd.mm.yyyy
  const dm = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (dm) return new Date(Date.UTC(Number(dm[3]), Number(dm[2]) - 1, Number(dm[1])));
  // dd/mm/yyyy
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (slash) return new Date(Date.UTC(Number(slash[3]), Number(slash[2]) - 1, Number(slash[1])));
  return null;
}

function parseDirection(raw: string): 'in' | 'out' | null {
  const s = raw.trim().toLowerCase();
  if (s === 'in' || s === 'приход' || s === 'кирим' || s === 'credit' || s === '+') return 'in';
  if (
    s === 'out' ||
    s === 'расход' ||
    s === 'чиқим' ||
    s === 'chiqim' ||
    s === 'debit' ||
    s === '-'
  )
    return 'out';
  return null;
}

function parseAmountMinor(raw: string): bigint | null {
  // Accept "1 234 567.89" or "1234567,89" — normalize to dot-decimal.
  const s = raw.replace(/\s+/g, '').replace(/,/g, '.');
  const m = /^(-?)(\d+)(?:\.(\d{1,6}))?$/.exec(s);
  if (!m) return null;
  const whole = BigInt(m[2] ?? '0');
  const frac = (m[3] ?? '').padEnd(2, '0').slice(0, 2);
  const minor = whole * 100n + BigInt(frac);
  return m[1] === '-' ? -minor : minor;
}

const HEADER_ALIASES: Record<string, string[]> = {
  date: ['date', 'дата', 'sana', 'moment'],
  amount: ['amount', 'сумма', 'summa'],
  direction: ['direction', 'направление', 'yonalish', 'тип', 'type'],
  counterparty_inn: ['counterparty_inn', 'inn', 'inn_kontragenta', 'stir', 'инн'],
  counterparty_name: ['counterparty_name', 'name', 'наименование', 'kontragent', 'контрагент'],
  counterparty_account: ['counterparty_account', 'account', 'счет', 'schyot', 'raschyot'],
  payment_purpose: ['payment_purpose', 'purpose', 'назначение', 'maqsad'],
  document_number: ['document_number', 'doc_number', 'номер', 'raqam'],
};

function resolveColumnIndex(headers: string[], canonical: string): number {
  const aliases = HEADER_ALIASES[canonical] ?? [canonical];
  const lower = headers.map((h) =>
    h
      .trim()
      .toLowerCase()
      .replace(/\uFEFF/g, ''),
  );
  for (const a of aliases) {
    const idx = lower.indexOf(a.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

export function parseBankStatementCsv(content: string): ParseResult {
  const lines = content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line, i) => i === 0 || line.trim().length > 0);

  if (lines.length === 0) {
    return { rows: [], headers: [], skippedHeaderLines: 0 };
  }

  const headerLine = lines[0] ?? '';
  const headers = parseCsvLine(headerLine);
  const idx = {
    date: resolveColumnIndex(headers, 'date'),
    amount: resolveColumnIndex(headers, 'amount'),
    direction: resolveColumnIndex(headers, 'direction'),
    inn: resolveColumnIndex(headers, 'counterparty_inn'),
    name: resolveColumnIndex(headers, 'counterparty_name'),
    acct: resolveColumnIndex(headers, 'counterparty_account'),
    purpose: resolveColumnIndex(headers, 'payment_purpose'),
    doc: resolveColumnIndex(headers, 'document_number'),
  };

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!line.trim()) continue;
    const cells = parseCsvLine(line);
    const lineNumber = i; // 1-based row number within body

    const get = (col: number) => (col >= 0 && col < cells.length ? (cells[col] ?? '').trim() : '');
    const errors: string[] = [];

    const dateRaw = get(idx.date);
    const moment = parseDate(dateRaw);
    if (!moment) errors.push(`invalid date: "${dateRaw}"`);

    const dirRaw = get(idx.direction);
    let direction = parseDirection(dirRaw);
    const amountRaw = get(idx.amount);
    const amountMinorRaw = parseAmountMinor(amountRaw);
    if (amountMinorRaw === null) errors.push(`invalid amount: "${amountRaw}"`);

    // If direction column is missing, infer from amount sign.
    if (!direction && amountMinorRaw !== null) {
      direction = amountMinorRaw < 0n ? 'out' : 'in';
    }
    if (!direction) errors.push(`invalid direction: "${dirRaw}"`);

    const amountMinor =
      amountMinorRaw === null ? 0n : amountMinorRaw < 0n ? -amountMinorRaw : amountMinorRaw;

    rows.push({
      lineNumber,
      direction: direction ?? 'in',
      moment: moment ?? new Date(0),
      amountMinor,
      counterpartyName: get(idx.name) || null,
      counterpartyInn: get(idx.inn) || null,
      counterpartyAccount: get(idx.acct) || null,
      paymentPurpose: get(idx.purpose) || null,
      documentNumber: get(idx.doc) || null,
      error: errors.length > 0 ? errors.join('; ') : null,
    });
  }

  return { rows, headers, skippedHeaderLines: 1 };
}
