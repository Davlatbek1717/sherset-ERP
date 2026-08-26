'use client';

/**
 * «HAL QILINMAGAN» — bayroq bo'yicha qaror kutayotgan tovarlar (K-reja K6/3).
 *
 * Reja: `docs/plans/2026-08-25-bolinadigan-tovar-bolak-hisobi.md`, K6 fazasi.
 * Vazifa matni: «birligi «m», lekin bayroq bo'yicha qaror qilinmagan tovarlar
 * alohida ekranda. Ha yoki yo'q deyilgach ro'yxatdan chiqadi. Shu bilan yangi
 * nomenklatura unutilib qolmaydi».
 *
 * 🔴 **Qoldiqqa ham, reyestrga ham TEGMAYDI.** Yagona yozuv —
 * `POST /stock-pieces/flag` (bayroq + qaror muhri). Bayroqning O'ZI esa
 * kassa taqsimotiga ta'sir qiladi (K3 ning 7.1 istisnosi: bo'linadigan
 * tovarda avto-taqsimot 3-holati o'chadi) — shuning uchun ekran «yoqilgan»
 * qatorlarni ALOHIDA ajratib ko'rsatadi.
 *
 * Ruxsat serverda (`piecetracking`) — sahifa 403 bo'lsa xabar ko'rsatadi.
 */

import { usePermissions } from '@/hooks/use-permissions';
import { api } from '@/lib/api-client';
import { Button, Input, useToast } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';

interface PendingRow {
  id: string;
  name: string;
  code: string | null;
  uom: string | null;
  pieceTracked: boolean;
  activePieces?: number;
  state: 'pending-on' | 'pending-off';
}

interface PendingResponse {
  rows: PendingRow[];
  totals: { pending: number; pendingOn: number; decided: number };
  truncated: number;
  scanTruncated: boolean;
}

export default function HalQilinmaganPage() {
  const t = useTranslations('pages.piece_pending');
  const { toast } = useToast();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canDecide = can('piecetracking', 'update');

  const [search, setSearch] = useState('');

  const list = useQuery<PendingResponse>({
    queryKey: ['piece-pending-decisions', search],
    queryFn: () =>
      api.get<PendingResponse>(
        `/stock-pieces/pending-decisions${search ? `?search=${encodeURIComponent(search)}` : ''}`,
      ),
  });

  const decide = useMutation({
    mutationFn: (v: { id: string; pieceTracked: boolean }) =>
      api.post('/stock-pieces/flag', { assortmentId: v.id, pieceTracked: v.pieceTracked }),
    onSuccess: (_res, v) => {
      toast.success(v.pieceTracked ? t('decided_on') : t('decided_off'));
      qc.invalidateQueries({ queryKey: ['piece-pending-decisions'] });
      qc.invalidateQueries({ queryKey: ['product', v.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = list.data?.rows ?? [];
  const totals = list.data?.totals;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-[var(--ms-border)] border-b p-4">
        <Link
          href="/omborchi"
          className="flex items-center gap-1.5 rounded-lg border border-[var(--ms-border)] px-3 py-2 font-medium text-[var(--ms-text-muted)] text-xs hover:bg-[var(--ms-bg-hover)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('back')}
        </Link>
        <h1 className="font-semibold text-[var(--ms-text-primary)] text-lg">{t('title')}</h1>
        <button
          type="button"
          onClick={() => list.refetch()}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-[var(--ms-border)] px-3 py-2 font-medium text-[var(--ms-text-muted)] text-xs hover:bg-[var(--ms-bg-hover)]"
          data-test-id="pending-refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t('refresh')}
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <p className="text-[var(--ms-text-muted)] text-sm">{t('intro')}</p>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('search_placeholder')}
          className="max-w-md"
          data-test-id="pending-search"
        />

        {list.error && (
          <div
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800 text-sm"
            data-test-id="pending-error"
          >
            {(list.error as Error).message}
          </div>
        )}

        {totals && (
          <div
            className="grid gap-3 rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] p-4 sm:grid-cols-3"
            data-test-id="pending-totals"
          >
            <Metric label={t('sum_pending')} value={String(totals.pending)} />
            <Metric
              label={t('sum_pending_on')}
              value={String(totals.pendingOn)}
              tone={totals.pendingOn > 0 ? 'text-amber-700' : undefined}
            />
            <Metric label={t('sum_decided')} value={String(totals.decided)} />
          </div>
        )}

        {list.data?.scanTruncated && (
          <div
            className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900 text-sm"
            data-test-id="pending-scan-truncated"
          >
            {t('scan_truncated')}
          </div>
        )}

        {list.data && rows.length === 0 && !list.error && (
          <div
            className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800 text-sm"
            data-test-id="pending-empty"
          >
            {t('empty')}
          </div>
        )}

        {rows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-[var(--ms-border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--ms-bg-hover)] text-[var(--ms-text-muted)] text-xs">
                <tr>
                  <th className="px-3 py-2 text-left">{t('col_product')}</th>
                  <th className="px-3 py-2 text-left">{t('col_uom')}</th>
                  <th className="px-3 py-2 text-right">{t('col_pieces')}</th>
                  <th className="px-3 py-2 text-left">{t('col_state')}</th>
                  <th className="px-3 py-2 text-right">{t('col_decision')}</th>
                </tr>
              </thead>
              <tbody data-test-id="pending-rows">
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-[var(--ms-border)] border-t"
                    data-test-id={`pending-row-${r.id}`}
                  >
                    <td className="px-3 py-2">
                      <Link href={`/products/${r.id}`} className="underline">
                        {r.name}
                      </Link>
                      {r.code && (
                        <span className="ml-2 text-[var(--ms-text-muted)] text-xs">{r.code}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{r.uom ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.activePieces ?? 0}</td>
                    <td className="px-3 py-2">
                      {r.state === 'pending-on' ? (
                        <span className="font-semibold text-amber-700">{t('state_on')}</span>
                      ) : (
                        <span className="text-[var(--ms-text-muted)]">{t('state_off')}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {canDecide ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="secondary"
                            disabled={decide.isPending}
                            onClick={() => decide.mutate({ id: r.id, pieceTracked: true })}
                            data-test-id={`pending-yes-${r.id}`}
                          >
                            {t('decide_yes')}
                          </Button>
                          <Button
                            variant="secondary"
                            disabled={decide.isPending}
                            onClick={() => decide.mutate({ id: r.id, pieceTracked: false })}
                            data-test-id={`pending-no-${r.id}`}
                          >
                            {t('decide_no')}
                          </Button>
                        </div>
                      ) : (
                        <span className="text-[var(--ms-text-muted)] text-xs">
                          {t('readonly_hint')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(list.data?.truncated ?? 0) > 0 && (
          <div className="text-[var(--ms-text-muted)] text-xs" data-test-id="pending-truncated">
            {t('truncated', { count: list.data?.truncated ?? 0 })}
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-[var(--ms-text-muted)] text-xs">{label}</div>
      <div className={`font-semibold text-lg tabular-nums ${tone ?? ''}`}>{value}</div>
    </div>
  );
}
