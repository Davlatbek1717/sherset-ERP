/**
 * Canonical registry of the entity slugs the `/api/remap/1.2` compat router
 * serves (`INT-07`, Faza Q14).
 *
 * WHY A SEPARATE FILE. Until Faza Q14 the only list lived inside
 * `moysklad-compat.service.ts` as the keys of the private `SLUGS` record, so
 * `ApiTokenService.create` could validate scope GRAMMAR but not scope
 * MEMBERSHIP: `prodcut:read` was accepted, granted nothing (scopes are
 * fail-closed), and the admin only found out from the integration's first
 * 403. Importing the service into the token layer would have dragged Prisma
 * into a pure module, so the names moved here instead — a leaf module with
 * no imports.
 *
 * DRIFT IS A COMPILE ERROR, NOT A CONVENTION: the service types its config
 * map as `Record<CompatSlug, SlugConfig>`, so adding a slug there without
 * adding it here (or vice-versa) fails `tsc`. `compat-slugs.test.ts` locks
 * the runtime side too (`supportedSlugs()` is what the discovery endpoint
 * and the scope UI show).
 */

export const COMPAT_SLUGS = [
  'counterparty',
  'product',
  'organization',
  'employee',
  'store',
  'productfolder',
  'customerorder',
  'demand',
  'invoiceout',
  'supply',
  'purchaseorder',
  'invoicein',
  'salesreturn',
  'purchasereturn',
  'paymentin',
  'paymentout',
  'cashin',
  'cashout',
  'move',
  'loss',
  'enter',
  'inventory',
  'retaildemand',
  'retailshift',
  'production',
  'processingorder',
  'variant',
  'bundle',
  'contactperson',
  'pricetype',
  'cashdesk',
  'task',
  'pipeline',
  'opportunity',
  'call',
  'saleschannel',
  'onlineorder',
  'webhook',
  'webhookstock',
  'servicerequest',
] as const;

export type CompatSlug = (typeof COMPAT_SLUGS)[number];

const SLUG_SET: ReadonlySet<string> = new Set<string>(COMPAT_SLUGS);

/** Exact (case-sensitive, already-normalised) membership test. */
export function isKnownCompatSlug(slug: string): slug is CompatSlug {
  return SLUG_SET.has(slug);
}

/** The registry as a plain set — for pure helpers that take it as a param. */
export function compatSlugSet(): ReadonlySet<string> {
  return SLUG_SET;
}
