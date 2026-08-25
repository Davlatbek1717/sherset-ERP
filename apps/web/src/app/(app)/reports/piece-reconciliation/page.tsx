'use client';

import { api } from '@/lib/api-client';
import {
  Breadcrumb,
  Button,
  Checkbox,
  Container,
  NativeSelect,
  PageHeader,
  buildCsv,
  csvTimestamp,
  downloadCsv,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/**
 * Bo'lak reyestri sverkasi — K-reja K1/3-vazifa.
 *
 * FAQAT O'QIYDI. Hisobot reyestr (`stock_pieces`) va qoldiqni solishtiradi;
 * farq topilsa QIZIL qator beradi, lekin hech nimani to'xtatmaydi va hech
 * nimani tuzatmaydi — kassa avvalgidek ishlayveradi (K-reja 10-bo'lim, 5-band).
 *
 * K1 da bayroq (`Product.pieceTracked`) hech qayerda yoqilmagan ⇒ kutiladigan
 * natija «farq yo'q, reyestr bo'sh». Bo'lak KIRITISH ekrani — K2.
 */

interface StoreRef {
  id: string;
  name: string;
}

interface ReconRow {
  storeId: string;
  storeName: string;
  cellId: string | null;
  cellName: string | null;
  assortmentKind: string;
  assortmentId: string;
  productName: string | null;
  productCode: string | null;
  uom: string | null;
  stockQty: string;
  registryQty: string;
  diffQty: string;
  pieceCount: number;
  wholeCount: number;
  status: 'ok' | 'excess' | 'missing';
}

interface ReconWarning {
  code: 'pieces-without-flag' | 'invalid-piece';
  assortmentKind: string;
  assortmentId: string;
  productName: string | null;
  violations?: string[];
  count: number;
}

interface ReconResponse {
  totals: {
    trackedProducts: number;
    buckets: number;
    diffBuckets: number;
    activePieces: number;
    stockQty: string;
    registryQty: string;
    diffQty: string;
  };
  rows: ReconRow[];
  warnings: ReconWarning[];
  truncated: number;
}

const INPUT_CLASS =
  'h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)] tabular-nums';

export default function PieceReconciliationReport() {
  const t = useTranslations('pages.report_piece_reconciliation');
  const tCommon = useTranslations('common');

  const [storeId, setStoreId] = useState<string>('');
  const [onlyDiff, setOnlyDiff] = useState<boolean>(false);

  const params = new URLSearchParams({ limit: '500' });
  if (storeId) params.set('storeId', storeId);
  if (onlyDiff) params.set('onlyDiff', '1');

  const { data: stores } = useQuery<{ items: StoreRef[] }>({
    queryKey: ['stores-active'],
    queryFn: () => api.get<{ items: StoreRef[] }>('/stores?archived=false&limit=50'),
  });

  const { data, isLoading, error, refetch } = useQuery<ReconResponse>({
    queryKey: ['report-piece-reconciliation', storeId, onlyDiff],
    queryFn: () => api.get<ReconResponse>(`/stock-pieces/reconciliation?${params.toString()}`),
  });

  const exportCsv = () => {
    if (!data) return;
    const csv = buildCsv(
      [
        { header: t('col_store'), cellText: (r: ReconRow) => r.storeName },
        { header: t('col_cell'), cellText: (r: ReconRow) => r.cellName ?? t('no_cell') },
        { header: t('col_product'), cellText: (r: ReconRow) => r.productName ?? r.assortmentId },
        { header: t('col_code'), cellText: (r: ReconRow) => r.productCode ?? '' },
        { header: t('col_stock'), cellText: (r: ReconRow) => r.stockQty },
        { header: t('col_registry'), cellText: (r: ReconRow) => r.registryQty },
        { header: t('col_diff'), cellText: (r: ReconRow) => r.diffQty },
        { header: t('col_pieces'), cellText: (r: ReconRow) => String(r.pieceCount) },
        { header: t('col_whole'), cellText: (r: ReconRow) => String(r.wholeCount) },
        { header: t('col_status'), cellText: (r: ReconRow) => t(`status_${r.status}`) },
      ],
      data.rows,
    );
    downloadCsv(`piece-reconciliation-${csvTimestamp()}.csv`, csv);
  };

  const clean = data && data.totals.diffBuckets === 0 && data.warnings.length === 0;

  return (
    <Container size="md" className="py-4">
      <Breadcrumb
        items={[{ label: tCommon('reports'), href: '/reports' }, { label: t('title') }]}
      />
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div>
          <div className="mb-1 text-[var(--ms-text-muted)] text-xs">{t('field_store')}</div>
          <NativeSelect
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className={INPUT_CLASS}
            data-test-id="piece-recon-store"
          >
            <option value="">{t('all_stores')}</option>
            {stores?.items?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <label className="flex h-9 items-center gap-2 text-sm">
          <Checkbox
            checked={onlyDiff}
            onCheckedChange={(v) => setOnlyDiff(v === true)}
            data-test-id="piece-recon-only-diff"
          />
          {t('only_diff')}
        </label>
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
        <div
          className="mb-3 flex flex-wrap gap-x-6 gap-y-1 rounded border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)] px-3 py-2 text-sm"
          data-test-id="piece-recon-summary"
        >
          <span>
            {t('sum_tracked')}: <b className="tabular-nums">{data.totals.trackedProducts}</b>
          </span>
          <span>
            {t('sum_pieces')}: <b className="tabular-nums">{data.totals.activePieces}</b>
          </span>
          <span>
            {t('sum_stock')}: <b className="tabular-nums">{data.totals.stockQty}</b>
          </span>
          <span>
            {t('sum_registry')}: <b className="tabular-nums">{data.totals.registryQty}</b>
          </span>
          <span className={data.totals.diffBuckets > 0 ? 'text-[var(--ms-text-destructive)]' : ''}>
            {t('sum_diff')}:{' '}
            <b className="tabular-nums">
              {data.totals.diffQty} ({data.totals.diffBuckets})
            </b>
          </span>
        </div>
      )}

      {clean && (
        <div
          className="mb-3 rounded border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-3 text-sm"
          data-test-id="piece-recon-clean"
        >
          {t('no_diff')}
        </div>
      )}

      {data && data.warnings.length > 0 && (
        <div
          className="mb-3 rounded border border-[var(--ms-warning-200)] bg-[var(--ms-warning-50)] p-3 text-sm"
          data-test-id="piece-recon-warnings"
        >
          <div className="mb-1 font-semibold">{t('warnings_title')}</div>
          <ul className="list-inside list-disc">
            {data.warnings.map((w) => (
              <li key={`${w.code}-${w.assortmentId}-${(w.violations ?? []).join(',')}`}>
                {w.code === 'pieces-without-flag'
                  ? t('warn_pieces_without_flag', {
                      product: w.productName ?? w.assortmentId,
                      count: w.count,
                    })
                  : t('warn_invalid_piece', {
                      product: w.productName ?? w.assortmentId,
                      count: w.count,
                      rules: (w.violations ?? []).join(', '),
                    })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data && data.truncated > 0 && (
        <div
          className="mb-3 text-[var(--ms-text-muted)] text-sm"
          data-test-id="piece-recon-truncated"
        >
          {t('truncated', { count: data.truncated })}
        </div>
      )}

      {data && (
        <div className="overflow-auto rounded border border-[var(--ms-border-default)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--ms-bg-muted)]">
              <tr>
                <th className="px-3 py-2 text-left">{t('col_store')}</th>
                <th className="px-3 py-2 text-left">{t('col_cell')}</th>
                <th className="px-3 py-2 text-left">{t('col_product')}</th>
                <th className="px-3 py-2 text-right">{t('col_stock')}</th>
                <th className="px-3 py-2 text-right">{t('col_registry')}</th>
                <th className="px-3 py-2 text-right">{t('col_diff')}</th>
                <th className="px-3 py-2 text-right">{t('col_pieces')}</th>
                <th className="px-3 py-2 text-right">{t('col_whole')}</th>
                <th className="px-3 py-2 text-left">{t('col_status')}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr
                  key={`${r.storeId}-${r.cellId ?? 'none'}-${r.assortmentId}`}
                  className="border-[var(--ms-border-subtle)] border-t hover:bg-[var(--ms-bg-muted)]"
                >
                  <td className="px-3 py-2">{r.storeName}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.cellName ?? (
                      <span className="text-[var(--ms-text-muted)]">{t('no_cell')}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium">
                    {r.productName ?? r.assortmentId}
                    {r.productCode ? (
                      <span className="ml-2 text-[var(--ms-text-muted)] text-xs">
                        {r.productCode}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.stockQty}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.registryQty}</td>
                  <td
                    className={`px-3 py-2 text-right font-semibold tabular-nums ${
                      r.status === 'ok' ? '' : 'text-[var(--ms-text-destructive)]'
                    }`}
                  >
                    {r.diffQty}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.pieceCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.wholeCount}</td>
                  <td className="px-3 py-2">{t(`status_${r.status}`)}</td>
                </tr>
              ))}
              {data.rows.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-[var(--ms-text-muted)] text-sm">
                    {t('empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  );
}
