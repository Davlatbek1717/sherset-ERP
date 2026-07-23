/**
 * capture-moysklad-lib.ts — pure helpers for the moysklad reference capture
 * harness (Audit Protocol v2.2 Phase 0).
 *
 * Kept separate from `capture-moysklad-references.ts` so tests can import the
 * pure logic without triggering the script's top-level `main()` (which would
 * launch a browser on import).
 */

/** Protokol v2.2 12 reference holati (har sahifa uchun). */
export const STATES = [
  '01-default',
  '02-filter-applied',
  '03-edit-dropdown',
  '04-create-dropdown',
  '05-print-dropdown',
  '06-column-gear',
  '07-row-hover',
  '08-selection-1',
  '09-selection-many',
  '10-empty-state',
  '11-pagination',
  '12-mobile',
] as const;

export type StateKey = (typeof STATES)[number];

/**
 * Detail / edit-form reference states (Audit Protocol v2.2 Phase 0 — detail pages).
 *
 * Captured by `pnpm capture-moysklad <module> --detail` into
 * `docs/moysklad-reference/<module>/detail/`. This REPLACES the broken
 * 2026-04-30 `visual-captures/03-module/*` edit captures, which snapshotted the
 * «Сохранение изменений» (unsaved-changes) save-modal sitting over the trash
 * list instead of the edit form — the capture never dismissed that modal before
 * navigating, so every edit/detail/dropdown PNG was occluded (root cause
 * documented in docs/audits/demands-detail.audit.md). The `--detail` flow fixes
 * this with a `dismissSaveModal` guard run before every snapshot.
 */
export const DETAIL_STATES = [
  'edit-default',
  'edit-dropdown-izmenit',
  'edit-dropdown-sozdat',
  'edit-dropdown-pechat',
  'edit-dropdown-otpravit',
  'edit-tab-main',
  'edit-tab-linked',
  'edit-tab-files',
  'edit-tab-tasks',
  'edit-tab-events',
] as const;

export type DetailStateKey = (typeof DETAIL_STATES)[number];

/** Edit-form toolbar dropdowns to expand+dump (state ↔ RU trigger label). */
export const DETAIL_DROPDOWNS: { state: DetailStateKey; label: string }[] = [
  { state: 'edit-dropdown-izmenit', label: 'Изменить' },
  { state: 'edit-dropdown-sozdat', label: 'Создать документ' },
  { state: 'edit-dropdown-pechat', label: 'Печать' },
  { state: 'edit-dropdown-otpravit', label: 'Отправить' },
];

/** Edit-form tabs to switch to + capture (state ↔ RU tab label). Tabs that a
 *  given document does not expose are skipped (safeState records a note). */
export const DETAIL_TABS: { state: DetailStateKey; label: string }[] = [
  { state: 'edit-tab-main', label: 'Главная' },
  { state: 'edit-tab-linked', label: 'Связанные документы' },
  { state: 'edit-tab-files', label: 'Файлы' },
  { state: 'edit-tab-tasks', label: 'Задачи' },
  { state: 'edit-tab-events', label: 'События' },
];

export interface ModuleConfig {
  /** moysklad URL hash route — e.g. "#purchaseorder" */
  route: string;
  /** moysklad UI label for "+ Create" button (RU) — used to locate it */
  createLabel: string;
  /** Selector for the first row checkbox */
  firstRowSelector: string;
}

export const MODULES: Record<string, ModuleConfig> = {
  'purchase-orders': {
    route: '#purchaseorder',
    createLabel: '+ Заказ',
    firstRowSelector: '.list-row:first-of-type input[type=checkbox]',
  },
  'customer-orders': {
    route: '#customerorder',
    createLabel: '+ Заказ',
    firstRowSelector: '.list-row:first-of-type input[type=checkbox]',
  },
  demands: {
    route: '#demand',
    createLabel: '+ Отгрузка',
    firstRowSelector: '.list-row:first-of-type input[type=checkbox]',
  },
  // Возврат покупателя (customer-side return; pairs with demands). Route + create
  // label added 2026-07-23 for the salesreturn 1:1 grounding capture (QISM 0).
  salesreturn: {
    route: '#salesreturn',
    createLabel: '+ Возврат',
    firstRowSelector: '.list-row:first-of-type input[type=checkbox]',
  },
  supplies: {
    route: '#supply',
    createLabel: '+ Приёмка',
    firstRowSelector: '.list-row:first-of-type input[type=checkbox]',
  },
  'invoices-out': {
    route: '#invoiceout',
    createLabel: '+ Счёт',
    firstRowSelector: '.list-row:first-of-type input[type=checkbox]',
  },
  'invoices-in': {
    route: '#invoicein',
    createLabel: '+ Счёт',
    firstRowSelector: '.list-row:first-of-type input[type=checkbox]',
  },
  'cash-in': {
    route: '#cashin',
    createLabel: '+ Приходный ордер',
    firstRowSelector: '.list-row:first-of-type input[type=checkbox]',
  },
  'cash-out': {
    route: '#cashout',
    createLabel: '+ Расходный ордер',
    firstRowSelector: '.list-row:first-of-type input[type=checkbox]',
  },
  'payments-in': {
    route: '#paymentin',
    createLabel: '+ Входящий платёж',
    firstRowSelector: '.list-row:first-of-type input[type=checkbox]',
  },
  'payments-out': {
    route: '#paymentout',
    createLabel: '+ Исходящий платёж',
    firstRowSelector: '.list-row:first-of-type input[type=checkbox]',
  },
  // Warehouse documents (Phase 2 batch 3 — 2026-05-30)
  moves: {
    route: '#move',
    createLabel: '+ Перемещение',
    firstRowSelector: '.list-row:first-of-type input[type=checkbox]',
  },
  losses: {
    route: '#loss',
    createLabel: '+ Списание',
    firstRowSelector: '.list-row:first-of-type input[type=checkbox]',
  },
  enters: {
    route: '#enter',
    createLabel: '+ Оприходование',
    firstRowSelector: '.list-row:first-of-type input[type=checkbox]',
  },
  inventories: {
    route: '#inventory',
    createLabel: '+ Инвентаризация',
    firstRowSelector: '.list-row:first-of-type input[type=checkbox]',
  },
  // Catalogs (Phase 2 batch 4 — 2026-05-30)
  counterparties: {
    route: '#company',
    createLabel: '+ Контрагент',
    firstRowSelector: '.list-row:first-of-type input[type=checkbox]',
  },
  products: {
    route: '#good',
    createLabel: '+ Товар',
    firstRowSelector: '.list-row:first-of-type input[type=checkbox]',
  },
  employees: {
    route: '#employee',
    createLabel: '+ Сотрудник',
    firstRowSelector: '.list-row:first-of-type input[type=checkbox]',
  },
  projects: {
    route: '#project',
    createLabel: '+ Проект',
    firstRowSelector: '.list-row:first-of-type input[type=checkbox]',
  },
  // Settings catalogs — routes discovered live 2026-06-01 by probing the moysklad
  // UI (its GWT nav has no static hrefs). Склады = `#warehouse` (NOT `#store`,
  // which redirects to the onboarding splash). Юр. лица = `#myorganization`
  // (a RECOGNISED route — keeps its hash — but renders slowly / single-org card;
  // bare `#organization`/`#myorg` redirect to splash).
  stores: {
    route: '#warehouse',
    createLabel: '+ Склад',
    firstRowSelector: '.list-row:first-of-type input[type=checkbox]',
  },
  organizations: {
    route: '#myorganization',
    createLabel: '+ Юр. лицо',
    firstRowSelector: '.list-row:first-of-type input[type=checkbox]',
  },
  // System reference catalogs (Phase 2 batch 5 — 2026-05-30). These live under
  // Настройки → Справочники and may NOT expose the same bulk «Изменить»
  // surface as document/entity lists — capture each separately and let the
  // captured menu (not the employees pattern) decide what we wire.
  currencies: {
    route: '#currency',
    createLabel: '+ Валюта',
    firstRowSelector: '.list-row:first-of-type input[type=checkbox]',
  },
  uoms: {
    route: '#uom',
    createLabel: '+ Единица измерения',
    firstRowSelector: '.list-row:first-of-type input[type=checkbox]',
  },
  // ── Production + retail + internal-order documents (Grounding mega-session,
  // 2026-06-11). Routes confirmed live on the PAID tier 2026-06-10d
  // (scratch/probe-paid-tier.mjs): all six render real grids. Keyed by the
  // moysklad route slug (NOT our app path) because our app splits some of these
  // across multiple pages and the 1:1 mapping is decided FROM the capture, not
  // presumed. App-page mapping (audited during the grounding fix):
  //   internalorder   → /internal-orders          (Внутренний заказ)
  //   processingplan  → /production/boms           (Техкарта)
  //   processingorder → /productions               (Заказ на производство)
  //   processing      → /processings               (Техоперация)
  //   retaildemand    → /retail/sales              (Розничная продажа)
  //   retailshift     → /retail/sessions           (Розничная смена)
  // The empty PAID account holds no documents of these types, so the detail
  // (`--detail`) capture falls back to the «+ Создать» form — see openCreateForm()
  // in capture-moysklad-references.ts. Reachability of each module's detail form
  // on THIS account (verified live 2026-06-11):
  //   internalorder   → ✅ create form opens (createLabel «Заказ», DOM-grounded).
  //   processingorder/processingplan/processing → ⛔ the «Производство» option is
  //     NOT active (banner «Использование опции Производство недоступно…») — the
  //     LIST renders (columns grounded) but there is NO «+ create» button until a
  //     14-day trial / subscription option is enabled. createLabels below are the
  //     grounded doc names for when it is; until then their edit-form labels are
  //     grounded only structurally from docs/.../document-schemas/*.json.
  //   retaildemand/retailshift → ⛔ POS-driven: the list has NO «+ create» (toolbar
  //     starts at «Фильтр»); detail needs an existing POS row. Deferred until the
  //     account has POS data. (createLabels below are placeholders, unused.)
  internalorder: {
    // createLabel = the literal create-button TEXT (the «+» is an icon, not
    // text) — used by openCreateForm() to open the blank form on an empty list.
    // Grounded from the live list capture 2026-06-11 (button reads «Заказ»).
    route: '#internalorder',
    createLabel: 'Заказ',
    firstRowSelector: '.list-row:first-of-type input[type=checkbox]',
  },
  // createLabel = literal create-button text (best-effort; UNREACHABLE on this
  // account — Production option not active — so ungrounded, see block comment).
  processingplan: {
    route: '#processingplan',
    createLabel: 'Техкарта',
    firstRowSelector: '.list-row:first-of-type input[type=checkbox]',
  },
  processingorder: {
    route: '#processingorder',
    createLabel: 'Заказ на производство',
    firstRowSelector: '.list-row:first-of-type input[type=checkbox]',
  },
  processing: {
    route: '#processing',
    createLabel: 'Техоперация',
    firstRowSelector: '.list-row:first-of-type input[type=checkbox]',
  },
  // retail: POS-driven — no list «+ create»; createLabel is an unused placeholder.
  retaildemand: {
    route: '#retaildemand',
    createLabel: 'Продажа',
    firstRowSelector: '.list-row:first-of-type input[type=checkbox]',
  },
  retailshift: {
    route: '#retailshift',
    createLabel: 'Смена',
    firstRowSelector: '.list-row:first-of-type input[type=checkbox]',
  },
  // ── BLOCKED settings-catalog routes (free-tier account, verified live
  // 2026-06-01 via scratch/probe-routes.mjs) — NOT added to MODULES because a
  // capture only wastes a ~30s timeout (same reason services/variants are
  // excluded below). Two failure modes:
  //   (a) redirect to `#homepage` + «МойСклад для сферы услуг» onboarding splash:
  //       #pricetype (Типы цен) · #vatrate (Ставки НДС) · #productfolder (Группы
  //       товаров) · #expenseitem (Статьи расходов) · #region (Регионы) ·
  //       #cashregister (Кассы ККМ) · #group (Группы).
  //   (b) RECOGNISED route (keeps its hash) but hangs on «Загрузка...» forever:
  //       #myorganization (Юр.лица) · #customentity (Пользовательские
  //       справочники). Reachable only on a paid tier or via code+domain audit.
  // Other RECOGNISED-but-unbuilt-here routes (lists render, our app lacks the
  // page → scaffold workstream): #contract (Договоры) · #saleschannel (Каналы
  // продаж) · #country (Страны) · #pricelist (Прайс-листы, a document).
  // NB: `services`, `bundles`, `contact-persons` and `variants` are
  // intentionally NOT here — none has a standalone *list* route in moysklad.
  // Their hash routes (`#service` / `#contactperson` / `#variant`) are not
  // recognised by the GWT router, so the SPA falls back to the same "МойСклад
  // для сферы услуг" sector onboarding splash — verified 2026-05-30: all
  // interactive capture states time out and the same account renders real
  // lists for `#good` / `#company`, so it's route-specific. Where each one
  // actually lives:
  //   - services / bundles → unified Товары assortment list (`#good`); their
  //     «Изменить»/«Печать» reference IS the products capture, and our
  //     /services & /bundles pages reuse the assortment dropdowns.
  //   - contact-persons → sub-tab of the Контрагент card (`#company`).
  //   - variants → «Модификации» sub-tab of the Товар card (`#good`).
  // contact-persons/variants are detail-card sub-tabs (NOT the assortment
  // list), so they deliberately do NOT get the catalog dropdowns — see
  // docs/moysklad-reference/{contact-persons,variants,services}/FINDING.md.
  // Keeping any of them here would only make `--all` waste ~6×30s timeouts on
  // the onboarding splash. Historical splash captures + metadata.json are kept
  // under docs/moysklad-reference/<module>/states/ as evidence for the FINDINGs.
};

export interface Metadata {
  capturedAt: string;
  module: string;
  moyskladUrl: string;
  /**
   * True when the detail capture opened a BLANK «+ Создать» form instead of an
   * existing document (empty-account fallback). Field labels are identical to
   * the edit form, but no saved values / no transition history are present —
   * relevant when grounding behaviour (vs labels) from these captures.
   */
  viaCreateForm?: boolean;
  states: Record<
    string,
    {
      file: string;
      domDump?: unknown;
      notes?: string;
    }
  >;
}

/**
 * Pure: PNG fayl yoshiga (kun) qarab holatni tasniflaydi.
 * `null` yosh → fayl yo'q (missing). Test qilinadigan yagona mantiq.
 */
export function classifyFreshness(
  ageDaysByState: Record<string, number | null>,
  maxAgeDays = 30,
): { fresh: string[]; stale: string[]; missing: string[] } {
  const fresh: string[] = [];
  const stale: string[] = [];
  const missing: string[] = [];
  for (const [state, ageDays] of Object.entries(ageDaysByState)) {
    if (ageDays === null) missing.push(state);
    else if (ageDays > maxAgeDays) stale.push(state);
    else fresh.push(state);
  }
  return { fresh, stale, missing };
}
