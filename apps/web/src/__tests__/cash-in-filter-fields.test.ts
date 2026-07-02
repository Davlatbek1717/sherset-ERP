import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Cash-in list — moysklad «Приходный ордер / Платежи» Фильтр-panel parity
 * (frontend wiring lock, 2026-06-12). Sibling of cash-out (11n), but an INCOME
 * document (ПКО) — so it diverges on TWO fields that cash-out either carries or
 * deliberately omits.
 *
 * §4 grounding: 07-module/cashin/dom/00-clean-default.html renders the filter
 * labels as `<div class="gwt-Label" title="…">`. The cash-in gap closed here:
 *   - «Владелец контрагента» (agentOwnerId → agent.ownerId) — the owner
 *     EMPLOYEE of the counterparty, distinct from «Владелец-сотрудник»
 *     (the cash order's own owner). New BE clause, merged with agentGroupId.
 *
 * DELIBERATE ABSENCES (a "just mirror cash-out" edit must NOT reintroduce them):
 *   - «Статья расходов» (expenseItem) — exists ONLY on the money-OUT docs
 *     (CashOut / PaymentOut). CashIn is an income doc with no `expenseItem`
 *     column, so a filter or doc-form picker for it would be a dead 11h control.
 *   - «Счёт организации» (organizationAccountId) — cash docs use «Касса», a cash
 *     desk, not a bank account. CashIn has no organizationAccountId column.
 *
 * A control that renders but is never read into `paramsRecord`, or one wired to
 * a non-existent column, is a dead filter. typecheck/lint can't see a missing
 * assignment, so this is a source-scan guard. Companion BE guards:
 * cash-in.schema.test.ts (parse) +
 * tools/scripts/verify-cash-in-filter-smoke.mjs (live narrowing).
 */

const WEB_SRC = join(__dirname, '..');
const REPO = join(WEB_SRC, '..', '..', '..');
const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8');
// Strip comments so doc-comments can't satisfy the scans.
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const listPage = strip(read('apps/web/src/app/(app)/cash-in/page.tsx'));

describe('cash-in filter — new moysklad Фильтр field renders', () => {
  it('renders the Владелец контрагента control (data-test-id="filter-agent-owner")', () => {
    expect(listPage).toContain('"filter-agent-owner"');
  });

  it('uses the i18n key for the new label (no hardcoded Cyrillic leak)', () => {
    expect(listPage).toContain("tFilters('agent_owner')");
  });

  it('does NOT surface «Статья расходов» — CashIn is an income doc with no expenseItem column', () => {
    // Income-doc divergence from the cash-out mirror: a control wired to a
    // non-existent column would be a dead 11h filter. Keep it absent.
    expect(listPage).not.toContain('"filter-expense-item"');
    expect(listPage).not.toContain('expenseItem');
    expect(listPage).not.toContain("tFilters('expense_item')");
  });

  it('does NOT surface «Счёт организации» — cash docs use a cash desk, not a bank account', () => {
    expect(listPage).not.toContain('"filter-org-account"');
    expect(listPage).not.toContain('organizationAccountId');
    expect(listPage).not.toContain("tFilters('organization_account')");
  });

  it('keeps the pre-existing filter controls (no regression)', () => {
    for (const testId of [
      'filter-period',
      'filter-agent',
      'filter-agent-group',
      'filter-contract',
      'filter-org',
      'filter-cash-desk',
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
      expect(listPage).toContain(`"${testId}"`);
    }
  });
});

describe('cash-in filter — the new field is forwarded to the API query', () => {
  // Anchored on the `paramsRecord.X = extFilter.X` ASSIGNMENT (the actual
  // forwarding), not a bare token — the JSX `value={extFilter.X...}` reads the
  // same field but never assigns into paramsRecord, so deleting the forwarding
  // line (turning the control into a dead «accepted-but-unapplied» filter) fails
  // the regex. Non-vacuous.
  it('puts agentOwnerId into the request params', () => {
    expect(listPage).toMatch(/paramsRecord\.agentOwnerId\s*=\s*extFilter\.agentOwnerId/);
  });

  it('includes extFilter in the react-query key (so changing a filter refetches)', () => {
    expect(listPage).toMatch(/listQueryKey\s*=\s*\[[\s\S]*?extFilter,[\s\S]*?\]/);
  });

  it('the Владелец контрагента picker fetches the /employees reference', () => {
    expect(listPage).toMatch(/pickerOpen === 'agentOwner'/);
    expect(listPage).toContain('/employees?search=');
  });
});
