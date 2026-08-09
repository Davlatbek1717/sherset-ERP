'use client';

import { api } from '@/lib/api-client';
import { Badge, Card, EmptyState, NativeSelect, Spinner, formatMoney } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';

/**
 * Menejer — XATO NARX NAZORATI (4M TZ §8.1/4, bosqich MK18).
 *
 * ⚠️ **BU EKRAN HECH NARSANI BLOKLAMAYDI.** 4-bo'lim TZ §5.1: kassir va
 * sotuvchi ataylab erkin qoldirilgan. Xato narx sotuvni to'xtatmaydi —
 * menejer keyin ko'radi.
 *
 * `/menejer/narx-nazorati` (MK11) dan farqi: u narx **o'zgarishini** ko'radi
 * (kim, qachon, qanchaga), bu ekran esa narx qiymatining **o'zi mantiqlimi**
 * deb so'raydi (o'nlik xatosi, nol narx, poldan past, o'rtachadan keskin farq).
 *
 * NULL ≠ 0 va «tekshirilmagan» ≠ «toza»: mo'ljal (tan narx / optom / karta
 * narxi / o'rtacha) yo'q bo'lsa, qator «xatosiz» deb ko'rsatilmaydi — sabab
 * ochiq yoziladi. Chegirma esa past narxni TUSHUNTIRADI: u xato emas.
 */

type PriceErrorKind =
  | 'ZERO_PRICE'
  | 'DECIMAL_SHIFT'
  | 'BELOW_COST'
  | 'BELOW_WHOLESALE'
  | 'PRICE_OUTLIER';

type UncheckedReason = 'no_cost' | 'no_wholesale' | 'no_reference' | 'no_average' | 'discounted';

interface Finding {
  kind: PriceErrorKind;
  expectedMinor: string | null;
  amountMinor: string | null;
  factor: number | null;
  deviationPercent: number | null;
}

interface PriceErrorRow {
  docType: 'retailsale' | 'demand';
  docId: string;
  docName: string | null;
  lineId: string;
  productId: string | null;
  productName: string | null;
  quantity: string;
  priceMinor: string;
  discountPercent: number;
  costMinor: string | null;
  wholesaleMinor: string | null;
  referenceMinor: string | null;
  averageMinor: string | null;
  referenceSource: 'frozen' | 'card';
  soldById: string | null;
  soldByName: string | null;
  at: string;
  blocks: boolean;
  unchecked: UncheckedReason[];
  findings: Finding[];
}

interface PriceErrorsResponse {
  thresholds: {
    decimalTolerancePercent: number;
    outlierPercent: number;
    minAverageSample: number;
  };
  days: number;
  truncated: boolean;
  scannedLineCount: number;
  blocking: boolean;
  flaggedLineCount: number;
  uncheckedLineCount: number;
  byKind: Record<PriceErrorKind, number>;
  rows: PriceErrorRow[];
}

const DAY_OPTIONS = [7, 30, 90];
const OUTLIER_OPTIONS = [30, 50, 100, 200];
const DOC_OPTIONS = ['all', 'retailsale', 'demand'] as const;

/** O'nlik xatosi va nol narx — eng o'tkir; qolganlari ogohlantirish. */
const TONE: Record<PriceErrorKind, 'destructive' | 'warning'> = {
  ZERO_PRICE: 'destructive',
  DECIMAL_SHIFT: 'destructive',
  BELOW_COST: 'warning',
  BELOW_WHOLESALE: 'warning',
  PRICE_OUTLIER: 'warning',
};

const KINDS: PriceErrorKind[] = [
  'DECIMAL_SHIFT',
  'ZERO_PRICE',
  'BELOW_COST',
  'BELOW_WHOLESALE',
  'PRICE_OUTLIER',
];

export default function MenejerXatoNarxPage() {
  const t = useTranslations('pages.menejerPriceErrors');
  const format = useFormatter();
  const [days, setDays] = useState(30);
  const [outlierPercent, setOutlierPercent] = useState(50);
  const [docType, setDocType] = useState<(typeof DOC_OPTIONS)[number]>('all');

  const { data, isLoading } = useQuery<PriceErrorsResponse>({
    queryKey: ['manager-price-errors', days, outlierPercent, docType],
    queryFn: () =>
      api.get<PriceErrorsResponse>(
        `/manager/inventory/price-errors?days=${days}&outlierPercent=${outlierPercent}${
          docType === 'all' ? '' : `&docType=${docType}`
        }`,
      ),
    refetchInterval: 300_000,
  });

  const rows = data?.rows ?? [];

  return (
    <div className="flex h-full flex-col gap-4 p-4" data-test-id="menejer-price-errors-page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-semibold text-xl">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{t('doc_type')}</span>
            <NativeSelect
              value={docType}
              onChange={(e) => setDocType(e.target.value as (typeof DOC_OPTIONS)[number])}
            >
              {DOC_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {t(`doc_${d}` as never)}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{t('outlier')}</span>
            <NativeSelect
              value={String(outlierPercent)}
              onChange={(e) => setOutlierPercent(Number(e.target.value))}
            >
              {OUTLIER_OPTIONS.map((p) => (
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span>{t('scanned_count', { count: data.scannedLineCount })}</span>
          <span className="font-medium">
            {t('flagged_count', { count: data.flaggedLineCount })}
          </span>
          {/* «0 xato» va «0 xato, lekin 400 qator tekshirilmadi» — bir xil xabar EMAS. */}
          {data.uncheckedLineCount > 0 && (
            <span className="text-muted-foreground">
              {t('unchecked_count', { count: data.uncheckedLineCount })}
            </span>
          )}
          {data.truncated && (
            <span className="text-muted-foreground">{t('truncated', { count: rows.length })}</span>
          )}
        </div>
      )}

      {data && data.flaggedLineCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {KINDS.filter((k) => (data.byKind[k] ?? 0) > 0).map((k) => (
            <Badge key={k} tone={TONE[k]}>
              {t(`kind_${k}` as never)}: {data.byKind[k]}
            </Badge>
          ))}
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
                <li key={r.lineId} className="flex flex-col gap-1 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{r.productName ?? t('no_product')}</span>
                      <span className="block truncate text-muted-foreground text-xs">
                        {t(`doc_${r.docType}` as never)}
                        {r.docName ? ` ${r.docName}` : ''} · {r.soldByName ?? t('no_actor')} ·{' '}
                        {format.dateTime(new Date(r.at), {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </span>

                    <span className="text-right tabular-nums">
                      <span className="block">{formatMoney(BigInt(r.priceMinor))}</span>
                      <span className="block text-muted-foreground text-xs">
                        {t('quantity_value', { quantity: r.quantity })}
                        {r.discountPercent > 0
                          ? ` · ${t('discount_value', { percent: r.discountPercent })}`
                          : ''}
                      </span>
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {r.findings.map((f) => (
                      <Badge key={f.kind} tone={TONE[f.kind]}>
                        {t(`kind_${f.kind}` as never)}
                        {f.factor != null ? ` ×${f.factor}` : ''}
                        {/* Mo'ljal — «nimaga taqqoslandi»; usiz belgi tekshirib bo'lmaydi. */}
                        {f.expectedMinor != null
                          ? ` · ${t('expected', {
                              value: formatMoney(BigInt(f.expectedMinor)),
                            })}`
                          : ''}
                        {f.amountMinor != null
                          ? ` · ${t('impact', { value: formatMoney(BigInt(f.amountMinor)) })}`
                          : ''}
                      </Badge>
                    ))}
                    {r.unchecked.map((u) => (
                      <Badge key={u} tone="neutral">
                        {t(`unchecked_${u}` as never)}
                      </Badge>
                    ))}
                    {r.referenceSource === 'card' && (
                      <span className="text-muted-foreground text-xs">{t('reference_live')}</span>
                    )}
                  </div>
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
