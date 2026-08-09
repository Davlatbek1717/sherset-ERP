'use client';

import { api } from '@/lib/api-client';
import { Badge, Card, EmptyState, NativeSelect, Spinner, formatMoney } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';

/**
 * Menejer — NARX O'ZGARISHI TARIXI VA NAZORATI (4M TZ §8, bosqich MK11).
 *
 * ⚠️ **BU EKRAN HECH NARSANI BLOKLAMAYDI.** 4-bo'lim TZ §5.1: kassir va
 * sotuvchi ataylab erkin qoldirilgan, navbat «to'siq emas, keyingi ko'rib
 * chiqish». Narx o'zgardi — savdo ketaveradi, menejer keyin ko'radi.
 * Shuning uchun sarlavha ostida doimiy izoh turadi: kimdir ekranni
 * «tasdiqlash oynasi» deb o'ylab qolmasin.
 *
 * NULL ≠ 0: bazasi yo'q o'zgarish (birinchi marta narx qo'yildi) yoki
 * valyuta almashgan holat foizsiz ko'rsatiladi va chegara qo'llanmaydi —
 * «0%» yozish «o'zgarish bo'lmagan» degan yolg'on bo'lardi.
 */

type PriceField = 'buyPrice' | 'minPrice' | 'salePrice';

interface PriceChangeRow {
  auditId: string;
  productId: string;
  productName: string | null;
  field: PriceField;
  priceTypeId: string | null;
  beforeMinor: string | null;
  afterMinor: string;
  deltaMinor: string | null;
  deltaPercent: number | null;
  unmeasuredReason: 'no_baseline' | 'currency_mismatch' | null;
  changedById: string | null;
  changedByName: string | null;
  at: string;
  exceedsThreshold: boolean;
  blocks: boolean;
}

interface PriceChangesResponse {
  thresholdPercent: number;
  days: number;
  truncated: boolean;
  blocking: boolean;
  totalCount: number;
  queuedCount: number;
  changes: PriceChangeRow[];
}

const THRESHOLD_OPTIONS = [5, 10, 20, 30, 50];
const DAY_OPTIONS = [7, 30, 90];

export default function MenejerNarxNazoratiPage() {
  const t = useTranslations('pages.menejerPriceControl');
  const format = useFormatter();
  const [thresholdPercent, setThresholdPercent] = useState(20);
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery<PriceChangesResponse>({
    queryKey: ['manager-price-changes', thresholdPercent, days],
    queryFn: () =>
      api.get<PriceChangesResponse>(
        `/manager/inventory/price-changes?thresholdPercent=${thresholdPercent}&days=${days}`,
      ),
    refetchInterval: 300_000,
  });

  const rows = data?.changes ?? [];

  return (
    <div className="flex h-full flex-col gap-4 p-4" data-test-id="menejer-price-control-page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-semibold text-xl">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{t('threshold')}</span>
            <NativeSelect
              value={String(thresholdPercent)}
              onChange={(e) => setThresholdPercent(Number(e.target.value))}
            >
              {THRESHOLD_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {t('percent_value', { percent: p })}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{t('period')}</span>
            <NativeSelect value={String(days)} onChange={(e) => setDays(Number(e.target.value))}>
              {DAY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {t('days_value', { count: d })}
                </option>
              ))}
            </NativeSelect>
          </label>
        </div>
      </header>

      {/* Doimiy izoh — ekranning tabiati shu. */}
      <p className="rounded border border-info/40 bg-info/10 px-3 py-2 text-xs">
        {t('no_block_note')}
      </p>

      {data && (
        <div className="flex flex-wrap gap-4 text-sm">
          <span>{t('total_count', { count: data.totalCount })}</span>
          <span className="font-medium">{t('queued_count', { count: data.queuedCount })}</span>
          {data.truncated && (
            <span className="text-muted-foreground">{t('truncated', { count: rows.length })}</span>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center p-6">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title={t('empty_title')} description={t('empty_hint')} />
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y">
              {rows.map((r) => (
                <li
                  key={`${r.auditId}-${r.field}-${r.priceTypeId ?? '-'}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{r.productName ?? t('no_product')}</span>
                    <span className="block truncate text-muted-foreground text-xs">
                      {t(`field_${r.field}` as never)}
                      {r.priceTypeId ? ` · ${r.priceTypeId}` : ''} ·{' '}
                      {r.changedByName ?? t('no_actor')} ·{' '}
                      {format.dateTime(new Date(r.at), {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </span>

                  <span className="tabular-nums">
                    {/* Bazasi yo'q bo'lsa «—» — 0 so'm deb ko'rsatilmaydi. */}
                    {r.beforeMinor != null ? formatMoney(BigInt(r.beforeMinor)) : '—'}
                    {' → '}
                    {formatMoney(BigInt(r.afterMinor))}
                  </span>

                  <span className="min-w-20 text-right tabular-nums">
                    {r.deltaPercent != null ? (
                      t('percent_value', { percent: r.deltaPercent })
                    ) : (
                      <Badge tone="neutral">
                        {t(`unmeasured_${r.unmeasuredReason ?? 'no_baseline'}` as never)}
                      </Badge>
                    )}
                  </span>

                  <span className="min-w-28 text-right">
                    {r.exceedsThreshold ? (
                      <Badge tone="warning">{t('queued')}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">{t('within')}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {/* Qamrov cheklovi OCHIQ yoziladi — qarz ko'rinib tursin. */}
      <p className="text-muted-foreground text-xs">{t('scope_note')}</p>
    </div>
  );
}
