'use client';

/**
 * «Ombor operatsiyalari» (Sherset custom) — the supply→putaway→picking chain
 * on one screen: how much was received in the window, how many placement /
 * picking tasks wait RIGHT NOW (backlog is current state, not window-bound),
 * how many were completed in the window, and the per-keeper breakdown.
 *
 * Backend: GET /reports/warehouse-ops?dateFrom=...&dateTo=...
 */

import { type UnconvertedAmountRow, UnconvertedNotice } from '@/components/reports/report-notices';
import { api } from '@/lib/api-client';
import { Breadcrumb, Button, Container, Input, PageHeader, formatMoney } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface KeeperRow {
  assigneeId: string | null;
  assigneeName: string;
  putawayBacklog: number;
  putawayDone: number;
  pickingBacklog: number;
  pickingDone: number;
}

interface WarehouseOpsReport {
  inbound: { suppliesCount: number; suppliesSumMinor: string; draftCount: number };
  putaway: { pending: number; inProgress: number; doneInWindow: number };
  picking: { pending: number; inProgress: number; doneInWindow: number };
  outbound: { demandsCount: number; demandsSumMinor: string };
  keepers: KeeperRow[];
  currency: string;
  mixedCurrency: boolean;
  unconvertedByCurrency: UnconvertedAmountRow[];
}

const INPUT_CLASS =
  'w-full h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)] tabular-nums';

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Stat tile — hero number in text tokens, label above, secondary line below. */
function StatTile({
  label,
  value,
  sub,
  href,
  linkLabel,
  testId,
}: {
  label: string;
  value: string;
  sub?: string;
  href: string;
  linkLabel: string;
  testId: string;
}) {
  return (
    <div
      className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4"
      data-test-id={testId}
    >
      <div className="text-[var(--ms-text-muted)] text-xs">{label}</div>
      <div className="mt-1 font-semibold text-2xl text-[var(--ms-text-primary)] tabular-nums">
        {value}
      </div>
      <div className="mt-0.5 min-h-4 text-[var(--ms-text-secondary)] text-xs">{sub ?? ''}</div>
      <a
        href={href}
        className="mt-2 inline-block text-[var(--ms-text-brand)] text-xs hover:underline"
      >
        {linkLabel} →
      </a>
    </div>
  );
}

export default function WarehouseOpsReportPage() {
  const t = useTranslations('pages.report_warehouse_ops');

  const [dateFrom, setDateFrom] = useState<string>(isoDaysAgo(6));
  const [dateTo, setDateTo] = useState<string>(isoDaysAgo(0));

  const { data, isLoading, error, refetch } = useQuery<WarehouseOpsReport>({
    queryKey: ['report-warehouse-ops', dateFrom, dateTo],
    queryFn: () =>
      api.get<WarehouseOpsReport>(`/reports/warehouse-ops?dateFrom=${dateFrom}&dateTo=${dateTo}`),
    enabled: Boolean(dateFrom && dateTo),
  });

  return (
    <Container size="full" className="py-4">
      <Breadcrumb
        items={[{ label: t('breadcrumb_reports'), href: '/reports' }, { label: t('title') }]}
      />
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="mt-3 flex flex-wrap items-end gap-3 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-3">
        <div>
          <label htmlFor="wo-from" className="mb-1 block text-[var(--ms-text-muted)] text-xs">
            {t('date_from')}
          </label>
          <Input
            id="wo-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={INPUT_CLASS}
            data-test-id="wo-date-from"
          />
        </div>
        <div>
          <label htmlFor="wo-to" className="mb-1 block text-[var(--ms-text-muted)] text-xs">
            {t('date_to')}
          </label>
          <Input
            id="wo-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={INPUT_CLASS}
            data-test-id="wo-date-to"
          />
        </div>
        <div className="ml-auto self-center text-[var(--ms-text-muted)] text-xs">
          {t('backlog_note')}
        </div>
      </div>

      {isLoading && (
        <div className="py-8 text-center text-[var(--ms-text-muted)] text-sm">{t('loading')}</div>
      )}
      {error != null && (
        <div className="py-8 text-center text-sm">
          <div className="mb-2 text-red-600">{t('error')}</div>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            {t('retry')}
          </Button>
        </div>
      )}

      {data && (
        <>
          {data.mixedCurrency && (
            <div className="mt-3 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)] px-3 py-2 text-[var(--ms-text-secondary)] text-xs">
              {t('currency_mixed_warn')}
            </div>
          )}
          <UnconvertedNotice rows={data.unconvertedByCurrency} testId="wo-unconverted-warn" />

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            <StatTile
              testId="wo-tile-inbound"
              label={t('tile_inbound')}
              value={formatMoney(data.inbound.suppliesSumMinor, data.currency, {
                displayAs: 'none',
              })}
              sub={`${t('tile_docs_count', { count: data.inbound.suppliesCount })} · ${t('tile_inbound_drafts', { count: data.inbound.draftCount })}`}
              href="/supplies"
              linkLabel={t('link_supplies')}
            />
            <StatTile
              testId="wo-tile-putaway"
              label={t('tile_putaway')}
              value={String(data.putaway.pending + data.putaway.inProgress)}
              sub={`${t('tile_in_progress', { count: data.putaway.inProgress })} · ${t('tile_putaway_done', { count: data.putaway.doneInWindow })}`}
              href="/restock-tasks"
              linkLabel={t('link_restock')}
            />
            <StatTile
              testId="wo-tile-picking"
              label={t('tile_picking')}
              value={String(data.picking.pending + data.picking.inProgress)}
              sub={`${t('tile_in_progress', { count: data.picking.inProgress })} · ${t('tile_picking_done', { count: data.picking.doneInWindow })}`}
              href="/omborchi"
              linkLabel={t('link_omborchi')}
            />
            <StatTile
              testId="wo-tile-outbound"
              label={t('tile_outbound')}
              value={formatMoney(data.outbound.demandsSumMinor, data.currency, {
                displayAs: 'none',
              })}
              sub={t('tile_docs_count', { count: data.outbound.demandsCount })}
              href="/demands"
              linkLabel={t('link_demands')}
            />
          </div>

          <h2 className="mt-6 mb-2 font-semibold text-[var(--ms-text-primary)] text-base">
            {t('keepers_title')}
          </h2>
          <div className="overflow-x-auto rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]">
            <table className="w-full text-sm" data-test-id="wo-keepers-table">
              <thead>
                <tr className="border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-muted)] text-left text-[var(--ms-text-secondary)] text-xs">
                  <th className="px-3 py-2 font-medium">{t('col_keeper')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('col_putaway_backlog')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('col_putaway_done')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('col_picking_backlog')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('col_picking_done')}</th>
                </tr>
              </thead>
              <tbody>
                {data.keepers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-[var(--ms-text-muted)]">
                      {t('empty_keepers')}
                    </td>
                  </tr>
                )}
                {data.keepers.map((k) => (
                  <tr
                    key={k.assigneeId ?? 'unassigned'}
                    className="border-[var(--ms-border-default)] border-b last:border-0 hover:bg-[var(--ms-row-hover)]"
                  >
                    <td className="px-3 py-2">{k.assigneeId ? k.assigneeName : t('unassigned')}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{k.putawayBacklog}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{k.putawayDone}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{k.pickingBacklog}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{k.pickingDone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Container>
  );
}
