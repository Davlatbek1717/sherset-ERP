import type { FilterDrawerValues } from '@moysklad/ui';

/**
 * Encode a `FilterDrawerValues` object as a URL query string suitable
 * for the SavedFiltersPills "Save current" feature. Stable key order,
 * empty/undefined values omitted, numeric fields stringified.
 *
 * Inverse of `filterFromQueryString` — round-trips without loss for
 * every field FilterDrawerValues defines.
 */
export function queryFromFilter(values: FilterDrawerValues): string {
  const usp = new URLSearchParams();
  if (values.momentFrom) usp.set('momentFrom', values.momentFrom);
  if (values.momentTo) usp.set('momentTo', values.momentTo);
  if (values.agentId) usp.set('agentId', values.agentId);
  if (values.agentLabel) usp.set('agentLabel', values.agentLabel);
  if (values.organizationId) usp.set('organizationId', values.organizationId);
  if (values.organizationLabel) usp.set('organizationLabel', values.organizationLabel);
  if (values.storeId) usp.set('storeId', values.storeId);
  if (values.storeLabel) usp.set('storeLabel', values.storeLabel);
  if (values.ownerId) usp.set('ownerId', values.ownerId);
  if (values.ownerLabel) usp.set('ownerLabel', values.ownerLabel);
  if (values.sumMinorFrom !== undefined && Number.isFinite(values.sumMinorFrom)) {
    usp.set('sumMinorFrom', String(values.sumMinorFrom));
  }
  if (values.sumMinorTo !== undefined && Number.isFinite(values.sumMinorTo)) {
    usp.set('sumMinorTo', String(values.sumMinorTo));
  }
  return usp.toString();
}

/**
 * Decode a URL query string back into the inline-filter `FilterDrawerValues`
 * shape. Used by the SavedFiltersPills `onApply` handlers so a saved
 * pill can rehydrate the inline-filter inputs without each page
 * implementing its own decode block.
 *
 * Only the fields that appear in `FilterDrawerValues` are decoded.
 * Any extra params on the saved query string (e.g. an entity-specific
 * `paymentStatus` filter) are simply re-sent on the next request, so
 * server-side filtering still works — but they won't appear in the
 * visual filter chrome until that page wires them in too.
 *
 * Numeric fields fall back to undefined if the value isn't a finite
 * number, to avoid pinning the filter to NaN.
 */
export function filterFromQueryString(qs: string): FilterDrawerValues {
  const usp = qs.startsWith('?') ? new URLSearchParams(qs.slice(1)) : new URLSearchParams(qs);
  const out: FilterDrawerValues = {};

  const str = (k: keyof FilterDrawerValues) => {
    const v = usp.get(k);
    if (v) (out as Record<string, unknown>)[k] = v;
  };
  str('momentFrom');
  str('momentTo');
  str('agentId');
  str('agentLabel');
  str('organizationId');
  str('organizationLabel');
  str('storeId');
  str('storeLabel');
  str('ownerId');
  str('ownerLabel');

  const num = (k: 'sumMinorFrom' | 'sumMinorTo') => {
    const raw = usp.get(k);
    if (!raw) return;
    const n = Number(raw);
    if (Number.isFinite(n)) out[k] = n;
  };
  num('sumMinorFrom');
  num('sumMinorTo');

  return out;
}
