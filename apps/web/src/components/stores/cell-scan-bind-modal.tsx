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
 * what to do — TZ v3 §1.2 (owner 2026-08-10) restored the third option and
 * put the OCCUPANT'S NAME on the buttons: «"Olma" bilan birga qo'shish» ·
 * «"Olma"ni chiqarib, hozirgisini qo'shish» · «Bekor qilish». The answer is
 * remembered PER CELL (`decisions`) so a burst of scans into one cell asks
 * once, not once per item; eviction is a STAGED intent — nothing is written
 * until «Saqlash», which deletes the recorded occupants first and only then
 * posts the new rows. Binding writes the SAME record the manual picker writes
 * (Product.attributes.__yacheyka via POST cells/:id/products) — one source of
 * truth, no new tables.
 * Camera pipeline lives in the shared useBarcodeCamera hook; every scan goes
 * through useScanQueue so a burst is processed IN ORDER (TZ v3 §3).
 */

import { useBarcodeCamera } from '@/components/stores/use-barcode-camera';
import { useScanQueue } from '@/components/stores/use-scan-queue';
import { usePermissions } from '@/hooks/use-permissions';
import { api } from '@/lib/api-client';
import { beep } from '@/lib/beep';
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

/** «Yacheyka band» dialog payload: the product just scanned + the cell's
 *  SERVER contents (staged rows are never offered for eviction). */
interface Conflict {
  product: ProductHit;
  existing: Array<{ id: string; name: string }>;
}

/** The answer given once per cell (TZ v3 §1.2). `evict` is the snapshot of the
 *  cell's SERVER contents at decision time — «Saqlash» deletes exactly these
 *  and nothing else, so a row staged in this session can never evict itself. */
interface CellDecision {
  mode: 'together' | 'replace';
  evict: Array<{ id: string; name: string }>;
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
  // TZ §3: bog'lash/sanash — `storecell` ruxsati, lekin CHIQARISH — `store.update`
  // (T1 da DELETE .../products/:id ataylab shunda qoldirilgan), ya'ni omborchida
  // yo'q. Tugma unga KO'RINMASIN: aks holda u qarorni tanlaydi, ro'yxatni
  // to'ldiradi va faqat «Saqlash» da 403 oladi — butun mehnat kuyadi.
  // Matritsa hali kelmagan bo'lsa fail-open (fayl/hook konvensiyasi) — server
  // baribir yakuniy qaror qiluvchi.
  const { matrix } = usePermissions();
  const canEvict = matrix ? matrix.store?.update !== 'NO' : true;
  const [cell, setCell] = useState<{ id: string; name: string } | null>(initialCell);
  const [lastProduct, setLastProduct] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(
    null,
  );
  const [conflict, setConflict] = useState<Conflict | null>(null);
  /** Rad etilgan skan haqidagi xabar — u ASOSIY oynaning banneriga emas, KONFLIKT
   *  DIALOGI ichiga chiqadi: dialog overlay'i asosiy oynani to'sib turadi, ya'ni
   *  bannerdagi matnni foydalanuvchi ko'rmaydi va faqat beep eshitardi. Xabar
   *  foydalanuvchi qarab turgan joyda bo'lishi kerak. */
  const [conflictRefusal, setConflictRefusal] = useState<string | null>(null);
  // Staged bindings — written ONLY by «Saqlash» (owner 2026-07-21).
  const [pending, setPending] = useState<PendingRow[]>([]);
  /** TZ v3 §1.2: band yacheyka savoli HAR YACHEYKA UCHUN BIR MARTA so'raladi —
   *  javob shu yerda yashaydi. `evict` — qaror qabul qilingan lahzadagi SERVER
   *  tarkibi: «chiqarib qo'shish» saqlashda AYNAN shularni oladi (bu sessiyada
   *  staged qilingan qatorlar hech qachon chiqarilmaydi). */
  const [decisions, setDecisions] = useState<Map<string, CellDecision>>(new Map());
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState('');
  // What the camera/scanner last READ — always shown, so nothing is silent.
  const [lastRead, setLastRead] = useState<string | null>(null);
  // Read-flash (owner 2026-07-21): the viewfinder turns BRAND-BLUE for a
  // moment on every successful decode — instant «o'qildi» feedback.
  const [readFlash, setReadFlash] = useState(false);
  const flashTimerRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ——— BURST-SAFE MIRRORS (TZ v3 §3) ——————————————————————————————
  // `resolve` is rebuilt every render and published to `resolveRef` by an
  // EFFECT, but the scan queue drains in MICROTASKS: two codes from a single
  // trigger-pull run back-to-back, and React has neither re-rendered nor run
  // its passive effects in between. A `resolve` reading component STATE would
  // therefore see the PREVIOUS scan's world — §1.4's staged-duplicate guard
  // would miss (one product → two rows → two POSTs) and §1.2's remembered
  // decision would not exist yet (a second dialog overwriting the first).
  // Every value `resolve()` reads is mirrored into a ref written SYNCHRONOUSLY
  // beside its setState, and `resolve()` reads ONLY the refs.
  const pendingRef = useRef<PendingRow[]>([]);
  const decisionsRef = useRef<Map<string, CellDecision>>(new Map());
  const cellRef = useRef<{ id: string; name: string } | null>(initialCell);
  const conflictRef = useRef(false);
  /** Row keys: a counter, not `Date.now()` — a burst stages several rows inside
   *  the same millisecond, and two of the SAME product would collide on key. */
  const keySeqRef = useRef(0);
  /** Last code refused while the dialog was open. The camera re-delivers the
   *  SAME code every 2.5s while a label sits in the frame (`useBarcodeCamera`
   *  de-dupes on code), so beeping on every delivery turns «thinking about the
   *  question» into a metronome. A repeat of the same code stays SILENT — the
   *  refusal text is already on screen inside the dialog, so nothing is hidden —
   *  while any NEW code (the realistic wedge / re-typed case) beeps loudly. */
  const refusedCodeRef = useRef<string | null>(null);

  const applyPending = useCallback((fn: (rows: PendingRow[]) => PendingRow[]) => {
    const next = fn(pendingRef.current);
    pendingRef.current = next;
    setPending(next);
  }, []);
  const applyDecisions = useCallback(
    (fn: (m: Map<string, CellDecision>) => Map<string, CellDecision>) => {
      const next = fn(decisionsRef.current);
      decisionsRef.current = next;
      setDecisions(next);
    },
    [],
  );
  const applyCell = useCallback((next: { id: string; name: string } | null) => {
    cellRef.current = next;
    setCell(next);
  }, []);
  const applyConflict = useCallback((next: Conflict | null) => {
    conflictRef.current = !!next;
    // Har yangi savol (va har yopilish) rad-etish holatini toza boshlaydi.
    refusedCodeRef.current = null;
    setConflictRefusal(null);
    setConflict(next);
  }, []);

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
    applyCell(initialCell);
    setLastProduct(null);
    setMessage(null);
    applyConflict(null);
    applyPending(() => []);
    applyDecisions(() => new Map());
    setSaving(false);
    setValue('');
    setLastRead(null);
    setFlashCard(null);
    setManualKb(false);
    keySeqRef.current = 0;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open, initialCell, applyCell, applyConflict, applyPending, applyDecisions]);

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

  // STAGE a binding (owner 2026-07-21: nothing is written on scan — rows
  // collect in the list and «Saqlash» commits them all; the list is uncapped
  // because every staged row must reach the save).
  const stage = useCallback(
    (product: { id: string; name: string }, targetCell: { id: string; name: string }) => {
      setLastProduct(product.name);
      flashTheCard('product');
      setMessage({ kind: 'ok', text: t('scan_staged') });
      keySeqRef.current += 1;
      const key = `${keySeqRef.current}-${product.id}`;
      applyPending((rows) => [
        { key, product: { id: product.id, name: product.name }, cell: targetCell },
        ...rows,
      ]);
    },
    [t, flashTheCard, applyPending],
  );

  // «Saqlash» — commit every staged row in scan order: unbind the staged
  // replacements first, then bind. Committed rows leave the list one by one,
  // so a mid-save failure keeps the unsaved remainder visible.
  const save = useCallback(async () => {
    const rows = [...pendingRef.current].reverse(); // scan order
    if (rows.length === 0 || saving) return;
    setSaving(true);
    // TZ v3 §1.3: har guruh o'z yacheykasiga yoziladi.
    const byCell = new Map<string, PendingRow[]>();
    for (const r of rows) {
      const list = byCell.get(r.cell.id) ?? [];
      list.push(r);
      byCell.set(r.cell.id, list);
    }
    let done = 0;
    let evicted = 0;
    try {
      for (const [cellId, cellRows] of byCell) {
        // TZ v3 §1.2: «chiqarib qo'shish» — AVVAL eski chiqariladi (bir marta,
        // qaror qabul qilingan lahzadagi SERVER ro'yxati bo'yicha), KEYIN
        // yangilari yoziladi. `evict` qayta hisoblanmaydi — aks holda shu
        // sessiyada staged qilingan qator o'zini-o'zi chiqarib yuborardi.
        const decision = decisionsRef.current.get(cellId);
        if (decision?.mode === 'replace' && decision.evict.length > 0) {
          for (const victim of decision.evict) {
            await api.delete(`/admin/stores/${storeId}/cells/${cellId}/products/${victim.id}`);
            evicted += 1;
          }
          // Chiqarish BAJARILDI — qaror `together` ga tushadi. Ikki ish bir
          // yo'la: (1) keyingi qadam (POST) yiqilsa «Saqlash» qayta bosilganda
          // DELETE TAKRORLANMAYDI (server tomoni ham idempotent:
          // `unassignProduct` topilmasa `{unassigned:false}` qaytaradi, throw
          // qilmaydi — store-address.service.ts); (2) chiqariladigan hech narsa
          // qolmagani uchun `replace` muhri saqlansa, o'sha yacheykadagi qolgan
          // va keyin skanlangan qatorlarda «almashtiradi» belgisi YOLG'ON bo'lib
          // turaverardi (§1.2 fikrdan-qaytish shoxidagi qoida bilan bir xil:
          // bo'sh `evict` ⇒ `together`).
          applyDecisions((m) => new Map(m).set(cellId, { mode: 'together', evict: [] }));
        }
        for (const r of cellRows) {
          await api.post(`/admin/stores/${storeId}/cells/${cellId}/products`, {
            productIds: [r.product.id],
          });
          done += 1;
          applyPending((p) => p.filter((x) => x.key !== r.key));
        }
      }
      setMessage({ kind: 'ok', text: t('scan_saved_n', { count: done }) });
      // Owner 2026-07-25: a full save also toasts «Saqlandi…».
      toast.success(t('scan_saved_n', { count: done }));
    } catch (e) {
      // Owner 2026-07-21: NOTHING resets silently — the failure names its cause
      // and the unsaved rows stay in the list for a retry (TZ §3: + beep).
      // Chiqarish o'tib, yozish yiqilgan bo'lsa yacheyka SERVERDA BO'SH qoldi —
      // buni yashirish mumkin emas: xabar aynan shu holatni ataydi va qayta
      // urinish xavfsizligini aytadi (aks holda omborchi oynani yopib,
      // bog'lanishni butunlay yo'qotardi).
      beep();
      const msg = e instanceof Error ? e.message : String(e);
      setMessage({
        kind: 'err',
        text:
          evicted > 0 ? t('scan_save_partial', { msg, evicted }) : t('scan_save_failed', { msg }),
      });
    }
    if (done > 0) onBound();
    setSaving(false);
    rearm();
  }, [saving, storeId, onBound, t, rearm, toast, applyPending, applyDecisions]);

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
      // TZ v3 §3: «Yacheyka band» savoli ochiq turganda kelgan skan. The queue
      // does NOT pause for the dialog, so without this the next code would run
      // with the answer still missing and its `setConflict` would OVERWRITE the
      // pending question — the first scanned product would vanish with no trace.
      // The scan is REFUSED rather than queued-until-answered: a modal can sit
      // open for minutes, and a silently stalled queue is exactly the «scanner
      // died» failure `useScanQueue` warns about. Refusing is loud (beep + the
      // code that was read is on screen) and re-scanning costs one second,
      // while the answer itself decides what happens to later scans anyway.
      // Xabar DIALOG ICHIGA chiqadi (asosiy banner overlay ostida qoladi), beep
      // esa faqat YANGI kod uchun — kamera bir xil etiketkani har 2.5s qayta
      // uzatadi, har safar beep qilish javobni o'ylayotgan odamga metronom
      // bo'lardi. Matn ekranda turgani uchun jimlik = ma'lumotsizlik EMAS.
      if (conflictRef.current) {
        if (refusedCodeRef.current !== code) beep();
        refusedCodeRef.current = code;
        setConflictRefusal(t('scan_answer_conflict_first'));
        return;
      }
      // 1) cell label? (barcode first, exact name as a manual-typing fallback)
      const hitCell =
        cells.find((c) => c.barcode === code) ?? cells.find((c) => c.name === code) ?? null;
      if (hitCell) {
        applyCell({ id: hitCell.id, name: hitCell.name });
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
            applyCell({ id: foreign.id, name: foreign.name });
            setLastProduct(null);
            flashTheCard('cell');
            setMessage({ kind: 'ok', text: `${t('scan_cell_label')}: ${foreign.name}` });
            return;
          }
          if (foreign) {
            beep();
            setMessage({
              kind: 'warn',
              text: t('scan_cell_other_store', { store: foreign.storeName }),
            });
            return;
          }
          beep();
          setMessage({ kind: 'err', text: t('scan_not_found') });
          return;
        }
        if (winners.length > 1) {
          beep();
          setMessage({ kind: 'warn', text: t('scan_multiple') });
          return;
        }
        const product = winners[0];
        if (!product) return;
        const activeCell = cellRef.current;
        if (!activeCell) {
          beep();
          setMessage({ kind: 'warn', text: t('scan_no_cell_yet') });
          return;
        }
        // Owner 2026-07-20: an occupied cell must ASK, not silently append.
        // The two sources are kept APART on purpose (TZ v3 §1.2/§1.4): the
        // dialog — and therefore the eviction list — only ever names what the
        // SERVER holds, while staged rows only produce the «already in the
        // list» warning.
        //
        // A FAILED read is NOT an empty cell. The old `.catch(() => null)`
        // turned a 500/timeout into `serverItems = []`, which skipped the
        // dialog AND sealed `{mode:'together'}` for the whole session — one
        // dropped request silently locked in the wrong answer for every later
        // scan into that cell. Nothing is sealed and nothing is staged now;
        // the worker simply re-scans.
        let serverItems: Array<{ id: string; name: string }>;
        try {
          const bound = await api.get<{ items: Array<{ id: string; name: string }> }>(
            `/admin/stores/${storeId}/cells/${activeCell.id}/products`,
          );
          serverItems = bound?.items ?? [];
        } catch {
          beep();
          setMessage({ kind: 'err', text: t('scan_cell_contents_failed') });
          return;
        }
        const stagedHere = pendingRef.current.filter((r) => r.cell.id === activeCell.id);
        const decided = decisionsRef.current.get(activeCell.id);

        // §1.4: shu mahsulot ALLAQACHON RO'YXATDA (staged) — sariq, takror yo'q.
        if (stagedHere.some((r) => r.product.id === product.id)) {
          beep();
          setMessage({ kind: 'warn', text: t('scan_already_staged') });
          return;
        }
        // §1.2 FIKRDAN QAYTISH: yacheyka «chiqarib qo'shish» ga muhrlangan va
        // foydalanuvchi aynan CHIQARILADIGAN mahsulotni qayta skanladi — bu
        // «u qolsin» degani. Ilgari bu yerda yashil «allaqachon bog'langan»
        // chiqardi-yu, `save()` uni baribir DELETE qilardi: omborchi
        // «qoldirdim» degan tovar jim yo'qolardi. Mahsulot serverda ALLAQACHON
        // turgani uchun uni ro'yxatga qo'shish (POST) shart emas — yetarlisi
        // `evict` dan chiqarish. Ro'yxat bo'shab qolsa qaror «together» ga
        // tushadi, ya'ni qatorlardagi «almashtiradi» belgisi ham yolg'on
        // bo'lib qolmaydi.
        if (decided?.mode === 'replace' && decided.evict.some((x) => x.id === product.id)) {
          const nextEvict = decided.evict.filter((x) => x.id !== product.id);
          applyDecisions((m) =>
            new Map(m).set(
              activeCell.id,
              nextEvict.length > 0
                ? { mode: 'replace', evict: nextEvict }
                : { mode: 'together', evict: [] },
            ),
          );
          setLastProduct(product.name);
          flashTheCard('product');
          setMessage({ kind: 'ok', text: t('scan_evict_cancelled', { name: product.name }) });
          return;
        }
        // §1.4: serverda allaqachon bog'langan — yashil, qo'shilmaydi.
        if (serverItems.some((x) => x.id === product.id)) {
          setLastProduct(product.name);
          flashTheCard('product');
          setMessage({ kind: 'ok', text: t('scan_already_bound') });
          return;
        }

        if (decided) {
          // §1.2: qaror eslab qolingan — so'roqsiz davom etadi.
          stage(product, activeCell);
          return;
        }
        if (serverItems.length > 0) {
          applyConflict({ product, existing: serverItems });
          return;
        }
        // Bo'sh yacheyka: birinchi qaror ham kerak emas, lekin keyingi
        // skanlar uchun «together» deb muhrlanadi (dialog hech qachon
        // sababsiz chiqmasin).
        applyDecisions((m) => new Map(m).set(activeCell.id, { mode: 'together', evict: [] }));
        stage(product, activeCell);
      } catch (e) {
        beep();
        setMessage({ kind: 'err', text: e instanceof Error ? e.message : t('scan_not_found') });
      }
    },
    [cells, storeId, stage, t, flashTheCard, applyCell, applyConflict, applyDecisions],
  );

  /** Dialog tugmalari uchun qisqa nom: «Olma» yoki «Olma +2». */
  const conflictLabel = conflict
    ? conflict.existing.length > 1
      ? `${conflict.existing[0]?.name ?? ''} +${conflict.existing.length - 1}`
      : (conflict.existing[0]?.name ?? '')
    : '';

  // TZ v3 §1.2: the answer is sealed FOR THE CELL — later scans into the same
  // cell never re-ask. `evict` freezes the server snapshot the user actually
  // saw, so «Saqlash» removes exactly what the dialog named.
  const decide = useCallback(
    (mode: 'together' | 'replace') => {
      const target = cellRef.current;
      if (!conflict || !target) return;
      applyDecisions((m) =>
        new Map(m).set(target.id, { mode, evict: mode === 'replace' ? conflict.existing : [] }),
      );
      stage(conflict.product, target);
      if (mode === 'replace') setMessage({ kind: 'ok', text: t('scan_staged_replace') });
      applyConflict(null);
      rearm();
    },
    [conflict, stage, rearm, t, applyDecisions, applyConflict],
  );

  // The camera pipeline lives in the shared useBarcodeCamera hook (extracted
  // 2026-07-21). resolveRef keeps the LATEST resolve without camera restarts.
  // Reads that arrive while the occupied-cell dialog is open are NOT dropped
  // here any more — `resolve()` refuses them out loud (TZ v3 §3); the camera
  // hook's own 2.5s same-code de-dupe keeps a stationary label from beeping
  // repeatedly.
  const resolveRef = useRef(resolve);
  useEffect(() => {
    resolveRef.current = resolve;
  }, [resolve]);

  // TZ v3 §3: skanlar navbatga tushadi — hech biri yo'qolmaydi va tartib
  // saqlanadi. `onError` SINXRON: `void enqueue(...)` qaytgan promise'ni hech
  // kim kutmagani uchun bu tutqichsiz xato jim yo'qolardi («jim rad etish
  // yo'q» talabiga zid). Async handler bersak, uning rejection'i zanjirdan
  // TASHQARIDA qolardi — shuning uchun ataylab sinxron.
  const enqueue = useScanQueue(
    (code: string) => resolveRef.current(code),
    (err) => {
      beep();
      setMessage({
        kind: 'err',
        text: err instanceof Error ? err.message : t('scan_not_found'),
      });
    },
  );

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
          void enqueue(v);
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
  }, [open, enqueue]);

  // `enqueue` barqaror havola — kamera hooki qayta ishga tushmaydi.
  const onCameraDecoded = useCallback((raw: string) => void enqueue(raw), [enqueue]);
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
                void enqueue(v);
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
                  {/* TZ v3 §1.2: «Saqlash» bu qatorni yozishdan oldin yacheykani
                      bo'shatadi — bu belgi shuni oldindan ko'rsatadi. */}
                  {decisions.get(row.cell.id)?.mode === 'replace' && (
                    <span
                      className="shrink-0 rounded bg-[var(--ms-error-50,#fdf0ef)] px-1.5 py-0.5 text-[11px] text-[var(--ms-text-destructive)]"
                      data-test-id={`cell-scan-row-replaces-${row.key}`}
                    >
                      {t('scan_row_replaces')}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const next = pendingRef.current.filter((x) => x.key !== row.key);
                      applyPending(() => next);
                      // TZ v3 §1.2: yacheykaning OXIRGI qatori olib tashlansa
                      // qaror ham kuchini yo'qotadi. Aks holda «replace» muhri
                      // qolib ketardi: keyingi skan so'roqsiz staged bo'lar,
                      // «Saqlash» esa eski mahsulotni baribir DELETE qilardi —
                      // foydalanuvchi bekor qilgan amal jimgina bajarilardi.
                      if (!next.some((x) => x.cell.id === row.cell.id)) {
                        applyDecisions((m) => {
                          const copy = new Map(m);
                          copy.delete(row.cell.id);
                          return copy;
                        });
                      }
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

      {/* «Yacheyka band» — the occupied-cell decision dialog (TZ v3 §1.2):
          birga qo'shish · chiqarib qo'shish · bekor qilish. */}
      <Modal
        open={!!conflict}
        onOpenChange={(o) => {
          if (!o) {
            applyConflict(null);
            rearm();
          }
        }}
        title={t('scan_conflict_title')}
        widthClass="w-[440px]"
        testId="cell-scan-conflict"
        footer={
          <>
            {/* TZ v3 §1.2: har ikkala tugmada EGALLOVCHINING NOMI turadi —
                omborchi «nimani birga qo'shyapman / nimani chiqaryapman» ni
                tugmaning o'zidan o'qiydi. */}
            <Button
              type="button"
              variant="success"
              size="sm"
              onClick={() => decide('together')}
              data-test-id="cell-scan-add-together"
            >
              {t('scan_add_together_named', { name: conflictLabel })}
            </Button>
            {canEvict && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => decide('replace')}
                data-test-id="cell-scan-replace"
              >
                {t('scan_replace_named', { name: conflictLabel })}
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                applyConflict(null);
                rearm();
              }}
              data-test-id="cell-scan-conflict-cancel"
            >
              {t('scan_cancel')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2 px-4 py-3">
          <div className="text-sm" data-test-id="cell-scan-conflict-msg">
            {t('scan_conflict_msg', {
              name: conflict?.existing.map((x) => x.name).join(', ') ?? '',
            })}
          </div>
          {/* TZ v3 §3: savol ochiq turganda kelgan skan rad etilganini AYNAN shu
              yerda ko'rsatamiz — asosiy oynadagi banner overlay ostida qoladi. */}
          {conflictRefusal && (
            <div
              className="rounded-[var(--ms-radius-default)] border border-[var(--ms-warning-500,#d3a616)] bg-[var(--ms-warning-50,#fdf6e3)] px-3 py-2 font-semibold text-[13px] text-[var(--ms-warning-600,#8a6d1a)]"
              data-test-id="cell-scan-conflict-refusal"
            >
              {conflictRefusal}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
