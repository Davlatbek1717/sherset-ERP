'use client';

/**
 * /labels/cells — YACHEYKA (javon qatori) labellari (Sherset custom).
 *
 * Har yacheyka uchun javonga yopishtiriladigan label: katta mono «NN-NN-NN-NN»
 * kod + QR. Diapazon kiritiladi (har segment from–to) → dekart ko'paytmasi
 * bo'yicha labellari generatsiya qilinadi (masalan sklad 01, polka 1–3,
 * qavat 1–2, yacheyka 1–10 → 60 ta label).
 *
 * QR PLAIN bin-kod matnini kodlaydi (URL emas) — istalgan skaner o'qiy oladi
 * va kelajakdagi yacheyka-scan oqimlari shu matnni parse qiladi. Chop formati
 * /labels/print bilan BIR XIL A4 2×5 (87.5×50mm) — bitta yorliq-qog'oz zaxirasi.
 */

import { Button, Icons, Input } from '@moysklad/ui';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const TPL = {
  pageWidthMm: 210,
  pageHeightMm: 297,
  cols: 2,
  rows: 5,
  marginLeftMm: 12.5,
  marginTopMm: 17.4,
  columnGapMm: 5,
  rowGapMm: 2.4,
  labelWidthMm: 87.5,
  labelHeightMm: 50,
} as const;

const MAX_LABELS = 500;

const pad2 = (n: number) => String(n).padStart(2, '0');

interface Range {
  from: string;
  to: string;
}
const emptyRange = (): Range => ({ from: '', to: '' });

/** '' from ⇒ segment 0 (unset); '' to ⇒ to=from. Invalid ⇒ null (error). */
function expand(r: Range): number[] | null {
  const from = r.from.trim() === '' ? 0 : Number(r.from);
  const to = r.to.trim() === '' ? from : Number(r.to);
  if (!Number.isInteger(from) || !Number.isInteger(to)) return null;
  if (from < 0 || to > 99999 || to < from) return null;
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

export default function CellLabelsPage() {
  const router = useRouter();
  const [sklad, setSklad] = useState<Range>(emptyRange());
  const [polka, setPolka] = useState<Range>(emptyRange());
  const [qavat, setQavat] = useState<Range>(emptyRange());
  const [yacheyka, setYacheyka] = useState<Range>(emptyRange());
  const [rendered, setRendered] = useState<string[] | null>(null);
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
      for (const b of p) for (const c of q) for (const d of y) list.push([a, b, c, d].map(pad2).join('-'));
    return { total, list };
  }, [sklad, polka, qavat, yacheyka]);

  const handlePreview = () => {
    if (!codes) {
      setError("Diapazon noto'g'ri — butun son, from ≤ to (0–99999)");
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
    setError(null);
    setRendered(codes.list);
  };

  if (rendered) {
    return <RenderedCells codes={rendered} onBack={() => setRendered(null)} />;
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
          <h1 className="font-semibold text-[var(--ms-text-primary)] text-xl">Yacheyka labellari</h1>
          <p className="mt-1 text-[var(--ms-text-muted)] text-sm">
            Javon qatoriga yopishtiriladigan kod+QR labellar. Har segment uchun diapazon kiriting
            (bo'sh «gacha» = «dan» bilan teng; bo'sh «dan» = 00).
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

        <div className="flex items-center justify-between border-[var(--ms-border-default)] border-t pt-3">
          <span className="text-[var(--ms-text-muted)] text-sm" data-test-id="cell-labels-count">
            {codes == null
              ? '—'
              : codes.total > MAX_LABELS
                ? `${codes.total} ta — juda ko'p (max ${MAX_LABELS})`
                : `${previewTotal} ta label · ${Math.ceil(previewTotal / (TPL.cols * TPL.rows))} sahifa A4`}
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

// ── Rendered sheet (A4 2×5 — /labels/print bilan bir xil format) ─────────────

function RenderedCells({ codes, onBack }: { codes: string[]; onBack: () => void }) {
  const mmPx = 3.7795;
  const perPage = TPL.cols * TPL.rows;
  const pages: string[][] = [];
  for (let i = 0; i < codes.length; i += perPage) pages.push(codes.slice(i, i + perPage));

  return (
    <div className="min-h-screen bg-slate-100">
      <style>{`
        @media print {
          @page { size: ${TPL.pageWidthMm}mm ${TPL.pageHeightMm}mm; margin: 0; }
          html, body { background: white; margin: 0; padding: 0; }
          .no-print { display: none !important; }
          .print-page { page-break-after: always; margin: 0 !important; box-shadow: none !important; border: none !important; }
          .print-page:last-child { page-break-after: auto; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 border-slate-200 border-b bg-white px-6 py-3 shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <div className="font-medium text-slate-800">Yacheyka labellari</div>
            <div className="text-slate-500 text-xs">
              {codes.length} ta · {pages.length} sahifa · A4 · {TPL.cols}×{TPL.rows}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onBack}>
              ← Orqaga
            </Button>
            <Button variant="primary" onClick={() => window.print()} data-test-id="cell-labels-print">
              <Icons.print className="h-4 w-4" />
              Chop etish
            </Button>
          </div>
        </div>
      </div>

      <div className="py-6">
        {pages.map((pageCodes, pageIdx) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: print pages are positional
            key={pageIdx}
            className="print-page relative mx-auto mb-6 bg-white shadow-sm"
            style={{
              width: `${TPL.pageWidthMm * mmPx}px`,
              height: `${TPL.pageHeightMm * mmPx}px`,
            }}
          >
            {pageCodes.map((code, idx) => {
              const ri = Math.floor(idx / TPL.cols);
              const ci = idx % TPL.cols;
              const x = TPL.marginLeftMm + ci * (TPL.labelWidthMm + TPL.columnGapMm);
              const y = TPL.marginTopMm + ri * (TPL.labelHeightMm + TPL.rowGapMm);
              return <CellLabel key={code} code={code} x={x} y={y} mmPx={mmPx} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function CellLabel({ code, x, y, mmPx }: { code: string; x: number; y: number; mmPx: number }) {
  const widthPx = TPL.labelWidthMm * mmPx;
  const heightPx = TPL.labelHeightMm * mmPx;
  const qrSize = Math.round(heightPx * 0.72);

  return (
    <div
      className="absolute flex items-center gap-3 overflow-hidden border border-slate-200 px-3"
      style={{ left: `${x * mmPx}px`, top: `${y * mmPx}px`, width: widthPx, height: heightPx }}
    >
      {/* QR plain bin-kod matnini kodlaydi — istalgan skaner o'qiydi */}
      <QRCodeSVG value={code} size={qrSize} level="M" marginSize={0} />
      <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
        <div className="text-[10px] text-slate-400 uppercase tracking-widest">Yacheyka</div>
        <div
          className="font-bold font-mono text-[22px] text-slate-900 tabular-nums tracking-widest"
          data-test-id="cell-label-code"
        >
          {code}
        </div>
      </div>
    </div>
  );
}
