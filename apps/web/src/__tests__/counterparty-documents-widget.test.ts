import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * B6 counterparty «Документы» tab guard (2026-06-13).
 *
 * The Документы fan-out was extended from 5 → all 18 agent-facing doc types, and
 * the table given the captured moysklad column set (Тип·Номер·Время·Организация·
 * Сумма·Валюта·Статус — _B5-B6-DESIGN-GROUNDING:49). Locks:
 *  1. DOC_TYPES has all 18 types (regression: was 5).
 *  2. Every type's statesKey has a detail_titles label in ru+uz (the «Тип»
 *     column must never leak a raw slug) AND a states.<key> sub-namespace
 *     (the «Статус» badge must not leak a raw state slug).
 *  3. The table renders Организация + Валюта columns and the Сумма cell uses
 *     displayAs:'none' (no double-currency with the separate Валюта column).
 */

const WEB = (...p: string[]) => join(__dirname, '..', ...p);
const src = readFileSync(WEB('components', 'counterparty-activity-widget.tsx'), 'utf8');
const ru = JSON.parse(readFileSync(WEB('messages', 'ru.json'), 'utf8'));
const uz = JSON.parse(readFileSync(WEB('messages', 'uz.json'), 'utf8'));

// Pull every statesKey: '<x>' literal out of the DOC_TYPES block.
const docTypesBlock = src.slice(src.indexOf('const DOC_TYPES'), src.indexOf('] as const'));
const statesKeys = [...docTypesBlock.matchAll(/statesKey:\s*'([a-z_]+)'/g)]
  .map((m) => m[1])
  .filter((k): k is string => typeof k === 'string');

describe('B6 Документы — 18 agent-facing doc types, fully labelled', () => {
  it('DOC_TYPES covers all 18 types (was 5)', () => {
    expect(statesKeys.length).toBe(18);
    // a spot-check of the NEW types the 5-type version missed
    for (const k of [
      'sales_return',
      'payment_in',
      'cash_out',
      'facture_out',
      'commission_report',
    ]) {
      expect(statesKeys).toContain(k);
    }
  });

  for (const key of statesKeys) {
    it(`${key} has a detail_titles label + states namespace in ru & uz`, () => {
      expect(ru.detail_titles[key]).toBeTruthy();
      expect(uz.detail_titles[key]).toBeTruthy();
      // states.<key> drives the «Статус» badge label; must exist so no raw slug leaks
      expect(ru.states[key]).toBeTruthy();
      expect(uz.states[key]).toBeTruthy();
    });
  }

  it('the table has Организация + Валюта columns and Сумма is currency-suppressed', () => {
    expect(src).toMatch(/t\('doc_col_organization'\)/);
    expect(src).toMatch(/t\('doc_col_currency'\)/);
    // Сумма cell renders the number only (the separate Валюта column carries the code)
    expect(src).toMatch(
      /formatMoney\(BigInt\(doc\.sumMinor\),\s*doc\.currency,\s*\{\s*displayAs:\s*'none'\s*\}\)/,
    );
    // both new column labels localized in ru+uz
    for (const m of [ru, uz]) {
      expect(m.counterparty_activity.doc_col_organization).toBeTruthy();
      expect(m.counterparty_activity.doc_col_currency).toBeTruthy();
    }
  });
});
