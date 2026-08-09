'use client';

import { api } from '@/lib/api-client';
import { liveAttentionTone } from '@/lib/domain-status-tone';
import { Badge, Card, EmptyState, Spinner, cn } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

/**
 * Menejer — JONLI HOLAT (4M TZ §6.1, bosqich MK03): «hozir kim ishda».
 *
 * ⚠️ **Bu ekran «hammasi joyida» DEMAYDI.** U diqqat talab qiladigan
 * qatorlarni yuqoriga chiqaradi, xolos. Hamma xodimni ro'yxatlash menejerni
 * har kuni 40 qatordan 3 tasini qidirishga majbur qilardi va u ekranni
 * ochishni tashlab qo'yardi. Shu sababdan bo'sh ro'yxat ham «hech kim
 * ishlamayapti» degani emas — izohda ochiq yozilgan.
 *
 * TARTIB SERVERDA (`buildLiveBoard`, 26 test): diqqat darajasi, keyin
 * eskiligi bo'yicha. Bu yerda QAYTA SARALANMAYDI — aks holda o'sha qoida
 * jimgina yo'qolardi (drift-lock: `menejer-live-boards.test.ts`).
 *
 * MATN SERVERDAN OLINMAYDI: BE `title`/`detail` ni tayyor o'zbekcha qator
 * qilib beradi, lekin ru interfeys uchun u yaramaydi va hech bir i18n gate
 * buni ko'rmasdi (gate faqat FE fayllarini skanlaydi). Shuning uchun ekran
 * BE ning `titleKey` + `titleParams` strukturasidan chiziladi.
 */

type LiveKind = 'shift' | 'attendance' | 'trip' | 'picking';
type Attention = 'alert' | 'info' | 'ok';

interface LiveRow {
  kind: LiveKind;
  employeeId: string | null;
  employeeName: string | null;
  /** Tarjima kaliti (`live-status.ts` → `LIVE_TITLE`). */
  titleKey: string;
  titleParams: Record<string, string | number>;
  /** Manzil — foydalanuvchi kiritgan matn, tarjima qilinmaydi. */
  place: string | null;
  showDuration: boolean;
  attention: Attention;
  since: string | null;
}

interface LiveBoard {
  /** Server vaqti — davomiylik shundan hisoblanadi (soat farqi bo'lmasin). */
  now: string;
  alertCount: number;
  counts: Record<LiveKind, number>;
  thresholds: {
    shiftLongHours: number;
    lateAlertMinutes: number;
    pickingStuckMinutes: number;
  };
  rows: LiveRow[];
}

const KINDS: LiveKind[] = ['shift', 'attendance', 'trip', 'picking'];

export default function MenejerJonliPage() {
  const t = useTranslations('pages.menejerLive');

  const { data, isLoading } = useQuery<LiveBoard>({
    queryKey: ['manager-live'],
    queryFn: () => api.get<LiveBoard>('/manager/kpi/live'),
    // Jonli ekran — standart staleTime bilan u qotib qolardi.
    refetchInterval: 20_000,
  });

  const rows = data?.rows ?? [];
  const nowMs = data ? new Date(data.now).getTime() : 0;

  return (
    <div className="flex h-full flex-col gap-4 p-4" data-test-id="menejer-live-page">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-semibold text-xl">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
        </div>
        {data && data.alertCount > 0 && (
          <Badge tone={liveAttentionTone('alert')}>
            {t('alert_count', { count: data.alertCount })}
          </Badge>
        )}
      </header>

      {/* Chegaralar ekranda izohlanadi (TZ §6.1): menejer «nega bu qator
          qizil» degan savolga javob topmasa signalga ishonmaydi. Raqamlar
          SERVERDAN — FE da takrorlansa ikkisi jimgina uzoqlashardi. */}
      {data && (
        <p className="text-muted-foreground text-xs">
          {t('thresholds_note', {
            shiftHours: data.thresholds.shiftLongHours,
            lateMinutes: data.thresholds.lateAlertMinutes,
            pickingMinutes: data.thresholds.pickingStuckMinutes,
          })}
        </p>
      )}

      {data && (
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <Card key={k} className="min-w-[8rem] flex-1 px-3 py-2">
              <div className="text-muted-foreground text-xs">{t(`kind_${k}` as never)}</div>
              <div className="font-semibold text-lg tabular-nums">{data.counts[k]}</div>
            </Card>
          ))}
        </div>
      )}

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center p-6">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          // Bo'shlik «hammasi joyida» EMAS — izoh shuni ochiq aytadi.
          <EmptyState title={t('empty_title')} description={t('empty_hint')} />
        ) : (
          <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
            {rows.map((r, i) => (
              <li
                key={`${r.kind}-${r.employeeId ?? 'x'}-${r.since ?? i}`}
                className={cn(
                  'flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2',
                  r.attention === 'alert' && 'bg-destructive/5',
                )}
              >
                <Badge tone={liveAttentionTone(r.attention)}>
                  {t(`attention_${r.attention}` as never)}
                </Badge>
                <span className="min-w-[10rem] font-medium text-sm">
                  {r.employeeName ?? t('no_employee')}
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  {t(`title_${r.titleKey}` as never, r.titleParams as never)}
                </span>
                <span className="text-muted-foreground text-xs">{detailOf(r, nowMs, t)}</span>
                <span className="text-muted-foreground text-xs">
                  {t(`kind_${r.kind}` as never)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/**
 * Detal qatori: manzil (bo'lsa) + davomiylik (BE ruxsat bergan bo'lsa).
 *
 * `showDuration` — BE qarori: «ishga keldi» bir martalik hodisa, unga
 * davomiylik yozilsa «shuncha vaqtdan beri kechikmoqda» deb yolg'on
 * o'qilardi.
 */
function detailOf(r: LiveRow, nowMs: number, t: ReturnType<typeof useTranslations>): string | null {
  const parts: string[] = [];
  if (r.place) parts.push(r.place);
  if (r.showDuration && r.since && nowMs > 0) parts.push(durationLabel(r.since, nowMs, t));
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** BE `durationLabel` ning tarjima qilinadigan ko'zgusi («3 soat 20 daq»). */
function durationLabel(
  sinceIso: string,
  nowMs: number,
  t: ReturnType<typeof useTranslations>,
): string {
  const mins = Math.max(0, Math.floor((nowMs - new Date(sinceIso).getTime()) / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return t('duration_minutes', { m });
  if (m === 0) return t('duration_hours', { h });
  return t('duration_hours_minutes', { h, m });
}
