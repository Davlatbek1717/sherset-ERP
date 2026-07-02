import { describe, expect, it, vi } from 'vitest';
import { resolveCreatorGroupId } from './group-stamp.js';

/**
 * Unit test for the H4 P1 create-stamp helper (non-vacuous: a grouped employee
 * resolves to their group; an ungrouped or cross-tenant one resolves to null).
 */

function db(emp: { groupId: string | null; accountId: string } | null) {
  return {
    employee: {
      findUnique: vi.fn(async () => emp),
    },
    // biome-ignore lint/suspicious/noExplicitAny: structural stub for PrismaClient
  } as any;
}

describe('resolveCreatorGroupId', () => {
  it('returns the employee group when in the same tenant', async () => {
    const g = await resolveCreatorGroupId(
      db({ groupId: 'grp-1', accountId: 'acc-1' }),
      'acc-1',
      'emp-1',
    );
    expect(g).toBe('grp-1');
  });

  it('returns null when the employee has no group', async () => {
    const g = await resolveCreatorGroupId(
      db({ groupId: null, accountId: 'acc-1' }),
      'acc-1',
      'emp-1',
    );
    expect(g).toBeNull();
  });

  it('returns null (defensive) when the employee is in a different tenant', async () => {
    const g = await resolveCreatorGroupId(
      db({ groupId: 'grp-x', accountId: 'other' }),
      'acc-1',
      'emp-1',
    );
    expect(g).toBeNull();
  });

  it('returns null when the employee is not found', async () => {
    const g = await resolveCreatorGroupId(db(null), 'acc-1', 'emp-1');
    expect(g).toBeNull();
  });

  it('looks the employee up by the actor userId', async () => {
    const d = db({ groupId: 'grp-1', accountId: 'acc-1' });
    await resolveCreatorGroupId(d, 'acc-1', 'emp-42');
    expect(d.employee.findUnique).toHaveBeenCalledWith({
      where: { id: 'emp-42' },
      select: { groupId: true, accountId: true },
    });
  });
});
