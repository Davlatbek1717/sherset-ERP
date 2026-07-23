'use client';

/**
 * «Ko'rish» — everything inside ONE address-storage cell (owner 2026-07-21
 * upgrade of the old «Содержимое ячейки» table): every product renders as a
 * BIG readable row — image, name, description, counted quantity — plus a
 * per-row «Ko'chirish» button that moves the product into another cell
 * (CellMoveTargetModal). Bound-but-uncounted products show with qty 0.
 *
 * Fed by GET /admin/stores/:storeId/cells/:cellId/stock (stock rows + bound
 * products, with description/mainImageId).
 */

import { CellMoveTargetModal } from '@/components/stores/cell-move-target-modal';
import { api } from '@/lib/api-client';
import { imageRawUrl } from '@/lib/image-url';
import { Button, Modal } from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';

interface ScanCell {
  id: string;
  name: string;
  barcode: string | null;
}

interface CellStockItem {
  assortmentKind: string;
  assortmentId: string;
  name: string;
  code: string | null;
  barcode: string | null;
  description: string | null;
  mainImageId: string | null;
  qty: string;
}
interface CellStockResponse {
  cell: { id: string; name: string; barcode: string | null };
  items: CellStockItem[];
}

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3))));

export function CellContentsModal({
  storeId,
  cell,
  cells,
  onClose,
  onChanged,
}: {
  storeId: string;
  cell: { id: string; name: string };
  /** All saved cells of the store — the «Ko'chirish» target list. */
  cells: ScanCell[];
  onClose: () => void;
  /** Fires after a successful move so the parent refreshes its tables. */
  onChanged?: () => void;
}) {
  const t = useTranslations('pages.stores.address_storage');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();
  const [moveFor, setMoveFor] = useState<CellStockItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, isLoading } = useQuery<CellStockResponse>({
    queryKey: ['cell-contents', storeId, cell.id],
    queryFn: () => api.get<CellStockResponse>(`/admin/stores/${storeId}/cells/${cell.id}/stock`),
  });
  const items = (data?.items ?? []).filter((i) => i.assortmentKind === 'product');
  const total = items.reduce((acc, i) => acc + (Number(i.qty) || 0), 0);

  return (
    <>
      <Modal
        open
        onOpenChange={(o) => {
          if (!o) onClose();
        }}
        title={`${t('contents_title')} ${cell.name}`}
        widthClass="w-[560px] max-w-[96vw]"
        closeLabel={tCommon('close')}
        testId="cell-contents-modal"
      >
        <div className="flex flex-col gap-2 px-4 py-4">
          {/* Move-success announcement («[Mahsulot] [yacheyka]ga ko'chirildi»). */}
          {notice && (
            <p
              className="rounded-[var(--ms-radius-default)] border border-[var(--ms-success-500,#3a9c4e)] bg-[var(--ms-success-50,#f0f9f1)] px-3 py-2 font-medium text-[13px] text-[var(--ms-success-600,#1c7c31)]"
              data-test-id="cell-contents-notice"
            >
              {notice}
            </p>
          )}
          {isLoading ? (
            <p className="text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</p>
          ) : items.length === 0 ? (
            <p className="text-[var(--ms-text-muted)] text-sm" data-test-id="cell-contents-empty">
              {t('contents_empty')}
            </p>
          ) : (
            <>
              <ul className="flex max-h-[420px] flex-col gap-2 overflow-y-auto">
                {items.map((i) => (
                  <li
                    key={`${i.assortmentKind}-${i.assortmentId}`}
                    className="flex items-center gap-3 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-3 py-2.5"
                    data-test-id="cell-contents-row"
                  >
                    {/* Image (falls back to the name initial). */}
                    {i.mainImageId ? (
                      <img
                        src={imageRawUrl(i.mainImageId)}
                        alt=""
                        loading="lazy"
                        className="h-12 w-12 shrink-0 rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-subtle)] object-cover"
                      />
                    ) : (
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--ms-radius-sm)] bg-[var(--ms-bg-muted)] font-medium text-[var(--ms-text-muted)] text-sm">
                        {i.name[0]?.toUpperCase() ?? '·'}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <Link
                        href={`/products/${i.assortmentId}`}
                        className="block truncate font-medium text-[14px] text-[var(--ms-text-brand)]"
                      >
                        {i.name}
                      </Link>
                      {i.description && (
                        <span className="mt-0.5 line-clamp-2 block text-[12px] text-[var(--ms-text-muted)]">
                          {i.description}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-right">
                      <span
                        className="block font-semibold text-[16px] tabular-nums"
                        data-test-id={`cell-contents-qty-${i.assortmentId}`}
                      >
                        {fmtQty(Number(i.qty) || 0)}
                      </span>
                      <span className="block text-[11px] text-[var(--ms-text-muted)]">
                        {t('contents_col_qty')}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setNotice(null);
                        setMoveFor(i);
                      }}
                      data-test-id={`cell-contents-move-${i.assortmentId}`}
                    >
                      {t('move_button')}
                    </Button>
                  </li>
                ))}
              </ul>
              <p className="flex items-center justify-between px-1 pt-1 text-sm">
                <span className="font-semibold">{t('contents_total')}</span>
                <span className="font-semibold tabular-nums" data-test-id="cell-contents-total">
                  {fmtQty(total)}
                </span>
              </p>
            </>
          )}
        </div>
      </Modal>

      {moveFor && (
        <CellMoveTargetModal
          open
          onOpenChange={(o) => {
            if (!o) setMoveFor(null);
          }}
          storeId={storeId}
          cells={cells}
          product={{ id: moveFor.assortmentId, name: moveFor.name }}
          fromCell={cell}
          qty={moveFor.qty}
          onMoved={(msg) => {
            setMoveFor(null);
            setNotice(msg);
            void queryClient.invalidateQueries({ queryKey: ['cell-contents', storeId] });
            onChanged?.();
          }}
        />
      )}
    </>
  );
}
