/**
 * Built-in print templates used when an account has not authored a custom
 * PrintTemplate row for a given (entity, 'pdf') pair.
 *
 * Each template is an eta fragment (NOT a full HTML document): it renders a
 * single `<section class="doc">…</section>`. {@link wrapDocuments} composes
 * N fragments into one HTML document with shared CSS and a page break
 * between documents, so a bulk-print of N rows is a single Chrome render.
 *
 * Template syntax is the eval-free engine in safe-template.ts:
 * `{{= path }}` interpolation, `{{#each path}}`, `{{#if path}}/{{else}}`.
 * Context: `doc`, `counterparty`, `organization`, `positions`,
 * `hasPositions`, `positionsTotal`, `totalInWords`.
 */

/** Document titles per moysklad entity slug (Uzbek). Best-effort fallback —
 *  controllers normally pass an explicit title in the doc context. */
export const ENTITY_TITLES: Record<string, string> = {
  customerorder: 'Mijoz buyurtmasi',
  demand: 'Realizatsiya',
  invoiceout: 'Hisob-faktura (chiqim)',
  supply: 'Yetkazib berish',
  salesreturn: 'Mijozdan qaytarish',
  purchaseorder: "Ta'minotchiga buyurtma",
  purchasereturn: "Ta'minotchiga qaytarish",
  prepayment: 'Oldindan to‘lov',
  prepaymentreturn: 'Oldindan to‘lovni qaytarish',
  counterpartyadjustment: 'Kontragent hisob-kitobi',
  internalorder: 'Ichki buyurtma',
  processingorder: 'Ishlab chiqarish buyurtmasi',
  processing: 'Ishlab chiqarish',
  payroll: 'Ish haqi',
  pricelist: 'Narxlar ro‘yxati',
  workorder: 'Ish topshirig‘i',
  servicerequest: 'Xizmat so‘rovi',
};

/** Shared stylesheet — clean, print-oriented, moysklad-faithful layout. */
export const PAGE_CSS = `
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", Arial, "Helvetica Neue", sans-serif;
    font-size: 12px;
    color: #1a1a1a;
    margin: 0;
  }
  .doc { page-break-after: always; }
  .doc:last-child { page-break-after: auto; }
  .doc__head { margin-bottom: 8px; }
  .doc__org-line { font-size: 12px; color: #1a1a1a; line-height: 1.5; }
  .doc__org-name { font-weight: 700; text-decoration: underline; }
  .doc__org-phone { color: #1a1a1a; }
  .doc__title { font-size: 18px; font-weight: 700; margin: 40px 0 36px; text-align: center; text-transform: uppercase; }
  .doc__party { margin: 0 0 14px; padding-bottom: 3px; border-bottom: 1px solid #333; font-size: 12px; }
  .doc__party-name { }
  table.pos { width: 100%; border-collapse: collapse; margin: 8px 0 14px; font-size: 12px; }
  table.pos th, table.pos td { border: 1px solid #333; padding: 5px 8px; }
  table.pos th { background: #fff; text-align: center; font-weight: 700; }
  table.pos td.num, table.pos th.num { text-align: right; font-variant-numeric: tabular-nums; }
  table.pos tr.total td { font-weight: 700; }
  .doc__words { margin: 8px 0 14px; font-size: 13px; font-weight: 700; }
  .doc__summary { font-size: 14px; margin: 8px 0; }
  .doc__summary b { font-size: 16px; }
  .doc__desc { margin: 12px 0; color: #333; }
  .doc__desc-label { color: #777; font-size: 11px; text-transform: uppercase; }
`;

/**
 * Generic document fragment, modelled 1:1 on moysklad's "ЗАКАЗ" print form:
 * organization header (name + phone), a centered uppercase title with number
 * and date, the counterparty on an underlined line, a bordered positions
 * table whose "Jami" row carries the quantity and sum totals, and the payable
 * total spelled out in words. No signature block — matching moysklad.
 * Summary-only documents (no line items) fall back to a single total line.
 */
export const GENERIC_DOC_TEMPLATE = `
<section class="doc">
  <div class="doc__head">
    {{#if organization}}
    <div class="doc__org-line">
      <span class="doc__org-name">{{= organization.name }}</span>
      {{#if organization.phone}}<br /><span class="doc__org-phone">tel. {{= organization.phone }}</span>{{/if}}
    </div>
    {{/if}}
    <h1 class="doc__title">{{= doc.title }} № {{= doc.number }} — {{= doc.date }}</h1>
  </div>

  {{#if counterparty}}
  <div class="doc__party">Kontragent: <span class="doc__party-name">{{= counterparty.name }}</span></div>
  {{/if}}

  {{#if hasPositions}}
  <table class="pos">
    <thead>
      <tr>
        <th class="num" style="width:36px">№</th>
        <th>Tovar nomi</th>
        <th class="num" style="width:110px">Narx</th>
        <th class="num" style="width:70px">Soni</th>
        <th style="width:70px">O'lchov</th>
        <th class="num" style="width:120px">Summa</th>
      </tr>
    </thead>
    <tbody>
      {{#each positions}}
      <tr>
        <td class="num">{{= idx }}</td>
        <td>{{= name }}</td>
        <td class="num">{{= price }}</td>
        <td class="num">{{= qty }}</td>
        <td>{{= unit }}</td>
        <td class="num">{{= sum }}</td>
      </tr>
      {{/each}}
      <tr class="total">
        <td colspan="3" class="num">Jami:</td>
        <td class="num">{{= positionsQtyTotal }}</td>
        <td></td>
        <td class="num">{{= positionsTotal }}</td>
      </tr>
    </tbody>
  </table>
  {{else}}
  <div class="doc__summary">Summa: <b>{{= doc.sum }} {{= doc.currency }}</b></div>
  {{/if}}

  <div class="doc__words">Jami to'lov: {{= totalInWords }}</div>

  {{#if doc.description}}
  <div class="doc__desc">
    <div class="doc__desc-label">Izoh</div>
    <div>{{= doc.description }}</div>
  </div>
  {{/if}}
</section>
`;

/**
 * Resolve the built-in template body for an entity. Currently every entity
 * shares the generic template (it adapts to positions vs summary-only);
 * specialized layouts can be added per slug later without touching callers.
 */
export function defaultTemplateBody(_entity: string): string {
  return GENERIC_DOC_TEMPLATE;
}

/** Compose rendered document fragments into one printable HTML document. */
export function wrapDocuments(fragments: string[]): string {
  return `<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="utf-8" />
<style>${PAGE_CSS}</style>
</head>
<body>
${fragments.join('\n')}
</body>
</html>`;
}
