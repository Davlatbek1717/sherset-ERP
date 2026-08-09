import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Supplies list — moysklad «Приёмки» Фильтр-panel parity (frontend wiring lock).
 *
 * 2026-06-28 rewrite: every REFERENCE filter field is now an INLINE
 * multi-select checkbox-dropdown (MultiCombobox via the module-level
 * `MultiRefField`), mirroring the demands filter — NOT a modal CatalogPicker.
 * The user requirement was "HAR BIR input shunday bo'lishi kerak modal oyna
 * emas" (every reference input is an in-place dropdown, not a modal). The
 * request forwards the picks as CSV `*Ids` params (storeIds, agentIds, …).
 *
 * This guard locks: (1) every reference control still renders (its testId);
 * (2) the inline pattern — no modal CatalogPickerField in the filter, and the
 * `*Ids` CSV params are forwarded into the request; (3) the live-grounded
 * (2026-06-27) field SET — «Кто изменил», «Общий доступ», «Тип возврата»,
 * «Товар или группа» ARE present (they were re-grounded as real moysklad
 * #supply fields), and the deprecated «Заказ поставщику» / «Сумма» range are
 * NOT. typecheck/lint can't see a missing forwarding line, so this is a
 * source-scan guard. Companion BE guards: supply.schema.test.ts (parse) +
 * tools/scripts/verify-supply-filter-smoke.mjs (live narrowing + merge proof).
 */

const WEB_SRC = join(__dirname, '..');
const REPO = join(WEB_SRC, '..', '..', '..');
const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8');
// Strip comments so doc-comments can't satisfy the scans.
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const listPage = strip(read('apps/web/src/app/(app)/supplies/page.tsx'));

describe('supplies filter — every reference field renders (live-grounded SET)', () => {
  it('renders all moysklad #supply reference controls (data-test-id)', () => {
    for (const testId of [
      'filter-period',
      'filter-incoming-number',
      'filter-incoming-date',
      'filter-payment-status',
      'filter-product',
      'filter-return-type',
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

  it('uses the i18n key for «Владелец контрагента» (no hardcoded Cyrillic leak)', () => {
    expect(listPage).toContain("tFilters('agent_owner')");
  });

  it('does NOT surface the deprecated «Заказ поставщику» / «Сумма» range (not #supply fields)', () => {
    expect(listPage).not.toContain('"filter-purchase-order"');
    expect(listPage).not.toContain('"filter-sum-from"');
    expect(listPage).not.toContain('"filter-sum-to"');
  });
});

describe('supplies filter — reference fields are INLINE dropdowns, not modals', () => {
  it('uses the shared MultiRefField wrapper (inline checkbox-dropdown)', () => {
    // 2026-08-09: the page-local `function MultiRefField` (one of 3 identical
    // copies) moved to `@/components/filters/filter-fields`. What this guard
    // protects is unchanged — the reference filters must render the inline
    // checkbox-dropdown wrapper, not a modal picker — so it now anchors on the
    // import + the usage instead of the local definition.
    expect(listPage).toMatch(
      /import \{[^}]*MultiRefField[^}]*\} from '@\/components\/filters\/filter-fields';/,
    );
    expect(listPage).toContain('<MultiRefField');
  });

  it('does NOT use a modal CatalogPickerField for any reference filter field', () => {
    // The only modal CatalogPicker left is the mass-edit owner/project picker;
    // the in-filter reference fields must NOT be modal pickers.
    expect(listPage).not.toContain('CatalogPickerField');
    expect(listPage).not.toMatch(/pickerOpen === '(agent|store|org|product|contract|group)'/);
  });

  it('the reference fields feed MultiRefField with the right fetcher', () => {
    expect(listPage).toMatch(/onSearch=\{fetchCounterparties\}/);
    expect(listPage).toMatch(/onSearch=\{fetchStores\}/);
    expect(listPage).toMatch(/onSearch=\{fetchProducts\}/);
    expect(listPage).toMatch(/onSearch=\{fetchEmployees\}/);
  });
});

describe('supplies filter — the picks are forwarded to the API as CSV *Ids', () => {
  // Anchored on the params SPREAD that actually forwards the value
  // (`...(agents.length ? { agentIds: csvIds(agents) } : {})`). Deleting the
  // forwarding spread (turning a control into a dead «picked-but-unapplied»
  // filter) fails the regex.
  it('forwards the multi-select reference fields as CSV *Ids params', () => {
    for (const [state, param] of [
      ['agents', 'agentIds'],
      ['stores', 'storeIds'],
      ['organizations', 'organizationIds'],
      ['projects', 'projectIds'],
      ['contracts', 'contractIds'],
      ['agentGroups', 'agentGroupIds'],
      ['agentOwners', 'agentOwnerIds'],
      ['agentAccounts', 'agentAccountIds'],
      ['orgAccounts', 'organizationAccountIds'],
      ['owners', 'ownerIds'],
      ['groups', 'groupIds'],
      ['products', 'productIds'],
      ['modifiedBys', 'modifiedByIds'],
    ] as const) {
      expect(listPage).toMatch(
        new RegExp(`${state}\\.length\\s*\\?\\s*\\{\\s*${param}:\\s*csvIds\\(${state}\\)`),
      );
    }
  });

  it('includes the filter params in the react-query key (so changing a filter refetches)', () => {
    expect(listPage).toMatch(/listQueryKey\s*=\s*\[[\s\S]*?params\.toString\(\)[\s\S]*?\]/);
  });

  it('the Владелец контрагента field fetches the /employees reference', () => {
    expect(listPage).toContain("refFetcher('/employees')");
  });
});
