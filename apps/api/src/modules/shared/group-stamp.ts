import type { PrismaClient } from '@moysklad/db';

/**
 * H4 record-scope foundation (RFC `_H4-OWN-GROUP-SCOPE-RFC.md`, P1).
 *
 * Resolve the creating employee's department `groupId` so a document can be
 * stamped with it at CREATE time. moysklad scopes per-record visibility by the
 * creating department (OWN_GROUP); the column existed on every doc model but was
 * never written (always NULL), so a manager scoped to their group would have
 * matched zero documents. This stamp populates it.
 *
 * READ-ONLY-SAFE: nothing enforces scope yet (the `RECORD_SCOPE_ENFORCED` flag
 * is still off / unbuilt), so stamping `groupId` changes NO behaviour today — it
 * only fills the column the future `scopedWhere` OWN_GROUP check will read.
 *
 * `userId` IS the acting employee id (= `user.sub`, the same value already used
 * for `ownerId`). Returns null when the employee has no group (the doc stays
 * ungrouped, exactly like today) or — defensively — when the employee is not in
 * the given tenant. Stamp ONCE at create; never rewrite on edit (moysklad keeps
 * the creating department).
 */
export async function resolveCreatorGroupId(
  db: PrismaClient,
  accountId: string,
  userId: string,
): Promise<string | null> {
  const emp = await db.employee.findUnique({
    where: { id: userId },
    select: { groupId: true, accountId: true },
  });
  return emp && emp.accountId === accountId ? emp.groupId : null;
}
