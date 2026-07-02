'use client';

/**
 * Moysklad-parity document-detail body. Live-grounded against the real
 * moysklad PO detail (2026-06-24): a saved document shows only TWO tabs in the
 * position area — «Главная» (the position editor + totals) and «Связанные
 * документы» (the related-docs diagram). «Задачи», «Файлы» and «Изменения» are
 * NOT tabs — they render as inline collapsible sections BELOW the tabs
 * («▼ Задачи», «▼ Файлы», «▼ Изменения»). This component owns that layout so
 * every detail page inherits it from one place.
 *
 * The host page wraps its position-editor + totals grid in `children` (the
 * «Главная» tab) and passes its task / files / history slots; the change
 * history is fetched eagerly (keyed by entity+id) and shown in the collapsed
 * «Изменения» section.
 */

import { useAuditLabels } from '@/hooks/use-audit-labels';
import { useDocumentHistory } from '@/hooks/use-document-history';
import {
  DocumentDisclosurePanel,
  HistoryTimeline,
  type RelatedDocsGroup,
  RelatedDocsPanel,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

export interface DetailContentTabsProps {
  /** AuditLog entity slug, e.g. "customer_order", "demand". */
  auditEntity: string;
  /** Document UUID for fetching audit history + scoping attachments. */
  entityId: string;
  /** Related-docs groups computed by the parent (no extra fetch). */
  relatedGroups: RelatedDocsGroup[];
  /** Position-editor + totals-sidebar block — rendered in the «Главная» tab. */
  children: ReactNode;
  /** «Задачи» inline section (moysklad shows it as the FIRST bottom collapsible).
   *  Pages pass <DocumentTasksSection /> here so it renders ABOVE «Файлы» in the
   *  grounded order. When omitted, the page renders its own tasks block below. */
  tasksSlot?: ReactNode;
  /** «Файлы» inline section. Most pages pass <AttachmentsSection /> (self-titled). */
  filesSlot?: ReactNode;
  /** Override the default «Главная» tab label. Money documents (payment-in/out,
   *  cash-in/out) pass «Распределение» since the body is an allocations table. */
  positionsLabel?: string;
  /** Override the «Связанные документы» tab body. customer-order / purchase-order
   *  pass their RelatedDocsTab (with the visual diagram) here. When provided, the
   *  default RelatedDocsPanel + relatedGroups are ignored. */
  relatedSlot?: ReactNode;
  /** When false, the inline «Изменения» (history) section is NOT rendered — the
   *  page surfaces history elsewhere (moysklad shows it as a top-right link via
   *  <DocumentHistoryLink> in the header). Defaults to true so non-converged pages
   *  keep the bottom history section. */
  historyInline?: boolean;
}

export function DetailContentTabs({
  auditEntity,
  entityId,
  relatedGroups,
  children,
  tasksSlot,
  filesSlot,
  positionsLabel,
  relatedSlot,
  historyInline = true,
}: DetailContentTabsProps) {
  const tCommon = useTranslations('common');
  const tAudit = useTranslations('audit');
  const tDetailTabs = useTranslations('detail_tabs');
  const { translateAction, translateField, translateValue } = useAuditLabels(auditEntity);

  const historyQuery = useDocumentHistory(auditEntity, entityId);
  const entries = historyQuery.data?.items ?? [];

  return (
    <div data-test-id="detail-content-tabs">
      {/* moysklad position-area tabs — «Главная» + «Связанные документы» only. */}
      <Tabs defaultValue="positions" className="w-full">
        <TabsList>
          <TabsTrigger value="positions" data-test-id="tab-positions">
            {positionsLabel ?? tDetailTabs('positions')}
          </TabsTrigger>
          <TabsTrigger value="related" data-test-id="tab-related">
            {tDetailTabs('related')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="positions">{children}</TabsContent>

        <TabsContent value="related">
          {relatedSlot ?? (
            <RelatedDocsPanel groups={relatedGroups} emptyLabel={tAudit('related_empty')} />
          )}
        </TabsContent>
      </Tabs>

      {/* moysklad inline bottom sections (in grounded order): Задачи · Файлы ·
          Изменения. Each is a «▼»-collapsible, NOT a tab. */}
      {tasksSlot && (
        <div className="mt-6" data-test-id="detail-tasks-section">
          {tasksSlot}
        </div>
      )}

      {filesSlot && (
        <div className="mt-4" data-test-id="detail-files-section">
          {filesSlot}
        </div>
      )}

      {/* «Изменения» — inline collapsible by default; converged pages (PO/CO) pass
          historyInline={false} and instead show it as a top-right header link
          (moysklad parity) via <DocumentHistoryLink>. */}
      {historyInline && (
        <div className="mt-4">
          <DocumentDisclosurePanel
            title={tDetailTabs('history')}
            defaultOpen={false}
            testId="detail-history-section"
          >
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
          </DocumentDisclosurePanel>
        </div>
      )}
    </div>
  );
}
