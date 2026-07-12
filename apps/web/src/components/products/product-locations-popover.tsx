'use client';

/**
 * Ro'yxat qatoridagi 📍 popover (2026-07-12 talab): tovar USTIDA turib,
 * kartochkaga kirmasdan «qayerda qanchadan» ko'rish.
 *
 * Bosilganda /products/:id/scan dan (bitta so'rov) asosiy joy + barcha
 * qo'shimcha polkalar sonlari bilan mini-jadval ochiladi; ostida polkalar
 * jami vs ombordagi haqiqiy qoldiq (farq bo'lsa qizil). Ma'lumot faqat
 * ochilganda yuklanadi (ro'yxat og'irlashmaydi) va react-query keshida
 * qoladi. stopPropagation — qator-klik navigatsiyasi otilib ketmasin.
 */

import { api } from '@/lib/api-client';
import { formatBinLocation } from '@/lib/bin-location';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface ScanInfo {
  product: {
    locSklad: number | null;
    locPolka: number | null;
    locQavat: number | null;
    locYacheyka: number | null;
    locQty?: string | number | null;
    extraLocations?: Array<{
      sklad: number;
      polka: number | null;
      qavat: number | null;
      yacheyka: number | null;
      qty: string | null;
      note: string | null;
    }>;
  };
  totalQty: number;
}

export function ProductLocationsPopover({
  productId,
  primaryLabel,
}: {
  productId: string;
  primaryLabel: string;
}) {
  const t = useTranslations('pages.products');
  const [open, setOpen] = useState(false);

  const scan = useQuery({
    queryKey: ['products', 'scan-info', productId],
    queryFn: () => api.get<ScanInfo>(`/products/${productId}/scan`),
    enabled: open,
    staleTime: 30_000,
  });

  const fmt = (v: string | number): string =>
    Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 3 });

  const p = scan.data?.product;
  const rows: Array<{ code: string; qty: string | null; note: string | null }> = [];
  if (p) {
    const primary = formatBinLocation(p);
    if (primary) {
      rows.push({
        code: primary,
        qty: p.locQty == null || p.locQty === '' ? null : String(p.locQty),
        note: t('loc_summary_primary'),
      });
    }
    for (const l of p.extraLocations ?? []) {
      rows.push({
        code: formatBinLocation({
          locSklad: l.sklad,
          locPolka: l.polka,
          locQavat: l.qavat,
          locYacheyka: l.yacheyka,
        }),
        qty: l.qty,
        note: l.note,
      });
    }
  }
  const tracked = rows.filter((r) => r.qty != null);
  const binsTotal = tracked.reduce((s, r) => s + Number(r.qty), 0);
  const warehouseTotal = scan.data?.totalQty ?? null;
  const comparable = rows.length > 0 && tracked.length === rows.length && warehouseTotal != null;
  const matches = comparable && Math.abs(binsTotal - (warehouseTotal as number)) < 0.000001;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: ichki tugma klaviaturani boshqaradi; wrapper faqat qator-navigatsiyani to'xtatadi
    <span className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded px-1 font-mono text-[var(--ms-text-secondary)] text-xs tabular-nums tracking-wider hover:bg-[var(--ms-bg-hover)] hover:text-[var(--ms-text-primary)]"
        aria-label={t('loc_summary_title')}
        data-test-id={`loc-popover-${productId}`}
      >
        {primaryLabel || '—'}
        <span aria-hidden>📍</span>
      </button>

      {open && (
        <>
          {/* Tashqariga bosilganda yopish uchun shaffof qatlam */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: vizual bo'lmagan yopish-qatlami */}
          <span className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <span
            className="absolute right-0 z-50 mt-1 block w-[280px] rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-3 text-left shadow-lg"
            data-test-id="loc-popover-card"
          >
            <span className="mb-2 block font-semibold text-xs">📍 {t('loc_summary_title')}</span>
            {scan.isLoading && (
              <span className="block py-2 text-[var(--ms-text-muted)] text-xs">…</span>
            )}
            {!scan.isLoading && rows.length === 0 && (
              <span className="block py-1 text-[var(--ms-text-muted)] text-xs">
                {t('loc_popover_empty')}
              </span>
            )}
            {rows.map((r) => (
              <span
                key={r.code + (r.note ?? '')}
                className="flex items-center justify-between gap-2 border-[var(--ms-border-default)] border-b py-1 text-xs last:border-0"
              >
                <span className="font-mono tabular-nums tracking-wider">{r.code}</span>
                <span className="min-w-0 flex-1 truncate text-[var(--ms-text-muted)]">
                  {r.note ?? ''}
                </span>
                <span className="font-semibold tabular-nums">
                  {r.qty != null ? fmt(r.qty) : '—'}
                </span>
              </span>
            ))}
            {rows.length > 0 && (
              <span className="mt-1.5 flex items-center justify-between text-xs">
                <span className="font-medium">{t('loc_summary_bins_total')}</span>
                <span className="font-bold tabular-nums">{fmt(binsTotal)}</span>
              </span>
            )}
            {warehouseTotal != null && (
              <span className="mt-0.5 flex items-center justify-between text-[var(--ms-text-muted)] text-xs">
                <span>{t('loc_summary_warehouse')}</span>
                <span className="tabular-nums">{fmt(warehouseTotal)}</span>
              </span>
            )}
            {comparable && (
              <span
                className={[
                  'mt-1.5 block rounded px-1.5 py-0.5 font-medium text-xs',
                  matches
                    ? 'bg-[var(--ms-success-50)] text-[var(--ms-success-700)]'
                    : 'bg-[var(--ms-destructive-50)] text-[var(--ms-destructive-700)]',
                ].join(' ')}
              >
                {matches
                  ? `✓ ${t('loc_summary_match')}`
                  : `⚠️ ${t('loc_summary_mismatch')}: ${fmt(binsTotal)} ≠ ${fmt(warehouseTotal as number)}`}
              </span>
            )}
          </span>
        </>
      )}
    </span>
  );
}
