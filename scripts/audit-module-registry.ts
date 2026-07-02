/**
 * audit-module-registry.ts — maps each captured moysklad module to the facts
 * the `pnpm audit:module` orchestrator needs to drive OUR app and locate its
 * dropdowns, both live (Playwright) and statically (source parse).
 *
 * Built from a 22-agent discovery sweep (2026-05-31) + verified against the
 * actual primitives:
 *   - DropdownMenu (packages/design-system/src/primitives/DropdownMenu.tsx) wraps
 *     Radix (@radix-ui/react-dropdown-menu) and renders into a Portal: the menu
 *     items land at document root as `[role=menuitem]`, each carrying Radix's
 *     `data-disabled` attribute when disabled (NOT the native `disabled` attr).
 *     The DropdownMenu `testId` is set on the *content* container
 *     (`[data-test-id=<id>]` on the menu), while the trigger is the child Button.
 *   - Shared money/invoice lists render via ListView's editMenu/printMenu slots →
 *     trigger `data-test-id` is `toolbar-edit-trigger` / `toolbar-print-trigger`
 *     (ListView sets `${slotTestId}-trigger` on the trigger button).
 *   - Shared assortment lists (products/services/bundles) render
 *     components/assortment/{bulk-actions,print}-dropdown.tsx → `assortment-*`.
 *
 * Kept data-only and dependency-free so it imports cleanly into both the pure
 * lib tests and the browser-driving orchestrator.
 */

export interface DropdownRef {
  /** kind of toolbar menu */
  kind: 'bulk' | 'print';
  /**
   * `data-test-id` that locates this dropdown's TRIGGER (the clickable button).
   * For dedicated `<DropdownMenu>` components the trigger is the child Button —
   * we click the menu container's sibling; in practice the component sets the
   * testId on the DropdownMenu, so the orchestrator clicks `[data-test-id=...]`
   * and falls back to the trigger button. For ListView slots it's the
   * `${slot}-trigger` button id.
   */
  triggerTestId: string;
  /** repo-relative path to the component source (static fallback parse) */
  componentPath: string;
  /**
   * moysklad capture state key this dropdown is compared against:
   *   bulk  → '03-edit-dropdown' (Изменить)
   *   print → '05-print-dropdown' (Печать)
   */
  referenceState: '03-edit-dropdown' | '05-print-dropdown';
}

export interface ModuleAudit {
  /** our Next.js route the list renders at */
  route: string;
  /** `data-test-id` PREFIX of a data row (first-row selection for live capture) */
  rowTestIdPrefix: string;
  /** i18n namespaces the BULK dropdown reads (static-fallback label resolution) */
  i18nNamespaces: string[];
  /** the toolbar dropdowns to capture + diff */
  dropdowns: DropdownRef[];
  /** true if scripts/smoke-mass-edit.sh ALL_MODULES contains this slug */
  hasMassEditSmoke: boolean;
}

const BULK = '03-edit-dropdown' as const;
const PRINT = '05-print-dropdown' as const;

/** Shared money/invoice toolbar (cash + payments + invoices) via ListView slots. */
function moneyDropdowns(): DropdownRef[] {
  const componentPath = 'apps/web/src/components/money/document-toolbar-menus.tsx';
  return [
    { kind: 'bulk', triggerTestId: 'toolbar-edit-trigger', componentPath, referenceState: BULK },
    { kind: 'print', triggerTestId: 'toolbar-print-trigger', componentPath, referenceState: PRINT },
  ];
}

/** Shared assortment toolbar (products + services + bundles). */
function assortmentDropdowns(): DropdownRef[] {
  return [
    {
      kind: 'bulk',
      triggerTestId: 'assortment-bulk-actions-dropdown',
      componentPath: 'apps/web/src/components/assortment/bulk-actions-dropdown.tsx',
      referenceState: BULK,
    },
    {
      kind: 'print',
      triggerTestId: 'assortment-print-dropdown',
      componentPath: 'apps/web/src/components/assortment/print-dropdown.tsx',
      referenceState: PRINT,
    },
  ];
}

/** Dedicated `<entity>-bulk-actions-dropdown` (+ optional print) under components/<dir>/. */
function dedicated(
  dir: string,
  bulkTestId: string,
  opts: { printTestId?: string } = {},
): DropdownRef[] {
  const out: DropdownRef[] = [
    {
      kind: 'bulk',
      triggerTestId: bulkTestId,
      componentPath: `apps/web/src/components/${dir}/bulk-actions-dropdown.tsx`,
      referenceState: BULK,
    },
  ];
  if (opts.printTestId) {
    out.push({
      kind: 'print',
      triggerTestId: opts.printTestId,
      componentPath: `apps/web/src/components/${dir}/print-dropdown.tsx`,
      referenceState: PRINT,
    });
  }
  return out;
}

export const OUR_MODULES: Record<string, ModuleAudit> = {
  // ---- FSM documents — dedicated dropdowns -------------------------------
  'customer-orders': {
    route: '/customer-orders',
    rowTestIdPrefix: 'customer-order-row-',
    i18nNamespaces: ['bulk_actions', 'bulk'],
    dropdowns: dedicated('customer-orders', 'bulk-actions-dropdown', {
      printTestId: 'print-dropdown',
    }),
    hasMassEditSmoke: true,
  },
  demands: {
    route: '/demands',
    rowTestIdPrefix: 'demand-row-',
    i18nNamespaces: ['bulk_actions', 'bulk'],
    dropdowns: dedicated('demands', 'demand-bulk-actions-dropdown', {
      printTestId: 'demand-print-dropdown',
    }),
    hasMassEditSmoke: true,
  },
  supplies: {
    route: '/supplies',
    rowTestIdPrefix: 'supply-row-',
    i18nNamespaces: ['bulk_actions', 'bulk'],
    dropdowns: dedicated('supplies', 'supply-bulk-actions-dropdown', {
      printTestId: 'supply-print-dropdown',
    }),
    hasMassEditSmoke: true,
  },
  moves: {
    route: '/moves',
    rowTestIdPrefix: 'move-row-',
    i18nNamespaces: ['bulk_actions', 'bulk'],
    dropdowns: dedicated('moves', 'move-bulk-actions-dropdown', {
      printTestId: 'move-print-dropdown',
    }),
    hasMassEditSmoke: false,
  },
  losses: {
    route: '/losses',
    rowTestIdPrefix: 'loss-row-',
    i18nNamespaces: ['bulk_actions', 'bulk'],
    dropdowns: dedicated('losses', 'loss-bulk-actions-dropdown', {
      printTestId: 'loss-print-dropdown',
    }),
    hasMassEditSmoke: false,
  },
  enters: {
    route: '/enters',
    rowTestIdPrefix: 'enter-row-',
    i18nNamespaces: ['bulk_actions', 'bulk'],
    dropdowns: dedicated('enters', 'enter-bulk-actions-dropdown', {
      printTestId: 'enter-print-dropdown',
    }),
    hasMassEditSmoke: false,
  },
  inventories: {
    route: '/inventories',
    rowTestIdPrefix: 'inventory-row-',
    i18nNamespaces: ['bulk_actions', 'bulk'],
    dropdowns: dedicated('inventories', 'inventory-bulk-actions-dropdown', {
      printTestId: 'inventory-print-dropdown',
    }),
    hasMassEditSmoke: false,
  },

  // ---- Catalogs — dedicated dropdowns ------------------------------------
  counterparties: {
    route: '/counterparties',
    rowTestIdPrefix: 'counterparty-row-',
    i18nNamespaces: ['bulk_actions', 'bulk'],
    dropdowns: dedicated('counterparties', 'counterparty-bulk-actions-dropdown', {
      printTestId: 'counterparty-print-dropdown',
    }),
    hasMassEditSmoke: false,
  },
  projects: {
    route: '/settings/projects',
    rowTestIdPrefix: 'project-row-',
    i18nNamespaces: ['bulk_actions', 'bulk'],
    dropdowns: dedicated('projects', 'project-bulk-actions-dropdown'),
    hasMassEditSmoke: true,
  },
  currencies: {
    route: '/settings/currencies',
    rowTestIdPrefix: 'currency-row-',
    i18nNamespaces: ['bulk_actions', 'bulk'],
    dropdowns: dedicated('currencies', 'currency-bulk-actions-dropdown'),
    hasMassEditSmoke: false,
  },
  uoms: {
    route: '/settings/uoms',
    rowTestIdPrefix: 'uom-row-',
    i18nNamespaces: ['bulk_actions', 'bulk'],
    dropdowns: dedicated('uoms', 'uom-bulk-actions-dropdown'),
    hasMassEditSmoke: false,
  },

  // ---- Employees — dedicated dropdown under app/(app)/hr/employees -------
  employees: {
    route: '/hr/employees',
    rowTestIdPrefix: 'hr-employee-row-',
    i18nNamespaces: ['bulk_actions', 'bulk'],
    dropdowns: [
      {
        kind: 'bulk',
        triggerTestId: 'employee-bulk-actions-dropdown',
        componentPath: 'apps/web/src/app/(app)/hr/employees/_components/bulk-actions-dropdown.tsx',
        referenceState: BULK,
      },
    ],
    hasMassEditSmoke: false,
  },

  // ---- Money/invoice — shared toolbar menus ------------------------------
  'invoices-out': {
    route: '/invoices-out',
    rowTestIdPrefix: 'invoice-out-row-',
    i18nNamespaces: ['money_docs_menu', 'bulk'],
    dropdowns: moneyDropdowns(),
    hasMassEditSmoke: true,
  },
  'invoices-in': {
    route: '/invoices-in',
    rowTestIdPrefix: 'invoice-in-row-',
    i18nNamespaces: ['money_docs_menu', 'bulk'],
    dropdowns: moneyDropdowns(),
    hasMassEditSmoke: true,
  },
  'cash-in': {
    route: '/cash-in',
    rowTestIdPrefix: 'cash-in-row-',
    i18nNamespaces: ['money_docs_menu', 'bulk'],
    dropdowns: moneyDropdowns(),
    hasMassEditSmoke: true,
  },
  'cash-out': {
    route: '/cash-out',
    rowTestIdPrefix: 'cash-out-row-',
    i18nNamespaces: ['money_docs_menu', 'bulk'],
    dropdowns: moneyDropdowns(),
    hasMassEditSmoke: true,
  },
  'payments-in': {
    route: '/payments-in',
    rowTestIdPrefix: 'payment-in-row-',
    i18nNamespaces: ['money_docs_menu', 'bulk'],
    dropdowns: moneyDropdowns(),
    hasMassEditSmoke: true,
  },
  'payments-out': {
    route: '/payments-out',
    rowTestIdPrefix: 'payment-out-row-',
    i18nNamespaces: ['money_docs_menu', 'bulk'],
    dropdowns: moneyDropdowns(),
    hasMassEditSmoke: true,
  },

  // ---- Assortment — shared toolbar menus ---------------------------------
  products: {
    route: '/products',
    rowTestIdPrefix: 'product-row-',
    i18nNamespaces: ['bulk_actions', 'bulk'],
    dropdowns: assortmentDropdowns(),
    hasMassEditSmoke: false,
  },
  services: {
    route: '/services',
    rowTestIdPrefix: 'service-row-',
    i18nNamespaces: ['bulk_actions', 'bulk'],
    dropdowns: assortmentDropdowns(),
    hasMassEditSmoke: false,
  },
  bundles: {
    route: '/bundles',
    rowTestIdPrefix: 'bundle-row-',
    i18nNamespaces: ['bulk_actions', 'bulk'],
    dropdowns: assortmentDropdowns(),
    hasMassEditSmoke: false,
  },

  // ---- purchase-orders — inline page-level dropdowns ---------------------
  'purchase-orders': {
    route: '/purchase-orders',
    rowTestIdPrefix: 'purchase-order-row-',
    // inline BulkActionDropdown reads page-scoped namespaces; static fallback
    // is unreliable here, so live capture is strongly preferred.
    i18nNamespaces: ['pages.purchase_orders'],
    dropdowns: [
      {
        kind: 'bulk',
        triggerTestId: 'bulk-change-dropdown',
        componentPath: 'apps/web/src/app/(app)/purchase-orders/page.tsx',
        referenceState: BULK,
      },
    ],
    hasMassEditSmoke: true,
  },
};

export function getModuleAudit(module: string): ModuleAudit | undefined {
  return OUR_MODULES[module];
}

export function listAuditModules(): string[] {
  return Object.keys(OUR_MODULES).sort();
}
