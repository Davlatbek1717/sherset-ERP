'use client';

/**
 * «Ko'chirish» — move ONE product from its cell into another cell of the same
 * store (owner 2026-07-21, opened from the cell «Ko'rish» view):
 *
 *   - every cell (except the source) lists as a CHECKBOX row; ticking one
 *     unticks the rest (single target);
 *   - the search input filters by code/name (typing a 4-digit code narrows
 *     the list to the match);
 *   - «Scan» opens the SAME barcode camera as the bind window — scanning a
 *     cell label finds the row, ticks it and highlights it blue;
 *   - «Ko'chirish» performs the move: counted stock transfers via the
 *     product cell-move API and a home-cell binding on the source re-binds to
 *     the target. The parent then announces «[Mahsulot] [yacheyka]ga
 *     ko'chirildi».
 */

import { useBarcodeCamera } from '@/components/stores/use-barcode-camera';
import { api } from '@/lib/api-client';
import { normalizeScanInput } from '@/lib/scan';
import { Button, Checkbox, Icons, Modal, cn } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface ScanCell {
  id: string;
  name: string;
  barcode: string | null;
}

export function CellMoveTargetModal({
  open,
  onOpenChange,
  storeId,
  cells,
  product,
  fromCell,
  qty,
  onMoved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  /** All saved cells of this store (source excluded in the list). */
  cells: ScanCell[];
  product: { id: string; name: string };
  fromCell: { id: string; name: string };
  /** The product's counted qty in the source cell ('0' = binding only). */
  qty: string;
  /** Fires with the localized success message; parent refreshes + announces. */
  onMoved: (message: string) => void;
}) {
  const t = useTranslations('pages.stores.address_storage');
  const [search, setSearch] = useState('');
  const [targetId, setTargetId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [moving, setMoving] = useState(false);
  const [cameraWanted, setCameraWanted] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setTargetId(null);
    setMessage(null);
    setMoving(false);
    setCameraWanted(false);
  }, [open]);

  const candidates = useMemo(() => cells.filter((c) => c.id !== fromCell.id), [cells, fromCell.id]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.barcode ?? '').toLowerCase().includes(q),
    );
  }, [candidates, search]);

  const pickCell = useCallback((id: string) => {
    // Checkbox semantics per spec, but a single target: ticking one unticks
    // the previous; ticking the same again clears it.
    setTargetId((cur) => (cur === id ? null : id));
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector(`[data-cell-id="${id}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    });
  }, []);

  // Camera scan → find the cell by barcode/name → tick + highlight.
  const onDecoded = useCallback(
    (raw: string) => {
      const code = normalizeScanInput(raw);
      if (!code) return;
      const hit =
        candidates.find((c) => c.barcode === code) ??
        candidates.find((c) => c.name === code) ??
        null;
      if (hit) {
        setTargetId(hit.id);
        setSearch('');
        setMessage({ kind: 'ok', text: `${t('scan_cell_label')}: ${hit.name}` });
        requestAnimationFrame(() => {
          listRef.current
            ?.querySelector(`[data-cell-id="${hit.id}"]`)
            ?.scrollIntoView({ block: 'nearest' });
        });
      } else {
        setMessage({ kind: 'err', text: t('count_not_found') });
      }
    },
    [candidates, t],
  );
  // startCamera is unused here — the hook auto-starts while `active` (the
  // «Scan» toggle drives cameraWanted); stopCamera handles the manual off.
  const { videoRef, cameraOn, cameraError, diag, stopCamera } = useBarcodeCamera({
    active: open && cameraWanted,
    onDecoded,
    cameraErrorText: t('scan_camera_error'),
  });

  const move = useCallback(async () => {
    if (moving) return;
    const target = candidates.find((c) => c.id === targetId);
    if (!target) {
      setMessage({ kind: 'err', text: t('move_none_selected') });
      return;
    }
    setMoving(true);
    try {
      // 1) counted stock (if any) transfers cell→cell atomically on the BE.
      if (Number(qty) > 0) {
        await api.post(`/products/${product.id}/cell-move`, {
          storeId,
          fromCellId: fromCell.id,
          toCellId: target.id,
          qty,
        });
      }
      // 2) a home-cell binding on the source follows the product.
      const bound = await api
        .get<{ items: Array<{ id: string }> }>(
          `/admin/stores/${storeId}/cells/${fromCell.id}/products`,
        )
        .catch(() => null);
      if ((bound?.items ?? []).some((x) => x.id === product.id)) {
        await api.delete(`/admin/stores/${storeId}/cells/${fromCell.id}/products/${product.id}`);
        await api.post(`/admin/stores/${storeId}/cells/${target.id}/products`, {
          productIds: [product.id],
        });
      }
      onMoved(t('move_success', { product: product.name, cell: target.name }));
      onOpenChange(false);
    } catch (e) {
      setMessage({
        kind: 'err',
        text: t('move_failed', { msg: e instanceof Error ? e.message : String(e) }),
      });
      setMoving(false);
    }
  }, [moving, candidates, targetId, qty, product, fromCell.id, storeId, onMoved, onOpenChange, t]);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`${t('move_title')} · ${product.name}`}
      widthClass="w-[480px] max-w-[96vw]"
      testId="cell-move-modal"
      footer={
        <>
          <Button
            type="button"
            variant="success"
            size="sm"
            onClick={() => void move()}
            disabled={!targetId || moving}
            data-test-id="cell-move-confirm"
          >
            {moving ? t('scan_saving') : t('move_button')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onOpenChange(false)}
            data-test-id="cell-move-cancel"
          >
            {t('scan_cancel')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 px-4 py-3">
        {message && (
          <p
            className={cn(
              'rounded-[var(--ms-radius-default)] border px-3 py-2 font-medium text-[13px]',
              message.kind === 'ok'
                ? 'border-[var(--ms-success-500,#3a9c4e)] bg-[var(--ms-success-50,#f0f9f1)] text-[var(--ms-success-600,#1c7c31)]'
                : 'border-[var(--ms-error-500,#d5433c)] bg-[var(--ms-error-50,#fdf0ef)] text-[var(--ms-text-destructive)]',
            )}
            data-test-id="cell-move-banner"
          >
            {message.text}
          </p>
        )}

        {/* Search + Scan toggle on one row. */}
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('move_search_placeholder')}
            className="h-9 min-w-0 flex-1 rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-input)] px-3 text-sm placeholder:text-[var(--ms-text-placeholder)] focus:border-[var(--ms-border-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ms-text-brand)]"
            data-test-id="cell-move-search"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setCameraWanted((v) => {
                const next = !v;
                if (!next) stopCamera();
                return next;
              });
            }}
            data-test-id="cell-move-scan"
          >
            <Icons.barcode className="h-3.5 w-3.5" />
            {cameraWanted ? t('scan_camera_stop') : 'Scan'}
          </Button>
        </div>

        {/* Camera (only when asked — same pipeline as the bind window). */}
        {cameraWanted && (
          <div className="relative overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)]">
            <video
              ref={videoRef}
              playsInline
              muted
              className="block max-h-[200px] min-h-[120px] w-full object-cover"
              style={{ display: cameraOn ? 'block' : 'none' }}
              data-test-id="cell-move-video"
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
              <div className="flex h-[110px] items-center justify-center px-4 text-center text-[13px] text-[var(--ms-text-muted)]">
                {cameraError ?? t('scan_camera_starting')}
              </div>
            )}
            {diag && (
              <span className="absolute right-1.5 bottom-1 text-[11px] text-white/80 tabular-nums">
                {diag.engine} · {diag.attempts}
              </span>
            )}
          </div>
        )}

        {/* Target cells — checkbox list, selected row highlights BLUE. */}
        <ul
          ref={listRef}
          className="flex max-h-[240px] flex-col gap-1 overflow-y-auto"
          data-test-id="cell-move-list"
        >
          {shown.length === 0 ? (
            <li className="px-2 py-3 text-[13px] text-[var(--ms-text-muted)]">
              {t('count_not_found')}
            </li>
          ) : (
            shown.map((c) => {
              const selected = targetId === c.id;
              return (
                <li key={c.id} data-cell-id={c.id}>
                  <label
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--ms-radius-default)] border px-3 py-2 transition-colors',
                      selected
                        ? 'border-[var(--ms-text-brand)] bg-[var(--ms-bg-selected,#e8f1fa)] ring-1 ring-[var(--ms-text-brand)]'
                        : 'border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] hover:border-[var(--ms-border-focus)]',
                    )}
                    data-test-id={`cell-move-row-${c.id}`}
                    data-selected={selected ? 'true' : 'false'}
                  >
                    <Checkbox checked={selected} onCheckedChange={() => pickCell(c.id)} />
                    <span className="min-w-0 flex-1 truncate font-medium text-[13px]">
                      {c.name}
                    </span>
                    {c.barcode && (
                      <span className="shrink-0 text-[12px] text-[var(--ms-text-muted)] tabular-nums">
                        {c.barcode}
                      </span>
                    )}
                  </label>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </Modal>
  );
}
