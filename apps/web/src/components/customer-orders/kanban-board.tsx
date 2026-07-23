'use client';

/**
 * moysklad «Столбцы» kanban board for /customer-orders — the new-design
 * status-grouped view («новый дизайн реестров документов»). One column per
 * account custom «Статус» (colour dot + name + count badge), each holding the
 * newest orders as cards. Grounded live 2026-07-06 (#customerorder): columns
 * «Текширилмаган» / «Карз колди» / «Туланди Накт» / «Туланди Клик»; each card
 * shows №, date, Контрагент, Сумма, Валюта, the owner avatar and a positions
 * badge.
 *
 * Data: GET /customer-orders/kanban?<same filter query as the flat list>. The
 * board respects the active filter/search identically to «Список» — the
 * endpoint composes the same WHERE, just grouped by statusId — so switching
 * «Список ↔ Столбцы» never changes which orders are in scope. Cards link to the
 * order detail, matching moysklad.
 */

import { api } from '@/lib/api-client';
import { Icons, formatDate, formatMoney } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

interface KanbanCard {
  id: string;
  name: string;
  moment: string;
  sumMinor: string;
  currency: string;
  agent: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
  positionsCount: number;
}
interface KanbanColumn {
  status: { id: string; name: string; color: string | null };
  total: number;
  items: KanbanCard[];
}
interface KanbanResponse {
  columns: KanbanColumn[];
}

export function CustomerOrderKanban({ filterQuery }: { filterQuery: string }) {
  const t = useTranslations('pages.customer_orders');
  const tFields = useTranslations('fields');
  const { data, isLoading, error } = useQuery<KanbanResponse>({
    queryKey: ['customer-orders-kanban', filterQuery],
    queryFn: () => api.get<KanbanResponse>(`/customer-orders/kanban?${filterQuery}`),
  });

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-[var(--ms-text-muted)] text-sm">
        {error.message}
      </div>
    );
  }

  const columns = data?.columns ?? [];

  // Empty = the account has no custom order statuses (nothing to group by).
  if (!isLoading && columns.length === 0) {
    return (
      <div
        className="flex flex-1 items-center justify-center p-8 text-[var(--ms-text-muted)] text-sm"
        data-test-id="co-kanban-empty"
      >
        {t('kanban_no_statuses')}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2" data-test-id="co-kanban-board">
      {columns.map((col) => (
        <section
          key={col.status.id}
          className="flex w-[272px] min-w-[272px] flex-col rounded-[var(--ms-radius-default)] bg-[var(--ms-bg-muted)]"
          data-test-id={`co-kanban-column-${col.status.id}`}
        >
          {/* Column header — colour dot + status name + total-count badge
              (moysklad caps the display at «999+»). */}
          <header className="flex items-center gap-2 px-3 py-2">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: col.status.color ?? 'var(--ms-text-muted)' }}
            />
            <span
              className="truncate font-medium text-[13px] text-[var(--ms-text-primary)]"
              title={col.status.name}
            >
              {col.status.name}
            </span>
            <span
              className="ml-auto shrink-0 rounded-full bg-[var(--ms-bg-surface)] px-2 py-0.5 text-[11px] text-[var(--ms-text-muted)] tabular-nums"
              data-test-id={`co-kanban-count-${col.status.id}`}
            >
              {col.total > 999 ? '999+' : col.total}
            </span>
          </header>

          {/* Scrollable card list — one order per card. */}
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
            {col.items.map((card) => (
              <a
                key={card.id}
                href={`/customer-orders/${card.id}`}
                className="block rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-3 transition-colors hover:border-[var(--ms-border-strong)]"
                data-test-id={`co-kanban-card-${card.id}`}
              >
                <div className="font-semibold text-[var(--ms-text-brand)] text-sm">
                  №{card.name}
                </div>
                <div className="mt-0.5 text-[11px] text-[var(--ms-text-muted)]">
                  {`от ${formatDate(card.moment)}`}
                </div>
                <CardField label={tFields('agent')} value={card.agent?.name} />
                <CardField
                  label={tFields('sum')}
                  value={formatMoney(card.sumMinor, card.currency, { displayAs: 'none' })}
                />
                <CardField
                  label={tFields('currency')}
                  value={card.currency === 'UZS' ? 'сум' : card.currency}
                />
                <div className="mt-2 flex items-center justify-between">
                  {card.positionsCount > 0 ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-[var(--ms-text-muted)]">
                      <Icons.cart className="h-3.5 w-3.5" aria-hidden />
                      {card.positionsCount}
                    </span>
                  ) : (
                    <span />
                  )}
                  {/* Owner avatar — moysklad shows a small round avatar bottom-right. */}
                  <span
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ms-bg-muted)] text-[var(--ms-text-muted)]"
                    title={card.owner?.name ?? ''}
                    aria-label={card.owner?.name ?? 'owner'}
                  >
                    <Icons.user className="h-3.5 w-3.5" aria-hidden />
                  </span>
                </div>
              </a>
            ))}
            {!isLoading && col.items.length === 0 && (
              <div className="px-1 py-4 text-center text-[11px] text-[var(--ms-text-muted)]">—</div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

/** One labelled field inside a kanban card («Контрагент» / «Сумма» / «Валюта»). */
function CardField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="mt-2">
      <div className="text-[11px] text-[var(--ms-text-muted)]">{label}</div>
      <div className="truncate text-[13px] text-[var(--ms-text-primary)]" title={value ?? ''}>
        {value || '—'}
      </div>
    </div>
  );
}
