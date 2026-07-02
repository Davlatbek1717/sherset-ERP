'use client';

/**
 * HR Employee salary tab — P1 placeholder.
 *
 * Full implementation lives in sprint P5 (HR-Oylik + KPI). For now we
 * surface the tab so the URL contract is stable and link-aware tests
 * don't 404.
 */

import { hrEmployeeApi } from '@/lib/hr-api';
import type { HrEmployeeDetail } from '@/lib/hr-api';
import { Skeleton } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { TabBar } from '../../_components/tab-bar';

export default function HrEmployeeSalaryPage() {
  const t = useTranslations('pages.hrEmployees');
  const tCommon = useTranslations('common');
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data: employee, isLoading } = useQuery<HrEmployeeDetail>({
    queryKey: ['hr-employee', id],
    queryFn: () => hrEmployeeApi.findOne(id),
    enabled: !!id,
  });

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
          {isLoading ? (
            <Skeleton className="h-6 w-48" />
          ) : (
            <>
              {employee?.name ? `${employee.name} — ` : ''}
              {t('tab_salary')}
            </>
          )}
        </h1>
      </div>

      <TabBar employeeId={id} active="salary" />

      <p className="text-[var(--ms-text-muted)] text-sm">{t('salary_placeholder')}</p>
    </div>
  );
}
