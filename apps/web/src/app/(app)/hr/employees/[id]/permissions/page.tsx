'use client';

/**
 * HR Employee permissions matrix.
 *
 * Renders a table of HR pages (8 top-level pages + 5 messages subsections)
 * × 4 access levels (none / own_only / read / full) as radio rows. On
 * mount loads the current state via `hrPermissionApi.list(id)` and writes
 * back with `hrPermissionApi.replace(id, rows)` on save.
 *
 * "none" is encoded as an absent row in the API — when the user picks
 * "Yo'q" we simply omit that row from the payload.
 */

import { hrEmployeeApi, hrPermissionApi } from '@/lib/hr-api';
import type { HrAccessLevel, HrEmployeeDetail, HrPermissionRow } from '@/lib/hr-api';
import { Button, ErrorState, Skeleton, useToast } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { TabBar } from '../../_components/tab-bar';

type MatrixLevel = HrAccessLevel | 'none';

interface MatrixRow {
  pageKey: string;
  section: string | null;
  labelKey: string;
  level: MatrixLevel;
}

// Order matches moysklad's «Права доступа» modal navigation.
const PAGES: { pageKey: string; section: string | null; labelKey: string }[] = [
  { pageKey: 'dashboard', section: null, labelKey: 'page_dashboard' },
  { pageKey: 'messages', section: null, labelKey: 'page_messages' },
  { pageKey: 'messages', section: 'demand', labelKey: 'section_demand' },
  { pageKey: 'messages', section: 'customer_order', labelKey: 'section_customer_order' },
  { pageKey: 'messages', section: 'payment_in', labelKey: 'section_payment_in' },
  { pageKey: 'messages', section: 'supply', labelKey: 'section_supply' },
  { pageKey: 'messages', section: 'sales_return', labelKey: 'section_sales_return' },
  { pageKey: 'reports', section: null, labelKey: 'page_reports' },
  { pageKey: 'employees', section: null, labelKey: 'page_employees' },
  { pageKey: 'tasks', section: null, labelKey: 'page_tasks' },
  { pageKey: 'oylik', section: null, labelKey: 'page_oylik' },
  { pageKey: 'activity', section: null, labelKey: 'page_activity' },
  { pageKey: 'settings', section: null, labelKey: 'page_settings' },
];

function rowKey(p: { pageKey: string; section: string | null }): string {
  return `${p.pageKey}::${p.section ?? ''}`;
}

export default function HrPermissionsPage() {
  const t = useTranslations('pages.hrPermissions');
  const tCommon = useTranslations('common');
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: employee } = useQuery<HrEmployeeDetail>({
    queryKey: ['hr-employee', id],
    queryFn: () => hrEmployeeApi.findOne(id),
    enabled: !!id,
  });

  const {
    data: current = [],
    isLoading,
    error,
    refetch,
  } = useQuery<HrPermissionRow[]>({
    queryKey: ['hr-permissions', id],
    queryFn: () => hrPermissionApi.list(id),
    enabled: !!id,
  });

  const initialMatrix = useMemo<MatrixRow[]>(() => {
    const lookup = new Map<string, HrAccessLevel>();
    for (const r of current) lookup.set(rowKey(r), r.accessLevel);
    return PAGES.map((p) => ({
      ...p,
      level: lookup.get(rowKey(p)) ?? 'none',
    }));
  }, [current]);

  const [matrix, setMatrix] = useState<MatrixRow[]>(initialMatrix);

  useEffect(() => {
    setMatrix(initialMatrix);
  }, [initialMatrix]);

  const setLevel = (idx: number, level: MatrixLevel) => {
    setMatrix((prev) => prev.map((r, i) => (i === idx ? { ...r, level } : r)));
  };

  const setAll = (level: MatrixLevel) => {
    setMatrix((prev) => prev.map((r) => ({ ...r, level })));
  };

  const saveMut = useMutation({
    mutationFn: () => {
      const payload: HrPermissionRow[] = matrix
        .filter((r) => r.level !== 'none')
        .map((r) => ({
          pageKey: r.pageKey,
          section: r.section,
          accessLevel: r.level as HrAccessLevel,
        }));
      return hrPermissionApi.replace(id, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-permissions', id] });
      toast.success(t('saved'));
    },
    onError: (e: Error) => toast.error(tCommon('save_failed'), { description: e.message }),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title={tCommon('action_failed')}
        description={(error as Error).message}
        onRetry={() => refetch()}
      />
    );
  }

  const LEVELS: {
    value: MatrixLevel;
    key: 'col_none' | 'col_own_only' | 'col_read' | 'col_full';
  }[] = [
    { value: 'none', key: 'col_none' },
    { value: 'own_only', key: 'col_own_only' },
    { value: 'read', key: 'col_read' },
    { value: 'full', key: 'col_full' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link
          href="/hr/employees"
          className="text-[var(--ms-text-muted)] text-sm hover:text-[var(--ms-text-brand)]"
        >
          ← {tCommon('back')}
        </Link>
      </div>

      <div>
        <h1 className="font-semibold text-2xl text-[var(--ms-text-strong)]">
          {employee?.name ? `${employee.name} — ` : ''}
          {t('title')}
        </h1>
        <p className="text-[var(--ms-text-muted)] text-sm">{t('subtitle')}</p>
      </div>

      <TabBar employeeId={id} active="permissions" />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setAll('full')}>
          {t('preset_full')}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setAll('none')}>
          {t('preset_clear')}
        </Button>
        <div className="flex-1" />
        <Button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          data-test-id="hr-permissions-save"
        >
          {t('save')}
        </Button>
      </div>

      <div className="overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]">
        <table className="w-full text-sm">
          <thead className="border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-app)] text-[var(--ms-text-muted)] text-xs">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{t('col_page')}</th>
              {LEVELS.map((l) => (
                <th key={l.value} className="px-3 py-2 text-center font-medium">
                  {t(l.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, idx) => (
              <tr
                key={rowKey(row)}
                className="border-[var(--ms-border-default)] border-b last:border-b-0"
              >
                <td
                  className={`px-3 py-2 text-[var(--ms-text-primary)] ${row.section ? 'pl-6 text-xs' : 'font-medium'}`}
                >
                  {t(row.labelKey as Parameters<typeof t>[0])}
                </td>
                {LEVELS.map((l) => (
                  <td key={l.value} className="px-3 py-2 text-center">
                    <input
                      type="radio"
                      name={rowKey(row)}
                      checked={row.level === l.value}
                      onChange={() => setLevel(idx, l.value)}
                      aria-label={t(l.key)}
                      data-test-id={`hr-perm-${row.pageKey}-${row.section ?? 'main'}-${l.value}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
