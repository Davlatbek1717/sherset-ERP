'use client';

/**
 * «+ Ячейка» — inventarizatsiya yacheyka-tabida tovar guruhiga YANGI yacheyka
 * qatori qo'shish (reja: docs/plans/2026-08-23-ombor-restrukturizatsiya.md, F2).
 * Omborchi tizim bilmagan yacheykaga ham sanab kirita olsin — tovar aslida
 * 03-… yacheykada yotgan bo'lsa, shu yerdan kiritiladi.
 *
 * Ikki yo'l, bitta control:
 *   • kod terish (skaner-do'st): input Enter'da kod AYNAN mos yacheykani oladi,
 *     topilmasa aniq xato («NN-SS-QQ-OO» ko'rinishidagi kod bilan);
 *   • tanlagich: input ostidagi ro'yxat (yozilgan matn bo'yicha filtrlangan)
 *     bosib tanlanadi.
 *
 * Panel INLINE ochiladi (portal emas): qator o'z balandligini kengaytiradi,
 * StickyHScroll ichida stacking-context muammosi yo'q. Ma'lumot — mavjud
 * GET /admin/stores/:id/address-storage (cell-picker-field bilan bir endpoint),
 * ochilganda lazily yuklanadi.
 */

import { api } from '@/lib/api-client';
import { Button, Icons, Input } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

export interface AddCellOption {
  id: string;
  name: string;
}

interface AddressStorageResponse {
  cells: Array<{ id: string; name: string }>;
}

/**
 * Kod → yacheyka (aniq moslik, trim bilan). Ro'yxatdan topilmasa null —
 * chaqiruvchi «topilmadi» xatosini ko'rsatadi. Katta-kichik harf farqlanmaydi
 * (kodlar raqam-defis, lekin qo'lda terilgan harfli nomlar ham yashasin).
 */
export function resolveCellByCode(cells: AddCellOption[], code: string): AddCellOption | null {
  const needle = code.trim().toLowerCase();
  if (!needle) return null;
  return cells.find((c) => c.name.trim().toLowerCase() === needle) ?? null;
}

export function InventoryAddCell({
  storeId,
  existingCellIds,
  onAdd,
  testId = 'inventory-add-cell',
}: {
  storeId: string | null;
  /** (tovar × yacheyka) allaqachon gridda bor id'lar — dublikat qo'shilmaydi. */
  existingCellIds: Set<string>;
  onAdd: (cell: AddCellOption) => void;
  testId?: string;
}) {
  const t = useTranslations('pages.inventories');
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery<AddressStorageResponse>({
    queryKey: ['inventory-add-cell', storeId],
    queryFn: () =>
      api.get<AddressStorageResponse>(
        `/admin/stores/${storeId}/address-storage?assortmentKind=product`,
      ),
    enabled: open && !!storeId,
    staleTime: 30_000,
  });
  const cells = data?.cells ?? [];

  // Skaner-oqim: panel ochilganda fokus darhol kod maydonida.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const commit = (cell: AddCellOption) => {
    if (existingCellIds.has(cell.id)) {
      setError(t('add_cell_exists', { code: cell.name }));
      return;
    }
    onAdd(cell);
    setCode('');
    setError(null);
    // Skaner ketma-ket yacheyka o'qiydi — panel ochiq qoladi, fokus qaytadi.
    inputRef.current?.focus();
  };

  const submitCode = () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    const found = resolveCellByCode(cells, trimmed);
    if (!found) {
      setError(t('add_cell_not_found', { code: trimmed }));
      return;
    }
    commit(found);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!storeId}
        className="inline-flex items-center gap-1 text-[var(--ms-text-brand)] text-sm hover:underline disabled:opacity-50"
        data-test-id={`${testId}-open`}
      >
        <Icons.create className="h-3.5 w-3.5" aria-hidden />
        {t('add_cell')}
      </button>
    );
  }

  const filtered = code.trim()
    ? cells.filter((c) => c.name.toLowerCase().includes(code.trim().toLowerCase()))
    : cells;

  return (
    <div className="flex max-w-[420px] flex-col gap-1" data-test-id={testId}>
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submitCode();
            }
            if (e.key === 'Escape') {
              setOpen(false);
              setCode('');
              setError(null);
            }
          }}
          placeholder={t('add_cell_placeholder')}
          className="h-7 w-48"
          data-test-id={`${testId}-code`}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={submitCode}
          data-test-id={`${testId}-submit`}
        >
          {t('add_cell_confirm')}
        </Button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setCode('');
            setError(null);
          }}
          className="text-[var(--ms-text-muted)] text-sm hover:underline"
          data-test-id={`${testId}-close`}
        >
          {t('add_cell_cancel')}
        </button>
      </div>
      {error && (
        <div className="text-[var(--ms-text-danger)] text-xs" data-test-id={`${testId}-error`}>
          {error}
        </div>
      )}
      <div className="max-h-40 overflow-auto rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]">
        {isLoading && <div className="px-2 py-1.5 text-[var(--ms-text-muted)] text-sm">…</div>}
        {!isLoading && filtered.length === 0 && (
          <div className="px-2 py-1.5 text-[var(--ms-text-muted)] text-sm">
            {t('add_cell_empty')}
          </div>
        )}
        {!isLoading &&
          filtered.slice(0, 50).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => commit({ id: c.id, name: c.name })}
              className="flex w-full items-center px-2 py-1 text-left text-sm hover:bg-[var(--ms-bg-muted)]"
              data-test-id={`${testId}-opt-${c.id}`}
            >
              {c.name}
            </button>
          ))}
      </div>
    </div>
  );
}
