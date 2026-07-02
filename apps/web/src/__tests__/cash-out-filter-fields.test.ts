import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Cash-out list — moysklad «Расходный ордер / Платежи» Фильтр-panel parity
 * (frontend wiring lock, 2026-06-11n). Sibling of payments-out (11m), but a
 * cash document (РКО) — so it deliberately DIVERGES on one field.
 *
 * §4 grounding: 07-module/cashout/dom/00-clean-default.html renders the filter
 * labels as `<div class="gwt-Label" title="…">`. The cash-out gap closed here:
 *   - «Владелец контрагента» (agentOwnerId → agent.ownerId) — the owner
 *     EMPLOYEE of the counterparty, distinct from «Владелец-сотрудник»
 *     (the cash order's own owner). New BE clause, merged with agentGroupId.
 *
 * DELIBERATE DIVERGENCE from the payments-out mirror: the unified moysklad
 * money filter also lists «Счёт организации» (organizationAccountId), and
 * payments-out surfaces it — but CashOut has NO organizationAccountId column
 * (cash docs use «Касса», a cash desk, not a bank account). Surfacing it would
 * be a dead 11h filter, so it is intentionally NOT rendered. This guard asserts
 * that absence so a future "just mirror payments-out" edit can't reintroduce it.
 *
 * PLUS — the distinguishing cash-out fix — «Статья расходов» (expenseItem) was
 * a PRE-EXISTING DEAD list filter: the `expenseItem` column was never written
 * by any create/update path, so the surfaced free-text control matched nothing
 * (the exact 11h dead-control trap). Resolved by making the column LIVE: the
 * create/edit document forms now carry an expense-item picker that persists it.
 *
 * A control that renders but is never read into `paramsRecord`, or a form field
 * that is never put into the create/PATCH payload, is a dead filter.
 * typecheck/lint can't see a missing assignment, so this is a source-scan
 * guard. Companion BE guards: cash-out.schema.test.ts (parse) +
 * tools/scripts/verify-cash-out-filter-smoke.mjs (live narrowing).
 */

const WEB_SRC = join(__dirname, '..');
const REPO = join(WEB_SRC, '..', '..', '..');
const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8');
// Strip comments so doc-comments can't satisfy the scans.
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const listPage = strip(read('apps/web/src/app/(app)/cash-out/page.tsx'));
const newPage = strip(read('apps/web/src/app/(app)/cash-out/new/page.tsx'));
const detailPage = strip(read('apps/web/src/app/(app)/cash-out/[id]/page.tsx'));

describe('cash-out filter — new moysklad Фильтр field renders', () => {
  it('renders the Владелец контрагента control (data-test-id="filter-agent-owner")', () => {
    expect(listPage).toContain('"filter-agent-owner"');
  });

  it('uses the i18n key for the new label (no hardcoded Cyrillic leak)', () => {
    expect(listPage).toContain("tFilters('agent_owner')");
  });

  it('does NOT surface «Счёт организации» — CashOut has no organizationAccountId column (cash desk, not bank)', () => {
    // Deliberate divergence from payments-out: a control wired to a
    // non-existent column would be a dead 11h filter. Keep it absent.
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
});

describe('cash-out filter — the new field is forwarded to the API query', () => {
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

describe('cash-out «Статья расходов» — dead filter resolved by a live doc-form write-path', () => {
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
