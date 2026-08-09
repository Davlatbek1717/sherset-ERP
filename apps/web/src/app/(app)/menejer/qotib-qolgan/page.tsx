'use client';

import { api } from '@/lib/api-client';
import { workItemSeverityTone } from '@/lib/domain-status-tone';
import { Badge, Button, Card, NativeSelect, Spinner, formatDate, formatMoney } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { stuckDocHref, stuckDuration } from '../_components/stuck-doc-link';

/** BE `stuck-sla.ts` dagi `SLA_STAGE` bilan mos. */
type SlaStage =
  | 'ORDER_PICKING'
  | 'SUPPLY_ACCEPTANCE'
  | 'CLAIM_RESPONSE'
  | 'SHIFT_CLOSE'
  | 'DOC_APPROVAL';

interface StageSummary {
  stage: SlaStage;
  ruleType: string;
  enabled: boolean;
  thresholdHours: number;
  thresholdUnit: string;
  thresholdRejected: boolean;
  severity: string;
  /** Bosqichdagi BARCHA ochiq ob'ekt (SLA ichidagilar ham). */
  total: number;
  overdue: number;
  /** `null` = oshgani YO'Q (0 EMAS). */
  worstOverdueHours: number | null;
  blocks: boolean;
}

interface StuckRow {
  stage: SlaStage;
  refId: string;
  docType: string;
  docName: string;
  stateKey: string;
  employeeId: string | null;
  employeeName: string | null;
  since: string;
  ageHours: number;
  thresholdHours: number;
  overdueHours: number;
  severity: string;
  /** Tiyin, satr. `null` = O'LCHANMADI (0 EMAS). */
  amountMinor: string | null;
  currency: string | null;
}

interface BoardResponse {
  now: string;
  overdueCount: number;
  truncated: boolean;
  sourceTruncated: boolean;
  sourceCap: number;
  stages: StageSummary[];
  rows: StuckRow[];
}

/**
 * «NIMA QOTIB QOLGAN» + SLA paneli (MK10 / 4M TZ §8).
 *
 * Savolga javob beradi: «jarayonning qaysi bosqichida ish turib qoldi va
 * qancha vaqtdan beri». Bu menejer navbatidan boshqa savol — navbat bo'lib
 * o'tgan qoida buzilishlarini yig'adi, bu ekran esa HALI BO'LMAGAN ishni
 * ko'rsatadi.
 *
 * 🔴 Panel HECH NARSANI BLOKLAMAYDI (§5.1) — SLA oshgani hujjatni
 * to'xtatmaydi. Shu sabab ekranda doimiy izoh turadi.
 */
export default function MenejerQotibQolganPage() {
  const t = useTranslations('pages.managerSla');
  const qc = useQueryClient();

  const [stageFilter, setStageFilter] = useState<string>('');
  const [editing, setEditing] = useState<SlaStage | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [draftUnit, setDraftUnit] = useState<'hours' | 'days'>('hours');

  const { data, isLoading } = useQuery<BoardResponse>({
    queryKey: ['manager-sla'],
    queryFn: () => api.get<BoardResponse>('/manager/sla'),
  });

  const save = useMutation({
    mutationFn: (v: { stage: SlaStage; body: Record<string, unknown> }) =>
      api.put(`/manager/sla/stages/${v.stage}`, v.body),
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['manager-sla'] });
    },
  });

  const stages = data?.stages ?? [];
  const rows = (data?.rows ?? []).filter((r) => !stageFilter || r.stage === stageFilter);
  const misconfigured = stages.filter((s) => s.thresholdRejected);

  /** «3 kun» / «5 soat» — menejer raqamni emas, davomiylikni o'qiydi. */
  const dur = (hours: number) => {
    const d = stuckDuration(hours);
    return d.unit === 'days'
      ? t('days_short', { days: d.value })
      : t('hours_short', { hours: d.value });
  };

  const openEditor = (s: StageSummary) => {
    setEditing(s.stage);
    setDraftValue(String(s.thresholdHours));
    setDraftUnit('hours');
  };

  return (
    <div className="p-4" data-test-id="manager-sla-page">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-semibold text-[var(--ms-text-primary)] text-lg">
          {t('title')}
          {(data?.overdueCount ?? 0) > 0 && (
            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700 text-xs">
              {data?.overdueCount}
            </span>
          )}
        </h1>

        <NativeSelect
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="w-64"
          aria-label={t('filter_stage')}
          data-test-id="manager-sla-stage-filter"
        >
          <option value="">{t('filter_stage_all')}</option>
          {stages.map((s) => (
            <option key={s.stage} value={s.stage}>
              {t(`stage_${s.stage}`)}
            </option>
          ))}
        </NativeSelect>
      </div>

      {/* 🔴 Doimiy izoh: nazorat to'xtatmaydi (§5.1). */}
      <p className="mb-3 text-[var(--ms-text-muted)] text-xs">{t('hint')}</p>

      {misconfigured.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 text-xs">
          {t('threshold_rejected', {
            stages: misconfigured.map((s) => t(`stage_${s.stage}`)).join(', '),
          })}
        </div>
      )}

      {data?.sourceTruncated && (
        <div
          className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 text-xs"
          data-test-id="manager-sla-source-truncated"
        >
          {t('source_truncated', { cap: data.sourceCap })}
        </div>
      )}

      {/* ── Bosqichlar: chegara + sanoq + sozlash ─────────────────────────── */}
      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {stages.map((s) => (
          <Card key={s.stage} className="p-3" data-test-id={`manager-sla-stage-${s.stage}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-[var(--ms-text-primary)] text-sm">
                  {t(`stage_${s.stage}`)}
                </p>
                <p className="mt-0.5 text-[var(--ms-text-muted)] text-xs">
                  {t('threshold_is', { value: dur(s.thresholdHours) })}
                </p>
              </div>
              {!s.enabled && <Badge tone="neutral">{t('stage_off')}</Badge>}
            </div>

            <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
              <span className="text-[var(--ms-text-muted)]">
                {t('col_total')}: <b className="text-[var(--ms-text-primary)]">{s.total}</b>
              </span>
              <span className={s.overdue > 0 ? 'text-red-700' : 'text-[var(--ms-text-muted)]'}>
                {t('col_overdue')}: <b>{s.overdue}</b>
              </span>
              <span className="text-[var(--ms-text-muted)]">
                {t('col_worst')}:{' '}
                <b className="text-[var(--ms-text-primary)]">
                  {/* `null` = oshgani YO'Q. «0 soat» yozish yolg'on bo'lardi. */}
                  {s.worstOverdueHours == null ? t('no_overdue') : dur(s.worstOverdueHours)}
                </b>
              </span>
            </div>

            {editing === s.stage ? (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[var(--ms-text-muted)] text-xs">
                    {t('threshold_label')}
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={draftValue}
                    onChange={(e) => setDraftValue(e.target.value)}
                    className="h-8 w-24 rounded-md border border-[var(--ms-border)] px-2 text-sm"
                    data-test-id={`manager-sla-threshold-${s.stage}`}
                  />
                </label>
                <NativeSelect
                  value={draftUnit}
                  onChange={(e) => setDraftUnit(e.target.value === 'days' ? 'days' : 'hours')}
                  className="w-28"
                  aria-label={t('threshold_unit')}
                >
                  <option value="hours">{t('unit_hours')}</option>
                  <option value="days">{t('unit_days')}</option>
                </NativeSelect>
                <Button
                  size="sm"
                  disabled={save.isPending || !draftValue || Number(draftValue) <= 0}
                  onClick={() =>
                    save.mutate({
                      stage: s.stage,
                      // Birlik qiymatdan AJRALMAYDI — ikkalasi birga yuboriladi.
                      body: { thresholdValue: Number(draftValue), thresholdUnit: draftUnit },
                    })
                  }
                  data-test-id={`manager-sla-save-${s.stage}`}
                >
                  {t('save')}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>
                  {t('cancel')}
                </Button>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => openEditor(s)}>
                  {t('edit_threshold')}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={save.isPending}
                  onClick={() => save.mutate({ stage: s.stage, body: { enabled: !s.enabled } })}
                  data-test-id={`manager-sla-toggle-${s.stage}`}
                >
                  {s.enabled ? t('turn_off') : t('turn_on')}
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>

      {isLoading && <Spinner />}

      {!isLoading && rows.length === 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-center">
          <p className="font-medium text-emerald-800 text-sm">{t('empty_title')}</p>
          <p className="mt-1 text-emerald-700 text-xs">{t('empty_hint')}</p>
        </div>
      )}

      {data?.truncated && rows.length > 0 && (
        <p className="mb-2 text-[var(--ms-text-muted)] text-xs">
          {t('rows_truncated', { shown: data.rows.length, total: data.overdueCount })}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {rows.map((row) => {
          const href = stuckDocHref(row.docType, row.refId);
          return (
            <div
              key={`${row.stage}:${row.refId}`}
              data-test-id={`manager-sla-row-${row.refId}`}
              className="rounded-xl border border-[var(--ms-border)] p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={workItemSeverityTone(row.severity)}>
                      {t(`severity_${row.severity}`)}
                    </Badge>
                    <span className="text-[var(--ms-text-muted)] text-xs">
                      {t(`stage_${row.stage}`)}
                    </span>
                    <span className="font-medium text-[var(--ms-text-primary)] text-sm">
                      {row.docName}
                    </span>
                    <Badge tone="neutral">{t(`state_${row.stateKey}`)}</Badge>
                  </div>

                  <div className="mt-1 text-[var(--ms-text-muted)] text-xs">
                    {/* «Kim · qancha · qachondan beri · qancha oshdi». */}
                    {row.employeeName ?? t('no_subject')}
                    {' · '}
                    {row.amountMinor != null
                      ? formatMoney(BigInt(row.amountMinor), row.currency ?? undefined)
                      : t('amount_unmeasured')}
                    {' · '}
                    {formatDate(row.since)}
                  </div>

                  <p className="mt-1 text-red-700 text-xs">
                    {t('overdue_by', {
                      age: dur(row.ageHours),
                      threshold: dur(row.thresholdHours),
                      over: dur(row.overdueHours),
                    })}
                  </p>
                </div>

                {href && (
                  <a
                    href={href}
                    className="whitespace-nowrap text-[var(--ms-brand)] text-xs hover:underline"
                  >
                    {t('open_doc')} →
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
