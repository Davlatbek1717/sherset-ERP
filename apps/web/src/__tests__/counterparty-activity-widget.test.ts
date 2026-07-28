import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * counterparties/[id] CRM activity widget lock (B6 S17).
 *
 * DOM-grounded tab set (docs/audits/_B5-B6-DESIGN-GROUNDING-2026-06-13.md:48,
 * captured from the live counterparty card): События · Задачи · Документы ·
 * Файлы · Показатели. The widget consolidates the audit feed, attachments, and
 * balance/sales metrics into the single tabbed widget moysklad shows, and the
 * detail page mounts it in place of the three previously-stacked sections.
 *
 * REGRESSION-LOCK — non-vacuous (fails against the pre-S17 source).
 */
const REPO = join(__dirname, '..', '..', '..', '..');
const widget = readFileSync(
  join(REPO, 'apps/web/src/components/counterparty-activity-widget.tsx'),
  'utf8',
);
const page = readFileSync(
  join(REPO, 'apps/web/src/app/(app)/counterparties/[id]/page.tsx'),
  'utf8',
);
const ru = JSON.parse(readFileSync(join(REPO, 'apps/web/src/messages/ru.json'), 'utf8')) as {
  counterparty_activity?: Record<string, string>;
};
const uz = JSON.parse(readFileSync(join(REPO, 'apps/web/src/messages/uz.json'), 'utf8')) as {
  counterparty_activity?: Record<string, string>;
};

describe('counterparty/[id] CRM activity widget (B6 S17)', () => {
  it('renders the 5 DOM-grounded moysklad tabs', () => {
    for (const tab of ['tab-events', 'tab-tasks', 'tab-documents', 'tab-files', 'tab-metrics']) {
      expect(widget).toContain(`data-test-id="${tab}"`);
    }
  });

  it('wires each tab to its backend source', () => {
    // События = audit feed; Задачи = /tasks?agentId; Файлы = attachments.
    expect(widget).toMatch(/useDocumentHistory\('Counterparty'/);
    expect(widget).toMatch(/\/tasks\?agentId=/);
    expect(widget).toMatch(/entity="Counterparty"/);
    // Документы = fan-out across the 5 core agent-facing doc lists, merged.
    for (const ep of [
      '/customer-orders',
      '/demands',
      '/invoices-out',
      '/supplies',
      '/invoices-in',
    ]) {
      expect(widget).toContain(ep);
    }
    expect(widget).toMatch(/Promise\.allSettled/);
    expect(widget).toMatch(/agentId=\$\{counterpartyId\}/);
    // Показатели = the analytics endpoint (sales / returns / per-org balance).
    expect(widget).toMatch(/\/counterparties\/\$\{counterpartyId\}\/metrics/);
  });

  it('the detail page mounts the widget and drops the 3 stacked sections', () => {
    expect(page).toMatch(/<CounterpartyActivityWidget/);
    expect(page).toMatch(/counterpartyId=\{data\.id\}/);
    // The standalone audit DocumentTabs + AttachmentsSection were folded into
    // the widget (no longer imported/mounted on the page).
    expect(page).not.toMatch(/<DocumentTabs/);
    expect(page).not.toMatch(/<AttachmentsSection/);
  });

  /**
   * MASTER-TODO #16 (2026-07-28) — OPEN PRODUCT DECISION, deliberately not
   * forced by this guard.
   *
   * This used to require the «Показатели» toolbar to open INLINE forms
   * (`AdjustmentCreateForm` / `ReconciliationActForm` from
   * `counterparties/metrics-create-forms`). Today the widget navigates instead,
   * and `metrics-create-forms.tsx` is ORPHANED — nothing imports it.
   *
   * Satisfying the old assertion was investigated and rejected, because the
   * reconciliation half has MOVED ON: акт сверки now lives in `AktSverkaCard`
   * (counterparties/[id]/page.tsx:951 → /counterparty-statements, xlsx builder,
   * public /akt/:token), added over ~7 commits of active work. Wiring the
   * orphaned inline form back in would duplicate a shipped feature, and the
   * adoption commit's own rule («KEEP (Sherset): counterparties + debts») does
   * not say which of the two shapes wins.
   *
   * So the shape stays a user decision. What this guard protects instead is the
   * part that is unambiguous and user-visible TODAY: the adjustment action must
   * carry the counterparty, otherwise the target form opens blank.
   */
  it('Показатели create-actions reach their target WITH the counterparty context', () => {
    // «Создать корректировку» → prefilled adjustment editor (agentId is what
    // counterparty-adjustments/new reads to preselect «Контрагент»).
    expect(widget).toMatch(/counterparty-adjustments\/new\?agentId=\$\{counterpartyId\}/);
    expect(widget).toMatch(/data-test-id="metric-create-adjustment"/);
    expect(widget).toMatch(/data-test-id="metric-create-reconciliation"/);
    // The old centered-dialog modals must not come back either way.
    expect(widget).not.toMatch(/AdjustmentCreateModal|ReconciliationActModal/);
  });

  it('DECISION MARKER: metrics-create-forms is still orphaned', () => {
    // Fails the day someone wires it in — at which point the assertion above
    // should be replaced by the inline-form shape and #16 closed. Keeps the
    // open decision visible instead of letting it rot silently.
    expect(widget).not.toMatch(/metrics-create-forms/);
  });

  it('the counterparty_activity i18n namespace is complete ru+uz', () => {
    const keys = [
      'tab_events',
      'tab_tasks',
      'tab_documents',
      'tab_files',
      'tab_metrics',
      'events_empty',
      'tasks_empty',
      'documents_empty',
      'doc_col_type',
      'doc_col_number',
      'doc_col_status',
      'metric_sales',
      // «Показатели» analytics panel (moysklad 1:1 — sales / returns / per-org balance).
      'metric_balance_title',
      'metric_sales_title',
      'metric_returns_title',
      'metric_total_sum',
      'metric_avg_check',
      'metric_discount_sum',
      'metric_profit',
      'metric_create_adjustment',
      'metric_create_reconciliation',
    ];
    for (const k of keys) {
      expect(ru.counterparty_activity?.[k]).toBeTruthy();
      expect(uz.counterparty_activity?.[k]).toBeTruthy();
    }
  });
});
