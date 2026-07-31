'use client';

/**
 * Moysklad-parity document-detail body. The NEW moysklad register design (the
 * one the account runs — «Настройки пользователя → новый дизайн реестров»,
 * grounded 2026-07-07 on the live #purchaseorder editor) shows FIVE tabs in the
 * position area: «Позиции» · «Связанные документы» · «Файлы» · «Задачи» ·
 * «События». This component owns that 5-tab layout so every detail page inherits
 * it from one place.
 *
 * The host page wraps its position-editor + totals grid in `children` (the
 * «Позиции» tab) and passes its files / tasks slots (rendered in their tabs).
 * «События» shows the document event timeline (the audit history — created /
 * posted / edited events), fetched eagerly by entity+id. There is no separate
 * comment feed yet, so «События» surfaces the real lifecycle events only.
 *
 * ⚠️ moysklad runs TWO editor designs, per document type. The 5-tab layout above
 * is the NEW design (grounded 2026-07-07 on #purchaseorder). The CLASSIC design —
 * still live on #customerorder as of 2026-07-31 (the account is offered
 * «Попробуйте новый дизайн» there, i.e. it has NOT switched) — shows only
 * «Главная | Связанные документы» and renders Задачи / Файлы as collapsible
 * sections BELOW the tab body. Pages on a classic-design doc type opt in with
 * `bottomSections`; every other caller keeps the 5-tab layout unchanged.
 */

import { type AttachmentEntity, AttachmentsSection } from '@/components/attachments-section';
import { DocumentTasksSection } from '@/components/document-tasks-section';
import { useAuditLabels } from '@/hooks/use-audit-labels';
import { useDocumentHistory } from '@/hooks/use-document-history';
import {
  HistoryTimeline,
  Icons,
  type RelatedDocsGroup,
  RelatedDocsPanel,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
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
  /** Classic-design layout (moysklad #customerorder, grounded 2026-07-31): drop the
   *  «Файлы» + «Задачи» TABS and render those slots as collapsible sections below
   *  the tab body instead — «Задачи» first, then «Файлы», the order the live editor
   *  uses. The remaining tabs are «Главная» · «Связанные документы» · «События».
   *  Defaults to false = the 5-tab new-design layout every other page relies on. */
  bottomSections?: boolean;
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
  bottomSections = false,
  // `historyInline` is accepted for caller compat but no longer used — history now
  // lives in the «События» tab, not an inline collapsible.
}: DetailContentTabsProps) {
  const tCommon = useTranslations('common');
  const tAudit = useTranslations('audit');
  const tDetailTabs = useTranslations('detail_tabs');
  const { translateAction, translateField, translateValue } = useAuditLabels(auditEntity);

  const historyQuery = useDocumentHistory(auditEntity, entityId);
  const entries = historyQuery.data?.items ?? [];

  // Arriving from a /new form's «⊕ Задача» (silent-save → «?task=new») opens on the
  // «Задачи» tab so the create modal (mounted inside it) can auto-open. moysklad lands
  // you on the saved doc with «Создание задачи» already showing. «?link=new» is the
  // same hand-off for «Привязать документ» → the «Связанные документы» tab (the
  // RelatedDocsTab inside it auto-opens the «Привязка документа» modal).
  // useSearchParams() may be null outside a Next router context (jsdom tests,
  // static prerender) — optional-chain so the tabs still render.
  // In `bottomSections` layout there is no «Задачи» TAB to land on — the tasks
  // section sits below the tab body and is always visible, so «?task=new» stays
  // on «Главная» and the create modal opens inside that section.
  const searchParams = useSearchParams();
  const initialTab =
    searchParams?.get('task') === 'new' && !bottomSections
      ? 'tasks'
      : searchParams?.get('link') === 'new'
        ? 'related'
        : 'positions';

  return (
    <div data-test-id="detail-content-tabs">
      {/* moysklad new-design position-area tabs (5): Позиции · Связанные документы ·
          Файлы · Задачи · События. */}
      <Tabs defaultValue={initialTab} className="w-full">
        <TabsList>
          {/* moysklad new-design tab icons (closest design-system glyphs). */}
          <TabsTrigger value="positions" data-test-id="tab-positions">
            <Icons.grid className="mr-1.5 inline h-4 w-4 text-[var(--ms-text-muted)]" aria-hidden />
            {positionsLabel ?? tDetailTabs('positions')}
          </TabsTrigger>
          <TabsTrigger value="related" data-test-id="tab-related">
            <Icons.document
              className="mr-1.5 inline h-4 w-4 text-[var(--ms-text-muted)]"
              aria-hidden
            />
            {tDetailTabs('related')}
          </TabsTrigger>
          {!bottomSections && (
            <TabsTrigger value="files" data-test-id="tab-files">
              <Icons.file
                className="mr-1.5 inline h-4 w-4 text-[var(--ms-text-muted)]"
                aria-hidden
              />
              {tDetailTabs('files')}
            </TabsTrigger>
          )}
          {!bottomSections && (
            <TabsTrigger value="tasks" data-test-id="tab-tasks">
              <Icons.tasks
                className="mr-1.5 inline h-4 w-4 text-[var(--ms-text-muted)]"
                aria-hidden
              />
              {tDetailTabs('tasks')}
            </TabsTrigger>
          )}
          <TabsTrigger value="events" data-test-id="tab-events">
            <Icons.chat className="mr-1.5 inline h-4 w-4 text-[var(--ms-text-muted)]" aria-hidden />
            {tDetailTabs('events')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="positions">{children}</TabsContent>

        <TabsContent value="related">
          {relatedSlot ?? (
            <RelatedDocsPanel groups={relatedGroups} emptyLabel={tAudit('related_empty')} />
          )}
        </TabsContent>

        {/* «Файлы» — attach/list/delete via the generic /attachments API. Pages may
            override with an explicit filesSlot; otherwise the shared section is used
            (auditEntity is the PascalCase model name, which is also the attachments
            entity key). */}
        {!bottomSections && (
          <TabsContent value="files">
            <div data-test-id="detail-files-section">
              {filesSlot ?? (
                <AttachmentsSection entity={auditEntity as AttachmentEntity} entityId={entityId} />
              )}
            </div>
          </TabsContent>
        )}

        {/* «Задачи» — «+ Задача» opens the create-task modal (POST /tasks, linked by
            entity+entityId). Same override/default pattern as Файлы. */}
        {!bottomSections && (
          <TabsContent value="tasks">
            <div data-test-id="detail-tasks-section">
              {tasksSlot ?? <DocumentTasksSection entity={auditEntity} entityId={entityId} />}
            </div>
          </TabsContent>
        )}

        {/* «События» — the document event timeline (audit history: created /
            posted / edited). No separate comment feed yet. */}
        <TabsContent value="events">
          <div data-test-id="detail-events-section">
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
          </div>
        </TabsContent>
      </Tabs>

      {/* Classic-design bottom collapsibles — «Задачи» then «Файлы», the order the
          live #customerorder editor renders them in (grounded 2026-07-31). Both
          sections are self-titled, so no extra heading is added here. */}
      {bottomSections && (
        <div className="mt-8 space-y-6" data-test-id="detail-bottom-sections">
          <div data-test-id="detail-tasks-section">
            {tasksSlot ?? <DocumentTasksSection entity={auditEntity} entityId={entityId} />}
          </div>
          <div data-test-id="detail-files-section">
            {filesSlot ?? (
              <AttachmentsSection entity={auditEntity as AttachmentEntity} entityId={entityId} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
