import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Document History audit-write lock (2026-06-08g).
 *
 * internal-order / processing-order / price-list wrote ZERO auditLog rows, so
 * their detail-page History («Tarix») tab — which fetches
 * GET /audit-logs?entity=<slug>&entityId=<id> (exact-match on entity) — was
 * always vacuously empty. They now call a private logAudit on
 * create/update/softDelete/massEditApply + each FSM transition. bundle's
 * component-list edits (setComponents/removeComponent) were likewise silent —
 * the bundle detail page's History tab is the PARENT Product's feed
 * (auditEntity="Product"), so component edits are now logged under
 * entity='Product' (entityId=<bundleId>). This is the same empty-History
 * bug-class closed earlier for money-docs / bom / variant; see
 * catalog-history.test.ts for the catalog half.
 *
 * The lock pins two things typecheck/lint cannot see:
 *   1. the entity string EXACTLY matches the web auditEntity prop (a casing
 *      drift would silently re-empty the tab), and
 *   2. the helper is actually called on the mutating paths.
 * All four were runtime-verified live (api+db History battery, 2026-06-08g).
 */
const MODULES: Array<{ dir: string; slug: string; minCalls: number }> = [
  // slug PascalCase — matches web <doc>/[id] auditEntity="...".
  // create + update + softDelete + massEditApply + 3 transitions = 7 calls.
  { dir: 'internal-order', slug: 'InternalOrder', minCalls: 7 },
  { dir: 'processing-order', slug: 'ProcessingOrder', minCalls: 7 },
  { dir: 'price-list', slug: 'PriceList', minCalls: 7 },
  // bundle logs the component-list change under the parent Product's feed
  // (the web page uses auditEntity="Product"). setComponents + removeComponent.
  { dir: 'bundle', slug: 'Product', minCalls: 2 },
];

describe('document services write auditLog so the History tab is not vacuously empty', () => {
  for (const m of MODULES) {
    it(`${m.dir}.service.ts logs entity '${m.slug}' on its mutating paths`, () => {
      const src = readFileSync(
        fileURLToPath(new URL(`../${m.dir}/${m.dir}.service.ts`, import.meta.url)),
        'utf8',
      );
      // Exact-match contract with the web auditEntity prop.
      expect(src).toContain(`entity: '${m.slug}'`);
      // The helper is wired into the mutating paths.
      const calls = src.match(/this\.logAudit\(/g) ?? [];
      expect(calls.length).toBeGreaterThanOrEqual(m.minCalls);
    });
  }
});

/**
 * Counterparty bank-account audit feed (2026-06-08n).
 *
 * The counterparty detail page renders its bank accounts read-only and its
 * History tab is the PARENT counterparty's feed (auditEntity="Counterparty",
 * entityId=<counterpartyId>). The three nested bank-account endpoints
 * (POST/PATCH/DELETE /counterparties/:id/bank-accounts) all wrote audit rows
 * that NO page ever queries — create/update under entity='CounterpartyAccount'
 * (a model with no detail page), and delete under entity='Counterparty' but
 * with entityId=<bankAccountId> — so every one was orphaned and invisible.
 * They now log under the parent counterparty (entity='Counterparty',
 * entityId=<counterpartyId>) with distinct verbs, mirroring the bundle
 * component-list parent-feed pattern above. This lock pins the three things a
 * gate cannot otherwise see and a future refactor could silently re-break.
 */
describe('counterparty bank-account edits surface on the parent counterparty History feed', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../counterparty/counterparty.service.ts', import.meta.url)),
    'utf8',
  );

  it('uses three distinct, localizable verbs (create/update/delete-bank-account)', () => {
    expect(src).toContain("action: 'create-bank-account'");
    expect(src).toContain("action: 'update-bank-account'");
    expect(src).toContain("'delete-bank-account'");
  });

  it("never writes the orphaned entity 'CounterpartyAccount' (no page queries it)", () => {
    expect(src).not.toContain("entity: 'CounterpartyAccount'");
  });

  it('targets entityId = counterpartyId (the parent), not the bank account id', () => {
    // create + update are inline tx.auditLog.create blocks; the entityId line
    // must directly precede the verb. A regression to created.id / bankAccountId
    // re-orphans the row from the counterparty History query.
    expect(src).toMatch(/entityId:\s*counterpartyId,\s*action:\s*'create-bank-account'/);
    expect(src).toMatch(/entityId:\s*counterpartyId,\s*action:\s*'update-bank-account'/);
    // delete goes through logAudit(accountId, userId, action, entityId, …) — the
    // entityId arg right after the verb must be counterpartyId, not bankAccountId.
    expect(src).toMatch(/'delete-bank-account',\s*counterpartyId/);
    // And the old orphaning entityId must be gone from the bank-account writes.
    expect(src).not.toMatch(/'delete-bank-account',\s*bankAccountId/);
  });
});
