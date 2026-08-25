'use client';

/**
 * K2 — BO'LAK YORLIG'I (K-reja 5-bo'lim, «Yorliq qoidasi»).
 *
 * Egasining qoidasi: butun rulonlarda yorliq YO'Q (ular almashtiriladigan),
 * bo'laklarda BOR va u UNIKAL (K-Q3). Yorliqda ikki narsa bo'lishi shart:
 *   1. **unikal shtrix-kod** (`BLK-000041`) — omborchi skanerlaydi;
 *   2. **UZUNLIK matni** — eng katta element. Sabab egasining so'zi bilan:
 *      omborchi skanersiz ham ko'radi, kassir «200 m likni oling» deganda
 *      mijoz bo'lakni o'zi topadi.
 *
 * 🔴 Kesimdan keyin yorliq QAYTA bosiladi (reja 5-bo'lim): eski uzunlik
 * yozilgan yorliq eng xavfli narsa — odam tizimga emas, yorliqqa ishonadi.
 * Shuning uchun bu oyna ekrandagi HAR bo'lakdan chaqirila oladi, faqat
 * yangi yaratilganlardan emas.
 *
 * ── Nega `POST /labels/render` ISHLATILMADI ────────────────────────────────
 * G3 vozvrat yorlig'idagi bilan AYNI sabab (`return-label-print.tsx`): o'sha
 * endpoint TOVAR × nusxa sonini template geometriyasi bilan qaytaradi va
 * javobida na yacheyka, na bo'lak tushunchasi bor (`label.service.ts` faqat
 * `id/name/code/article/barcodes/salePrices` o'qiydi). Bo'lak yorlig'ining
 * butun ma'nosi esa aynan BLK-kod + uzunlik juftligi. Repodagi mavjud naqsh
 * olindi: yorliq mijoz tomonda SVG bilan chiziladi va `window.print()` ga
 * beriladi (`cell-label-print.tsx`, `qr-price-tag-print.tsx`,
 * `return-label-print.tsx`).
 *
 * Chop etish izolyatsiyasi — o'sha isbotlangan portal naqshi.
 */

import { TAG_FONT } from '@/components/assortment/qr-price-tag-print';
import { code128Widths } from '@/lib/vendor/code128';
import { Button } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { createPortal } from 'react-dom';

const LABEL_W_MM = 58;
const LABEL_H_MM = 40;
const PAD_MM = 1.4;

export interface PieceLabelItem {
  key: string;
  /** `BLK-000041` — skaner o'qiydigan UNIKAL qiymat. */
  label: string;
  /** Uzunlik matni, birligi bilan («200 m»). */
  lengthText: string;
  productName: string;
  /** Yacheyka kodi yoki `null` (yacheykasiz hovuz). */
  cellName: string | null;
}

/** Linear Code 128 — vozvrat/yacheyka yorlig'i bilan bir xil chizish. */
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
      data-test-id="piece-label-barcode"
    >
      {rects.map((r) => (
        <rect key={r.x} x={r.x} y={0} width={r.w} height={heightPx} fill="#000" />
      ))}
    </svg>
  );
}

/** Uzunlik — enni to'liq egallaydigan avto-o'lchamli matn (yacheyka kodi naqshi). */
function LengthSvg({ value }: { value: string }) {
  const vbH = 100;
  const vbW = Math.max(1, value.length) * 48;
  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      preserveAspectRatio="xMidYMin meet"
      style={{ width: '100%', height: '100%', display: 'block' }}
      role="img"
      aria-label={value}
      data-test-id="piece-label-length"
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

function PieceLabel({ item, noCellText }: { item: PieceLabelItem; noCellText: string }) {
  // Yorliq shtrixsiz CHIQMAYDI: bo'lakning butun ma'nosi unikal kodda
  // (K-reja 7.3). `BLK-000041` — ASCII, Code128 uni har doim kodlaydi;
  // kodlab bo'lmasa yorliq yaroqsiz, shuning uchun matn sifatida chiqadi.
  const encodable = code128Widths(item.label) !== null;
  return (
    <div
      className="piece-label"
      data-test-id="piece-label"
      style={{
        width: `${LABEL_W_MM}mm`,
        height: `${LABEL_H_MM}mm`,
        padding: `${PAD_MM}mm`,
        background: '#fff',
        color: '#111',
        fontFamily: TAG_FONT,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6mm',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1mm',
          fontSize: '2.6mm',
          fontWeight: 600,
          lineHeight: 1.1,
          maxHeight: '5.6mm',
          overflow: 'hidden',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.productName}
        </span>
        <span
          data-test-id="piece-label-cell"
          style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
        >
          {item.cellName ?? noCellText}
        </span>
      </div>

      {/* Uzunlik — eng katta element: yorliqning vazifasi «bu bo'lak necha metr». */}
      <div style={{ height: '13mm', minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <LengthSvg value={item.lengthText} />
      </div>

      {encodable ? (
        <Code128Svg value={item.label} heightPx={38} />
      ) : (
        <div style={{ height: '38px' }} />
      )}

      <div
        data-test-id="piece-label-code"
        style={{
          textAlign: 'center',
          fontSize: '2.8mm',
          fontWeight: 700,
          letterSpacing: '0.3mm',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {item.label}
      </div>
    </div>
  );
}

/** Tanlangan bo'laklar uchun yorliq oynasi (yangi kiritilgan yoki QAYTA bosish). */
export function PieceLabelPrintOverlay({
  items,
  onClose,
}: {
  items: PieceLabelItem[];
  onClose: () => void;
}) {
  const t = useTranslations('pages.omborchi_bolaklar');

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-qr-print-root=""
      data-test-id="piece-label-overlay"
      // biome-ignore lint/a11y/useSemanticElements: full-screen print-preview takeover (cell-label-print naqshi)
      role="dialog"
      aria-modal="true"
      aria-label={t('label_title')}
      className="fixed inset-0 z-[60] overflow-auto bg-slate-100"
    >
      <style>{`
        @media print {
          @page { size: ${LABEL_W_MM}mm ${LABEL_H_MM}mm; margin: 0; }
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
          body > *:not([data-qr-print-root]) { display: none !important; }
          [data-qr-print-root] { position: static !important; overflow: visible !important; background: #fff !important; }
          .no-print { display: none !important; }
          .piece-label-pages { display: block !important; padding: 0 !important; margin: 0 !important; }
          .piece-label-page {
            margin: 0 !important;
            box-shadow: none !important;
            break-after: page;
            width: 100vw !important;
            height: 100vh !important;
          }
          .piece-label-page:last-child { break-after: auto; }
          .piece-label { width: 100% !important; height: 100% !important; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 border-[var(--ms-border-default)] border-b bg-white px-6 py-3 shadow-sm">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="truncate font-medium text-slate-800">{t('label_title')}</div>
            <div className="text-slate-500 text-xs">
              {t('label_subtitle', { count: items.length })}
            </div>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <Button
              className="min-h-[44px]"
              onClick={() => window.print()}
              disabled={items.length === 0}
              data-test-id="piece-label-print"
            >
              {t('label_print')}
            </Button>
            <Button
              className="min-h-[44px]"
              variant="secondary"
              onClick={onClose}
              data-test-id="piece-label-close"
            >
              {t('label_close')}
            </Button>
          </div>
        </div>
      </div>

      <div
        className="piece-label-pages grid justify-center gap-4 py-6"
        style={{ gridTemplateColumns: 'repeat(4, max-content)' }}
      >
        {items.map((item) => (
          <div
            key={item.key}
            className="piece-label-page bg-white shadow-md"
            style={{ width: `${LABEL_W_MM}mm`, height: `${LABEL_H_MM}mm` }}
          >
            <PieceLabel item={item} noCellText={t('no_cell')} />
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
