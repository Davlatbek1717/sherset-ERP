'use client';

/**
 * «Ячейка» cell picker for document position grids (Адресное хранение, Phase 3).
 * Mirrors moysklad's inline dropdown: a trigger showing the picked «Зона / Ячейка»
 * (or «Не указана»), opening a 2-tab panel:
 *   • «Все ячейки (N)»     — every cell in the document's store
 *   • «С этим товаром (M)» — cells that currently hold this position's product
 * Each row shows the «Зона / Ячейка» label + Свободна/Занята (+ qty on the product tab).
 *
 * The panel is rendered in a PORTAL to <body> at a fixed position under the
 * trigger — so it always sits ON TOP of the totals footer / later rows instead
 * of being trapped under a table cell's stacking context (the old `absolute
 * z-50` panel was covered by «Итого»). Closes on outside-click, scroll or resize.
 *
 * When `bindProductCell` is set (receiving docs), picking a cell for a product
 * that has NO home cell binds it to that product too (`__yacheyka`/`__polka`) —
 * best-effort, never overwrites an existing binding (see BE bindProductIfEmpty).
 *
 * Data: GET /admin/stores/:storeId/address-storage?assortmentKind&assortmentId
 * (the BE returns per-cell `occupied` + `productQty`). Fetched lazily on open.
 */

import { api } from '@/lib/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface PickerCell {
  id: string;
  name: string;
  zoneId: string | null;
  zoneName: string | null;
  occupied: boolean;
  productQty: string | null;
}
interface AddressStorageResponse {
  cells: PickerCell[];
}

/** «Зона / Ячейка» (zoneless cells show just the name). */
export function cellPickerLabel(c: { zoneName: string | null; name: string }): string {
  return c.zoneName ? `${c.zoneName} / ${c.name}` : c.name;
}

export function CellPickerField({
  storeId,
  assortmentId,
  assortmentKind = 'product',
  label,
  onSelect,
  onClear,
  readOnly,
  bindProductCell,
}: {
  storeId: string | null | undefined;
  assortmentId?: string | null;
  assortmentKind?: string;
  /** Current denormalized «Зона / Ячейка» label (from row.cell). */
  label: string | null | undefined;
  onSelect: (cellId: string, label: string) => void;
  onClear: () => void;
  readOnly?: boolean;
  /** Receiving docs: bind the picked cell to a cell-less product (see BE). */
  bindProductCell?: boolean;
}) {
  const t = useTranslations('pages.stores.address_storage');
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'all' | 'product'>('all');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Fixed viewport coords for the portaled panel (computed from the trigger on open).
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const params = new URLSearchParams({ assortmentKind });
  if (assortmentId) params.set('assortmentId', assortmentId);
  const { data, isLoading } = useQuery<AddressStorageResponse>({
    queryKey: ['cell-picker', storeId, assortmentKind, assortmentId],
    queryFn: () =>
      api.get<AddressStorageResponse>(`/admin/stores/${storeId}/address-storage?${params}`),
    enabled: open && !!storeId,
  });

  // Close on outside-click (trigger OR portaled panel), scroll or resize — a
  // fixed-positioned portal would otherwise drift away from a scrolled trigger.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const node = e.target as Node;
      if (triggerRef.current?.contains(node) || panelRef.current?.contains(node)) return;
      setOpen(false);
    };
    const onMove = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', onMove);
    // capture: catch scroll in ANY ancestor (the positions table scrolls).
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open]);

  if (readOnly) {
    return <span className="block truncate px-2 text-sm">{label || '—'}</span>;
  }

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) {
      const width = 320;
      // clamp so a right-edge trigger doesn't push the panel off-screen.
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      setPos({ top: r.bottom + 4, left, width });
    }
    setOpen(true);
  };

  const pick = (c: PickerCell) => {
    onSelect(c.id, cellPickerLabel(c));
    // 2c: bind a cell-less product's home cell to the picked cell. Best-effort —
    // the BE only sets __yacheyka when the product has none (never overwrites),
    // and a failed bind must never block the pick.
    if (bindProductCell && assortmentId && storeId) {
      api
        .post(`/admin/stores/${storeId}/cells/${c.id}/products/${assortmentId}/bind-if-empty`, {})
        .then(() => qc.invalidateQueries({ queryKey: ['cell-picker'] }))
        .catch(() => undefined);
    }
    setOpen(false);
  };

  const cells = data?.cells ?? [];
  const productCells = cells.filter((c) => c.productQty && Number(c.productQty) > 0);
  const shown = tab === 'product' ? productCells : cells;

  const triggerCls =
    'flex w-full items-center justify-between gap-1 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-2 py-1 text-left text-sm hover:border-[var(--ms-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)]';
  const tabCls = (active: boolean) =>
    `flex-1 px-2 py-1.5 text-center text-xs ${active ? 'border-[var(--ms-border-focus)] border-b-2 font-medium text-[var(--ms-text-brand)]' : 'text-[var(--ms-text-muted)]'}`;
  const rowCls =
    'flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm hover:bg-[var(--ms-bg-muted)]';

  const panel =
    open && storeId && pos
      ? createPortal(
          <div
            ref={panelRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
            className="z-[600] overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] shadow-lg"
            data-test-id="cell-picker-panel"
          >
            <div className="flex border-[var(--ms-border-default)] border-b">
              <button
                type="button"
                className={tabCls(tab === 'all')}
                onClick={() => setTab('all')}
                data-test-id="cell-tab-all"
              >
                {t('all_cells')} ({cells.length})
              </button>
              <button
                type="button"
                className={tabCls(tab === 'product')}
                onClick={() => setTab('product')}
                data-test-id="cell-tab-product"
              >
                {t('with_product')} ({productCells.length})
              </button>
            </div>
            <div className="max-h-64 overflow-auto">
              <button
                type="button"
                className={`${rowCls} text-[var(--ms-text-muted)] italic`}
                onClick={() => {
                  onClear();
                  setOpen(false);
                }}
                data-test-id="cell-opt-clear"
              >
                {t('not_specified')}
              </button>
              {isLoading && <div className="px-2 py-2 text-[var(--ms-text-muted)] text-sm">…</div>}
              {!isLoading &&
                shown.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={rowCls}
                    onClick={() => pick(c)}
                    data-test-id={`cell-opt-${c.id}`}
                  >
                    <span className="truncate">{cellPickerLabel(c)}</span>
                    <span className="shrink-0 text-[var(--ms-text-muted)] text-xs">
                      {tab === 'product' && c.productQty
                        ? c.productQty
                        : c.occupied
                          ? t('status_occupied')
                          : t('status_free')}
                    </span>
                  </button>
                ))}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        disabled={!storeId}
        className={triggerCls}
        data-test-id="cell-picker-trigger"
      >
        <span className={`truncate ${label ? '' : 'text-[var(--ms-text-placeholder)]'}`}>
          {label || t('not_specified')}
        </span>
        <span className="shrink-0 text-[var(--ms-text-muted)] text-xs">▾</span>
      </button>
      {panel}
    </div>
  );
}
