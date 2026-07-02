import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CreateOrganizationSchema,
  OrganizationAccountInputSchema,
  UpdateOrganizationSchema,
} from './organization.schema.js';

describe('CreateOrganizationSchema', () => {
  const valid = { name: 'ООО Дельта' };

  it('parses a minimal valid input with defaults', () => {
    const parsed = CreateOrganizationSchema.parse(valid);
    expect(parsed.name).toBe('ООО Дельта');
    expect(parsed.companyType).toBe('legalUZ');
    expect(parsed.payerVat).toBe(true);
  });

  it('requires a non-empty name', () => {
    expect(() => CreateOrganizationSchema.parse({ name: '' })).toThrow();
  });

  it('accepts optional «Внешний код» (externalCode)', () => {
    const parsed = CreateOrganizationSchema.parse({ ...valid, externalCode: 'ORG-EXT-1' });
    expect(parsed.externalCode).toBe('ORG-EXT-1');
  });

  it('coerces an empty-string externalCode to null (optionalEmpty helper)', () => {
    const parsed = CreateOrganizationSchema.parse({ ...valid, externalCode: '' });
    expect(parsed.externalCode).toBeNull();
  });

  it('rejects an externalCode longer than 50 chars', () => {
    expect(() =>
      CreateOrganizationSchema.parse({ ...valid, externalCode: 'x'.repeat(51) }),
    ).toThrow();
  });
});

describe('UpdateOrganizationSchema (.partial())', () => {
  it('accepts a lone externalCode patch', () => {
    const parsed = UpdateOrganizationSchema.parse({ externalCode: 'SYNC-77', version: 1 });
    expect(parsed.externalCode).toBe('SYNC-77');
  });

  it('accepts an empty patch (version is the only required field)', () => {
    expect(UpdateOrganizationSchema.parse({ version: 1 })).toEqual({ version: 1 });
  });
});

describe('UpdateOrganizationSchema optimistic-lock version token', () => {
  it('requires version on update (a save without it is rejected, not silently unguarded)', () => {
    expect(UpdateOrganizationSchema.safeParse({ externalCode: 'X' }).success).toBe(false);
    expect(UpdateOrganizationSchema.safeParse({ externalCode: 'X', version: 1 }).success).toBe(
      true,
    );
  });

  it('rejects a non-integer / negative version', () => {
    expect(UpdateOrganizationSchema.safeParse({ version: 1.5 }).success).toBe(false);
    expect(UpdateOrganizationSchema.safeParse({ version: -1 }).success).toBe(false);
    expect(UpdateOrganizationSchema.safeParse({ version: '1' }).success).toBe(false);
  });

  it('CREATE schema does not require version (new rows have no prior version)', () => {
    expect(CreateOrganizationSchema.safeParse({ name: 'ООО Тест' }).success).toBe(true);
  });
});

describe('OrganizationAccountInputSchema (inline org «Расчётный счёт» card)', () => {
  it('parses a NEW account (no id) with defaults', () => {
    const a = OrganizationAccountInputSchema.parse({ name: 'Сум' });
    expect(a.id).toBeUndefined(); // absent id ⇒ create path
    expect(a.currency).toBe('UZS');
    expect(a.isDefault).toBe(false);
  });

  it('requires a non-empty name (the «Расчётный счёт» display value)', () => {
    expect(OrganizationAccountInputSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('uppercases a lowercase currency', () => {
    expect(OrganizationAccountInputSchema.parse({ name: 'Доллар', currency: 'usd' }).currency).toBe(
      'USD',
    );
  });

  it('coerces empty bank fields (БИК/Банк/Адрес/Корр.счёт/счёт) to null', () => {
    const a = OrganizationAccountInputSchema.parse({
      name: 'X',
      bic: '',
      bankName: '',
      bankLocation: '',
      accountNumber: '',
      correspondentAccount: '',
    });
    expect([a.bic, a.bankName, a.bankLocation, a.accountNumber, a.correspondentAccount]).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('keeps a provided uuid id (update path) and rejects a non-uuid', () => {
    const id = '00000000-0000-0000-0000-000000000001';
    expect(OrganizationAccountInputSchema.parse({ id, name: 'X' }).id).toBe(id);
    expect(OrganizationAccountInputSchema.safeParse({ id: 'nope', name: 'X' }).success).toBe(false);
  });

  it('trims the name and rejects a whitespace-only «Расчётный счёт» (QA #7)', () => {
    expect(OrganizationAccountInputSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(OrganizationAccountInputSchema.parse({ name: '  Сум  ' }).name).toBe('Сум');
  });

  it('accepts an optional optimistic-lock version on an existing card (QA #2)', () => {
    const id = '00000000-0000-0000-0000-000000000001';
    expect(OrganizationAccountInputSchema.parse({ id, name: 'X', version: 3 }).version).toBe(3);
    expect(OrganizationAccountInputSchema.parse({ name: 'X' }).version).toBeUndefined();
  });
});

describe('Organization schema — inline accounts array', () => {
  it('CREATE accepts an optional accounts array', () => {
    const p = CreateOrganizationSchema.parse({
      name: 'ООО',
      accounts: [{ name: 'Сум', isDefault: true }],
    });
    expect(p.accounts?.[0]?.name).toBe('Сум');
    expect(p.accounts?.[0]?.isDefault).toBe(true);
  });

  it('omitting accounts leaves it undefined (existing accounts untouched on save)', () => {
    expect(CreateOrganizationSchema.parse({ name: 'ООО' }).accounts).toBeUndefined();
  });

  it('UPDATE accepts an explicit EMPTY array (replace semantics — delete all)', () => {
    // undefined ≠ [] : undefined skips account sync, [] means "remove every account".
    const p = UpdateOrganizationSchema.parse({ version: 1, accounts: [] });
    expect(p.accounts).toEqual([]);
  });

  it('caps the accounts array at 50', () => {
    const many = Array.from({ length: 51 }, () => ({ name: 'X' }));
    expect(CreateOrganizationSchema.safeParse({ name: 'ООО', accounts: many }).success).toBe(false);
  });
});

// REGRESSION-LOCK (2026-06-21, hardened post-adversarial-QA): inline org-account
// editing saves org + accounts in ONE transaction (atomic); a removed account is
// ARCHIVED, never hard-deleted (the FK graph is onDelete:SetNull, so a hard delete
// would silently null a draft/config row's binding — QA #1); each account update
// carries a per-account optimistic-lock version (QA #2); a foreign account id is
// rejected (no cross-org/tenant hijack); defaults are normalised to one-per-currency.
// Source-scan so these money-safety properties cannot silently regress (no
// DB-boundary mocking — Zod-only test policy).
describe('OrganizationService.syncAccounts money-safety wiring', () => {
  const serviceSrc = readFileSync(
    fileURLToPath(new URL('./organization.service.ts', import.meta.url)),
    'utf8',
  );

  it('saves org fields + accounts atomically inside a $transaction', () => {
    expect(serviceSrc).toContain('$transaction');
    expect(serviceSrc).toContain('syncAccounts');
  });

  it('ARCHIVES a removed account instead of hard-deleting (FK graph is onDelete:SetNull)', () => {
    // Hard-deleting would silently NULL a draft/config row's account binding (QA #1).
    // syncAccounts soft-deletes (archived:true) to preserve every binding.
    expect(serviceSrc, 'syncAccounts must NOT hard-delete an account').not.toMatch(
      /organizationAccount\.delete\(/,
    );
    expect(serviceSrc, 'a removed account is archived').toMatch(
      /data:\s*\{\s*archived:\s*true\s*\}/,
    );
  });

  it('threads a per-account optimistic-lock version into the update WHERE (QA #2)', () => {
    expect(serviceSrc).toMatch(/version:\s*a\.version/);
  });

  it('rejects a supplied account id that is not one of this org’s accounts', () => {
    expect(serviceSrc).toMatch(/existingIds\.has/);
  });

  it('normalises «Основной счёт» to at most one per currency', () => {
    expect(serviceSrc).toMatch(/seenCurrency/);
  });
});

// REGRESSION-LOCK (L12, 2026-06-05): the organizations list search box placeholder
// promises «Название или ИНН», but the service originally searched name + legalTitle
// only, so typing an INN returned nothing. INN lives in the uzRequisites JSON, so the
// service now ORs a JSON-path string filter. Source-scan so this cannot silently revert.
describe('OrganizationService.list search wiring', () => {
  const serviceSrc = readFileSync(
    fileURLToPath(new URL('./organization.service.ts', import.meta.url)),
    'utf8',
  );

  it('list() ORs name, legalTitle AND the uzRequisites.inn JSON path', () => {
    expect(serviceSrc, 'list() must consume the schema search field').toContain('filter.search');
    expect(serviceSrc, 'search must include the INN (uzRequisites JSON path)').toMatch(
      /uzRequisites:\s*\{\s*path:\s*\[\s*'inn'\s*\][\s\S]*string_contains/,
    );
  });
});
