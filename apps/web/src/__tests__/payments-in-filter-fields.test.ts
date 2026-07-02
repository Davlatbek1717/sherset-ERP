import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Payments-in list — moysklad «Входящие платежи» Фильтр-panel parity
 * (frontend wiring lock, 2026-06-11l).
 *
 * The payments-in filter was enriched from 14 → 16 column-backed fields to
 * close two §4-grounded gaps vs the captured moysklad panel
 * (payments-in/states/02-filter-applied.png, DOM-rendered grounding):
 *   - «Счёт организации» (organizationAccountId) — the BE schema +
 *     buildListWhere ALREADY accepted this param; only the FE control was
 *     missing, so it was a latent "BE-supported but un-surfaced" gap.
 *   - «Владелец контрагента» (agentOwnerId → agent.ownerId) — the owner
 *     EMPLOYEE of the counterparty, distinct from «Владелец-сотрудник»
 *     (the payment's own owner). New BE clause, merged with agentGroupId.
 *
 * Each new control must (1) render in the panel, and (2) actually forward its
 * value into the API query — a control that renders but is never read into
 * `paramsRecord` is a dead "accepted-but-unapplied" filter. typecheck/lint
 * can't see a missing `paramsRecord` assignment, so this is a source-scan
 * guard. The companion BE guards live in payment-in.schema.test.ts (parse) and
 * tools/scripts/verify-payment-in-filter-smoke.mjs (live narrowing).
 *
 * The other 9 moysklad filter fields on the captured panel are DEFERRED
 * (documented with write-path evidence) — they are dead, computed, or N/A on
 * an inbound payment; see docs/audits/_PAYMENTS-IN-FILTER-PARITY-2026-06-11.md
 * §DEFERRED. This guard intentionally does NOT assert them.
 */

const WEB_SRC = join(__dirname, '..');
const REPO = join(WEB_SRC, '..', '..', '..');
const page = readFileSync(join(REPO, 'apps/web/src/app/(app)/payments-in/page.tsx'), 'utf8');
// Strip comments so the field-list doc-comment can't satisfy the scans.
const code = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('payments-in filter — new moysklad Фильтр fields render', () => {
  const controls: Array<[string, string]> = [
    ['Владелец контрагента', 'filter-agent-owner'],
    ['Счёт организации', 'filter-org-account'],
  ];
  for (const [label, testId] of controls) {
    it(`renders the ${label} control (data-test-id="${testId}")`, () => {
      expect(code).toContain(`"${testId}"`);
    });
  }

  it('keeps the pre-existing filter controls (no regression)', () => {
    for (const testId of [
      'filter-period',
      'filter-agent',
      'filter-agent-group',
      'filter-contract',
      'filter-org',
      'filter-project',
      'filter-state',
      'filter-payment-purpose',
      'filter-applicable',
      'filter-owner',
      'filter-group',
      'filter-sum-from',
      'filter-sum-to',
      'filter-updated',
    ]) {
      expect(code).toContain(`"${testId}"`);
    }
  });

  it('uses i18n keys for the new labels (no hardcoded Cyrillic leak)', () => {
    expect(code).toContain("tFilters('agent_owner')");
    expect(code).toContain("tFilters('organization_account')");
    expect(code).toContain("tFilters('org_account_disabled_hint')");
  });
});

describe('payments-in filter — every new field is forwarded to the API query', () => {
  // Anchored on the `paramsRecord.X = extFilter.X` ASSIGNMENT (the actual
  // forwarding), not a bare token — the JSX `value={extFilter.X...}` reads the
  // same field but never assigns into paramsRecord, so deleting the forwarding
  // line (turning the control into a dead «accepted-but-unapplied» filter — the
  // exact bug this guard exists to catch) fails the regex. Non-vacuous.
  const params: Array<[string, RegExp]> = [
    ['agentOwnerId', /paramsRecord\.agentOwnerId\s*=\s*extFilter\.agentOwnerId/],
    [
      'organizationAccountId',
      /paramsRecord\.organizationAccountId\s*=\s*extFilter\.organizationAccountId/,
    ],
  ];
  for (const [name, re] of params) {
    it(`puts ${name} into the request params`, () => {
      expect(code).toMatch(re);
    });
  }

  // Cache-key MEMBERSHIP — payments-in keys the whole `extFilter` object into
  // the react-query tuple, so any field change produces a new object identity →
  // refetch. (No per-field membership needed; the object is the unit.)
  it('includes extFilter in the react-query key (so changing a filter refetches)', () => {
    expect(code).toMatch(/listQueryKey\s*=\s*\[[\s\S]*?extFilter,[\s\S]*?\]/);
  });

  it('the Владелец контрагента picker fetches the /employees reference', () => {
    expect(code).toMatch(/pickerOpen === 'agentOwner'/);
    expect(code).toContain('/employees?search=');
  });

  it('the Счёт организации picker fetches /organization-accounts scoped to the org', () => {
    expect(code).toMatch(/pickerOpen === 'orgAccount'/);
    expect(code).toContain('/organization-accounts?');
    // disabled until an organization is chosen (accounts belong to an org).
    expect(code).toMatch(/disabled=\{!filterValues\.organizationId\}/);
  });
});
