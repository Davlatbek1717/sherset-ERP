import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * products/[id] RIGHT tabbed widget lock (B5).
 *
 * DOM-grounded tab set (docs/audits/_B5-B6-DESIGN-GROUNDING-2026-06-13.md:24,
 * captured from the live product card): Цены · Модификации · Аналоги · Упаковка ·
 * Остатки · История · Файлы. The widget replaces the flat AttachmentsSection +
 * 2-tab audit DocumentTabs; the backable tabs are wired to existing endpoints.
 * Аналоги is a functional substitute-product list (GET/POST/DELETE
 * /products/:id/analogs + catalog picker); Упаковка is an editable pack table
 * (B5 pt7, wired to the product PATCH packs[] path).
 *
 * REGRESSION-LOCK — non-vacuous (fails against the pre-B5 source).
 */
const REPO = join(__dirname, '..', '..', '..', '..');
const widget = readFileSync(
  join(REPO, 'apps/web/src/components/product-detail-widget.tsx'),
  'utf8',
);
const page = readFileSync(join(REPO, 'apps/web/src/app/(app)/products/[id]/page.tsx'), 'utf8');
const ru = JSON.parse(readFileSync(join(REPO, 'apps/web/src/messages/ru.json'), 'utf8')) as {
  product_detail_widget?: Record<string, string>;
};
const uz = JSON.parse(readFileSync(join(REPO, 'apps/web/src/messages/uz.json'), 'utf8')) as {
  product_detail_widget?: Record<string, string>;
};

describe('products/[id] RIGHT tabbed widget (B5)', () => {
  it('renders the 7 DOM-grounded moysklad tabs', () => {
    for (const tab of [
      'tab-prices',
      'tab-variants',
      'tab-analogs',
      'tab-packaging',
      'tab-stock',
      'tab-history',
      'tab-files',
    ]) {
      expect(widget).toContain(`data-test-id="${tab}"`);
    }
  });

  it('wires the backable tabs to existing endpoints', () => {
    expect(widget).toMatch(/\/variants\?productId=\$\{productId\}/);
    expect(widget).toMatch(/\/reports\/stock-balance\?productId=\$\{productId\}/);
    expect(widget).toMatch(/\/reports\/product-movement\?productId=\$\{productId\}/);
    expect(widget).toMatch(/entity="Product"/);
    // Аналоги — functional: GET/POST/DELETE /products/:id/analogs + catalog picker.
    expect(widget).toMatch(/\/products\/\$\{productId\}\/analogs/);
    expect(widget).toMatch(/data-test-id="analogs-empty"/);
    expect(widget).toMatch(/data-test-id="analog-add"/);
    expect(widget).toMatch(/data-test-id="analog-row"/);
    // «Аналог» opens the rich «Выбор товара» modal in SELECTION mode (not a
    // plain search picker) — folder tree + filter + stock/country/weight columns.
    expect(widget).toMatch(/<ProductSelectModal/);
    expect(widget).toMatch(/selectionMode/);
    // Упаковка is an editable pack table — 1:1 with moysklad's columns:
    // Наименование · Количество · Ед.измерения (Combobox) · Тип кода (barcode
    // symbology ▾) · Штрихкод упаковки. «Код упаковки ТАСНИФ» is NOT a row column.
    expect(widget).toMatch(/data-test-id="pack-table"/);
    expect(widget).toMatch(/data-test-id="pack-add"/);
    expect(widget).toMatch(/data-test-id="pack-row"/);
    expect(widget).toMatch(/data-test-id="pack-codetype"/);
    expect(widget).toMatch(/BARCODE_TYPES\.map/);
    expect(widget).not.toMatch(/data-test-id="pack-tasnif"/);
    // История — two paginated sub-sections (Закупки / Продажи), 1:1 with moysklad:
    // borderless table + a «« ‹ N-M из T › »» pager per section + «№»/«Контрагент»
    // links. Movement query asks for up to 200 rows so the «из N» count is real.
    expect(widget).toMatch(/<MovementSection/);
    expect(widget).toMatch(/testId="hist-purchases"/);
    expect(widget).toMatch(/testId="hist-sales"/);
    expect(widget).toMatch(/data-test-id="movement-row"/);
    // moysklad embedded-table pager: «[‹‹][‹] N-M из T [›][››]» — the page count
    // CENTERED between square bordered arrow-button pairs (a dedicated local pager,
    // NOT the shared DS `Pagination moyskladStyle` count-left/plain-chevron style).
    expect(widget).not.toMatch(/<Pagination\b/);
    expect(widget).not.toMatch(/moyskladStyle/);
    expect(widget).toMatch(/data-test-id="movement-pager-first"/);
    expect(widget).toMatch(/data-test-id="movement-pager-last"/);
    expect(widget).toMatch(/<Icons\.pageFirst/);
    expect(widget).toMatch(/<Icons\.pageLast/);
    // the range «{from}-{to} из {total}» is centred (mx + text-center) between the arrows.
    expect(widget).toMatch(/\{pagerFrom\}-\{pagerTo\} \{tPager\('of'\)\} \{total\}/);
    expect(widget).toMatch(/mx-3 min-w-\[64px\] text-center/);
    expect(widget).toMatch(/counterparties\/\$\{row\.counterpartyId\}/);
    expect(widget).toMatch(/limit=200/);
    // moysklad pixel-grounded: 5 rows/page · brand-blue header underline ·
    // «Валюта» shows the currency display name («сум»), not the raw code.
    expect(widget).toMatch(/MOVEMENT_PAGE_SIZE = 5/);
    expect(widget).toMatch(/border-\[var\(--ms-text-brand\)\] border-b-2/);
    expect(widget).toMatch(/currencyDisplayName\(row\.currency\)/);
  });

  it('the Упаковка pack row has the moysklad FOCUSED-state controls', () => {
    // Live-grounded 2026-06-25 (docs/audits/product-pack-focus-PLAN-2026-06-25.md):
    // a focused pack row reveals — ⣿ drag handle, «↻» generate-barcode, «⊗» delete,
    // and the whole row turns pale yellow.
    // ⣿ grip drag handle (HTML5 DnD, mirroring DS PositionTable).
    expect(widget).toMatch(/data-test-id="pack-grip"/);
    expect(widget).toMatch(/<Icons\.grip/);
    expect(widget).toMatch(/onPackDragStart/);
    expect(widget).toMatch(/onPackDrop\b/);
    // whole row turns pale yellow while focused (moysklad #fffde7).
    expect(widget).toMatch(/focus-within:bg-\[#fffde7\]/);
    // 2px brand drop-indicator line at the target index (drag-to-reorder).
    expect(widget).toMatch(/border-t-2 border-t-\[var\(--ms-text-brand\)\]/);
    // «↻» generate-barcode reuses the shared genEan13 helper.
    expect(widget).toMatch(/data-test-id="pack-gen-barcode"/);
    expect(widget).toMatch(/regenPackBarcode/);
    expect(widget).toMatch(/genEan13\(\)/);
    expect(widget).toMatch(/import \{ BARCODE_TYPES, barcodeTypeLabel, genEan13 \}/);
    // «⊗» delete = the filled circle-x (Icons.rowDelete), not a bare «×».
    expect(widget).toMatch(/<Icons\.rowDelete/);
  });

  it('the pack name cell is a units-suggest + «+» create-unit (moysklad parity)', () => {
    // Live-grounded 2026-06-25 (focus-v8.json): the name field is a SuggestBox
    // over the unit-of-measure registry + a green «+» that creates a new unit.
    const nameCell = readFileSync(
      join(REPO, 'apps/web/src/components/products/pack-name-cell.tsx'),
      'utf8',
    );
    // wired into the pack row, fed the same uom reference the «Ед.измерения» uses.
    expect(widget).toMatch(/<PackNameCell/);
    expect(widget).toMatch(/uomItems=\{uomItems\}/);
    // the green «+» opens the create-unit modal, prefilled with the typed text.
    expect(widget).toMatch(/setUnitModal\(\{ packId: p\.id, name: prefill \}\)/);
    expect(widget).toMatch(/data-testid="pack-unit-modal"|testId="pack-unit-modal"/);
    // «+» → POST /uoms → refetch the units reference → name = the new unit.
    expect(widget).toMatch(/api\.post\('\/uoms'/);
    expect(widget).toMatch(/invalidateQueries\(\{ queryKey: \['uoms', 'all'\] \}\)/);
    // the cell itself: free-text input (keeps custom names) + suggest list + «+».
    expect(nameCell).toMatch(/data-test-id="pack-name-suggest"/);
    expect(nameCell).toMatch(/data-test-id="pack-name-create-unit"/);
    expect(nameCell).toMatch(/Popover/);
  });

  it('the detail page mounts the widget and drops the flat sections', () => {
    expect(page).toMatch(/<ProductDetailWidget/);
    expect(page).toMatch(/buyPrice=\{data\.buyPrice\}/);
    expect(page).not.toMatch(/<DocumentTabs/);
    expect(page).not.toMatch(/<AttachmentsSection/);
  });

  it('the product_detail_widget i18n namespace is complete ru+uz', () => {
    const keys = [
      'tab_prices',
      'tab_variants',
      'tab_analogs',
      'tab_packaging',
      'tab_stock',
      'tab_history',
      'tab_files',
      'price_col_type',
      'stock_col_store',
      'stock_col_available',
      'variants_empty',
      'pack_col_name',
      'pack_col_qty',
      'pack_col_uom',
      'pack_col_codetype',
      'pack_col_barcode',
      'pack_add',
      'pack_remove',
      'pack_reorder',
      'pack_generate_barcode',
      'pack_create_unit',
      'pack_unit_name_required',
      'analog_col_name',
      'analog_col_article',
      'analog_col_code',
      'analog_col_stock',
      'analog_remove',
      'analog_already_added',
      'analog_picker_title',
    ];
    for (const k of keys) {
      expect(ru.product_detail_widget?.[k]).toBeTruthy();
      expect(uz.product_detail_widget?.[k]).toBeTruthy();
    }
  });
});
