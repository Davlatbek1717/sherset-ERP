'use client';

import { api } from '@/lib/api-client';
import { abcClassTone } from '@/lib/domain-status-tone';
import {
  Badge,
  Breadcrumb,
  Button,
  Container,
  Input,
  PageHeader,
  buildCsv,
  csvTimestamp,
  downloadCsv,
  formatMoney,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

type ClassGroup = 'A' | 'B' | 'C';

interface AbcRow {
  productId: string;
  name: string;
  code: string | null;
  qty: string;
  revenueMinor: string;
  cumulativeShare: number;
  classGroup: ClassGroup;
}

interface AbcSummary {
  classGroup: ClassGroup;
  itemCount: number;
  qty: string;
  revenueMinor: string;
  share: number;
}

/**
 * Mirrors the API's AbcResponse (apps/api/src/modules/report/abc-analysis.service.ts)
 * EXACTLY. The page originally declared an imagined `{filter, totals, classes}`
 * wrapper — `data.classes` was always undefined, so the report WHITE-SCREENED on
 * every load once data arrived (found by the 2026-06-10 Convention-6 browser
 * render-sweep; same FE↔BE contract-drift class as the POS register crash,
 * 08k). Locked by abc-report-contract.test.ts.
 */
interface AbcReport {
  from: string;
  to: string;
  totalRevenueMinor: string;
  summary: AbcSummary[];
  rows: AbcRow[];
}

const INPUT_CLASS =
  'h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)] tabular-nums';

function defaultRange(): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 30);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(today) };
}

export default function AbcAnalysisReport() {
  const t = useTranslations('pages.report_abc');
  const tCommon = useTranslations('common');
  const [{ from, to }, setRange] = useState(defaultRange);

  const params = new URLSearchParams({ from, to });

  const { data, isLoading, error, refetch } = useQuery<AbcReport>({
    queryKey: ['report-abc', from, to],
    queryFn: () => api.get<AbcReport>(`/reports/abc-analysis?${params.toString()}`),
  });

  const exportCsv = () => {
    if (!data) return;
    const csv = buildCsv(
      [
        { header: t('col_class'), cellText: (r: AbcRow) => r.classGroup },
        { header: t('col_name'), cellText: (r: AbcRow) => r.name },
        { header: t('col_code'), cellText: (r: AbcRow) => r.code ?? '' },
        { header: t('col_qty'), cellText: (r: AbcRow) => r.qty },
        { header: t('col_revenue'), cellText: (r: AbcRow) => r.revenueMinor },
        {
          header: t('col_cumulative'),
          // cumulativeShare is already a percent (0..100) from the BE
          // (abc-analysis.service.ts:153) — do NOT multiply by 100 again.
          cellText: (r: AbcRow) => `${r.cumulativeShare.toFixed(2)}%`,
        },
      ],
      data.rows,
    );
    downloadCsv(`abc-analysis-${csvTimestamp()}.csv`, csv);
  };

  const formattedRows = useMemo(() => data?.rows ?? [], [data]);

  return (
    <Container size="full" className="py-4">
      <Breadcrumb
        items={[{ label: tCommon('reports'), href: '/reports' }, { label: t('title') }]}
      />
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div>
          <div className="mb-1 text-[var(--ms-text-muted)] text-xs">{t('field_from')}</div>
          <Input
            type="date"
            value={from}
            onChange={(e) => setRange({ from: e.target.value, to })}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <div className="mb-1 text-[var(--ms-text-muted)] text-xs">{t('field_to')}</div>
          <Input
            type="date"
            value={to}
            onChange={(e) => setRange({ from, to: e.target.value })}
            className={INPUT_CLASS}
          />
        </div>
        <Button type="button" variant="primary" onClick={() => refetch()} loading={isLoading}>
          {tCommon('apply')}
        </Button>
        <Button type="button" variant="tertiary" onClick={exportCsv} disabled={!data}>
          {tCommon('export_csv')}
        </Button>
      </div>

      {error && (
        <div className="mb-3 rounded border border-[var(--ms-destructive-200)] bg-[var(--ms-destructive-50)] p-3 text-[var(--ms-text-destructive)] text-sm">
          {(error as Error).message}
        </div>
      )}

      {data && (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            {data.summary.map((c) => (
              <div
                key={c.classGroup}
                className="rounded border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4"
              >
                <div className="mb-1 flex items-center justify-between">
                  <Badge tone={abcClassTone(c.classGroup)}>{c.classGroup}</Badge>
                  <span className="text-[var(--ms-text-muted)] text-xs">{c.share.toFixed(1)}%</span>
                </div>
                <div className="font-semibold text-lg tabular-nums">
                  {formatMoney(BigInt(c.revenueMinor), 'UZS')}
                </div>
                <div className="text-[var(--ms-text-muted)] text-xs">
                  {c.itemCount} {t('items')} · {c.qty} {t('qty_short')}
                </div>
              </div>
            ))}
          </div>

          <div className="overflow-auto rounded border border-[var(--ms-border-default)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--ms-bg-muted)]">
                <tr>
                  <th className="px-3 py-2 text-left">{t('col_class')}</th>
                  <th className="px-3 py-2 text-left">{t('col_name')}</th>
                  <th className="px-3 py-2 text-left">{t('col_code')}</th>
                  <th className="px-3 py-2 text-right">{t('col_qty')}</th>
                  <th className="px-3 py-2 text-right">{t('col_revenue')}</th>
                  <th className="px-3 py-2 text-right">{t('col_cumulative')}</th>
                </tr>
              </thead>
              <tbody>
                {formattedRows.map((r) => (
                  <tr
                    key={r.productId}
                    className="border-[var(--ms-border-subtle)] border-t hover:bg-[var(--ms-bg-muted)]"
                  >
                    <td className="px-3 py-2">
                      <Badge tone={abcClassTone(r.classGroup)}>{r.classGroup}</Badge>
                    </td>
                    <td className="px-3 py-2 font-medium">{r.name}</td>
                    <td className="px-3 py-2 text-[var(--ms-text-muted)]">{r.code ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.qty}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(BigInt(r.revenueMinor), 'UZS')}
                    </td>
                    <td className="px-3 py-2 text-right text-[var(--ms-text-muted)] tabular-nums">
                      {r.cumulativeShare.toFixed(2)}%
                    </td>
                  </tr>
                ))}
                {formattedRows.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-[var(--ms-text-muted)] text-sm">
                      {t('empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Container>
  );
}
