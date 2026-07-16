'use client';

/**
 * Yacheyka tanlash — tovar kartochkasidagi QIDIRUVLI dropdown (2026-07-16
 * talab §10): ombor kartochkalarida yaratilgan BARCHA yacheykalar registri
 * (/admin/store-cells) bo'yicha type-to-search; tanlanganda tovarning asosiy
 * loc* segmentlari shu kodga to'ldiriladi (saqlash — formaning odatiy Save
 * oqimi, optimistic-lock buzilmaydi).
 *
 * Band-tekshiruv: tanlangan kodga /products/cell/:code so'raladi — boshqa
 * tovar (excludeProductId'dan farqli) allaqachon o'tirgan bo'lsa OGOHLANTIRISH
 * chiqadi («Bu yacheykada mahsulot mavjud»), lekin amal BLOKLANMAYDI (talab:
 * ruxsat beriladi).
 */

import { api } from '@/lib/api-client';
import { CatalogPickerField, type PickerItem } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface CellSearchItem {
  id: string;
  code: string;
  shelf: string | null;
  storeName: string | null;
}

interface CellContents {
  items: Array<{ id: string }>;
}

export function CellPickerField({
  onSelect,
  excludeProductId,
  testId = 'field-cell-picker',
}: {
  /** Tanlangan yacheyka kodi («NN-NN-NN-NN») — chaqiruvchi loc* ni to'ldiradi. */
  onSelect: (code: string) => void;
  /** Edit-formada joriy tovar — o'zi o'tirgan yacheyka «band» sanalmaydi. */
  excludeProductId?: string;
  testId?: string;
}) {
  const t = useTranslations('pages.product_new');
  const [picked, setPicked] = useState<{ id: string; label: string } | null>(null);

  const fetcher = async (search: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: CellSearchItem[] }>(
      `/admin/store-cells?search=${encodeURIComponent(search)}&limit=50`,
    );
    return d.items.map((c) => ({
      id: c.id,
      primary: c.code,
      secondary: [c.shelf, c.storeName].filter(Boolean).join(' · ') || undefined,
    }));
  };

  // Band-tekshiruv — tanlangandan keyin (bloklamaydi, faqat ogohlantiradi).
  const code = picked?.label ?? null;
  const occupancy = useQuery<CellContents>({
    queryKey: ['cell-contents', code],
    queryFn: () => api.get<CellContents>(`/products/cell/${code}`),
    enabled: !!code,
    staleTime: 15_000,
  });
  const occupied = !!(code && (occupancy.data?.items ?? []).some((i) => i.id !== excludeProductId));

  return (
    <div className="flex flex-col gap-1">
      <CatalogPickerField
        value={picked}
        onPick={() => undefined}
        onClear={() => setPicked(null)}
        inlineFetcher={fetcher}
        onInlineSelect={(item) => {
          const codeStr = String(item.primary);
          setPicked({ id: item.id, label: codeStr });
          onSelect(codeStr);
        }}
        testId={testId}
      />
      {occupied && (
        <p className="text-amber-600 text-xs" data-test-id="cell-picker-occupied">
          ⚠️ {t('loc_cell_occupied')}
        </p>
      )}
    </div>
  );
}
