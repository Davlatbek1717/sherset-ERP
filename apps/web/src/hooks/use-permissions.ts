'use client';

/**
 * Frontend consumer of GET /permissions/me — the moysklad employee-card
 * «Настроить права» matrix, resolved server-side per user (MAX across roles).
 *
 * Used to hide top-nav modules the employee has no view access to (moysklad:
 * a user who can't see Закупки doesn't get the tab at all). The backend
 * remains the real enforcement (PermissionsGuard per route) — this is UX.
 *
 * Fail-open by design: while the matrix is loading (or on error) every module
 * stays visible, so an admin never sees the bar flash-empty; a restricted
 * user's forbidden clicks still 403 server-side.
 */

import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { useQuery } from '@tanstack/react-query';

export type PermissionScope = 'NO' | 'OWN' | 'OWN_GROUP' | 'OWN_AND_GROUP' | 'ALL';

export interface PermissionsMatrix {
  [entity: string]: { [action: string]: PermissionScope };
}

/** Top-nav module key → permission entities that make it visible. An empty
 *  list means «always visible» (dashboard, apps marketplace, HR — HR has its
 *  own parallel RBAC delivered in the JWT). */
export const MODULE_ENTITIES: Record<string, string[]> = {
  homepage: [],
  purchases: ['purchaseorder', 'supply', 'invoicein', 'purchasereturn', 'facturein'],
  sales: ['customerorder', 'demand', 'invoiceout', 'salesreturn', 'factureout', 'commissionreport'],
  goods: ['product', 'productfolder'],
  crm: ['counterparty', 'contactperson', 'call', 'opportunity'],
  stock: ['move', 'loss', 'enter', 'inventory', 'internalorder', 'pricelist'],
  money: ['paymentin', 'paymentout', 'cashin', 'cashout', 'counterpartyadjustment', 'prepayment'],
  retail: ['retailsale', 'cashiersession'],
  production: ['processingorder', 'processing', 'bom', 'workorder'],
  tasks: ['task'],
  apps: [],
  hr: [],
  // Menejer bo'limi — `hr` bilan bir xil: ro'yxat BO'SH, ya'ni menyu hammaga
  // ko'rinadi. Haqiqiy chek backendda: `HrPermissionGuard` (`employees:read`)
  // + FSM aktyor qoidalari. FE gating bu yerda FAIL-OPEN — qulf emas, qulaylik.
  menejer: [],
  analitika: ['analitika'],
};

/** Sub-nav route prefix → permission entities. A tab hides when every mapped
 *  entity's view scope is NO (moysklad: «Настроить права» removes individual
 *  menu items, not just whole modules). Unmapped routes stay visible. */
export const ROUTE_ENTITIES: Array<[prefix: string, entities: string[]]> = [
  ['/customer-orders', ['customerorder']],
  ['/invoices-out', ['invoiceout']],
  ['/demands', ['demand']],
  ['/commission-reports', ['commissionreport']],
  ['/sales-returns', ['salesreturn']],
  ['/factures-out', ['factureout']],
  ['/consignments', ['consignment']],
  ['/opportunities', ['opportunity']],
  ['/purchase-orders', ['purchaseorder']],
  ['/supplies', ['supply']],
  ['/invoices-in', ['invoicein']],
  ['/purchase-returns', ['purchasereturn']],
  ['/factures-in', ['facturein']],
  ['/payments-in', ['paymentin']],
  ['/payments-out', ['paymentout']],
  ['/cash-ins', ['cashin']],
  ['/cash-outs', ['cashout']],
  ['/counterparty-adjustments', ['counterpartyadjustment']],
  ['/prepayments', ['prepayment']],
  ['/enters', ['enter']],
  ['/losses', ['loss']],
  ['/moves', ['move']],
  ['/inventories', ['inventory']],
  ['/internal-orders', ['internalorder']],
  ['/price-lists', ['pricelist']],
  // «Остатки»/«Обороты» are stock REPORTS — closest matrix entity is `report`
  // (our rights grid has no per-report granularity yet).
  ['/stock-balance', ['report']],
  ['/turnover', ['report']],
  ['/reports', ['report']],
  ['/stores', ['store']],
  ['/products', ['product']],
  ['/counterparties', ['counterparty']],
  ['/contracts', ['contract']],
  ['/calls', ['call']],
  ['/tasks', ['task']],
  // Specific sub-routes BEFORE their general prefix — the matcher takes the
  // first hit, so '/retail/sessions' must not fall through to '/retail'.
  ['/retail/sessions', ['cashiersession']],
  ['/retail/z-report', ['cashiersession']],
  ['/retail', ['retailsale']],
  ['/payments', ['paymentin', 'paymentout', 'cashin', 'cashout']],
  ['/payrolls', ['payroll']],
  ['/processings', ['processing']],
  ['/processing-orders', ['processingorder']],
  ['/production/boms', ['bom']],
  ['/production/work-orders', ['workorder']],
  ['/production/processes', ['processingprocess']],
  ['/production/stages', ['processingstage']],
  ['/productions', ['processing']],
  ['/production', ['processing', 'processingorder', 'workorder']],
];

export function usePermissions() {
  // Wait for the session bootstrap before asking. The query used to fire on
  // mount, BEFORE /auth/refresh had produced an access token, so every page load
  // logged a `401 GET /permissions/me` in the console; `retry: 1` then quietly
  // re-fetched with the token and the app worked — the failure was invisible in
  // behaviour but polluted the console and any error monitoring. Gating on the
  // bootstrapped token removes the doomed first call entirely. (Found by the
  // 2026-07-31 customer-orders parity capture, which flags console errors.)
  const { accessToken, initialized } = useAuth();
  const query = useQuery<{ matrix: PermissionsMatrix }>({
    queryKey: ['permissions-me'],
    queryFn: () => api.get<{ matrix: PermissionsMatrix }>('/permissions/me'),
    staleTime: 300_000,
    retry: 1,
    enabled: initialized && !!accessToken,
  });

  const matrix = query.data?.matrix;

  /** view scope !== NO. Unknown entity (older API) counts as visible. */
  const canView = (entity: string): boolean => {
    if (!matrix) return true; // fail-open while loading / on error
    const scope = matrix[entity]?.view;
    return scope === undefined || scope !== 'NO';
  };

  /** A module is visible when any of its entities is viewable. */
  const canSeeModule = (moduleKey: string): boolean => {
    if (!matrix) return true;
    const entities = MODULE_ENTITIES[moduleKey];
    if (!entities || entities.length === 0) return true;
    return entities.some((e) => canView(e));
  };

  /** A sub-nav tab is visible when its route's entities are viewable. */
  const canSeeRoute = (href: string): boolean => {
    if (!matrix) return true;
    const match = ROUTE_ENTITIES.find(
      ([prefix]) => href === prefix || href.startsWith(`${prefix}/`),
    );
    if (!match) return true;
    return match[1].some((e) => canView(e));
  };

  return { matrix, isLoading: query.isLoading, canView, canSeeModule, canSeeRoute };
}
