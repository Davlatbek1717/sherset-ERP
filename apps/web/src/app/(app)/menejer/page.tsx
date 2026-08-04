'use client';

import { api } from '@/lib/api-client';
import { dailyKpiStateTone } from '@/lib/domain-status-tone';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  NativeSelect,
  Spinner,
  Textarea,
  cn,
  formatMoney,
  useHotkey,
  useToast,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Menejer — kunlik KPI qabul qilish (TZ §3.5, bosqich 4M.2).
 *
 * EKRAN TEZLIK UCHUN QURILGAN, chunki qaror shunga bog'liq: egasi har xodimning
 * HAR KUNINI qo'lda ko'rishni tanladi (M-Q9). 20 ta sekin ekrandan keyin
 * menejer ko'r-ko'rona bosa boshlaydi va qabul qilish ma'nosini yo'qotadi.
 * Shuning uchun: bitta kun bitta ekranda · klaviatura (↓/↑ · A · R · E) ·
 * og'ishli kunlar birinchi.
 *
 * DRILL-DOWN — rasmiyatchilikka aylanmasligining sharti. Menejer raqamni
 * bosib uni hosil qilgan hujjatlarni ko'radi; ko'rmasa, ishonmaydi.
 */

type DayState =
  | 'computed'
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'escalated'
  | 'force_accepted'
  | 'stale';

interface QueueItem {
  id: string;
  date: string;
  state: DayState;
  dataComplete: boolean;
  workedMinutes: number | null;
  employee: { id: string; name: string; position: string | null };
  attentionSignals: string[];
  revenuePerHourMinor?: string;
  receiptCount: number;
  summary: Array<{ key: string; value: string | null }>;
}

interface DetailMetric {
  key: string;
  labelUz: string;
  labelRu: string;
  unit: string;
  direction: 'higher_better' | 'lower_better' | 'neutral';
  perHour: boolean;
  autoValue: string | null;
  adjustValue: string | null;
  reasonCode: string | null;
  complete: boolean;
  baselineValue: string | null;
  deviationPercent: number | null;
  perHourValue: string | null;
}

interface DayEvent {
  id: string;
  action: string;
  fromState: string;
  toState: string;
  actorType: string;
  reasonCode: string | null;
  comment: string | null;
  createdAt: string;
}

interface DayDetail {
  id: string;
  date: string;
  state: DayState;
  dataComplete: boolean;
  workedMinutes: number | null;
  staleAt: string | null;
  acceptedAt: string | null;
  employee: { id: string; name: string; position: string | null };
  metrics: DetailMetric[];
  events: DayEvent[];
  actor: 'system' | 'manager' | 'employee' | 'owner';
  allowedActions: string[];
}

interface DrilldownRow {
  id: string;
  label: string;
  at: string | null;
  amountMinor: string | null;
  extra: Record<string, unknown>;
}

interface DrilldownResult {
  kind: string;
  rows: DrilldownRow[];
  excluded: DrilldownRow[];
  note?: string;
}

interface Reference {
  reasonCodes: Record<string, string[]>;
}

/** Pul birligidagi ko'rsatkichlar — qolganlari dona/daqiqa. */
const MONEY_UNITS = new Set(['minor']);

export default function MenejerPage() {
  const t = useTranslations('pages.menejer');
  const qc = useQueryClient();
  const { toast } = useToast();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [drillMetric, setDrillMetric] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const queue = useQuery<{ items: QueueItem[]; total: number }>({
    queryKey: ['manager-kpi', 'queue'],
    queryFn: () => api.get('/manager/kpi/days'),
    // Navbat — jonli ish joyi; standart 30s staleTime bilan u qotib qolardi.
    refetchInterval: 20_000,
  });

  const items = useMemo(() => queue.data?.items ?? [], [queue.data]);

  // Tanlov navbat bilan sinxron: kun qabul qilinib ro'yxatdan chiqsa,
  // menejer bo'sh ekranga qarab qolmasin — keyingisiga o'tadi.
  useEffect(() => {
    if (items.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !items.some((i) => i.id === selectedId)) {
      setSelectedId(items[0]?.id ?? null);
    }
  }, [items, selectedId]);

  const detail = useQuery<DayDetail>({
    queryKey: ['manager-kpi', 'day', selectedId],
    queryFn: () => api.get(`/manager/kpi/days/${selectedId}`),
    enabled: !!selectedId,
  });

  const reference = useQuery<Reference>({
    queryKey: ['manager-kpi', 'reference'],
    queryFn: () => api.get('/manager/kpi/reference'),
    staleTime: 600_000,
  });

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['manager-kpi'] });
  }, [qc]);

  const transition = useMutation({
    mutationFn: (body: { action: string; reasonCode?: string | null; comment?: string | null }) =>
      api.post(`/manager/kpi/days/${selectedId}/transition`, body),
    onSuccess: (_d, vars) => {
      toast.success(t(`action_done_${vars.action}` as never));
      setRejectOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(t('action_failed'), { description: e.message }),
  });

  const adjust = useMutation({
    mutationFn: (body: {
      metricKey: string;
      adjustValue: string | null;
      reasonCode: string;
      comment?: string | null;
    }) => api.post(`/manager/kpi/days/${selectedId}/adjust`, body),
    onSuccess: () => {
      toast.success(t('adjust_done'));
      setAdjustOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(t('action_failed'), { description: e.message }),
  });

  const move = useCallback(
    (delta: number) => {
      if (items.length === 0) return;
      const idx = items.findIndex((i) => i.id === selectedId);
      const next = Math.min(Math.max((idx < 0 ? 0 : idx) + delta, 0), items.length - 1);
      const target = items[next];
      if (target) {
        setSelectedId(target.id);
        listRef.current
          ?.querySelector(`[data-day-id="${target.id}"]`)
          ?.scrollIntoView({ block: 'nearest' });
      }
    },
    [items, selectedId],
  );

  const can = (action: string) => detail.data?.allowedActions.includes(action) ?? false;

  useHotkey('arrowdown', () => move(1));
  useHotkey('arrowup', () => move(-1));
  useHotkey('a', () => {
    if (can('accept') && !transition.isPending) transition.mutate({ action: 'accept' });
  });
  useHotkey('r', () => {
    if (can('reject')) setRejectOpen(true);
  });
  useHotkey('e', () => {
    if (detail.data && !isFrozenState(detail.data.state)) setAdjustOpen(true);
  });

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-semibold text-xl">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
        </div>
        <p className="text-muted-foreground text-xs">{t('hotkeys')}</p>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        {/* ── Navbat ─────────────────────────────────────────────── */}
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <div className="border-b px-3 py-2 font-medium text-sm">
            {t('queue_count', { count: items.length })}
          </div>
          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
            {queue.isLoading ? (
              <div className="flex justify-center p-6">
                <Spinner />
              </div>
            ) : items.length === 0 ? (
              <EmptyState title={t('queue_empty')} description={t('queue_empty_hint')} />
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-day-id={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={cn(
                    'flex w-full flex-col gap-1 border-b px-3 py-2 text-left transition-colors',
                    item.id === selectedId ? 'bg-accent' : 'hover:bg-muted/50',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-sm">{item.employee.name}</span>
                    <Badge tone={dailyKpiStateTone(item.state)}>
                      {t(`state_${item.state}` as never)}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-muted-foreground text-xs">
                    <span>{formatDay(item.date)}</span>
                    <span>{t('receipts', { count: item.receiptCount })}</span>
                  </div>
                  {item.attentionSignals.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.attentionSignals.map((s) => (
                        <span
                          key={s}
                          className="rounded bg-warning/15 px-1 py-0.5 text-[10px] text-warning-foreground"
                        >
                          {t(`signal_${s}` as never)}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </Card>

        {/* ── Kun detali ─────────────────────────────────────────── */}
        <Card className="flex min-h-0 flex-col overflow-hidden">
          {!selectedId ? (
            <EmptyState title={t('select_day')} />
          ) : detail.isLoading || !detail.data ? (
            <div className="flex justify-center p-6">
              <Spinner />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold">{detail.data.employee.name}</h2>
                    <Badge tone={dailyKpiStateTone(detail.data.state)}>
                      {t(`state_${detail.data.state}` as never)}
                    </Badge>
                    {!detail.data.dataComplete && (
                      <Badge tone="warning">{t('signal_data_incomplete')}</Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {formatDay(detail.data.date)}
                    {detail.data.employee.position ? ` · ${detail.data.employee.position}` : ''}
                    {detail.data.workedMinutes != null
                      ? ` · ${t('worked', { hours: (detail.data.workedMinutes / 60).toFixed(1) })}`
                      : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {can('accept') && (
                    <Button
                      variant="success"
                      loading={transition.isPending}
                      onClick={() => transition.mutate({ action: 'accept' })}
                    >
                      {t('accept')}
                    </Button>
                  )}
                  {can('reject') && (
                    <Button variant="destructive" onClick={() => setRejectOpen(true)}>
                      {t('reject')}
                    </Button>
                  )}
                  {!isFrozenState(detail.data.state) && (
                    <Button variant="secondary" onClick={() => setAdjustOpen(true)}>
                      {t('adjust')}
                    </Button>
                  )}
                  {can('escalate') && (
                    <Button
                      variant="tertiary"
                      onClick={() =>
                        transition.mutate({ action: 'escalate', reasonCode: 'above_manager_limit' })
                      }
                    >
                      {t('escalate')}
                    </Button>
                  )}
                  {can('force_accept') && (
                    <Button
                      variant="primary"
                      onClick={() =>
                        transition.mutate({ action: 'force_accept', reasonCode: 'owner_decision' })
                      }
                    >
                      {t('force_accept')}
                    </Button>
                  )}
                  {can('reopen') && (
                    <Button
                      variant="ghost"
                      onClick={() =>
                        transition.mutate({ action: 'reopen', reasonCode: 'new_information' })
                      }
                    >
                      {t('reopen')}
                    </Button>
                  )}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <MetricTable metrics={detail.data.metrics} onDrill={setDrillMetric} t={t} />

                {detail.data.events.length > 0 && (
                  <section className="mt-6">
                    <h3 className="mb-2 font-medium text-sm">{t('journal')}</h3>
                    <ul className="space-y-1 text-sm">
                      {detail.data.events.map((e) => (
                        <li key={e.id} className="flex flex-wrap gap-2 text-muted-foreground">
                          <span className="tabular-nums">{formatStamp(e.createdAt)}</span>
                          <span className="text-foreground">
                            {t(`action_${e.action}` as never)}
                          </span>
                          <span>
                            {t(`state_${e.fromState}` as never)} →{' '}
                            {t(`state_${e.toState}` as never)}
                          </span>
                          <span>({t(`actor_${e.actorType}` as never)})</span>
                          {e.reasonCode && <span>· {t(`reason_${e.reasonCode}` as never)}</span>}
                          {e.comment && <span className="text-foreground">«{e.comment}»</span>}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            </>
          )}
        </Card>
      </div>

      <RejectModal
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        codes={reference.data?.reasonCodes?.reject ?? []}
        pending={transition.isPending}
        onSubmit={(reasonCode, comment) =>
          transition.mutate({ action: 'reject', reasonCode, comment })
        }
        t={t}
      />

      <AdjustModal
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        metrics={detail.data?.metrics ?? []}
        codes={reference.data?.reasonCodes?.adjust ?? []}
        pending={adjust.isPending}
        onSubmit={(body) => adjust.mutate(body)}
        t={t}
      />

      <DrilldownModal
        dayId={selectedId}
        metricKey={drillMetric}
        onClose={() => setDrillMetric(null)}
        t={t}
      />
    </div>
  );
}

// ── Ko'rsatkichlar jadvali ──────────────────────────────────────────────────

function MetricTable({
  metrics,
  onDrill,
  t,
}: {
  metrics: DetailMetric[];
  onDrill: (key: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-muted-foreground text-xs">
          <tr className="border-b">
            <th className="py-1 text-left font-medium">{t('col_metric')}</th>
            <th className="py-1 text-right font-medium">{t('col_auto')}</th>
            <th className="py-1 text-right font-medium">{t('col_adjust')}</th>
            <th className="py-1 text-right font-medium">{t('col_baseline')}</th>
            <th className="py-1 text-right font-medium">{t('col_deviation')}</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => (
            <tr key={m.key} className="border-b last:border-0">
              <td className="py-1">
                <button
                  type="button"
                  className="text-left underline-offset-2 hover:underline"
                  onClick={() => onDrill(m.key)}
                >
                  {m.labelUz}
                </button>
                {!m.complete && m.autoValue != null && (
                  <span className="ml-1 text-warning text-xs">{t('partial')}</span>
                )}
              </td>
              {/* O'LCHANMAGAN «—», O'LCHANGAN NOL «0» — bu ikkisi bir xil ko'rinmasligi
                  shart, aks holda menejer «hech narsa qilmagan» bilan «o'lchanmagan»ni
                  farqlay olmaydi (NULL ≠ 0). */}
              <td className="py-1 text-right tabular-nums">{fmt(m.autoValue, m.unit)}</td>
              <td className="py-1 text-right tabular-nums">
                {m.adjustValue != null ? (
                  <span className="font-medium">{fmt(m.adjustValue, m.unit)}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="py-1 text-right text-muted-foreground tabular-nums">
                {fmt(m.baselineValue, m.unit)}
              </td>
              <td className="py-1 text-right tabular-nums">
                <Deviation percent={m.deviationPercent} direction={m.direction} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Og'ish rangi YO'NALISHGA qarab: kam-yaxshi ko'rsatkichda o'sish — YOMON. */
function Deviation({
  percent,
  direction,
}: {
  percent: number | null;
  direction: DetailMetric['direction'];
}) {
  if (percent == null) return <span className="text-muted-foreground">—</span>;
  const good = direction === 'lower_better' ? percent < 0 : percent > 0;
  const tone =
    direction === 'neutral' || percent === 0
      ? 'text-muted-foreground'
      : good
        ? 'text-success'
        : 'text-destructive';
  return (
    <span className={tone}>
      {percent > 0 ? '+' : ''}
      {percent}%
    </span>
  );
}

// ── Modallar ────────────────────────────────────────────────────────────────

function RejectModal({
  open,
  onOpenChange,
  codes,
  pending,
  onSubmit,
  t,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  codes: string[];
  pending: boolean;
  onSubmit: (reasonCode: string, comment: string | null) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  useEffect(() => {
    if (open) {
      setReason(codes[0] ?? '');
      setComment('');
    }
  }, [open, codes]);

  // «other» izohsiz backend'da rad etiladi — foydalanuvchini u yergacha
  // yubormay, tugmani shu yerda o'chiramiz.
  const needComment = reason === 'other';
  const blocked = !reason || (needComment && comment.trim() === '');

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('reject_title')}
      description={t('reject_description')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            variant="destructive"
            loading={pending}
            disabled={blocked}
            onClick={() => onSubmit(reason, comment.trim() || null)}
          >
            {t('reject')}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <NativeSelect value={reason} onChange={(e) => setReason(e.target.value)}>
          {codes.map((c) => (
            <option key={c} value={c}>
              {t(`reason_${c}` as never)}
            </option>
          ))}
        </NativeSelect>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={needComment ? t('comment_required') : t('comment_optional')}
          rows={3}
        />
      </div>
    </Modal>
  );
}

function AdjustModal({
  open,
  onOpenChange,
  metrics,
  codes,
  pending,
  onSubmit,
  t,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  metrics: DetailMetric[];
  codes: string[];
  pending: boolean;
  onSubmit: (body: {
    metricKey: string;
    adjustValue: string | null;
    reasonCode: string;
    comment?: string | null;
  }) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [metricKey, setMetricKey] = useState('');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (open) {
      setMetricKey(metrics[0]?.key ?? '');
      setValue('');
      setReason(codes[0] ?? '');
      setComment('');
    }
  }, [open, metrics, codes]);

  const current = metrics.find((m) => m.key === metricKey);
  const needComment = reason === 'other';
  // Bo'sh qiymat = tuzatmani BEKOR QILISH (null), shuning uchun u to'siq emas.
  const badValue = value.trim() !== '' && !/^-?\d+$/.test(value.trim());
  const blocked = !metricKey || !reason || badValue || (needComment && comment.trim() === '');

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('adjust_title')}
      description={t('adjust_description')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            loading={pending}
            disabled={blocked}
            onClick={() =>
              onSubmit({
                metricKey,
                adjustValue: value.trim() === '' ? null : value.trim(),
                reasonCode: reason,
                comment: comment.trim() || null,
              })
            }
          >
            {t('save')}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <NativeSelect value={metricKey} onChange={(e) => setMetricKey(e.target.value)}>
          {metrics.map((m) => (
            <option key={m.key} value={m.key}>
              {m.labelUz}
            </option>
          ))}
        </NativeSelect>
        {current && (
          <p className="text-muted-foreground text-sm">
            {t('auto_value')}:{' '}
            <span className="tabular-nums">{fmt(current.autoValue, current.unit)}</span>
          </p>
        )}
        <input
          className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('adjust_value_placeholder')}
          inputMode="numeric"
        />
        {badValue && <p className="text-destructive text-xs">{t('adjust_value_invalid')}</p>}
        <NativeSelect value={reason} onChange={(e) => setReason(e.target.value)}>
          {codes.map((c) => (
            <option key={c} value={c}>
              {t(`reason_${c}` as never)}
            </option>
          ))}
        </NativeSelect>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={needComment ? t('comment_required') : t('comment_optional')}
          rows={2}
        />
      </div>
    </Modal>
  );
}

function DrilldownModal({
  dayId,
  metricKey,
  onClose,
  t,
}: {
  dayId: string | null;
  metricKey: string | null;
  onClose: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const enabled = !!dayId && !!metricKey;
  const q = useQuery<DrilldownResult>({
    queryKey: ['manager-kpi', 'drilldown', dayId, metricKey],
    queryFn: () => api.get(`/manager/kpi/days/${dayId}/drilldown?metric=${metricKey}`),
    enabled,
  });

  return (
    <Modal
      open={enabled}
      onOpenChange={(v) => !v && onClose()}
      title={t('drilldown_title')}
      description={metricKey ? t(`metric_${metricKey}` as never) : undefined}
      widthClass="w-[720px]"
      scrollableBody
    >
      {q.isLoading ? (
        <div className="flex justify-center p-6">
          <Spinner />
        </div>
      ) : !q.data || (q.data.rows.length === 0 && q.data.excluded.length === 0) ? (
        <EmptyState title={t('drilldown_empty')} />
      ) : (
        <div className="space-y-4">
          <DrillList rows={q.data.rows} t={t} />
          {q.data.excluded.length > 0 && (
            <section>
              {/* «Nega hujjatlar yig'indisi tile bilan mos kelmayapti» degan
                  savolga javob — jim qoldirilsa menejer raqamga ishonmaydi. */}
              <h4 className="mb-1 font-medium text-sm text-warning">
                {t('drilldown_excluded', { count: q.data.excluded.length })}
              </h4>
              {q.data.note && (
                <p className="mb-2 text-muted-foreground text-xs">
                  {t(`note_${q.data.note}` as never)}
                </p>
              )}
              <DrillList rows={q.data.excluded} t={t} />
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}

function DrillList({
  rows,
  t,
}: {
  rows: DrilldownRow[];
  t: ReturnType<typeof useTranslations>;
}) {
  if (rows.length === 0)
    return <p className="text-muted-foreground text-sm">{t('drilldown_empty')}</p>;
  return (
    <ul className="divide-y text-sm">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 py-1">
          <span className="min-w-0 flex-1 truncate">{r.label}</span>
          <span className="text-muted-foreground text-xs tabular-nums">
            {r.at ? formatStamp(r.at) : '—'}
          </span>
          <span className="w-32 text-right tabular-nums">
            {r.amountMinor != null ? formatMoney(BigInt(r.amountMinor)) : '—'}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ── Formatlash ──────────────────────────────────────────────────────────────

function isFrozenState(s: DayState): boolean {
  return s === 'accepted' || s === 'force_accepted';
}

/**
 * `null` = O'LCHANMAGAN va u «0» deb ko'rsatilmaydi. Bu butun 1.1/1.2
 * to'lqinining sababi: nol deb ko'rsatilgan o'lchanmagan qiymat yolg'on
 * xulosaga olib keladi.
 */
function fmt(value: string | null, unit: string): string {
  if (value == null) return '—';
  if (MONEY_UNITS.has(unit)) return formatMoney(BigInt(value));
  return new Intl.NumberFormat('ru-RU').format(Number(value));
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
