import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Supplies list — moysklad «Приёмки» Фильтр-panel parity (frontend wiring lock,
 * 2026-06-12). Sibling of the cash-in/cash-out filter conveyor, but a PURCHASE
 * document. Closes the one genuinely-live gap vs the purchase-orders gold
 * standard:
 *   - «Владелец контрагента» (agentOwnerId → agent.ownerId) — the owner
 *     EMPLOYEE of the counterparty, distinct from «Владелец-сотрудник»
 *     (ownerId, the supply's own owner). New BE clause, merged with agentGroupId.
 *
 * §4 grounding: 02-module/supply/dom/00-clean-default.html renders the filter
 * labels as `<div class="gwt-Label">` (Договор → Владелец контрагента →
 * Организация).
 *
 * DELIBERATE ABSENCES (a "just mirror the gold standard" edit must NOT add them
 * — both would be dead 11h controls):
 *   - «Кто изменил» (modifiedById) — Supply has no `updatedById` column.
 *   - «Общий доступ» (shared) — the `Supply.shared` column EXISTS but is never
 *     written (absent from CreateSupplySchema + mass-edit) → always DEFAULT
 *     false, so a filter on it would be vacuous.
 *
 * A control that renders but is never read into the request params, or one wired
 * to a never-written column, is a dead filter. typecheck/lint can't see a
 * missing forwarding line, so this is a source-scan guard. Companion BE guards:
 * supply.schema.test.ts (parse) +
 * tools/scripts/verify-supply-filter-smoke.mjs (live narrowing + merge proof).
 */

const WEB_SRC = join(__dirname, '..');
const REPO = join(WEB_SRC, '..', '..', '..');
const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8');
// Strip comments so doc-comments can't satisfy the scans.
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const listPage = strip(read('apps/web/src/app/(app)/supplies/page.tsx'));

describe('supplies filter — new moysklad Фильтр field renders', () => {
  it('renders the Владелец контрагента control (data-test-id="filter-agent-owner")', () => {
    expect(listPage).toContain('"filter-agent-owner"');
  });

  it('uses the i18n key for the new label (no hardcoded Cyrillic leak)', () => {
    expect(listPage).toContain("tFilters('agent_owner')");
  });

  it('does NOT surface «Кто изменил» — Supply has no updatedById column', () => {
    expect(listPage).not.toContain('"filter-modified-by"');
    expect(listPage).not.toContain('updatedById');
    expect(listPage).not.toContain("tFilters('modified_by')");
  });

  it('does NOT surface «Общий доступ» — Supply.shared is never written (dead column)', () => {
    expect(listPage).not.toContain('"filter-shared"');
    expect(listPage).not.toContain("tFilters('shared')");
    // The `shared` column is never assigned anywhere on this page.
    expect(listPage).not.toMatch(/\bshared\b/);
  });

  it('keeps the pre-existing filter controls (no regression)', () => {
    for (const testId of [
      'filter-period',
      'filter-agent',
      'filter-agent-group',
      'filter-agent-account',
      'filter-contract',
      'filter-org',
      'filter-org-account',
      'filter-store',
      'filter-project',
      'filter-state',
      'filter-purchase-order',
      'filter-applicable',
      'filter-printed',
      'filter-published',
      'filter-owner',
      'filter-group',
      'filter-sum-from',
      'filter-sum-to',
      'filter-updated',
    ]) {
      expect(listPage).toContain(`"${testId}"`);
    }
  });
});

describe('supplies filter — the new field is forwarded to the API query', () => {
  // Anchored on the params SPREAD that actually forwards the value
  // (`...(filterValues.agentOwnerId ? { agentOwnerId: filterValues.agentOwnerId } : {})`),
  // NOT a bare token — the JSX `value={filterValues.agentOwnerId ? { id: … }}`
  // reads the same field but builds a `{ id: … }` object, never a
  // `{ agentOwnerId: … }` param. Deleting the forwarding spread (turning the
  // control into a dead «accepted-but-unapplied» filter) fails the regex.
  it('puts agentOwnerId into the request params (spread form, non-vacuous)', () => {
    expect(listPage).toMatch(
      /filterValues\.agentOwnerId\s*\?\s*\{\s*agentOwnerId:\s*filterValues\.agentOwnerId\s*\}/,
    );
  });

  it('includes the filter params in the react-query key (so changing a filter refetches)', () => {
    expect(listPage).toMatch(/listQueryKey\s*=\s*\[[\s\S]*?params\.toString\(\)[\s\S]*?\]/);
  });

  it('the Владелец контрагента picker fetches the /employees reference', () => {
    expect(listPage).toMatch(/pickerOpen === 'agentOwner'/);
    expect(listPage).toContain('/employees?search=');
  });
});
