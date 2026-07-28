import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Invoices-in list — moysklad «Счета поставщиков» Фильтр-panel parity (frontend
 * wiring lock). REBUILT 2026-06-25 to MIRROR the purchase-orders gold standard:
 * the panel now renders the live-grounded 25-field invoicein filter, with the
 * reference filters as MULTI-select MultiCombobox checkbox-dropdowns (Группа
 * контрагента / Договор / Владелец контрагента / Склад / Проект /
 * Владелец-сотрудник / Владелец-отдел / Товар или группа / Кто изменил) and the
 * single-FK pickers (Контрагент / Счет контрагента / Организация / Счет
 * организации) kept as CatalogPicker modals.
 *
 * Deliberate REMOVALS vs the previous panel (moysklad's invoicein filter has
 * neither): «Заказ поставщику» (purchaseOrderId) and the «Сумма» range
 * (sumMinorFrom/To). NEW fields: «Входящий номер», «Входящая дата», «Оплата»,
 * «Приемка», «План. дата оплаты», «Товар или группа», «Общий доступ», «Кто
 * изменил». «Кто изменил» is backed via an auditLog approximation (InvoiceIn
 * has no modifiedById column yet).
 *
 * A control that renders but is never read into the request params is a dead
 * filter. typecheck/lint can't see a missing forwarding line, so this is a
 * source-scan guard.
 */

const WEB_SRC = join(__dirname, '..');
const REPO = join(WEB_SRC, '..', '..', '..');
const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8');
// Strip comments so doc-comments can't satisfy the scans.
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const listPage = strip(read('apps/web/src/app/(app)/invoices-in/page.tsx'));

describe('invoices-in filter — moysklad Фильтр 25-field set renders', () => {
  it('renders ALL 25 filter controls in the panel (data-test-ids present)', () => {
    for (const testId of [
      'filter-period',
      'filter-incoming-number',
      'filter-incoming-date',
      'filter-payment-state',
      'filter-receive-state',
      'filter-payment-planned',
      'filter-product',
      'filter-store',
      'filter-project',
      'filter-agent',
      'filter-agent-group',
      'filter-agent-account',
      'filter-contract',
      'filter-agent-owner',
      'filter-org',
      'filter-org-account',
      'filter-state',
      'filter-applicable',
      'filter-printed',
      'filter-published',
      'filter-owner',
      'filter-group',
      'filter-shared',
      'filter-updated',
      'filter-modified-by',
    ]) {
      expect(listPage).toContain(`"${testId}"`);
    }
  });

  it('DROPS «Заказ поставщику» + «Сумма» range — not part of moysklad invoicein', () => {
    // No purchase-order filter control / param.
    expect(listPage).not.toContain('"filter-purchase-order"');
    expect(listPage).not.toMatch(/filterValues\.purchaseOrderId\s*\?\s*\{\s*purchaseOrderId:/);
    // No Сумма-range filter controls / params.
    expect(listPage).not.toContain('"filter-sum-from"');
    expect(listPage).not.toContain('"filter-sum-to"');
    expect(listPage).not.toContain('sumMinorFrom:');
    expect(listPage).not.toContain('sumMinorTo:');
  });

  it('the reference filters are MULTI-select (MultiCombobox), not single pickers', () => {
    // The multi-select state arrays exist and back the MultiCombobox controls.
    for (const setter of [
      'setAgentGroups',
      'setAgentOwners',
      'setStores',
      'setProjects',
      'setContracts',
      'setOwners',
      'setGroups',
      'setModifiedBys',
      'setProducts',
    ]) {
      expect(listPage).toContain(setter);
    }
    // No single-FK pickerOpen states for the now-multi reference filters.
    expect(listPage).not.toMatch(/pickerOpen === 'store'/);
    expect(listPage).not.toMatch(/pickerOpen === 'project'/);
    expect(listPage).not.toMatch(/pickerOpen === 'agentGroup'/);
    expect(listPage).not.toMatch(/pickerOpen === 'agentOwner'/);
    expect(listPage).not.toMatch(/pickerOpen === 'contract'/);
    expect(listPage).not.toMatch(/pickerOpen === 'owner'/);
    expect(listPage).not.toMatch(/pickerOpen === 'group'/);
  });

  /**
   * MASTER-TODO #8 — rewritten 2026-07-28.
   *
   * This used to assert the OPPOSITE: that agent / org / agentAccount /
   * orgAccount stayed `pickerOpen === '…'` CatalogPicker MODALS. The page has
   * since moved every one of them to inline MultiCombobox checkbox-dropdowns
   * «mirroring the purchase-orders gold standard» (its own comment) — there is
   * no `pickerOpen` left on this page at all. The old assertion therefore
   * demanded a shape the refactor deliberately removed, i.e. it asked for a
   * parity regression. Pinned here against what the page actually is.
   */
  it('agent / organization are inline multi-selects feeding CSV id params', () => {
    expect(listPage).toMatch(/MultiCombobox/);
    expect(listPage).toMatch(/agentIds: agents\.map\(\(x\) => x\.id\)\.join\(','\)/);
    expect(listPage).toMatch(/const \[agents, setAgents\] = useState<RefMulti\[\]>/);
  });

  it('NON-VACUOUS: the superseded modal shape is really gone', () => {
    for (const picker of ['agent', 'org', 'agentAccount', 'orgAccount']) {
      expect(listPage).not.toMatch(new RegExp(`pickerOpen === '${picker}'`));
    }
  });
});

describe('invoices-in filter — fields are forwarded to the API query (non-vacuous)', () => {
  it('forwards every multi-select as a CSV `<field>Ids` param', () => {
    expect(listPage).toMatch(
      /agentGroupIds:\s*agentGroups\.map\(\(x\)\s*=>\s*x\.id\)\.join\(','\)/,
    );
    expect(listPage).toMatch(
      /agentOwnerIds:\s*agentOwners\.map\(\(x\)\s*=>\s*x\.id\)\.join\(','\)/,
    );
    expect(listPage).toMatch(/storeIds:\s*stores\.map\(\(x\)\s*=>\s*x\.id\)\.join\(','\)/);
    expect(listPage).toMatch(/projectIds:\s*projects\.map\(\(x\)\s*=>\s*x\.id\)\.join\(','\)/);
    expect(listPage).toMatch(/contractIds:\s*contracts\.map\(\(x\)\s*=>\s*x\.id\)\.join\(','\)/);
    expect(listPage).toMatch(/ownerIds:\s*owners\.map\(\(x\)\s*=>\s*x\.id\)\.join\(','\)/);
    expect(listPage).toMatch(/groupIds:\s*groups\.map\(\(x\)\s*=>\s*x\.id\)\.join\(','\)/);
    expect(listPage).toMatch(
      /modifiedByIds:\s*modifiedBys\.map\(\(x\)\s*=>\s*x\.id\)\.join\(','\)/,
    );
    expect(listPage).toMatch(/productIds:\s*products\.map\(\(x\)\s*=>\s*x\.id\)\.join\(','\)/);
  });

  it('forwards the new scalar params (incomingNumber / dates / states / shared)', () => {
    expect(listPage).toMatch(
      /filterValues\.incomingNumber\s*\?\s*\{\s*incomingNumber:\s*filterValues\.incomingNumber\s*\}/,
    );
    expect(listPage).toMatch(/incomingDateFrom:\s*filterValues\.incomingDateFrom/);
    expect(listPage).toMatch(/incomingDateTo:\s*filterValues\.incomingDateTo/);
    expect(listPage).toMatch(/paymentPlannedFrom:\s*filterValues\.paymentPlannedFrom/);
    expect(listPage).toMatch(/paymentPlannedTo:\s*filterValues\.paymentPlannedTo/);
    expect(listPage).toMatch(/paymentState:\s*filterValues\.paymentState/);
    expect(listPage).toMatch(/receiveState:\s*filterValues\.receiveState/);
    expect(listPage).toMatch(
      /filterValues\.shared\s*\?\s*\{\s*shared:\s*filterValues\.shared\s*\}/,
    );
  });

  it('includes the filter params in the react-query key (so changing a filter refetches)', () => {
    expect(listPage).toMatch(/listQueryKey\s*=\s*\[[\s\S]*?params\.toString\(\)[\s\S]*?\]/);
  });

  it('the multi-select reference filters fetch their reference endpoints', () => {
    expect(listPage).toContain('/employees?search=');
    expect(listPage).toContain('/groups?search=');
    expect(listPage).toContain('/stores?search=');
    expect(listPage).toContain('/projects?search=');
    expect(listPage).toContain('/contracts?search=');
    expect(listPage).toContain('/products?search=');
  });
});
