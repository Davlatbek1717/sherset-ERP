'use client';

/**
 * /stores/cell-labels — YACHEYKA (javon qatori) labellari (Sherset custom).
 *
 * Har yacheyka uchun javonga yopishtiriladigan label: katta mono «NN-NN-NN-NN»
 * kod + shtrix. Diapazon kiritiladi (har segment from–to) → dekart ko'paytmasi
 * bo'yicha labellari generatsiya qilinadi (masalan sklad 01, polka 1–3,
 * qavat 1–2, yacheyka 1–10 → 60 ta label).
 *
 * Kirish nuqtasi — omborlar ro'yxati (StoresListView) qatoridagi havola;
 * `?sklad=NN` ombor kodidan Sklad segmentini oldindan to'ldiradi,
 * `?store=<nom>` sarlavhada ombor nomini ko'rsatadi.
 *
 * CHOP FORMATI (2026-07-04 user talabi): A4 to'r EMAS — LABEL-QOG'OZ (rulon):
 * har senik ALOHIDA sahifa, @page o'lchami = label o'lchami (default 58×29mm —
 * userning real stiker qog'ozi; formada o'zgartiriladi) → label-printer har
 * stikerga bittadan bosadi.
 *
 * Shtrix-kod (CODE128C) TIRESIZ 8 raqamni kodlaydi («01020304» — har segment
 * 2 xona, shuning uchun segmentlar 0–99 bilan cheklangan): raqam-juftlik
 * kodlash tire aralash matndan ~40% kalta chiziq beradi. Skaner 8 raqam
 * qaytaradi → NN·NN·NN·NN deb parse qilinadi.
 */

import { fetchAgentPrinters, hasNativePrinting, printHtmlNative } from '@/lib/print-agent';
import { Button, Icons, Input } from '@moysklad/ui';
import JsBarcode from 'jsbarcode';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';

const MAX_LABELS = 500;
const MM_PX = 3.7795; // CSS px per mm (96dpi)

/** Label-qog'oz o'lchami (mm) — userning real stikeri 58×29mm (2026-07-04j). */
const DEFAULT_LABEL_W = 58;
const DEFAULT_LABEL_H = 29;
const SIZE_MIN = 20;
const SIZE_MAX = 210;

const pad2 = (n: number) => String(n).padStart(2, '0');

interface Range {
  from: string;
  to: string;
}
const emptyRange = (): Range => ({ from: '', to: '' });

/** '' from ⇒ segment 0 (unset); '' to ⇒ to=from. Invalid ⇒ null (error).
 * 0–99 chegarasi label formati «NN-NN-NN-NN» + 8-raqamli CODE128C shtrix
 * kodlashning sharti (har segment aynan 2 xona). */
function expand(r: Range): number[] | null {
  const from = r.from.trim() === '' ? 0 : Number(r.from);
  const to = r.to.trim() === '' ? from : Number(r.to);
  if (!Number.isInteger(from) || !Number.isInteger(to)) return null;
  if (from < 0 || to > 99 || to < from) return null;
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

function parseSizeMm(s: string, fallback: number): number | null {
  if (s.trim() === '') return fallback;
  const n = Number(s);
  if (!Number.isFinite(n) || n < SIZE_MIN || n > SIZE_MAX) return null;
  return n;
}

export default function CellLabelsPage() {
  return (
    <Suspense>
      <CellLabelsContent />
    </Suspense>
  );
}

function CellLabelsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const storeName = searchParams.get('store');
  const [sklad, setSklad] = useState<Range>(() => {
    // Ombor qatoridan kelganda sklad segmenti ombor kodi bilan to'ldiriladi
    const p = searchParams.get('sklad');
    if (p && /^\d{1,2}$/.test(p.trim())) {
      const v = pad2(Number(p.trim()));
      return { from: v, to: v };
    }
    return emptyRange();
  });
  const [polka, setPolka] = useState<Range>(emptyRange());
  const [qavat, setQavat] = useState<Range>(emptyRange());
  const [yacheyka, setYacheyka] = useState<Range>(emptyRange());
  const [labelW, setLabelW] = useState('');
  const [labelH, setLabelH] = useState('');
  const [rendered, setRendered] = useState<{ codes: string[]; w: number; h: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const codes = useMemo(() => {
    const s = expand(sklad);
    const p = expand(polka);
    const q = expand(qavat);
    const y = expand(yacheyka);
    if (!s || !p || !q || !y) return null; // invalid input
    const total = s.length * p.length * q.length * y.length;
    if (total > MAX_LABELS) return { total, list: [] as string[] };
    const list: string[] = [];
    for (const a of s)
      for (const b of p)
        for (const c of q) for (const d of y) list.push([a, b, c, d].map(pad2).join('-'));
    return { total, list };
  }, [sklad, polka, qavat, yacheyka]);

  const handlePreview = () => {
    if (!codes) {
      setError("Diapazon noto'g'ri — butun son, dan ≤ gacha (0–99)");
      return;
    }
    if (codes.total === 0) {
      setError('Kamida 1 ta yacheyka kerak');
      return;
    }
    if (codes.total > MAX_LABELS) {
      setError(`Juda ko'p: ${codes.total} ta (maksimum ${MAX_LABELS}). Diapazonni toraytiring.`);
      return;
    }
    const w = parseSizeMm(labelW, DEFAULT_LABEL_W);
    const h = parseSizeMm(labelH, DEFAULT_LABEL_H);
    if (w == null || h == null) {
      setError(`Label o'lchami noto'g'ri — ${SIZE_MIN}–${SIZE_MAX} mm oralig'ida bo'lsin`);
      return;
    }
    setError(null);
    setRendered({ codes: codes.list, w, h });
  };

  if (rendered) {
    return (
      <RenderedCells
        codes={rendered.codes}
        w={rendered.w}
        h={rendered.h}
        onBack={() => setRendered(null)}
      />
    );
  }

  const segments: Array<[string, Range, (r: Range) => void]> = [
    ['Sklad', sklad, setSklad],
    ['Polka', polka, setPolka],
    ['Qavat', qavat, setQavat],
    ['Yacheyka', yacheyka, setYacheyka],
  ];
  const previewTotal = codes && codes.total <= MAX_LABELS ? codes.total : (codes?.total ?? 0);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6" data-test-id="cell-labels-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-[var(--ms-text-primary)] text-xl">
            Yacheyka labellari
          </h1>
          {storeName && (
            <p
              className="mt-1 font-medium text-[var(--ms-text-primary)] text-sm"
              data-test-id="cell-labels-store"
            >
              Ombor: {storeName}
            </p>
          )}
          <p className="mt-1 text-[var(--ms-text-muted)] text-sm">
            Javonga yopishtiriladigan kod+shtrix labellar — har biri alohida label-qog'ozga chiqadi.
            Har segment uchun diapazon kiriting (bo'sh «gacha» = «dan» bilan teng; bo'sh «dan» =
            00).
          </p>
        </div>
        <Button variant="ghost" onClick={() => router.back()}>
          ← Orqaga
        </Button>
      </div>

      {error && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700 text-sm"
          data-test-id="cell-labels-error"
        >
          {error}
        </div>
      )}

      <div className="space-y-4 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
        <div className="grid grid-cols-[90px_1fr_1fr] items-center gap-2 text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
          <div />
          <div>dan</div>
          <div>gacha</div>
        </div>
        {segments.map(([label, r, set]) => (
          <div key={label} className="grid grid-cols-[90px_1fr_1fr] items-center gap-2">
            <label
              htmlFor={`cell-${label}-from`}
              className="font-medium text-[var(--ms-text-primary)] text-sm"
            >
              {label}
            </label>
            <Input
              id={`cell-${label}-from`}
              inputMode="numeric"
              placeholder="00"
              value={r.from}
              onChange={(e) => set({ ...r, from: e.target.value })}
              className="text-center tabular-nums"
              data-test-id={`cell-${label.toLowerCase()}-from`}
            />
            <Input
              inputMode="numeric"
              placeholder="—"
              value={r.to}
              onChange={(e) => set({ ...r, to: e.target.value })}
              className="text-center tabular-nums"
              data-test-id={`cell-${label.toLowerCase()}-to`}
            />
          </div>
        ))}

        <div className="grid grid-cols-[90px_1fr_1fr] items-center gap-2 border-[var(--ms-border-default)] border-t pt-3">
          <label
            htmlFor="cell-label-w"
            className="font-medium text-[var(--ms-text-primary)] text-sm"
          >
            Qog'oz (mm)
          </label>
          <Input
            id="cell-label-w"
            inputMode="numeric"
            placeholder={`eni ${DEFAULT_LABEL_W}`}
            value={labelW}
            onChange={(e) => setLabelW(e.target.value)}
            className="text-center tabular-nums"
            data-test-id="cell-label-width"
          />
          <Input
            inputMode="numeric"
            placeholder={`bo'yi ${DEFAULT_LABEL_H}`}
            value={labelH}
            onChange={(e) => setLabelH(e.target.value)}
            className="text-center tabular-nums"
            data-test-id="cell-label-height"
          />
        </div>

        <div className="flex items-center justify-between border-[var(--ms-border-default)] border-t pt-3">
          <span className="text-[var(--ms-text-muted)] text-sm" data-test-id="cell-labels-count">
            {codes == null
              ? '—'
              : codes.total > MAX_LABELS
                ? `${codes.total} ta — juda ko'p (max ${MAX_LABELS})`
                : `${previewTotal} ta label`}
          </span>
          <Button
            variant="primary"
            onClick={handlePreview}
            disabled={!codes || codes.total === 0 || codes.total > MAX_LABELS}
            data-test-id="cell-labels-preview"
          >
            <Icons.print className="h-4 w-4" />
            Ko'rish / chop etish
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Rendered labels (har senik = alohida label-qog'oz sahifasi) ───────────────

function RenderedCells({
  codes,
  w,
  h,
  onBack,
}: {
  codes: string[];
  w: number;
  h: number;
  onBack: () => void;
}) {
  // Electron (.exe) qobiqda — dialogsiz, tanlangan label-printerga to'g'ridan-
  // to'g'ri bosish. Brauzerda avvalgidek window.print() qoladi. Printer
  // tanlovi shu kompyuterda eslab qolinadi (printerlar per-PC bo'ladi).
  const LS_PRINTER = 'sherset.labelPrinterName';
  const native = hasNativePrinting();
  const [printers, setPrinters] = useState<string[]>([]);
  const [printer, setPrinter] = useState('');
  const [printState, setPrintState] = useState<'idle' | 'busy' | 'ok' | 'err'>('idle');
  const [printErr, setPrintErr] = useState('');

  useEffect(() => {
    if (!native) return;
    fetchAgentPrinters().then((list) => {
      setPrinters(list);
      const saved = localStorage.getItem(LS_PRINTER);
      if (saved && list.includes(saved)) setPrinter(saved);
      else if (list.length === 1) setPrinter(list[0] ?? '');
    });
  }, [native]);

  /** Preview'dagi shtrix-svg'larni yig'ib, offscreen oynaga (Tailwind'siz)
   * inline-uslubli mustaqil HTML quradi — @page = label o'lchami. */
  const buildNativeHtml = (): string => {
    const svgs = Array.from(document.querySelectorAll('[data-test-id="cell-label-barcode"]'));
    const codeFontPx = Math.min(24, Math.round((w * MM_PX * 0.82) / 11 / 0.62));
    const labels = codes
      .map((code, i) => {
        const svg = (svgs[i]?.outerHTML ?? '').replace(
          '<svg ',
          `<svg style="max-width:${w - 4}mm;max-height:${(h * 0.45).toFixed(1)}mm" `,
        );
        return `<div class="lp"><div class="hd"><div class="t">YACHEYKA</div><div class="c" style="font-size:${codeFontPx}px">${code}</div></div>${svg}</div>`;
      })
      .join('');
    return `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:${w}mm ${h}mm;margin:0}
html,body{margin:0;padding:0}
.lp{width:${w}mm;height:${h}mm;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:space-between;overflow:hidden;padding:1.5mm 2mm;page-break-after:always}
.lp:last-child{page-break-after:auto}
.hd{text-align:center}
.t{font-size:8px;color:#94a3b8;letter-spacing:2px}
.c{font-family:ui-monospace,Consolas,monospace;font-weight:700;line-height:1.15;letter-spacing:1px}
</style></head><body>${labels}</body></html>`;
  };

  const handlePrint = async () => {
    if (!native || !printer) {
      window.print();
      return;
    }
    setPrintState('busy');
    const res = await printHtmlNative(printer, buildNativeHtml());
    if (res.ok) {
      setPrintState('ok');
      setTimeout(() => setPrintState('idle'), 3000);
    } else {
      setPrintState('err');
      setPrintErr(res.error ?? "noma'lum xato");
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <style>{`
        @media print {
          @page { size: ${w}mm ${h}mm; margin: 0; }
          html, body { background: white; margin: 0; padding: 0; }
          .no-print { display: none !important; }
          .label-page { page-break-after: always; margin: 0 !important; box-shadow: none !important; }
          .label-page:last-child { page-break-after: auto; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 border-slate-200 border-b bg-white px-6 py-3 shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <div className="font-medium text-slate-800">Yacheyka labellari</div>
            <div className="text-slate-500 text-xs">
              {codes.length} ta · {w}×{h} mm label-qog'oz · har biri alohida sahifa
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onBack}>
              ← Orqaga
            </Button>
            {native && printers.length > 0 ? (
              <select
                value={printer}
                onChange={(e) => {
                  setPrinter(e.target.value);
                  localStorage.setItem(LS_PRINTER, e.target.value);
                }}
                aria-label="Label printer"
                className="h-9 max-w-[220px] rounded-md border border-slate-300 bg-white px-2 text-slate-700 text-sm"
              >
                <option value="">Printer tanlang…</option>
                {printers.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            ) : null}
            <Button
              variant="primary"
              onClick={handlePrint}
              disabled={printState === 'busy'}
              data-test-id="cell-labels-print"
            >
              <Icons.print className="h-4 w-4" />
              {printState === 'busy'
                ? 'Yuborilmoqda…'
                : native && printer
                  ? 'Chop etish (avtomatik)'
                  : 'Chop etish'}
            </Button>
          </div>
        </div>
        {printState === 'ok' ? (
          <div className="mx-auto max-w-5xl pt-1 text-emerald-600 text-xs">
            ✓ Printerga yuborildi
          </div>
        ) : null}
        {printState === 'err' ? (
          <div className="mx-auto max-w-5xl pt-1 text-red-600 text-xs">
            Xato: {printErr} — printer tanlovini «Printer tanlang…» ga qaytarib, brauzer-dialog
            bilan urinib ko'ring
          </div>
        ) : null}
      </div>

      <div className="flex flex-col items-center gap-4 py-6 print:block print:gap-0 print:py-0">
        {codes.map((code) => (
          <CellLabel key={code} code={code} w={w} h={h} />
        ))}
      </div>
    </div>
  );
}

function CellLabel({ code, w, h }: { code: string; w: number; h: number }) {
  const barcodeRef = useRef<SVGSVGElement>(null);

  // Yacheyka doimiy, ichidagi tovar almashadi — label YACHEYKANI
  // identifikatsiya qiladi. Bitta CODE128C shtrix yetadi: tiresiz 8 raqam
  // («01020304») — raqam-juftlik kodlash tire aralash matndan ancha kalta.
  // Skaner 8 raqam qaytaradi → NN·NN·NN·NN deb parse qilinadi.
  useEffect(() => {
    if (!barcodeRef.current) return;
    JsBarcode(barcodeRef.current, code.replace(/-/g, ''), {
      format: 'CODE128C',
      displayValue: false,
      margin: 0,
      height: Math.max(24, Math.round(h * MM_PX * 0.34)),
      width: 2,
    });
  }, [code, h]);

  // Kod shrifti label eniga moslashadi: «NN-NN-NN-NN» = 11 belgi mono
  // (belgi eni ≈ 0.62em), label enining ~82% ini egallasin.
  const codeFontPx = Math.min(24, Math.round((w * MM_PX * 0.82) / 11 / 0.62));

  return (
    <div
      className="label-page flex flex-col items-center justify-between overflow-hidden bg-white px-2 py-1.5 shadow-sm"
      // mm birligi to'g'ridan-to'g'ri — px orqali aylantirish print-rendering'da
      // og'ish/bo'sh-sahifa berishi mumkin; mm esa @page bilan aynan mos tushadi.
      style={{ width: `${w}mm`, height: `${h}mm` }}
    >
      <div className="flex min-h-0 flex-col items-center">
        <div className="text-[8px] text-slate-400 uppercase tracking-widest">Yacheyka</div>
        <div
          className="font-bold font-mono text-slate-900 tabular-nums tracking-wider"
          style={{ fontSize: `${codeFontPx}px`, lineHeight: 1.15 }}
          data-test-id="cell-label-code"
        >
          {code}
        </div>
      </div>
      <svg
        ref={barcodeRef}
        className="max-w-full"
        data-test-id="cell-label-barcode"
        aria-hidden="true"
      />
    </div>
  );
}
