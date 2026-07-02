import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Products list — moysklad «Товары и услуги» Фильтр-panel 1:1 (frontend wiring
 * lock). Field set + order captured LIVE on moysklad.uz 2026-06-16
 * (docs/audits/products-list-moysklad-live-groundtruth-2026-06-16.md).
 *
 * moysklad's panel has 19 fields; we ship 18 (Код упаковки ТАСНИФ is deferred —
 * it needs a ProductPack.tasnifCode column + editor first). The earlier extras
 * (Тип учёта / Страна / Ниже минимума) were NOT in moysklad's panel and were
 * removed for true 1:1.
 *
 * Each control must (1) render in the panel, and (2) forward its value to the
 * API query — a control that renders but is never read into `params` is a dead
 * filter (the «accepted-but-unapplied» bug-class). typecheck/lint can't see a
 * missing `params` spread, so this is a source-scan guard. The companion BE
 * guard is apps/api/.../product-filter-parity.test.ts.
 */

const WEB_SRC = join(__dirname, '..');
const REPO = join(WEB_SRC, '..', '..', '..');
const page = readFileSync(join(REPO, 'apps/web/src/app/(app)/products/page.tsx'), 'utf8');
// Strip comments so the field-list doc-comment can't satisfy the scans.
const code = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('products filter — all 19 moysklad Фильтр fields render (live 2026-06-16)', () => {
  const controls: Array<[string, string]> = [
    ['Наименование', 'filter-name'],
    ['Описание', 'filter-description'],
    ['Артикул', 'filter-article'],
    ['Код', 'filter-code'],
    ['Внешний код', 'filter-external-code'],
    ['ИКПУ (MXIK)', 'filter-mxik'],
    ['Код упаковки ТАСНИФ', 'filter-tasnif'],
    ['Штрихкод', 'filter-barcode'],
    ['Весовой товар', 'filter-weighed'],
    ['Тип', 'filter-kind'],
    ['Показывать', 'filter-archived'],
    ['Группа товаров (без подгрупп)', 'filter-folder'],
    ['Группа товаров', 'filter-folder-deep'],
    ['Поставщик', 'filter-supplier'],
    ['Владелец-сотрудник', 'filter-owner'],
    ['Владелец-отдел', 'filter-group'],
    ['Общий доступ', 'filter-shared'],
    ['Когда изменен', 'filter-updated-period'],
    ['Кто изменил', 'filter-modified-by'],
  ];
  for (const [label, testId] of controls) {
    it(`renders the ${label} control (data-test-id="${testId}")`, () => {
      expect(code).toContain(`"${testId}"`);
    });
  }
});

describe('products filter — non-parity extras removed (moysklad 1:1 regression lock)', () => {
  // moysklad's products Фильтр has NO Тип учёта / Страна / Ниже минимума. They
  // were removed 2026-06-16 (user-confirmed); a refactor must not re-add them.
  it('no Тип учёта / Страна / Ниже минимума controls', () => {
    expect(code).not.toContain('"filter-tracking-type"');
    expect(code).not.toContain('"filter-country"');
    expect(code).not.toContain('"filter-below-minimum"');
  });
  it('no tracking/country/below-minimum state or options leak back in', () => {
    expect(code).not.toMatch(/TRACKING_OPTIONS/);
    expect(code).not.toMatch(/\btrackingType\b/);
    expect(code).not.toMatch(/\bbelowMinimum\b/);
    expect(code).not.toMatch(/\bcountryInput\b/);
  });
});

describe('products filter — every field is forwarded to the API query', () => {
  // Discrete text filters: `...(x.trim() ? { param: x.trim() } : {})`.
  const trimmed: Array<[string, RegExp]> = [
    ['name', /name:\s*nameFilter\.trim\(\)/],
    ['description', /description:\s*description\.trim\(\)/],
    ['article', /article:\s*article\.trim\(\)/],
    ['code', /code:\s*codeFilter\.trim\(\)/],
    ['externalCode', /externalCode:\s*externalCode\.trim\(\)/],
    ['mxikCode', /mxikCode:\s*mxikCode\.trim\(\)/],
    ['packTasnifCode', /packTasnifCode:\s*packTasnifCode\.trim\(\)/],
    ['barcode', /barcode:\s*barcode\.trim\(\)/],
  ];
  for (const [name, re] of trimmed) {
    it(`puts ${name} into the request params`, () => {
      expect(code).toMatch(re);
    });
  }

  // Picker / select fields forwarded via id / object-shorthand spread (anchored
  // so the JSX `value={...}` prop can't satisfy it — deleting the params spread
  // must fail this).
  const idOrSpread: Array<[string, RegExp]> = [
    ['weighed', /\.\.\.\(\s*weighed\s*\?\s*\{\s*weighed\s*\}\s*:\s*\{\}\)/],
    ['shared', /\.\.\.\(\s*shared\s*\?\s*\{\s*shared\s*\}\s*:\s*\{\}\)/],
    ['productFolderId', /productFolderId:\s*folderFilter\.id/],
    ['productFolderIdDeep', /productFolderIdDeep:\s*folderDeepFilter\.id/],
    // «Поставщик»/«Владелец-сотрудник»/«Владелец-отдел» are multi-select (checkbox
    // dropdowns): the params are CSVs joined from the suppliers[]/owners[]/groups[]
    // arrays (BE uuidCsv splits them back). The param NAMES stay supplierId/
    // ownerId/groupId.
    ['supplierId', /supplierId:\s*suppliers\.map\(\(s\)\s*=>\s*s\.id\)\.join\(','\)/],
    ['ownerId', /ownerId:\s*owners\.map\(\(o\)\s*=>\s*o\.id\)\.join\(','\)/],
    ['groupId', /groupId:\s*groups\.map\(\(g\)\s*=>\s*g\.id\)\.join\(','\)/],
    ['updatedFrom', /\.\.\.\(\s*updatedFrom\s*\?\s*\{\s*updatedFrom\s*\}\s*:\s*\{\}\)/],
    ['updatedTo', /\.\.\.\(\s*updatedTo\s*\?\s*\{\s*updatedTo\s*\}\s*:\s*\{\}\)/],
    ['modifiedById', /\.\.\.\(\s*modifiedById\s*\?\s*\{\s*modifiedById\s*\}\s*:\s*\{\}\)/],
  ];
  for (const [name, re] of idOrSpread) {
    it(`puts ${name} into the request params`, () => {
      expect(code).toMatch(re);
    });
  }

  it('the «с подгруппами» picker opens folderDeep and fetches /product-folders', () => {
    expect(code).toMatch(/pickerOpen === 'folderDeep'/);
    expect(code).toMatch(/'folderDeep'[\s\S]{0,400}\/product-folders\?search=/);
  });
  it('the Кто изменил picker opens modifiedBy and fetches the /employees reference', () => {
    expect(code).toMatch(/pickerOpen === 'modifiedBy'/);
    expect(code).toMatch(/'modifiedBy'[\s\S]{0,400}\/employees\?search=/);
  });
});

describe('products filter — i18n keys for the labels (no hardcoded Cyrillic leak)', () => {
  for (const key of [
    'name',
    'description',
    'article',
    'code',
    'external_code',
    'mxik',
    'tasnif',
    'barcode',
    'weighed',
    'product_kind',
    'show',
    'product_folder_exact',
    'product_folder',
    'owner_employee',
    'owner_group',
    'shared',
    'updated_period',
    'modified_by',
  ]) {
    it(`uses tFilters('${key}')`, () => {
      expect(code).toContain(`tFilters('${key}')`);
    });
  }
});

/**
 * §4 label-grounding REGRESSION LOCK (kept from 2026-06-11j).
 *   - visibility field reads «Показывать» (filters.show), NOT the shared
 *     «Статус» (fields.state).
 *   - kind field reads the bare «Тип» (filters.product_kind), not «Тип товара».
 *   - the «Тип» FILTER dropdown offers exactly Товары/Услуги/Комплекты (PLURAL),
 *     while the «Тип» grid COLUMN cell shows the SINGULAR Товар/Услуга/Комплект —
 *     re-grounded 2026-06-18 against the live online.moysklad.uz native <select>
 *     (Все/Товары/Услуги/Комплекты) + the grid «Тип» column («Товар» per row). The
 *     original 2026-06-11j lock asserted singular for the dropdown — that was a
 *     mis-ground (it read the column/create-button form), corrected here.
 */
describe('products filter — §4 captured-label grounding (Показывать / Тип)', () => {
  const ru = JSON.parse(readFileSync(join(REPO, 'apps/web/src/messages/ru.json'), 'utf8'));

  it('the visibility field uses filters.show (= «Показывать»), NOT fields.state (= «Статус»)', () => {
    expect(code).toMatch(/label=\{tFilters\('show'\)\}[\s\S]{0,400}data-test-id="filter-archived"/);
    expect(code).not.toMatch(
      /label=\{tFields\('state'\)\}[\s\S]{0,400}data-test-id="filter-archived"/,
    );
    expect(ru.filters.show).toBe('Показывать');
    expect(ru.filters.show_regular).toBe('Только обычные');
    expect(ru.filters.show_archived).toBe('Только архивные');
  });

  it('the kind field label is the captured bare «Тип» (not «Тип товара»)', () => {
    expect(ru.filters.product_kind).toBe('Тип');
  });

  it('the new discrete-filter RU labels match the live capture', () => {
    expect(ru.filters.name).toBe('Наименование');
    expect(ru.filters.article).toBe('Артикул');
    expect(ru.filters.external_code).toBe('Внешний код');
    expect(ru.filters.code).toBe('Код');
    expect(ru.filters.product_folder_exact).toBe('Группа товаров (без подгрупп)');
    expect(ru.filters.product_folder).toBe('Группа товаров');
  });

  it('the «Тип» FILTER dropdown offers exactly Товары/Услуги/Комплекты (PLURAL) — no «Модификация»/consignment', () => {
    // Live-grounded 2026-06-18: the assortment «Тип» filter native <select> lists
    // Все / Товары / Услуги / Комплекты. (Variants/«Модификация» nest under the
    // parent; series live in the «Серийные номера» tab — neither is a «Тип» option.)
    const block = code.match(/const KIND_OPTIONS[\s\S]*?\];/)?.[0] ?? '';
    expect(block).toContain("value: 'product', label: 'Товары'");
    expect(block).toContain("value: 'service', label: 'Услуги'");
    expect(block).toContain("value: 'bundle', label: 'Комплекты'");
    expect(block.match(/value: '/g) ?? []).toHaveLength(3);
    expect(block).not.toContain('consignment');
    expect(block).not.toContain('Модификация');
  });

  it('the «Тип» grid COLUMN shows the SINGULAR type name (Товар/Услуга/Комплект), unlike the plural filter', () => {
    // moysklad's grid «Тип» column cell = singular per row (live-grounded
    // 2026-06-18); our column must NOT reuse KIND_OPTIONS' plural labels.
    const block = code.match(/const KIND_COLUMN_LABEL[\s\S]*?\};/)?.[0] ?? '';
    expect(block).toContain("product: 'Товар'");
    expect(block).toContain("service: 'Услуга'");
    expect(block).toContain("bundle: 'Комплект'");
  });

  it('the visibility filter is tri-state (active / archived / all)', () => {
    expect(code).toMatch(/value="all"/);
    expect(code).toMatch(/'active' \| 'archived' \| 'all'/);
  });
});
