import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * counterparties/[id] «Доступ» section lock (B6 S15).
 *
 * Grounded against the live moysklad counterparty card
 * (`counterparties/detail/edit-default.html:175`): the >Доступ< section carries
 * >Сотрудник< (owner) · >Отдел< (group) · >Общий доступ< (shared). Ours rendered
 * none of them, and `ownerId` was previously NON-writable (create forced it to
 * the current user; update never handled it). This slice adds the three editors
 * (Employee picker / Group picker / shared checkbox), threads ownerId/groupId/
 * shared into the PATCH payload, keeps Save live on an access-only edit, and the
 * BE update connect/disconnects the owner + group relations.
 *
 * REGRESSION-LOCK — each assert fails against the pre-slice source (non-vacuous).
 */
const REPO = join(__dirname, '..', '..', '..', '..');
const page = readFileSync(
  join(REPO, 'apps/web/src/app/(app)/counterparties/[id]/page.tsx'),
  'utf8',
);
const service = readFileSync(
  join(REPO, 'apps/api/src/modules/counterparty/counterparty.service.ts'),
  'utf8',
);
const schema = readFileSync(
  join(REPO, 'apps/api/src/modules/counterparty/counterparty.schema.ts'),
  'utf8',
);

describe('counterparty/[id] «Доступ» section (B6 S15)', () => {
  it('renders the three access editors sourced from /employees + /groups', () => {
    // CatalogPickerField takes a `testId` prop (renders it as data-test-id);
    // the Checkbox sets data-test-id directly.
    expect(page).toMatch(/testId="field-owner"/);
    expect(page).toMatch(/testId="field-group"/);
    expect(page).toMatch(/data-test-id="field-shared"/);
    expect(page).toMatch(/\/employees\?search=/);
    expect(page).toMatch(/\/groups\?search=/);
    expect(page).toMatch(/section_access/);
  });

  it('threads ownerId/groupId/shared into the PATCH payload', () => {
    expect(page).toMatch(/ownerId: ownerId \?\? null/);
    expect(page).toMatch(/groupId: groupId \?\? null/);
    expect(page).toMatch(/\n\s*shared,\n/);
  });

  it('keeps Save live on an access-only edit (accessChanged in isDirty)', () => {
    expect(page).toMatch(/setAccessChanged\(true\)/);
    // whitespace-tolerant: the dirty-chain is biome-wrapped across lines once it grew long.
    expect(page).toMatch(/stateChanged\s*\|\|\s*accessChanged/);
  });

  it('BE accepts a writable, clearable ownerId and update connect/disconnects owner', () => {
    // ownerId must be writable (in the Create/Update schema, not just the filter)
    // and .nullish() so an explicit clear (null) is accepted, not 400'd.
    expect(schema).toMatch(/ownerId: uuid\.nullish\(\)/);
    expect(schema).toMatch(/groupId: uuid\.nullish\(\)/);
    // update() connect/disconnects the owner relation on the parsed ownerId.
    expect(service).toMatch(/if \(parsed\.ownerId !== undefined\)/);
    expect(service).toMatch(/data\.owner = parsed\.ownerId \? \{ connect/);
    // create() honours an explicit owner, defaulting to the creator.
    expect(service).toMatch(/ownerId: parsed\.ownerId \?\? userId/);
  });
});
