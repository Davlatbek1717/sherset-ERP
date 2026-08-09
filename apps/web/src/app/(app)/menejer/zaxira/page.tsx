'use client';

import { api } from '@/lib/api-client';
import { stockSignalTone } from '@/lib/domain-status-tone';
import { Badge, Card, EmptyState, NativeSelect, Spinner, formatMoney } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/**
 * Menejer — UCH XIL ZAXIRA SIGNALI (4M TZ §8, bosqich MK11).
 *
 * O'LCHOV — PUL, dona emas. Egasining savoli «nechta kabel yotibdi» emas,
 * «qancha pulim qotib qolgan». Dona ekranda faqat kontekst sifatida turadi.
 *
 * NULL ≠ 0: tan narxi yozilmagan tovarning signali «—» bilan chiqadi va
 * jamiga QO'SHILMAYDI. Uni 0 deb ko'rsatish «muammo yo'q» degan yolg'on
 * bo'lardi — aynan shu sinf chakana hisobotda 100% marja bergan. Har
 * guruh sarlavhasida «o'lchanmadi: N» hisoblagichi turadi, ya'ni jamining
 * qanchalik to'liq ekani ko'rinib turadi.
 */

type SignalKind = 'dead_money' | 'stockout_risk' | 'overstock';

interface SignalRow {
  kind: SignalKind;
  storeId: string;
  storeName: string | null;
  assortmentKind: string;
  assortmentId: string;
  name: string | null;
  qty: string;
  signalQty: string;
  /** Tiyin satri; `null` = o'lchanmadi (0 EMAS). */
  amountMinor: string | null;
  measured: boolean;
  unmeasuredReason: 'no_cost' | 'no_history' | null;
  dailySaleQty: string | null;
  coverDays: number | null;
  daysIdle: number | null;
}

interface SignalGroup {
  totalMinor: string;
  measuredCount: number;
  unmeasuredCount: number;
  rowCount: number;
  rows: SignalRow[];
}

interface SignalsResponse {
  thresholds: { deadDays: number; coverDays: number; overstockDays: number };
  windowDays: number;
  generatedAt: string;
  truncated: boolean;
  scannedStockRows: number;
  signals: Record<SignalKind, SignalGroup>;
}

const ORDER: SignalKind[] = ['stockout_risk', 'dead_money', 'overstock'];
const DEAD_DAY_OPTIONS = [30, 60, 90, 180];
const COVER_DAY_OPTIONS = [7, 14, 30, 45];

export default function MenejerZaxiraPage() {
  const t = useTranslations('pages.menejerStockSignals');
  const [deadDays, setDeadDays] = useState(90);
  const [coverDays, setCoverDays] = useState(14);

  const { data, isLoading } = useQuery<SignalsResponse>({
    queryKey: ['manager-stock-signals', deadDays, coverDays],
    queryFn: () =>
      api.get<SignalsResponse>(
        `/manager/inventory/stock-signals?deadDays=${deadDays}&coverDays=${coverDays}`,
      ),
    refetchInterval: 300_000,
  });

  return (
    <div className="flex h-full flex-col gap-4 p-4" data-test-id="menejer-stock-signals-page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-semibold text-xl">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{t('dead_days')}</span>
            <NativeSelect
              value={String(deadDays)}
              onChange={(e) => setDeadDays(Number(e.target.value))}
            >
              {DEAD_DAY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {t('days_value', { count: d })}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{t('cover_days')}</span>
            <NativeSelect
              value={String(coverDays)}
              onChange={(e) => setCoverDays(Number(e.target.value))}
            >
              {COVER_DAY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {t('days_value', { count: d })}
                </option>
              ))}
            </NativeSelect>
          </label>
        </div>
      </header>

      {data?.truncated && (
        <p className="rounded border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          {/* Kesilgan skanni jim qoldirish «hammasi ko'rildi» degan yolg'on bo'lardi. */}
          {t('truncated', { count: data.scannedStockRows })}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center p-6">
            <Spinner />
          </div>
        ) : !data ? (
          <EmptyState title={t('empty_title')} description={t('empty_hint')} />
        ) : (
          <div className="flex flex-col gap-4">
            {ORDER.map((kind) => {
              const group = data.signals[kind];
              if (!group) return null;
              return (
                <Card key={kind} className="overflow-hidden">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-3 py-2">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <Badge tone={stockSignalTone(kind)}>{t(`signal_${kind}` as never)}</Badge>
                      <span className="text-muted-foreground text-xs">
                        {t(`hint_${kind}` as never)}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-lg tabular-nums">
                        {formatMoney(BigInt(group.totalMinor))}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {t('counts', {
                          measured: group.measuredCount,
                          unmeasured: group.unmeasuredCount,
                        })}
                      </div>
                    </div>
                  </div>

                  {group.rows.length === 0 ? (
                    <p className="px-3 py-3 text-muted-foreground text-sm">{t('group_empty')}</p>
                  ) : (
                    <ul className="divide-y">
                      {group.rows.map((r) => (
                        <li
                          key={`${r.storeId}-${r.assortmentId}`}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{r.name ?? t('no_name')}</span>
                            <span className="block truncate text-muted-foreground text-xs">
                              {r.storeName ?? t('no_store')} · {t('qty', { qty: r.qty })}
                              {r.coverDays != null ? ` · ${t('cover', { days: r.coverDays })}` : ''}
                              {r.daysIdle != null ? ` · ${t('idle', { days: r.daysIdle })}` : ''}
                            </span>
                          </span>
                          <span className="text-muted-foreground text-xs tabular-nums">
                            {t('signal_qty', { qty: r.signalQty })}
                          </span>
                          <span className="min-w-24 text-right tabular-nums">
                            {/* NULL ≠ 0 — o'lchanmagan summa hech qachon «0 so'm» emas. */}
                            {r.amountMinor != null ? (
                              formatMoney(BigInt(r.amountMinor))
                            ) : (
                              <Badge tone="neutral">
                                {t(`unmeasured_${r.unmeasuredReason ?? 'no_cost'}` as never)}
                              </Badge>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {group.rowCount > group.rows.length && (
                    <p className="border-t px-3 py-2 text-muted-foreground text-xs">
                      {t('more_rows', { count: group.rowCount - group.rows.length })}
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-muted-foreground text-xs">{t('scope_note')}</p>
    </div>
  );
}
