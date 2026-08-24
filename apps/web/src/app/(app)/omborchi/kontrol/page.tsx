'use client';

/**
 * G2 — kontrol ekrani (katta omborchi navbati).
 *
 * Yig'ib bo'lingan (`picking` + hamma sklad-topshiriqlari yopiq) cheklar
 * FIFO navbatda. Katta omborchi SKANERLAMAYDI (egasi, 2026-08-23): ko'z bilan
 * tekshirib «To'liq» deydi (`POST /retail-sales/:id/control-approve`) yoki
 * tarkibni tahrirlaydi (`PATCH /retail-sales/:id/control-edit` — qator
 * o'chirish / sonni KAMAYTIRISH). O'zgarish kassirga SSE bilan darhol boradi.
 *
 * Ruxsat serverda (`retailcontrol`) — bu sahifa 403 bo'lsa xabar ko'rsatadi.
 * Keyin F8 omborchi .exe qobig'i ichida ochiladi (reja 1-bo'lim).
 */

import { api } from '@/lib/api-client';
import { Input, formatMoney, useConfirm, useToast } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Pencil,
  RefreshCw,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface QueueTask {
  skladNo: number | null;
  assigneeName: string | null;
  status: string;
}
interface QueueSale {
  id: string;
  name: string;
  moment: string;
  sumMinor: string;
  agent: { id: string; name: string } | null;
  session: {
    cashDesk: { name: string; currency: string } | null;
    cashier: { id: string; name: string } | null;
  } | null;
  _count: { positions: number };
  pickingTasks: QueueTask[];
}

interface DetailPosition {
  id: string;
  quantity: string;
  priceMinor: string;
  sumMinor: string;
  product: { id: string; name: string } | null;
}
interface SaleDetail {
  id: string;
  name: string;
  state: string;
  version: number;
  sumMinor: string;
  positions: DetailPosition[];
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit' });
}

/** Tahrir holati: qator → { removed, qty }. */
type EditState = Record<string, { removed: boolean; qty: string }>;

function ControlCard({ sale, onChanged }: { sale: QueueSale; onChanged: () => void }) {
  const t = useTranslations('pages.omborchi_kontrol');
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState<EditState>({});

  const { data: detail, isLoading: detailLoading } = useQuery<SaleDetail>({
    queryKey: ['kontrol-sale', sale.id],
    queryFn: () => api.get(`/retail-sales/${sale.id}`),
    enabled: expanded,
  });

  const approveMut = useMutation({
    mutationFn: () => api.post(`/retail-sales/${sale.id}/control-approve`, {}),
    onSuccess: () => {
      toast.success(t('approve_success', { name: sale.name }));
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editMut = useMutation({
    mutationFn: () => {
      if (!detail) throw new Error(t('detail_not_loaded'));
      const kept = detail.positions
        .filter((p) => !edit[p.id]?.removed)
        .map((p) => ({ id: p.id, quantity: (edit[p.id]?.qty ?? p.quantity).trim() }));
      return api.patch(`/retail-sales/${sale.id}/control-edit`, {
        version: detail.version,
        positions: kept,
      });
    },
    onSuccess: () => {
      toast.success(t('edit_success'));
      setEditing(false);
      setEdit({});
      qc.invalidateQueries({ queryKey: ['kontrol-sale', sale.id] });
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startEdit = () => {
    setExpanded(true);
    setEditing(true);
    setEdit({});
  };

  const approve = async () => {
    const ok = await confirm({
      title: t('approve_confirm', { name: sale.name }),
      description: t('approve_hint'),
      confirmLabel: t('approve'),
      cancelLabel: t('cancel'),
    });
    if (ok) approveMut.mutate();
  };

  const keptCount = detail ? detail.positions.filter((p) => !edit[p.id]?.removed).length : 0;

  return (
    <div className="rounded-2xl border-2 border-[var(--ms-border)] bg-[var(--ms-bg-surface)] shadow-sm">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100">
          <ClipboardCheck className="h-5 w-5 text-sky-600" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[var(--ms-text-primary)]">{sale.name}</span>
            <span className="text-sm font-semibold tabular-nums text-[var(--ms-text-secondary)]">
              {formatMoney(BigInt(sale.sumMinor))}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ms-text-muted)]">
            <Clock className="h-3 w-3" />
            <span>
              {fmtDate(sale.moment)} {fmtTime(sale.moment)}
            </span>
            <span>·</span>
            <span>{t('items_count', { count: sale._count.positions })}</span>
            {sale.session?.cashier && (
              <>
                <span>·</span>
                <span>
                  {t('cashier')}: {sale.session.cashier.name}
                </span>
              </>
            )}
            {sale.agent && (
              <>
                <span>·</span>
                <span>{sale.agent.name}</span>
              </>
            )}
          </div>
          {sale.pickingTasks.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {sale.pickingTasks.map((task, i) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: snapshot ro'yxati
                  key={i}
                  className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"
                >
                  {task.skladNo != null
                    ? t('sklad_chip', { no: String(task.skladNo).padStart(2, '0') })
                    : t('sklad_chip_none')}
                  {task.assigneeName ? ` · ${task.assigneeName}` : ''}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setExpanded((v) => !v);
              if (expanded) {
                setEditing(false);
                setEdit({});
              }
            }}
            className="flex h-10 items-center rounded-lg border border-[var(--ms-border)] px-3 text-xs font-medium text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]"
          >
            {expanded ? t('close') : t('view')}
          </button>
          {!editing && (
            <button
              type="button"
              onClick={startEdit}
              className="flex h-10 items-center gap-1.5 rounded-lg border border-amber-300 px-3 text-xs font-semibold text-amber-700 hover:bg-amber-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              {t('edit')}
            </button>
          )}
          <button
            type="button"
            onClick={approve}
            disabled={approveMut.isPending}
            className="flex h-10 items-center gap-1.5 rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-white transition-all hover:bg-emerald-600 active:scale-95 disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            {approveMut.isPending ? '…' : t('approve')}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[var(--ms-border)] px-4 pb-4 pt-3">
          {detailLoading || !detail ? (
            <p className="py-4 text-center text-sm text-[var(--ms-text-muted)]">{t('loading')}</p>
          ) : (
            <>
              {editing && (
                <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {t('edit_hint')}
                </p>
              )}
              <div className="divide-y divide-[var(--ms-border)] rounded-xl border border-[var(--ms-border)]">
                {detail.positions.map((p) => {
                  const st = edit[p.id] ?? { removed: false, qty: p.quantity };
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-3 px-3 py-2.5 ${st.removed ? 'opacity-45' : ''}`}
                    >
                      <div className="min-w-0 flex-1">
                        <span
                          className={`text-sm font-medium text-[var(--ms-text-primary)] ${st.removed ? 'line-through' : ''}`}
                        >
                          {p.product?.name ?? '—'}
                        </span>
                        <div className="text-xs tabular-nums text-[var(--ms-text-muted)]">
                          {formatMoney(BigInt(p.priceMinor))} × {Number(p.quantity)} ={' '}
                          {formatMoney(BigInt(p.sumMinor))}
                        </div>
                      </div>
                      {editing ? (
                        <div className="flex shrink-0 items-center gap-2">
                          {!st.removed && (
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              value={st.qty}
                              onChange={(e) =>
                                setEdit((s) => ({
                                  ...s,
                                  [p.id]: { removed: false, qty: e.target.value },
                                }))
                              }
                              // h-11: tegish nishoni (G-reja UI qoidasi) — DS
                              // h-9 dan yiriklashtirilgan, twMerge buni hurmat qiladi.
                              className="h-11 w-24 text-right tabular-nums"
                              aria-label={t('qty')}
                            />
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setEdit((s) => ({
                                ...s,
                                [p.id]: { removed: !st.removed, qty: p.quantity },
                              }))
                            }
                            className={`flex h-11 w-11 items-center justify-center rounded-lg border ${
                              st.removed
                                ? 'border-emerald-300 text-emerald-600 hover:bg-emerald-50'
                                : 'border-red-200 text-red-500 hover:bg-red-50'
                            }`}
                            title={st.removed ? t('edit_row_restore') : t('edit_row_remove')}
                          >
                            {st.removed ? (
                              <Undo2 className="h-4 w-4" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <div className="shrink-0 rounded-lg bg-[var(--ms-bg-app)] px-3 py-1 text-sm font-bold tabular-nums text-[var(--ms-text-primary)]">
                          × {Number(p.quantity)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {editing && (
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setEdit({});
                    }}
                    className="flex h-11 items-center rounded-lg border border-[var(--ms-border)] px-4 text-sm font-medium text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={() => editMut.mutate()}
                    disabled={editMut.isPending || keptCount === 0}
                    className="flex h-11 items-center rounded-lg bg-amber-500 px-4 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                  >
                    {editMut.isPending ? '…' : t('edit_save')}
                  </button>
                </div>
              )}
              {editing && keptCount === 0 && (
                <p className="mt-2 text-right text-xs text-red-500">{t('edit_empty_warning')}</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function OmborchiKontrolPage() {
  const t = useTranslations('pages.omborchi_kontrol');
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery<{ items: QueueSale[] }>({
    queryKey: ['kontrol-queue'],
    queryFn: () => api.get('/retail-sales/control-queue?limit=50'),
    refetchInterval: 8000,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['kontrol-queue'] });
    qc.invalidateQueries({ queryKey: ['kontrol-sale'] });
  };

  const items = data?.items ?? [];

  return (
    <div className="flex h-[calc(100dvh-58px)] flex-col">
      <div className="flex items-center justify-between border-b border-[var(--ms-border)] px-6 py-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--ms-text-primary)]">{t('title')}</h1>
          <p className="text-xs text-[var(--ms-text-muted)]">{t('subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--ms-border)] px-3 py-2 text-xs font-medium text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t('refresh')}
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {error ? (
          <div className="rounded-2xl border-2 border-dashed border-red-200 py-12 text-center">
            <p className="text-sm text-red-500">{t('load_error')}</p>
            <p className="mt-1 text-xs text-[var(--ms-text-muted)]">{(error as Error).message}</p>
          </div>
        ) : isLoading ? (
          <div className="py-8 text-center text-sm text-[var(--ms-text-muted)]">{t('loading')}</div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-[var(--ms-border)] py-12 text-center">
            <ClipboardCheck className="mx-auto mb-2 h-8 w-8 text-[var(--ms-text-muted)] opacity-40" />
            <p className="text-sm text-[var(--ms-text-muted)]">{t('empty')}</p>
          </div>
        ) : (
          items.map((sale) => <ControlCard key={sale.id} sale={sale} onChanged={refresh} />)
        )}
      </div>
    </div>
  );
}
