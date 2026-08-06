'use client';

import { api } from '@/lib/api-client';
import { Badge, Button, Input, formatDate, formatMoney } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface VarianceRow {
  id: string;
  currency: string;
  expectedMinor: string;
  countedMinor: string;
  varianceMinor: string;
  kind: 'shortage' | 'surplus';
  cashierNote: string | null;
  managerNote: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: { id: string; name: string } | null;
  createdAt: string;
  cashier: { id: string; name: string } | null;
  sessionId: string;
  cashDeskName: string | null;
  closedAt: string | null;
}

interface VarianceList {
  items: VarianceRow[];
  total: number;
  /** Ko'rilmaganlar soni — filtr o'zgarsa ham yo'qolmaydi. */
  pendingCount: number;
}

type Scope = 'pending' | 'done' | 'all';

/**
 * Kassa farq aktlari — menejer ekrani (kassa TZ §8.4).
 *
 * Default FAQAT ko'rilmaganlar: menejerning savoli «bugun nimani ko'rishim
 * kerak», «bir yilda qancha farq bo'lgan» emas. To'liq tarix filtr orqali.
 *
 * ⚠️ Bu yerda summalar TAHRIRLANMAYDI. Akt — pul yo'qolishi haqidagi dalil;
 * uni tuzatish imkoni bo'lsa, u dalil bo'lishdan to'xtardi. Menejer faqat
 * «ko'rdim» deb belgilaydi va sababni yozadi.
 */
export default function KassaFarqlariPage() {
  const t = useTranslations('pages.cashVariances');
  const qc = useQueryClient();
  const [scope, setScope] = useState<Scope>('pending');
  const [noteById, setNoteById] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery<VarianceList>({
    queryKey: ['cash-variances', scope],
    queryFn: () => api.get<VarianceList>(`/cashier-sessions/variances?acknowledged=${scope}`),
  });

  const ackMut = useMutation({
    mutationFn: (row: VarianceRow) =>
      api.post(`/cashier-sessions/variances/${row.id}/acknowledge`, {
        note: noteById[row.id]?.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-variances'] });
    },
  });

  const rows = data?.items ?? [];

  return (
    <div className="p-4" data-test-id="cash-variances-page">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-semibold text-[var(--ms-text-primary)] text-lg">
          {t('title')}
          {data && data.pendingCount > 0 && (
            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700 text-xs">
              {data.pendingCount}
            </span>
          )}
        </h1>
        <div className="flex gap-1">
          {(['pending', 'done', 'all'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              data-test-id={`variance-scope-${s}`}
              className={`rounded-lg border px-3 py-1.5 font-medium text-xs transition-colors ${
                scope === s
                  ? 'border-[var(--ms-brand)] bg-[var(--ms-brand)]/5 text-[var(--ms-text-primary)]'
                  : 'border-[var(--ms-border)] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]'
              }`}
            >
              {t(`scope_${s}`)}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <p className="text-[var(--ms-text-muted)] text-sm">{t('loading')}</p>}

      {!isLoading && rows.length === 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-center">
          <p className="font-medium text-emerald-800 text-sm">{t('empty_title')}</p>
          <p className="mt-1 text-emerald-700 text-xs">{t('empty_hint')}</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {rows.map((v) => {
          const variance = BigInt(v.varianceMinor);
          const shortage = v.kind === 'shortage';
          return (
            <div
              key={v.id}
              data-test-id={`variance-${v.id}`}
              className={`rounded-xl border p-4 ${
                shortage ? 'border-red-200 bg-red-50/40' : 'border-amber-200 bg-amber-50/40'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone={shortage ? 'destructive' : 'warning'}>
                      {t(shortage ? 'shortage' : 'surplus')}
                    </Badge>
                    <span
                      className={`font-bold text-lg tabular-nums ${
                        shortage ? 'text-red-800' : 'text-amber-800'
                      }`}
                    >
                      {formatMoney(variance, v.currency)}
                    </span>
                    {v.acknowledgedAt && <Badge tone="success">{t('ack_done')}</Badge>}
                  </div>
                  <div className="mt-1 text-[var(--ms-text-muted)] text-xs">
                    {v.cashier?.name ?? '—'}
                    {v.cashDeskName && ` · ${v.cashDeskName}`}
                    {v.closedAt && ` · ${formatDate(v.closedAt)}`}
                  </div>
                  <div className="mt-1 text-[var(--ms-text-muted)] text-xs">
                    {t('expected')}: {formatMoney(BigInt(v.expectedMinor), v.currency)} ·{' '}
                    {t('counted')}: {formatMoney(BigInt(v.countedMinor), v.currency)}
                  </div>
                  {v.cashierNote && (
                    <div className="mt-2 rounded-lg bg-[var(--ms-bg-surface)] px-3 py-1.5 text-sm">
                      <span className="text-[var(--ms-text-muted)] text-xs">
                        {t('cashier_note')}:{' '}
                      </span>
                      {v.cashierNote}
                    </div>
                  )}
                  {v.managerNote && (
                    <div className="mt-1 text-[var(--ms-text-muted)] text-xs">
                      {t('manager_note')}: {v.managerNote}
                      {v.acknowledgedBy && ` — ${v.acknowledgedBy.name}`}
                    </div>
                  )}
                </div>

                <a
                  href={`/retail/sessions/${v.sessionId}`}
                  className="whitespace-nowrap text-[var(--ms-brand)] text-xs hover:underline"
                >
                  {t('open_shift')} →
                </a>
              </div>

              {/* Tan olish — summalar tahrirlanmaydi, faqat «ko'rdim» + sabab. */}
              {!v.acknowledgedAt && (
                <div className="mt-3 flex gap-2">
                  <div className="flex-1">
                    <Input
                      value={noteById[v.id] ?? ''}
                      onChange={(e) => setNoteById((p) => ({ ...p, [v.id]: e.target.value }))}
                      placeholder={t('note_placeholder')}
                      data-test-id={`variance-note-${v.id}`}
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={() => ackMut.mutate(v)}
                    disabled={ackMut.isPending}
                    data-test-id={`variance-ack-${v.id}`}
                  >
                    {t('acknowledge')}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
