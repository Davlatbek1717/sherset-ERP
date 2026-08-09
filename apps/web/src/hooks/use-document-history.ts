'use client';

import { api } from '@/lib/api-client';
import type { ListEnvelope as ListResponse } from '@moysklad/contracts';
import { useQuery } from '@tanstack/react-query';

export interface AuditLogEntry {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  at: string;
  user: { id: string; name: string; email: string } | null;
  fieldChanges: Record<string, { before?: unknown; after?: unknown }> | null;
  context: Record<string, unknown> | null;
}

/**
 * Fetches the audit log for a single entity, keyed by (entity, entityId) so
 * each detail page's History tab gets its own cache bucket. The query is
 * disabled when either field is empty so the hook can be called eagerly
 * without triggering requests before data is ready.
 */
export function useDocumentHistory(entity: string, entityId: string | undefined | null) {
  return useQuery<ListResponse<AuditLogEntry>>({
    queryKey: ['audit-logs', entity, entityId],
    queryFn: () =>
      api.get<ListResponse<AuditLogEntry>>(
        `/audit-logs?entity=${encodeURIComponent(entity)}&entityId=${encodeURIComponent(entityId!)}`,
      ),
    enabled: !!entityId,
  });
}
