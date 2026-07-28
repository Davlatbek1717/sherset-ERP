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

/**
 * Isolate the picker's fetcher so the assertions below cannot be satisfied by
 * an unrelated `organizationId` elsewhere in a 2000-line page. Stronger than
 * the previous whole-file scan.
 */
function organizationAccountFetcher(src: string, page: string): string {
  const start = src.indexOf('const organizationAccountFetcher');
  expect(start, `${page}: no organizationAccountFetcher`).toBeGreaterThan(-1);
  // Fetchers are top-level consts inside the component → they close on `\n  };`.
  const end = src.indexOf('\n  };', start);
  expect(end, `${page}: unterminated organizationAccountFetcher`).toBeGreaterThan(start);
  return src.slice(start, end);
}

/**
 * Both endpoints are BE-provided views of the SAME `OrganizationAccount` table
 * and BOTH filter on `organizationId` (`modules/reference/reference.controller.ts`:
 * `@Get('organization-accounts')` and its documented `@Get('bank-accounts')`
 * alias — "same shape … so pages can pick by intuitive name"). Accepting either
 * is therefore not a weakening: the scope assertion below is what matters.
 */
const SCOPED_ENDPOINT = /\/(organization-accounts|bank-accounts)\?/;

describe('org-account picker is scoped to the chosen organization', () => {
  for (const page of PAGES) {
    it(`${page} threads organizationId into the org-account fetch`, () => {
      const fetcher = organizationAccountFetcher(read(page), page);

      // 1. Hits a BE endpoint that supports organization scoping.
      expect(fetcher).toMatch(SCOPED_ENDPOINT);

      // 2. …and actually passes the document's organization. This is the
      //    money-integrity bit: without it the picker lists EVERY org's
      //    accounts. (`assertOrgAccountMatchesOrg` in the 11 doc services is
      //    the hard enforcement; this keeps the user from even seeing one.)
      expect(fetcher).toMatch(/organizationId/);
      expect(fetcher).toMatch(/set\(\s*['"]organizationId['"]|organizationId=\$\{/);

      // 3. The old unscoped literal must not come back.
      expect(fetcher).not.toMatch(
        /(organization|bank)-accounts\?search=\$\{encodeURIComponent\(s\)\}&limit=50/,
      );

      // 4. The option label can never render blank / "null". `name` is NOT
      //    NULL in the schema while `accountNumber` IS nullable (the
      //    auto-created default account has none — Phase-2 browser-QA
      //    2026-06-06), so the chain must include `name`. Either order is
      //    accepted: `accountNumber || name` (customer-orders) and
      //    `name || accountNumber || ''` (the climart-side forms) both satisfy
      //    the invariant, and moysklad itself labels this control by NAME
      //    (the live «Сум» dropdown — docs/PARITY-STATUS.md). Pinning one
      //    literal ordering was guard drift, not a real defect.
      expect(fetcher).toMatch(/x\.name/);
      expect(fetcher).toMatch(/x\.accountNumber\s*\|\||\|\|\s*x\.name/);
    });
  }
});
