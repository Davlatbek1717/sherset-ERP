'use client';

import { api } from '@/lib/api-client';
import { Input, useDebounce } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { STATUS_DOT, fmtMoney } from '../_lib/format';
import type { CountProductRow, ProductsResponse, Status } from '../_lib/types';

/**
 * Sanab kiritish — chap qidiruv, jadval (REGOS qoldig'i + sotuv narxi + Kam/Ko'p
 * input + holat belgisi). Blur'da avtomatik saqlanadi, ham-Kam-ham-Ko'p mutually
 * exclusive (birinchisini yozsa ikkinchisi bo'shaydi). Reference parity:
 * `inventory/count/count-view.tsx` (614 satr) — bu loyihaning sodda variantasi;
 * count-modal pattern keyingi P-I iteratsiyasida.
 */
export function CountingView() {
  const t = useTranslations('pages.analitika_inventory');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);

  const params = new URLSearchParams(search ? { search } : {});
  const { data, isLoading } = useQuery<ProductsResponse>({
    queryKey: ['analitika', 'count-products', search],
    queryFn: () => api.get<ProductsResponse>(`/analitika/counts/products?${params.toString()}`),
  });

  const storeId = data?.storeId ?? null;
  const items = data?.items ?? [];

  return (
    <div className="space-y-3">
      <Input
        value={searchInput}
        placeholder={t('search_ph')}
        onChange={(e) => setSearchInput(e.target.value)}
        className="max-w-md"
      />

      {storeId === null && !isLoading && (
        <p className="text-[var(--ms-text-muted)] text-sm">{t('no_store')}</p>
      )}

      {storeId !== null && (
        <div className="overflow-x-auto rounded-lg border border-[var(--ms-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--ms-bg-subtle)] text-[var(--ms-text-muted)] text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t('col_product')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('col_code')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('col_regos')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('col_price')}</th>
                <th className="px-3 py-2 text-center font-medium">{t('col_kam')}</th>
                <th className="px-3 py-2 text-center font-medium">{t('col_kop')}</th>
                <th className="px-3 py-2 text-center font-medium">{t('col_status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ms-border)]">
              {items.map((row) => (
                <CountRow key={row.productId} row={row} storeId={storeId} />
              ))}
              {items.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-[var(--ms-text-muted)]">
                    {t('no_products')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CountRow({ row, storeId }: { row: CountProductRow; storeId: string }) {
  const qc = useQueryClient();
  const [kam, setKam] = useState(row.kamQty ? String(row.kamQty) : '');
  const [kop, setKop] = useState(row.kopQty ? String(row.kopQty) : '');
  const [status, setStatus] = useState<Status | null>(row.status);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      api.put<{ cleared: true } | { status: Status }>('/analitika/counts', {
        productId: row.productId,
        storeId,
        kamQty: Number(kam) || 0,
        kopQty: Number(kop) || 0,
      }),
    onSuccess: (res) => {
      setStatus('cleared' in res ? null : res.status);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      qc.invalidateQueries({ queryKey: ['analitika', 'count-summary'] });
    },
  });

  // Persist on blur only when the value actually changed.
  const commit = () => {
    const nextKam = Number(kam) || 0;
    const nextKop = Number(kop) || 0;
    if (nextKam !== row.kamQty || nextKop !== row.kopQty) save.mutate();
  };

  return (
    <tr className="hover:bg-[var(--ms-bg-subtle)]">
      <td className="px-3 py-2 text-[var(--ms-text-primary)]">{row.name}</td>
      <td className="px-3 py-2 text-[var(--ms-text-muted)]">{row.code ?? '—'}</td>
      <td className="px-3 py-2 text-right tabular-nums">{row.expectedQty}</td>
      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(row.salePriceMinor)}</td>
      <td className="px-2 py-1">
        <Input
          type="number"
          value={kam}
          onChange={(e) => {
            setKam(e.target.value);
            if (Number(e.target.value) > 0) setKop('');
          }}
          onBlur={commit}
          className="w-20 text-right"
        />
      </td>
      <td className="px-2 py-1">
        <Input
          type="number"
          value={kop}
          onChange={(e) => {
            setKop(e.target.value);
            if (Number(e.target.value) > 0) setKam('');
          }}
          onBlur={commit}
          className="w-20 text-right"
        />
      </td>
      <td className="px-3 py-2 text-center">
        {save.isPending ? (
          <span className="text-[var(--ms-text-muted)] text-xs">…</span>
        ) : status ? (
          <span
            className={`inline-block h-3 w-3 rounded-full ${STATUS_DOT[status]}`}
            title={status}
          />
        ) : saved ? (
          <span className="text-[var(--ms-success-600)] text-xs">✓</span>
        ) : null}
      </td>
    </tr>
  );
}
