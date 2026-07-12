'use client';

/**
 * Ro'yxat qatoridagi 📍 trigger → MODAL (2026-07-12, v2).
 *
 * v1 kichik dropdown edi — jadval katagi ichida qisilib, o'qib bo'lmas holda
 * ochilardi (foydalanuvchi skrinshot bilan qaytardi). Endi bosilganda
 * markazda to'laqonli Modal ochiladi: tovar nomi sarlavhada, ichida barcha
 * joylar (asosiy + qo'shimcha polkalar) sonlari bilan keng jadval, ostida
 * polkalar-jami vs ombordagi haqiqiy qoldiq mosligi (✓/⚠️).
 *
 * Ma'lumot faqat modal ochilganda yuklanadi (scan endpoint, react-query
 * keshi) — ro'yxat og'irlashmaydi. stopPropagation — qator-klik
 * navigatsiyasi otilib ketmasin.
 */

import { api } from '@/lib/api-client';
import { formatBinLocation } from '@/lib/bin-location';
import { Badge, Modal } from '@moysklad/ui';
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
  balances: Array<{ storeId: string; storeName: string | null; qty: string }>;
  totalQty: number;
}

export function ProductLocationsPopover({
  productId,
  productName,
  primaryLabel,
}: {
  productId: string;
  productName: string;
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
  const rows: Array<{ code: string; note: string | null; qty: string | null; primary: boolean }> =
    [];
  if (p) {
    const primary = formatBinLocation(p);
    if (primary) {
      rows.push({
        code: primary,
        note: t('loc_summary_primary'),
        qty: p.locQty == null || p.locQty === '' ? null : String(p.locQty),
        primary: true,
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
        note: l.note,
        qty: l.qty,
        primary: false,
      });
    }
  }
  const tracked = rows.filter((r) => r.qty != null);
  const binsTotal = tracked.reduce((s, r) => s + Number(r.qty), 0);
  const warehouseTotal = scan.data?.totalQty ?? null;
  const comparable = rows.length > 0 && tracked.length === rows.length && warehouseTotal != null;
  const matches = comparable && Math.abs(binsTotal - (warehouseTotal as number)) < 0.000001;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: ichki tugma klaviaturani boshqaradi; wrapper faqat qator-klik navigatsiyasini to'xtatadi
    <span className="inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded px-1 font-mono text-[var(--ms-text-secondary)] text-xs tabular-nums tracking-wider hover:bg-[var(--ms-bg-hover)] hover:text-[var(--ms-text-primary)]"
        aria-label={t('loc_summary_title')}
        data-test-id={`loc-popover-${productId}`}
      >
        {primaryLabel || '—'}
        <span aria-hidden>📍</span>
      </button>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={`📍 ${productName}`}
        description={t('loc_summary_title')}
        widthClass="w-[520px]"
        testId="loc-modal"
      >
        {scan.isLoading && (
          <div className="py-6 text-center text-[var(--ms-text-muted)] text-sm">…</div>
        )}

        {!scan.isLoading && rows.length === 0 && (
          <div className="py-4 text-[var(--ms-text-muted)] text-sm">{t('loc_popover_empty')}</div>
        )}

        {rows.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-[var(--ms-border-default)] border-b text-left text-[var(--ms-text-muted)] text-xs">
                <th className="py-2">{t('loc_col_address')}</th>
                <th className="py-2">{t('loc_col_note')}</th>
                <th className="py-2 text-right">{t('loc_col_qty')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.code + (r.primary ? '-p' : (r.note ?? ''))}
                  className="border-[var(--ms-border-default)] border-b last:border-0"
                >
                  <td className="py-2 font-mono font-semibold tabular-nums tracking-wider">
                    {r.code}
                  </td>
                  <td className="py-2 text-[var(--ms-text-muted)]">
                    {r.primary ? t('loc_summary_primary') : (r.note ?? '')}
                  </td>
                  <td className="py-2 text-right font-semibold tabular-nums">
                    {r.qty != null ? fmt(r.qty) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="pt-3 font-medium" colSpan={2}>
                  {t('loc_summary_bins_total')}
                </td>
                <td className="pt-3 text-right font-bold tabular-nums">{fmt(binsTotal)}</td>
              </tr>
              {warehouseTotal != null && (
                <tr>
                  <td className="pt-1 text-[var(--ms-text-muted)]" colSpan={2}>
                    {t('loc_summary_warehouse')}
                  </td>
                  <td className="pt-1 text-right tabular-nums">{fmt(warehouseTotal)}</td>
                </tr>
              )}
            </tfoot>
          </table>
        )}

        {comparable && (
          <div className="mt-3">
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
          <div className="mt-3 text-[var(--ms-text-muted)] text-xs">
            {t('loc_summary_untracked')}
          </div>
        )}
      </Modal>
    </span>
  );
}
