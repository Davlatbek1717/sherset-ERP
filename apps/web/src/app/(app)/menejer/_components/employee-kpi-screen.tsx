'use client';

/**
 * Biriktirilgan KPI — «todo kabi» ekranlar (KPI-04).
 *
 * MUAMMO (egasining shikoyati): xodimga KPI biriktirish butun katalog
 * jadvalini ochib, og'irliklarni **100% ga yig'ishni** talab qilardi — bitta
 * KPI qo'shish qolganini qayta muvozanatlashga majbur qilardi. Bu «todo» ning
 * aksi edi.
 *
 * YECHIM: bir bosishda **metrika + maqsad + davr**. Og'irlik —
 * «▾ Kengaytirilgan» ostida, IXTIYORIY.
 *
 * ## 🔴 Ekran shartnomalari
 * 1. **Og'irliksiz KPI** — `weight = null`: o'lchanadi/kuzatiladi, lekin oylik
 *    ballga kirmaydi. Bu 0 EMAS (0 = «ballandi va nolga arziydi»).
 * 2. **Uch holat uch xil chiziladi**: fakt `null` → `—` («o'lchanmagan»),
 *    `0` → `0`, qiymat → o'zi ([[data-quality-flag-layer]]). Ikkitasi bir xil
 *    ko'rinsa menejer mavjud bo'lmagan xulosaga kelardi.
 * 3. **«Bajarildi» faqat qo'lda metrikada** (`measurable: false`). Tizim
 *    hisoblaydigan metrikada tugma UMUMAN chizilmaydi: fakt dvigateldan
 *    keladi, ikki manba = ikki haqiqat.
 * 4. **Pul so'mda kiritiladi va SO'MDA yuboriladi** — tiyinga o'girishni
 *    server qiladi. FE ikkinchi marta o'girsa summa 100× ketardi
 *    ([[manager-kpi-unit-vocabularies]]).
 *
 * Versiya raqami UI'dan olib tashlandi — bu qatlam versiyalanmaydi; tarix
 * butunligini kunlik snapshot ta'minlaydi (KPI-03).
 */

import {
  type CreateEmployeeKpiTargetInput,
  type EmployeeKpiTarget,
  type KpiMetricDef,
  type KpiTargetPeriod,
  type KpiUnit,
  employeeKpiTargetApi,
  managerKpiApi,
} from '@/lib/manager-api';
import { Badge, Button, Input, NativeSelect, Skeleton, formatMoney } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

const PERIODS: readonly KpiTargetPeriod[] = ['daily', 'weekly', 'monthly'] as const;

/**
 * Minor (tiyin) → tahrir maydonining ko'rinish qiymati.
 * `null` **bo'sh maydon** beradi, «0» EMAS: aks holda tahrirlash raqamsiz
 * maqsadni jimgina nolga aylantirib qo'yardi.
 */
function minorToInput(unit: KpiUnit, minor: string | null): string {
  if (minor === null) return '';
  if (unit !== 'money') return minor;
  const neg = minor.startsWith('-');
  const digits = (neg ? minor.slice(1) : minor).padStart(3, '0');
  const frac = digits.slice(-2);
  return `${neg ? '-' : ''}${digits.slice(0, -2)}${frac === '00' ? '' : `.${frac}`}`;
}

/**
 * Kiritilgan matnni server kutgan shaklga keltiradi (probel/vergul tozalash).
 *
 * ⚠️ Bu **o'girish EMAS** — so'm so'mligicha qoladi. Yagona minor-o'girish
 * nuqtasi server (`EmployeeKpiTargetService`).
 */
function normalizeAmountInput(raw: string): string | null {
  const clean = raw.replace(/\s/g, '').replace(',', '.');
  if (clean === '') return null;
  return /^\d+(\.\d{1,2})?$/.test(clean) ? clean : null;
}

/** Minor qiymatni ko'rsatish. `null` DOIM `—` — «o'lchanmagan» ≠ nol. */
function showValue(unit: KpiUnit, minor: string | null, currency: string | null): string {
  if (minor === null) return '—';
  if (unit === 'money') return formatMoney(minor, currency ?? 'UZS');
  return new Intl.NumberFormat('ru-RU').format(Number(minor));
}

function useKpiText() {
  const t = useTranslations('pages.menejer');
  const locale = useLocale();
  const label = (r: { labelUz: string; labelRu: string }) =>
    locale === 'ru' ? r.labelRu || r.labelUz : r.labelUz;
  return { t, label };
}

// ── Bitta xodimning «todo» ro'yxati ─────────────────────────────────────────

export function EmployeeKpiTodoList({ employeeId }: { employeeId: string }) {
  const { t, label } = useKpiText();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: rows, isLoading } = useQuery<EmployeeKpiTarget[]>({
    queryKey: ['ekpi-targets', employeeId],
    queryFn: () => employeeKpiTargetApi.list(employeeId),
    enabled: !!employeeId,
  });

  const { data: metrics } = useQuery<KpiMetricDef[]>({
    queryKey: ['kpi-metrics'],
    queryFn: () => managerKpiApi.metrics(),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['ekpi-targets', employeeId] });
    void qc.invalidateQueries({ queryKey: ['ekpi-all'] });
  };
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : t('ekpi_save_failed'));

  const create = useMutation({
    mutationFn: (data: CreateEmployeeKpiTargetInput) =>
      employeeKpiTargetApi.create(employeeId, data),
    onSuccess: () => {
      setAdding(false);
      setError(null);
      invalidate();
    },
    onError: fail,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[var(--ms-text-muted)] text-sm">{t('ekpi_hint')}</p>
        {!adding && (
          <Button variant="secondary" data-test-id="ekpi-add-open" onClick={() => setAdding(true)}>
            + {t('ekpi_add')}
          </Button>
        )}
      </div>

      {error && (
        <p className="text-[var(--ms-text-danger)] text-sm" data-test-id="ekpi-error">
          {error}
        </p>
      )}

      {adding && (
        <TargetForm
          mode="add"
          metrics={(metrics ?? []).filter((m) => !(rows ?? []).some((r) => r.metricKey === m.key))}
          busy={create.isPending}
          onCancel={() => setAdding(false)}
          onSubmit={(v) => {
            if (!v.metricKey) return;
            create.mutate({
              metricKey: v.metricKey,
              period: v.period,
              ...(v.targetValue === null ? {} : { targetValue: v.targetValue }),
              ...(v.weight === null ? {} : { weight: v.weight }),
            });
          }}
          onInvalid={() => setError(t('ekpi_invalid_amount'))}
        />
      )}

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (rows ?? []).length === 0 ? (
        <p
          className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] border-dashed p-4 text-[var(--ms-text-muted)] text-sm"
          data-test-id="ekpi-empty"
        >
          {t('ekpi_empty')}
        </p>
      ) : (
        <ul className="space-y-2">
          {(rows ?? []).map((r) => (
            <TargetRow
              key={r.id}
              row={r}
              label={label(r)}
              editing={editingId === r.id}
              onEdit={() => setEditingId(r.id)}
              onEditClose={() => setEditingId(null)}
              onError={fail}
              onInvalid={() => setError(t('ekpi_invalid_amount'))}
              onDone={invalidate}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Menejer: barcha xodimlar ────────────────────────────────────────────────

export function EmployeeKpiScreen() {
  const { t, label } = useKpiText();
  const [period, setPeriod] = useState<KpiTargetPeriod | ''>('');
  const [employeeId, setEmployeeId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: rows, isLoading } = useQuery<EmployeeKpiTarget[]>({
    queryKey: ['ekpi-all', period, employeeId],
    queryFn: () =>
      employeeKpiTargetApi.listAll({
        ...(period ? { period } : {}),
        ...(employeeId ? { employeeId } : {}),
      }),
  });

  /**
   * Filtr variantlari **birinchi to'liq yuklamadan** olinadi. Joriy natijadan
   * olinsa, filtr bo'sh natija bergan zahoti tanlangan xodim ro'yxatdan
   * yo'qolib, foydalanuvchi filtrni ORQAGA qaytara olmasdi.
   */
  const { data: allRows } = useQuery<EmployeeKpiTarget[]>({
    queryKey: ['ekpi-all', '', ''],
    queryFn: () => employeeKpiTargetApi.listAll({}),
  });

  const employees = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of allRows ?? []) map.set(r.employeeId, r.employeeName ?? r.employeeId);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [allRows]);

  const groups = useMemo(() => {
    const map = new Map<string, { name: string; items: EmployeeKpiTarget[] }>();
    for (const r of rows ?? []) {
      const g = map.get(r.employeeId) ?? { name: r.employeeName ?? r.employeeId, items: [] };
      g.items.push(r);
      map.set(r.employeeId, g);
    }
    return [...map.entries()];
  }, [rows]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['ekpi-all'] });
    void qc.invalidateQueries({ queryKey: ['ekpi-targets'] });
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-semibold text-[var(--ms-text-strong)] text-xl">{t('ekpi_title')}</h1>
          <p className="text-[var(--ms-text-muted)] text-sm">{t('ekpi_subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-[var(--ms-text-muted)]">{t('ekpi_filter_employee')}</span>
            <NativeSelect
              value={employeeId}
              data-test-id="ekpi-filter-employee"
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">{t('ekpi_filter_all')}</option>
              {employees.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-[var(--ms-text-muted)]">{t('ekpi_period')}</span>
            <NativeSelect
              value={period}
              data-test-id="ekpi-filter-period"
              onChange={(e) => setPeriod(e.target.value as KpiTargetPeriod | '')}
            >
              <option value="">{t('ekpi_filter_all')}</option>
              {PERIODS.map((p) => (
                <option key={p} value={p}>
                  {t(`ekpi_period_${p}` as 'ekpi_period_daily')}
                </option>
              ))}
            </NativeSelect>
          </label>
        </div>
      </header>

      {error && (
        <p className="text-[var(--ms-text-danger)] text-sm" data-test-id="ekpi-error">
          {error}
        </p>
      )}

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : groups.length === 0 ? (
        <p
          className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] border-dashed p-6 text-center text-[var(--ms-text-muted)] text-sm"
          data-test-id="ekpi-all-empty"
        >
          {t('ekpi_all_empty')}
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map(([id, g]) => (
            <section
              key={id}
              data-test-id={`ekpi-emp-${id}`}
              className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-3"
            >
              <h2 className="mb-2 font-semibold text-[var(--ms-text-strong)] text-sm">{g.name}</h2>
              <ul className="space-y-2">
                {g.items.map((r) => (
                  <TargetRow
                    key={r.id}
                    row={r}
                    label={label(r)}
                    editing={editingId === r.id}
                    onEdit={() => setEditingId(r.id)}
                    onEditClose={() => setEditingId(null)}
                    onError={(e) =>
                      setError(e instanceof Error ? e.message : t('ekpi_save_failed'))
                    }
                    onInvalid={() => setError(t('ekpi_invalid_amount'))}
                    onDone={invalidate}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Qatorlar va shakl ───────────────────────────────────────────────────────

function TargetRow({
  row,
  label,
  editing,
  onEdit,
  onEditClose,
  onError,
  onInvalid,
  onDone,
}: {
  row: EmployeeKpiTarget;
  label: string;
  editing: boolean;
  onEdit: () => void;
  onEditClose: () => void;
  onError: (e: unknown) => void;
  onInvalid: () => void;
  onDone: () => void;
}) {
  const { t } = useKpiText();
  const qc = useQueryClient();

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['ekpi-targets'] });
    void qc.invalidateQueries({ queryKey: ['ekpi-all'] });
    onDone();
  };

  const update = useMutation({
    mutationFn: (data: Parameters<typeof employeeKpiTargetApi.update>[1]) =>
      employeeKpiTargetApi.update(row.id, data),
    onSuccess: () => {
      onEditClose();
      refresh();
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: () => employeeKpiTargetApi.remove(row.id),
    onSuccess: refresh,
    onError,
  });

  const done = useMutation({
    mutationFn: (next: boolean) => employeeKpiTargetApi.setDone(row.id, next),
    onSuccess: refresh,
    onError,
  });

  const isDone = row.manualDoneAt !== null;
  const busy = update.isPending || remove.isPending || done.isPending;

  return (
    <li
      data-test-id={`ekpi-row-${row.id}`}
      // Uch bayroq DOM'da: ekran ularni matn bilan ham ko'rsatadi, lekin
      // test va QA aynan shu atributlardan o'qiydi (matn tarjimaga bog'liq).
      data-scored={row.weight !== null ? 'true' : 'false'}
      data-fact-complete={row.lastFactComplete === null ? 'none' : String(row.lastFactComplete)}
      data-manual={row.measurable ? 'false' : 'true'}
      className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="text-[var(--ms-text-primary)] text-sm">{label}</span>
          <Badge tone="neutral">{t(`ekpi_period_${row.period}` as 'ekpi_period_daily')}</Badge>
          {!row.measurable && (
            // «Qo'lda» — tizim bu raqamni hisoblay olmaydi. Yashirish yolg'on
            // va'da bo'lardi (menejer raqam o'zi paydo bo'lishini kutardi).
            <Badge tone="warning">{t('ekpi_manual')}</Badge>
          )}
          {row.weight === null ? (
            <Badge tone="neutral">{t('ekpi_unscored')}</Badge>
          ) : (
            <Badge tone="brand">
              {t('ekpi_weight')}: {row.weight}
            </Badge>
          )}
          {!row.active && <Badge tone="neutral">{t('ekpi_archived')}</Badge>}
        </div>

        <div className="flex items-center gap-3 text-sm">
          <span className="text-[var(--ms-text-muted)]">
            {t('ekpi_target')}:{' '}
            <span data-test-id={`ekpi-target-${row.id}`} className="tabular-nums">
              {showValue(row.unit, row.targetMinor, row.currency)}
            </span>
          </span>
          <span className="text-[var(--ms-text-muted)]">
            {t('ekpi_fact')}:{' '}
            <span data-test-id={`ekpi-fact-${row.id}`} className="tabular-nums">
              {showValue(row.unit, row.lastFactMinor, row.currency)}
            </span>
          </span>
          {row.lastFactComplete === false && <Badge tone="warning">{t('ekpi_partial')}</Badge>}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        {!row.measurable && (
          <button
            type="button"
            disabled={busy}
            data-test-id={`ekpi-done-${row.id}`}
            onClick={() => done.mutate(!isDone)}
            className="text-[var(--ms-text-brand)] text-xs underline"
          >
            {isDone ? t('ekpi_reopen') : t('ekpi_mark_done')}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          data-test-id={`ekpi-edit-${row.id}`}
          onClick={onEdit}
          className="text-[var(--ms-text-brand)] text-xs underline"
        >
          {t('ekpi_edit')}
        </button>
        <button
          type="button"
          disabled={busy}
          data-test-id={`ekpi-remove-${row.id}`}
          onClick={() => remove.mutate()}
          className="text-[var(--ms-text-muted)] text-xs underline"
        >
          {t('ekpi_remove')}
        </button>
      </div>

      {editing && (
        <div className="mt-3">
          <TargetForm
            mode="edit"
            row={row}
            busy={update.isPending}
            onCancel={onEditClose}
            onInvalid={onInvalid}
            onSubmit={(v) =>
              update.mutate({
                period: v.period,
                targetValue: v.targetValue,
                weight: v.weight,
              })
            }
          />
        </div>
      )}
    </li>
  );
}

interface FormValue {
  metricKey: string;
  period: KpiTargetPeriod;
  /** Ko'rinish birligida (so'm), server o'giradi. `null` = maqsadsiz. */
  targetValue: string | null;
  weight: number | null;
}

/**
 * Qo'shish/tahrirlash shakli.
 *
 * 🔴 Og'irlik maydoni «Kengaytirilgan» yopiq turganda **umuman
 * render qilinmaydi** — «ixtiyoriy» ning UI dagi ifodasi shu. Ko'rinib turgan
 * bo'sh maydon menejerni «to'ldirishim kerakmi?» deb o'ylatardi.
 */
function TargetForm({
  mode,
  metrics,
  row,
  busy,
  onSubmit,
  onCancel,
  onInvalid,
}: {
  mode: 'add' | 'edit';
  metrics?: KpiMetricDef[];
  row?: EmployeeKpiTarget;
  busy: boolean;
  onSubmit: (v: FormValue) => void;
  onCancel: () => void;
  onInvalid: () => void;
}) {
  const { t, label } = useKpiText();
  const prefix = mode === 'add' ? 'ekpi-add' : 'ekpi-edit';

  const [metricKey, setMetricKey] = useState(metrics?.[0]?.key ?? '');
  const [period, setPeriod] = useState<KpiTargetPeriod>(row?.period ?? 'daily');
  const [target, setTarget] = useState(row ? minorToInput(row.unit, row.targetMinor) : '');
  const [advanced, setAdvanced] = useState(row?.weight != null);
  const [weight, setWeight] = useState(row?.weight != null ? String(row.weight) : '');

  const submit = () => {
    const targetValue = target.trim() === '' ? null : normalizeAmountInput(target);
    if (target.trim() !== '' && targetValue === null) {
      onInvalid();
      return;
    }
    // Kengaytirilgan yopiq bo'lsa og'irlik UMUMAN yuborilmaydi (`null`) —
    // «ballash yo'lidan tashqarida» ataylab tanlangan holat.
    const w = advanced && weight.trim() !== '' ? Number(weight) : null;
    if (w !== null && (!Number.isFinite(w) || w < 0 || w > 100)) {
      onInvalid();
      return;
    }
    onSubmit({ metricKey, period, targetValue, weight: w });
  };

  return (
    <div className="space-y-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)] p-3">
      <div className="flex flex-wrap items-end gap-3">
        {mode === 'add' && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--ms-text-muted)]">{t('ekpi_metric')}</span>
            <NativeSelect
              value={metricKey}
              data-test-id={`${prefix}-metric`}
              onChange={(e) => setMetricKey(e.target.value)}
            >
              {(metrics ?? []).map((m) => (
                <option key={m.key} value={m.key}>
                  {label(m)}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--ms-text-muted)]">{t('ekpi_target')}</span>
          <Input
            value={target}
            data-test-id={`${prefix}-target`}
            onChange={(e) => setTarget(e.target.value)}
            className="w-32 text-right"
            placeholder={t('ekpi_target_optional')}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--ms-text-muted)]">{t('ekpi_period')}</span>
          <NativeSelect
            value={period}
            data-test-id={`${prefix}-period`}
            onChange={(e) => setPeriod(e.target.value as KpiTargetPeriod)}
          >
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {t(`ekpi_period_${p}` as 'ekpi_period_daily')}
              </option>
            ))}
          </NativeSelect>
        </label>
        {advanced && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--ms-text-muted)]">{t('ekpi_weight')}</span>
            <Input
              type="number"
              min={0}
              max={100}
              value={weight}
              data-test-id={`${prefix}-weight`}
              onChange={(e) => setWeight(e.target.value)}
              className="w-24 text-right"
            />
          </label>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          data-test-id={`${prefix}-advanced`}
          onClick={() => setAdvanced((v) => !v)}
          className="text-[var(--ms-text-muted)] text-xs underline"
        >
          {advanced ? '▴' : '▾'} {t('ekpi_advanced')}
        </button>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onCancel} data-test-id={`${prefix}-cancel`}>
            {t('ekpi_cancel')}
          </Button>
          <Button onClick={submit} disabled={busy} data-test-id={`${prefix}-save`}>
            {t('ekpi_save')}
          </Button>
        </div>
      </div>

      {advanced && <p className="text-[var(--ms-text-muted)] text-xs">{t('ekpi_weight_hint')}</p>}
    </div>
  );
}
