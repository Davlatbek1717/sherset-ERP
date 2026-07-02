import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Employee (account_id, username) uniqueness — PARTIAL unique index guard.
 *
 * Context (2026-06-12, 11t): the 11s hand-off flagged a "pre-existing drift —
 * username uniqueness NOT DB-enforced" after reading `prisma migrate diff`,
 * which permanently emits `CREATE UNIQUE INDEX "employees_account_id_username_key"`.
 * That was a MISREAD. The index is NOT missing — migration
 * 20260520095826_hr_module_foundation drops Prisma's generated plain index and
 * replaces it with a PARTIAL one, `Employee_account_username_uk ON
 * employees(account_id, username) WHERE username IS NOT NULL`, so non-null
 * usernames are unique per account while many employees may keep a NULL username
 * (the HR opt-in field). Prisma 5.x cannot model a partial/filtered unique index,
 * so it cannot "see" it and `migrate diff` reports the plain-index gap forever.
 *
 * Enforcement is PROVEN at runtime (not just declared): a duplicate non-null
 * username insert/update is rejected with Postgres 23505 — see
 * `scripts/probe-employee-username-index.mts`.
 *
 * This guard pins the resolution so neither half silently regresses:
 *   1. the schema keeps the @@unique (uniqueness intent + Prisma Client `where`);
 *   2. the migration keeps the PARTIAL index (the real enforcement);
 *   3. nobody "fixes" the benign diff by adding a plain index (which would
 *      duplicate/contradict the partial one);
 *   4. the document_sequences.updated_at @default(now()) — the OTHER, genuine
 *      drift the same diff surfaced — stays aligned to the DB default so the diff
 *      does not regrow.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');
const SCHEMA = join(REPO_ROOT, 'packages/db/prisma/schema.prisma');
const HR_MIGRATION = join(
  REPO_ROOT,
  'packages/db/prisma/migrations/20260520095826_hr_module_foundation/migration.sql',
);

// Strip `//` / `///` line comments AND /* */ blocks first — the schema carries a
// long doc-comment that names `employees_account_id_username_key` and the partial
// index to EXPLAIN the gap, so a raw token scan would match the prose, not a live
// declaration.
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('Employee (accountId, username) uniqueness is declared + partially enforced', () => {
  const schema = stripComments(readFileSync(SCHEMA, 'utf8'));
  const migration = readFileSync(HR_MIGRATION, 'utf8'); // keep comments: the SQL itself is the contract

  it('schema still declares the composite @@unique (intent + Client where API)', () => {
    // Whitespace-tolerant: `@@unique([accountId, username], name: "...")`.
    expect(schema).toMatch(
      /@@unique\(\[accountId,\s*username\][^)]*name:\s*"Employee_account_username_uk"/,
    );
  });

  it('schema does NOT pin a map: that would collide with the existing partial index', () => {
    // A `map: "Employee_account_username_uk"` makes `migrate diff` regenerate a
    // SAME-NAMED plain index → applying it errors ("relation already exists").
    // The partial index name is owned by the migration, not the @@unique map.
    const uniqueLine = schema
      .split('\n')
      .find((l) => /@@unique\(\[accountId,\s*username\]/.test(l));
    expect(uniqueLine).toBeDefined();
    expect(uniqueLine).not.toMatch(/map:/);
  });

  it('migration keeps the PARTIAL unique index (the real enforcement)', () => {
    // Drop the Prisma-generated plain index, then create the filtered one.
    expect(migration).toMatch(/DROP INDEX IF EXISTS "employees_account_id_username_key"/);
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX "Employee_account_username_uk"\s+ON "employees"\("account_id",\s*"username"\)\s+WHERE "username" IS NOT NULL/,
    );
  });

  it('document_sequences.updated_at keeps @default(now()) so the diff stays clean', () => {
    // Locate the DocumentSequence model block and assert the field carries both
    // @default(now()) and @updatedAt (DB has DEFAULT CURRENT_TIMESTAMP).
    const model = schema.match(/model DocumentSequence \{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(model).toMatch(/updatedAt\s+DateTime\s+@default\(now\(\)\)\s+@updatedAt/);
  });
});
