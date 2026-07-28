'use client';

/**
 * «Scan» — two-step cell↔product binding by barcode (owner 2026-07-19,
 * REDESIGNED to the owner's 2026-07-20 spec):
 *
 *   top    — a big «№ 1» / «№ 2» step marker (1 = scan the CELL label,
 *            2 = scan the PRODUCT label);
 *   middle — one always-armed input: a keyboard-wedge scanner types code +
 *            Enter with NO extra clicks; an optional camera (BarcodeDetector)
 *            runs continuously and feeds the same handler;
 *   bottom — two cards joined by a «+»: card 1 shows the scanned cell,
 *            card 2 the scanned product.
 *
 * If the scanned cell ALREADY holds another product, a separate dialog asks
 * what to do: «Birga qo'shish» (keep both) · «Bekor qilish» — the destructive
 * «Almashtirish» option was removed per owner 2026-07-21. Binding writes the
 * SAME record the manual picker writes (Product.attributes.__yacheyka via
 * POST cells/:id/products) — one source of truth, no new tables.
 * Camera pipeline lives in the shared useBarcodeCamera hook.
 */

import { useBarcodeCamera } from '@/components/stores/use-barcode-camera';
import { api } from '@/lib/api-client';
import { normalizeScanInput } from '@/lib/scan';
import { Button, Icons, Modal, useToast } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

interface ScanCell {
  id: string;
  name: string;
  barcode: string | null;
}

interface ProductHit {
  id: string;
  name: string;
  code: string | null;
  article: string | null;
  barcodes: string[] | null;
  /** Pack (TASNIF) barcodes — the physical EAN on the box; scans must match
   *  these too (owner 2026-07-21: code entered in «TASNIF shtrix-kodi» only). */
  packBarcodes: string[] | null;
}

/** One STAGED binding (owner 2026-07-21: scans collect into a list and are
 *  written only when «Saqlash» is pressed; «Bekor qilish» discards them all). */
interface PendingRow {
  key: string;
  product: { id: string; name: string };
  cell: { id: string; name: string };
}

/** «Yacheyka band» dialog payload: the product just scanned + what the cell
 *  would hold at save time (server contents + already-staged rows). */
interface Conflict {
  product: ProductHit;
  existing: Array<{ id: string; name: string }>;
}

export function CellScanBindModal({
  open,
  onOpenChange,
  storeId,
  cells,
  initialCell,
  onBound,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  /** Saved cells of THIS store (id + name + barcode) — cell codes resolve locally. */
  cells: ScanCell[];
  /** The cell whose picker opened the modal — pre-set so scanning it is optional. */
  initialCell: { id: string; name: string } | null;
  /** Fires after every successful bind so the parent refreshes its queries. */
  onBound: () => void;
}) {
  const t = useTranslations('pages.stores.address_storage');
  const [cell, setCell] = useState<{ id: string; name: string } | null>(initialCell);
  const [lastProduct, setLastProduct] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(
    null,
  );
  const [conflict, setConflict] = useState<Conflict | null>(null);
  // Staged bindings — written ONLY by «Saqlash» (owner 2026-07-21).
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState('');
  // What the camera/scanner last READ — always shown, so nothing is silent.
  const [lastRead, setLastRead] = useState<string | null>(null);
  // Read-flash (owner 2026-07-21): the viewfinder turns BRAND-BLUE for a
  // moment on every successful decode — instant «o'qildi» feedback.
  const [readFlash, setReadFlash] = useState(false);
  const flashTimerRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Mirror of the conflict dialog for the camera callbacks (stale-closure-safe).
  const conflictRef = useRef(false);

  // Step 1 = the cell label is still wanted; step 2 = scan products.
  const step = cell ? 2 : 1;

  const { toast } = useToast();
  // Owner 2026-07-25 (phone report): the always-armed input must NOT pop the
  // virtual keyboard — on touch devices the input keeps FOCUS (hardware
  // scanners still type into it) but inputMode="none" suppresses the keyboard
  // until the user deliberately taps the field.
  const [coarsePointer, setCoarsePointer] = useState(false);
  useEffect(() => {
    setCoarsePointer(window.matchMedia('(pointer: coarse)').matches);
  }, []);
  const [manualKb, setManualKb] = useState(false);

  // Reset per open; the opener's cell is the starting context. The input is
  // armed via rAF — it runs AFTER Radix Dialog's own open-autofocus (which
  // lands on the header close button), so the scanner needs no extra click.
  useEffect(() => {
    if (!open) return;
    setCell(initialCell);
    setLastProduct(null);
    setMessage(null);
    setConflict(null);
    setPending([]);
    setSaving(false);
    setValue('');
    setLastRead(null);
    setFlashCard(null);
    setManualKb(false);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open, initialCell]);

  const rearm = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // Owner 2026-07-21: a read must be IMPOSSIBLE to miss — the top banner
  // announces it, and the card that just received the code flashes a ring.
  const [flashCard, setFlashCard] = useState<'cell' | 'product' | null>(null);
  const cardFlashTimerRef = useRef<number | null>(null);
  const flashTheCard = useCallback((which: 'cell' | 'product') => {
    setFlashCard(which);
    if (cardFlashTimerRef.current) window.clearTimeout(cardFlashTimerRef.current);
    cardFlashTimerRef.current = window.setTimeout(() => setFlashCard(null), 1400);
  }, []);

  useEffect(() => {
    conflictRef.current = !!conflict;
  }, [conflict]);

  // STAGE a binding (owner 2026-07-21: nothing is written on scan — rows
  // collect in the list and «Saqlash» commits them all; the list is uncapped
  // because every staged row must reach the save).
  const stage = useCallback(
    (product: { id: string; name: string }, targetCell: { id: string; name: string }) => {
      setLastProduct(product.name);
      flashTheCard('product');
      setMessage({ kind: 'ok', text: t('scan_staged') });
      setPending((rows) => [
        {
          key: `${Date.now()}-${product.id}`,
          product: { id: product.id, name: product.name },
          cell: targetCell,
        },
        ...rows,
      ]);
    },
    [t, flashTheCard],
  );

  // «Saqlash» — commit every staged row in scan order: unbind the staged
  // replacements first, then bind. Committed rows leave the list one by one,
  // so a mid-save failure keeps the unsaved remainder visible.
  const save = useCallback(async () => {
    if (pending.length === 0 || saving) return;
    setSaving(true);
    const rows = [...pending].reverse();
    let done = 0;
    try {
      for (const r of rows) {
        await api.post(`/admin/stores/${storeId}/cells/${r.cell.id}/products`, {
          productIds: [r.product.id],
        });
        done += 1;
        setPending((p) => p.filter((x) => x.key !== r.key));
      }
      setMessage({ kind: 'ok', text: t('scan_saved_n', { count: done }) });
      // Owner 2026-07-25: a full save also toasts «Saqlandi…».
      toast.success(t('scan_saved_n', { count: done }));
    } catch (e) {
      // Owner 2026-07-21: NOTHING resets silently — the failure names its cause
      // and the unsaved rows stay in the list for a retry.
      setMessage({
        kind: 'err',
        text: t('scan_save_failed', { msg: e instanceof Error ? e.message : String(e) }),
      });
    }
    if (done > 0) onBound();
    setSaving(false);
    rearm();
  }, [pending, saving, storeId, onBound, t, rearm, toast]);

  const resolve = useCallback(
    async (raw: string) => {
      const code = normalizeScanInput(raw);
      if (!code) return;
      // Owner 2026-07-20 (repeat report): NOTHING may happen silently — every
      // read shows WHAT was read, so a wrong/foreign label explains itself,
      // and the viewfinder flashes blue the moment a code is decoded.
      setLastRead(code);
      setReadFlash(true);
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = window.setTimeout(() => setReadFlash(false), 900);
      // 1) cell label? (barcode first, exact name as a manual-typing fallback)
      const hitCell =
        cells.find((c) => c.barcode === code) ?? cells.find((c) => c.name === code) ?? null;
      if (hitCell) {
        setCell({ id: hitCell.id, name: hitCell.name });
        setLastProduct(null);
        flashTheCard('cell');
        setMessage({ kind: 'ok', text: `${t('scan_cell_label')}: ${hitCell.name}` });
        return;
      }
      // 2) product barcode — exact barcode/code/article wins, single hit falls back.
      try {
        const res = await api.get<{ items: ProductHit[] }>(
          `/products?search=${encodeURIComponent(code)}&limit=10`,
        );
        const items = res.items ?? [];
        const exact = items.filter(
          (p) =>
            p.barcodes?.includes(code) ||
            p.packBarcodes?.includes(code) ||
            p.code === code ||
            p.article === code,
        );
        const winners = exact.length > 0 ? exact : items;
        if (winners.length === 0) {
          // Not a product either — maybe a shelf label from ANOTHER warehouse
          // (cells prop covers only THIS store). Name the store instead of a
          // dead-end «not found» (owner 2026-07-20: silent misses erode trust).
          const cellHit = await api
            .get<{
              cells: Array<{ id: string; name: string; storeId: string; storeName: string }>;
            }>(`/admin/stores/cells/by-barcode?code=${encodeURIComponent(code)}`)
            .catch(() => null);
          const foreign = cellHit?.cells?.[0];
          if (foreign && foreign.storeId === storeId) {
            // Same store but missing from the prop snapshot (created after the
            // card loaded) — accept it as the current cell.
            setCell({ id: foreign.id, name: foreign.name });
            setLastProduct(null);
            flashTheCard('cell');
            setMessage({ kind: 'ok', text: `${t('scan_cell_label')}: ${foreign.name}` });
            return;
          }
          if (foreign) {
            setMessage({
              kind: 'warn',
              text: t('scan_cell_other_store', { store: foreign.storeName }),
            });
            return;
          }
          setMessage({ kind: 'err', text: t('scan_not_found') });
          return;
        }
        if (winners.length > 1) {
          setMessage({ kind: 'warn', text: t('scan_multiple') });
          return;
        }
        const product = winners[0];
        if (!product) return;
        if (!cell) {
          setMessage({ kind: 'warn', text: t('scan_no_cell_yet') });
          return;
        }
        // Owner 2026-07-20: an occupied cell must ASK, not silently append.
        // The cell's contents AT SAVE TIME = server items − staged removals
        // + staged additions (owner 2026-07-21: scans stage, save commits).
        const bound = await api
          .get<{ items: Array<{ id: string; name: string }> }>(
            `/admin/stores/${storeId}/cells/${cell.id}/products`,
          )
          .catch(() => null);
        const stagedHere = pending.filter((r) => r.cell.id === cell.id);
        const effective: Array<{ id: string; name: string }> = [
          ...(bound?.items ?? []),
          ...stagedHere.map((r) => r.product),
        ];
        if (effective.some((x) => x.id === product.id)) {
          setLastProduct(product.name);
          flashTheCard('product');
          setMessage({ kind: 'ok', text: t('scan_already_bound') });
          return;
        }
        if (effective.length > 0) {
          setConflict({ product, existing: effective });
          return;
        }
        stage(product, cell);
      } catch (e) {
        setMessage({ kind: 'err', text: e instanceof Error ? e.message : t('scan_not_found') });
      }
    },
    [cells, cell, storeId, pending, stage, t, flashTheCard],
  );

  // «Birga qo'shish» — the ONLY affirmative choice for an occupied cell
  // (owner 2026-07-21: the destructive «Almashtirish» option was removed).
  const addTogether = useCallback(() => {
    if (!conflict || !cell) return;
    stage(conflict.product, cell);
    setConflict(null);
    rearm();
  }, [conflict, cell, stage, rearm]);

  // The camera pipeline lives in the shared useBarcodeCamera hook (extracted
  // 2026-07-21). resolveRef keeps the LATEST resolve without camera restarts;
  // reads are ignored while the occupied-cell dialog waits for a decision.
  const resolveRef = useRef(resolve);
  useEffect(() => {
    resolveRef.current = resolve;
  }, [resolve]);

  // Owner 2026-07-26 (kb-spec §1): scanning must work NO MATTER where the
  // cursor is. A keyboard-wedge scanner is just fast keystrokes — if focus
  // drifted to a button (or anywhere outside the input), this capture-phase
  // listener collects the burst itself and Enter feeds it to resolve().
  // Printable keys are swallowed so a focused button is never «clicked» by
  // the scanner's Enter, and no virtual keyboard is involved at any point
  // (nothing gets focused). The input's own path is untouched.
  useEffect(() => {
    if (!open) return;
    const buf = { s: '', at: 0 };
    const onKey = (e: KeyboardEvent) => {
      if (conflictRef.current) return;
      if (document.activeElement === inputRef.current) return; // input handles itself
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable))
        return;
      const now = Date.now();
      if (now - buf.at > 900) buf.s = ''; // stale half-burst — start fresh
      buf.at = now;
      if (e.key === 'Enter') {
        if (buf.s) {
          e.preventDefault();
          e.stopPropagation();
          const v = buf.s;
          buf.s = '';
          void resolveRef.current(v);
        }
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        buf.s += e.key;
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open]);

  const onCameraDecoded = useCallback((raw: string) => {
    if (conflictRef.current) return;
    void resolveRef.current(raw);
  }, []);
  const { videoRef, cameraOn, cameraError, diag, startCamera, stopCamera } = useBarcodeCamera({
    active: open,
    onDecoded: onCameraDecoded,
    cameraErrorText: t('scan_camera_error'),
  });

  const CARD =
    'flex-1 rounded-[var(--ms-radius-default)] border px-3 py-2.5 transition-colors min-w-0';
  const CARD_ON = 'border-[var(--ms-success-500)] bg-[var(--ms-success-50,#f0f9f1)]';
  const CARD_OFF = 'border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)]';

  return (
    <>
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        title={t('scan_title')}
        widthClass="w-[520px] max-w-[96vw]"
        testId="cell-scan-modal"
        footer={
          <>
            {/* Owner 2026-07-21: scans stage into the list; ONLY «Saqlash»
                writes them. «Bekor qilish» (or ✕) closes and discards. */}
            <Button
              type="button"
              variant="success"
              size="sm"
              onClick={() => void save()}
              disabled={pending.length === 0 || saving}
              data-test-id="cell-scan-save"
            >
              {saving
                ? t('scan_saving')
                : pending.length > 0
                  ? `${t('scan_save')} (${pending.length})`
                  : t('scan_save')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onOpenChange(false)}
              data-test-id="cell-scan-cancel"
            >
              {t('scan_cancel')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 px-4 py-3">
          {/* Read announcement AT THE TOP (owner 2026-07-21: «bilmay
              qolyapman») — a colored banner nobody can miss: what happened
              plus the raw code that was read. */}
          {(message || lastRead) && (
            <div
              className={`rounded-[var(--ms-radius-default)] border px-3 py-2 ${
                !message || message.kind === 'ok'
                  ? 'border-[var(--ms-success-500,#3a9c4e)] bg-[var(--ms-success-50,#f0f9f1)]'
                  : message.kind === 'warn'
                    ? 'border-[var(--ms-warning-500,#d3a616)] bg-[var(--ms-warning-50,#fdf6e3)]'
                    : 'border-[var(--ms-error-500,#d5433c)] bg-[var(--ms-error-50,#fdf0ef)]'
              }`}
              data-test-id="cell-scan-banner"
            >
              {message && (
                <p
                  className={`font-semibold text-[14px] ${
                    message.kind === 'ok'
                      ? 'text-[var(--ms-success-600,#1c7c31)]'
                      : message.kind === 'warn'
                        ? 'text-[var(--ms-warning-600,#8a6d1a)]'
                        : 'text-[var(--ms-text-destructive)]'
                  }`}
                  data-test-id="cell-scan-status"
                >
                  {message.text}
                </p>
              )}
              {lastRead && (
                <p
                  className="mt-0.5 text-[12px] text-[var(--ms-text-muted)]"
                  data-test-id="cell-scan-read"
                >
                  {t('scan_last_read')}:{' '}
                  <span className="font-medium tabular-nums">{lastRead}</span>
                </p>
              )}
            </div>
          )}

          {/* Stepper (owner 2026-07-21): BOTH steps visible, the active one
              filled — the jump № 1 → № 2 is impossible to miss; a finished
              step № 1 turns green with a check. */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span
                className={`rounded-[var(--ms-radius-default)] px-3 py-1 font-semibold text-[14px] transition-colors ${
                  step === 1
                    ? 'bg-[var(--ms-text-brand)] text-white'
                    : 'bg-[var(--ms-success-50,#f0f9f1)] text-[var(--ms-success-600,#1c7c31)]'
                }`}
                data-test-id={step === 1 ? 'cell-scan-step' : undefined}
              >
                № 1{step === 2 ? ' ✓' : ''}
              </span>
              <span aria-hidden className="text-[13px] text-[var(--ms-text-muted)]">
                →
              </span>
              <span
                className={`rounded-[var(--ms-radius-default)] px-3 py-1 font-semibold text-[14px] transition-colors ${
                  step === 2
                    ? 'bg-[var(--ms-text-brand)] text-white'
                    : 'bg-[var(--ms-bg-muted)] text-[var(--ms-text-muted)]'
                }`}
                data-test-id={step === 2 ? 'cell-scan-step' : undefined}
              >
                № 2
              </span>
            </div>
            <span className="text-[13px] text-[var(--ms-text-muted)]">
              {step === 1 ? t('scan_cell_waiting') : t('scan_product_waiting')}
            </span>
          </div>

          {/* The single always-armed input — a keyboard-wedge scanner types here
              without any click; manual typing works the same way. */}
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
            onBlur={() => {
              window.setTimeout(() => {
                if (open && !conflict && document.activeElement === document.body) {
                  inputRef.current?.focus();
                }
              }, 80);
            }}
            // Touch: no virtual keyboard until the user taps the field itself.
            inputMode={coarsePointer && !manualKb ? 'none' : undefined}
            onPointerDown={() => setManualKb(true)}
            placeholder={t('scan_input_placeholder')}
            className="h-10 w-full rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-input)] px-3 text-sm placeholder:text-[var(--ms-text-placeholder)] focus:border-[var(--ms-border-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ms-text-brand)]"
            data-test-id="cell-scan-input"
          />

          {/* Bottom cards joined by «+» (owner 2026-07-20). */}
          <div className="flex items-center gap-2">
            <div
              className={`${CARD} ${cell ? CARD_ON : CARD_OFF} ${
                flashCard === 'cell' ? 'ring-2 ring-[var(--ms-success-500,#3a9c4e)]' : ''
              }`}
              data-test-id="cell-scan-cell-card"
            >
              <div className="text-[11px] text-[var(--ms-text-muted)] uppercase tracking-wide">
                {t('scan_cell_label')}
              </div>
              <div className="mt-0.5 truncate font-medium text-[13px] text-[var(--ms-text-primary)]">
                {cell ? `${cell.name} ✓` : '—'}
              </div>
            </div>
            <span className="shrink-0 font-semibold text-[18px] text-[var(--ms-text-muted)]">
              +
            </span>
            <div
              className={`${CARD} ${lastProduct ? CARD_ON : CARD_OFF} ${
                flashCard === 'product' ? 'ring-2 ring-[var(--ms-success-500,#3a9c4e)]' : ''
              }`}
              data-test-id="cell-scan-product-card"
            >
              <div className="text-[11px] text-[var(--ms-text-muted)] uppercase tracking-wide">
                {t('scan_product_label')}
              </div>
              <div className="mt-0.5 truncate font-medium text-[13px] text-[var(--ms-text-primary)]">
                {lastProduct ?? '—'}
              </div>
            </div>
          </div>

          {/* PENDING list (owner 2026-07-21): staged rows waiting for «Saqlash».
              Uncapped + scrollable — every row here WILL be written on save;
              the small ✕ un-stages a mis-scan before it costs anything. */}
          {pending.length > 0 && (
            <ul
              className="flex max-h-[180px] flex-col gap-1 overflow-y-auto"
              data-test-id="cell-scan-log"
            >
              {pending.map((row) => (
                <li
                  key={row.key}
                  className="flex items-center gap-2 rounded-[var(--ms-radius-sm)] bg-[var(--ms-bg-muted)] px-2.5 py-1.5 text-[13px]"
                >
                  <span className="text-[var(--ms-text-muted)]">•</span>
                  <span className="min-w-0 flex-1 truncate">{row.product.name}</span>
                  <span className="shrink-0 text-[var(--ms-text-muted)]">→ {row.cell.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setPending((rows) => rows.filter((x) => x.key !== row.key));
                      rearm();
                    }}
                    className="shrink-0 rounded px-1 text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)] hover:text-[var(--ms-text-destructive)]"
                    aria-label={t('scan_row_remove')}
                    title={t('scan_row_remove')}
                    data-test-id={`cell-scan-unstage-${row.key}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* The SCANNING SCREEN (owner 2026-07-20): always visible, opens by
              itself with the modal. Video stays mounted so the ref exists
              before the stream attaches (/scan lesson). */}
          <div className="flex flex-col gap-2" data-test-id="cell-scan-screen">
            <div className="relative overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)]">
              <video
                ref={videoRef}
                playsInline
                muted
                className="block max-h-[260px] min-h-[160px] w-full object-cover"
                style={{ display: cameraOn ? 'block' : 'none' }}
                data-test-id="cell-scan-video"
              />
              {/* Viewfinder (owner 2026-07-20): a bright frame the label is held
                  into; the huge shadow dims everything outside it. Visual guide
                  only — zxing still reads the whole frame, so a label caught
                  slightly off-frame scans too. */}
              {cameraOn && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 flex items-center justify-center"
                  data-test-id="cell-scan-viewfinder"
                  data-read-flash={readFlash ? 'on' : 'off'}
                >
                  <div
                    className={`h-[62%] w-[78%] rounded-[10px] transition-colors duration-150 ${
                      readFlash
                        ? 'border-[3px] border-[var(--ms-text-brand)] shadow-[0_0_0_9999px_rgba(23,86,163,0.28)]'
                        : 'border-2 border-white/95 shadow-[0_0_0_9999px_rgba(0,0,0,0.38)]'
                    }`}
                  />
                </div>
              )}
              {!cameraOn && (
                <div className="flex h-[140px] items-center justify-center px-4 text-center text-[13px] text-[var(--ms-text-muted)]">
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
                data-test-id="cell-scan-camera"
              >
                <Icons.barcode className="h-3.5 w-3.5" />
                {cameraOn ? t('scan_camera_stop') : t('scan_camera')}
              </Button>
              {/* Live decoder diagnostics — a glance answers «is it running?». */}
              {diag && (
                <span
                  className="text-[11px] text-[var(--ms-text-muted)] tabular-nums"
                  data-test-id="cell-scan-diag"
                >
                  {t('scan_decoder')}: {diag.engine} · {diag.attempts}
                </span>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* «Yacheyka band» — the occupied-cell decision dialog (owner 2026-07-20):
          Almashtirish · Birga qo'shish · Bekor qilish. */}
      <Modal
        open={!!conflict}
        onOpenChange={(o) => {
          if (!o) {
            setConflict(null);
            rearm();
          }
        }}
        title={t('scan_conflict_title')}
        widthClass="w-[440px]"
        testId="cell-scan-conflict"
        footer={
          <>
            {/* Owner 2026-07-21: «Almashtirish» removed — adding alongside is
                the only affirmative choice for an occupied cell. */}
            <Button
              type="button"
              variant="success"
              size="sm"
              onClick={() => void addTogether()}
              data-test-id="cell-scan-add-together"
            >
              {t('scan_add_together')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setConflict(null);
                rearm();
              }}
              data-test-id="cell-scan-conflict-cancel"
            >
              {t('scan_cancel')}
            </Button>
          </>
        }
      >
        <div className="px-4 py-3 text-sm" data-test-id="cell-scan-conflict-msg">
          {t('scan_conflict_msg', {
            name: conflict?.existing.map((x) => x.name).join(', ') ?? '',
          })}
        </div>
      </Modal>
    </>
  );
}
