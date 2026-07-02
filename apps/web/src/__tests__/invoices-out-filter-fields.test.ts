import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Invoices-out list — moysklad «Счета покупателям» Фильтр-panel parity
 * (frontend wiring lock). Re-grounded LIVE #invoiceout 2026-06-26: the filter is
 * the moysklad 24-field grid, and every REFERENCE field is an INLINE multi-select
 * checkbox-dropdown (MultiCombobox) — click the input, search in-place, tick
 * several — NOT a modal picker. Row-major order:
 *   Период · Оплата · Отгружено · План. дата оплаты
 *   Товар или группа · Склад · Проект · Контрагент · Группа контрагента
 *   Счёт контрагента · Договор · Владелец контрагента · Организация · Счёт организации
 *   Статус · Проведено · Напечатано · Отправлено · Канал продаж
 *   Владелец-сотрудник · Владелец-отдел · Общий доступ · Когда изменен · Кто изменил
 *
 * A control that renders but is never forwarded into the request params is a dead
 * filter; typecheck/lint can't see a missing forwarding line, so this is a
 * source-scan guard. Companion BE guard: invoice-out.schema.test.ts (parse).
 */

const WEB_SRC = join(__dirname, '..');
const REPO = join(WEB_SRC, '..', '..', '..');
const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8');
// Strip comments so doc-comments can't satisfy the scans.
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const listPage = strip(read('apps/web/src/app/(app)/invoices-out/page.tsx'));

describe('invoices-out filter — the moysklad 24-field grid renders', () => {
  it('renders every live-grounded Фильтр control (data-test-id present)', () => {
    for (const testId of [
      'filter-period',
      'filter-payment-status',
      'filter-shipped-status',
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
      'filter-sales-channel',
      'filter-owner',
      'filter-group',
      'filter-shared',
      'filter-updated',
      'filter-modified-by',
    ]) {
      expect(listPage).toContain(`"${testId}"`);
    }
  });

  it('uses i18n keys for the labels (no hardcoded Cyrillic leak)', () => {
    expect(listPage).toContain("tFilters('agent_owner')");
    expect(listPage).toContain("tFilters('shared')");
    expect(listPage).toContain("tFilters('modified_by')");
  });

  it('does NOT surface «Заказ покупателя» / «Сумма» — absent from the live invoiceout filter', () => {
    expect(listPage).not.toContain('"filter-customer-order"');
    expect(listPage).not.toContain('"filter-sum-from"');
    expect(listPage).not.toContain('"filter-sum-to"');
  });

  it('reference fields are INLINE multi-select (MultiRefField), not modal pickers', () => {
    // The moysklad checkbox-dropdown; the old single-pick modal pattern is gone.
    expect(listPage).toContain('MultiRefField');
    expect(listPage).not.toContain('CatalogPickerField');
    expect(listPage).not.toMatch(/pickerOpen === 'agent'/);
  });
});

describe('invoices-out filter — multi-select fields forward as CSV *Ids', () => {
  it('forwards every reference array as a `*Ids` request param (non-vacuous)', () => {
    for (const p of [
      'agentIds',
      'organizationIds',
      'storeIds',
      'ownerIds',
      'productIds',
      'projectIds',
      'contractIds',
      'agentGroupIds',
      'agentOwnerIds',
      'agentAccountIds',
      'organizationAccountIds',
      'salesChannelIds',
      'groupIds',
      'modifiedByIds',
    ]) {
      expect(listPage).toContain(`paramsRecord.${p} =`);
    }
  });

  it('includes params.toString() in the react-query key (so a MultiCombobox pick refetches)', () => {
    // The reference arrays live OUTSIDE filterValues/extFilter, so the key must
    // serialise params (which encodes the *Ids) — else array picks wouldn't refetch.
    expect(listPage).toMatch(/listQueryKey\s*=\s*\[[\s\S]*?params\.toString\(\)[\s\S]*?\]/);
    expect(listPage).toContain('queryKey: listQueryKey');
  });

  it('saved filters round-trip the reference arrays (refs JSON + setters)', () => {
    expect(listPage).toContain("sp.set('refs'");
    expect(listPage).toContain('refSetters');
  });
});
