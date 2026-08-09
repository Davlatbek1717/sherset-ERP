'use client';

/**
 * Sotuv rejasi — xodim × oy × plan turi (MK37 · 2-bo'lim TZ §4.8, 4-bo'lim §6).
 *
 * SAVOL: «kim rejasini bajaryapti, kim orqada qolyapti va shu sur'atda oy
 * qanday yopiladi».
 *
 * 🔴 EKRAN SHARTNOMASI — uchta boshqa javob bir xil ko'rinmaydi:
 *   • **reja qo'yilmagan** → `—` va «reja qo'yilmagan» yorlig'i (0% EMAS);
 *   • **fakt o'lchanmagan** → `—` (xodim «hech narsa qilmagan» degani EMAS);
 *   • **o'lchangan nol** → `0`.
 * Bu loyihadagi NULL ≠ 0 naqshining davomi (`expense-budget-screen` bilan bir
 * xil qoida).
 *
 * ⚠️ Ekran hech narsani bloklamaydi va hech qanday hujjatga tegmaydi. Yagona
 * yozuv amali — REJA.
 */

import {
  type PlanStatus,
  type SalesPlanCell,
  type SalesPlanReport,
  type SalesPlanType,
  salesPlanApi,
} from '@/lib/sales-plan-api';
import { Badge, Button, Input, NativeSelect, Skeleton, formatMoney } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { majorToMinor, minorToMajor } from './expense-budget-screen';

/** Joriy oy «YYYY-MM» — Toshkent (UTC+05), server chegarasi bilan bir xil. */
function currentYearMonth(): string {
  return new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 7);
}

export function SalesPlanScreen() {
  const t = useTranslations('pages.menejer');
  const qc = useQueryClient();
  const [yearMonth, setYearMonth] = useState(currentYearMonth);
  const [planType, setPlanType] = useState<SalesPlanType>('revenue');
  const [editing, setEditing] = useState<{ employeeId: string; value: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<SalesPlanReport>({
    queryKey: ['sales-plan', yearMonth],
    // `includeEmpty` — reja QO'SHISH uchun hamma xodim ko'rinishi kerak.
    queryFn: () => salesPlanApi.report(yearMonth, true),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['sales-plan', yearMonth] });
  };

  const save = useMutation({
    mutationFn: (v: { employeeId: string; targetValue: string }) =>
      salesPlanApi.savePlan({ ...v, yearMonth, planType }),
    onSuccess: () => {
      setEditing(null);
      setError(null);
      invalidate();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : t('sp_save_failed')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => salesPlanApi.deletePlan(id),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : t('sp_save_failed')),
  });

  const currency = data?.currency ?? 'UZS';
  const activeType = data?.types.find((x) => x.planType === planType);
  const isMoney = activeType?.unit !== 'count';

  /** Qiymat chizuvchisi — `null` DOIM `—` (o'lchanmagan ≠ nol). */
  const value = (raw: string | null) => {
    if (raw === null) return '—';
    return isMoney
      ? formatMoney(raw, currency)
      : new Intl.NumberFormat('ru-RU').format(Number(raw));
  };

  const cellOf = (cells: SalesPlanCell[]) => cells.find((c) => c.planType === planType);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-semibold text-[var(--ms-text-strong)] text-xl">{t('sp_title')}</h1>
          <p className="text-[var(--ms-text-muted)] text-sm">{t('sp_subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-[var(--ms-text-muted)]">{t('sp_type')}</span>
            <NativeSelect
              value={planType}
              data-test-id="sp-type"
              onChange={(e) => {
                setPlanType(e.target.value as SalesPlanType);
                setEditing(null);
              }}
            >
              {(data?.types ?? []).map((x) => (
                <option key={x.planType} value={x.planType}>
                  {t(`sp_type_${x.planType}` as 'sp_type_revenue')}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-[var(--ms-text-muted)]">{t('sp_month')}</span>
            <Input
              type="month"
              value={yearMonth}
              data-test-id="sp-month"
              onChange={(e) => setYearMonth(e.target.value || currentYearMonth())}
            />
          </label>
        </div>
      </header>

      {isLoading || !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          {error && (
            <p className="text-[var(--ms-text-danger,#c00)] text-sm" data-test-id="sp-error">
              {error}
            </p>
          )}

          {/* Manbasi yo'q tur — cheklov YASHIRILMAYDI (`kpi-metrics` dagi
              `manual` naqshi): menejer raqam o'zi paydo bo'lishini kutmasin. */}
          {activeType?.factSource === 'none' && (
            <p
              className="rounded-md border border-[var(--ms-border)] p-2 text-[var(--ms-text-muted)] text-xs"
              data-test-id="sp-manual-note"
            >
              {t('sp_manual_note')}
            </p>
          )}

          <p className="text-[var(--ms-text-muted)] text-xs" data-test-id="sp-pace">
            {t('sp_pace_hint', { elapsed: data.elapsedDays, total: data.totalDays })}
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--ms-text-muted)]">
                  <th className="py-1 pr-3 font-normal">{t('sp_col_employee')}</th>
                  <th className="py-1 pr-3 text-right font-normal">{t('sp_col_plan')}</th>
                  <th className="py-1 pr-3 text-right font-normal">{t('sp_col_fact')}</th>
                  <th className="py-1 pr-3 text-right font-normal">{t('sp_col_achieved')}</th>
                  <th className="py-1 pr-3 text-right font-normal">{t('sp_col_expected')}</th>
                  <th className="py-1 pr-3 text-right font-normal">{t('sp_col_projected')}</th>
                  <th className="py-1 font-normal">{t('sp_col_status')}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-3 text-[var(--ms-text-muted)]"
                      data-test-id="sp-empty"
                    >
                      {t('sp_empty')}
                    </td>
                  </tr>
                )}
                {data.rows.map((row) => {
                  const cell = cellOf(row.cells);
                  if (!cell) return null;
                  const isEditing = editing?.employeeId === row.employeeId;
                  return (
                    <tr
                      key={row.employeeId}
                      className="border-[var(--ms-border)] border-t"
                      data-test-id={`sp-row-${row.employeeId}`}
                      data-status={cell.status}
                    >
                      <td className="py-1 pr-3">
                        {row.name}
                        {/* Reja eski hisob-sozlamasidan kelgan bo'lsa buni
                            aytish shart: menejer «men bunday reja qo'ymagan
                            edim» degan savolga javob shu yerda. */}
                        {cell.targetSource === 'salary_config' && (
                          <span className="ml-2 text-[var(--ms-text-muted)] text-xs">
                            {t('sp_from_salary_config')}
                          </span>
                        )}
                      </td>
                      <td className="py-1 pr-3 text-right">
                        {isEditing ? (
                          <span className="flex items-center justify-end gap-1">
                            <Input
                              autoFocus
                              value={editing.value}
                              inputMode="decimal"
                              data-test-id={`sp-input-${row.employeeId}`}
                              onChange={(e) =>
                                setEditing({ employeeId: row.employeeId, value: e.target.value })
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') submit(row.employeeId, editing.value);
                                if (e.key === 'Escape') setEditing(null);
                              }}
                              className="w-28 text-right"
                            />
                            <Button
                              size="sm"
                              disabled={save.isPending}
                              onClick={() => submit(row.employeeId, editing.value)}
                            >
                              {t('sp_save')}
                            </Button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            data-test-id={`sp-plan-${row.employeeId}`}
                            onClick={() =>
                              setEditing({
                                employeeId: row.employeeId,
                                value: toInput(cell.targetValue, isMoney),
                              })
                            }
                            className="underline hover:text-[var(--ms-text-brand)]"
                            title={cell.comparable ? undefined : t('sp_not_comparable')}
                          >
                            {value(cell.targetValue)}
                            {!cell.comparable && cell.currency ? ` ${cell.currency}` : ''}
                          </button>
                        )}
                      </td>
                      <td className="py-1 pr-3 text-right">
                        {value(cell.factValue)}
                        {/* Chala ma'lumot bayrog'i — raqam ostidagi ishonch
                            darajasi menejerga KO'RINADI. */}
                        {cell.factValue !== null && !cell.factComplete && (
                          <span className="ml-1 text-[var(--ms-text-warning,#a60)] text-xs">
                            {t('sp_partial')}
                          </span>
                        )}
                      </td>
                      <td className="py-1 pr-3 text-right">
                        {cell.achievedPercent === null ? '—' : `${cell.achievedPercent}%`}
                      </td>
                      <td className="py-1 pr-3 text-right text-[var(--ms-text-muted)]">
                        {cell.expectedPercent === null ? '—' : `${cell.expectedPercent}%`}
                      </td>
                      <td className="py-1 pr-3 text-right">
                        {cell.projectedPercent === null ? '—' : `${cell.projectedPercent}%`}
                      </td>
                      <td className="py-1">
                        <StatusBadge status={cell.status} />
                        {cell.planId && (
                          <button
                            type="button"
                            disabled={remove.isPending}
                            data-test-id={`sp-remove-${row.employeeId}`}
                            onClick={() => cell.planId && remove.mutate(cell.planId)}
                            className="ml-2 text-[var(--ms-text-muted)] text-xs underline"
                          >
                            {t('sp_remove_plan')}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );

  function submit(employeeId: string, raw: string) {
    const parsed = isMoney ? majorToMinor(raw) : parseCount(raw);
    if (parsed === null) {
      setError(t('sp_invalid_amount'));
      return;
    }
    save.mutate({ employeeId, targetValue: parsed });
  }
}

function StatusBadge({ status }: { status: PlanStatus }) {
  const t = useTranslations('pages.menejer');
  const tone =
    status === 'done'
      ? 'success'
      : status === 'behind'
        ? 'destructive'
        : status === 'on_track'
          ? 'info'
          : 'neutral';
  return (
    <Badge tone={tone} data-test-id={`sp-status-${status}`} data-status={status}>
      {t(`sp_status_${status}` as 'sp_status_done')}
    </Badge>
  );
}

/**
 * Tahrir maydonining boshlang'ich qiymati. Reja YO'Q bo'lsa maydon BO'SH
 * qoladi — «0» yozilsa, tahrirni bekor qilgan menejer rejani jimgina nolga
 * aylantirib qo'yardi (u butunlay boshqa javob).
 */
function toInput(raw: string | null, isMoney: boolean): string {
  if (raw === null) return '';
  return isMoney ? minorToMajor(raw) : raw;
}

/** Sanoq kiritmasi — butun son. Yaroqsizda `null` (chaqiruvchi xato ko'rsatadi). */
function parseCount(raw: string): string | null {
  const clean = raw.replace(/\s/g, '');
  return /^\d+$/.test(clean) ? clean : null;
}
