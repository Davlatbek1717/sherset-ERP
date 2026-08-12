'use client';

/**
 * Price-tag print flow — Товары list «Печать ▾ → Ценник / Термоэтикетка».
 *
 * USER-DIRECTED feature (2026-07-03), intentionally diverges from moysklad.
 * The printed tag carries a real scannable Code 128 BARCODE plus the product
 * name / default sale price / code, in a custom monochrome design. QR was
 * removed entirely (user rule 2026-07-05: «QR umuman bo'lmasin, faqat
 * shtrix-kod») — the barcode encodes the RAW token (barcode → code → id)
 * that hardware scanners and the /scan camera resolve through search.
 *
 * Design contract (user brief v2 2026-07-03, barcode revision 2026-07-05):
 *   - name    = big + the HEAVIEST voice (weight 800 → Segoe UI Black on Win)
 *   - code    = middle band left, very big and bold (the shop uses ordinal
 *               find-codes 01, 02, 11…; sheet is SORTED by code)
 *   - price   = middle band right, large but lighter (weight 600)
 *   - barcode = full-width Code 128 strip across the bottom
 * The tag sets its own font stack because the app-wide --ms-font-sans
 * (Helvetica/Arial) has no real 600/800 cuts on Windows — Segoe UI does,
 * so the name/price weight contrast survives in print.
 *
 * Two paper formats (same design, scaled), BOTH one tag per page — the shop
 * prints on pre-cut tag stock («bir boshga bir o'lim», user 2026-07-04):
 *   - tsennik: 70×49.5 mm page = one tag;
 *   - thermal: 58×40 mm page = one label (thermal-roll printers).
 *
 * Printing: the overlay portals directly under <body>; @media print hides
 * every other body child (display:none — no blank-page artifacts) and lets
 * `@page { size }` drive the paper dimensions.
 */

import { api } from '@/lib/api-client';
import { encodeCode128B } from '@/lib/barcode128';
import { RETAIL_SENTINEL, usePriceTypeIds } from '@/lib/sale-price';
import { Alert, Button, Icons, Input } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

export type QrTagFormat = 'tsennik' | 'thermal';

interface TagFormatSpec {
  labelWmm: number;
  labelHmm: number;
  pageWmm: number;
  pageHmm: number;
  cols: number;
  rows: number;
}

const TAG_FORMATS: Record<QrTagFormat, TagFormatSpec> = {
  // User rule (2026-07-04, «bir boshga bir o'lim»): EVERY tag prints on its
  // OWN tag-sized paper — the shop feeds pre-cut ценник stock, so the page
  // IS the label for both formats (no A4 grid, no cut guides).
  tsennik: { labelWmm: 70, labelHmm: 49.5, pageWmm: 70, pageHmm: 49.5, cols: 1, rows: 1 },
  // «Термоэтикетка (58х40мм)»: label IS the page (roll printer).
  thermal: { labelWmm: 58, labelHmm: 40, pageWmm: 58, pageHmm: 40, cols: 1, rows: 1 },
};

/**
 * Per-format type scale. User brief v2 (2026-07-03): name LARGE (must read
 * from a distance), QR large, CODE right under the name-rule — very big and
 * bold (the shop uses short ordinal codes: 01, 02, 11…), price below the
 * code, also large. codeSizes/priceSizes are length-tiers so long values
 * shrink instead of clipping.
 */
const TAG_TYPE = {
  tsennik: {
    padMm: 2.6,
    nameSize: 20,
    nameLine: 23,
    ruleH: 2,
    barHPx: 58,
    gapMm: 1.2,
    curSize: 11,
    maxCodePx: 34,
    maxPricePx: 34,
  },
  thermal: {
    padMm: 2,
    nameSize: 14.5,
    nameLine: 17,
    ruleH: 1.5,
    barHPx: 46,
    gapMm: 1.2,
    curSize: 9,
    maxCodePx: 26,
    maxPricePx: 26,
  },
};

/** Screen/print px per mm at 96dpi — the same factor the browser uses. */
export const MM_PX = 3.7795;

/**
 * Largest font size (px) at which `text` fits `maxWidthPx`, using per-glyph
 * width estimates for the Segoe stack (tabular digits ≈ 0.6em, caps ≈ 0.66em,
 * thin separators ≈ 0.34em). Keeps code/price as BIG as the rail allows
 * instead of fixed tiers — never clips, always maximal.
 */
export function fitSize(text: string, maxPx: number, minPx: number, maxWidthPx: number): number {
  let units = 0;
  for (const ch of text) {
    units += /[0-9]/.test(ch) ? 0.6 : /[a-zа-яё]/i.test(ch) ? 0.66 : 0.34;
  }
  const s = Math.floor(maxWidthPx / Math.max(units, 0.1));
  return Math.max(minPx, Math.min(maxPx, s));
}

/** Legacy salePrices rows may carry the numeric ISO-4217 code. */
const NUMERIC_ISO_TO_ALPHA: Record<string, string> = {
  '860': 'UZS',
  '840': 'USD',
  '643': 'RUB',
  '978': 'EUR',
};

/** Real weight cuts on every mainstream OS (unlike the app's Arial stack).
 * Exported: /labels/print reuses the same tag voice for QR templates. */
export const TAG_FONT =
  "'Segoe UI', 'Inter', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";

interface ProductDetail {
  id: string;
  name: string;
  code: string | null;
  article: string | null;
  barcodes: string[] | null;
  salePrices: Array<{ priceTypeId: string; value: string; currencyCode?: string | null }> | null;
}

export interface TagData {
  id: string;
  name: string;
  code: string | null;
  priceMinor: string | null;
  currencyCode: string;
  /** What the Code 128 strip encodes — raw barcode → code → id. */
  barcodeValue: string;
}

/** Default-tier price WITH its currency (resolveDefaultSalePrice drops it). */
function pickDefaultPrice(
  salePrices: ProductDetail['salePrices'],
  defaultId: string | null,
): { value: string; currencyCode: string } | null {
  const list = salePrices ?? [];
  if (list.length === 0) return null;
  const chosen =
    (defaultId ? list.find((p) => p.priceTypeId === defaultId) : undefined) ??
    list.find((p) => p.priceTypeId === RETAIL_SENTINEL) ??
    list[0];
  if (!chosen) return null;
  return { value: chosen.value, currencyCode: chosen.currencyCode || 'UZS' };
}

function toTagData(p: ProductDetail, defaultPriceTypeId: string | null): TagData {
  const price = pickDefaultPrice(p.salePrices, defaultPriceTypeId);
  return {
    id: p.id,
    name: p.name,
    code: p.code,
    priceMinor: price?.value ?? null,
    currencyCode: price?.currencyCode ?? 'UZS',
    // Barcode payload: RAW lookup token — barcode wins (POS/scanner token),
    // then the human-visible code, then the immutable product id. Scanners
    // (hardware or the /scan camera) type it into search, which matches it.
    barcodeValue: p.barcodes?.[0] || p.code || p.id,
  };
}

/** Minor-units string → { whole: "12 500", frac: "50" | null } (ru grouping).
 * Exported for /labels/print (QR template cells show the same price voice). */
export function splitTagPrice(minor: string): { whole: string; frac: string | null } {
  let bi: bigint;
  try {
    bi = BigInt(minor);
  } catch {
    return { whole: '—', frac: null };
  }
  const neg = bi < 0n;
  const abs = neg ? -bi : bi;
  const fracN = abs % 100n;
  return {
    whole: `${neg ? '-' : ''}${(abs / 100n).toLocaleString('ru-RU')}`,
    frac: fracN === 0n ? null : fracN.toString().padStart(2, '0'),
  };
}

// =========================================================================
// Barcode — REAL Code 128 B strip (lib/barcode128, integrity-tested table).
// QR was removed entirely (user rule 2026-07-05: «faqat shtrix-kod»).
// =========================================================================

const BARCODE_QUIET_MODULES = 8; // ≥ 10× module quiet zone incl. tag padding

/** Full-width Code 128 strip. Bars stretch to the given box uniformly —
 * horizontal scaling keeps module RATIOS intact, so scanners stay happy. */
export function BarcodeStripSvg({
  value,
  heightPx,
}: {
  value: string;
  heightPx: number;
}) {
  const { bars, total } = useMemo(() => {
    let widths: number[];
    try {
      widths = encodeCode128B(value || '-');
    } catch {
      // Non-ASCII value (never expected for codes/barcodes) — placeholder.
      widths = encodeCode128B('-');
    }
    const rects: Array<{ x: number; w: number }> = [];
    let cursor = BARCODE_QUIET_MODULES;
    widths.forEach((w, i) => {
      if (i % 2 === 0) rects.push({ x: cursor, w });
      cursor += w;
    });
    return { bars: rects, total: cursor + BARCODE_QUIET_MODULES };
  }, [value]);
  return (
    <svg
      viewBox={`0 0 ${total} 100`}
      preserveAspectRatio="none"
      width="100%"
      height={heightPx}
      style={{ shapeRendering: 'crispEdges', display: 'block' }}
      role="img"
      aria-label={value}
      data-test-id="tag-barcode-svg"
    >
      {bars.map((b, i) => (
        <rect key={`${b.x}-${i}`} x={b.x} y={0} width={b.w} height={100} fill="#000" />
      ))}
    </svg>
  );
}

// =========================================================================
// PriceTag — one designed cell
// =========================================================================

function PriceTag({ tag, format }: { tag: TagData; format: QrTagFormat }) {
  const t = useTranslations('qr_price_tag');
  const s = TAG_TYPE[format];
  const price = tag.priceMinor !== null ? splitTagPrice(tag.priceMinor) : null;
  // Middle band = code (left) · price (right); the Code 128 strip spans the
  // full width below it. Size code/price to fill their halves of the band.
  const innerW = (TAG_FORMATS[format].labelWmm - 2 * s.padMm) * MM_PX;
  const priceSize = price
    ? fitSize(price.whole + (price.frac ?? ''), s.maxPricePx, 12, innerW * 0.52)
    : s.maxPricePx;
  const codeSize = tag.code ? fitSize(tag.code, s.maxCodePx, 12, innerW * 0.42) : 0;
  // salePrices may store the NUMERIC ISO currency code ("860") instead of
  // the alpha one — normalize before deciding whether to print «so'm».
  const alphaCurrency = NUMERIC_ISO_TO_ALPHA[tag.currencyCode] ?? tag.currencyCode;
  const currencyLabel = alphaCurrency === 'UZS' ? t('currency_soum') : alphaCurrency;

  return (
    <div
      className="qr-tag"
      data-test-id="qr-price-tag"
      style={{
        width: `${TAG_FORMATS[format].labelWmm}mm`,
        height: `${TAG_FORMATS[format].labelHmm}mm`,
        padding: `${s.padMm}mm`,
        fontFamily: TAG_FONT,
        color: '#000',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* Name — the heaviest voice on the tag (user brief: much bolder than
          price). Fixed 2-line zone, bottom-anchored so a 1-line name hugs the
          rule and tags across the sheet stay optically aligned. */}
      <div
        style={{
          minHeight: `${s.nameLine * 2}px`,
          display: 'flex',
          alignItems: 'flex-end',
        }}
      >
        <div
          data-test-id="qr-tag-name"
          style={{
            fontWeight: 800,
            fontSize: `${s.nameSize}px`,
            lineHeight: `${s.nameLine}px`,
            letterSpacing: '-0.015em',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            overflowWrap: 'anywhere',
          }}
        >
          {tag.name}
        </div>
      </div>

      {/* Signature ticket rule — full-ink divider between identity and offer. */}
      <div
        aria-hidden="true"
        style={{ height: `${s.ruleH}px`, background: '#000', margin: '4px 0' }}
      />

      {/* Middle band: CODE (big & bold — the shop's ordinal find-number) on
          the left, price on the right. */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: `${s.gapMm}mm`,
          minHeight: 0,
          marginTop: '2px',
        }}
      >
        {tag.code ? (
          <div
            data-test-id="qr-tag-code"
            style={{
              fontWeight: 800,
              fontSize: `${codeSize}px`,
              lineHeight: 1.05,
              letterSpacing: '0.02em',
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {tag.code}
          </div>
        ) : (
          <div />
        )}
        <div style={{ minWidth: 0, textAlign: 'right' }}>
          <div
            data-test-id="qr-tag-price"
            style={{
              fontWeight: 600,
              fontSize: `${priceSize}px`,
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
            }}
          >
            {price ? (
              <>
                {price.whole}
                {price.frac && (
                  <span
                    style={{
                      fontSize: '0.52em',
                      fontWeight: 600,
                      verticalAlign: 'top',
                      lineHeight: 1,
                      marginLeft: '1px',
                    }}
                  >
                    {price.frac}
                  </span>
                )}
              </>
            ) : (
              '—'
            )}
          </div>
          <div
            style={{
              fontSize: `${s.curSize}px`,
              fontWeight: 500,
              color: '#444',
              marginTop: '3px',
              letterSpacing: '0.02em',
            }}
          >
            {currencyLabel}
          </div>
        </div>
      </div>

      {/* Scanner half: the Code 128 strip spans the FULL width at the bottom
          (user rule 2026-07-05: barcode only, no QR). */}
      <BarcodeStripSvg value={tag.barcodeValue} heightPx={s.barHPx} />
    </div>
  );
}

// =========================================================================
// Overlay — fetch, preview, print
// =========================================================================

export function QrPriceTagPrintOverlay({
  productIds,
  format,
  onClose,
}: {
  productIds: string[];
  format: QrTagFormat;
  onClose: () => void;
}) {
  const t = useTranslations('qr_price_tag');
  const tCommon = useTranslations('common');
  const { defaultId } = usePriceTypeIds();
  const [copies, setCopies] = useState(1);

  const { data, isPending } = useQuery({
    queryKey: ['qr-price-tags', productIds],
    queryFn: async () => {
      const settled = await Promise.allSettled(
        productIds.map((id) => api.get<ProductDetail>(`/products/${id}`)),
      );
      const products: ProductDetail[] = [];
      let failed = 0;
      for (const r of settled) {
        if (r.status === 'fulfilled') products.push(r.value);
        else failed += 1;
      }
      return { products, failed };
    },
  });

  // Lock the page scroll behind the overlay while open. Escape is deliberately
  // NOT bound: this sheet carries a chosen format + selection, and a stray key
  // used to throw all of it away — closing goes through the button only.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const spec = TAG_FORMATS[format];
  const perPage = spec.cols * spec.rows;

  // User brief v2: codes are ordinal (01, 02, 11…) — lay the sheet out in
  // code order (numeric-aware) so the printed tags always come out sorted.
  const tags = useMemo(
    () =>
      (data?.products ?? [])
        .map((p) => toTagData(p, defaultId))
        .sort(
          (a, b) =>
            (a.code ?? '').localeCompare(b.code ?? '', undefined, {
              numeric: true,
              sensitivity: 'base',
            }) || a.name.localeCompare(b.name),
        ),
    [data?.products, defaultId],
  );
  const flat = useMemo(() => tags.flatMap((tg) => Array<TagData>(copies).fill(tg)), [tags, copies]);
  const pages: TagData[][] = [];
  for (let i = 0; i < flat.length; i += perPage) pages.push(flat.slice(i, i + perPage));

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-qr-print-root=""
      data-test-id="qr-price-tag-overlay"
      // biome-ignore lint/a11y/useSemanticElements: full-screen print-preview takeover; native <dialog> needs imperative showModal() incompatible with this controlled open state (same pattern as price-rate-dialog)
      role="dialog"
      aria-modal="true"
      aria-label={t('title')}
      className="fixed inset-0 z-[60] overflow-auto bg-slate-100"
    >
      {/* Print isolation + paper geometry. The overlay portals under <body>,
          so hiding every OTHER body child removes the app entirely from the
          print flow (display:none — no reserved space, no blank pages). */}
      <style>{`
        @media print {
          @page { size: ${spec.pageWmm}mm ${spec.pageHmm}mm; margin: 0; }
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
          body > *:not([data-qr-print-root]) { display: none !important; }
          [data-qr-print-root] { position: static !important; overflow: visible !important; background: #fff !important; }
          .no-print { display: none !important; }
          /* Screen-only padding must not shift the FIRST sheet (split-bug). */
          .qr-pages { padding: 0 !important; margin: 0 !important; }
          .qr-print-page {
            margin: 0 !important;
            box-shadow: none !important;
            break-after: page;
            /* Fill the physical sheet exactly, whatever the driver rounds to. */
            width: 100vw !important;
            height: 100vh !important;
          }
          .qr-print-page:last-child { break-after: auto; }
          /* One tag per pre-cut sheet — stretch it to the full paper. */
          .qr-tag { width: 100% !important; height: 100% !important; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 border-[var(--ms-border-default)] border-b bg-white px-6 py-3 shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="truncate font-medium text-slate-800">{t('title')}</div>
            <div className="text-slate-500 text-xs">
              {t('subtitle', { labels: flat.length, pages: pages.length })}
              {data && data.failed > 0 ? ` · ${t('load_failed', { count: data.failed })}` : ''}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-slate-600 text-sm">
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
                data-test-id="qr-price-tag-copies"
              />
            </label>
            <Button variant="ghost" onClick={onClose}>
              {tCommon('back')}
            </Button>
            <Button
              variant="primary"
              onClick={() => window.print()}
              disabled={flat.length === 0}
              data-test-id="qr-price-tag-print"
            >
              <Icons.print className="h-4 w-4" />
              {tCommon('print')}
            </Button>
          </div>
        </div>
      </div>

      {isPending ? (
        <div className="no-print py-16 text-center text-slate-500 text-sm">{t('loading')}</div>
      ) : flat.length === 0 ? (
        <div className="no-print mx-auto max-w-md py-16">
          <Alert tone="destructive">{t('no_products')}</Alert>
        </div>
      ) : (
        <div className="qr-pages py-6">
          {pages.map((pageTags, pageIdx) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: print-preview pages are a static positional slice — never reordered, no stable id
              key={pageIdx}
              className="qr-print-page mx-auto mb-6 bg-white shadow-sm"
              // One tag per page: the page box IS the tag box, so the tag can
              // stretch to 100% of the physical sheet in print.
              style={{
                width: `${spec.pageWmm}mm`,
                height: `${spec.pageHmm}mm`,
              }}
            >
              {pageTags.map((tag, idx) => (
                // Cells repeat the same product `copies` times — the position disambiguates.
                <PriceTag key={`${tag.id}-${idx}`} tag={tag} format={format} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
