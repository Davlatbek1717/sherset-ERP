'use client';

import { api } from '@/lib/api-client';
import { dutyKindTone } from '@/lib/domain-status-tone';
import { Badge, Card, EmptyState, Spinner, formatMoney } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

/**
 * Menejer — JAVOBGARLIK (4M TZ §6.4, bosqich MK03): «kimda nima qolgan».
 *
 * Savol: xodim bugun kelmasa yoki ketsa, uning ustida qanday yopilmagan
 * majburiyat qoladi — ochiq kassa smenasi · haydovchi qo'lidagi naqd ·
 * tugallanmagan yig'ish · qabul qilinmagan KPI kunlari.
 *
 * ⚠️ **JIHOZ BLOKI YO'Q.** Tizimda jihoz reyestri umuman yo'q (`Equipment`
 * modeli mavjud emas — MK05 fazasi shuni qo'shadi). Uni «0 ta jihoz» deb
 * ko'rsatish menejerni yo'q ma'lumotga ishontirardi: ekran «hammasi
 * topshirilgan» deb turardi, aslida hech kim tekshirmagan. Ro'yxatning
 * to'liq emasligi pastdagi izohda OCHIQ yozilgan — qarz ko'rinib tursin.
 *
 * NOL QATORLAR KO'RSATILMAYDI: «Ochiq smena: 0» qatori ekranni to'ldirib,
 * haqiqiy majburiyatni ko'rinmas qilardi. Tashlash BE da (`employeeDuties`)
 * — bu yerda `?? 0` bilan qaytarib keltirilmaydi (drift-lock test).
 *
 * TARTIB SERVERDA: pul ko'p bo'lgan xodim tepada. Yo'qolgan pulni qaytarib
 * bo'lmaydi, yopilmagan yig'ishni ertaga tugatsa bo'ladi.
 */

type DutyKind = 'open_shift' | 'cash_on_hand' | 'picking_open' | 'kpi_pending';

interface Duty {
  kind: DutyKind;
  count: number;
  /** Pulga bog'liq majburiyatda summa (tiyin), aks holda `null` — 0 EMAS. */
  amountMinor: string | null;
}

interface EmployeeDuties {
  employeeId: string;
  employeeName: string | null;
  totalCashMinor: string;
  totalCount: number;
  duties: Duty[];
}

interface AccountabilityBoard {
  totalCashMinor: string;
  employeeCount: number;
  employees: EmployeeDuties[];
}

export default function MenejerJavobgarlikPage() {
  const t = useTranslations('pages.menejerDuties');

  const { data, isLoading } = useQuery<AccountabilityBoard>({
    queryKey: ['manager-accountability'],
    queryFn: () => api.get<AccountabilityBoard>('/manager/kpi/accountability'),
    refetchInterval: 60_000,
  });

  const employees = data?.employees ?? [];

  return (
    <div className="flex h-full flex-col gap-4 p-4" data-test-id="menejer-duties-page">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-semibold text-xl">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
        </div>
        {data && (
          <div className="text-right">
            <div className="text-muted-foreground text-xs">{t('total_cash')}</div>
            <div className="font-semibold text-lg tabular-nums">
              {formatMoney(BigInt(data.totalCashMinor))}
            </div>
            <div className="text-muted-foreground text-xs">
              {t('employee_count', { count: data.employeeCount })}
            </div>
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center p-6">
            <Spinner />
          </div>
        ) : employees.length === 0 ? (
          <EmptyState title={t('empty_title')} description={t('empty_hint')} />
        ) : (
          <div className="flex flex-col gap-3">
            {employees.map((e) => (
              <Card key={e.employeeId} className="overflow-hidden">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-3 py-2">
                  <span className="font-medium text-sm">{e.employeeName ?? t('no_employee')}</span>
                  <span className="font-semibold tabular-nums">
                    {/* Pulsiz xodimda ham jami ko'rsatiladi: 0 bu yerda
                        O'LCHANGAN qiymat («pul majburiyati yo'q»), taxmin emas. */}
                    {formatMoney(BigInt(e.totalCashMinor))}
                  </span>
                </div>
                <ul className="divide-y">
                  {e.duties.map((d) => (
                    <li
                      key={d.kind}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
                    >
                      <Badge tone={dutyKindTone(d.kind)}>{t(`duty_${d.kind}` as never)}</Badge>
                      <span className="min-w-0 flex-1 text-muted-foreground text-xs">
                        {t('duty_count', { count: d.count })}
                      </span>
                      <span className="tabular-nums">
                        {/* NULL ≠ 0: pulsiz majburiyatda summa «—», nol emas. */}
                        {d.amountMinor != null ? formatMoney(BigInt(d.amountMinor)) : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Ro'yxat TO'LIQ EMAS va buni menejer bilishi shart. */}
      <p className="text-muted-foreground text-xs">{t('scope_note')}</p>
    </div>
  );
}
