import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import type { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Shared schema for moysklad-style "mass edit" — apply the same
 * patch (owner / project / sales-channel / comment / tag) to many
 * documents at once. The exact field set is entity-specific; each
 * controller composes its own MassEditSchema by extending
 * `MassEditBaseSchema` with the fields it permits.
 *
 * The default common subset covers the three buttons moysklad shows
 * on every FSM document list ("Изменить ответственного / Проект /
 * Комментарий"). Entity-specific extras (e.g. salesChannelId on
 * customer-order, agentId on demand) go in the per-entity schema.
 */
const uuid = z.string().uuid();

export const MassEditBaseSchema = z.object({
  ids: z.array(uuid).min(1).max(100),
  ownerId: uuid.nullable().optional(),
  projectId: uuid.nullable().optional(),
  description: z.string().max(4096).nullable().optional(),
});
export type MassEditBaseInput = z.infer<typeof MassEditBaseSchema>;

/**
 * Per-entity helper to assert that at least one editable field is
 * present in the patch. Wraps `parse(raw)` and throws a Zod-style
 * error so the existing zod-exception filter renders a 400.
 */
export function assertPatchHasAtLeastOneField(
  patch: Record<string, unknown>,
  editableKeys: readonly string[],
): void {
  const hasAny = editableKeys.some((k) => Object.prototype.hasOwnProperty.call(patch, k));
  if (!hasAny) {
    throw new z.ZodError([
      {
        code: 'custom',
        path: ['patch'],
        message: `mass-edit patch must include at least one of: ${editableKeys.join(', ')}`,
      },
    ]);
  }
}

/**
 * Tenant-scoped foreign keys a mass-edit patch may carry. The
 * MassEditSchema validates only the UUID *format* of these ids, so on its
 * own the bulk path is a softer entry point than the single-document
 * create/update path (which already runs an ensure-in-tenant guard, e.g.
 * `work-order.ensureOwner` / `customer-order.ensureRefs`). Without the
 * check below a hand-crafted request could point `ownerId`/`projectId` at
 * a row from ANOTHER account — a "dangling FK" inside the caller's own
 * account. (No cross-tenant read leak: the foreign row stays scoped to
 * its real account; this only protects referential integrity.)
 */
export type MassEditTenantRefs = {
  ownerId?: string | null;
  projectId?: string | null;
};

/**
 * Assert every non-null tenant-scoped FK in `refs` belongs to `accountId`.
 * Skips `null`/`undefined` (those legitimately clear or omit the field).
 * Runs the checks in parallel and throws `BadRequestException` (→400) on
 * the first missing/cross-tenant reference, matching the per-document FK
 * guards. Call it at the top of every `massEditApply`, after `findById`
 * and before writing the patch.
 */
export async function assertMassEditRefsInTenant(
  prisma: PrismaService,
  accountId: string,
  refs: MassEditTenantRefs,
): Promise<void> {
  const checks: Promise<void>[] = [];
  if (refs.ownerId) {
    checks.push(
      prisma.client.employee
        .findFirst({ where: { id: refs.ownerId, accountId }, select: { id: true } })
        .then((row) => {
          if (!row) throw new BadRequestException('Xodim topilmadi');
        }),
    );
  }
  if (refs.projectId) {
    checks.push(
      prisma.client.project
        .findFirst({ where: { id: refs.projectId, accountId }, select: { id: true } })
        .then((row) => {
          if (!row) throw new BadRequestException('Loyiha topilmadi');
        }),
    );
  }
  await Promise.all(checks);
}
