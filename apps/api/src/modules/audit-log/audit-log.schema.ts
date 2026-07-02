import { z } from 'zod';

/**
 * Audit log query schema — used by the detail page's "History" tab to fetch
 * the per-entity audit trail. The AuditLog table is indexed on
 * (accountId, entity, entityId, at DESC), so these fields are the hot path.
 */
export const AuditLogFilterSchema = z.object({
  entity: z.string().min(1).max(100),
  entityId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
});
export type AuditLogFilterInput = z.infer<typeof AuditLogFilterSchema>;

/**
 * Admin browse schema — used by the /settings/audit-log page to surface
 * the global audit trail with broad filters. All fields optional so admins
 * can drill in by entity, by user, by action keyword, by date range, or
 * any combination thereof. Indexed on (accountId, at DESC) and
 * (accountId, userId, at DESC), so user+date filters are fast; entity-only
 * filters fall back to (accountId, entity, entityId, at DESC).
 */
export const AdminAuditLogFilterSchema = z.object({
  entity: z.string().max(100).optional(),
  entityId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  action: z.string().max(100).optional(),
  /** Free-text search across `entity` + `action`. */
  search: z.string().max(100).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
});
export type AdminAuditLogFilterInput = z.infer<typeof AdminAuditLogFilterSchema>;
