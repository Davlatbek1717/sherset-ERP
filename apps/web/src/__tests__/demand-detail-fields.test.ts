import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Demand detail/new — «Счёт организации» + «План. дата отгрузки» + «План. дата
 * оплаты» frontend wiring lock (2026-06-13, detail-display #4/#5).
 *
 * The backend persists & returns all three (findById includes organizationAccount
 * + the deliveryPlannedMoment/paymentPlannedMoment scalars; migration
 * 20260614000000 added payment_planned_moment). The detail page previously could
 * not SHOW/EDIT the org-account + planned-ship date (write-path-only, bb86188f),
 * and payment-planned date did not exist at all.
 *
 * A detail field is only live end-to-end if it is wired through ALL of:
 * interface → formFromData (hydrate) → snapshot (dirty-detection) → save payload.
 * The snapshot link is the silent trap: a field omitted there never marks the
 * form dirty, so an edit is dropped with no error. typecheck can't see a missing
 * snapshot key, so this source-scan is the guard. BE companion:
 * scripts/verify-demand-detail-fields-smoke.mjs (live round-trip 5/5).
 *
 * Non-vacuous: before the wiring none of these tokens existed on either page.
 */

const WEB_SRC = join(__dirname, '..');
const REPO = join(WEB_SRC, '..', '..', '..');
const strip = (s: string) =>
  readFileSync(join(REPO, s), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

const DETAIL = strip('apps/web/src/app/(app)/demands/[id]/page.tsx');
const NEW = strip('apps/web/src/app/(app)/demands/new/page.tsx');

describe('demand detail page exposes organizationAccount + planned dates (#4/#5)', () => {
  it('DemandDetail interface declares all three (the GET reads them)', () => {
    expect(DETAIL).toMatch(/organizationAccount:\s*\{[^}]*name:\s*string/);
    expect(DETAIL).toMatch(/deliveryPlannedMoment:\s*string\s*\|\s*null/);
    expect(DETAIL).toMatch(/paymentPlannedMoment:\s*string\s*\|\s*null/);
  });

  it('formFromData hydrates all three from the detail payload', () => {
    expect(DETAIL).toMatch(/organizationAccountId:\s*d\.organizationAccount\?\.id/);
    expect(DETAIL).toMatch(/deliveryPlannedMoment:\s*d\.deliveryPlannedMoment\s*\?/);
    expect(DETAIL).toMatch(/paymentPlannedMoment:\s*d\.paymentPlannedMoment\s*\?/);
  });

  it('snapshot() includes all three so an edit marks the form dirty (silent-drop guard)', () => {
    expect(DETAIL).toMatch(/organizationAccountId:\s*s\.organizationAccountId/);
    expect(DETAIL).toMatch(/deliveryPlannedMoment:\s*s\.deliveryPlannedMoment/);
    expect(DETAIL).toMatch(/paymentPlannedMoment:\s*s\.paymentPlannedMoment/);
  });

  it('save payload sends all three to the API', () => {
    expect(DETAIL).toMatch(/organizationAccountId:\s*form\.organizationAccountId/);
    expect(DETAIL).toMatch(/deliveryPlannedMoment:\s*form\.deliveryPlannedMoment\s*\|\|\s*null/);
    expect(DETAIL).toMatch(/paymentPlannedMoment:\s*form\.paymentPlannedMoment\s*\|\|\s*null/);
  });

  it('the organizationAccount picker is wired (union member + fetcher + picker)', () => {
    expect(DETAIL).toMatch(/'organizationAccount'/);
    expect(DETAIL).toMatch(/organizationAccountFetcher/);
    expect(DETAIL).toMatch(/openPicker === 'organizationAccount'/);
  });
});

describe('demand /new sends paymentPlannedMoment (#5)', () => {
  it('the create payload includes paymentPlannedMoment', () => {
    expect(NEW).toMatch(/paymentPlannedMoment/);
  });
});
