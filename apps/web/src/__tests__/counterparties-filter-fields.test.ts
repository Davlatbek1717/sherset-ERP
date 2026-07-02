import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Counterparties list — Фильтр-panel parity, reconciled 2026-06-18 to the USER'S
 * OWN account (farrux@climart_santex_group) LIVE filter. The earlier 11k panel (14
 * fields) was captured from a DIFFERENT account; climart's filter is:
 *   Создан · Наименование · Телефон · Адрес · Показывать · Статус ·
 *   Владелец-сотрудник  (+ dynamic custom «Дополнительные поля» e.g. Усто/tgid)
 * DEFERRED (climart has, backend lacks): «Баланс» от/до · «Дата/Текст события».
 *
 * Each control must (1) render and (2) forward its value into `params` — a control
 * that renders but is never read is a dead filter (the «accepted-but-unapplied»
 * bug-class; typecheck can't see a missing spread, so this is a source-scan guard).
 */

const WEB_SRC = join(__dirname, '..');
const REPO = join(WEB_SRC, '..', '..', '..');
const page = readFileSync(join(REPO, 'apps/web/src/app/(app)/counterparties/page.tsx'), 'utf8');
// Strip comments so the field-list doc-comment can't satisfy the scans.
const code = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('counterparties filter — climart Фильтр fields render', () => {
  const controls: Array<[string, string]> = [
    ['Создан', 'filter-created-period'],
    ['Дата события', 'filter-event-period'],
    ['Текст события', 'filter-event-text'],
    ['Наименование', 'filter-name'],
    ['Телефон', 'filter-phone'],
    ['Адрес', 'filter-address'],
    ['Показывать', 'filter-archived'],
    ['Баланс (от)', 'filter-balance-from'],
    ['Баланс (до)', 'filter-balance-to'],
    ['Статус', 'filter-state'],
    ['Владелец-сотрудник', 'filter-owner'],
  ];
  for (const [label, testId] of controls) {
    it(`renders the ${label} control (data-test-id="${testId}")`, () => {
      expect(code).toContain(`"${testId}"`);
    });
  }

  // Dynamic custom «Дополнительные поля» filter (one per account attribute).
  it('renders a dynamic custom-attribute filter (filter-attr-<code>)', () => {
    expect(code).toContain('filter-attr-');
    expect(code).toContain('attrMeta');
  });
});

describe('counterparties filter — removed (wrong-account) fields stay gone (regression lock)', () => {
  // climart's filter has NONE of these; they came from the stale 11k capture.
  const removed = [
    'filter-company-type',
    'filter-group',
    'filter-price-type',
    'filter-code',
    'filter-inn',
    'filter-discount-card',
    'filter-shared',
    'filter-tags',
    'filter-updated-period',
  ];
  for (const testId of removed) {
    it(`does NOT render the removed ${testId} control`, () => {
      expect(code).not.toContain(`"${testId}"`);
    });
  }
});

describe('counterparties filter — every field is forwarded to the API query', () => {
  const params: Array<[string, RegExp]> = [
    ['name', /name:\s*name\.trim\(\)/],
    ['phone', /phone:\s*phone\.trim\(\)/],
    ['address', /address:\s*address\.trim\(\)/],
    ['balanceFrom', /balanceFrom:\s*balanceFrom\.trim\(\)/],
    ['balanceTo', /balanceTo:\s*balanceTo\.trim\(\)/],
    ['stateId', /\.\.\.\(\s*stateId\s*\?\s*\{\s*stateId\s*\}\s*:\s*\{\}\)/],
    ['ownerId', /\.\.\.\(\s*ownerId\s*\?\s*\{\s*ownerId\s*\}\s*:\s*\{\}\)/],
    ['createdFrom', /\.\.\.\(\s*createdFrom\s*\?\s*\{\s*createdFrom\s*\}\s*:\s*\{\}\)/],
    ['createdTo', /\.\.\.\(\s*createdTo\s*\?\s*\{\s*createdTo\s*\}\s*:\s*\{\}\)/],
    ['eventText', /eventText:\s*eventText\.trim\(\)/],
    // Dynamic custom-attribute params spread into the request.
    ['attrFilterParams', /\.\.\.attrFilterParams/],
  ];
  for (const [name, re] of params) {
    it(`puts ${name} into the request params`, () => {
      expect(code).toMatch(re);
    });
  }

  it('includes the filter values in the react-query key (so changing a filter refetches)', () => {
    for (const v of ['name', 'phone', 'address', 'createdFrom', 'createdTo', 'attrFilterKey']) {
      expect(code).toMatch(new RegExp(`\\n\\s*${v},`));
    }
  });
});

/**
 * §4 label-grounding REGRESSION LOCK (kept from 2026-06-11k — still valid):
 * the visibility control is «Показывать» (filters.show), the CRM-state field is
 * the bare «Статус» (tFields.state).
 */
describe('counterparties filter — §4 captured-label grounding (Показывать / Статус)', () => {
  const ru = JSON.parse(readFileSync(join(REPO, 'apps/web/src/messages/ru.json'), 'utf8'));

  it('the visibility field uses filters.show (= «Показывать»), NOT fields.state (= «Статус»)', () => {
    expect(code).toMatch(/label=\{tFilters\('show'\)\}[\s\S]{0,400}data-test-id="filter-archived"/);
    expect(ru.filters.show).toBe('Показывать');
    expect(ru.filters.show_regular).toBe('Только обычные');
    expect(ru.filters.show_archived).toBe('Только архивные');
  });

  it('the CRM-state field uses the captured bare «Статус» (tFields.state)', () => {
    expect(code).toMatch(/label=\{tFields\('state'\)\}[\s\S]{0,400}data-test-id="filter-state"/);
    expect(ru.fields.state).toBe('Статус');
  });

  it('the visibility filter is tri-state (active / archived / all)', () => {
    expect(code).toMatch(/value="all"/);
    expect(code).toMatch(/'active' \| 'archived' \| 'all'/);
  });
});
