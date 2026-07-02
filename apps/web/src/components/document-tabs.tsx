'use client';

import { useAuditLabels } from '@/hooks/use-audit-labels';
import { useDocumentHistory } from '@/hooks/use-document-history';
import {
  HistoryTimeline,
  type RelatedDocsGroup,
  RelatedDocsPanel,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@moysklad/ui';
import { useTranslations } from 'next-intl';

export interface DocumentTabsProps {
  /** Entity slug stored in AuditLog.entity column (e.g. "sales_return"). */
  auditEntity: string;
  entityId: string;
  /**
   * Related docs are caller-computed from the entity's findById response
   * (the service already includes the linked rows — no extra fetch needed).
   */
  relatedGroups: RelatedDocsGroup[];
}

/**
 * Moysklad-parity right-column tab group for detail pages. Two tabs:
 *   - Связанные: links to cascaded sibling docs (invoice, payment, return, ...)
 *   - История:   AuditLog entries with field-level diffs
 *
 * The History tab fetches lazily via TanStack Query keyed by (entity, entityId).
 */
export function DocumentTabs({ auditEntity, entityId, relatedGroups }: DocumentTabsProps) {
  const tCommon = useTranslations('common');
  const tAudit = useTranslations('audit');
  const { translateAction, translateField, translateValue } = useAuditLabels(auditEntity);

  const historyQuery = useDocumentHistory(auditEntity, entityId);
  const entries = historyQuery.data?.items ?? [];

  return (
    <Tabs defaultValue="related" className="w-full" data-test-id="document-tabs">
      <TabsList>
        <TabsTrigger value="related" data-test-id="tab-related">
          {tAudit('tab_related')}
        </TabsTrigger>
        <TabsTrigger value="history" data-test-id="tab-history">
          {tAudit('tab_history')}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="related">
        <RelatedDocsPanel groups={relatedGroups} emptyLabel={tAudit('related_empty')} />
      </TabsContent>

      <TabsContent value="history">
        {historyQuery.isLoading ? (
          <div className="py-4 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>
        ) : (
          <HistoryTimeline
            entries={entries}
            emptyLabel={tAudit('history_empty')}
            translateAction={translateAction}
            translateField={translateField}
            translateValue={translateValue}
          />
        )}
      </TabsContent>
    </Tabs>
  );
}
