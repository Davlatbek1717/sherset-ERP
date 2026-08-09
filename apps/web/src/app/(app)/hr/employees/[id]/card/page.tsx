'use client';

/**
 * HR xodim — «Karta 360°» tab (4M.4 · menejer TZ §6.2).
 *
 * Bitta odam haqidagi hamma narsa bitta ekranda: KPI · davomat · smena ·
 * bo'shatish holati · suhbat va ogohlantirish jurnali. Mantiq
 * `EmployeeCard360` komponentida (testlarda alohida chiziladi).
 */

import { type HrEmployeeDetail, hrEmployeeApi } from '@/lib/hr-api';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { EmployeeCard360 } from '../../_components/employee-card-360';
import { TabBar } from '../../_components/tab-bar';

export default function HrEmployeeCardPage() {
  const t = useTranslations('pages.hrEmployees');
  const tCommon = useTranslations('common');
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data: employee } = useQuery<HrEmployeeDetail>({
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
          {employee?.name ? `${employee.name} — ` : ''}
          {t('tab_card')}
        </h1>
        <p className="mt-1 text-[var(--ms-text-muted)] text-sm">{t('card_hint')}</p>
      </div>

      <TabBar employeeId={id} active="card" />

      <EmployeeCard360 employeeId={id} />
    </div>
  );
}
