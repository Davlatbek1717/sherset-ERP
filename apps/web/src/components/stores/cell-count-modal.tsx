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
 *      ABSOLUTE count for that product (PUT cells/:cellId/stock, `mode:'set'`)
 *      and closes. «Bekor qilish» closes without writing.
 *
 * Scanning a PRODUCT label while a cell is open selects its card — count flows
 * hands-free: cell → product → number → Enter.
 *
 * TZ v3 §2 (2026-08-10) changed «Umumiy sanash»: the common number is no longer
 * an absolute count but an amount ADDED to every scanned cell (`mode:'add'`,
 * the delta is computed SERVER-side). Each row therefore shows «hozirgi → bo'ladi»,
 * and both modes share ONE qty field that never moves when the mode flips.
 *
 * TZ v3 §3: every scan goes through `useScanQueue` so a burst is processed IN
 * ORDER, and nothing is ever refused silently.
 */

import { useBarcodeCamera } from '@/components/stores/use-barcode-camera';
import { useScanQueue } from '@/components/stores/use-scan-queue';
import { api } from '@/lib/api-client';
import { beep } from '@/lib/beep';
import { imageRawUrl } from '@/lib/image-url';
import { normalizeScanInput } from '@/lib/scan';
import { Button, Checkbox, Icons, Input, Modal, cn, useToast } from '@moysklad/ui';
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

/** A staged «Umumiy sanash» row: what will be ADDED to which cell, and what the
 *  cell holds RIGHT NOW (§2.2.2 — «hozirgi → bo'ladi» must be visible). */
interface BulkRow {
  key: string;
  cell: { id: string; name: string };
  product: { id: string; name: string };
  qty: string;
  currentQty: string;
}

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3))));
const qtyValidRe = /^\d+(\.\d{1,6})?$/;

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
  const tCommon = useTranslations('common');
  const tCommonSaved = tCommon('saved');
  const { toast } = useToast();
  // Owner 2026-07-25 (phone report): focus stays armed for hardware scanners,
  // but the virtual keyboard opens ONLY on a deliberate tap on the field.
  const [coarsePointer, setCoarsePointer] = useState(false);
  useEffect(() => {
    setCoarsePointer(window.matchMedia('(pointer: coarse)').matches);
  }, []);
  const [manualKb, setManualKb] = useState(false);
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
  // Owner 2026-07-28: typing LETTERS from a product name into the scan input
  // must surface live suggestions (word-start catalog search) — tapping one
  // behaves exactly like scanning that product's barcode.
  const [suggests, setSuggests] = useState<
    Array<{ id: string; name: string; code: string | null; mainImageId: string | null }>
  >([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  // «Umumiy sanash» (owner 2026-07-26): one common qty, then cells scan in a
  // row — each lands in the list below with the common qty (editable per row).
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkQty, setBulkQty] = useState('');
  // The CLEAN common qty for bulkAdd. During a wedge burst the bulkQty STATE
  // briefly holds scan garbage (each key echoes before the guard rolls it
  // back) — a row added at that instant must still get the human value, so
  // the guard writes the restored value here BEFORE routing the scan.
  const bulkQtyRef = useRef('');
  const setBulkQtyClean = useCallback((v: string) => {
    bulkQtyRef.current = v;
    setBulkQty(v);
  }, []);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  // Single-mode guard (owner 2026-07-26 band 3): a second cell scanned before
  // the qty is entered → the qty field turns RED (+ beep + message).
  const [qtyMissing, setQtyMissing] = useState(false);
  const qtyValid = qtyValidRe.test(qty.trim());
  const bulkQtyValid = qtyValidRe.test(bulkQty.trim());

  // ── Ref-mirrors (TZ v3 §3 burst) ───────────────────────────────────────────
  // The scan queue drains in a MICROTASK: two scans in a row run back-to-back
  // with no React render (and no passive effect) between them, so `resolveRef`
  // still points at the PREVIOUS render's `resolve` — whose closure predates
  // everything the first scan just wrote. Every piece of state that a scan
  // writes and a later scan (or `save()`) READS therefore gets a ref written
  // SYNCHRONOUSLY next to its setState:
  //   cell / selectedId / qty  — the band-3 guard («oldin miqdor kiriting»);
  //                              without mirrors a burst walks straight past it
  //                              and the counted-but-unsaved cell is silently
  //                              swapped for the next one;
  //   items                    — the «product scanned into the open cell» lookup;
  //   bulkRows                 — dedupe + `save()`'s snapshot;
  //   bulkMode / bulkQty       — user-toggled, but read by a scan that can land
  //                              in the commit→effect window right after the tap.
  const cellRef = useRef<{ id: string; name: string } | null>(null);
  const itemsRef = useRef<CellStockItem[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  const qtyValueRef = useRef('');
  const bulkRowsRef = useRef<BulkRow[]>([]);
  const bulkModeRef = useRef(false);
  const applyCell = useCallback((next: { id: string; name: string } | null) => {
    cellRef.current = next;
    setCell(next);
  }, []);
  const applyItems = useCallback((fn: (prev: CellStockItem[]) => CellStockItem[]) => {
    const next = fn(itemsRef.current);
    itemsRef.current = next;
    setItems(next);
  }, []);
  const applySelectedId = useCallback((next: string | null) => {
    selectedIdRef.current = next;
    setSelectedId(next);
  }, []);
  const applyQty = useCallback((next: string) => {
    qtyValueRef.current = next;
    setQty(next);
  }, []);
  const applyBulkRows = useCallback((fn: (prev: BulkRow[]) => BulkRow[]) => {
    const next = fn(bulkRowsRef.current);
    bulkRowsRef.current = next;
    setBulkRows(next);
  }, []);
  const applyBulkMode = useCallback((next: boolean) => {
    bulkModeRef.current = next;
    setBulkMode(next);
  }, []);

  /** §2.2.2: a row with an EMPTY own qty falls back to the common number — and
   *  it does so at SAVE time, so typing the common number after the rows landed
   *  still fills them. Reads the ref so `save()` is burst-safe. */
  const effectiveRowQty = useCallback(
    (row: { qty: string }) => row.qty.trim() || bulkQtyRef.current.trim(),
    [],
  );
  const findInvalidBulkRow = useCallback(
    () => bulkRowsRef.current.find((r) => !qtyValidRe.test(effectiveRowQty(r))),
    [effectiveRowQty],
  );

  // Reset per open; arm the wedge input after Radix's own autofocus.
  useEffect(() => {
    if (!open) return;
    applyCell(null);
    applyItems(() => []);
    applySelectedId(null);
    applyQty('');
    setMessage(null);
    setLastRead(null);
    setValue('');
    setSaving(false);
    setManualKb(false);
    applyBulkMode(false);
    setBulkQtyClean('');
    applyBulkRows(() => []);
    setQtyMissing(false);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [
    open,
    setBulkQtyClean,
    applyCell,
    applyItems,
    applySelectedId,
    applyQty,
    applyBulkMode,
    applyBulkRows,
  ]);

  const loadItems = useCallback(
    async (target: { id: string; name: string }) => {
      setLoadingItems(true);
      try {
        const res = await api.get<{ items: CellStockItem[] }>(
          `/admin/stores/${storeId}/cells/${target.id}/stock`,
        );
        const list = (res.items ?? []).filter((i) => i.assortmentKind === 'product');
        applyItems(() => list);
        // A single product auto-selects (spec: cards are for the 2+ case).
        applySelectedId(list.length === 1 ? (list[0]?.assortmentId ?? null) : null);
        applyQty('');
      } finally {
        setLoadingItems(false);
      }
    },
    [storeId, applyItems, applySelectedId, applyQty],
  );

  const selectProduct = useCallback(
    (id: string) => {
      applySelectedId(id);
      applyQty('');
      // Touch: no qty autofocus — it would pop the keyboard uninvited
      // (owner 2026-07-25); the user taps the field when ready to type.
      if (!coarsePointer) requestAnimationFrame(() => qtyRef.current?.focus());
    },
    [coarsePointer, applySelectedId, applyQty],
  );

  // Owner 2026-07-23: the scan field ECHOES what was recognised — the cell's
  // CODE or the product's NAME — selected, so the next scan overwrites it.
  // Echoed results must not re-trigger the name-suggestion dropdown (the
  // echo IS letters) — the suggestion effect skips this exact string.
  const echoSkipRef = useRef('');
  const echoInInput = useCallback((text: string, refocus: boolean) => {
    echoSkipRef.current = text;
    setValue(text);
    if (refocus) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, []);

  // Bulk mode: a scanned cell lands in the list with the common qty. Only a
  // single-product cell can ride the bulk lane — anything else answers loudly.
  const bulkAdd = useCallback(
    async (target: { id: string; name: string }) => {
      // TZ v3 §3: the request FAILING and the cell being EMPTY are two different
      // facts. They used to share one branch (`.catch(() => null)`), so a 500 or
      // a dropped connection told the picker «Yacheyka bo'sh» — a lie that can
      // cost a real recount. Each answers for itself now.
      let res: { items: CellStockItem[] };
      try {
        res = await api.get<{ items: CellStockItem[] }>(
          `/admin/stores/${storeId}/cells/${target.id}/stock`,
        );
      } catch {
        beep();
        setMessage({ kind: 'err', text: `${target.name}: ${t('scan_cell_contents_failed')}` });
        return;
      }
      const list = (res.items ?? []).filter((i) => i.assortmentKind === 'product');
      if (list.length === 0) {
        beep();
        setMessage({ kind: 'err', text: `${target.name}: ${t('count_empty')}` });
        return;
      }
      if (list.length > 1) {
        beep();
        setMessage({ kind: 'err', text: `${target.name}: ${t('count_bulk_multi')}` });
        return;
      }
      const p = list[0];
      if (!p) return;
      applyBulkRows((rows) => [
        {
          key: `${target.id}-${p.assortmentId}`,
          cell: target,
          product: { id: p.assortmentId, name: p.name },
          qty: bulkQtyRef.current,
          // §2.2.2: what the cell holds NOW — the row shows «hozirgi → bo'ladi»
          // so the picker sees where the added number lands.
          currentQty: String(p.qty ?? '0'),
        },
        ...rows.filter((r) => r.key !== `${target.id}-${p.assortmentId}`),
      ]);
      setMessage({ kind: 'ok', text: `${t('count_bulk_added', { name: p.name })}` });
      echoInInput(target.name, true);
    },
    [storeId, t, echoInInput, applyBulkRows],
  );

  const resolve = useCallback(
    async (raw: string) => {
      const code = normalizeScanInput(raw);
      if (!code) return;
      setLastRead(code);
      // 1) cell label? (local snapshot first, by-barcode endpoint as fallback)
      const hitCell =
        cells.find((c) => c.barcode === code) ?? cells.find((c) => c.name === code) ?? null;
      const onCell = async (target: { id: string; name: string }) => {
        if (bulkModeRef.current) {
          await bulkAdd(target);
          return;
        }
        // Band 3 guard: a product is picked but its qty is still empty — the
        // NEXT cell scan must not silently drop the unfinished count. Reads the
        // REFS: in a burst the previous scan's cell/product never reached this
        // closure, so a state read would walk right past the guard.
        if (
          cellRef.current &&
          selectedIdRef.current &&
          !qtyValidRe.test(qtyValueRef.current.trim())
        ) {
          beep();
          setQtyMissing(true);
          setMessage({ kind: 'err', text: t('count_qty_first') });
          requestAnimationFrame(() => qtyRef.current?.focus());
          return;
        }
        applyCell(target);
        setMessage({ kind: 'ok', text: `${t('scan_cell_label')}: ${target.name}` });
        echoInInput(target.name, true);
        await loadItems(target);
      };
      if (hitCell) {
        await onCell({ id: hitCell.id, name: hitCell.name });
        return;
      }
      const fresh = await api
        .get<{ cells: Array<{ id: string; name: string; storeId: string; storeName: string }> }>(
          `/admin/stores/cells/by-barcode?code=${encodeURIComponent(code)}`,
        )
        .catch(() => null);
      const found = fresh?.cells?.[0];
      if (found && found.storeId === storeId) {
        await onCell({ id: found.id, name: found.name });
        return;
      }
      // Bulk mode counts CELLS only — any other code answers loudly.
      if (bulkModeRef.current) {
        beep();
        setMessage({ kind: 'err', text: t('count_bulk_cell_only') });
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
      if (cellRef.current) {
        const hit = itemsRef.current.find(
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
          applyItems((prev) =>
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
        beep();
        setMessage({ kind: 'err', text: t('count_no_product') });
        return;
      }
      // No cell yet — if the code IS a product, explain the step order.
      const winners = await searchProduct();
      if (winners.length > 0) {
        beep();
        setMessage({ kind: 'err', text: t('scan_no_cell_yet') });
        return;
      }
      // TZ v3 §3: an unrecognised code is a REFUSAL — it is heard, not only read.
      beep();
      setMessage({ kind: 'err', text: t('count_not_found') });
    },
    [cells, storeId, t, loadItems, selectProduct, echoInInput, bulkAdd, applyCell, applyItems],
  );

  const resolveRef = useRef(resolve);
  useEffect(() => {
    resolveRef.current = resolve;
  }, [resolve]);

  // TZ v3 §3: skanlar navbatga tushadi — hech biri yo'qolmaydi va tartib
  // saqlanadi. `onError` SINXRON: `void enqueue(...)` qaytgan promise'ni hech
  // kim kutmagani uchun bu tutqichsiz xato JIM yo'qolardi (masalan yacheyka
  // tarkibi so'rovi 500 qaytarsa oddiy rejimda ekranda hech nima o'zgarmasdi).
  // Async handler bersak, uning rejection'i zanjirdan TASHQARIDA qolardi.
  const enqueue = useScanQueue(
    (code: string) => resolveRef.current(code),
    (err) => {
      beep();
      setMessage({
        kind: 'err',
        text: err instanceof Error ? err.message : t('count_not_found'),
      });
    },
  );

  // Owner 2026-07-27 (real-device report): a keyboard-wedge scanner types into
  // WHATEVER field holds the cursor — after tapping «Umumiy miqdor» the next
  // cell scans landed inside the qty input as garbage instead of the list.
  // Guard: every qty field watches its keystroke timing; a fast burst (≥4
  // chars, ≤45ms between keys) finished by Enter is a SCAN — the burst is
  // stripped back out of the field and handed to resolve(), so the qty box
  // only ever keeps what a human deliberately typed.
  const burstRef = useRef(
    new Map<string, { keys: Array<{ ch: string; t: number }>; base: string }>(),
  );
  const wedgeGuard = useCallback(
    (id: string, setVal: (v: string) => void, onPlainEnter?: () => void) =>
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        const m = burstRef.current;
        const st = m.get(id) ?? { keys: [], base: '' };
        const now = performance.now();
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const last = st.keys[st.keys.length - 1]?.t ?? 0;
          if (st.keys.length === 0 || now - last > 600) {
            // A long pause = whatever came before was separate. This key
            // starts a fresh potential burst; remember the field as it is
            // NOW (before this key lands) so a scan can be rolled back
            // no matter where the caret inserted it.
            st.keys = [];
            st.base = e.currentTarget.value;
          }
          st.keys.push({ ch: e.key, t: now });
          m.set(id, st);
          return;
        }
        if (e.key !== 'Enter') return;
        const lastAt = st.keys[st.keys.length - 1]?.t ?? 0;
        const burst = st.keys.map((x) => x.ch).join('');
        const gaps = st.keys
          .slice(1)
          .map((k, i) => k.t - (st.keys[i]?.t ?? k.t))
          .sort((a, b) => a - b);
        const median = gaps[Math.floor(gaps.length / 2)] ?? 9999;
        const base = st.base;
        m.set(id, { keys: [], base: '' });
        // A scan is (a) any Enter-finished burst carrying NON-qty characters
        // (letters/dashes never belong in a quantity) or (b) a long digit run
        // typed scanner-fast (median gap counts, so one render-jank spike
        // doesn't break detection — real phones jank too).
        const nonQtyChars = /[^0-9.,\s]/.test(burst);
        const isScan =
          burst.length >= 4 &&
          now - lastAt <= 600 &&
          (nonQtyChars || (burst.length >= 8 && median <= 120));
        if (isScan) {
          e.preventDefault();
          e.stopPropagation();
          setVal(base);
          // §3: through the QUEUE — a wedge burst can fire twice before React
          // re-renders, and both reads must survive in order.
          void enqueue(burst);
          return;
        }
        e.preventDefault();
        onPlainEnter?.();
      },
    [enqueue],
  );

  // Live name-search (owner 2026-07-28): letters in the scan input → word-start
  // catalog suggestions after a 300ms pause. Bulk mode counts CELLS only, so
  // the dropdown stays off there.
  useEffect(() => {
    const q = value.trim();
    const hasLetters = /[^\d\s.,-]/.test(q);
    if (bulkMode || q.length < 2 || !hasLetters || q === echoSkipRef.current) {
      setSuggests([]);
      return;
    }
    const timer = setTimeout(() => {
      api
        .get<{
          items: Array<{
            id: string;
            name: string;
            code: string | null;
            mainImageId?: string | null;
          }>;
        }>(`/products?search=${encodeURIComponent(q)}&limit=8`)
        .then((r) =>
          setSuggests(
            (r.items ?? []).map((p) => ({
              id: p.id,
              name: p.name,
              code: p.code ?? null,
              mainImageId: p.mainImageId ?? null,
            })),
          ),
        )
        .catch(() => setSuggests([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [value, bulkMode]);

  /** Tapping a suggestion = scanning that product's label. */
  const pickSuggest = useCallback(
    (p: { id: string; name: string; code: string | null; mainImageId: string | null }) => {
      setSuggests([]);
      if (!cell) {
        beep();
        setMessage({ kind: 'err', text: t('scan_no_cell_yet') });
        return;
      }
      applyItems((prev) =>
        prev.some((x) => x.assortmentId === p.id)
          ? prev
          : [
              ...prev,
              {
                assortmentKind: 'product',
                assortmentId: p.id,
                name: p.name,
                code: p.code,
                barcode: null,
                description: null,
                mainImageId: p.mainImageId,
                qty: '0',
              },
            ],
      );
      selectProduct(p.id);
      setMessage({ kind: 'ok', text: p.name });
      echoInInput(p.name, false);
    },
    [cell, selectProduct, echoInInput, t, applyItems],
  );

  // `enqueue` barqaror havola — kamera hooki qayta ishga tushmaydi.
  const onCameraDecoded = useCallback((raw: string) => void enqueue(raw), [enqueue]);
  const { videoRef, cameraOn, cameraError, diag, startCamera, stopCamera } = useBarcodeCamera({
    active: open,
    onDecoded: onCameraDecoded,
    cameraErrorText: t('scan_camera_error'),
  });

  // Owner 2026-07-23: the qty input is ALWAYS live and Save is clickable as
  // soon as a number is typed — a missing cell/product answers with a clear
  // message instead of a silently dead form. §2.2.4: in bulk mode the button is
  // never SILENTLY dead either — a bad row is refused out loud on the click.
  const canSave = bulkMode ? bulkRows.length > 0 && !saving : qtyValid && !saving;

  const save = useCallback(async () => {
    if (saving) return;
    // Reads the REFS, not the render's closure: an Enter inside the qty field
    // can land in the same microtask as a queued scan (see the ref-mirror note).
    if (bulkModeRef.current) {
      // §2.2.4: EVERY row is checked BEFORE the first write — one bad row and
      // nothing at all is written, with the offending CELL named. A half-applied
      // batch is unrecoverable in a warehouse: the picker cannot tell which
      // cells already moved.
      const invalidRow = findInvalidBulkRow();
      if (invalidRow) {
        beep();
        setMessage({
          kind: 'err',
          text: t('count_bulk_row_invalid', { cell: invalidRow.cell.name }),
        });
        return;
      }
      const rows = bulkRowsRef.current;
      if (rows.length === 0) return;
      setSaving(true);
      let done = 0;
      try {
        for (const r of [...rows].reverse()) {
          // §2.2.3: bulk ADDS — the delta is computed SERVER-side, so the FE
          // never reads «current» and writes back an absolute number (that race
          // is exactly what double-counts a cell two pickers touch at once).
          await api.put(`/admin/stores/${storeId}/cells/${r.cell.id}/stock`, {
            assortmentId: r.product.id,
            qty: effectiveRowQty(r),
            mode: 'add',
          });
          done += 1;
          applyBulkRows((prev) => prev.filter((x) => x.key !== r.key));
        }
        toast.success(tCommonSaved);
        onSaved();
        onOpenChange(false);
      } catch (e) {
        beep();
        setMessage({
          kind: 'err',
          text: t('scan_save_failed', { msg: e instanceof Error ? e.message : String(e) }),
        });
        setSaving(false);
        if (done > 0) onSaved();
      }
      return;
    }
    const activeCell = cellRef.current;
    const activeProduct = selectedIdRef.current;
    const typedQty = qtyValueRef.current.trim();
    if (!qtyValidRe.test(typedQty)) return;
    if (!activeCell) {
      beep();
      setMessage({ kind: 'err', text: t('scan_no_cell_yet') });
      return;
    }
    if (!activeProduct) {
      beep();
      setMessage({ kind: 'err', text: t('count_no_product') });
      return;
    }
    setSaving(true);
    try {
      // §2.1: single mode stays ABSOLUTE — the picker counted the shelf and
      // states what is there.
      await api.put(`/admin/stores/${storeId}/cells/${activeCell.id}/stock`, {
        assortmentId: activeProduct,
        qty: typedQty,
        mode: 'set',
      });
      // Owner 2026-07-25: a short top «Сохранено» note, then the window closes —
      // reopening starts a fresh, ready-to-scan count.
      toast.success(tCommonSaved);
      onSaved();
      onOpenChange(false); // spec: Save closes the window
    } catch (e) {
      beep();
      setMessage({
        kind: 'err',
        text: t('scan_save_failed', { msg: e instanceof Error ? e.message : String(e) }),
      });
      setSaving(false);
    }
  }, [
    saving,
    storeId,
    onSaved,
    onOpenChange,
    t,
    toast,
    tCommonSaved,
    findInvalidBulkRow,
    effectiveRowQty,
    applyBulkRows,
  ]);

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
            onClick={() => {
              // Owner 2026-07-26 band 3: cancel drops the CURRENT action first
              // (the scanned-but-unsaved cell / staged bulk rows); a second
              // press with nothing in progress closes the window.
              if (bulkMode && bulkRows.length > 0) {
                applyBulkRows(() => []);
                setMessage(null);
                return;
              }
              if (!bulkMode && cell) {
                applyCell(null);
                applyItems(() => []);
                applySelectedId(null);
                applyQty('');
                setQtyMissing(false);
                setMessage(null);
                inputRef.current?.focus();
                return;
              }
              onOpenChange(false);
            }}
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
              void enqueue(v);
            }
          }}
          inputMode={coarsePointer && !manualKb ? 'none' : undefined}
          onPointerDown={() => setManualKb(true)}
          placeholder={t('scan_input_placeholder')}
          className="h-10 w-full rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-input)] px-3 text-sm placeholder:text-[var(--ms-text-placeholder)] focus:border-[var(--ms-border-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ms-text-brand)]"
          data-test-id="cell-count-input"
        />

        {/* Live name-search suggestions (typed letters → matching products). */}
        {suggests.length > 0 && (
          <ul
            className="-mt-1 max-h-[200px] overflow-y-auto rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] shadow-sm"
            data-test-id="cell-count-suggests"
          >
            {suggests.map((p) => (
              <li key={p.id} className="border-[var(--ms-border-default)] border-b last:border-b-0">
                <button
                  type="button"
                  onClick={() => pickSuggest(p)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--ms-bg-hover)]"
                  data-test-id={`cell-count-suggest-${p.id}`}
                >
                  {p.mainImageId ? (
                    <img
                      src={imageRawUrl(p.mainImageId)}
                      alt=""
                      className="h-7 w-7 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[var(--ms-bg-muted)] text-[10px] text-[var(--ms-text-muted)]">
                      —
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-[13px]">{p.name}</span>
                  {p.code && (
                    <span className="shrink-0 text-[11px] text-[var(--ms-text-muted)] tabular-nums">
                      {p.code}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

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

        {/* TZ v3 §2: ONE number field — flipping the mode does not move it, only
            its label and its target change. Two fields (one per mode) meant the
            box jumped under the finger exactly when the picker was typing. */}
        <label className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-[var(--ms-text-primary)]">
            {bulkMode ? t('count_bulk_qty') : t('count_qty_label')}
          </span>
          <Input
            ref={qtyRef}
            inputMode="decimal"
            value={bulkMode ? bulkQty : qty}
            invalid={bulkMode ? bulkQty !== '' && !bulkQtyValid : qtyMissing}
            onChange={(e) => {
              if (bulkMode) {
                setBulkQtyClean(e.target.value);
                return;
              }
              setQtyMissing(false);
              applyQty(e.target.value);
            }}
            onKeyDown={wedgeGuard(
              'qty',
              (v) => {
                if (bulkMode) {
                  setBulkQtyClean(v);
                  return;
                }
                setQtyMissing(false);
                applyQty(v);
              },
              () => void save(),
            )}
            placeholder={bulkMode ? '50' : selectedId ? '' : t('count_select_first')}
            className="h-9 w-40 text-right tabular-nums"
            data-test-id="cell-count-qty"
          />
        </label>

        {/* «Umumiy sanash» (owner 2026-07-26, TZ v3 §2.2): one common number,
            then cells scan back-to-back; each lands below with an editable qty
            + ✕. The number is ADDED to every listed cell on save. */}
        <label className="flex items-center gap-2 text-[13px]">
          <Checkbox
            checked={bulkMode}
            onCheckedChange={(n) => {
              applyBulkMode(n === true);
              setMessage(null);
              setQtyMissing(false);
              inputRef.current?.focus();
            }}
            data-test-id="cell-count-bulk-toggle"
          />
          <span className="font-medium">{t('count_bulk_label')}</span>
        </label>
        {bulkMode && (
          <div className="flex flex-col gap-2" data-test-id="cell-count-bulk">
            <p className="text-[12px] text-[var(--ms-text-muted)]">{t('count_bulk_hint')}</p>
            {bulkRows.length > 0 && (
              <ul
                className="max-h-[220px] divide-y divide-[var(--ms-border-default)] overflow-y-auto rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]"
                data-test-id="cell-count-bulk-rows"
              >
                {bulkRows.map((r) => {
                  const typed = r.qty.trim() || bulkQty.trim();
                  const becomes = qtyValidRe.test(typed)
                    ? fmtQty(Number(r.currentQty) + Number(typed))
                    : '—';
                  return (
                    <li
                      key={r.key}
                      className="flex items-center gap-2 px-2.5 py-1.5"
                      data-test-id={`cell-count-bulk-row-${r.cell.id}`}
                    >
                      <span className="shrink-0 rounded bg-[var(--ms-bg-muted)] px-1.5 py-0.5 font-medium text-[12px] text-[var(--ms-text-muted)] tabular-nums">
                        {r.cell.name}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px]">{r.product.name}</span>
                      {/* §2.2.2: the added number must be visibly LANDING somewhere. */}
                      <span className="shrink-0 text-[11px] text-[var(--ms-text-muted)] tabular-nums">
                        {t('count_bulk_current')}:{' '}
                        <span data-test-id={`cell-count-bulk-current-${r.cell.id}`}>
                          {fmtQty(Number(r.currentQty) || 0)}
                        </span>{' '}
                        → {t('count_bulk_becomes')}:{' '}
                        <span data-test-id={`cell-count-bulk-becomes-${r.cell.id}`}>{becomes}</span>
                      </span>
                      <Input
                        inputMode="decimal"
                        value={r.qty}
                        invalid={r.qty !== '' && !qtyValidRe.test(r.qty.trim())}
                        onChange={(e) =>
                          applyBulkRows((rows) =>
                            rows.map((x) => (x.key === r.key ? { ...x, qty: e.target.value } : x)),
                          )
                        }
                        onKeyDown={wedgeGuard(`row-${r.key}`, (v) =>
                          applyBulkRows((rows) =>
                            rows.map((x) => (x.key === r.key ? { ...x, qty: v } : x)),
                          ),
                        )}
                        className="h-8 w-24 shrink-0 text-right tabular-nums"
                        data-test-id={`cell-count-bulk-qty-${r.cell.id}`}
                      />
                      <button
                        type="button"
                        onClick={() => applyBulkRows((rows) => rows.filter((x) => x.key !== r.key))}
                        className="shrink-0 rounded px-1 text-[14px] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)] hover:text-[var(--ms-text-destructive)]"
                        aria-label={t('scan_cancel')}
                        data-test-id={`cell-count-bulk-remove-${r.cell.id}`}
                      >
                        ✕
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

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
