'use client';

/**
 * Xarajat byudjeti — modda × oy, reja/fakt/og'ish (4M TZ §8 · MK12).
 *
 * SAVOL: «shu oyda qaysi moddada rejadan chiqib ketdik».
 *
 * 🔴 EKRAN SHARTNOMASI — **reja yo'q ≠ reja 0**. Reja qo'yilmagan qatorda
 * og'ish ham, foiz ham `—` bo'lib chiziladi; «0%» yoki «100%» yozilsa menejer
 * mavjud bo'lmagan xulosaga kelardi. Xuddi shu qoida moddasi ko'rsatilmagan
 * pulga ham tegishli: u alohida qatorda ko'rinadi, jimgina yo'qolmaydi.
 *
 * ⚠️ Ekran HECH NARSANI BLOKLAMAYDI va hech qanday xarajat hujjatiga tegmaydi
 * (TZ §8: «xarajat tasdiqlanmaydi — lekin ko'rinadi»). Yagona yozuv amali —
 * REJA.
 */

import { api } from '@/lib/api-client';
import {
  type BudgetReport,
  type BudgetReportRow,
  type BudgetStatus,
  expenseBudgetApi,
} from '@/lib/expense-budget-api';
import { Badge, Button, Input, NativeSelect, Skeleton, formatMoney } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface ExpenseItemRow {
  id: string;
  name: string;
  archived?: boolean;
}

/** Joriy oy «YYYY-MM» — Toshkent (UTC+05), server chegarasi bilan bir xil. */
function currentYearMonth(): string {
  return new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 7);
}

export function ExpenseBudgetScreen() {
  const t = useTranslations('pages.menejer');
  const qc = useQueryClient();
  const [yearMonth, setYearMonth] = useState(currentYearMonth);
  const [editing, setEditing] = useState<{ expenseItemId: string; value: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<BudgetReport>({
    queryKey: ['expense-budget', yearMonth],
    queryFn: () => expenseBudgetApi.report(yearMonth),
  });

  const { data: itemsRaw } = useQuery<{ items: ExpenseItemRow[] } | ExpenseItemRow[]>({
    queryKey: ['expense-items-budget'],
    queryFn: () => api.get('/expense-items?limit=200'),
  });
  // Ro'yxat endpointi ba'zi joyda `{items}`, ba'zida massiv qaytaradi.
  const allItems: ExpenseItemRow[] = Array.isArray(itemsRaw) ? itemsRaw : (itemsRaw?.items ?? []);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['expense-budget', yearMonth] });
  };

  const save = useMutation({
    mutationFn: (v: { expenseItemId: string; plannedMinor: string }) =>
      expenseBudgetApi.savePlan({ ...v, yearMonth }),
    onSuccess: () => {
      setEditing(null);
      setError(null);
      invalidate();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : t('eb_save_failed')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => expenseBudgetApi.deletePlan(id),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : t('eb_save_failed')),
  });

  const cur = data?.currency ?? 'UZS';
  /** Pul kataklarining yagona chizuvchisi — `null` doim `—`. */
  const money = (v: string | null) => (v === null ? '—' : formatMoney(v, cur));

  /** Rejasi hali yo'q moddalar — «reja qo'shish» ro'yxati uchun. */
  const planned = new Set((data?.rows ?? []).filter((r) => r.budgetId).map((r) => r.expenseItemId));
  const addable = allItems.filter((i) => !i.archived && !planned.has(i.id));

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-semibold text-[var(--ms-text-strong)] text-xl">{t('eb_title')}</h1>
          <p className="text-[var(--ms-text-muted)] text-sm">{t('eb_subtitle')}</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-[var(--ms-text-muted)]">{t('eb_month')}</span>
          <Input
            type="month"
            value={yearMonth}
            data-test-id="eb-month"
            onChange={(e) => setYearMonth(e.target.value || currentYearMonth())}
          />
        </label>
      </header>

      {isLoading || !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          {error && (
            <p className="text-[var(--ms-text-danger,#c00)] text-sm" data-test-id="eb-error">
              {error}
            </p>
          )}

          {/* ── Jamlar: FAQAT rejasi bor qatorlar bo'yicha ─────────────── */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              label={t('eb_total_plan')}
              value={money(data.totals.plannedMinor)}
              testId="eb-total-plan"
            />
            <Tile
              label={t('eb_total_actual')}
              value={money(data.totals.actualMinor)}
              testId="eb-total-actual"
            />
            <Tile
              label={t('eb_total_variance')}
              value={money(data.totals.varianceMinor)}
              testId="eb-total-variance"
              tone={data.totals.status === 'over' ? 'warning' : 'neutral'}
            />
            <Tile
              label={t('eb_total_used')}
              value={data.totals.usedPercent === null ? '—' : `${data.totals.usedPercent}%`}
              testId="eb-total-used"
              hint={t('eb_totals_hint')}
            />
          </div>

          {/* Rejadan tashqaridagi pul — jamda YO'Q, lekin yashirilmaydi. */}
          <p className="text-[var(--ms-text-muted)] text-xs" data-test-id="eb-outside">
            {t('eb_outside', {
              unplanned: formatMoney(data.unplannedActualMinor, cur),
              untagged: formatMoney(data.untaggedMinor, cur),
            })}
          </p>

          {data.unconvertedByCurrency.length > 0 && (
            <p className="text-[var(--ms-text-muted)] text-xs" data-test-id="eb-unconverted">
              {t('eb_unconverted')}:{' '}
              {data.unconvertedByCurrency
                .map((u) => formatMoney(u.amountMinor, u.currency))
                .join(' · ')}
            </p>
          )}

          {data.ambiguousNames.length > 0 && (
            <p className="text-[var(--ms-text-muted)] text-xs" data-test-id="eb-ambiguous">
              {t('eb_ambiguous')}: {data.ambiguousNames.join(', ')}
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--ms-text-muted)]">
                  <th className="py-1 pr-3 font-normal">{t('eb_col_item')}</th>
                  <th className="py-1 pr-3 text-right font-normal">{t('eb_col_plan')}</th>
                  <th className="py-1 pr-3 text-right font-normal">{t('eb_col_actual')}</th>
                  <th className="py-1 pr-3 text-right font-normal">{t('eb_col_variance')}</th>
                  <th className="py-1 pr-3 text-right font-normal">{t('eb_col_used')}</th>
                  <th className="py-1 font-normal">{t('eb_col_status')}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-3 text-[var(--ms-text-muted)]"
                      data-test-id="eb-empty"
                    >
                      {t('eb_empty')}
                    </td>
                  </tr>
                )}
                {data.rows.map((r) => (
                  <Row
                    key={r.expenseItemId ?? 'untagged'}
                    row={r}
                    currency={cur}
                    editing={editing?.expenseItemId === r.expenseItemId ? editing.value : null}
                    onEdit={(v) =>
                      r.expenseItemId && setEditing({ expenseItemId: r.expenseItemId, value: v })
                    }
                    onCancel={() => setEditing(null)}
                    onSave={(major) => {
                      if (!r.expenseItemId) return;
                      const minor = majorToMinor(major);
                      if (minor === null) {
                        setError(t('eb_invalid_amount'));
                        return;
                      }
                      save.mutate({ expenseItemId: r.expenseItemId, plannedMinor: minor });
                    }}
                    onRemove={() => r.budgetId && remove.mutate(r.budgetId)}
                    busy={save.isPending || remove.isPending}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {addable.length > 0 && (
            <AddPlan
              items={addable}
              busy={save.isPending}
              onAdd={(expenseItemId, major) => {
                const minor = majorToMinor(major);
                if (minor === null) {
                  setError(t('eb_invalid_amount'));
                  return;
                }
                save.mutate({ expenseItemId, plannedMinor: minor });
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

function Row({
  row,
  currency,
  editing,
  onEdit,
  onCancel,
  onSave,
  onRemove,
  busy,
}: {
  row: BudgetReportRow;
  currency: string;
  editing: string | null;
  onEdit: (value: string) => void;
  onCancel: () => void;
  onSave: (major: string) => void;
  onRemove: () => void;
  busy: boolean;
}) {
  const t = useTranslations('pages.menejer');
  const money = (v: string | null) => (v === null ? '—' : formatMoney(v, currency));
  const untagged = row.expenseItemId === null;

  return (
    <tr
      className="border-[var(--ms-border)] border-t"
      data-test-id={`eb-row-${row.expenseItemId ?? 'untagged'}`}
      data-status={row.status}
    >
      <td className="py-1 pr-3">
        {untagged ? (
          <span className="text-[var(--ms-text-muted)] italic">{t('eb_untagged')}</span>
        ) : (
          <>
            {row.name ?? '—'}
            {row.archived && (
              <span className="ml-2 text-[var(--ms-text-muted)] text-xs">{t('eb_archived')}</span>
            )}
          </>
        )}
      </td>
      <td className="py-1 pr-3 text-right">
        {editing !== null ? (
          <span className="flex items-center justify-end gap-1">
            <Input
              // Tahrirga bosilgach kursor shu yerda kutiladi (inline edit).
              autoFocus
              value={editing}
              inputMode="decimal"
              data-test-id={`eb-input-${row.expenseItemId}`}
              onChange={(e) => onEdit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSave(editing);
                if (e.key === 'Escape') onCancel();
              }}
              className="w-28 text-right"
            />
            <Button size="sm" disabled={busy} onClick={() => onSave(editing)}>
              {t('eb_save')}
            </Button>
          </span>
        ) : (
          <button
            type="button"
            disabled={untagged}
            data-test-id={`eb-plan-${row.expenseItemId ?? 'untagged'}`}
            onClick={() => onEdit(minorToMajor(row.plannedMinor))}
            className={
              untagged
                ? 'text-[var(--ms-text-muted)]'
                : 'underline hover:text-[var(--ms-text-brand)]'
            }
            title={row.planUnconvertible ? t('eb_plan_unconvertible') : undefined}
          >
            {row.planUnconvertible ? '—' : money(row.plannedMinor)}
          </button>
        )}
      </td>
      <td className="py-1 pr-3 text-right">{money(row.actualMinor)}</td>
      <td className="py-1 pr-3 text-right">{money(row.varianceMinor)}</td>
      <td className="py-1 pr-3 text-right">
        {row.usedPercent === null ? '—' : `${row.usedPercent}%`}
      </td>
      <td className="py-1">
        <StatusBadge status={row.status} />
        {row.budgetId && (
          <button
            type="button"
            disabled={busy}
            data-test-id={`eb-remove-${row.expenseItemId}`}
            onClick={onRemove}
            className="ml-2 text-[var(--ms-text-muted)] text-xs underline"
          >
            {t('eb_remove_plan')}
          </button>
        )}
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: BudgetStatus }) {
  const t = useTranslations('pages.menejer');
  const tone =
    status === 'over'
      ? 'destructive'
      : status === 'warning'
        ? 'warning'
        : status === 'within'
          ? 'success'
          : 'neutral';
  return (
    <Badge tone={tone} data-test-id={`eb-status-${status}`} data-status={status}>
      {t(`eb_status_${status}` as 'eb_status_within')}
    </Badge>
  );
}

function AddPlan({
  items,
  busy,
  onAdd,
}: {
  items: ExpenseItemRow[];
  busy: boolean;
  onAdd: (expenseItemId: string, major: string) => void;
}) {
  const t = useTranslations('pages.menejer');
  const [itemId, setItemId] = useState('');
  const [amount, setAmount] = useState('');

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-[var(--ms-border)] p-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--ms-text-muted)] text-xs">{t('eb_col_item')}</span>
        <NativeSelect
          value={itemId}
          data-test-id="eb-add-item"
          onChange={(e) => setItemId(e.target.value)}
        >
          <option value="">{t('eb_add_pick')}</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--ms-text-muted)] text-xs">{t('eb_col_plan')}</span>
        <Input
          value={amount}
          inputMode="decimal"
          data-test-id="eb-add-amount"
          onChange={(e) => setAmount(e.target.value)}
          className="w-36 text-right"
        />
      </label>
      <Button
        size="sm"
        disabled={busy || !itemId || !amount}
        data-test-id="eb-add-save"
        onClick={() => {
          onAdd(itemId, amount);
          setItemId('');
          setAmount('');
        }}
      >
        {t('eb_add')}
      </Button>
    </div>
  );
}

function Tile({
  label,
  value,
  testId,
  tone = 'neutral',
  hint,
}: {
  label: string;
  value: string;
  testId: string;
  tone?: 'neutral' | 'warning';
  hint?: string;
}) {
  return (
    <div
      data-test-id={testId}
      title={hint}
      className={`rounded-md border p-3 ${
        tone === 'warning'
          ? 'border-[var(--ms-border-warning,var(--ms-border))] bg-[var(--ms-bg-warning-subtle,transparent)]'
          : 'border-[var(--ms-border)]'
      }`}
    >
      <div className="text-[var(--ms-text-muted)] text-xs">{label}</div>
      <div className="font-semibold text-[var(--ms-text-strong)] text-lg">{value}</div>
    </div>
  );
}

/**
 * Tiyin → butun birlik (tahrir maydoni uchun). `null` reja bo'sh maydon
 * beradi — «0» EMAS, aks holda tahrirlash oynasi rejani jimgina nolga
 * aylantirib qo'yardi.
 */
export function minorToMajor(minor: string | null): string {
  if (minor === null) return '';
  const neg = minor.startsWith('-');
  const digits = (neg ? minor.slice(1) : minor).padStart(3, '0');
  const whole = digits.slice(0, -2);
  const frac = digits.slice(-2);
  return `${neg ? '-' : ''}${whole}${frac === '00' ? '' : `.${frac}`}`;
}

/**
 * Kiritilgan summa → tiyin (satr, BigInt aniqligida). Yaroqsiz kiritmada
 * `null` — chaqiruvchi xato ko'rsatadi. `Number` ishlatilmaydi: katta summa
 * float'da jimgina yumaloqlanardi.
 */
export function majorToMinor(major: string): string | null {
  const clean = major.replace(/\s/g, '').replace(',', '.');
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(clean);
  if (!m) return null;
  const frac = (m[2] ?? '').padEnd(2, '0');
  return `${BigInt(m[1] ?? '0') * 100n + BigInt(frac)}`;
}
