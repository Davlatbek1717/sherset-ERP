import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Payments-out list — moysklad «Исходящие платежи» Фильтр-panel parity
 * (frontend wiring lock, 2026-06-11m). Sibling of payments-in (11l).
 *
 * Two §4-grounded filter gaps closed vs the captured moysklad panel
 * (payments-out/states/02-filter-applied.png, DOM-rendered grounding):
 *   - «Счёт организации» (organizationAccountId) — the BE schema +
 *     buildListWhere ALREADY accepted this param; only the FE control was
 *     missing (latent "BE-supported but un-surfaced" gap).
 *   - «Владелец контрагента» (agentOwnerId → agent.ownerId) — the owner
 *     EMPLOYEE of the counterparty, distinct from «Владелец-сотрудник»
 *     (the payment's own owner). New BE clause, merged with agentGroupId.
 *
 * PLUS — the distinguishing payments-out fix — «Статья расходов»
 * (expenseItem) was a PRE-EXISTING DEAD list filter: the `expenseItem`
 * column was never written by any create/update path, so the surfaced
 * free-text control matched nothing (the exact 11h dead-control trap). This
 * was resolved by making the column LIVE: the create/edit document forms now
 * carry an expense-item picker that persists it. These guards assert the
 * doc-form write-path exists so the list filter is honest.
 *
 * A control that renders but is never read into `paramsRecord`, or a form
 * field that is never put into the create/PATCH payload, is a dead filter.
 * typecheck/lint can't see a missing assignment, so this is a source-scan
 * guard. Companion BE guards: payment-out.schema.test.ts (parse) +
 * tools/scripts/verify-payment-out-filter-smoke.mjs (live narrowing).
 */

const WEB_SRC = join(__dirname, '..');
const REPO = join(WEB_SRC, '..', '..', '..');
const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8');
// Strip comments so doc-comments can't satisfy the scans.
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const listPage = strip(read('apps/web/src/app/(app)/payments-out/page.tsx'));
const newPage = strip(read('apps/web/src/app/(app)/payments-out/new/page.tsx'));
const detailPage = strip(read('apps/web/src/app/(app)/payments-out/[id]/page.tsx'));

describe('payments-out filter — new moysklad Фильтр fields render', () => {
  const controls: Array<[string, string]> = [
    ['Владелец контрагента', 'filter-agent-owner'],
    ['Счёт организации', 'filter-org-account'],
  ];
  for (const [label, testId] of controls) {
    it(`renders the ${label} control (data-test-id="${testId}")`, () => {
      expect(listPage).toContain(`"${testId}"`);
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
      'filter-expense-item',
      'filter-applicable',
      'filter-owner',
      'filter-group',
      'filter-sum-from',
      'filter-sum-to',
      'filter-updated',
    ]) {
      expect(listPage).toContain(`"${testId}"`);
    }
  });

  it('uses i18n keys for the new labels (no hardcoded Cyrillic leak)', () => {
    expect(listPage).toContain("tFilters('agent_owner')");
    expect(listPage).toContain("tFilters('organization_account')");
    expect(listPage).toContain("tFilters('org_account_disabled_hint')");
  });
});

describe('payments-out filter — every new field is forwarded to the API query', () => {
  // Anchored on the `paramsRecord.X = extFilter.X` ASSIGNMENT (the actual
  // forwarding), not a bare token — the JSX `value={extFilter.X...}` reads the
  // same field but never assigns into paramsRecord, so deleting the forwarding
  // line (turning the control into a dead «accepted-but-unapplied» filter) fails
  // the regex. Non-vacuous.
  const params: Array<[string, RegExp]> = [
    ['agentOwnerId', /paramsRecord\.agentOwnerId\s*=\s*extFilter\.agentOwnerId/],
    [
      'organizationAccountId',
      /paramsRecord\.organizationAccountId\s*=\s*extFilter\.organizationAccountId/,
    ],
  ];
  for (const [name, re] of params) {
    it(`puts ${name} into the request params`, () => {
      expect(listPage).toMatch(re);
    });
  }

  it('includes extFilter in the react-query key (so changing a filter refetches)', () => {
    expect(listPage).toMatch(/listQueryKey\s*=\s*\[[\s\S]*?extFilter,[\s\S]*?\]/);
  });

  it('the Владелец контрагента picker fetches the /employees reference', () => {
    expect(listPage).toMatch(/pickerOpen === 'agentOwner'/);
    expect(listPage).toContain('/employees?search=');
  });

  it('the Счёт организации picker fetches /organization-accounts scoped to the org', () => {
    expect(listPage).toMatch(/pickerOpen === 'orgAccount'/);
    expect(listPage).toContain('/organization-accounts?');
    // MASTER-TODO #8 (2026-07-28): the gate used to be pinned as
    // `disabled={!filterValues.organizationId}` — a SINGLE-select filter shape
    // this page no longer has. «Организация» became an inline MultiCombobox
    // (moysklad parity, mirrors purchase-orders), so the live gate is «at least
    // one organization chosen». Same invariant, current spelling.
    expect(listPage).toMatch(/disabled=\{!organizations\[0\]\?\.id\}/);
    // …and the picker only opens once that choice exists.
    expect(listPage).toMatch(/organizations\[0\]\?\.id && setPickerOpen\('orgAccount'\)/);
    // KNOWN LIMITATION (documented, not silently green): the account fetcher
    // scopes to organizations[0] — with several orgs selected only the first
    // one's accounts are offered. Widening it needs a BE change
    // (/organization-accounts takes a single organizationId).
    expect(listPage).toMatch(/const orgId = organizations\[0\]\?\.id/);
  });
});

describe('payments-out «Статья расходов» — dead filter resolved by a live doc-form write-path', () => {
  it('the create form renders an expense-item picker', () => {
    expect(newPage).toContain('"field-expense-item"');
    expect(newPage).toContain("tFields('expense_item')");
    expect(newPage).toMatch(/openPicker === 'expenseItem'/);
    expect(newPage).toContain('/expense-items?search=');
  });

  it('the create form PUTS expenseItem into the create payload (else the column stays dead)', () => {
    // Anchored on the spread into the payload object, not a bare `expenseItem`
    // token (the picker state reads it without persisting it).
    expect(newPage).toMatch(/\.\.\.\(expenseItem \? \{ expenseItem \} : \{\}\)/);
  });

  it('the edit form renders + persists expenseItem (editable on a draft)', () => {
    expect(detailPage).toContain('"field-expense-item"');
    expect(detailPage).toMatch(/openPicker === 'expenseItem'/);
    expect(detailPage).toContain('/expense-items?search=');
    // Forwarded into the PATCH payload (null-on-clear, mirrors externalCode).
    expect(detailPage).toMatch(/expenseItem:\s*form\.expenseItem \|\| null/);
    // Threaded through hydrate + the dirty-snapshot (else edits silently no-op).
    expect(detailPage).toMatch(/expenseItem:\s*d\.expenseItem \?\? ''/);
    expect(detailPage).toMatch(/expenseItem:\s*s\.expenseItem/);
  });
});
