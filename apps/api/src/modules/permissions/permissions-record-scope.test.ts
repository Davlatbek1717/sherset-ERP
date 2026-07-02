import { describe, expect, it, vi } from 'vitest';
import { PermissionsService } from './permissions.service.js';
import type { PermissionScope } from './permissions.types.js';

/**
 * H4 record-scope (RFC _H4-OWN-GROUP-SCOPE-RFC.md, W4) — unit-locks the flag-gated
 * read-path helpers added to PermissionsService:
 *   - isRecordScopeEnforced (per-account opt-in, default false)
 *   - recordScopeWhere      (flag off → {} ; flag on → scopedWhere OR-clause)
 *   - assertRecordAccess    (flag off → true ; flag on → canAccessRecord)
 *
 * Proves the machinery deterministically: with the flag OFF nothing filters
 * (today's behaviour, no regression); with it ON the OWN_GROUP / OWN / ALL clauses
 * are produced exactly. The live manager-visibility cert is scripts/verify-record-scope-smoke.mjs.
 */

const ACC = 'acc-1';
const EMP = 'emp-1';
const GROUP = 'group-A';

function makeService(opts: { enforced: boolean; scope: PermissionScope; groupId?: string | null }) {
  const account = { findUnique: vi.fn(async () => ({ recordScopeEnforced: opts.enforced })) };
  const employee = {
    findUnique: vi.fn(async () => ({
      id: EMP,
      groupId: opts.groupId === undefined ? GROUP : opts.groupId,
      roles: [{ role: { permissions: [{ entity: 'demand', action: 'view', scope: opts.scope }] } }],
    })),
  };
  const prisma = { client: { account, employee } };
  // biome-ignore lint/suspicious/noExplicitAny: minimal Prisma stub for a unit test
  return { svc: new PermissionsService(prisma as any), account, employee };
}

describe('PermissionsService.isRecordScopeEnforced', () => {
  it('returns the account flag (true)', async () => {
    const { svc } = makeService({ enforced: true, scope: 'OWN_GROUP' });
    expect(await svc.isRecordScopeEnforced(ACC)).toBe(true);
  });
  it('returns false when the account opted out (default)', async () => {
    const { svc } = makeService({ enforced: false, scope: 'OWN_GROUP' });
    expect(await svc.isRecordScopeEnforced(ACC)).toBe(false);
  });
  it('returns false when the account is missing (defensive)', async () => {
    const account = { findUnique: vi.fn(async () => null) };
    // biome-ignore lint/suspicious/noExplicitAny: minimal stub
    const svc = new PermissionsService({ client: { account } } as any);
    expect(await svc.isRecordScopeEnforced(ACC)).toBe(false);
  });
});

describe('PermissionsService.recordScopeWhere (flag-gated)', () => {
  it('flag OFF → {} (no filter, no behaviour change)', async () => {
    const { svc } = makeService({ enforced: false, scope: 'OWN_GROUP' });
    expect(await svc.recordScopeWhere(ACC, EMP, 'demand', 'view')).toEqual({});
  });

  it('flag ON + scope ALL → {} (privileged actor sees everything)', async () => {
    const { svc } = makeService({ enforced: true, scope: 'ALL' });
    expect(await svc.recordScopeWhere(ACC, EMP, 'demand', 'view')).toEqual({});
  });

  it('flag ON + OWN_GROUP → OR over {groupId, shared}', async () => {
    const { svc } = makeService({ enforced: true, scope: 'OWN_GROUP', groupId: GROUP });
    expect(await svc.recordScopeWhere(ACC, EMP, 'demand', 'view')).toEqual({
      OR: [{ groupId: GROUP }, { shared: true }],
    });
  });

  it('flag ON + OWN → OR over {ownerId, shared}', async () => {
    const { svc } = makeService({ enforced: true, scope: 'OWN' });
    expect(await svc.recordScopeWhere(ACC, EMP, 'demand', 'view')).toEqual({
      OR: [{ ownerId: EMP }, { shared: true }],
    });
  });
});

describe('PermissionsService.assertRecordAccess (flag-gated)', () => {
  const inGroup = { ownerId: 'someone-else', groupId: GROUP, shared: false };
  const otherGroup = { ownerId: 'someone-else', groupId: 'group-B', shared: false };
  const sharedRec = { ownerId: 'someone-else', groupId: 'group-B', shared: true };

  it('flag OFF → always true (no enforcement)', async () => {
    const { svc } = makeService({ enforced: false, scope: 'OWN_GROUP' });
    expect(await svc.assertRecordAccess(ACC, EMP, 'demand', 'view', otherGroup)).toBe(true);
  });

  it('flag ON + OWN_GROUP → true for a same-group record', async () => {
    const { svc } = makeService({ enforced: true, scope: 'OWN_GROUP', groupId: GROUP });
    expect(await svc.assertRecordAccess(ACC, EMP, 'demand', 'view', inGroup)).toBe(true);
  });

  it('flag ON + OWN_GROUP → false for another group (not shared)', async () => {
    const { svc } = makeService({ enforced: true, scope: 'OWN_GROUP', groupId: GROUP });
    expect(await svc.assertRecordAccess(ACC, EMP, 'demand', 'view', otherGroup)).toBe(false);
  });

  it('flag ON + OWN_GROUP → true for a shared record in another group', async () => {
    const { svc } = makeService({ enforced: true, scope: 'OWN_GROUP', groupId: GROUP });
    expect(await svc.assertRecordAccess(ACC, EMP, 'demand', 'view', sharedRec)).toBe(true);
  });
});
