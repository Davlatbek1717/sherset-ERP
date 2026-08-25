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
 *
 * «Chiqarish» (egasi 2026-08-25). Bog'lanishni MAQSADSIZ uzish — ilgari faqat
 * ikki aylanma yo'l bor edi: «Ko'chirish» (majburan boshqa yacheyka talab
 * qiladi) yoki `+` skan oynasining «almashtirish» rejimi (majburan boshqa
 * mahsulot talab qiladi). Marshrut allaqachon tayyor edi:
 * `DELETE /admin/stores/:storeId/cells/:cellId/products/:productId` →
 * `StoreAddressService.unassignProduct` — `ProductCellLink` qatorini o'chiradi
 * va uy-yacheyka bo'lsa `__yacheyka`/`__polka` atributlarini ham tozalaydi.
 *
 * ⚠️ Q1 QULFI (egasi 2026-08-11) shu tugmaning ham ustidan yuradi: yacheykada
 * hisoblangan qoldiq bo'lsa server 409 `CELL_STOCK_NOT_EMPTY` qaytaradi —
 * hujjatsiz stok o'zgarmaydi. Shuning uchun tugma qoldiqli qatorda O'CHIQ
 * (sababi `title` da aytiladi), 409 esa baribir ishlanadi: `qty` so'rov
 * suratidan keladi va bosish payti boshqa sessiya sanoq yozib ulgurishi
 * mumkin. Xom server matnida mahsulot NOMI yo'q (faqat id), shuning uchun
 * xabar nom bilan qayta yoziladi — `cell-scan-bind-modal` dagi bir xil naqsh.
 */

import { CellMoveTargetModal } from '@/components/stores/cell-move-target-modal';
import { usePermissions } from '@/hooks/use-permissions';
import { api } from '@/lib/api-client';
import { imageRawUrl } from '@/lib/image-url';
import { Button, Modal, useConfirm } from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useCallback, useState } from 'react';

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
  /** Fires after a successful move/unassign so the parent refreshes its tables. */
  onChanged?: () => void;
}) {
  const t = useTranslations('pages.stores.address_storage');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();
  const { confirm } = useConfirm();
  // TZ v3 §3 ASSIMETRIYASI (egasi 2026-08-11 · Q2): bog'lanishni CHIQARIB
  // tashlash `store.update` talab qiladi — omborchida (`storekeeper`) u
  // ATAYLAB yo'q (`storecell.update` bilan bog'lay/sanay oladi, chiqara
  // olmaydi; `store-cell-permission.test.ts` shuni qulflaydi). Shuning uchun
  // tugma unga KO'RINMAYDI — aks holda har bosishda 403 olardi.
  const { can } = usePermissions();
  const mayUnassign = can('store', 'update');
  const [moveFor, setMoveFor] = useState<CellStockItem | null>(null);
  /** Success AND failure land in the same banner — nothing resolves silently. */
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  /** Product id whose DELETE is in flight (per-row spinner). */
  const [unassigning, setUnassigning] = useState<string | null>(null);

  const { data, isLoading } = useQuery<CellStockResponse>({
    queryKey: ['cell-contents', storeId, cell.id],
    queryFn: () => api.get<CellStockResponse>(`/admin/stores/${storeId}/cells/${cell.id}/stock`),
  });
  const items = (data?.items ?? []).filter((i) => i.assortmentKind === 'product');
  const total = items.reduce((acc, i) => acc + (Number(i.qty) || 0), 0);

  const unassign = useCallback(
    async (item: CellStockItem) => {
      const ok = await confirm({
        title: t('unassign_confirm_title', { product: item.name, cell: cell.name }),
        description: t('unassign_confirm_body'),
        confirmLabel: t('unassign_button'),
        cancelLabel: tCommon('cancel'),
        tone: 'destructive',
      });
      if (ok !== true) return;
      setNotice(null);
      setUnassigning(item.assortmentId);
      try {
        const res = await api.delete<{ unassigned: boolean }>(
          `/admin/stores/${storeId}/cells/${cell.id}/products/${item.assortmentId}`,
        );
        // Server IDEMPOTENT: bog'lanish topilmasa `{unassigned:false}` qaytaradi,
        // throw qilmaydi (store-address.service.ts). Bu xato emas — lekin JIM
        // ham o'tmaydi: ro'yxat eskirgan bo'lishi mumkin va omborchi «bosdim,
        // hech narsa bo'lmadi» holatida qolmasligi kerak.
        setNotice(
          res?.unassigned === false
            ? { kind: 'err', text: t('unassign_noop', { product: item.name, cell: cell.name }) }
            : { kind: 'ok', text: t('unassign_success', { product: item.name, cell: cell.name }) },
        );
        void queryClient.invalidateQueries({ queryKey: ['cell-contents', storeId] });
        onChanged?.();
      } catch (e) {
        const err = e as { status?: number; body?: { code?: string; qty?: string; cell?: string } };
        setNotice({
          kind: 'err',
          text:
            err.status === 409 && err.body?.code === 'CELL_STOCK_NOT_EMPTY'
              ? t('unassign_blocked', {
                  product: item.name,
                  cell: err.body.cell ?? cell.name,
                  qty: err.body.qty ?? '?',
                })
              : t('unassign_failed', { msg: e instanceof Error ? e.message : String(e) }),
        });
      } finally {
        setUnassigning(null);
      }
    },
    [confirm, t, tCommon, cell.id, cell.name, storeId, queryClient, onChanged],
  );

  return (
    <>
      <Modal
        open
        onOpenChange={(o) => {
          if (!o) onClose();
        }}
        title={`${t('contents_title')} ${cell.name}`}
        widthClass="w-[620px] max-w-[96vw]"
        closeLabel={tCommon('close')}
        testId="cell-contents-modal"
      >
        <div className="flex flex-col gap-2 px-4 py-4">
          {/* Move/unassign outcome («…ko'chirildi» / «…chiqarildi» / xato). */}
          {notice && (
            <p
              className={
                notice.kind === 'ok'
                  ? 'rounded-[var(--ms-radius-default)] border border-[var(--ms-success-500,#3a9c4e)] bg-[var(--ms-success-50,#f0f9f1)] px-3 py-2 font-medium text-[13px] text-[var(--ms-success-600,#1c7c31)]'
                  : 'rounded-[var(--ms-radius-default)] border border-[var(--ms-border-error,#d14343)] bg-[var(--ms-bg-error,#fdf2f2)] px-3 py-2 font-medium text-[13px] text-[var(--ms-text-error)]'
              }
              data-test-id="cell-contents-notice"
            >
              {notice.text}
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
                {items.map((i) => {
                  // Q1 qulfi: qoldiqli qatorni server baribir rad etadi
                  // (`qty: { not: 0 }` — MANFIY qator ham fantom), shuning uchun
                  // tugma oldindan o'chiriladi va sababi `title` da aytiladi.
                  const hasStock = (Number(i.qty) || 0) !== 0;
                  return (
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
                      {mayUnassign && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-[var(--ms-text-error)]"
                          disabled={hasStock}
                          loading={unassigning === i.assortmentId}
                          title={hasStock ? t('unassign_disabled_hint', { qty: i.qty }) : undefined}
                          onClick={() => void unassign(i)}
                          data-test-id={`cell-contents-unassign-${i.assortmentId}`}
                        >
                          {t('unassign_button')}
                        </Button>
                      )}
                    </li>
                  );
                })}
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
            setNotice({ kind: 'ok', text: msg });
            void queryClient.invalidateQueries({ queryKey: ['cell-contents', storeId] });
            onChanged?.();
          }}
        />
      )}
    </>
  );
}
