import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Label-grounding gate (permanent CI regression guard).
 *
 * Bug-class this closes: a committed Russian UI label that does NOT match the
 * moysklad gold-capture field label, undetected by every other gate (typecheck /
 * biome / i18n-key-existence / no-hardcoded all pass — none of them check that a
 * label's VALUE matches moysklad). Root failure mode: "grounding" a label on a
 * grep COUNT, a sibling-mirror, or a paraphrase instead of reading the capture
 * DOM element ROLE. Real misses found 2026-06-04: variant buy-price labelled
 * «Себестоимость» (a promo-banner word, not a field label); counterparty fields
 * labelled «Поставщик»/«Покупатель» (doc/column names) instead of «Контрагент»
 * (the field label); cash-order reason «Назначение платежа» instead of «Основание»;
 * planned-pay-date «Срок оплаты» instead of «План. дата оплаты»; retail cash-out
 * «Изъятие» instead of «Выплата».
 *
 * Two parts, both designed to be non-flaky (no fuzzy full-scan):
 *  1. GROUNDING-LOCK — a curated registry of (capture → verified field-role labels);
 *     each must still appear in that capture as an element's exact text content
 *     (`>LABEL<`) or a column-header `title="LABEL"`. A banner/help-text occurrence
 *     (e.g. `…Маржа и Себестоимость</p>`) does NOT satisfy `>LABEL<`, so this is the
 *     precise check the «Себестоимость» error failed.
 *  2. REGRESSION-LOCK — the corrected labels (value + page wiring) cannot silently
 *     revert to the pre-fix term.
 *
 * To ADD a label here you must FIRST read the capture DOM and confirm the term is
 * the element content for that field (role), never a grep count. See CLAUDE.md
 * "Label grounding discipline".
 */

const SRC = join(__dirname, '..');
const CAPTURES = join(SRC, '..', '..', '..', 'docs', 'moysklad-reference', 'visual-captures');
const RU = JSON.parse(readFileSync(join(SRC, 'messages', 'ru.json'), 'utf8'));
const UZ = JSON.parse(readFileSync(join(SRC, 'messages', 'uz.json'), 'utf8'));

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const lookup = (obj: unknown, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (a, k) => (a && typeof a === 'object' ? (a as Record<string, unknown>)[k] : undefined),
      obj,
    );
const capture = (dir: string, file = 'dom-default.html') =>
  readFileSync(join(CAPTURES, dir, file), 'utf8');
const REF = join(SRC, '..', '..', '..', 'docs', 'moysklad-reference');
/** Reads a v2.2 detail (edit-form) capture at docs/moysklad-reference/<module>/detail/<file>.
 *  These are the create-form captures used to ground edit-form FIELD labels on the
 *  data-empty paid account (openCreateForm() fallback in capture-moysklad-references.ts,
 *  2026-06-11) — the only way to read an edit-form label when no document of that type
 *  exists in the tenant. */
const detailCapture = (module: string, file = 'edit-default.html') =>
  readFileSync(join(REF, module, 'detail', file), 'utf8');
const pageSrc = (route: string) =>
  readFileSync(join(SRC, 'app', '(app)', route, 'page.tsx'), 'utf8');

/** A label is "grounded as a field-role element" if it is the exact text content of
 *  some DOM element (`>LABEL<`) or a column-header title attribute (`title="LABEL"`).
 *  Banner / help-text occurrences (label mid-sentence) deliberately do NOT match. */
function groundedAsField(dom: string, label: string): boolean {
  const e = esc(label);
  return new RegExp(`>\\s*${e}\\s*<`).test(dom) || dom.includes(`title="${label}"`);
}

// ── 1. GROUNDING-LOCK ─────────────────────────────────────────────────────────
// Every entry was verified by reading the capture DOM (element role), 2026-06-04.
const GROUNDING: Array<{ capture: string; labels: string[]; file?: string }> = [
  { capture: '02-module/invoicein', labels: ['Контрагент', 'План. дата оплаты', 'Входящий номер'] },
  { capture: '03-module/invoiceout', labels: ['Контрагент', 'План. дата оплаты'] },
  { capture: '02-module/purchaseorder', labels: ['Контрагент', 'Принято'] },
  { capture: '07-module/cashin', labels: ['Основание', 'Контрагент'] },
  { capture: '07-module/cashout', labels: ['Основание'] },
  { capture: '07-module/paymentout', labels: ['Контрагент'] },
  { capture: '02-module/supply', labels: ['Контрагент'] },
  { capture: '03-module/salesreturn', labels: ['Контрагент'] },
  { capture: '02-module/purchasereturn', labels: ['Контрагент'] },
  { capture: '03-module/customerorder', labels: ['Контрагент'] },
  // L4 stock/internal LIST grids (2026-06-04, DOM-role: sortable grid header-content title=).
  {
    capture: '06-module/move',
    labels: ['Изменения', 'Время', 'Со склада', 'На склад', 'Организация', 'Сумма'],
  },
  { capture: '06-module/enter', labels: ['Время', 'На склад', 'Организация', 'Сумма'] },
  { capture: '06-module/loss', labels: ['Время', 'Со склада', 'Организация', 'Сумма'] },
  { capture: '06-module/inventory', labels: ['Время', 'Со склада', 'Организация'] },
  { capture: '06-module/internalorder', labels: ['Время', 'Организация', 'Сумма', 'Отгружено'] },
  // retail drawer labels live in the on-shift sub-state capture (the smena dropdown),
  // not the list-view dom-default.html.
  {
    capture: '08-module/retailshift',
    file: 'dom/01-default.html',
    labels: ['Выплата', 'Внесение'],
  },
  // L5 production LIST grids (2026-06-04, DOM-role from the CLEAN capture —
  // the entity root dom-default.html / list 01-default.html are CONTAMINATED
  // (Корзина / Заказы покупателей), only dom/00-clean-default.html renders the
  // real grid header row [title="LABEL"]).
  {
    capture: '10-module/processing',
    file: 'dom/00-clean-default.html',
    labels: [
      'Время',
      'Организация',
      'Технологическая карта',
      'Объем производства',
      'Себестоимость',
    ],
  },
  {
    capture: '10-module/processingplan',
    file: 'dom/00-clean-default.html',
    labels: ['Наименование', 'Оплата труда', 'Затраты на производство', 'Комментарий'],
  },
  {
    capture: '10-module/processingprocess',
    file: 'dom/00-clean-default.html',
    labels: ['Наименование', 'Описание'],
  },
  {
    capture: '10-module/productiontask',
    file: 'dom/00-clean-default.html',
    labels: [
      'Время',
      'Организация',
      'Начало производства',
      'Завершение производства',
      'Запланировано',
      'Произведено',
      'Комментарий',
    ],
  },
  // L12 settings-org LIST grids (2026-06-05). Unlike the rest of L12 (no usable
  // capture), uoms + projects HAVE a §4-CLEAN capture: dom/00-clean-default.html
  // renders the real grid header row as element content (`>LABEL<`) + title="LABEL"
  // (the entity-root dom-default.html bodies are contaminated, but this clean file
  // is the grid). DOM-role verified 2026-06-05.
  {
    capture: '04-module/uom',
    file: 'dom/00-clean-default.html',
    labels: ['Тип', 'Краткое наименование', 'Полное наименование', 'Цифровой код'],
  },
  {
    capture: '00-module/project',
    file: 'dom/00-clean-default.html',
    labels: ['Наименование', 'Код', 'Описание'],
  },
  // Stock cluster column headers (2026-06-12, in-transit products-list slice).
  // DOM-role: the stock-report grid renders all four as `gwt-Label header">LABEL`
  // (01-default.html is the populated grid; dom-default/clean carry only the
  // column-customizer «Ожидание» checkbox). Pins moysklad's in-transit column
  // label = «Ожидание» — NOT «В пути», which appears NOWHERE as a header/cell
  // (the report had drifted to «В пути»; corrected to «Ожидание» 2026-06-12).
  // Grounds the stock-balance report columns («Склад → Остатки»). NB the
  // products LIST does NOT carry these — moysklad's «Товары и услуги» has no
  // stock columns (verified live 2026-06-16). The former products-list «Ожидание»
  // grounding entry was based on the CONTAMINATED 04-module/product capture (its
  // <title> is «Заказы покупателей»/«Корзина», not products) and was removed.
  {
    capture: '06-module/stock-report',
    file: 'dom/01-default.html',
    labels: ['Остаток', 'Резерв', 'Ожидание', 'Доступно'],
  },
];

describe('label-grounding: curated labels appear in their capture as field-role elements', () => {
  for (const { capture: dir, labels, file } of GROUNDING) {
    it(`${dir} grounds: ${labels.join(', ')}`, () => {
      const dom = capture(dir, file);
      const ungrounded = labels.filter((l) => !groundedAsField(dom, l));
      expect(
        ungrounded,
        `These labels are NOT a field-role element in ${dir}/dom-default.html (only banner/help text, or absent) — the «Себестоимость» bug-class:\n${ungrounded.join('\n')}`,
      ).toEqual([]);
    });
  }
});

// ── 1b. GROUNDING-LOCK (v2.2 EDIT-FORM captures) ───────────────────────────────
// Edit-form FIELD labels grounded against the create-form capture (the data-empty
// paid account renders every field label on «+ Создать» — openCreateForm fallback).
// 2026-06-11 internalorder: read the create form's DOM element content AND verified
// against the rendered screenshot (docs/moysklad-reference/internalorder/detail/
// edit-default.png): the warehouse field is «Склад» (NOT «Целевой склад»/the
// api-docs «Склад назначения») and the planned date is «План. дата приемки» (no ё,
// as moysklad renders it — NOT «...поставки»/the api-docs description «...поступления»).
const GROUNDING_DETAIL: Array<{ module: string; labels: string[]; file?: string }> = [
  { module: 'internalorder', labels: ['Склад', 'План. дата приемки', 'Организация'] },
  // Counterparty «Фактический»/«Юридический адрес» structured sub-form (2026-06-24).
  // DOM-role grounded: each appears as `>LABEL<` (gwt-Label element content) in BOTH
  // address blocks of counterparties/detail/edit-default.html. Drives the
  // CounterpartyAddressGroup field labels (Индекс…Другое).
  {
    module: 'counterparties',
    labels: ['Индекс', 'Страна', 'Город', 'Улица', 'Дом', 'Квартира/Офис', 'Другое'],
  },
];

describe('label-grounding: edit-form field labels appear in their detail capture', () => {
  for (const { module, labels, file } of GROUNDING_DETAIL) {
    it(`${module} (detail) grounds: ${labels.join(', ')}`, () => {
      const dom = detailCapture(module, file);
      const ungrounded = labels.filter((l) => !groundedAsField(dom, l));
      expect(
        ungrounded,
        `These labels are NOT a field-role element in ${module}/detail/${file ?? 'edit-default.html'} — re-capture or re-ground:\n${ungrounded.join('\n')}`,
      ).toEqual([]);
    });
  }
});

// ── 2. REGRESSION-LOCK ────────────────────────────────────────────────────────
// (a) i18n VALUE locks — the corrected RU values cannot revert.
const VALUE_LOCKS: Array<{ key: string; ru: string }> = [
  { key: 'fields.agent', ru: 'Контрагент' },
  { key: 'fields.basis', ru: 'Основание' },
  { key: 'fields.payment_planned', ru: 'План. дата оплаты' },
  { key: 'fields.received_sum', ru: 'Принято' },
  { key: 'pages.cashier_sessions.drawer_out', ru: 'Выплата' },
  { key: 'pages.cashier_sessions.drawer_in', ru: 'Внесение' },
  { key: 'pages.variants.buy_price_label', ru: 'Закупочная цена' },
  { key: 'pages.product_new.buy_price_label', ru: 'Закупочная цена' },
  // L5 production list grid-header keys (2026-06-04, DOM-role grounded).
  { key: 'pages.processing.col_output_volume', ru: 'Объем производства' },
  { key: 'pages.processes.col_description', ru: 'Описание' },
  // L6 catalog list folder-column header (2026-06-04). NOT capture-grounded —
  // all 04-module catalog list captures are CONTAMINATED (render «Заказы
  // покупателей»/«Корзина»); this is PRODUCTS-PARITY: products list column +
  // the «Группа товаров» filter + products_new.folder_label all use «Группа»,
  // so bundles/services must not revert to the outlier «Папка».
  { key: 'pages.bundles.folder', ru: 'Группа' },
  { key: 'pages.services.folder', ru: 'Группа' },
  // L12 settings-org: uoms list column labels — DOM-role GROUNDED against the
  // §4-clean 04-module/uom/dom/00-clean-default.html grid (see GROUNDING above).
  // col_name is shared with the uoms detail/new form (the name field IS the short
  // name), so «Краткое наименование» is correct there too.
  { key: 'pages.uom_admin.col_type', ru: 'Тип' },
  { key: 'pages.uom_admin.col_name', ru: 'Краткое наименование' },
  { key: 'pages.uom_admin.col_full_name', ru: 'Полное наименование' },
  { key: 'pages.uom_admin.col_code', ru: 'Цифровой код' },
  // L12: users job-title column was mislabelled «Статус» (tFields('state')); the
  // dedicated «Должность» key already existed and is the grounded value.
  { key: 'pages.user_admin.col_position', ru: 'Должность' },
  // Internal-order edit-form labels (IO-3 / IO-4) — DOM-role grounded against the
  // 2026-06-11 create-form capture (GROUNDING_DETAIL «internalorder» above) +
  // rendered screenshot. Was «Целевой склад» / «Планируемая дата поставки» (our own
  // coinage; «поставки» = shipment-OUT, semantically wrong for an inbound request).
  { key: 'pages.internal_order.destination_store', ru: 'Склад' },
  { key: 'pages.internal_order.delivery_planned', ru: 'План. дата приемки' },
  // In-transit stock column (2026-06-12) — moysklad's label is «Ожидание»
  // (DOM-grounded as a grid header in the stock-report capture, GROUNDING above).
  // The report had drifted to «В пути» (which is NOT a moysklad header/cell);
  // both the products-list column and the report column now use «Ожидание».
  { key: 'fields.in_transit', ru: 'Ожидание' },
  { key: 'pages.report_stock_balance.in_transit', ru: 'Ожидание' },
  // Counterparty structured-address field labels (2026-06-24) — DOM-role grounded
  // against counterparties/detail/edit-default.html (GROUNDING_DETAIL «counterparties»).
  { key: 'pages.counterparty_new.addr_index', ru: 'Индекс' },
  { key: 'pages.counterparty_new.addr_country', ru: 'Страна' },
  { key: 'pages.counterparty_new.addr_city', ru: 'Город' },
  { key: 'pages.counterparty_new.addr_street', ru: 'Улица' },
  { key: 'pages.counterparty_new.addr_house', ru: 'Дом' },
  { key: 'pages.counterparty_new.addr_apartment', ru: 'Квартира/Офис' },
  { key: 'pages.counterparty_new.addr_other', ru: 'Другое' },
  // Bank-account code field (2026-06-24) — moysklad.uz LABELS it «БИК» (live capture
  // org-accounts-live-2026-06-21/20-org-open.txt; identical bank-account sub-form for
  // org + counterparty). The previous «МФО» was a §4 grounding miss (the column is
  // internally `mfo`, but the displayed label is «БИК»). Locked so it cannot revert.
  { key: 'pages.counterparty_new.bank_bik_label', ru: 'БИК' },
  // Product «Упаковка» tab pack-row column «Тип кода» (2026-06-24) — DOM-role
  // grounded against a live moysklad product card: it renders as the pack-table
  // column header element `>Тип кода<` (capture screenshot docs/audits/
  // product-pack-live-2026-06-24/51b-pack-tab-full.png; value "EAN13"). It is the
  // barcode SYMBOLOGY of the pack's barcode — NOT «Код упаковки ТАСНИФ» (a separate
  // product-level «Особенности учёта» field, which is NOT a pack-row column).
  { key: 'product_detail_widget.pack_col_codetype', ru: 'Тип кода' },
];

describe('label-grounding: corrected RU label values are locked', () => {
  for (const { key, ru } of VALUE_LOCKS) {
    it(`${key} = «${ru}» (ru) and the key exists in uz`, () => {
      expect(lookup(RU, key), `${key} drifted from the capture-grounded value`).toBe(ru);
      expect(typeof lookup(UZ, key), `${key} missing in uz.json`).toBe('string');
    });
  }
});

// (b) PAGE-WIRING locks — the counterparty/cash fields point at the corrected key.
describe('label-grounding: counterparty + cash-order fields use the grounded i18n key', () => {
  // The counterparty field on these detail/new pages must read «Контрагент»
  // (tFields('agent')) — NOT the document/column term «Поставщик»/«Покупатель».
  const COUNTERPARTY_AGENT = [
    'invoices-in/[id]',
    'invoices-in/new',
    'invoices-out/[id]',
    'invoices-out/new',
    'purchase-orders/[id]',
    'purchase-orders/new',
    'supplies/[id]',
    'supplies/new',
    'sales-returns/[id]',
    'sales-returns/new',
    'purchase-returns/[id]',
    'purchase-returns/new',
    'customer-orders/[id]',
    'customer-orders/new',
  ];
  for (const route of COUNTERPARTY_AGENT) {
    it(`${route} counterparty field uses tFields('agent'), not supplier/customer`, () => {
      const src = pageSrc(route);
      expect(src).toContain("tFields('agent')");
      expect(src, 'counterparty field must not revert to «Поставщик»').not.toContain(
        "tFields('supplier')",
      );
      expect(src, 'counterparty field must not revert to «Покупатель»').not.toContain(
        "tFields('customer')",
      );
    });
  }

  // The cash-order reason field must read «Основание» (tFields('basis')), NOT the
  // payment-doc term «Назначение платежа» (tFields('payment_purpose')).
  for (const route of ['cash-in/[id]', 'cash-in/new', 'cash-out/[id]', 'cash-out/new']) {
    it(`${route} reason field uses tFields('basis'), not payment_purpose`, () => {
      const src = pageSrc(route);
      expect(src).toContain("tFields('basis')");
      expect(src, 'cash-order reason must not revert to «Назначение платежа»').not.toContain(
        "tFields('payment_purpose')",
      );
    });
  }
});

// (c) L4 stock/internal LIST grid header keys — lock the 2026-06-04 grid-label fixes
// (date «Дата»→«Время», money «Себестоимость»→«Сумма», 'Pos.'→«Позиции») against revert.
describe('label-grounding: L4 stock/internal list grids use grounded column-header keys', () => {
  const L4 = ['moves', 'enters', 'losses', 'inventories', 'internal-orders'];
  for (const route of L4) {
    it(`${route} list date column = «Время» (tFields('time')); no hardcoded 'Pos.' literal`, () => {
      const src = pageSrc(route);
      expect(
        src,
        "date grid column must use tFields('time')=«Время», not tFields('moment')=«Дата»",
      ).toContain("tFields('time')");
      expect(src, "positions header must be i18n'd, not the Latin 'Pos.' literal").not.toContain(
        "header: 'Pos.'",
      );
    });
  }
  for (const route of ['moves', 'enters', 'losses', 'inventories']) {
    it(`${route} list money column = «Сумма» (tFields('sum')), not «Себестоимость» (cost)`, () => {
      const src = pageSrc(route);
      expect(
        src,
        "money grid header must be tFields('sum')=«Сумма», not tFields('cost')=«Себестоимость»",
      ).not.toContain("header: tFields('cost')");
    });
  }
});

// (d) L5 production LIST grid header keys — lock the 2026-06-04 grid-label fixes
// (DOM-role grounded against 10-module/*/dom/00-clean-default.html) against revert.
describe('label-grounding: L5 production list grids use grounded column-header keys', () => {
  // Document-doc lists: the date column is moysklad «Время» (tFields('time')),
  // NOT «Дата» (tFields('moment')); the doc-number header is i18n'd «№».
  for (const route of ['productions', 'processings', 'processing-orders']) {
    it(`${route} list date column = «Время» (tFields('time')) and № header is i18n'd`, () => {
      const src = pageSrc(route);
      expect(src, "date grid column must use tFields('time')=«Время»").toContain("tFields('time')");
      expect(
        src,
        "doc-number header must route through tFields('number'), not a raw literal",
      ).toContain("tFields('number')");
      expect(src, "doc-number header must not be the raw '№' literal").not.toContain("header: '№'");
    });
  }
  it("processings cost column = «Себестоимость» (tFields('cost')), not the verbose cost_basis", () => {
    const src = pageSrc('processings');
    expect(src).toContain("tFields('cost')");
    expect(
      src,
      'cost grid header must not revert to the verbose «База себестоимости…» (cost_basis)',
    ).not.toContain("header: t('cost_basis')");
    expect(src, 'processings must render the «Организация» column (data-present)').toContain(
      "tFields('organization')",
    );
    expect(src, 'output-volume column must use the grounded col_output_volume key').toContain(
      "t('col_output_volume')",
    );
  });
  it('processes list renders the «Описание» column (col_description)', () => {
    expect(pageSrc('production/processes')).toContain("t('col_description')");
  });
  it('work-orders list uses formatDate/formatDateOnly (no raw toLocaleDateString)', () => {
    const src = pageSrc('production/work-orders');
    expect(src, 'work-orders date cells must use the shared formatter').toContain('formatDateOnly');
    expect(src, "work-orders must not use raw toLocaleDateString('uz-UZ')").not.toContain(
      "toLocaleDateString('uz-UZ')",
    );
    expect(src, 'work-orders must render the «Время» (createdAt) doc-date column').toContain(
      "tFields('time')",
    );
  });
});

// (e) L6 catalog LIST wiring keys — lock the 2026-06-04 catalog list fixes against
// revert. All 04-module catalog list captures are CONTAMINATED (§4), so these are
// PRODUCTS-PARITY / intrinsic wiring locks (no capture GROUNDING entry possible).
describe('label-grounding: L6 catalog list wiring is locked', () => {
  // Money cells: bundles/services/variants must render list prices WITHOUT the
  // «сум» suffix (formatMoney displayAs:'none'), matching the products reference
  // + the project-wide list convention — not the bare formatMoney(price) form.
  for (const route of ['bundles', 'services', 'variants']) {
    it(`${route} price cell uses formatMoney(..., { displayAs: 'none' }) (no « сум» suffix)`, () => {
      const src = pageSrc(route);
      expect(src, 'list money cell must suppress the currency suffix').toContain(
        "displayAs: 'none'",
      );
      expect(
        src,
        'list money cell must not revert to the bare suffix-appending call',
      ).not.toContain('formatMoney(price)');
    });
  }

  // product-folders tree: all chrome must be i18n'd — no Latin-uz literals, and
  // the inherit-VAT checkbox must use the descriptive label (not «НДС ←»).
  it('product-folders has no hardcoded Latin-uz leaks and uses descriptive VAT label', () => {
    const src = pageSrc('product-folders');
    for (const leak of [
      'Yopish',
      'Ochish',
      'NDSsiz',
      'otadan',
      'Nomi majburiy',
      "{tFields('vat')} ←",
    ]) {
      expect(src, `product-folders must not contain the Latin-uz leak «${leak}»`).not.toContain(
        leak,
      );
    }
    expect(src, 'inherit-VAT checkbox must use the descriptive use_parent_vat key').toContain(
      "t('use_parent_vat')",
    );
  });

  // tracking-codes: cursor pagination must be wired (not hard-disabled) and a
  // sortable Создано column must render so the default sortKey is visible.
  it('tracking-codes wires cursor pagination + renders a sortable createdAt column', () => {
    const src = pageSrc('tracking-codes');
    expect(src, 'pagination must read the real nextCursor, not be hard-disabled').toContain(
      'hasNext={!!data?.nextCursor}',
    );
    expect(src, 'pagination must not revert to the hard-disabled hasNext={false}').not.toContain(
      'hasNext={false}',
    );
    expect(src, 'a sortable createdAt column must render (default sortKey visible)').toContain(
      "key: 'createdAt'",
    );
  });
});

// (f) L7 CRM LIST wiring — lock the 2026-06-05 CRM list fixes against revert. No
// clean moysklad list capture exists for these (counterparties has only a PNG
// screenshot; opportunities/tasks/pipelines have none), so per §4 these are
// SIBLING-PARITY / intrinsic wiring locks — NOT capture-DOM GROUNDING entries.
describe('label-grounding: L7 CRM list wiring is locked', () => {
  // counterparties: the 4 gear-column headers must stay i18n keys (the
  // no-hardcoded gate never scans list pages, so a hardcoded header is
  // gate-blind). The mixed-script «STIR / ИНН» literal and the Latin-uz
  // typeLabel map (which leaked Uzbek into the RU «Тип контрагента» filter)
  // must not return.
  it('counterparties column headers + company-type labels are i18n-keyed', () => {
    const src = pageSrc('counterparties');
    for (const lit of [
      "header: 'Юр. название'",
      "header: 'Тип'",
      "header: 'STIR / ИНН'",
      "header: 'Контакт'",
    ]) {
      expect(src, `header must be keyed, not the literal ${lit}`).not.toContain(lit);
    }
    expect(src, 'inn column must use the per-locale col_inn key (ru «ИНН» / uz «STIR»)').toContain(
      "t('col_inn')",
    );
    expect(src, 'company-type labels must be localized, not the Latin-uz literal').not.toContain(
      "'Yuridik shaxs'",
    );
    expect(src, 'company-type labels must route through t()').toContain("t('type_legalUZ')");
  });

  // opportunities + tasks: shared date helpers (no raw toLocaleDateString); the
  // «Создано» (createdAt) column renders date+time via the shared formatDate,
  // matching every sibling list.
  for (const route of ['opportunities', 'tasks']) {
    it(`${route} list uses shared formatDate/formatDateOnly (no raw ru-RU helper)`, () => {
      const src = pageSrc(route);
      expect(src, 'must not define/use a raw ru-RU date helper').not.toContain(
        "toLocaleDateString('ru-RU'",
      );
      expect(src, 'createdAt column must use shared formatDate (date+time)').toContain(
        'formatDate(',
      );
    });
  }

  // opportunities money cell suppresses the currency suffix (project-wide list
  // convention), like every multi-currency sibling list cell (cash-in/moves/…).
  it("opportunities amount cell uses formatMoney(..., { displayAs: 'none' })", () => {
    expect(pageSrc('opportunities'), 'list money cell must suppress the currency suffix').toContain(
      "displayAs: 'none'",
    );
  });

  // Chrome parity: the 4 CRM lists wire onRefresh + createPosition='start'
  // (the master-data counterparties convention; 30-40 sibling pages).
  for (const route of ['opportunities', 'tasks', 'contact-persons', 'pipelines']) {
    it(`${route} list wires onRefresh + createPosition='start'`, () => {
      const src = pageSrc(route);
      expect(src, 'must wire the ↻ refresh control').toContain('onRefresh={() => refetch()}');
      expect(src, 'create button must be pinned to start (moysklad parity)').toContain(
        'createPosition="start"',
      );
    });
  }

  // richEmpty onboarding card wired for the 3 create-capable CRM lists (pipelines
  // has no empty_rich_* keys → correctly omitted).
  for (const route of ['opportunities', 'tasks', 'contact-persons']) {
    it(`${route} list wires the richEmpty onboarding CTA`, () => {
      expect(pageSrc(route), 'create-capable list must render the rich empty-state CTA').toContain(
        'richEmpty={{',
      );
    });
  }
});

// L8 e-commerce/pricing lists — REGRESSION-LOCK only. §4 NOTE: every L8 moysklad
// capture is CONTAMINATED (saleschannel + pricelist 00-clean-default.html both
// carry a customer-order form body despite the right <title>; pricetype <title>
// is «Заказы покупателей») → NO capture-grounding, NO GROUNDING-LOCK entry; these
// are intrinsic code-correctness locks (money/date helper wiring), not label values.
describe('label-grounding: L8 e-commerce/pricing list money/date helper wiring is locked', () => {
  // ecommerce/orders: the inbound-order money cell must use the shared BigInt-safe
  // formatMoney (displayAs:'none', list-cell convention) — never the old
  // Number(sumMinor)/100 + uz-UZ-suffix helper (precision loss + wrong separator).
  it('ecommerce/orders sum cell uses formatMoney (no Number()/100 money helper)', () => {
    const src = pageSrc('ecommerce/orders');
    expect(src, 'list money cell must suppress the currency suffix').toContain("displayAs: 'none'");
    expect(src, 'must not hand-roll Number(sumMinor)/100 money formatting').not.toContain(
      'Number(sumMinor) / 100',
    );
  });

  // ecommerce/orders + ecommerce/channels timestamps render through the shared
  // formatDate (dedup + NaN-guard) — never a raw new Date(x).toLocaleDateString.
  for (const route of ['ecommerce/orders', 'ecommerce/channels']) {
    it(`${route} list renders timestamps via shared formatDate (no raw toLocaleDateString)`, () => {
      const src = pageSrc(route);
      expect(src, 'timestamp cell must use the shared formatDate helper').toContain('formatDate(');
      expect(src, 'must not hand-roll new Date(x).toLocaleDateString()').not.toContain(
        ".toLocaleDateString('uz-UZ')",
      );
    });
  }
});

// L9 HR lists — REGRESSION-LOCK only. §4 NOTE: hr/employees HAS a clean moysklad
// «Сотрудники» capture, but its richer HR column set (avatar/Roles/Telegram/
// Department) is an INTENTIONAL redesign — there is NO column-parity to lock, so
// no GROUNDING entry. hr/payroll is a BESPOKE 6-tab dashboard with NO moysklad
// reference. These are intrinsic code-correctness locks (the money formatter +
// the payroll action-mutation refresh/error wiring my ground-truth pass found),
// NOT label values. The ISO-vs-DD.MM date divergence was adversarially REFUTED
// (bespoke page, no parity mandate, TZ-explicit) → deliberately NOT locked.
describe('label-grounding: L9 HR payroll intrinsic wiring is locked', () => {
  it('fmtMinor never renders "-0" for a negative sub-1-som value', () => {
    const src = pageSrc('hr/payroll');
    expect(src, 'fmtMinor must drop the sign once tiyin-truncation collapses to zero').toContain(
      "negative && grouped !== '0'",
    );
  });

  it('KpiTab receives qc and the snapshot mutation invalidates the daily list', () => {
    const src = pageSrc('hr/payroll');
    expect(src, 'KpiTab must receive qc so the table can refresh after a snapshot').toContain(
      'function KpiTab({ yearMonth, qc }',
    );
    expect(
      src,
      'snapshot must invalidate hr-kpi-daily so the table reflects the new row',
    ).toContain("invalidateQueries({ queryKey: ['hr-kpi-daily'] })");
  });

  it('payroll action mutations surface errors (no silent failure)', () => {
    const src = pageSrc('hr/payroll');
    // recompute-all (FinalTab), snapshot-today (KpiTab) and bonus-delete (BonusTab)
    // each wire an onError toast — they used to fail silently.
    const onErrorToasts = src.split("toast.error(tCommon('action_failed')").length - 1;
    expect(
      onErrorToasts,
      'computeMut + snapMut + removeMut must each surface an onError toast',
    ).toBeGreaterThanOrEqual(3);
  });
});

// L10 retail lists — REGRESSION-LOCK only. §4 NOTE: both retail list HTML captures
// (08-module/{retailshift,retaildemand}/dom/01-default.html) are CONTAMINATED
// (<title>Корзина</title>, customer-order positions-grid body) — the ONLY clean
// ground-truth is the PNG screenshots/00-clean-default.png (not parseable for a
// `>LABEL<` DOM-role check) → NO GROUNDING-LOCK entry; these are intrinsic
// gate-blind wiring locks (dead search box, hardcoded Latin-uz header, fetched-
// but-unrendered columns, money-cell suffix) my ground-truth pass + the engine found.
describe('label-grounding: L10 retail list wiring is locked', () => {
  // sessions search box was DEAD (`_search` computed, never threaded; BE had no
  // `search` field). Now wired end-to-end — lock both the FE threading and the
  // absence of the orphan `_search`.
  it('retail/sessions threads search into params + query key (no orphan _search)', () => {
    const src = pageSrc('retail/sessions');
    expect(src, 'debounced search must feed the query, not be an unused _search').not.toContain(
      '_search',
    );
    expect(src, 'search must be threaded into the request params').toContain(
      '...(search ? { search } : {})',
    );
    expect(src, 'search must be part of the query key so typing refetches').toContain(
      "['cashier-sessions', stateFilter, search, cursor, sortKey, sortDir]",
    );
  });

  // sessions state-column header was the hardcoded Latin-uz literal 'Holat'
  // (leaked into the RU locale; Cyrillic-only gate is blind to it).
  it("retail/sessions state header uses tCommon('status'), not the literal 'Holat'", () => {
    const src = pageSrc('retail/sessions');
    expect(src, "state header must be i18n-keyed via tCommon('status')").toContain(
      "header: tCommon('status')",
    );
    expect(src, "the hardcoded Latin-uz 'Holat' header must not return").not.toContain(
      "header: 'Holat'",
    );
  });

  // sessions «Склад» + «Организация» — BE list() fetches both (store +
  // organization) but the FE rendered neither; moysklad's clean PNG shows both.
  it('retail/sessions renders the fetched-but-unrendered «Склад» + «Организация» columns', () => {
    const src = pageSrc('retail/sessions');
    expect(src, "store column must render via tFields('store')=«Склад»").toContain(
      "tFields('store')",
    );
    expect(
      src,
      "organization column must render via tFields('organization')=«Организация»",
    ).toContain("tFields('organization')");
  });

  // money cells on both retail lists must suppress the per-row «сум» suffix
  // (project-wide list convention) and never export raw minor units in cellText.
  for (const route of ['retail/sessions', 'retail/sales']) {
    it(`${route} money cells use formatMoney(..., { displayAs: 'none' }) + formatted cellText`, () => {
      const src = pageSrc(route);
      expect(src, 'list money cell must suppress the currency suffix').toContain(
        "displayAs: 'none'",
      );
      expect(src, 'cellText must not export the raw minor-unit string').not.toContain(
        'cellText: (r) => r.sumMinor',
      );
    });
  }
});

// L11 settings-finance lists — REGRESSION-LOCK only. §4 NOTE: NO usable moysklad
// capture exists for ANY L11 page — the only currency capture (00-module/currency
// screenshots 01/04) is CONTAMINATED (<title>Корзина</title> trash list / Входящий
// платёж form, NOT the «Валюты» list) → NO GROUNDING-LOCK entry, NO label churn.
// The cohort's single confirmed defect was the tax-rates inert search box (a
// rendered placeholder + a no-op onSearchChange handler + the BE service silently
// dropping the schema's `search` field). Now wired end-to-end (FE threads search;
// BE matches rate-OR-comment — see api tax-rate.schema.test.ts). The other six
// pages audited CLEAN (bank-accounts/cash-desks real cursor pagination +
// BigInt-safe formatMoney; currencies bespoke inline-CRUD with a wired bulk
// dropdown; exchange-rates read-only CBU sync; mxik real cursor + import-only
// create) — nothing to lock. DEFER (low-cardinality, L8-discounts class):
// expense-items + tax-rates BE take:200 / FE hasNext={false} dead pagination.
describe('label-grounding: L11 settings-finance list wiring is locked', () => {
  it('settings/tax-rates wires the search box (no inert no-op handler)', () => {
    const src = pageSrc('settings/tax-rates');
    expect(src, 'search must be threaded into the request params').toContain(
      '...(search ? { search } : {})',
    );
    expect(src, 'search must be part of the query key so typing refetches').toContain(
      "['tax-rates', search, archived, sortKey, sortDir]",
    );
    expect(src, 'the inert no-op search handler must not return').not.toContain(
      'onSearchChange={() => undefined}',
    );
    expect(src, 'onSearchChange must feed the debounced searchInput state').toContain(
      'onSearchChange={(v) => setSearchInput(v)}',
    );
  });
});

// L12 settings-org lists (FINAL list cohort) — mixed. §4 NOTE: only uoms +
// projects have a §4-CLEAN capture (locked above via GROUNDING + VALUE_LOCKS);
// every other L12 page is sibling-parity only (no capture). These are the
// gate-blind intrinsic wiring locks my ground-truth pass + the engine found:
// publications whole-page Latin-uz leak, users mislabel/dead-search, task-types
// dead search box (BE supports it), webhooks dead cursor pagination, print-
// templates archive dead-end, label-templates dead sort.
describe('label-grounding: L12 settings-org list wiring is locked', () => {
  // publications LIST was a wholesale gate-blind Latin-uz leak (8 hardcoded
  // headers + a Latin-uz target-type map + Latin-uz status labels) — the detail
  // audit i18n'd only the [id]/new forms. Lock the de-leak: no Latin-uz header
  // literals; doc-type labels route through the shared detail_titles namespace.
  it('settings/publications has no hardcoded Latin-uz column headers/status labels', () => {
    const src = pageSrc('settings/publications');
    for (const leak of [
      "header: 'Hujjat turi'",
      "header: 'Havola'",
      "header: 'Holat'",
      "header: 'Yaratilgan'",
      "label: 'Bekor qilingan'",
      "label: 'Aktiv'",
    ]) {
      expect(src, `publications list must not contain the Latin-uz leak ${leak}`).not.toContain(
        leak,
      );
    }
    expect(src, 'doc-type column must localize via the shared detail_titles map').toContain(
      "useTranslations('detail_titles')",
    );
    expect(src, 'status labels must route through the i18n key, not a literal').toContain(
      "t('status_revoked')",
    );
  });

  // users: the job-title column used tFields('state')=«Статус» (duplicating the
  // real state column); it must use the dedicated «Должность» key. The page is
  // now wired to the real employee catalog (GET /hr/employees) with a live
  // debounced search (2026-06-06), so the inert no-op search handler must stay
  // gone and the «Должность» column must remain.
  it('settings/users labels the position column «Должность» and has no dead search box', () => {
    const src = pageSrc('settings/users');
    expect(src, "position column must use t('col_position')=«Должность»").toContain(
      "header: t('col_position')",
    );
    expect(src, 'the mislabel tFields(state) on the position column must not return').not.toContain(
      "header: tFields('state')",
    );
    expect(src, 'the inert no-op search handler must not return').not.toContain(
      'onSearchChange={() => undefined}',
    );
  });

  // task-types: the search box was inert (search="" + no-op onChange) even though
  // the BE TaskTypeService.list supports search-by-name. Now wired end-to-end.
  it('settings/task-types wires the search box (BE-supported, no inert handler)', () => {
    const src = pageSrc('settings/task-types');
    expect(src, 'search must thread into the request params').toContain(
      '...(search ? { search } : {})',
    );
    expect(src, 'the inert no-op search handler must not return').not.toContain(
      'onSearchChange={() => undefined}',
    );
    expect(src, 'archive/delete row actions must surface errors via useApiMutation').toContain(
      'useApiMutation',
    );
  });

  // webhooks: BE returns a real nextCursor + count, but the FE ignored it (rows
  // beyond the page were unreachable). Now threads the cursor like its siblings.
  it('settings/webhooks wires cursor pagination (real BE nextCursor honored)', () => {
    const src = pageSrc('settings/webhooks');
    expect(src, 'pagination must read the real nextCursor').toContain(
      'hasNext={!!data?.nextCursor}',
    );
    expect(src, 'cursor must be threaded into the request params').toContain(
      '...(cursor ? { cursor } : {})',
    );
  });

  // label-templates: name + createdAt carried sortable:true but no sort state was
  // threaded (DataTable renders them inert). Now wired (BE sortBy supports both).
  it('settings/label-templates threads sort state for its sortable columns', () => {
    const src = pageSrc('settings/label-templates');
    expect(src, 'sort state must feed the request params').toContain('sortBy: sortKey');
    expect(src, 'onSortChange must update the sort state').toContain('onSortChange={(key, dir)');
  });
});
