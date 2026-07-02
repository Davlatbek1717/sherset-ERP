import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Bank-account inline CRUD guard (B6 S18, 2026-06-13).
 *
 * Locks three things the browser cert proved at a point in time:
 *  1. WIRING — the counterparty detail page renders <BankAccountsSection> and no
 *     longer ships the old read-only `data.bankAccounts.map(...)` table.
 *  2. CONTRACT — every field the component's toPayload can emit is accepted by
 *     the BE CreateCounterpartyAccountSchema (so nothing is silently stripped —
 *     the same FE↔BE contract bug-class api-contract.test.ts guards elsewhere).
 *  3. LABELS — the new form i18n keys exist in BOTH ru and uz (no leak).
 */

const WEB = (...p: string[]) => join(__dirname, '..', ...p);
const API_SCHEMA = join(
  __dirname,
  '..',
  '..',
  '..',
  'api',
  'src',
  'modules',
  'counterparty',
  'counterparty.schema.ts',
);

const section = readFileSync(WEB('components', 'bank-accounts-section.tsx'), 'utf8');
const page = readFileSync(WEB('app', '(app)', 'counterparties', '[id]', 'page.tsx'), 'utf8');
const schema = readFileSync(API_SCHEMA, 'utf8');

describe('B6 S18 — bank-account inline CRUD', () => {
  it('the detail page wires <BankAccountsSection> and dropped the read-only table', () => {
    expect(page).toMatch(
      /import\s+\{\s*BankAccountsSection\s*\}\s+from\s+'@\/components\/bank-accounts-section'/,
    );
    // Embedded inside the «Реквизиты» card (bare) since the 2026-06-21 moysklad card regroup.
    expect(page).toMatch(/<BankAccountsSection\s+counterpartyId=\{data\.id\}\s+bare\s*\/>/);
    // regression: the old read-only render must be gone (it mapped data.bankAccounts)
    expect(page).not.toMatch(/data\.bankAccounts\.map/);
  });

  it('hits all four BE bank-account routes', () => {
    expect(section).toMatch(
      /api\.get<BankAccount\[\]>\(`\/counterparties\/\$\{counterpartyId\}\/bank-accounts`\)/,
    );
    expect(section).toMatch(/api\.post\(`\/counterparties\/\$\{counterpartyId\}\/bank-accounts`/);
    expect(section).toMatch(
      /api\.patch\(`\/counterparties\/\$\{counterpartyId\}\/bank-accounts\/\$\{id\}`/,
    );
    expect(section).toMatch(
      /api\.delete\(`\/counterparties\/\$\{counterpartyId\}\/bank-accounts\/\$\{id\}`/,
    );
  });

  it('every field toPayload can emit is accepted by CreateCounterpartyAccountSchema', () => {
    // Fields the FE payload builder produces (toPayload).
    const feFields = [
      'accountNumber',
      'currency',
      'isMain',
      'bankName',
      'bankLocation',
      'correspondentAccount',
      'mfo',
    ];
    // The BE Create schema's object keys.
    const beBlock = schema.slice(schema.indexOf('CreateCounterpartyAccountSchema'));
    for (const f of feFields) {
      expect(section).toContain(f); // FE really emits it
      expect(beBlock).toMatch(new RegExp(`\\b${f}:\\s`)); // BE accepts it (not stripped)
    }
    // The BE extras we deliberately DO NOT send (no grounded label).
    expect(section).not.toMatch(/payload\.(bankInn|swift)\s*=/);
  });
});

describe('B6 S18 — i18n parity for new bank form keys', () => {
  const ru = JSON.parse(readFileSync(WEB('messages', 'ru.json'), 'utf8'));
  const uz = JSON.parse(readFileSync(WEB('messages', 'uz.json'), 'utf8'));
  const keys = [
    'bank_add_button',
    'bank_location_label',
    'bank_correspondent_label',
    'bank_main_label',
    'bank_account_required',
    // «БИК» (was «МФО») — moysklad.uz live-grounded label for the bank-code field.
    'bank_bik_label',
    'bank_bik_invalid',
  ];
  for (const k of keys) {
    it(`${k} exists in ru + uz`, () => {
      expect(ru.pages.counterparty_new[k]).toBeTruthy();
      expect(uz.pages.counterparty_new[k]).toBeTruthy();
    });
  }
});
