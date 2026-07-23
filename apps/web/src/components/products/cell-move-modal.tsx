'use client';

/**
 * «Переместить» modal for a «Место хранения» row. Three modes, picked from the
 * row shape:
 *   • move   (real StockByCell row)          → move qty between two cells of the
 *                                              store (POST /cell-move).
 *   • place  (home-cell binding, resolved)    → allocate qty from the home-shelf
 *                                              remainder into a target cell of the
 *                                              store (POST /cell-place).
 *   • rebind (home-cell binding, unresolved)  → re-assign the label to any cell
 *                                              (POST /cell-rebind), no qty.
 * Over-quantity turns the input red and disables the button; success raises a
 * top toast. USER-DIRECTED 2026-07-06.
 */

import { api } from '@/lib/api-client';
import { Button, FormField, Input, Modal, NativeSelect, useToast } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface StorageCell {
  id: string;
  name: string;
  zoneName: string | null;
  storeId: string;
  storeName: string;
}
interface StorageOptions {
  cells: StorageCell[];
}

/** One row of the «Место хранения» table = the move source. */
export interface CellMoveSource {
  storeId: string | null;
  storeName: string | null;
  cellId: string | null;
  cellName: string;
  zoneName: string | null;
  qty: string;
  /**
   * `true` = a HOME-CELL binding row. With `cellId` set (resolved home cell) it's
   * a qty PLACE; with `cellId` null (unresolved label) it's a label RE-BIND.
   * `false`/undefined = a real per-cell stock row (qty MOVE).
   */
  isBinding?: boolean;
}

const cellLabel = (c: { zoneName: string | null; name: string }) =>
  c.zoneName ? `${c.zoneName} / ${c.name}` : c.name;

export function CellMoveModal({
  productId,
  source,
  onClose,
  onDone,
}: {
  productId: string;
  source: CellMoveSource;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations('pages.product_new');
  const tCommon = useTranslations('common');
  const { toast } = useToast();

  const mode: 'move' | 'place' | 'rebind' = source.isBinding
    ? source.cellId
      ? 'place'
      : 'rebind'
    : 'move';
  const hasQty = mode === 'move' || mode === 'place';

  const optionsQuery = useQuery<StorageOptions>({
    queryKey: ['product-storage-options'],
    queryFn: () => api.get<StorageOptions>('/products/storage-options'),
  });
  // rebind → any store's cell except the current home cell (matched by name).
  // move/place → ANY warehouse's cell except the source cell (a cross-warehouse
  // pick transfers the warehouse total; same-warehouse just redistributes bins).
  const destCells = (optionsQuery.data?.cells ?? []).filter((c) =>
    mode === 'rebind' ? c.name !== source.cellName : c.id !== source.cellId,
  );

  const [toCellId, setToCellId] = useState('');
  const [qty, setQty] = useState(source.qty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = Number(source.qty) || 0;
  const qtyN = Number(qty);
  const qtyEntered = qty.trim() !== '';
  const qtyOver = hasQty && qtyEntered && Number.isFinite(qtyN) && qtyN > available;
  const qtyValid = /^\d+(\.\d{1,6})?$/.test(qty.trim()) && qtyN > 0 && qtyN <= available;
  const canSubmit = !saving && !!toCellId && (mode === 'rebind' || qtyValid);

  // Target in a DIFFERENT warehouse ⇒ a real transfer (warehouse totals change).
  const selectedCell = destCells.find((c) => c.id === toCellId);
  const crossStore = hasQty && !!selectedCell && selectedCell.storeId !== source.storeId;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      if (mode === 'rebind') {
        await api.post(`/products/${productId}/cell-rebind`, { toCellId });
      } else if (mode === 'place') {
        await api.post(`/products/${productId}/cell-place`, { toCellId, qty: qty.trim() });
      } else {
        await api.post(`/products/${productId}/cell-move`, {
          storeId: source.storeId,
          fromCellId: source.cellId,
          toCellId,
          qty: qty.trim(),
        });
      }
      toast.success(t('cell_move_success'));
      onDone();
    } catch (e) {
      setError((e as Error).message || t('cell_move_error_generic'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={t('cell_move_title')}
      widthClass="w-[460px]"
      closeLabel={tCommon('close')}
      testId="cell-move-modal"
      footer={
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            data-test-id="cell-move-cancel"
          >
            {tCommon('cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            data-test-id="cell-move-submit"
          >
            {t('cell_move_submit')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 px-4 py-4">
        {/* Re-bind is a location LABEL move — spell that out (no qty). */}
        {mode === 'rebind' && (
          <p className="text-[var(--ms-text-muted)] text-xs" data-test-id="cell-move-binding-hint">
            {t('cell_move_binding_hint')}
          </p>
        )}

        {/* Откуда — the source cell (read-only). qty modes also show its balance. */}
        <FormField inline id="cell-move-from" label={t('cell_move_from')}>
          <div id="cell-move-from" className="text-sm" data-test-id="cell-move-from-label">
            {cellLabel({ zoneName: source.zoneName, name: source.cellName })}
            {hasQty && (
              <span className="ml-2 text-[var(--ms-text-muted)]">
                ({t('cell_move_available')}: {source.qty})
              </span>
            )}
          </div>
        </FormField>

        {/* Куда — destination cell. */}
        <FormField inline id="cell-move-to" label={t('cell_move_to')}>
          <NativeSelect
            id="cell-move-to"
            value={toCellId}
            onChange={(e) => setToCellId(e.target.value)}
            data-test-id="cell-move-to-select"
          >
            <option value="">{t('cell_move_to_placeholder')}</option>
            {destCells.map((c) => (
              <option key={c.id} value={c.id}>
                {cellLabel(c)}
                {c.storeId !== source.storeId ? ` · ${c.storeName}` : ''}
              </option>
            ))}
          </NativeSelect>
        </FormField>

        {/* Cross-warehouse pick ⇒ a real transfer — warehouse totals change. */}
        {crossStore && (
          <p className="text-[var(--ms-text-muted)] text-xs" data-test-id="cell-move-cross-store">
            {t('cell_move_cross_store', { store: selectedCell?.storeName ?? '' })}
          </p>
        )}

        {/* Количество — for move/place. Over the available balance ⇒ red + the
          submit button disables (canSubmit requires qtyValid). */}
        {hasQty && (
          <FormField inline id="cell-move-qty" label={t('cell_move_qty')}>
            <Input
              id="cell-move-qty"
              type="number"
              min={0}
              max={available}
              step="any"
              value={qty}
              invalid={qtyOver}
              onChange={(e) => setQty(e.target.value)}
              data-test-id="cell-move-qty-input"
            />
          </FormField>
        )}
        {qtyOver && (
          <p className="text-[var(--ms-text-danger)] text-sm" data-test-id="cell-move-qty-over">
            {t('cell_move_qty_over', { max: source.qty })}
          </p>
        )}

        {destCells.length === 0 && !optionsQuery.isLoading && (
          <p className="text-[var(--ms-text-muted)] text-sm" data-test-id="cell-move-no-cells">
            {t('cell_move_no_cells')}
          </p>
        )}
        {error && (
          <p className="text-[var(--ms-text-danger)] text-sm" data-test-id="cell-move-error">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
