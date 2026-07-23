/**
 * Server-side HTML for the moysklad «Печать → Список X» list report — a clean,
 * bordered table of the whole (filtered) list. Rendered to a PDF by
 * {@link HtmlPdfService} and served INLINE, so the browser's native PDF viewer
 * shows it with page thumbnails, page navigation and print/download — a 1:1
 * match for moysklad's report-*.pdf. Self-contained (inline CSS, system fonts).
 */

export interface ListReportColumnDef<T> {
  header: string;
  /** Right-align (money / numeric columns). */
  numeric?: boolean;
  value: (row: T) => string;
}

// ── Shared cell formatters (reused by every doc type's list-report) ──────────
/** moysklad short currency names — «сум» / «доллар» / «евро» / «руб». */
export const REPORT_CURRENCY_LABEL: Record<string, string> = {
  UZS: 'сум',
  USD: 'доллар',
  EUR: 'евро',
  RUB: 'руб',
};

/** moysklad report money «1348000,00» — 2 decimals, comma, NO thousand grouping. */
export function reportMoney(minor: bigint | null | undefined): string {
  const v = minor ?? 0n;
  const neg = v < 0n;
  const abs = neg ? -v : v;
  return `${neg ? '-' : ''}${abs / 100n},${(abs % 100n).toString().padStart(2, '0')}`;
}

/**
 * Report timestamps render in Tashkent local time (moysklad-parity). ru-RU gives
 * «08.07.2026, 21:33[:37]» — drop the comma → «08.07.2026 21:33[:37]».
 */
export function reportDateTime(d: Date, withSeconds = false): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Tashkent',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' as const } : {}),
    hour12: false,
  })
    .format(d)
    .replace(',', '');
}

export interface ListReportInput<T> {
  /** Bold heading, e.g. «Заказы поставщикам». */
  title: string;
  /** «Создал» label. */
  createdByLabel: string;
  userName: string;
  userEmail: string;
  /** Pre-formatted «DD.MM.YYYY HH:MM:SS». */
  generatedAt: string;
  columns: ListReportColumnDef<T>[];
  rows: T[];
}

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c] ?? c);
}

const CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; color: #000; font-size: 11px;
    font-family: Arial, "Helvetica Neue", "DejaVu Sans", sans-serif; }
  h1.lr-title { font-size: 17px; font-weight: 700; margin: 0 0 4px; }
  .lr-meta { font-size: 11px; color: #444; margin: 0 0 14px; }
  table.lr { width: 100%; border-collapse: collapse; font-size: 11px; }
  table.lr th, table.lr td {
    border: 1px solid #9aa0a6; padding: 4px 8px; text-align: left; vertical-align: top; }
  table.lr th { font-weight: 700; white-space: nowrap; }
  table.lr th.num, table.lr td.num { text-align: right; white-space: nowrap; }
  /* Repeat the header row on every printed page + never split a row. */
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
`;

export function buildListReportHtml<T>(input: ListReportInput<T>): string {
  const head = input.columns
    .map((c) => `<th class="${c.numeric ? 'num' : ''}">${esc(c.header)}</th>`)
    .join('');
  const body = input.rows
    .map(
      (row) =>
        `<tr>${input.columns
          .map((c) => `<td class="${c.numeric ? 'num' : ''}">${esc(c.value(row))}</td>`)
          .join('')}</tr>`,
    )
    .join('');
  const email = input.userEmail ? ` (${esc(input.userEmail)})` : '';
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>${CSS}</style></head><body>
<h1 class="lr-title">${esc(input.title)}</h1>
<div class="lr-meta">${esc(input.createdByLabel)}: ${esc(input.userName)}${email} ${esc(input.generatedAt)}</div>
<table class="lr"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
</body></html>`;
}
