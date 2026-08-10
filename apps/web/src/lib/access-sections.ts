/**
 * «Настройка доступа» — the employee-card rights dialog, rebuilt to MoySklad's
 * REAL mechanism (owner 2026-07-19, live MoySklad screenshots): a modal with a
 * left column of section tabs (Показатели … Задачи) and, on the right, the
 * selected section's checkbox list. Checking/unchecking «Просматривать» is what
 * makes a section/tab visible or invisible for the employee — the checkboxes
 * read and write ordinary RolePermission cells, so the existing nav gating
 * (use-permissions) and the server PermissionsGuard enforce them unchanged.
 *
 * Section INTERNALS grounding: «Показатели» rows are copied verbatim from the
 * owner's MoySklad screenshot; the other sections list our permission entities
 * with subnav-grounded RU labels (exact per-section MoySklad wording still
 * needs per-section screenshots — documented in NEXT.md).
 */

export type PermissionAction = 'view' | 'create' | 'update' | 'delete' | 'approve' | 'print';
export type PermissionScope = 'NO' | 'OWN' | 'OWN_GROUP' | 'OWN_AND_GROUP' | 'ALL';

export interface MatrixCell {
  entity: string;
  action: PermissionAction;
  scope: PermissionScope;
}

/** One checkbox = one (entity, actions[]) group. */
export interface CellRef {
  entity: string;
  action: PermissionAction;
}

/** Checkbox columns shown for entity rows. `docOnly` columns render «—» for
 *  dictionaries (no Проводить/Печатать on справочники). */
export const ACTION_GROUPS = [
  { key: 'view', labelKey: 'access_col_view', actions: ['view'], docOnly: false },
  { key: 'edit', labelKey: 'access_col_edit', actions: ['create', 'update'], docOnly: false },
  { key: 'approve', labelKey: 'access_col_approve', actions: ['approve'], docOnly: true },
  { key: 'delete', labelKey: 'access_col_delete', actions: ['delete'], docOnly: false },
  { key: 'print', labelKey: 'access_col_print', actions: ['print'], docOnly: true },
] as const;

export type ActionGroup = (typeof ACTION_GROUPS)[number];

export interface SectionEntity {
  entity: string;
  /** Full i18n path (root namespace), e.g. 'subnav.sales.demands'. */
  labelPath: string;
  /** Documents get Проводить/Печатать columns; dictionaries don't. */
  doc: boolean;
}

/** A standalone boolean row (the «Показатели» style: one checkbox, own label). */
export interface SectionRow {
  /** Key under pages.employee_card. */
  labelKey: string;
  refs: CellRef[];
}

export interface AccessSection {
  key: string;
  /** Full i18n path (root namespace). */
  labelPath: string;
  rows?: SectionRow[];
  entities: SectionEntity[];
}

const doc = (entity: string, labelPath: string): SectionEntity => ({
  entity,
  labelPath,
  doc: true,
});
const dict = (entity: string, labelPath: string): SectionEntity => ({
  entity,
  labelPath,
  doc: false,
});
const card = (key: string) => `pages.employee_card.${key}`;

/** Left-column order copied from the owner's MoySklad «Настройка доступа»
 *  screenshot (2026-07-19): Показатели, Закупки, Продажи, Товары, Маркировка,
 *  CRM, Склад, Деньги, Розница, Производство, Настройки, Сценарии,
 *  Обмен данными, Справочники, Задачи. */
export const ACCESS_SECTIONS: AccessSection[] = [
  {
    key: 'dashboard',
    labelPath: 'nav.homepage',
    // Rows verbatim from the MoySklad screenshot. Корзина rows persist on the
    // role under the 'korzina' entity (enforced once the recycle bin ships).
    rows: [
      { labelKey: 'access_row_view_dashboard', refs: [{ entity: 'report', action: 'view' }] },
      { labelKey: 'access_row_view_korzina', refs: [{ entity: 'korzina', action: 'view' }] },
      { labelKey: 'access_row_restore_docs', refs: [{ entity: 'korzina', action: 'update' }] },
      { labelKey: 'access_row_clear_korzina', refs: [{ entity: 'korzina', action: 'delete' }] },
      { labelKey: 'access_row_view_audit', refs: [{ entity: 'auditlog', action: 'view' }] },
    ],
    entities: [],
  },
  {
    key: 'purchases',
    labelPath: 'nav.purchases',
    entities: [
      doc('purchaseorder', 'subnav.purchases.purchase_orders'),
      doc('invoicein', 'subnav.purchases.invoices_in'),
      doc('supply', 'subnav.purchases.supplies'),
      doc('purchasereturn', 'subnav.purchases.purchase_returns'),
      doc('facturein', 'subnav.purchases.factures_in'),
    ],
  },
  {
    key: 'sales',
    labelPath: 'nav.sales',
    entities: [
      doc('customerorder', 'subnav.sales.customer_orders'),
      doc('invoiceout', 'subnav.sales.invoices_out'),
      doc('demand', 'subnav.sales.demands'),
      doc('salesreturn', 'subnav.sales.sales_returns'),
      doc('factureout', 'subnav.sales.factures_out'),
      doc('commissionreport', 'subnav.sales.commission_reports'),
      doc('consignment', 'subnav.sales.consignments'),
    ],
  },
  {
    key: 'goods',
    labelPath: 'nav.goods',
    entities: [
      dict('product', 'subnav.products.list'),
      dict('productfolder', 'subnav.products.folders'),
      dict('variant', 'subnav.products.variants'),
      dict('service', 'subnav.products.services'),
      dict('bundle', 'subnav.products.bundles'),
      doc('pricelist', 'subnav.products.price_lists'),
    ],
  },
  {
    key: 'marking',
    labelPath: card('access_section_marking'),
    entities: [dict('trackingcode', card('access_entity_trackingcode'))],
  },
  {
    key: 'crm',
    labelPath: 'nav.crm',
    entities: [
      dict('counterparty', 'subnav.crm.counterparties'),
      dict('contactperson', 'subnav.crm.contact_persons'),
      dict('call', 'subnav.crm.calls'),
      dict('opportunity', 'subnav.crm.opportunities'),
      dict('pipeline', 'subnav.crm.pipelines'),
      dict('discount', 'subnav.crm.discounts'),
      dict('contract', 'subnav.crm.contracts'),
    ],
  },
  {
    key: 'stock',
    labelPath: 'nav.stock',
    entities: [
      doc('move', 'subnav.stock.moves'),
      doc('loss', 'subnav.stock.losses'),
      doc('enter', 'subnav.stock.enters'),
      doc('inventory', 'subnav.stock.inventories'),
      doc('internalorder', 'subnav.stock.internal_orders'),
      dict('store', 'subnav.stock.stores'),
      // TZ v3 §3 (2026-08-10): yacheyka amallari — bog'lash («Scan») va sanash
      // («Sanash») — omborga EMAS, alohida `storecell` obyektiga bog'langan
      // (omborchi ombor kartochkasini tahrirlamasdan yacheyka bilan ishlaydi).
      // Bu qator bo'lmasa admin o'sha ruxsatni hech qaysi ekrandan bera/ola
      // olmasdi — faqat shablon yoki skript orqali (review 2026-08-10 I4).
      dict('storecell', card('access_entity_storecell')),
    ],
  },
  {
    key: 'money',
    labelPath: 'nav.money',
    entities: [
      doc('paymentin', 'subnav.money.payments_in'),
      doc('paymentout', 'subnav.money.payments_out'),
      doc('cashin', 'subnav.money.cash_in'),
      doc('cashout', 'subnav.money.cash_out'),
      doc('bankimport', 'subnav.money.bank_import'),
      doc('counterpartyadjustment', 'subnav.money.counterparty_adjustments'),
      doc('prepayment', 'subnav.money.prepayments'),
      doc('prepaymentreturn', 'subnav.money.prepayment_returns'),
      doc('payroll', 'subnav.money.payrolls'),
      dict('cashdesk', 'subnav.settings.cash_desks'),
      dict('bankaccount', 'subnav.settings.bank_accounts'),
    ],
  },
  {
    key: 'retail',
    labelPath: 'nav.retail',
    entities: [
      doc('retailsale', 'subnav.retail.sales'),
      doc('cashiersession', 'subnav.retail.sessions'),
    ],
  },
  {
    key: 'production',
    labelPath: 'nav.production',
    entities: [
      doc('processing', 'subnav.production.processings'),
      doc('processingorder', 'subnav.production.processing_orders'),
      doc('workorder', 'subnav.production.work_orders'),
      dict('bom', 'subnav.production.boms'),
      dict('processingprocess', 'subnav.production.processes'),
      dict('processingstage', 'subnav.production.stages'),
    ],
  },
  {
    key: 'settings',
    labelPath: 'nav.settings',
    entities: [
      dict('employee', card('access_entity_employee')),
      dict('role', card('access_entity_role')),
      dict('settings', card('access_entity_settings')),
      dict('publication', 'subnav.settings.publications'),
    ],
  },
  { key: 'scenarios', labelPath: card('access_section_scenarios'), entities: [] },
  {
    key: 'exchange',
    labelPath: card('access_section_exchange'),
    entities: [doc('onlineorder', card('access_entity_onlineorder'))],
  },
  {
    key: 'references',
    labelPath: card('access_section_references'),
    entities: [
      dict('organization', card('access_entity_organization')),
      dict('currency', card('access_entity_currency')),
      dict('exchangerate', 'subnav.settings.exchange_rates'),
      dict('project', card('access_entity_project')),
      dict('uom', card('access_entity_uom')),
      dict('taxrate', card('access_entity_taxrate')),
      dict('expenseitem', card('access_entity_expenseitem')),
      dict('customentity', card('access_entity_customentity')),
      dict('country', card('access_entity_country')),
      dict('region', card('access_entity_region')),
      dict('pricetype', 'subnav.settings.price_types'),
      dict('saleschannel', card('access_entity_saleschannel')),
      dict('mxik', 'subnav.settings.mxik'),
    ],
  },
  {
    key: 'tasks',
    labelPath: 'nav.tasks',
    entities: [
      dict('task', card('access_entity_task')),
      dict('tasktype', card('access_entity_tasktype')),
    ],
  },
];

/** Refs a checkbox controls: the entity crossed with the group's actions. */
export const groupRefs = (entity: string, group: ActionGroup): CellRef[] =>
  group.actions.map((action) => ({ entity, action }));

/** A checkbox is ON when every ref exists with a non-NO scope. */
export const refsOn = (cells: MatrixCell[], refs: CellRef[]): boolean =>
  refs.length > 0 &&
  refs.every((r) =>
    cells.some((c) => c.entity === r.entity && c.action === r.action && c.scope !== 'NO'),
  );

/** Checking grants ALL on each ref; unchecking removes the cells entirely
 *  (sparse matrix: absent = NO). Re-checking never duplicates. */
export const setRefs = (cells: MatrixCell[], refs: CellRef[], on: boolean): MatrixCell[] => {
  const rest = cells.filter(
    (c) => !refs.some((r) => r.entity === c.entity && r.action === c.action),
  );
  if (!on) return rest;
  return [...rest, ...refs.map((r) => ({ ...r, scope: 'ALL' as const }))];
};
