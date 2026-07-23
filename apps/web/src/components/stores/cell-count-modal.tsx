'use client';

/**
 * «Sanash» — physical cell-count window (owner 2026-07-21):
 *
 *   1. scan a CELL label (camera or keyboard-wedge input) → the window shows
 *      everything that lives in that cell;
 *   2. with 2+ products each renders as a SELECTABLE card — the chosen one
 *      highlights blue; a single product auto-selects. The qty input stays
 *      DISABLED until a product is selected;
 *   3. type the counted amount (e.g. 30) → «Saqlash» records it as the cell's
 *      ABSOLUTE count for that product (PUT cells/:cellId/stock) and closes.
 *      «Bekor qilish» closes without writing.
 *
 * Scanning a PRODUCT label while a cell is open selects its card — count flows
 * hands-free: cell → product → number → Enter.
 */

import { useBarcodeCamera } from '@/components/stores/use-barcode-camera';
import { api } from '@/lib/api-client';
import { imageRawUrl } from '@/lib/image-url';
import { normalizeScanInput } from '@/lib/scan';
import { Button, Icons, Input, Modal, cn } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

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

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3))));

export function CellCountModal({
  open,
  onOpenChange,
  storeId,
  cells,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  /** Saved cells of THIS store — cell codes resolve locally first. */
  cells: ScanCell[];
  /** Fires after a successful save so the parent refreshes its queries. */
  onSaved: () => void;
}) {
  const t = useTranslations('pages.stores.address_storage');
  const [cell, setCell] = useState<{ id: string; name: string } | null>(null);
  const [items, setItems] = useState<CellStockItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qty, setQty] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(
    null,
  );
  const [lastRead, setLastRead] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);

  // Reset per open; arm the wedge input after Radix's own autofocus.
  useEffect(() => {
    if (!open) return;
    setCell(null);
    setItems([]);
    setSelectedId(null);
    setQty('');
    setMessage(null);
    setLastRead(null);
    setValue('');
    setSaving(false);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const loadItems = useCallback(
    async (target: { id: string; name: string }) => {
      setLoadingItems(true);
      try {
        const res = await api.get<{ items: CellStockItem[] }>(
          `/admin/stores/${storeId}/cells/${target.id}/stock`,
        );
        const list = (res.items ?? []).filter((i) => i.assortmentKind === 'product');
        setItems(list);
        // A single product auto-selects (spec: cards are for the 2+ case).
        setSelectedId(list.length === 1 ? (list[0]?.assortmentId ?? null) : null);
        setQty('');
      } finally {
        setLoadingItems(false);
      }
    },
    [storeId],
  );

  const selectProduct = useCallback((id: string) => {
    setSelectedId(id);
    setQty('');
    requestAnimationFrame(() => qtyRef.current?.focus());
  }, []);

  // Owner 2026-07-23: the scan field ECHOES what was recognised — the cell's
  // CODE or the product's NAME — selected, so the next scan overwrites it.
  const echoInInput = useCallback((text: string, refocus: boolean) => {
    setValue(text);
    if (refocus) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, []);

  const resolve = useCallback(
    async (raw: string) => {
      const code = normalizeScanInput(raw);
      if (!code) return;
      setLastRead(code);
      // 1) cell label? (local snapshot first, by-barcode endpoint as fallback)
      const hitCell =
        cells.find((c) => c.barcode === code) ?? cells.find((c) => c.name === code) ?? null;
      if (hitCell) {
        const target = { id: hitCell.id, name: hitCell.name };
        setCell(target);
        setMessage({ kind: 'ok', text: `${t('scan_cell_label')}: ${hitCell.name}` });
        echoInInput(hitCell.name, true);
        await loadItems(target);
        return;
      }
      const fresh = await api
        .get<{ cells: Array<{ id: string; name: string; storeId: string; storeName: string }> }>(
          `/admin/stores/cells/by-barcode?code=${encodeURIComponent(code)}`,
        )
        .catch(() => null);
      const found = fresh?.cells?.[0];
      if (found && found.storeId === storeId) {
        const target = { id: found.id, name: found.name };
        setCell(target);
        setMessage({ kind: 'ok', text: `${t('scan_cell_label')}: ${found.name}` });
        echoInInput(found.name, true);
        await loadItems(target);
        return;
      }
      if (found) {
        setMessage({ kind: 'warn', text: t('scan_cell_other_store', { store: found.storeName }) });
        return;
      }
      // 2) product label → the open cell's card first, then the WHOLE catalog
      // (owner 2026-07-23: a counted product may not be bound to the cell yet —
      // find it by barcode and add its card).
      const searchProduct = async () => {
        const res = await api
          .get<{
            items: Array<{
              id: string;
              name: string;
              code: string | null;
              article?: string | null;
              barcodes?: string[];
              mainImageId?: string | null;
            }>;
          }>(`/products?search=${encodeURIComponent(code)}&limit=10`)
          .catch(() => null);
        const list = res?.items ?? [];
        const exact = list.filter(
          (p) => p.barcodes?.includes(code) || p.code === code || p.article === code,
        );
        return exact.length > 0 ? exact : list;
      };
      if (cell) {
        const hit = items.find(
          (i) => i.barcode === code || i.code === code || i.assortmentId === code,
        );
        if (hit) {
          selectProduct(hit.assortmentId);
          setMessage({ kind: 'ok', text: hit.name });
          echoInInput(hit.name, false);
          return;
        }
        const winners = await searchProduct();
        const product = winners.length === 1 ? winners[0] : null;
        if (product) {
          setItems((prev) =>
            prev.some((x) => x.assortmentId === product.id)
              ? prev
              : [
                  ...prev,
                  {
                    assortmentKind: 'product',
                    assortmentId: product.id,
                    name: product.name,
                    code: product.code ?? null,
                    barcode: code,
                    description: null,
                    mainImageId: product.mainImageId ?? null,
                    qty: '0',
                  },
                ],
          );
          selectProduct(product.id);
          setMessage({ kind: 'ok', text: product.name });
          echoInInput(product.name, false);
          return;
        }
        if (winners.length > 1) {
          setMessage({ kind: 'warn', text: t('scan_multiple') });
          return;
        }
        setMessage({ kind: 'err', text: t('count_no_product') });
        return;
      }
      // No cell yet — if the code IS a product, explain the step order.
      const winners = await searchProduct();
      if (winners.length > 0) {
        setMessage({ kind: 'err', text: t('scan_no_cell_yet') });
        return;
      }
      setMessage({ kind: 'err', text: t('count_not_found') });
    },
    [cells, storeId, cell, items, t, loadItems, selectProduct, echoInInput],
  );

  const resolveRef = useRef(resolve);
  useEffect(() => {
    resolveRef.current = resolve;
  }, [resolve]);
  const onCameraDecoded = useCallback((raw: string) => {
    void resolveRef.current(raw);
  }, []);
  const { videoRef, cameraOn, cameraError, diag, startCamera, stopCamera } = useBarcodeCamera({
    active: open,
    onDecoded: onCameraDecoded,
    cameraErrorText: t('scan_camera_error'),
  });

  const qtyValid = /^\d+(\.\d{1,6})?$/.test(qty.trim());
  // Owner 2026-07-23: the qty input is ALWAYS live and Save is clickable as
  // soon as a number is typed — a missing cell/product answers with a clear
  // message instead of a silently dead form.
  const canSave = qtyValid && !saving;

  const save = useCallback(async () => {
    if (!qtyValid || saving) return;
    if (!cell) {
      setMessage({ kind: 'err', text: t('scan_no_cell_yet') });
      return;
    }
    if (!selectedId) {
      setMessage({ kind: 'err', text: t('count_no_product') });
      return;
    }
    setSaving(true);
    try {
      await api.put(`/admin/stores/${storeId}/cells/${cell.id}/stock`, {
        assortmentId: selectedId,
        qty: qty.trim(),
      });
      onSaved();
      onOpenChange(false); // spec: Save closes the window
    } catch (e) {
      setMessage({
        kind: 'err',
        text: t('scan_save_failed', { msg: e instanceof Error ? e.message : String(e) }),
      });
      setSaving(false);
    }
  }, [cell, selectedId, qty, qtyValid, saving, storeId, onSaved, onOpenChange, t]);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('count_title')}
      widthClass="w-[520px] max-w-[96vw]"
      testId="cell-count-modal"
      footer={
        <>
          <Button
            type="button"
            variant="success"
            size="sm"
            onClick={() => void save()}
            disabled={!canSave}
            data-test-id="cell-count-save"
          >
            {saving ? t('scan_saving') : t('scan_save')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onOpenChange(false)}
            data-test-id="cell-count-cancel"
          >
            {t('scan_cancel')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 px-4 py-3">
        {/* Read/status banner — nothing happens silently. */}
        {(message || lastRead) && (
          <div
            className={`rounded-[var(--ms-radius-default)] border px-3 py-2 ${
              !message || message.kind === 'ok'
                ? 'border-[var(--ms-success-500,#3a9c4e)] bg-[var(--ms-success-50,#f0f9f1)]'
                : message.kind === 'warn'
                  ? 'border-[var(--ms-warning-500,#d3a616)] bg-[var(--ms-warning-50,#fdf6e3)]'
                  : 'border-[var(--ms-error-500,#d5433c)] bg-[var(--ms-error-50,#fdf0ef)]'
            }`}
            data-test-id="cell-count-banner"
          >
            {message && (
              <p className="font-semibold text-[14px]" data-test-id="cell-count-status">
                {message.text}
              </p>
            )}
            {lastRead && (
              <p className="mt-0.5 text-[12px] text-[var(--ms-text-muted)]">
                {t('scan_last_read')}: <span className="font-medium tabular-nums">{lastRead}</span>
              </p>
            )}
          </div>
        )}

        {/* Hint + always-armed wedge input. */}
        <p className="text-[13px] text-[var(--ms-text-muted)]">
          {cell ? `${t('scan_cell_label')}: ${cell.name}` : t('count_scan_cell_hint')}
        </p>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const v = value;
              setValue('');
              void resolve(v);
            }
          }}
          placeholder={t('scan_input_placeholder')}
          className="h-10 w-full rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-input)] px-3 text-sm placeholder:text-[var(--ms-text-placeholder)] focus:border-[var(--ms-border-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ms-text-brand)]"
          data-test-id="cell-count-input"
        />

        {/* Product cards — selectable, chosen one highlights BLUE. */}
        {cell &&
          (loadingItems ? (
            <p className="text-[13px] text-[var(--ms-text-muted)]">…</p>
          ) : items.length === 0 ? (
            <p className="text-[13px] text-[var(--ms-text-muted)]" data-test-id="cell-count-empty">
              {t('count_empty')}
            </p>
          ) : (
            <ul className="flex max-h-[220px] flex-col gap-1.5 overflow-y-auto">
              {items.map((i) => {
                const selected = selectedId === i.assortmentId;
                return (
                  <li key={i.assortmentId}>
                    <button
                      type="button"
                      onClick={() => selectProduct(i.assortmentId)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-[var(--ms-radius-default)] border px-3 py-2 text-left transition-colors',
                        selected
                          ? 'border-[var(--ms-text-brand)] bg-[var(--ms-bg-selected,#e8f1fa)] ring-1 ring-[var(--ms-text-brand)]'
                          : 'border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] hover:border-[var(--ms-border-focus)]',
                      )}
                      data-test-id={`cell-count-card-${i.assortmentId}`}
                      data-selected={selected ? 'true' : 'false'}
                    >
                      {i.mainImageId ? (
                        <img
                          src={imageRawUrl(i.mainImageId)}
                          alt=""
                          loading="lazy"
                          className="h-9 w-9 shrink-0 rounded-[var(--ms-radius-sm)] object-cover"
                        />
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--ms-radius-sm)] bg-[var(--ms-bg-muted)] text-[var(--ms-text-muted)] text-xs">
                          {i.name[0]?.toUpperCase() ?? '·'}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-[13px]">{i.name}</span>
                        <span className="block text-[12px] text-[var(--ms-text-muted)]">
                          {t('contents_col_qty')}: {fmtQty(Number(i.qty) || 0)}
                        </span>
                      </span>
                      {selected && (
                        <span className="shrink-0 font-semibold text-[var(--ms-text-brand)]">
                          ✓
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          ))}

        {/* Counted amount — ALWAYS live (owner 2026-07-23); saving without a
            scanned product answers «mahsulot topilmadi». */}
        <label className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-[var(--ms-text-primary)]">{t('count_qty_label')}</span>
          <Input
            ref={qtyRef}
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void save();
              }
            }}
            placeholder={selectedId ? '' : t('count_select_first')}
            className="h-9 w-40 text-right tabular-nums"
            data-test-id="cell-count-qty"
          />
        </label>

        {/* Camera screen (shared pipeline). */}
        <div className="flex flex-col gap-2" data-test-id="cell-count-screen">
          <div className="relative overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)]">
            <video
              ref={videoRef}
              playsInline
              muted
              className="block max-h-[220px] min-h-[140px] w-full object-cover"
              style={{ display: cameraOn ? 'block' : 'none' }}
              data-test-id="cell-count-video"
            />
            {cameraOn && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
              >
                <div className="h-[62%] w-[78%] rounded-[10px] border-2 border-white/95 shadow-[0_0_0_9999px_rgba(0,0,0,0.38)]" />
              </div>
            )}
            {!cameraOn && (
              <div className="flex h-[120px] items-center justify-center px-4 text-center text-[13px] text-[var(--ms-text-muted)]">
                {cameraError ?? t('scan_camera_starting')}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => (cameraOn ? stopCamera() : void startCamera())}
              data-test-id="cell-count-camera"
            >
              <Icons.barcode className="h-3.5 w-3.5" />
              {cameraOn ? t('scan_camera_stop') : t('scan_camera')}
            </Button>
            {diag && (
              <span className="text-[11px] text-[var(--ms-text-muted)] tabular-nums">
                {t('scan_decoder')}: {diag.engine} · {diag.attempts}
              </span>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
