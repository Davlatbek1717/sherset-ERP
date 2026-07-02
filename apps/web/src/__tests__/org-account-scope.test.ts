import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Org-account picker scope lock (money-integrity regression guard).
 *
 * Every money / sales / purchase document form has a bank-account picker
 * (`/organization-accounts`). Historically its fetcher did NOT pass the chosen
 * organizationId, so the picker listed EVERY organization's accounts — letting a
 * user attach organization B's account to organization A's document (money would
 * post to the wrong legal entity). The fix threads `organizationId` into the
 * fetcher query so the list is scoped to the document's organization. The BE
 * `assertOrgAccountMatchesOrg` guard is the hard enforcement; this FE lock keeps
 * the picker honest so the user never even sees a cross-org account.
 *
 * typecheck/lint cannot see an un-threaded fetcher, so this source-scan pins it:
 * each page's organization-accounts fetch must set `organizationId`. Adding a new
 * money document with this picker? Add it here and thread the org id.
 *
 * Second lock (label fallback): the default auto-created OrganizationAccount
 * ("Asosiy hisob") has accountNumber=null, so a picker that renders only
 * `accountNumber` shows a BLANK option and the literal text "null" once selected
 * (Phase-2 browser-QA, 2026-06-06). The fetcher must fall back to `name`
 * (`x.accountNumber || x.name`); this scan pins that fallback so it can't regress.
 */
const APP = join(__dirname, '..', 'app', '(app)');
const read = (p: string) => readFileSync(join(APP, `${p}/page.tsx`), 'utf8');

const PAGES = [
  'customer-orders/[id]',
  'invoices-out/[id]',
  'invoices-in/[id]',
  'payments-in/[id]',
  'payments-in/new',
  'payments-out/[id]',
  'payments-out/new',
  'prepayments/[id]',
  'prepayments/new',
  'prepayment-returns/[id]',
  'prepayment-returns/new',
  'purchase-orders/[id]',
  'purchase-returns/[id]',
  'sales-returns/[id]',
  'supplies/[id]',
];

describe('org-account picker is scoped to the chosen organization', () => {
  for (const page of PAGES) {
    it(`${page} threads organizationId into the /organization-accounts fetch`, () => {
      const src = read(page);
      // The page must reference the endpoint AND scope it by organization.
      expect(src).toContain('/organization-accounts?');
      expect(src).toMatch(/set\(\s*['"]organizationId['"]/);
      // The old unscoped literal must not survive.
      expect(src).not.toMatch(
        /organization-accounts\?search=\$\{encodeURIComponent\(s\)\}&limit=50/,
      );
      // The picker must fall back to the account name (number-less default
      // account would otherwise render blank / "null").
      expect(src).toMatch(/x\.accountNumber \|\| x\.name/);
    });
  }
});
