'use client';

/**
 * Menejer — kunlik KPI qabul qilish (TZ 4M.2 §3.5, egasining 1-ustuvorligi).
 *
 * NEGA MASTER-DETAIL, NEGA ALOHIDA SAHIFA EMAS: TZ talabi — «20+ xodim × har
 * kun qo'lda ko'riladi, shuning uchun ekran TEZLIK uchun qurilishi shart:
 * bitta xodim kuni bitta ekranda, skrollsiz, klaviatura bilan (keyingi →
 * qabul → keyingi)». Har kun uchun route almashsa, navigatsiya + qayta yuklash
 * halqani sekinlashtiradi va menejer ro'yxat oxiriga yetguncha ko'r-ko'rona
 * bosa boshlaydi — qabul qilish o'z ma'nosini yo'qotadi.
 *
 * Klaviatura: ↓/↑ keyingi/oldingi · A qabul · R rad etish · E tuzatish.
 * Tartib serverdan keladi (og'ishli kunlar birinchi) — bu yerda qayta
 * saralanmaydi, aks holda ikki joyda ikki xil tartib bo'lib ketardi.
 */

import { KPI_DAY_STATE_TONE, type StateTone, documentStateTone } from '@/lib/document-state-tone';
import {
  type KpiDayDetail,
  type KpiDayMetric,
  type KpiDayState,
  type KpiQueueItem,
  type KpiReasonCodeItem,
  type KpiUnit,
  managerKpiApi,
} from '@/lib/manager-api';
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Modal,
  NativeSelect,
  Skeleton,
  Textarea,
  useToast,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Holat → rang UMUMIY helper'dan keladi (`documentStateTone`), lokal jadval
 * EMAS: 2026-06-10 da har sahifa o'z `STATE_TONE` nusxasini saqlagani uchun
 * ikki holat jimgina bir-biridan uzoqlashgan edi. KPI kunining uchta holati
 * kanonikdan farq qiladi — farq `KPI_DAY_STATE_TONE` da OSHKORA turadi.
 */
const stateTone = (state: KpiDayState): StateTone => documentStateTone(state, KPI_DAY_STATE_TONE);

/** Qaysi dialog ochiq. */
type DialogKind = 'reject' | 'reopen' | 'force_accept' | null;

export default function MenejerPage() {
  const t = useTranslations('pages.menejer');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [adjustKey, setAdjustKey] = useState<string | null>(null);
  const [showAccepted, setShowAccepted] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const states = showAccepted
    ? ['escalated', 'stale', 'rejected', 'pending', 'accepted']
    : undefined;

  const { data: queue, isLoading: queueLoading } = useQuery({
    queryKey: ['kpi-queue', showAccepted],
    queryFn: () => managerKpiApi.queue({ states, limit: 200 }),
  });
  const { data: reasonCodes } = useQuery<KpiReasonCodeItem[]>({
    queryKey: ['kpi-reason-codes'],
    queryFn: () => managerKpiApi.reasonCodes(),
  });

  const items = useMemo(() => queue?.items ?? [], [queue]);

  // Navbat kelgach birinchi kunni tanlaymiz; tanlangan kun ro'yxatdan
  // chiqib ketsa (qabul qilindi) — keyingisiga o'tamiz, ro'yxat bo'shab
  // qolgandek ko'rinmasin.
  useEffect(() => {
    if (items.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !items.some((i) => i.id === selectedId)) {
      setSelectedId(items[0]?.id ?? null);
    }
  }, [items, selectedId]);

  const { data: day, isLoading: dayLoading } = useQuery<KpiDayDetail>({
    queryKey: ['kpi-day', selectedId],
    queryFn: () => managerKpiApi.day(selectedId as string),
    enabled: !!selectedId,
  });

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['kpi-queue'] });
    void qc.invalidateQueries({ queryKey: ['kpi-day'] });
  }, [qc]);

  const onError = useCallback(
    (e: Error) => toast.error(tCommon('action_failed'), { description: e.message }),
    [toast, tCommon],
  );

  const acceptMut = useMutation({
    mutationFn: (id: string) => managerKpiApi.accept(id),
    onSuccess: (res) => {
      // `changed: false` = kun allaqachon qabul qilingan edi (idempotent).
      // Buni «saqlandi» deb ko'rsatish yolg'on bo'lardi.
      toast.success(res.changed ? t('accepted_toast') : t('already_accepted_toast'));
      refresh();
    },
    onError,
  });

  const decisionMut = useMutation({
    mutationFn: (v: {
      kind: Exclude<DialogKind, null>;
      id: string;
      reasonCode: string;
      note: string;
    }) => {
      const body = { reasonCode: v.reasonCode, note: v.note || null };
      if (v.kind === 'reject') return managerKpiApi.reject(v.id, body);
      if (v.kind === 'reopen') return managerKpiApi.reopen(v.id, body);
      return managerKpiApi.forceAccept(v.id, body);
    },
    onSuccess: () => {
      toast.success(t('saved_toast'));
      setDialog(null);
      refresh();
    },
    onError,
  });

  const escalateMut = useMutation({
    mutationFn: (id: string) => managerKpiApi.escalate(id),
    onSuccess: () => {
      toast.success(t('escalated_toast'));
      refresh();
    },
    onError,
  });

  const adjustMut = useMutation({
    mutationFn: (v: {
      id: string;
      metricKey: string;
      value: string | null;
      reasonCode: string;
      note: string;
    }) =>
      managerKpiApi.adjust(v.id, v.metricKey, {
        value: v.value,
        reasonCode: v.reasonCode,
        note: v.note || null,
      }),
    onSuccess: () => {
      toast.success(t('saved_toast'));
      setAdjustKey(null);
      refresh();
    },
    onError,
  });

  // ── Klaviatura (TZ §3.5 majburiy xususiyati) ────────────────────────────
  const move = useCallback(
    (delta: number) => {
      if (items.length === 0) return;
      const idx = items.findIndex((i) => i.id === selectedId);
      const next = Math.min(items.length - 1, Math.max(0, (idx < 0 ? 0 : idx) + delta));
      setSelectedId(items[next]?.id ?? null);
    },
    [items, selectedId],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Dialog ochiq yoki matn kiritilayotgan bo'lsa — qisqartmalar o'chadi,
      // aks holda izoh yozayotganda «a» harfi kunni qabul qilib yuborardi.
      if (dialog || adjustKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable)
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          move(1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          move(-1);
          break;
        case 'a':
        case 'A':
          if (selectedId && day?.state !== 'accepted') acceptMut.mutate(selectedId);
          break;
        case 'r':
        case 'R':
          if (selectedId && day?.state !== 'accepted') setDialog('reject');
          break;
        case 'e':
        case 'E':
          if (day && day.state !== 'accepted' && day.metrics[0])
            setAdjustKey(day.metrics[0].metricKey);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, adjustKey, move, selectedId, day, acceptMut]);

  // Klaviatura bilan tanlangan qator ko'rinish maydonidan chiqib ketmasin:
  // 200 elementli navbatda ↓ bosgan menejer tanlov qayerdaligini yo'qotardi.
  useEffect(() => {
    if (!selectedId) return;
    listRef.current
      ?.querySelector(`[data-test-id="kpi-queue-row-${selectedId}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  const selectedMetric = day?.metrics.find((m) => m.metricKey === adjustKey) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-semibold text-2xl text-[var(--ms-text-strong)]">{t('title')}</h1>
          <p className="mt-1 text-[var(--ms-text-muted)] text-sm">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-[var(--ms-text-muted)] text-xs md:inline">
            {t('shortcuts_hint')}
          </span>
          <Button
            variant={showAccepted ? 'primary' : 'secondary'}
            onClick={() => setShowAccepted((v) => !v)}
            data-test-id="kpi-toggle-accepted"
          >
            {t('show_accepted')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        {/* ── Navbat ─────────────────────────────────────────────────── */}
        <div
          ref={listRef}
          className="max-h-[calc(100vh-220px)] overflow-y-auto rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]"
          data-test-id="kpi-queue"
        >
          {queueLoading ? (
            <div className="space-y-2 p-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : items.length === 0 ? (
            <div className="p-6">
              <EmptyState title={t('queue_empty')} description={t('queue_empty_hint')} />
            </div>
          ) : (
            <ul>
              {items.map((item) => (
                <QueueRow
                  key={item.id}
                  item={item}
                  active={item.id === selectedId}
                  locale={locale}
                  onSelect={() => setSelectedId(item.id)}
                  t={t}
                />
              ))}
            </ul>
          )}
        </div>

        {/* ── Bitta kun ──────────────────────────────────────────────── */}
        <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
          {dayLoading || !day ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            <DayPanel
              day={day}
              locale={locale}
              t={t}
              onAccept={() => acceptMut.mutate(day.id)}
              onReject={() => setDialog('reject')}
              onReopen={() => setDialog('reopen')}
              onForceAccept={() => setDialog('force_accept')}
              onEscalate={() => escalateMut.mutate(day.id)}
              onAdjust={(key) => setAdjustKey(key)}
              busy={acceptMut.isPending || escalateMut.isPending}
            />
          )}
        </div>
      </div>

      {/* Sabab talab qiladigan qarorlar */}
      <ReasonDialog
        kind={dialog}
        codes={reasonCodes ?? []}
        pending={decisionMut.isPending}
        onClose={() => setDialog(null)}
        onSubmit={(reasonCode, note) => {
          if (!dialog || !selectedId) return;
          decisionMut.mutate({ kind: dialog, id: selectedId, reasonCode, note });
        }}
        t={t}
        tCommon={tCommon}
      />

      {/* Ko'rsatkich tuzatmasi */}
      <AdjustDialog
        metric={selectedMetric}
        codes={reasonCodes ?? []}
        locale={locale}
        pending={adjustMut.isPending}
        onClose={() => setAdjustKey(null)}
        onSubmit={(value, reasonCode, note) => {
          if (!selectedId || !adjustKey) return;
          adjustMut.mutate({ id: selectedId, metricKey: adjustKey, value, reasonCode, note });
        }}
        t={t}
        tCommon={tCommon}
      />
    </div>
  );
}

// ── Navbat qatori ───────────────────────────────────────────────────────────

function QueueRow({
  item,
  active,
  locale,
  onSelect,
  t,
}: {
  item: KpiQueueItem;
  active: boolean;
  locale: string;
  onSelect: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        data-test-id={`kpi-queue-row-${item.id}`}
        className={`w-full border-[var(--ms-border-default)] border-b px-3 py-2 text-left transition-colors ${
          active ? 'bg-[var(--ms-bg-selected)]' : 'hover:bg-[var(--ms-bg-hover)]'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium text-[var(--ms-text-primary)] text-sm">
            {item.employee.name}
          </span>
          <span className="shrink-0 text-[var(--ms-text-muted)] text-xs tabular-nums">
            {formatDate(item.date, locale)}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Badge tone={stateTone(item.state)}>{t(`state_${item.state}`)}</Badge>
          {/* Ball NULL = «hech narsa o'lchanmagan» — 0% deb ko'rsatish yolg'on. */}
          <Badge tone={scoreTone(item.score)}>
            {item.score == null ? t('score_none') : `${item.score}%`}
          </Badge>
          {!item.dataComplete && <Badge tone="warning">{t('incomplete_short')}</Badge>}
          {!item.hasProfile && <Badge tone="neutral">{t('no_profile_short')}</Badge>}
          {item.adjustedCount > 0 && (
            <Badge tone="brand">
              {t('adjusted_short')} {item.adjustedCount}
            </Badge>
          )}
        </div>
      </button>
    </li>
  );
}

// ── Kun paneli ──────────────────────────────────────────────────────────────

function DayPanel({
  day,
  locale,
  t,
  onAccept,
  onReject,
  onReopen,
  onForceAccept,
  onEscalate,
  onAdjust,
  busy,
}: {
  day: KpiDayDetail;
  locale: string;
  t: ReturnType<typeof useTranslations>;
  onAccept: () => void;
  onReject: () => void;
  onReopen: () => void;
  onForceAccept: () => void;
  onEscalate: () => void;
  onAdjust: (metricKey: string) => void;
  busy: boolean;
}) {
  const accepted = day.state === 'accepted';
  // Qabul qilingandan keyin MUZLATILGAN ball ko'rsatiladi — jonli qayta
  // hisoblangani emas (to'langan oylik ortidagi raqam o'zgarmasligi kerak).
  const shownScore = accepted && day.scoreFrozen != null ? day.scoreFrozen : day.score;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-[var(--ms-text-strong)] text-lg">
            {day.employee.name}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-[var(--ms-text-muted)]">{formatDate(day.date, locale)}</span>
            <Badge tone={stateTone(day.state)}>{t(`state_${day.state}`)}</Badge>
            {!day.dataComplete && <Badge tone="warning">{t('incomplete')}</Badge>}
            {day.profileVersion ? (
              <span className="text-[var(--ms-text-muted)] text-xs">
                {t('profile_version')} {day.profileVersion.version}
              </span>
            ) : (
              <Badge tone="neutral">{t('no_profile')}</Badge>
            )}
          </div>
        </div>

        <div className="text-right">
          <div className="font-semibold text-2xl text-[var(--ms-text-strong)] tabular-nums">
            {shownScore == null ? t('score_none') : `${shownScore}%`}
          </div>
          <div className="text-[var(--ms-text-muted)] text-xs">
            {/* Qamrov YASHIRILMAYDI: ball kunning qanchasini qamragani ko'rinib
                turmasa, chala ball to'liq ball kabi o'qiladi. */}
            {t('coverage')}: {day.weightScored}/{day.weightTotal}
            {accepted && day.scoreFrozen != null ? ` · ${t('score_frozen')}` : ''}
          </div>
          {day.workedMinutes != null && (
            <div className="text-[var(--ms-text-muted)] text-xs">
              {t('worked')}: {formatMinutes(day.workedMinutes)}
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[var(--ms-bg-muted)] text-[var(--ms-text-muted)]">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium">{t('col_metric')}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t('col_fact')}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t('col_target')}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t('col_achievement')}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t('col_deviation')}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t('col_weight')}</th>
              <th className="px-2 py-1.5" aria-label={t('col_actions')} />
            </tr>
          </thead>
          <tbody>
            {day.metrics.map((m) => (
              <MetricRow
                key={m.metricKey}
                m={m}
                locale={locale}
                t={t}
                disabled={accepted}
                onAdjust={() => onAdjust(m.metricKey)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Amallar */}
      <div className="flex flex-wrap items-center gap-2 border-[var(--ms-border-default)] border-t pt-3">
        {accepted ? (
          <Button variant="secondary" onClick={onReopen} data-test-id="kpi-reopen">
            {t('action_reopen')}
          </Button>
        ) : (
          <>
            <Button onClick={onAccept} disabled={busy} data-test-id="kpi-accept">
              {t('action_accept')} <Kbd>A</Kbd>
            </Button>
            <Button variant="secondary" onClick={onReject} data-test-id="kpi-reject">
              {t('action_reject')} <Kbd>R</Kbd>
            </Button>
            {day.state === 'escalated' ? (
              <Button variant="secondary" onClick={onForceAccept} data-test-id="kpi-force-accept">
                {t('action_force_accept')}
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={onEscalate}
                disabled={busy}
                data-test-id="kpi-escalate"
              >
                {t('action_escalate')}
              </Button>
            )}
          </>
        )}
      </div>

      {/* Hodisa jurnali — nizoda yozma iz */}
      {day.events.length > 0 && (
        <div className="border-[var(--ms-border-default)] border-t pt-3">
          <h3 className="mb-2 font-medium text-[var(--ms-text-strong)] text-sm">
            {t('journal_title')}
          </h3>
          <ul className="space-y-1">
            {day.events.map((ev) => (
              <li key={ev.id} className="text-[var(--ms-text-muted)] text-xs">
                <span className="tabular-nums">{formatDateTime(ev.createdAt, locale)}</span>
                {' · '}
                <span className="text-[var(--ms-text-primary)]">
                  {t(`action_log_${ev.action}`)}
                </span>
                {' · '}
                {t(`actor_${ev.actorType}`)}
                {ev.reasonCode ? ` · ${t(`reason_${ev.reasonCode}`)}` : ''}
                {ev.note ? ` — ${ev.note}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MetricRow({
  m,
  locale,
  t,
  disabled,
  onAdjust,
}: {
  m: KpiDayMetric;
  locale: string;
  t: ReturnType<typeof useTranslations>;
  disabled: boolean;
  onAdjust: () => void;
}) {
  const fact = m.adjustValue ?? m.autoValue;
  return (
    <tr className="border-[var(--ms-border-default)] border-t">
      <td className="px-2 py-1.5">
        <div className="text-[var(--ms-text-primary)]">{metricLabel(m, locale)}</div>
        <div className="text-[var(--ms-text-muted)] text-xs">
          {!m.complete && <span className="text-[var(--ms-warning-600)]">{t('partial')} · </span>}
          {/* Ballga kirmagan bo'lsa — SABABI ochiq. «Jimgina 0» ishonchni yo'q qiladi. */}
          {!m.scored && m.skipReason ? t(`skip_${m.skipReason}`) : null}
          {m.perHour != null
            ? ` · ${t('per_hour')}: ${formatValue(m.perHour, m.unit, locale)}`
            : ''}
        </div>
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {fact == null ? (
          // NULL ≠ 0: o'lchanmagan qiymat nol deb ko'rsatilmaydi.
          <span className="text-[var(--ms-text-muted)]">{t('unmeasured_dash')}</span>
        ) : (
          <span className={m.adjusted ? 'font-semibold text-[var(--ms-text-brand)]' : ''}>
            {formatValue(fact, m.unit, locale)}
          </span>
        )}
        {m.adjusted && m.autoValue != null && (
          <div className="text-[var(--ms-text-muted)] text-xs line-through">
            {formatValue(m.autoValue, m.unit, locale)}
          </div>
        )}
      </td>
      <td className="px-2 py-1.5 text-right text-[var(--ms-text-muted)] tabular-nums">
        {m.target == null ? '—' : formatValue(m.target, m.unit, locale)}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {m.achievementPercent == null ? (
          '—'
        ) : (
          <Badge tone={achievementTone(m.achievementPercent)}>{m.achievementPercent}%</Badge>
        )}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {m.deviationPercent == null ? (
          <span className="text-[var(--ms-text-muted)]">—</span>
        ) : (
          <span
            className={
              m.deviationPercent < 0
                ? 'text-[var(--ms-destructive-600)]'
                : 'text-[var(--ms-success-600)]'
            }
          >
            {m.deviationPercent > 0 ? '+' : ''}
            {m.deviationPercent}%
          </span>
        )}
      </td>
      <td className="px-2 py-1.5 text-right text-[var(--ms-text-muted)] tabular-nums">
        {m.weight > 0 ? `${m.weight}%` : '—'}
      </td>
      <td className="px-2 py-1.5 text-right">
        <Button
          variant="ghost"
          size="sm"
          onClick={onAdjust}
          disabled={disabled}
          data-test-id={`kpi-adjust-${m.metricKey}`}
        >
          {t('action_adjust')}
        </Button>
      </td>
    </tr>
  );
}

// ── Dialoglar ───────────────────────────────────────────────────────────────

function ReasonDialog({
  kind,
  codes,
  pending,
  onClose,
  onSubmit,
  t,
  tCommon,
}: {
  kind: DialogKind;
  codes: KpiReasonCodeItem[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (reasonCode: string, note: string) => void;
  t: ReturnType<typeof useTranslations>;
  tCommon: ReturnType<typeof useTranslations>;
}) {
  const [reasonCode, setReasonCode] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (kind) {
      setReasonCode(codes[0]?.code ?? '');
      setNote('');
    }
  }, [kind, codes]);

  return (
    <Modal
      open={kind != null}
      onOpenChange={(v) => !v && onClose()}
      title={kind ? t(`dialog_${kind}_title`) : ''}
      description={kind ? t(`dialog_${kind}_hint`) : undefined}
      testId="kpi-reason-dialog"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
          <Button
            onClick={() => onSubmit(reasonCode, note)}
            disabled={pending || !reasonCode}
            data-test-id="kpi-reason-submit"
          >
            {tCommon('save')}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <div className="mb-1 text-[var(--ms-text-muted)] text-sm">{t('reason_code')}</div>
          <NativeSelect
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            data-test-id="kpi-reason-select"
          >
            {codes.map((c) => (
              <option key={c.code} value={c.code}>
                {t(`reason_${c.code}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <div className="mb-1 text-[var(--ms-text-muted)] text-sm">{t('note')}</div>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
        </div>
      </div>
    </Modal>
  );
}

function AdjustDialog({
  metric,
  codes,
  locale,
  pending,
  onClose,
  onSubmit,
  t,
  tCommon,
}: {
  metric: KpiDayMetric | null;
  codes: KpiReasonCodeItem[];
  locale: string;
  pending: boolean;
  onClose: () => void;
  onSubmit: (value: string | null, reasonCode: string, note: string) => void;
  t: ReturnType<typeof useTranslations>;
  tCommon: ReturnType<typeof useTranslations>;
}) {
  const [value, setValue] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!metric) return;
    const current = metric.adjustValue ?? metric.autoValue;
    setValue(current == null ? '' : toDisplay(current, metric.unit));
    setReasonCode(metric.reasonCode ?? codes[0]?.code ?? '');
    setNote('');
  }, [metric, codes]);

  return (
    <Modal
      open={metric != null}
      onOpenChange={(v) => !v && onClose()}
      title={t('dialog_adjust_title')}
      description={metric ? metricLabel(metric, locale) : undefined}
      testId="kpi-adjust-dialog"
      footer={
        <div className="flex justify-between gap-2">
          {/* Tuzatmani olib tashlash = avtomat qiymatga qaytish. Bu «0 yozish»
              bilan bir narsa emas, shuning uchun alohida tugma. */}
          <Button
            variant="ghost"
            onClick={() => onSubmit(null, reasonCode, note)}
            disabled={pending || !metric?.adjusted}
            data-test-id="kpi-adjust-clear"
          >
            {t('adjust_clear')}
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              {tCommon('cancel')}
            </Button>
            <Button
              onClick={() => onSubmit(toStored(value, metric?.unit ?? 'count'), reasonCode, note)}
              disabled={pending || !reasonCode || value.trim() === ''}
              data-test-id="kpi-adjust-submit"
            >
              {tCommon('save')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="text-[var(--ms-text-muted)] text-xs">
          {t('adjust_auto_kept')}
          {metric?.autoValue != null
            ? `: ${formatValue(metric.autoValue, metric.unit, locale)}`
            : ''}
        </div>
        <div>
          <div className="mb-1 text-[var(--ms-text-muted)] text-sm">
            {t('adjust_value')} ({metric ? t(`unit_${metric.unit}`) : ''})
          </div>
          <Input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            data-test-id="kpi-adjust-value"
          />
        </div>
        <div>
          <div className="mb-1 text-[var(--ms-text-muted)] text-sm">{t('reason_code')}</div>
          <NativeSelect value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
            {codes.map((c) => (
              <option key={c.code} value={c.code}>
                {t(`reason_${c.code}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <div className="mb-1 text-[var(--ms-text-muted)] text-sm">{t('note')}</div>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </div>
      </div>
    </Modal>
  );
}

// ── Yordamchilar ────────────────────────────────────────────────────────────

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-1.5 rounded border border-current px-1 text-[10px] opacity-70">
      {children}
    </span>
  );
}

function metricLabel(m: { labelRu: string; labelUz: string }, locale: string): string {
  return locale === 'ru' ? m.labelRu : m.labelUz;
}

/** Saqlangan minor (tiyin/xom) → ko'rinish soni. */
function toDisplay(stored: string, unit: KpiUnit): string {
  return unit === 'money' ? String(Number(stored) / 100) : stored;
}

/** Ko'rinish → saqlanadigan BUTUN minor. Bo'sh = null (tuzatma yo'q). */
function toStored(display: string, unit: KpiUnit): string | null {
  const s = display.trim();
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return String(unit === 'money' ? Math.round(n * 100) : Math.round(n));
}

function formatValue(raw: string, unit: KpiUnit, locale: string): string {
  const n = unit === 'money' ? Number(raw) / 100 : Number(raw);
  if (!Number.isFinite(n)) return raw;
  return new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'uz-UZ', {
    maximumFractionDigits: unit === 'money' ? 0 : 2,
  }).format(n);
}

function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'uz-UZ', {
    day: '2-digit',
    month: '2-digit',
  });
}

function formatDateTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale === 'ru' ? 'ru-RU' : 'uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function scoreTone(score: number | null): StateTone {
  if (score == null) return 'neutral';
  if (score >= 100) return 'success';
  if (score >= 70) return 'warning';
  return 'destructive';
}

function achievementTone(percent: number): StateTone {
  if (percent >= 100) return 'success';
  if (percent >= 70) return 'warning';
  return 'destructive';
}
