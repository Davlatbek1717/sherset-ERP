'use client';

import { useAuditLabels } from '@/hooks/use-audit-labels';
import { api } from '@/lib/api-client';
import { auditActionTone } from '@/lib/domain-status-tone';
import {
  Badge,
  Breadcrumb,
  Button,
  Container,
  Icons,
  Input,
  NativeSelect,
  PageHeader,
  StickyHScroll,
  buildCsv,
  csvTimestamp,
  downloadCsv,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Fragment, useState } from 'react';

interface AuditEntry {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  fieldChanges: Record<string, { before?: unknown; after?: unknown }> | null;
  context: Record<string, unknown> | null;
  at: string;
  user: { id: string; name: string; email: string } | null;
}

interface AuditListResponse {
  items: AuditEntry[];
  nextCursor?: string;
  total: number;
}

// Whitelisted entity values shown in the filter dropdown — same set the API
// records on writes. New entities just need a label here when added.
const ENTITIES = [
  '', // empty = all
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
];

// Action values written by every domain service (see grep across
// apps/api/src/modules — these are the entire enumerated set).
// Free-text on the server (AdminAuditLogFilterSchema.action.max(100)) but a
// dropdown is enough for the common 99% in admin UI.
const ACTIONS = [
  '', // empty = all
  'create',
  'update',
  'delete',
  'archive',
  'restore',
  'post',
  'transition',
  'cancel',
] as const;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function AuditLogPage() {
  const t = useTranslations('pages.audit_log_admin');
  const tCommon = useTranslations('common');
  const tFilters = useTranslations('filters');
  const { translateAction } = useAuditLabels();

  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [appliedFilter, setAppliedFilter] = useState({
    entity,
    action,
    search,
    dateFrom,
    dateTo,
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery<AuditListResponse>({
    queryKey: ['audit-log-admin', appliedFilter],
    queryFn: () => {
      const qs = new URLSearchParams({
        ...(appliedFilter.entity ? { entity: appliedFilter.entity } : {}),
        ...(appliedFilter.action ? { action: appliedFilter.action } : {}),
        ...(appliedFilter.search ? { search: appliedFilter.search } : {}),
        ...(appliedFilter.dateFrom ? { dateFrom: appliedFilter.dateFrom } : {}),
        ...(appliedFilter.dateTo ? { dateTo: appliedFilter.dateTo } : {}),
        limit: '100',
      });
      return api.get<AuditListResponse>(`/admin/audit-logs?${qs.toString()}`);
    },
  });

  const apply = () => setAppliedFilter({ entity, action, search, dateFrom, dateTo });
  const clear = () => {
    setEntity('');
    setAction('');
    setSearch('');
    setDateFrom('');
    setDateTo('');
    setAppliedFilter({ entity: '', action: '', search: '', dateFrom: '', dateTo: '' });
  };

  const exportCsv = () => {
    if (!data) return;
    const csv = buildCsv<AuditEntry>(
      [
        { header: t('at'), cellText: (r) => formatDateTime(r.at) },
        { header: t('entity'), cellText: (r) => r.entity },
        { header: t('action'), cellText: (r) => r.action },
        { header: t('user'), cellText: (r) => r.user?.name ?? '—' },
        { header: t('entity_id'), cellText: (r) => r.entityId },
      ],
      data.items,
    );
    downloadCsv(csv, `audit-log-${csvTimestamp()}.csv`);
  };

  return (
    <Container size="md" className="py-4">
      <PageHeader
        title={t('title')}
        subtitle={t('description')}
        breadcrumbs={
          <Breadcrumb items={[{ label: 'Sozlamalar', href: '/settings' }, { label: t('title') }]} />
        }
        actions={
          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!data}>
            <Icons.download className="h-4 w-4" />
            CSV
          </Button>
        }
      />

      <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-6" data-test-id="filter-bar">
          <div className="md:col-span-2">
            <label
              htmlFor="audit-filter-search"
              className="mb-1 block font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
            >
              {t('search_placeholder')}
            </label>
            <Input
              id="audit-filter-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('search_placeholder')}
              data-test-id="filter-search"
            />
          </div>
          <div>
            <label
              htmlFor="audit-filter-entity"
              className="mb-1 block font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
            >
              {t('entity')}
            </label>
            <NativeSelect
              id="audit-filter-entity"
              value={entity}
              onChange={(e) => setEntity(e.target.value)}
              data-test-id="filter-entity"
            >
              <option value="">{t('all_entities')}</option>
              {ENTITIES.filter((e) => e !== '').map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <label
              htmlFor="audit-filter-action"
              className="mb-1 block font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
            >
              {t('action')}
            </label>
            <NativeSelect
              id="audit-filter-action"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              data-test-id="filter-action"
            >
              <option value="">{t('all_actions')}</option>
              {ACTIONS.filter((a) => a !== '').map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <label
              htmlFor="audit-filter-date-from"
              className="mb-1 block font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
            >
              {t('date_from')}
            </label>
            <Input
              id="audit-filter-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="tabular-nums"
              data-test-id="filter-date-from"
            />
          </div>
          <div>
            <label
              htmlFor="audit-filter-date-to"
              className="mb-1 block font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
            >
              {t('date_to')}
            </label>
            <Input
              id="audit-filter-date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="tabular-nums"
              data-test-id="filter-date-to"
            />
          </div>
          <div className="flex gap-2 md:col-span-6">
            <Button onClick={apply} loading={isLoading} data-test-id="apply-button">
              {t('apply')}
            </Button>
            <Button variant="secondary" onClick={clear} data-test-id="clear-button">
              {tFilters('clear')}
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div
          className="mt-4 rounded border border-[var(--ms-border-destructive,#fecaca)] bg-[var(--ms-bg-destructive-soft,#fef2f2)] px-3 py-2 text-[var(--ms-text-destructive)] text-sm"
          role="alert"
        >
          {(error as Error).message}
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="ml-2">
            ↻
          </Button>
        </div>
      )}

      {data && (
        <StickyHScroll className="mt-4 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--ms-bg-muted)]">
              <tr>
                <th className="h-9 w-44 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('at')}
                </th>
                <th className="h-9 w-40 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('entity')}
                </th>
                <th className="h-9 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('action')}
                </th>
                <th className="h-9 w-44 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('user')}
                </th>
                <th className="h-9 w-28 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('view_details')}
                </th>
              </tr>
            </thead>
            <tbody data-test-id="audit-rows">
              {data.items.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-12 text-center text-[var(--ms-text-muted)] text-sm"
                    data-test-id="audit-empty"
                  >
                    {t('empty_state')}
                  </td>
                </tr>
              ) : (
                data.items.map((row) => {
                  const expanded = expandedId === row.id;
                  const hasChanges = row.fieldChanges && Object.keys(row.fieldChanges).length > 0;
                  return (
                    <Fragment key={row.id}>
                      <tr
                        className="border-[var(--ms-border-default)] border-t hover:bg-[var(--ms-bg-muted)]"
                        data-test-id={`audit-row-${row.id}`}
                      >
                        <td className="px-3 py-2 text-[var(--ms-text-muted)] text-[12px] tabular-nums">
                          {formatDateTime(row.at)}
                        </td>
                        <td className="px-3 py-2 font-medium">{row.entity}</td>
                        <td className="px-3 py-2">
                          <Badge tone={auditActionTone(row.action)}>
                            {translateAction(row.action)}
                          </Badge>
                          {row.entityId && (
                            <span className="ml-2 text-[var(--ms-text-muted)] text-[12px] tabular-nums">
                              {row.entityId.slice(0, 8)}…
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {row.user ? (
                            <>
                              <span className="font-medium">{row.user.name}</span>
                              <div className="text-[var(--ms-text-muted)]">{row.user.email}</div>
                            </>
                          ) : (
                            <span className="text-[var(--ms-text-muted)]">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {hasChanges || row.context ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setExpandedId(expanded ? null : row.id)}
                              data-test-id={`audit-toggle-${row.id}`}
                            >
                              {expanded ? '▴' : '▾'}
                            </Button>
                          ) : (
                            <span className="text-[var(--ms-text-muted)] text-xs">
                              {t('no_changes')}
                            </span>
                          )}
                        </td>
                      </tr>
                      {expanded && (
                        <tr
                          className="border-[var(--ms-border-default)] border-t bg-[var(--ms-bg-muted)]"
                          data-test-id={`audit-details-${row.id}`}
                        >
                          <td colSpan={5} className="px-3 py-3">
                            {hasChanges && (
                              <div className="mb-3">
                                <h3 className="mb-2 font-semibold text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                                  {t('field_changes')}
                                </h3>
                                <div className="overflow-hidden rounded border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]">
                                  <table className="w-full text-xs">
                                    <thead className="bg-[var(--ms-bg-muted)]">
                                      <tr>
                                        <th className="h-7 px-2 text-left font-medium">Field</th>
                                        <th className="h-7 px-2 text-left font-medium">
                                          {t('before')}
                                        </th>
                                        <th className="h-7 px-2 text-left font-medium">
                                          {t('after')}
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {Object.entries(row.fieldChanges ?? {}).map(
                                        ([field, change]) => (
                                          <tr
                                            key={field}
                                            className="border-[var(--ms-border-default)] border-t"
                                          >
                                            <td className="px-2 py-1.5 font-medium tabular-nums">
                                              {field}
                                            </td>
                                            <td className="px-2 py-1.5 text-[var(--ms-text-destructive)] tabular-nums">
                                              {JSON.stringify(change.before)}
                                            </td>
                                            <td className="px-2 py-1.5 text-[var(--ms-text-success,#15803d)] tabular-nums">
                                              {JSON.stringify(change.after)}
                                            </td>
                                          </tr>
                                        ),
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                            {row.context && (
                              <div>
                                <h3 className="mb-2 font-semibold text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                                  {t('context')}
                                </h3>
                                <pre className="overflow-x-auto rounded border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-2 text-xs">
                                  {JSON.stringify(row.context, null, 2)}
                                </pre>
                              </div>
                            )}
                            <div className="mt-2 text-[var(--ms-text-muted)] text-[12px] tabular-nums">
                              {t('entity_id')}: {row.entityId}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </StickyHScroll>
      )}

      {data && data.total > 0 && (
        <div className="mt-2 text-right text-[var(--ms-text-muted)] text-xs">
          {tCommon('records_count', { count: data.total })}
        </div>
      )}
    </Container>
  );
}
