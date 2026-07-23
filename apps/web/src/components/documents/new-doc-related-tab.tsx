'use client';

/**
 * /new «Связанные документы» tab — moysklad OLD-design create form, re-grounded
 * 2026-07-09 on the user's live screenshots (#purchaseorder/edit?new, tab=related):
 *
 *   [Привязать документ]
 *
 *   (no cards until something is linked; after linking: black current card ──●── white cards)
 *
 *   ▼ Задачи   [⊕ Задача]
 *     Нет задач                       ← or the staged task rows
 *   ▼ Файлы    [⊕ Файл]
 *     Наименование | Размер, МБ | Дата добавления | Сотрудник
 *     « ‹  1-1 из 0  › »
 *
 * EVERYTHING works IN PLACE — no save, no navigation (user report 2026-07-09: the
 * earlier save-first hand-off read as a page reload and landed on the 5-tab saved
 * page; unacceptable). «Привязать документ» opens the «Привязка документа» modal
 * immediately; picked docs are STAGED (white cards appear at once, ✕ unstages).
 * «⊕ Задача» opens «Создание задачи» immediately; the composed task is STAGED
 * (row appears at once). «⊕ Файл» stages files. The page persists all of it in
 * `staging.flush(id)` right after the document itself is saved.
 */

import { RelatedDocsTab } from '@/components/customer-orders/related-docs-tab';
import { LinkDocumentModal } from '@/components/documents/link-document-modal';
import type { NewDocStaging } from '@/components/documents/use-new-doc-staging';
import { TaskCreateModal } from '@/components/task-create-modal';
import { useAuth } from '@/lib/auth-store';
import { Icons, formatDate } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { type ReactNode, useRef, useState } from 'react';

type CurrentDoc = Parameters<typeof RelatedDocsTab>[0]['current'];
type Ref = { id: string; name: string } | null;

export interface NewDocRelatedTabProps {
  /** The unsaved document — the black card once something is staged. */
  current: CurrentDoc;
  /** PascalCase entity (DocumentLink source / Task.entity), e.g. 'PurchaseOrder'. */
  entityType: string;
  /** Staging store from `useNewDocStaging` — the page flushes it after save. */
  staging: NewDocStaging;
  /** Pre-fill the link modal's Контрагент / Организация / На склад chips with
   *  the form's current picks (moysklad opens the modal already scoped). */
  linkDefaults?: {
    agent?: Ref;
    organization?: Ref;
    storeTo?: Ref;
  };
}

export function NewDocRelatedTab({
  current,
  entityType,
  staging,
  linkDefaults,
}: NewDocRelatedTabProps) {
  const tDetailTabs = useTranslations('detail_tabs');
  const tForm = useTranslations('form');
  const tAtt = useTranslations('pages.attachments');
  const tc = useTranslations('task_create');
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // moysklad shows both sections EXPANDED by default (▼) — user screenshot.
  const [tasksOpen, setTasksOpen] = useState(true);
  const [filesOpen, setFilesOpen] = useState(true);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);

  const files = staging.files;
  const fileCount = files.length;

  return (
    <div className="bg-[var(--ms-bg-surface)] px-4 py-3" data-test-id="new-doc-related-tab">
      {/* Button + diagram. Staged picks render as white cards immediately (moysklad:
          the modal's «Привязать» adds them to the diagram in place); ✕ unstages. */}
      <RelatedDocsTab
        current={current}
        linked={staging.links.map((d) => ({
          id: d.id,
          name: d.name,
          moment: d.moment,
          state: d.state,
          sumMinor: d.sumMinor,
          statusName: d.statusName,
          statusColor: d.statusColor,
          linkId: `${d.type}:${d.id}`,
          kind: TYPE_TO_KIND[d.type] ?? current.kind,
        }))}
        onLinkDocument={() => setLinkModalOpen(true)}
        onUnlink={(key) => staging.removeLink(key)}
      />

      <div className="mt-8 space-y-6">
        {/* ▼ Задачи  [⊕ Задача] */}
        <DisclosureRow
          label={tDetailTabs('tasks')}
          open={tasksOpen}
          onToggle={() => setTasksOpen((v) => !v)}
          action={
            <AddButton onClick={() => setTaskModalOpen(true)} testId="tasks-section-add">
              {tForm('add_task')}
            </AddButton>
          }
        >
          {staging.tasks.length === 0 ? (
            <p className="text-[var(--ms-text-muted)] text-sm" data-test-id="tasks-section-empty">
              {tDetailTabs('no_tasks')}
            </p>
          ) : (
            <ul className="border-[var(--ms-border-default)] border-t" data-test-id="tasks-staged">
              {staging.tasks.map((t) => (
                <li
                  key={t.key}
                  className="flex items-center gap-3 border-[var(--ms-border-default)] border-b px-1 py-2.5 text-sm"
                >
                  <span
                    aria-hidden
                    className="h-4 w-4 shrink-0 rounded-full border border-[var(--ms-border-strong)]"
                  />
                  <span className="min-w-0 flex-1 truncate text-[var(--ms-text-primary)]">
                    {t.title}
                  </span>
                  {t.stateName && (
                    <span className="flex shrink-0 items-center gap-1.5 text-[var(--ms-text-primary)]">
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: t.stateColor ?? '#9ca3af' }}
                      />
                      {t.stateName}
                    </span>
                  )}
                  {t.assigneeLabel && (
                    <span className="shrink-0 text-[var(--ms-text-muted)]">{t.assigneeLabel}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => staging.removeTask(t.key)}
                    aria-label={tc('cancel')}
                    className="shrink-0 rounded p-0.5 text-[var(--ms-text-muted)] hover:text-[var(--ms-action-destructive)]"
                    data-test-id={`tasks-staged-remove-${t.key}`}
                  >
                    <Icons.close className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DisclosureRow>

        {/* ▼ Файлы  [⊕ Файл] — moysklad file table + «1-1 из 0» pager. */}
        <DisclosureRow
          label={tDetailTabs('files')}
          open={filesOpen}
          onToggle={() => setFilesOpen((v) => !v)}
          action={
            <AddButton onClick={() => fileInputRef.current?.click()} testId="files-section-add">
              {tForm('add_file')}
            </AddButton>
          }
        >
          <table className="w-full max-w-[860px] text-sm" data-test-id="files-section-table">
            <thead>
              <tr className="border-[var(--ms-action-primary)] border-b-2 text-left text-[var(--ms-text-primary)]">
                <th className="py-1.5 pr-2 font-normal">{tAtt('col_name')}</th>
                <th className="w-28 py-1.5 pr-2 font-normal">{tAtt('size_mb')}</th>
                <th className="w-40 py-1.5 pr-2 font-normal">{tAtt('uploaded_at')}</th>
                <th className="w-40 py-1.5 font-normal">{tAtt('uploaded_by')}</th>
              </tr>
            </thead>
            <tbody>
              {files.map((s) => (
                <tr key={s.key} className="border-[var(--ms-border-default)] border-b">
                  <td className="flex items-center gap-2 py-1.5 pr-2">
                    <Icons.paperclip className="h-3.5 w-3.5 shrink-0 text-[var(--ms-text-muted)]" />
                    <span className="min-w-0 flex-1 truncate">{s.file.name}</span>
                    <button
                      type="button"
                      onClick={() => staging.removeFile(s.key)}
                      aria-label={tc('cancel')}
                      className="shrink-0 rounded p-0.5 text-[var(--ms-text-muted)] hover:text-[var(--ms-action-destructive)]"
                      data-test-id={`files-section-remove-${s.key}`}
                    >
                      <Icons.close className="h-3.5 w-3.5" />
                    </button>
                  </td>
                  <td className="py-1.5 pr-2 tabular-nums">
                    {(s.file.size / 1_000_000).toLocaleString('ru-RU', {
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="py-1.5 pr-2 tabular-nums">
                    {s.addedAt ? formatDate(s.addedAt) : ''}
                  </td>
                  <td className="py-1.5">{user?.name ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* moysklad pager — reads «1-1 из 0» on an empty table (exact copy). */}
          <div className="mt-1.5 flex items-center gap-1 text-[var(--ms-text-muted)] text-xs">
            <span aria-hidden className="px-0.5">
              «
            </span>
            <span aria-hidden className="px-0.5">
              ‹
            </span>
            <span className="px-2 tabular-nums" data-test-id="files-section-range">
              {tAtt('range', {
                from: 1,
                to: Math.max(1, fileCount),
                total: fileCount,
              })}
            </span>
            <span aria-hidden className="px-0.5">
              ›
            </span>
            <span aria-hidden className="px-0.5">
              »
            </span>
          </div>
        </DisclosureRow>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              staging.addFiles(Array.from(e.target.files));
              setFilesOpen(true);
            }
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
          data-test-id="files-section-input"
        />
      </div>

      {/* «Привязка документа» — opens IN PLACE; «Привязать» stages the picks. */}
      <LinkDocumentModal
        open={linkModalOpen}
        onOpenChange={setLinkModalOpen}
        current={{
          entityType,
          id: '',
          name: current.name,
          moment: current.moment,
          sumMinor: current.sumMinor,
          state: current.state,
        }}
        onStage={(docs) => staging.addLinks(docs)}
        defaults={linkDefaults}
      />

      {/* «Создание задачи» — opens IN PLACE; submit stages the composed task. */}
      <TaskCreateModal
        open={taskModalOpen}
        onOpenChange={setTaskModalOpen}
        entity={entityType}
        entityId=""
        onStage={(t) => staging.addTask(t)}
      />
    </div>
  );
}

/** DocumentLink PascalCase type → card kind (local copy of the tab's map). */
const TYPE_TO_KIND: Record<string, CurrentDoc['kind']> = {
  PurchaseOrder: 'purchase-order',
  Supply: 'supply',
  PurchaseReturn: 'purchase-return',
  InvoiceIn: 'invoice-in',
  Demand: 'demand',
  CustomerOrder: 'customer-order',
  InvoiceOut: 'invoice-out',
  SalesReturn: 'sales-return',
  Move: 'move',
  PaymentIn: 'payment-in',
  PaymentOut: 'payment-out',
  CashIn: 'cash-in',
  CashOut: 'cash-out',
};

/** «▼ Метка  [кнопка]» — moysklad old-design disclosure header: a red-orange
 *  triangle + brick-red label, the section button right next to it. */
function DisclosureRow({
  label,
  open,
  onToggle,
  action,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 text-[13px] text-[#a1453c] hover:underline"
        >
          <svg
            viewBox="0 0 8 8"
            aria-hidden="true"
            className={`h-2 w-2 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`}
          >
            <path d="M0 1L8 1L4 7Z" fill="#e2574c" />
          </svg>
          {label}
        </button>
        {action}
      </div>
      {open && <div className="mt-2.5">{children}</div>}
    </section>
  );
}

/** «⊕ …» — white bordered button with the blue circle-plus (moysklad). */
function AddButton({
  onClick,
  testId,
  children,
}: {
  onClick: () => void;
  testId: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-3 py-1.5 text-[var(--ms-text-primary)] text-sm hover:bg-[var(--ms-bg-hover)]"
      data-test-id={testId}
    >
      <Icons.createCircle className="h-4 w-4 text-[var(--ms-text-brand)]" />
      {children}
    </button>
  );
}
