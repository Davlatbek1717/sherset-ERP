'use client';

/**
 * «JOYLASHUVLAR BO'YICHA TAQSIMOT» — o'qish paneli (2026-07-12 talab).
 *
 * Savolga javob beradi: «bu tovardan jami nechta bor va AYNAN QAYERLARDA
 * qanchadan turibdi?» Asosiy joy + barcha qo'shimcha polkalar bitta jadvalda,
 * ostida ikki jami:
 *   • polkalardagi jami (kiritilgan sonlar yig'indisi)
 *   • ombordagi haqiqiy qoldiq (hujjatlar daftaridan)
 * Farq bo'lsa ⚠️ ogohlantirish chiqadi — «polkalarda 500 yozilgan, omborda
 * 480» kabi nomuvofiqlik endi ko'rinmas bo'lib qolmaydi (audit topgan
 * kamchilik). Sonlar kiritilmagan joylar «—» bilan, jami'ga qo'shilmaydi.
 */

import { api } from '@/lib/api-client';
import { formatBinLocation } from '@/lib/bin-location';
import { Badge } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

interface LocRow {
  code: string;
  qty: string | null;
  note: string | null;
  primary: boolean;
}

interface ScanInfo {
  balances: Array<{ storeName: string | null; qty: string; reservedQty: string }>;
  totalQty: number;
}

export function ProductLocationSummary({
  productId,
  locSklad,
  locPolka,
  locQavat,
  locYacheyka,
  locQty,
  extraLocations,
}: {
  productId: string;
  locSklad: number | null;
  locPolka: number | null;
  locQavat: number | null;
  locYacheyka: number | null;
  locQty: string | number | null;
  extraLocations: Array<{
    sklad: number;
    polka: number | null;
    qavat: number | null;
    yacheyka: number | null;
    qty: string | null;
    note: string | null;
  }>;
}) {
  const t = useTranslations('pages.products');

  // Ombordagi haqiqiy qoldiq — scan endpointidan (hujjatlar daftari).
  const stock = useQuery({
    queryKey: ['products', 'scan-info', productId],
    queryFn: () => api.get<ScanInfo>(`/products/${productId}/scan`),
    staleTime: 30_000,
  });

  const rows: LocRow[] = [];
  const primaryCode = formatBinLocation({ locSklad, locPolka, locQavat, locYacheyka });
  if (primaryCode) {
    rows.push({
      code: primaryCode,
      qty: locQty == null || locQty === '' ? null : String(locQty),
      note: null,
      primary: true,
    });
  }
  for (const l of extraLocations) {
    rows.push({
      code: formatBinLocation({
        locSklad: l.sklad,
        locPolka: l.polka,
        locQavat: l.qavat,
        locYacheyka: l.yacheyka,
      }),
      qty: l.qty,
      note: l.note,
      primary: false,
    });
  }

  if (rows.length === 0) return null; // joylashuv kiritilmagan — panel shart emas

  const fmt = (v: string | number): string =>
    Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 3 });

  const tracked = rows.filter((r) => r.qty != null);
  const binsTotal = tracked.reduce((s, r) => s + Number(r.qty), 0);
  const warehouseTotal = stock.data?.totalQty ?? null;
  // Moslik: hamma joyda son kiritilgan bo'lsagina solishtirish ma'noli.
  const comparable = tracked.length === rows.length && warehouseTotal != null;
  const matches = comparable && Math.abs(binsTotal - warehouseTotal) < 0.000001;

  return (
    <div
      className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-3"
      data-test-id="location-summary"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-sm">📍 {t('loc_summary_title')}</span>
        {warehouseTotal != null && (
          <span className="text-[var(--ms-text-muted)] text-xs">
            {t('loc_summary_warehouse')}: <b className="tabular-nums">{fmt(warehouseTotal)}</b>
          </span>
        )}
      </div>

      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.code + (r.primary ? '-p' : '')}
              className="border-[var(--ms-border-default)] border-b last:border-0"
            >
              <td className="py-1.5 font-mono tabular-nums tracking-wider">{r.code}</td>
              <td className="py-1.5 text-[var(--ms-text-muted)] text-xs">
                {r.primary ? t('loc_summary_primary') : (r.note ?? '')}
              </td>
              <td className="py-1.5 text-right font-semibold tabular-nums">
                {r.qty != null ? fmt(r.qty) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="pt-2 font-medium" colSpan={2}>
              {t('loc_summary_bins_total')}
            </td>
            <td className="pt-2 text-right font-bold tabular-nums">{fmt(binsTotal)}</td>
          </tr>
        </tfoot>
      </table>

      {/* Moslik holati — audit topgan «ko'rinmas farq» endi ko'rinadi. */}
      {comparable && (
        <div className="mt-2">
          {matches ? (
            <Badge tone="success">✓ {t('loc_summary_match')}</Badge>
          ) : (
            <Badge tone="destructive">
              ⚠️ {t('loc_summary_mismatch')}: {fmt(binsTotal)} ≠ {fmt(warehouseTotal as number)}
            </Badge>
          )}
        </div>
      )}
      {!comparable && rows.length > tracked.length && (
        <div className="mt-2 text-[var(--ms-text-muted)] text-xs">{t('loc_summary_untracked')}</div>
      )}
    </div>
  );
}
