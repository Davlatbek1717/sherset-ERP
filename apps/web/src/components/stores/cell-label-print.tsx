'use client';

/**
 * «🖨 Этикетка» — cell-location label print (user feature F1, spec:
 * docs/audits/stores-1to1-2026-07-03/NEXT-FEATURES-SPEC.md).
 *
 * Label content (user decision 2026-07-04, revised twice): CELL CODE
 * («01-02-03-04» = Склад·Полка·Ярус·Ячейка, two digits each) big on top + a
 * LINEAR Code 128 barcode of the cell's barcode/code below (user asked for a
 * shtrix-kod, not a QR) — and NOTHING product-specific. A cell label
 * identifies the LOCATION, not its current contents. One permanent 58×40mm
 * thermal label per cell. (Product-side identification is planned separately:
 * the TSD flow will show the product IMAGE on scan.)
 *
 * Legacy cells whose fallback value can't ride Code 128 (e.g. a Cyrillic
 * free-text name with no barcode) print the big code text only — QR was
 * removed app-wide (user rule 2026-07-05: «faqat shtrix-kod»).
 *
 * Print isolation reuses the proven portal pattern from qr-price-tag-print
 * (v5 lesson: print previews INSIDE the app layout print the chrome too —
 * portal under <body> + hide every other body child).
 */

import { TAG_FONT } from '@/components/assortment/qr-price-tag-print';
import { type SegmentRange, filterCellsByRange } from '@/components/stores/cell-name-range';
import { code128Widths } from '@/lib/vendor/code128';
import { Button, Icons, Input } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const LABEL_W_MM = 58;
const LABEL_H_MM = 40;
// 2026-07-30: kod-shrift kattalashtirildi — padding kamaytirilib kodga en berildi
// (qog'oz o'lchami LABEL_W/H_MM O'ZGARMAYDI).
const PAD_MM = 1.4;

interface LabelData {
  key: string;
  cellCode: string;
  qrValue: string;
}

/** Linear Code 128 strip — bars as SVG rects, 10-module quiet zone each side. */
function Code128Svg({ value, heightPx }: { value: string; heightPx: number }) {
  const widths = useMemo(() => code128Widths(value), [value]);
  if (!widths) return null;
  const total = widths.reduce((a, b) => a + b, 0) + 20;
  const rects: Array<{ x: number; w: number }> = [];
  let x = 10;
  widths.forEach((w, i) => {
    if (i % 2 === 0) rects.push({ x, w });
    x += w;
  });
  return (
    <svg
      viewBox={`0 0 ${total} ${heightPx}`}
      preserveAspectRatio="none"
      style={{
        width: '100%',
        height: `${heightPx}px`,
        shapeRendering: 'crispEdges',
        display: 'block',
      }}
      role="img"
      aria-label={value}
      data-test-id="cell-label-barcode"
    >
      {rects.map((r) => (
        <rect key={r.x} x={r.x} y={0} width={r.w} height={heightPx} fill="#000" />
      ))}
    </svg>
  );
}

/**
 * Yacheyka kodi — etiketka enini TO'LIQ egallaydigan avto-o'lchamli SVG-matn
 * (2026-07-30: egasi «yana kattalashtirish» so'radi, qog'oz o'lchami o'zgarmaydi).
 * `textLength` matnни viewBox eniga cho'zadi ⇒ kod har uzunlikda maksimal katta,
 * hech qachon kesilmaydi. `viewBox` eni belgi-soniga proporsional (~0.48em/belgi) —
 * uzun kodlar (11 belgi) biroz ZICHROQ, lekin sezilarli BALANDROQ chiqadi; qisqa
 * kodlar butun bo'sh joyni to'ldiradi.
 */
function LabelCodeSvg({ value }: { value: string }) {
  const vbH = 100;
  const vbW = Math.max(1, value.length) * 48;
  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      // xMidYMin — kod o'z bloki ichida TEPAga hizalanadi (markazда emas).
      preserveAspectRatio="xMidYMin meet"
      style={{ width: '100%', height: '100%', display: 'block' }}
      role="img"
      aria-label={value}
      data-test-id="cell-label-code"
    >
      <text
        x={vbW / 2}
        y={vbH / 2}
        textAnchor="middle"
        dominantBaseline="central"
        textLength={vbW}
        lengthAdjust="spacingAndGlyphs"
        fontWeight={800}
        fontSize={vbH * 0.9}
        fill="#111"
        style={{ fontFamily: TAG_FONT, fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </text>
    </svg>
  );
}

function CellLabel({ label }: { label: LabelData }) {
  const barcodeEncodable = code128Widths(label.qrValue) !== null;
  return (
    <div
      className="cell-label"
      data-test-id="cell-label"
      style={{
        width: `${LABEL_W_MM}mm`,
        height: `${LABEL_H_MM}mm`,
        padding: `${PAD_MM}mm`,
        background: '#fff',
        color: '#111',
        fontFamily: TAG_FONT,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* Kod + shtrix-kod etiketka TEPAsida (o'rtaga EMAS): etiketka-printer
          kontentni pastga suradi, shuning uchun tepaga qo'yamiz va PASTDA bo'sh
          joy qoldiramiz ⇒ chop etilganda markazga tushib to'g'ri bo'ladi (egasi
          2026-07-30). Kod-blok chegaralangan balandlik (flex:1 EMAS) ⇒ o'rtaga
          cho'zilib ketmaydi, 2-stikerga oshmaydi. */}
      <div style={{ height: '56px', minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <LabelCodeSvg value={label.cellCode} />
      </div>
      {/* Scanner half: Code 128 strip. A non-encodable legacy value (Cyrillic
          free-text name, no barcode) prints the big code text only — no QR
          anywhere (user rule 2026-07-05). */}
      {barcodeEncodable && <Code128Svg value={label.qrValue} heightPx={52} />}
    </div>
  );
}

/**
 * «Diapazon bo'yicha belgilash» — 400 ta katakchani qo'lda belgilash o'rniga
 * (egasi 2026-07-30). Nom `ombor-polka-qator-yacheyka` bo'lgani uchun uch
 * segmentga diapazon berish kifoya; ombor baribir bitta (oyna shu ombor
 * ichida). Mos kelganlar tanlovga QO'SHILADI — mavjud belgilar o'chmaydi.
 *
 * Bu YARATMAYDI, faqat mavjud yacheykalarni filtrlaydi (sof mantiq
 * `cell-name-range.ts` da, testlari bilan).
 */
function RangeSelectRow({
  cells,
  onSelect,
}: {
  cells: Array<{ id: string; name: string }>;
  onSelect: (ids: string[]) => void;
}) {
  const t = useTranslations('pages.stores.cell_label');
  const [polka, setPolka] = useState({ from: '', to: '' });
  const [qator, setQator] = useState({ from: '', to: '' });
  const [yach, setYach] = useState({ from: '', to: '' });

  /** Bo'sh juftlik ⇒ null (cheklanmagan). Yarim to'ldirilgani ham null. */
  const toRange = (v: { from: string; to: string }): SegmentRange | null => {
    const f = Number.parseInt(v.from, 10);
    const tt = Number.parseInt(v.to, 10);
    if (!Number.isFinite(f) || !Number.isFinite(tt)) return null;
    return f <= tt ? { from: f, to: tt } : { from: tt, to: f };
  };

  const ranges = [null, toRange(polka), toRange(qator), toRange(yach)];
  const anySet = ranges.some((r) => r !== null);
  const matched = anySet ? filterCellsByRange(cells, ranges) : [];

  const num = (v: string) => v.replace(/\D/g, '').slice(0, 2);
  const pair = (
    label: string,
    v: { from: string; to: string },
    set: (n: { from: string; to: string }) => void,
    testId: string,
  ) => (
    <span className="flex items-center gap-1">
      <span className="text-slate-500 text-xs">{label}</span>
      <Input
        value={v.from}
        onChange={(e) => set({ ...v, from: num(e.target.value) })}
        className="h-7 w-12 text-center tabular-nums"
        inputMode="numeric"
        aria-label={`${label} ${t('range_from')}`}
        title={`${label} ${t('range_from')}`}
        data-test-id={`label-range-${testId}-from`}
      />
      <span className="text-slate-400">–</span>
      <Input
        value={v.to}
        onChange={(e) => set({ ...v, to: num(e.target.value) })}
        className="h-7 w-12 text-center tabular-nums"
        inputMode="numeric"
        aria-label={`${label} ${t('range_to')}`}
        title={`${label} ${t('range_to')}`}
        data-test-id={`label-range-${testId}-to`}
      />
    </span>
  );

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-white px-2 py-1.5"
      data-test-id="label-range-row"
    >
      <span className="font-medium text-slate-700 text-xs">{t('range_title')}</span>
      {pair(t('range_polka'), polka, setPolka, 'polka')}
      {pair(t('range_qator'), qator, setQator, 'qator')}
      {pair(t('range_yacheyka'), yach, setYach, 'yacheyka')}
      <Button
        size="sm"
        variant="secondary"
        disabled={matched.length === 0}
        onClick={() => onSelect(matched.map((c) => c.id))}
        data-test-id="label-range-apply"
      >
        {t('range_apply', { count: matched.length })}
      </Button>
    </div>
  );
}

/**
 * Bespoke cell picker for this overlay (user 2026-07-05, replaces the shared
 * MultiCombobox here). Layout the user asked for, twice-revised:
 *   - a capped chip box on top that AUTO-SCROLLS to the newest ticked cell;
 *   - a ⌄ chevron trigger under it — clicking it OPENS a dropdown that holds
 *     BOTH a search input AND the full checkbox list of the store's cells;
 *     ticking a box collects it as a chip above. Closing (chevron again or a
 *     click outside) hides the search AND the list together.
 */
function CellMultiSelect({
  cells,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  removeLabel,
}: {
  cells: Array<{ id: string; name: string }>;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  searchPlaceholder: string;
  removeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const chipBoxRef = useRef<HTMLDivElement | null>(null);
  const prevLen = useRef(value.length);

  // Keep the newest ticked chips in view: on every ADD, scroll to the bottom.
  useEffect(() => {
    if (value.length > prevLen.current && chipBoxRef.current) {
      chipBoxRef.current.scrollTop = chipBoxRef.current.scrollHeight;
    }
    prevLen.current = value.length;
  }, [value.length]);

  // Click outside the whole control closes the dropdown (search + list).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const nameById = useMemo(() => new Map(cells.map((c) => [c.id, c.name])), [cells]);
  const q = search.trim().toLowerCase();
  // Open with no search → the FULL cell list (scrollable); typing filters it.
  const filtered = useMemo(
    () => (q ? cells.filter((c) => c.name.toLowerCase().includes(q)) : cells),
    [cells, q],
  );

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  const closeDropdown = () => {
    setOpen(false);
    setSearch('');
  };

  return (
    <div ref={rootRef} className="relative w-[260px]">
      <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-input)] bg-[var(--ms-bg-surface)]">
        {/* Chip box — grows to ~4 rows then scrolls WITH the newest cells. */}
        <div
          ref={chipBoxRef}
          data-test-id="cell-select-chips"
          className="flex max-h-[104px] flex-wrap content-start gap-1 overflow-y-auto p-1"
        >
          {value.length === 0 ? (
            <span className="px-1 py-0.5 text-[11px] text-[var(--ms-text-placeholder)]">
              {placeholder}
            </span>
          ) : (
            value.map((id) => (
              <span
                key={id}
                className="inline-flex max-w-full items-center gap-1 rounded-[var(--ms-radius-sm)] bg-[var(--ms-bg-muted)] py-0.5 pr-1 pl-1.5 text-[11px]"
              >
                <span className="truncate">{nameById.get(id) ?? id}</span>
                <button
                  type="button"
                  aria-label={removeLabel}
                  onClick={() => onChange(value.filter((v) => v !== id))}
                  className="shrink-0 rounded text-[var(--ms-text-muted)] leading-none hover:text-[var(--ms-text-destructive)]"
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>
        {/* Footer bar — ⌄ toggles the search+list dropdown; × clears all. */}
        <div className="flex items-center justify-end gap-1 border-[var(--ms-border-input)] border-t px-1.5 py-1 text-[var(--ms-text-muted)]">
          {value.length > 0 && (
            <button
              type="button"
              aria-label={removeLabel}
              onClick={() => onChange([])}
              className="rounded p-0.5 hover:text-[var(--ms-text-destructive)]"
            >
              <Icons.close className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            aria-expanded={open}
            aria-label={placeholder}
            onClick={() => (open ? closeDropdown() : setOpen(true))}
            data-test-id="cell-select-toggle"
            className="rounded p-0.5 hover:bg-[var(--ms-bg-muted)]"
          >
            <Icons.down className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Dropdown: search input on top + the full checkbox list below. */}
      {open && (
        <div
          data-test-id="cell-select-results"
          className="absolute top-full right-0 left-0 z-[70] mt-1 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] shadow-[var(--ms-shadow-md)]"
        >
          <div className="border-[var(--ms-border-default)] border-b p-1">
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              data-test-id="cell-select-search"
            />
          </div>
          <div className="max-h-[240px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-center text-[11px] text-[var(--ms-text-muted)]">—</p>
            ) : (
              filtered.map((c) => {
                const checked = value.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggle(c.id)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--ms-bg-hover)]"
                  >
                    <span
                      aria-hidden
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[var(--ms-radius-sm)] border ${
                        checked
                          ? 'border-[var(--ms-text-brand)] bg-[var(--ms-text-brand)] text-white'
                          : 'border-[var(--ms-border-strong)]'
                      }`}
                    >
                      {checked && '✓'}
                    </span>
                    <span className="truncate">{c.name}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function CellLabelPrintOverlay({
  cell,
  cells,
  initialRanges,
  onClose,
}: {
  /**
   * The row whose 🖨 opened the overlay — pre-checked. Diapazon bilan
   * ochilganda (yaratishdan keyin) berilmaydi — o'shanda `initialRanges`
   * tanlovni belgilaydi.
   */
  cell?: { id: string; name: string; barcode: string | null };
  /**
   * Diapazon bo'yicha oldindan belgilash — «yaratildi → etiketkalarni chop
   * etish» oqimi uchun. Yacheykalar ro'yxati keyinroq yangilanishi mumkin
   * (yaratishdan so'ng so'rov qayta yuklanadi), shuning uchun moslar
   * `cells` har o'zgarganda QO'SHIB boriladi.
   */
  initialRanges?: Array<SegmentRange | null>;
  /** ALL of the store's cells — the multi-select source (USER 2026-07-05:
   *  print MANY labels in one go by ticking cells, not one 🖨 per cell). */
  cells: Array<{ id: string; name: string; barcode: string | null }>;
  onClose: () => void;
}) {
  const t = useTranslations('pages.stores.cell_label');
  const tCommon = useTranslations('common');
  const [copies, setCopies] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>(cell ? [cell.id] : []);

  // Diapazon bilan ochilgan bo'lsa: moslarni belgilab boramiz. `cells` yangi
  // yaratilganlar bilan to'lgach effekt qayta ishlaydi va ularni ham qo'shadi.
  useEffect(() => {
    if (!initialRanges) return;
    const ids = filterCellsByRange(cells, initialRanges).map((c) => c.id);
    if (ids.length === 0) return;
    setSelectedIds((prev) => {
      const next = [...new Set([...prev, ...ids])];
      return next.length === prev.length ? prev : next;
    });
  }, [cells, initialRanges]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // One permanent location label per TICKED cell: the cell code + a Code 128
  // of its barcode (code as the fallback payload when no barcode is set).
  // Order follows the store's cell table, not tick order.
  const labels = useMemo<LabelData[]>(
    () =>
      cells
        .filter((c) => selectedIds.includes(c.id))
        .map((c) => ({ key: `cell-${c.id}`, cellCode: c.name, qrValue: c.barcode || c.name })),
    [cells, selectedIds],
  );

  const flat = useMemo(
    () => labels.flatMap((l) => Array<LabelData>(copies).fill(l)),
    [labels, copies],
  );

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-qr-print-root=""
      data-test-id="cell-label-overlay"
      // biome-ignore lint/a11y/useSemanticElements: full-screen print-preview takeover (same controlled-open pattern as qr-price-tag-print)
      role="dialog"
      aria-modal="true"
      aria-label={t('title')}
      className="fixed inset-0 z-[60] overflow-auto bg-slate-100"
    >
      <style>{`
        @media print {
          @page { size: ${LABEL_W_MM}mm ${LABEL_H_MM}mm; margin: 0; }
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
          body > *:not([data-qr-print-root]) { display: none !important; }
          [data-qr-print-root] { position: static !important; overflow: visible !important; background: #fff !important; }
          .no-print { display: none !important; }
          /* Screen shows a 4-per-row grid; print MUST be a plain block so
             break-after paginates one label per pre-cut sheet. */
          .cell-label-pages { display: block !important; padding: 0 !important; margin: 0 !important; }
          .cell-label-page {
            margin: 0 !important;
            box-shadow: none !important;
            break-after: page;
            width: 100vw !important;
            height: 100vh !important;
          }
          .cell-label-page:last-child { break-after: auto; }
          .cell-label { width: 100% !important; height: 100% !important; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 border-[var(--ms-border-default)] border-b bg-white px-6 py-3 shadow-sm">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <div className="truncate font-medium text-slate-800">{t('title')}</div>
            <div className="text-slate-500 text-xs">{t('subtitle', { labels: flat.length })}</div>
          </div>
          {/* Owner 2026-07-28: was a single non-wrapping row → on a phone the
              260px picker + copies + Print/Close overflowed OUT of the header bar
              (print button unreachable). Now stacks on mobile + wraps. */}
          <div className="flex flex-wrap items-start gap-2">
            {/* User 2026-07-05: capped chip box that auto-scrolls to the newest
                ticked cell + a dedicated search input beneath it. */}
            <RangeSelectRow
              cells={cells.map((c) => ({ id: c.id, name: c.name }))}
              onSelect={(ids) =>
                // QO'SHADI, almashtirmaydi — bir necha diapazonni ketma-ket
                // belgilash mumkin bo'lsin.
                setSelectedIds((prev) => [...new Set([...prev, ...ids])])
              }
            />
            <CellMultiSelect
              cells={cells.map((c) => ({ id: c.id, name: c.name }))}
              value={selectedIds}
              onChange={setSelectedIds}
              placeholder={t('select_cells')}
              searchPlaceholder={t('search_cell')}
              removeLabel={tCommon('delete')}
            />
            <label className="flex items-center gap-2 pt-1 text-slate-600 text-sm">
              {t('copies')}
              <Input
                type="number"
                min="1"
                max="50"
                value={copies}
                onChange={(e) =>
                  setCopies(Math.min(50, Math.max(1, Math.trunc(Number(e.target.value) || 1))))
                }
                className="w-20 text-right tabular-nums"
                data-test-id="cell-label-copies"
              />
            </label>
            <Button
              className="mt-1"
              onClick={() => window.print()}
              disabled={flat.length === 0}
              data-test-id="cell-label-print"
            >
              {t('print')}
            </Button>
            <Button
              className="mt-1"
              variant="secondary"
              onClick={onClose}
              data-test-id="cell-label-close"
            >
              {tCommon('close')}
            </Button>
          </div>
        </div>
      </div>

      {/* Screen preview: 4 labels per row (user 2026-07-05), centred. */}
      <div
        className="cell-label-pages grid justify-center gap-4 py-6"
        style={{ gridTemplateColumns: 'repeat(4, max-content)' }}
      >
        {flat.map((l, i) => (
          <div
            key={`${l.key}-${i}`}
            className="cell-label-page bg-white shadow-md"
            style={{ width: `${LABEL_W_MM}mm`, height: `${LABEL_H_MM}mm` }}
          >
            <CellLabel label={l} />
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
