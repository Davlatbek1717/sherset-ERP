/**
 * Owner 2026-07-17: the «Настроить права» dialog becomes a MODULE/TAB toggle
 * tree (bo'lim toggle + dropdown of tab toggles) instead of the raw
 * entity×action grid. This file is the pure, testable core:
 *
 *  - MODULE_ACCESS: every top-nav module with its sub-nav tabs and the
 *    permission ENTITIES each tab maps to (same universe the backend
 *    RolePermission matrix uses — so the toggles write ordinary role
 *    permissions and the existing canSeeModule/canSeeRoute + server guards
 *    enforce them with zero new machinery).
 *  - isEntityOn / isTabOn / isModuleOn: derive toggle state from a role's
 *    sparse MatrixCell[] (view scope !== NO).
 *  - setEntitiesAccess: produce the next MatrixCell[] for a toggle flip —
 *    ON grants ALL on every action (the owner's model is «ko'rinadi va
 *    ishlaydi»), OFF removes the entities entirely (=NO everywhere).
 *
 * Known coarseness (deliberate, documented): the fine-grained grid
 * (per-action, OWN/OWN_GROUP scopes) still lives on the roles admin page
 * (analitika/sozlamalar/rollar) — this dialog is the simple surface.
 * Tabs that share an entity (report-backed tabs, POS pair) toggle together.
 */

export type Scope = 'NO' | 'OWN' | 'OWN_GROUP' | 'OWN_AND_GROUP' | 'ALL';
export type Action = 'view' | 'create' | 'update' | 'delete' | 'approve' | 'print';
export interface MatrixCell {
  entity: string;
  action: Action;
  scope: Scope;
}

export const ALL_ACTIONS: Action[] = ['view', 'create', 'update', 'delete', 'approve', 'print'];

export interface ModuleTabAccess {
  /** i18n path relative to root, e.g. 'subnav.sales.demands'. */
  labelPath: string;
  /** Permission entities this tab needs (view!=NO on ANY shows the tab). */
  entities: string[];
}

export interface ModuleAccess {
  /** Top-nav module key (= MODULE_ENTITIES key in use-permissions). */
  key: string;
  /** i18n path for the module name, e.g. 'nav.sales'. */
  labelPath: string;
  /** Entities beyond the tabs' union (module landing pages etc.). */
  extraEntities?: string[];
  tabs: ModuleTabAccess[];
  /** true — module has no permission gate (dashboard, apps, HR own RBAC). */
  alwaysOn?: boolean;
}

export const MODULE_ACCESS: ModuleAccess[] = [
  { key: 'homepage', labelPath: 'nav.homepage', tabs: [], alwaysOn: true },
  {
    key: 'purchases',
    labelPath: 'nav.purchases',
    tabs: [
      { labelPath: 'subnav.purchases.purchase_orders', entities: ['purchaseorder'] },
      { labelPath: 'subnav.purchases.invoices_in', entities: ['invoicein'] },
      { labelPath: 'subnav.purchases.supplies', entities: ['supply'] },
      { labelPath: 'subnav.purchases.purchase_returns', entities: ['purchasereturn'] },
      { labelPath: 'subnav.purchases.factures_in', entities: ['facturein'] },
      { labelPath: 'subnav.purchases.purchase_management', entities: ['report'] },
    ],
  },
  {
    key: 'sales',
    labelPath: 'nav.sales',
    tabs: [
      { labelPath: 'subnav.sales.customer_orders', entities: ['customerorder'] },
      { labelPath: 'subnav.sales.invoices_out', entities: ['invoiceout'] },
      { labelPath: 'subnav.sales.demands', entities: ['demand'] },
      { labelPath: 'subnav.sales.commission_reports', entities: ['commissionreport'] },
      { labelPath: 'subnav.sales.sales_returns', entities: ['salesreturn'] },
      { labelPath: 'subnav.sales.factures_out', entities: ['factureout'] },
      { labelPath: 'subnav.sales.consignments', entities: ['consignment'] },
      { labelPath: 'subnav.sales.funnel', entities: ['opportunity'] },
      { labelPath: 'subnav.sales.profitability', entities: ['report'] },
    ],
  },
  {
    key: 'goods',
    labelPath: 'nav.goods',
    extraEntities: ['variant', 'bundle', 'service', 'uom'],
    tabs: [
      { labelPath: 'subnav.products.list', entities: ['product', 'productfolder'] },
      { labelPath: 'subnav.products.price_lists', entities: ['pricelist'] },
    ],
  },
  {
    key: 'crm',
    labelPath: 'nav.crm',
    tabs: [
      { labelPath: 'subnav.crm.counterparties', entities: ['counterparty', 'contactperson'] },
      { labelPath: 'subnav.crm.contracts', entities: ['contract'] },
      { labelPath: 'subnav.crm.calls', entities: ['call'] },
    ],
  },
  {
    key: 'stock',
    labelPath: 'nav.stock',
    tabs: [
      { labelPath: 'subnav.stock.enters', entities: ['enter'] },
      { labelPath: 'subnav.stock.losses', entities: ['loss'] },
      { labelPath: 'subnav.stock.moves', entities: ['move'] },
      { labelPath: 'subnav.stock.inventories', entities: ['inventory'] },
      { labelPath: 'subnav.stock.internal_orders', entities: ['internalorder'] },
      { labelPath: 'subnav.stock.stores', entities: ['store'] },
      { labelPath: 'subnav.stock.remains', entities: ['report'] },
    ],
  },
  {
    key: 'money',
    labelPath: 'nav.money',
    tabs: [
      {
        labelPath: 'subnav.money.payments',
        entities: ['paymentin', 'paymentout', 'cashin', 'cashout'],
      },
      { labelPath: 'subnav.money.payroll_accruals', entities: ['payroll'] },
      { labelPath: 'subnav.money.corrections', entities: ['counterpartyadjustment'] },
      { labelPath: 'subnav.money.pnl', entities: ['report'] },
    ],
    extraEntities: ['prepayment', 'prepaymentreturn'],
  },
  {
    key: 'retail',
    labelPath: 'nav.retail',
    tabs: [
      { labelPath: 'subnav.retail.pos', entities: ['retailsale'] },
      { labelPath: 'subnav.retail.sessions', entities: ['cashiersession'] },
    ],
  },
  {
    key: 'production',
    labelPath: 'nav.production',
    tabs: [
      { labelPath: 'subnav.production.processings', entities: ['processing'] },
      { labelPath: 'subnav.production.boms', entities: ['bom'] },
      { labelPath: 'subnav.production.work_orders', entities: ['workorder'] },
      { labelPath: 'subnav.production.processing_orders', entities: ['processingorder'] },
      { labelPath: 'subnav.production.processes', entities: ['processingprocess'] },
      { labelPath: 'subnav.production.stages', entities: ['processingstage'] },
    ],
  },
  { key: 'tasks', labelPath: 'nav.tasks', tabs: [], extraEntities: ['task', 'tasktype'] },
  { key: 'apps', labelPath: 'nav.apps', tabs: [], alwaysOn: true },
  { key: 'hr', labelPath: 'nav.hr', tabs: [], alwaysOn: true },
  { key: 'analitika', labelPath: 'nav.analitika', tabs: [], extraEntities: ['analitika'] },
];

/** Union of every entity a module governs (tabs + extras). */
export function moduleEntities(m: ModuleAccess): string[] {
  const set = new Set<string>(m.extraEntities ?? []);
  for (const tab of m.tabs) for (const e of tab.entities) set.add(e);
  return [...set];
}

export function isEntityOn(cells: MatrixCell[], entity: string): boolean {
  return cells.some((c) => c.entity === entity && c.action === 'view' && c.scope !== 'NO');
}

/** A tab is ON when EVERY of its entities is viewable (partial = off). */
export function isTabOn(cells: MatrixCell[], tab: ModuleTabAccess): boolean {
  return tab.entities.every((e) => isEntityOn(cells, e));
}

/** A module is ON when ANY governed entity is viewable (mirrors canSeeModule). */
export function isModuleOn(cells: MatrixCell[], m: ModuleAccess): boolean {
  if (m.alwaysOn) return true;
  return moduleEntities(m).some((e) => isEntityOn(cells, e));
}

/**
 * Flip access for a set of entities. ON → ALL on every action (replacing any
 * previous cells for those entities); OFF → cells removed (= NO everywhere).
 */
export function setEntitiesAccess(
  cells: MatrixCell[],
  entities: string[],
  on: boolean,
): MatrixCell[] {
  const drop = new Set(entities);
  const kept = cells.filter((c) => !drop.has(c.entity));
  if (!on) return kept;
  const granted: MatrixCell[] = [];
  for (const entity of entities) {
    for (const action of ALL_ACTIONS) granted.push({ entity, action, scope: 'ALL' });
  }
  return [...kept, ...granted];
}
