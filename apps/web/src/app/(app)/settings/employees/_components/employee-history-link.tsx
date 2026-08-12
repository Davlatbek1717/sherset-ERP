'use client';

/**
 * moysklad employee «Изменения: <who> <when>» → «История изменений» panel.
 *
 * Unlike a document's history (one entity), the employee feed is the union of
 * (a) everything the employee DID — they are the audit row's acting user
 *     (sales, returns, edits on any entity), and
 * (b) everything done TO their employee record (card edits, role changes,
 *     archive, password reset).
 * Served by GET /admin/audit-logs?aboutEmployee=<id> (OR-combined server-side).
 *
 * Mirrors components/document-detail/document-history-link.tsx: right-docked
 * Drawer + HistoryTimeline, 5 entries per page. Because entries span MANY
 * entity types, each action headline is prefixed with the entity label
 * («Заказ покупателя — создан»).
 */

import { useAuditLabels } from '@/hooks/use-audit-labels';
import { api } from '@/lib/api-client';
import { type AuditEntry, Drawer, HistoryTimeline, formatDate } from '@moysklad/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';

// Owner 2026-07-17: the employee ACTIVITY feed must be an infinite scroll —
// no pager buttons; the next chunk loads as the user reaches the bottom.
// (The per-document «История изменений» keeps moysklad's 5-per-page pager.)
const PAGE_SIZE = 30;

interface FeedEntry extends AuditEntry {
  entity: string;
  entityId: string;
}

/** Entity slugs the audit writers use — translated via pages.employee_card.entity_*. */
const KNOWN_FEED_ENTITIES = new Set([
  'employee',
  'CustomerOrder',
  'Demand',
  'InvoiceOut',
  'Supply',
  'PurchaseOrder',
  'InvoiceIn',
  'PaymentIn',
  'PaymentOut',
  'CashIn',
  'CashOut',
  'SalesReturn',
  'PurchaseReturn',
  'Move',
  'Loss',
  'Enter',
  'Inventory',
  'Counterparty',
  'ContactPerson',
  'Call',
  'Opportunity',
  'Product',
  'Organization',
  'Store',
  'CashDesk',
  'OrganizationAccount',
]);

export function EmployeeHistoryLink({ employeeId }: { employeeId: string }) {
  const t = useTranslations('pages.employee_card');
  const tAudit = useTranslations('audit');
  const tDetailHeader = useTranslations('detail_header');
  const tCommon = useTranslations('common');
  const { translateAction, translateField, translateValue } = useAuditLabels();

  const feedQuery = useInfiniteQuery<{ items: FeedEntry[]; nextCursor?: string }>({
    queryKey: ['audit-logs', 'employee-feed', employeeId],
    queryFn: ({ pageParam }) =>
      api.get<{ items: FeedEntry[]; nextCursor?: string }>(
        `/admin/audit-logs?aboutEmployee=${employeeId}&limit=${PAGE_SIZE}${
          pageParam ? `&cursor=${pageParam}` : ''
        }`,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
  });
  const entries = feedQuery.data?.pages.flatMap((pg) => pg.items) ?? [];
  const latest = entries[0];
  const [open, setOpen] = useState(false);

  // Sentinel at the list bottom → load the next chunk when it scrolls into
  // view. Ref-CALLBACK (not useEffect): the drawer content mounts in a portal
  // after the open flip, so an effect keyed on `open` observed a node that
  // wasn't the committed one — the observer never fired (live-debugged
  // 2026-07-17). The callback attaches to the exact mounted node; the loader
  // closure reads fresh query state via a ref.
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = feedQuery;
  const loadMoreRef = useRef<() => void>(() => {});
  loadMoreRef.current = () => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  };
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;
    observerRef.current = new IntersectionObserver((ioEntries) => {
      if (ioEntries.some((e) => e.isIntersecting)) loadMoreRef.current();
    });
    observerRef.current.observe(node);
  }, []);

  // Compose «<entity label> — <action label>» headlines. HistoryTimeline's
  // translateAction only receives the action string, so the entity slug is
  // smuggled in with a `|` separator (never used inside real action slugs).
  const entityLabel = (entity: string) =>
    KNOWN_FEED_ENTITIES.has(entity)
      ? t(
          `entity_${entity.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()}` as 'entity_employee',
        )
      : entity;
  const compositeEntries: AuditEntry[] = entries.map((e) => ({
    ...e,
    action: `${e.entity}|${e.action}`,
  }));
  const translateComposite = (composite: string) => {
    const sep = composite.indexOf('|');
    const entity = composite.slice(0, sep);
    const action = composite.slice(sep + 1);
    const actionLabel =
      action === 'roles-change'
        ? tAudit.has('action_roles_change' as 'action_create')
          ? tAudit('action_roles_change' as 'action_create')
          : action
        : action === 'owner-transfer'
          ? tAudit.has('action_owner_transfer' as 'action_create')
            ? tAudit('action_owner_transfer' as 'action_create')
            : action
          : action === 'password-reset'
            ? tAudit.has('action_password_reset' as 'action_create')
              ? tAudit('action_password_reset' as 'action_create')
              : action
            : translateAction(action);
    return `${entityLabel(entity)} — ${String(actionLabel).toLowerCase()}`;
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 hover:opacity-80"
        data-testid="employee-history-link"
      >
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
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--ms-text-muted)] font-medium text-[11px] text-white"
          aria-hidden
        >
          {latest?.user?.name?.trim()[0]?.toUpperCase() ?? '?'}
        </span>
      </button>

      <Drawer
        open={open}
        onOpenChange={setOpen}
        title={tAudit('history_title')}
        widthClass="w-[920px]"
        // Faqat o'qiladigan audit tarixi — yo'qoladigan kiritma yo'q.
        dismissible
        testId="employee-history-drawer"
      >
        <div className="px-4 py-4">
          {feedQuery.isLoading ? (
            <div className="py-4 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>
          ) : (
            <>
              <HistoryTimeline
                entries={compositeEntries}
                emptyLabel={tAudit('history_empty')}
                translateAction={translateComposite}
                translateField={translateField}
                translateValue={(field, value, action) =>
                  translateValue(field, value, action.slice(action.indexOf('|') + 1))
                }
                fieldHeader={tAudit('field_col')}
                beforeHeader={tAudit('before_col')}
                afterHeader={tAudit('after_col')}
              />
              {/* infinite-scroll sentinel + tail state (NO pager buttons) */}
              <div ref={sentinelRef} data-testid="employee-history-sentinel" className="h-2" />
              {isFetchingNextPage && (
                <div className="py-3 text-center text-[var(--ms-text-muted)] text-sm">
                  {tCommon('loading')}
                </div>
              )}
            </>
          )}
        </div>
      </Drawer>
    </>
  );
}
