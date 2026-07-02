import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { assertOrgAccountMatchesOrg } from './org-account.js';

/**
 * Money-integrity guard: a document's chosen bank account (organizationAccountId)
 * must belong to the document's own organization (organizationId), within the
 * caller's tenant (accountId). The historical bug let organization B's account be
 * attached to organization A's document (the account picker did not scope by org
 * and no service validated the pair), so money would post to the wrong legal
 * entity. These tests pin every branch of the guard, including the tenant-scoped
 * lookup that also closes the cross-tenant `connect` hole.
 */

function makeDb(account: { organizationId: string } | null) {
  const findFirst = vi.fn().mockResolvedValue(account);
  // Only the one method the guard uses; cast to satisfy the Pick<PrismaClient> param.
  return { db: { organizationAccount: { findFirst } } as never, findFirst };
}

describe('assertOrgAccountMatchesOrg', () => {
  it('is a no-op when organizationAccountId is null (optional field, nothing to check)', async () => {
    const { db, findFirst } = makeDb(null);
    await expect(assertOrgAccountMatchesOrg(db, 'acc-1', 'org-1', null)).resolves.toBeUndefined();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('is a no-op when organizationAccountId is undefined (unchanged on a partial update)', async () => {
    const { db, findFirst } = makeDb(null);
    await expect(
      assertOrgAccountMatchesOrg(db, 'acc-1', 'org-1', undefined),
    ).resolves.toBeUndefined();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('throws when the account does not exist in this tenant (closes the cross-tenant hole)', async () => {
    const { db, findFirst } = makeDb(null);
    await expect(assertOrgAccountMatchesOrg(db, 'acc-1', 'org-1', 'oa-x')).rejects.toThrow(
      BadRequestException,
    );
    // Lookup MUST be scoped by both the account id AND the tenant accountId.
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'oa-x', accountId: 'acc-1' },
      select: { organizationId: true },
    });
  });

  it('throws when the account belongs to a different organization (the money-integrity bug)', async () => {
    const { db } = makeDb({ organizationId: 'org-2' });
    await expect(assertOrgAccountMatchesOrg(db, 'acc-1', 'org-1', 'oa-2')).rejects.toThrow(
      'Tanlangan hisob raqami tashkilotga tegishli emas',
    );
  });

  it('resolves when the account belongs to the document organization', async () => {
    const { db } = makeDb({ organizationId: 'org-1' });
    await expect(assertOrgAccountMatchesOrg(db, 'acc-1', 'org-1', 'oa-1')).resolves.toBeUndefined();
  });
});

/**
 * Wiring lock (regression guard). Every document service that stores both
 * organizationId and organizationAccountId MUST run the guard on BOTH the
 * create and update paths — otherwise a cross-org account silently persists
 * money to the wrong legal entity. typecheck/lint cannot see a missing guard
 * call, so this source-scan pins it: each service imports the helper and calls
 * it at least twice (create + update). Adding a new money document? Add it here
 * and wire the guard — do not delete this lock.
 *
 * (demand is intentionally excluded: its create/update DTO does not accept
 * organizationAccountId — only clone() copies it from an already-validated
 * source — so there is no user-set org/account path to guard.)
 */
const GUARDED_SERVICES = [
  'customer-order',
  'invoice-out',
  'invoice-in',
  'payment-in',
  'payment-out',
  'prepayment',
  'prepayment-return',
  'supply',
  'purchase-return',
  'sales-return',
  'purchase-order',
];

describe('org-account guard is wired into every money-doc service (create + update)', () => {
  for (const svc of GUARDED_SERVICES) {
    it(`${svc}.service.ts imports and calls assertOrgAccountMatchesOrg ≥2×`, () => {
      const src = readFileSync(
        fileURLToPath(new URL(`../${svc}/${svc}.service.ts`, import.meta.url)),
        'utf8',
      );
      expect(src).toContain("from '../shared/org-account.js'");
      const calls = src.match(/assertOrgAccountMatchesOrg\(/g) ?? [];
      expect(calls.length).toBeGreaterThanOrEqual(2);
    });
  }
});
