'use client';

/**
 * G3 — VOZVRAT YORLIG'I (egasi, 2026-08-23: «tovarga yorliq yopishtirilmaydi
 * — shtrix yacheykada; FAQAT vozvrat tovarlariga yorliq bosiladi, topish
 * oson bo'lishi uchun»).
 *
 * Yorliq mazmuni: tovar SHTRIXI (skaner uchun) + YACHEYKA KODI (qayerga
 * qo'yilishi) + tovar nomi va soni. Ya'ni bu yerda ikkala identifikator ham
 * bor — yacheyka yorlig'idan (`cell-label-print`, faqat joy) va tovar
 * yorlig'idan (`labels/print`, faqat tovar) farqi shunda.
 *
 * ── Nega `POST /labels/render` ISHLATILMADI (reja 2-vazifasi ustidan) ──────
 * O'sha endpoint tovar × nusxa sonini template geometriyasi bilan qaytaradi
 * va javobida YACHEYKA tushunchasi umuman YO'Q (`label.service.ts` faqat
 * `id/name/code/article/barcodes/salePrices` o'qiydi). Vozvrat yorlig'ining
 * butun ma'nosi esa aynan «shu tovar SHU yacheykada» juftligi. Uni o'sha
 * endpointga tiqish uchun `RenderLabelsSchema.items[]` ga yacheyka maydoni,
 * `render()` ga yangi yo'l va `itemsSnapshot` ga yangi shakl kerak bo'lardi —
 * bitta chaqiruvchisi bor endpoint uchun katta o'zgarish. Buning o'rniga
 * repodagi MAVJUD naqsh olindi: yacheyka yorlig'i ham, narx yorlig'i ham
 * mijoz tomonda SVG bilan chiziladi va `window.print()` ga beriladi
 * (`cell-label-print.tsx`, `qr-price-tag-print.tsx`). Qabul javobi kerakli
 * hamma narsani (shtrix + yacheyka kodi) allaqachon olib keladi ⇒ qo'shimcha
 * so'rov ham kerak emas.
 *
 * Chop etish izolyatsiyasi — o'sha isbotlangan portal naqshi (ilova ichida
 * chop etilsa layout ham chiqib ketardi).
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

export interface ReturnLabelItem {
  key: string;
  productName: string;
  /** Tovar shtrixi (yoki kodi) — skaner o'qiydigan qiymat. */
  barcode: string | null;
  /** Yacheyka kodi — «07-01-01-01». */
  cellName: string;
  quantity: string;
  brak: boolean;
}

/** Linear Code 128 — `cell-label-print` bilan bir xil chizish (10 modul quiet zone). */
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
      data-test-id="return-label-barcode"
    >
      {rects.map((r) => (
        <rect key={r.x} x={r.x} y={0} width={r.w} height={heightPx} fill="#000" />
      ))}
    </svg>
  );
}

/** Yacheyka kodi — enni to'liq egallaydigan avto-o'lchamli matn (yacheyka yorlig'i naqshi). */
function CellCodeSvg({ value }: { value: string }) {
  const vbH = 100;
  const vbW = Math.max(1, value.length) * 48;
  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      preserveAspectRatio="xMidYMin meet"
      style={{ width: '100%', height: '100%', display: 'block' }}
      role="img"
      aria-label={value}
      data-test-id="return-label-cell"
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

function ReturnLabel({ item, brakText }: { item: ReturnLabelItem; brakText: string }) {
  // Shtrixsiz tovar (yoki Code128'ga sig'maydigan qiymat) — yorliq baribir
  // chiqadi, faqat shtrix chizig'isiz: yacheyka kodi va nomi topish uchun yetadi
  // (yacheyka yorlig'idagi bilan bir xil qaror, egasi 2026-07-05: QR yo'q).
  const barcodeEncodable = item.barcode ? code128Widths(item.barcode) !== null : false;
  return (
    <div
      className="return-label"
      data-test-id="return-label"
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
        <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
          ×{item.quantity}
        </span>
      </div>

      {item.brak && (
        <div
          data-test-id="return-label-brak"
          style={{
            alignSelf: 'flex-start',
            border: '0.4mm solid #111',
            borderRadius: '1mm',
            padding: '0 1mm',
            fontSize: '2.6mm',
            fontWeight: 800,
            letterSpacing: '0.3mm',
          }}
        >
          {brakText}
        </div>
      )}

      {/* Yacheyka kodi — eng katta element: yorliqning vazifasi «qayerda turadi». */}
      <div style={{ height: '11mm', minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <CellCodeSvg value={item.cellName} />
      </div>

      {barcodeEncodable && item.barcode ? (
        <Code128Svg value={item.barcode} heightPx={44} />
      ) : (
        <div style={{ height: '44px' }} />
      )}
    </div>
  );
}

/**
 * Qabul qilingan pozitsiyalar uchun yorliq oynasi. `items` — qabul javobidan
 * kelgan tayyor ro'yxat (qo'shimcha so'rov yo'q).
 */
export function ReturnLabelPrintOverlay({
  items,
  onClose,
}: {
  items: ReturnLabelItem[];
  onClose: () => void;
}) {
  const t = useTranslations('pages.omborchi_vozvrat');

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-qr-print-root=""
      data-test-id="return-label-overlay"
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
          .return-label-pages { display: block !important; padding: 0 !important; margin: 0 !important; }
          .return-label-page {
            margin: 0 !important;
            box-shadow: none !important;
            break-after: page;
            width: 100vw !important;
            height: 100vh !important;
          }
          .return-label-page:last-child { break-after: auto; }
          .return-label { width: 100% !important; height: 100% !important; }
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
              data-test-id="return-label-print"
            >
              {t('label_print')}
            </Button>
            <Button
              className="min-h-[44px]"
              variant="secondary"
              onClick={onClose}
              data-test-id="return-label-close"
            >
              {t('label_close')}
            </Button>
          </div>
        </div>
      </div>

      <div
        className="return-label-pages grid justify-center gap-4 py-6"
        style={{ gridTemplateColumns: 'repeat(4, max-content)' }}
      >
        {items.map((item) => (
          <div
            key={item.key}
            className="return-label-page bg-white shadow-md"
            style={{ width: `${LABEL_W_MM}mm`, height: `${LABEL_H_MM}mm` }}
          >
            <ReturnLabel item={item} brakText={t('brak')} />
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
