'use client';

/**
 * HR Employee «KPI» tab (TZ 4M.2 — «har xodim uchun alohida»).
 *
 * Menejer xodimga qaysi ko'rsatkichlar, qanday og'irlik va qanday kunlik
 * maqsad bilan qo'llanishini belgilaydi. Saqlash yangi profil versiyasini
 * yozadi (tarix muzlaydi). Pastda dvigatel hisoblagan oxirgi kun (fakt vs
 * maqsad) ko'rsatiladi.
 */

import { hrEmployeeApi } from '@/lib/hr-api';
import type { HrEmployeeDetail } from '@/lib/hr-api';
import {
  type KpiEmployeeConfig,
  type KpiEmployeeDaily,
  type KpiMetricDef,
  type KpiUnit,
  managerKpiApi,
} from '@/lib/manager-api';
import { Badge, Button, Checkbox, Input, Skeleton, useToast } from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { TabBar } from '../../_components/tab-bar';

interface RowState {
  included: boolean;
  weight: string;
  /** Maqsad, ko'rsatkichning KO'RINISH birligida (money = so'm). '' = maqsadsiz. */
  target: string;
}

/** Saqlangan (tiyin/xom) → ko'rinish (so'm/xom). */
function toDisplayTarget(unit: KpiUnit, stored: string | null): string {
  if (stored == null) return '';
  if (unit === 'money') return String(Number(stored) / 100);
  return stored;
}

/** Ko'rinish (so'm/xom) → saqlanadigan butun son (tiyin/xom). null = maqsadsiz. */
function toStoredTarget(unit: KpiUnit, display: string): number | null {
  const s = display.trim();
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return unit === 'money' ? Math.round(n * 100) : Math.round(n);
}

export default function HrEmployeeKpiPage() {
  const t = useTranslations('pages.hrEmployees');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const { toast } = useToast();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data: employee } = useQuery<HrEmployeeDetail>({
    queryKey: ['hr-employee', id],
    queryFn: () => hrEmployeeApi.findOne(id),
    enabled: !!id,
  });
  const { data: metrics, isLoading: metricsLoading } = useQuery<KpiMetricDef[]>({
    queryKey: ['kpi-metrics'],
    queryFn: () => managerKpiApi.metrics(),
  });
  const { data: config, isLoading: configLoading } = useQuery<KpiEmployeeConfig>({
    queryKey: ['kpi-config', id],
    queryFn: () => managerKpiApi.getConfig(id),
    enabled: !!id,
  });
  const { data: daily } = useQuery<KpiEmployeeDaily | null>({
    queryKey: ['kpi-daily', id],
    queryFn: () => managerKpiApi.daily(id),
    enabled: !!id,
  });

  const [rows, setRows] = useState<Record<string, RowState>>({});

  // Katalog + saqlangan config kelgach, boshlang'ich holatni to'ldiramiz.
  useEffect(() => {
    if (!metrics) return;
    const byKey = new Map((config?.metrics ?? []).map((m) => [m.metricKey, m]));
    const next: Record<string, RowState> = {};
    for (const m of metrics) {
      const saved = byKey.get(m.key);
      next[m.key] = {
        included: !!saved,
        weight: saved ? String(saved.weight) : '',
        target: saved ? toDisplayTarget(m.unit, saved.target) : '',
      };
    }
    setRows(next);
  }, [metrics, config]);

  const label = (m: KpiMetricDef) => (locale === 'ru' ? m.labelRu : m.labelUz);
  const unitLabel = (u: KpiUnit) =>
    u === 'money'
      ? t('kpi_unit_som')
      : u === 'count'
        ? t('kpi_unit_dona')
        : u === 'minutes'
          ? t('kpi_unit_min')
          : t('kpi_unit_pct');

  const totalWeight = useMemo(
    () => Object.values(rows).reduce((s, r) => s + (r.included ? Number(r.weight) || 0 : 0), 0),
    [rows],
  );

  const setRow = (key: string, patch: Partial<RowState>) =>
    setRows((prev) => ({
      ...prev,
      [key]: { included: false, weight: '', target: '', ...prev[key], ...patch },
    }));

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = (metrics ?? [])
        .filter((m) => rows[m.key]?.included)
        .map((m) => ({
          metricKey: m.key,
          weight: Number(rows[m.key]?.weight) || 0,
          target: toStoredTarget(m.unit, rows[m.key]?.target ?? ''),
        }));
      return managerKpiApi.saveConfig(id, { metrics: payload });
    },
    onSuccess: () => toast.success(t('kpi_saved')),
    onError: (e: Error) => toast.error(tCommon('action_failed'), { description: e.message }),
  });

  const loading = metricsLoading || configLoading;
  const dailyByKey = new Map((daily?.metrics ?? []).map((m) => [m.metricKey, m]));

  return (
    <div className="space-y-4">
      <Link
        href="/hr/employees"
        className="text-[var(--ms-text-muted)] text-sm hover:text-[var(--ms-text-brand)]"
      >
        ← {tCommon('back')}
      </Link>

      <div>
        <h1 className="font-semibold text-2xl text-[var(--ms-text-strong)]">
          {employee?.name ? `${employee.name} — ` : ''}
          {t('tab_kpi')}
        </h1>
        <p className="mt-1 text-[var(--ms-text-muted)] text-sm">{t('kpi_hint')}</p>
      </div>

      <TabBar employeeId={id} active="kpi" />

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--ms-bg-muted)] text-[var(--ms-text-muted)]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">{t('kpi_include')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('kpi_metric')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('kpi_weight')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('kpi_target')}</th>
                </tr>
              </thead>
              <tbody>
                {(metrics ?? []).map((m) => {
                  const r = rows[m.key] ?? { included: false, weight: '', target: '' };
                  return (
                    <tr key={m.key} className="border-[var(--ms-border-default)] border-t">
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={r.included}
                          onCheckedChange={(v) => setRow(m.key, { included: v === true })}
                          data-test-id={`kpi-include-${m.key}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-[var(--ms-text-primary)]">{label(m)}</div>
                        <div className="text-[var(--ms-text-muted)] text-xs">
                          {unitLabel(m.unit)} ·{' '}
                          {m.direction === 'lower_better'
                            ? t('kpi_dir_lower')
                            : t('kpi_dir_higher')}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={r.weight}
                          disabled={!r.included}
                          onChange={(e) => setRow(m.key, { weight: e.target.value })}
                          className="w-20 text-right"
                          placeholder="%"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          type="number"
                          min={0}
                          value={r.target}
                          disabled={!r.included}
                          onChange={(e) => setRow(m.key, { target: e.target.value })}
                          className="w-28 text-right"
                          placeholder={unitLabel(m.unit)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <Badge
              tone={totalWeight === 100 ? 'success' : totalWeight === 0 ? 'neutral' : 'warning'}
            >
              {t('kpi_total_weight')}: {totalWeight}%
            </Badge>
            <div className="flex items-center gap-3">
              {config && config.version > 0 && (
                <span className="text-[var(--ms-text-muted)] text-xs">
                  {t('kpi_version')} {config.version}
                </span>
              )}
              <Button
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending}
                data-test-id="kpi-save"
              >
                {t('kpi_save')}
              </Button>
            </div>
          </div>

          {/* Hisoblangan oxirgi kun (fakt vs maqsad) */}
          <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
            <h2 className="mb-2 font-semibold text-[var(--ms-text-strong)] text-sm">
              {t('kpi_result_title')}
            </h2>
            {!daily ? (
              <p className="text-[var(--ms-text-muted)] text-sm">{t('kpi_result_none')}</p>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[var(--ms-text-muted)] text-xs">
                  <Badge tone="brand">{String(daily.date).slice(0, 10)}</Badge>
                  {!daily.dataComplete && <Badge tone="warning">{t('kpi_incomplete')}</Badge>}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      {(metrics ?? [])
                        .filter((m) => rows[m.key]?.included)
                        .map((m) => {
                          const d = dailyByKey.get(m.key);
                          const factRaw = d?.adjustValue ?? d?.autoValue ?? null;
                          const factDisp = factRaw == null ? '—' : toDisplayTarget(m.unit, factRaw);
                          const tgt = rows[m.key]?.target || '—';
                          return (
                            <tr key={m.key} className="border-[var(--ms-border-default)] border-t">
                              <td className="px-2 py-1.5 text-[var(--ms-text-primary)]">
                                {label(m)}
                              </td>
                              <td className="px-2 py-1.5 text-right tabular-nums">
                                {factDisp} / {tgt} {unitLabel(m.unit)}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
