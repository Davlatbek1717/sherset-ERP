'use client';

/**
 * moysklad top-right «Изменения: <last modifier> <date>» link. moysklad shows the
 * change-history entry-point top-right on a document detail (NOT as a bottom tab/
 * section); clicking it opens the «История изменений» modal — a flat list of
 * audit events (avatar + name + ", <action> <date>") each with a «Поле / Было /
 * Стало» diff table, paginated 5-per-page exactly like the live audit. The
 * last-modifier name + timestamp on the link come from the most recent audit-log
 * entry — `useDocumentHistory` is already cached by (entity, id) so this shares
 * the same single request (React-Query dedup), no extra fetch.
 */

import { useAuditLabels } from '@/hooks/use-audit-labels';
import { useDocumentHistory } from '@/hooks/use-document-history';
import { Drawer, HistoryTimeline, formatDate } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const PAGE_SIZE = 5; // moysklad shows 5 audit events per page («1 - 5 из N»)

export function DocumentHistoryLink({
  auditEntity,
  entityId,
}: {
  auditEntity: string;
  entityId: string;
}) {
  const tAudit = useTranslations('audit');
  const tDetailHeader = useTranslations('detail_header');
  const tCommon = useTranslations('common');
  const { translateAction, translateField, translateValue } = useAuditLabels(auditEntity);
  const historyQuery = useDocumentHistory(auditEntity, entityId);
  const entries = historyQuery.data?.items ?? [];
  const latest = entries[0];
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);

  const total = entries.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageEntries = entries.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const from = total === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const to = Math.min(total, safePage * PAGE_SIZE + PAGE_SIZE);

  function openModal() {
    setPage(0);
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="flex items-center gap-2 hover:opacity-80"
        data-test-id="doc-history-link"
      >
        {/* moysklad header parity (live-grounded: «Изменения: <modifier>» + the
            timestamp below + the modifier's avatar to the right). */}
        <span className="flex flex-col items-end text-right text-xs leading-tight">
          <span className="text-[var(--ms-text-muted)]">
            {tDetailHeader('changed')}
            {latest?.user?.name ? `: ${latest.user.name}` : ''}
          </span>
          {latest && (
            <span className="text-[var(--ms-text-muted)] tabular-nums">
              {formatDate(latest.at)}
            </span>
          )}
        </span>
        {latest?.user?.name && (
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--ms-text-muted)] font-medium text-[11px] text-white"
            aria-hidden
          >
            {latest.user.name.trim()[0]?.toUpperCase() ?? '?'}
          </span>
        )}
      </button>
      {/* moysklad «История изменений» is a RIGHT-docked full-height slide-over
          (live ref: URL #right?...&audit — NOT a centered modal). */}
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title={tAudit('history_title')}
        widthClass="w-[920px]"
        // Faqat o'qiladigan audit tarixi — yo'qoladigan kiritma yo'q.
        dismissible
        testId="history-drawer"
      >
        <div className="px-4 py-4">
          {historyQuery.isLoading ? (
            <div className="py-4 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>
          ) : (
            <>
              <HistoryTimeline
                entries={pageEntries}
                emptyLabel={tAudit('history_empty')}
                translateAction={translateAction}
                translateField={translateField}
                translateValue={translateValue}
                fieldHeader={tAudit('field_col')}
                beforeHeader={tAudit('before_col')}
                afterHeader={tAudit('after_col')}
              />
              {total > 0 && (
                <div
                  className="mt-5 flex items-center gap-1 text-[var(--ms-text-muted)] text-sm"
                  data-test-id="history-pager"
                >
                  <PagerBtn
                    label="«"
                    disabled={safePage === 0}
                    onClick={() => setPage(0)}
                    testId="history-pager-first"
                  />
                  <PagerBtn
                    label="‹"
                    disabled={safePage === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    testId="history-pager-prev"
                  />
                  <span className="px-2 tabular-nums" data-test-id="history-pager-range">
                    {tAudit('pager_range', { from, to, total })}
                  </span>
                  <PagerBtn
                    label="›"
                    disabled={safePage >= pageCount - 1}
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    testId="history-pager-next"
                  />
                  <PagerBtn
                    label="»"
                    disabled={safePage >= pageCount - 1}
                    onClick={() => setPage(pageCount - 1)}
                    testId="history-pager-last"
                  />
                </div>
              )}
            </>
          )}
        </div>
      </Drawer>
    </>
  );
}

function PagerBtn({
  label,
  disabled,
  onClick,
  testId,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-test-id={testId}
      className="flex h-6 w-6 items-center justify-center rounded text-base hover:bg-[var(--ms-bg-hover)] disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {label}
    </button>
  );
}
