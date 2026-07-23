'use client';

import { api } from '@/lib/api-client';
import { Button, Checkbox, Input, NativeSelect, StickyHScroll } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { STATUS_DOT } from '../_lib/format';
import type {
  CountDto,
  CountListResponse,
  ReasonCode,
  ReasonListResponse,
  View,
} from '../_lib/types';

/**
 * Tasdiqlash — boshliq uchun. Pending/Qabul/Rad/Hammasi viewlari + bulk-approve
 * tanlanganlar uchun + tasdiqlash/rad/bekor qilish + sabab kodi modali.
 * Reference parity: `inventory/approvals/approvals-view.tsx` (893 satr) ning
 * sodda variantasi — keyingi P-I iteratsiyalarida richer filters/grouping.
 */
export function ApprovalView() {
  const t = useTranslations('pages.analitika_inventory');
  const qc = useQueryClient();
  const [view, setView] = useState<View>('pending');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<{ action: 'approve' | 'reject'; id: string } | null>(null);

  const { data } = useQuery<CountListResponse>({
    queryKey: ['analitika', 'counts', view],
    queryFn: () => api.get<CountListResponse>(`/analitika/counts?view=${view}`),
  });
  const reasons = useQuery<ReasonListResponse>({
    queryKey: ['analitika', 'reason-codes'],
    queryFn: () => api.get<ReasonListResponse>('/analitika/reason-codes'),
  });

  const items = data?.items ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['analitika', 'counts'] });
    qc.invalidateQueries({ queryKey: ['analitika', 'count-summary'] });
    setSelected(new Set());
  };

  const cancelMut = useMutation({
    mutationFn: (id: string) => api.post(`/analitika/counts/${id}/cancel`, {}),
    onSuccess: invalidate,
  });
  const bulkMut = useMutation({
    mutationFn: () => api.post('/analitika/counts/bulk-approve', { ids: [...selected] }),
    onSuccess: invalidate,
  });

  const views: { key: View; label: string }[] = [
    { key: 'pending', label: t('view_pending') },
    { key: 'accepted', label: t('view_accepted') },
    { key: 'rejected', label: t('view_rejected') },
    { key: 'all', label: t('view_all') },
  ];

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const counted = (row: CountDto) =>
    row.kamQty > 0 ? `-${row.kamQty}` : row.kopQty > 0 ? `+${row.kopQty}` : '0';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {views.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => {
              setView(v.key);
              setSelected(new Set());
            }}
            className={`rounded-full px-3 py-1 text-sm ${
              view === v.key
                ? 'bg-[var(--ms-text-brand)] text-white'
                : 'bg-[var(--ms-bg-subtle)] text-[var(--ms-text-muted)]'
            }`}
          >
            {v.label}
          </button>
        ))}
        {view === 'pending' && selected.size > 0 && (
          <Button onClick={() => bulkMut.mutate()} disabled={bulkMut.isPending}>
            {t('bulk_approve')} ({selected.size})
          </Button>
        )}
      </div>

      <StickyHScroll className="rounded-lg border border-[var(--ms-border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--ms-bg-subtle)] text-[var(--ms-text-muted)] text-xs">
            <tr>
              {view === 'pending' && <th className="w-8 px-3 py-2" />}
              <th className="px-3 py-2 text-left font-medium">{t('col_product')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('col_regos')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('col_counted')}</th>
              <th className="px-3 py-2 text-center font-medium">{t('col_status')}</th>
              <th className="px-3 py-2 text-left font-medium">{t('col_date')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('col_decision')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ms-border)]">
            {items.map((row) => (
              <tr key={row.id} className="hover:bg-[var(--ms-bg-subtle)]">
                {view === 'pending' && (
                  <td className="px-3 py-2 text-center">
                    <Checkbox
                      checked={selected.has(row.id)}
                      onCheckedChange={() => toggle(row.id)}
                      aria-label={`Tanlash ${row.productName}`}
                    />
                  </td>
                )}
                <td className="px-3 py-2 text-[var(--ms-text-primary)]">{row.productName}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.expectedQty}</td>
                <td className="px-3 py-2 text-right tabular-nums">{counted(row)}</td>
                <td className="px-3 py-2 text-center">
                  <span
                    className={`inline-block h-3 w-3 rounded-full ${STATUS_DOT[row.status]}`}
                    title={row.status}
                  />
                </td>
                <td className="px-3 py-2 text-[var(--ms-text-muted)]">
                  {new Date(row.countedAt).toLocaleDateString('ru-RU')}
                </td>
                <td className="px-3 py-2 text-right">
                  {row.decision === null ? (
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        className="text-[var(--ms-success-600)] text-xs hover:underline"
                        onClick={() => setModal({ action: 'approve', id: row.id })}
                      >
                        {t('approve')}
                      </button>
                      <button
                        type="button"
                        className="text-[var(--ms-destructive-500)] text-xs hover:underline"
                        onClick={() => setModal({ action: 'reject', id: row.id })}
                      >
                        {t('reject')}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-xs">
                        {row.decision === 'accepted'
                          ? t('decision_accepted')
                          : t('decision_rejected')}
                      </span>
                      <button
                        type="button"
                        className="text-[var(--ms-text-muted)] text-xs hover:underline"
                        onClick={() => cancelMut.mutate(row.id)}
                      >
                        {t('cancel_decision')}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-[var(--ms-text-muted)]">
                  {t('no_pending')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </StickyHScroll>

      {modal && (
        <ReasonModal
          action={modal.action}
          countId={modal.id}
          reasons={(reasons.data?.items ?? []).filter((r) => r.active)}
          onClose={() => setModal(null)}
          onConfirmed={() => {
            setModal(null);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

function ReasonModal({
  action,
  countId,
  reasons,
  onClose,
  onConfirmed,
}: {
  action: 'approve' | 'reject';
  countId: string;
  reasons: ReasonCode[];
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const t = useTranslations('pages.analitika_inventory');
  const [reasonId, setReasonId] = useState('');
  const [note, setNote] = useState('');

  const mut = useMutation({
    mutationFn: () =>
      api.post(`/analitika/counts/${countId}/${action}`, {
        ...(reasonId ? { reasonCodeId: reasonId } : {}),
        ...(note ? { note } : {}),
      }),
    onSuccess: onConfirmed,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      // biome-ignore lint/a11y/useSemanticElements: native <dialog> breaks tanstack-query mutation flow; role=dialog + Escape/backdrop matches existing modal pattern in this codebase
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
        <h3 className="font-medium text-[var(--ms-text-primary)]">
          {action === 'approve' ? t('approve') : t('reject')}
        </h3>
        <label className="mt-4 block text-sm">
          <span className="text-[var(--ms-text-muted)]">{t('select_reason')}</span>
          <NativeSelect
            value={reasonId}
            onChange={(e) => setReasonId(e.target.value)}
            className="mt-1"
          >
            <option value="">{t('reason_none')}</option>
            {reasons.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </NativeSelect>
        </label>
        <Input
          value={note}
          placeholder={t('note_ph')}
          onChange={(e) => setNote(e.target.value)}
          className="mt-3"
        />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {t('confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
