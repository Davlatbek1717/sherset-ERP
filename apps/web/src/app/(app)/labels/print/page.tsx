'use client';

/**
 * /labels/print — Print labels for selected products.
 *
 * Flow:
 *   1. Pick template (or arrives with ?templateId=...)
 *   2. Add products + quantities
 *   3. Click "Preview" → POST /labels/render → get layout + labels[]
 *   4. Render the print-ready sheet
 *   5. Click "Print" → browser print dialog opens
 *   6. Print job optionally recorded for audit (checkbox)
 *
 * Rendering (ALL formats print ONE label per page = the pre-cut sheet,
 * sorted by find-code — user rule 2026-07-04):
 *   - EVERY template format → the barcode label: product NAME on top over a
 *     REAL Code 128 B symbol, lib/barcode128 (integrity-tested table). QR was
 *     removed entirely (user rule 2026-07-05: «faqat shtrix-kod»); legacy
 *     QR-format templates print the same barcode label. The human-readable
 *     code line under the bars was removed (user rule 2026-07-20: name +
 *     bars ONLY — the bars still encode the same value).
 */

import { TAG_FONT } from '@/components/assortment/qr-price-tag-print';
import { api } from '@/lib/api-client';
import { encodeCode128B } from '@/lib/barcode128';
import {
  Alert,
  Button,
  CatalogPicker,
  CatalogPickerField,
  Checkbox,
  Icons,
  Input,
  type PickerItem,
  formatMoney,
} from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

interface TemplateRef {
  id: string;
  name: string;
  pageSize: string;
  cols: number;
  rows: number;
  archived: boolean;
}

interface RenderResponse {
  template: {
    id: string;
    name: string;
    pageSize: string;
    pageWidthMm: number | null;
    pageHeightMm: number | null;
    cols: number;
    rows: number;
    marginTopMm: number;
    marginLeftMm: number;
    columnGapMm: number;
    rowGapMm: number;
    labelWidthMm: number;
    labelHeightMm: number;
    includeName: boolean;
    includePrice: boolean;
    includeBarcode: boolean;
    includeArticle: boolean;
    headerText: string | null;
    barcodeFormat: string;
  };
  labels: Array<{
    productId: string;
    productName: string;
    article: string;
    priceMinor: string;
    barcode: string;
  }>;
  totalLabels: number;
  labelsPerPage: number;
  pageCount: number;
}

interface PrintItem {
  _uid: string;
  productId: string;
  productLabel: string;
  productPrice: string; // priceMinor as string
  quantity: number;
}

function genUid(): string {
  return `it-${Math.random().toString(36).slice(2, 10)}`;
}

export default function PrintLabelsPage() {
  const t = useTranslations('pages.labels_print');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedTemplateId = searchParams?.get('templateId') ?? null;

  const [templateId, setTemplateId] = useState<string | null>(preselectedTemplateId);
  const [templateLabel, setTemplateLabel] = useState('');
  const [items, setItems] = useState<PrintItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState<
    null | 'template' | { kind: 'product'; rowUid: string }
  >(null);
  const [recordJob, setRecordJob] = useState(true);
  const [rendered, setRendered] = useState<RenderResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-set the template label when preselectedTemplateId is given
  useQuery({
    queryKey: ['label-template-preselect', preselectedTemplateId],
    queryFn: async () => {
      if (!preselectedTemplateId) return null;
      const t = await api.get<TemplateRef>(`/label-templates/${preselectedTemplateId}`);
      setTemplateId(t.id);
      setTemplateLabel(t.name);
      return t;
    },
    enabled: !!preselectedTemplateId && !templateLabel,
  });

  // Rows selected on the products list ride along via ?productIds (the
  // «Печать» item in the list's print menu, user 2026-07-04) — pre-fill
  // them here so printing is one click, no manual re-adding.
  const preselectedProductIds = useMemo(
    () => (searchParams?.get('productIds') ?? '').split(',').filter(Boolean),
    [searchParams],
  );
  useQuery({
    queryKey: ['labels-print-prefill', preselectedProductIds.join(',')],
    queryFn: async () => {
      const settled = await Promise.allSettled(
        preselectedProductIds.map((id) =>
          api.get<{ id: string; name: string; salePrices: Array<{ value: string }> | null }>(
            `/products/${id}`,
          ),
        ),
      );
      const rows: PrintItem[] = [];
      for (const r of settled) {
        if (r.status === 'fulfilled') {
          rows.push({
            _uid: genUid(),
            productId: r.value.id,
            productLabel: r.value.name,
            productPrice: r.value.salePrices?.[0]?.value ?? '',
            quantity: 1,
          });
        }
      }
      if (rows.length > 0) setItems((prev) => (prev.length === 0 ? rows : prev));
      return rows.length;
    },
    enabled: preselectedProductIds.length > 0,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const templateFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: TemplateRef[] }>(
      `/label-templates?search=${encodeURIComponent(s)}&archived=false`,
    );
    return d.items.map((t) => ({
      id: t.id,
      primary: t.name,
      secondary: `${t.pageSize} · ${t.cols}×${t.rows}`,
    }));
  };

  const productFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{
      items: Array<{
        id: string;
        name: string;
        code: string | null;
        salePrices: Array<{ value: string }>;
      }>;
    }>(`/products?search=${encodeURIComponent(s)}&limit=50`);
    return d.items.map((p) => ({
      id: p.id,
      primary: p.name,
      secondary: p.code ?? undefined,
      meta: p.salePrices[0]?.value ? formatMoney(p.salePrices[0].value, 'UZS') : undefined,
    }));
  };

  const addItem = () => {
    setItems((arr) => [
      ...arr,
      { _uid: genUid(), productId: '', productLabel: '', productPrice: '', quantity: 1 },
    ]);
  };
  const updateItem = (uid: string, patch: Partial<PrintItem>) => {
    setItems((arr) => arr.map((i) => (i._uid === uid ? { ...i, ...patch } : i)));
  };
  const removeItem = (uid: string) => {
    setItems((arr) => arr.filter((i) => i._uid !== uid));
  };

  const renderMut = useMutation({
    mutationFn: async () => {
      if (!templateId) throw new Error(t('error_template_required'));
      const filled = items.filter((i) => i.productId && i.quantity > 0);
      if (filled.length === 0) throw new Error(t('error_min_items'));
      return api.post<RenderResponse>('/labels/render', {
        templateId,
        items: filled.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        recordJob,
      });
    },
    onSuccess: (res) => {
      setRendered(res);
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const doPrint = () => {
    window.print();
  };

  if (rendered) {
    return <RenderedSheet data={rendered} onBack={() => setRendered(null)} onPrint={doPrint} />;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-semibold text-[var(--ms-text-primary)] text-xl">{t('title')}</h1>
        <Button variant="ghost" onClick={() => router.back()}>
          ← {tCommon('back')}
        </Button>
      </div>

      {error && <Alert tone="destructive">{error}</Alert>}

      <div className="space-y-4 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
        <div>
          {/* biome-ignore lint/a11y/noLabelWithoutControl: labels the adjacent CatalogPickerField, a design-system picker rendered as a button */}
          <label className="mb-1 block text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
            {t('template_label')} <span className="text-[var(--ms-text-destructive)]">*</span>
          </label>
          <CatalogPickerField
            value={templateId ? { id: templateId, label: templateLabel } : null}
            placeholder={t('template_placeholder')}
            onPick={() => setPickerOpen('template')}
            onClear={() => {
              setTemplateId(null);
              setTemplateLabel('');
            }}
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
              {t('products_section')}
            </span>
            <Button variant="secondary" size="sm" onClick={addItem}>
              <Icons.create className="h-3.5 w-3.5" />
              {t('add_row')}
            </Button>
          </div>
          {items.length === 0 ? (
            <div className="rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] border-dashed p-6 text-center text-[var(--ms-text-muted)] text-sm">
              {t('empty_hint')}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_120px_40px] gap-2 px-2 text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                <div>{tFields('product')}</div>
                <div className="text-right">{tFields('quantity')}</div>
                <div />
              </div>
              {items.map((it) => (
                <div key={it._uid} className="grid grid-cols-[1fr_120px_40px] items-center gap-2">
                  <CatalogPickerField
                    value={it.productId ? { id: it.productId, label: it.productLabel } : null}
                    placeholder={t('product_placeholder')}
                    onPick={() => setPickerOpen({ kind: 'product', rowUid: it._uid })}
                    onClear={() =>
                      updateItem(it._uid, { productId: '', productLabel: '', productPrice: '' })
                    }
                  />
                  <Input
                    type="number"
                    min="1"
                    max="10000"
                    value={it.quantity}
                    onChange={(e) =>
                      updateItem(it._uid, {
                        quantity: Math.max(1, Number(e.target.value)),
                      })
                    }
                    className="text-right tabular-nums"
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => removeItem(it._uid)}
                    aria-label={tCommon('delete')}
                  >
                    <Icons.close className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div className="text-[var(--ms-text-muted)] text-xs">
                {t('total_labels', {
                  count: items.reduce((s, i) => s + (i.productId ? i.quantity : 0), 0),
                })}
              </div>
            </div>
          )}
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={recordJob} onCheckedChange={(v) => setRecordJob(v === true)} />
          <span>{t('record_job')}</span>
        </label>

        <div className="flex justify-end gap-2 border-[var(--ms-border-default)] border-t pt-4">
          <Button
            variant="primary"
            onClick={() => renderMut.mutate()}
            disabled={!templateId || items.length === 0 || renderMut.isPending}
          >
            {t('preview')}
          </Button>
        </div>
      </div>

      <CatalogPicker
        open={pickerOpen === 'template'}
        onClose={() => setPickerOpen(null)}
        title={t('template_picker_title')}
        fetcher={templateFetcher}
        onSelect={(item) => {
          setTemplateId(item.id);
          setTemplateLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={typeof pickerOpen === 'object' && pickerOpen?.kind === 'product'}
        onClose={() => setPickerOpen(null)}
        title={t('product_picker_title')}
        fetcher={productFetcher}
        onSelect={(item) => {
          if (typeof pickerOpen !== 'object' || pickerOpen?.kind !== 'product') return;
          updateItem(pickerOpen.rowUid, {
            productId: item.id,
            productLabel: String(item.primary),
            productPrice: String(item.meta ?? ''),
          });
        }}
      />
    </div>
  );
}

// =========================================================================
// RenderedSheet — preview + print
// =========================================================================

function RenderedSheet({
  data,
  onBack,
  onPrint,
}: {
  data: RenderResponse;
  onBack: () => void;
  onPrint: () => void;
}) {
  const t = useTranslations('pages.labels_print');
  const tCommon = useTranslations('common');
  const tpl = data.template;
  // EVERY label prints on its OWN pre-cut sheet and the page IS the label
  // («bir boshga bir o'lim», user 2026-07-04 — first demanded for QR, then
  // extended to barcode labels too): the template's page/grid geometry is
  // ignored for print, one label per page, sorted by the find-code
  // (01, 02, 03… — numeric-aware), matching the products-list flow.
  const pageW = tpl.labelWidthMm;
  const pageH = tpl.labelHeightMm;

  const sheetLabels = [...data.labels].sort((a, b) =>
    (a.article ?? '').localeCompare(b.article ?? '', undefined, {
      numeric: true,
      sensitivity: 'base',
    }),
  );

  const pages: (typeof data.labels)[] = sheetLabels.map((l) => [l]);

  // Convert mm → px for screen rendering (96 DPI ≈ 3.7795 px/mm; for
  // print we let the browser handle it via the CSS @page rule below).
  const mmPx = 3.7795;

  // Escape returns to the edit form; lock the page scroll behind the sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onBack]);

  if (typeof document === 'undefined') return null;

  // Portaled under <body> (same trick as the products-list QR overlay) so
  // @media print can hide EVERY other body child — before this, the app's
  // top navigation printed onto page 1 and pushed each tag across TWO
  // pages of pre-cut label stock (user bug report 2026-07-04).
  return createPortal(
    <div data-qr-print-root="" className="fixed inset-0 z-[60] overflow-auto bg-slate-100">
      {/* Print-only CSS: page = the label; nothing but the sheet prints. */}
      <style>{`
        @media print {
          @page {
            size: ${pageW}mm ${pageH}mm;
            margin: 0;
          }
          html, body { background: white !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
          body > *:not([data-qr-print-root]) { display: none !important; }
          [data-qr-print-root] { position: static !important; overflow: visible !important; background: #fff !important; }
          .no-print { display: none !important; }
          /* The screen-only py-6 padding shifted ONLY the first sheet down,
             splitting its tag across two pages (user round 6) — zero it. */
          .print-pages { padding: 0 !important; margin: 0 !important; }
          .print-page {
            page-break-after: always;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
            /* Fill the physical sheet exactly, whatever the driver rounds to. */
            width: 100vw !important;
            height: 100vh !important;
          }
          .print-page:last-child { page-break-after: auto; }
          /* On pre-cut tag stock the page edge IS the cut — no cell frame,
             and the single label stretches to the full sheet. */
          [data-test-id="qr-template-cell"],
          [data-test-id="barcode-template-cell"] {
            border: none !important;
            width: 100% !important;
            height: 100% !important;
          }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 border-[var(--ms-border-default)] border-b bg-white px-6 py-3 shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <div className="font-medium text-slate-800">{tpl.name}</div>
            <div className="text-slate-500 text-xs">
              {t('sheet_meta', {
                labels: data.totalLabels,
                pages: pages.length,
                format: tpl.barcodeFormat,
              })}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onBack}>
              {t('back_to_edit')}
            </Button>
            <Button variant="primary" onClick={onPrint}>
              <Icons.print className="h-4 w-4" />
              {tCommon('print')}
            </Button>
          </div>
        </div>
      </div>

      <div className="print-pages py-6">
        {pages.map((pageLabels, pageIdx) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: print-preview pages are a static positional slice — never reordered, no stable id
            key={pageIdx}
            className="print-page relative mx-auto mb-6 bg-white shadow-sm"
            style={{
              width: `${pageW * mmPx}px`,
              height: `${pageH * mmPx}px`,
            }}
          >
            {pageLabels.map((label, idx) => (
              // One label per page — it sits at 0,0 and IS the page.
              // biome-ignore lint/suspicious/noArrayIndexKey: a page holds exactly one label — the index IS the identity
              <LabelCell key={idx} label={label} template={tpl} x={0} y={0} mmPx={mmPx} />
            ))}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}

// =========================================================================
// LabelCell — every format renders the BARCODE label (user rule 2026-07-05:
// «QR умуман бўлмасин, фақат штрих-код» — QR was removed everywhere; legacy
// QR-format templates print the same Code 128 label).
// =========================================================================

function LabelCell({
  label,
  template,
  x,
  y,
  mmPx,
}: {
  label: { productName: string; article: string; priceMinor: string; barcode: string };
  template: RenderResponse['template'];
  x: number;
  y: number;
  mmPx: number;
}) {
  return <BarcodeLabelCell label={label} template={template} x={x} y={y} mmPx={mmPx} />;
}

// =========================================================================
// BarcodeLabelCell — the product barcode label (user spec 2026-07-20,
// round 14): product NAME on top → REAL scannable Code 128 filling the rest.
// The human-readable find-code line under the bars (rounds 13–13b) was
// REMOVED on user request — only the name and the bars print; the bars keep
// encoding the same value, so scanners are unaffected.
// =========================================================================

function BarcodeLabelCell({
  label,
  template,
  x,
  y,
  mmPx,
}: {
  label: { productName: string; article: string; priceMinor: string; barcode: string };
  template: RenderResponse['template'];
  x: number;
  y: number;
  mmPx: number;
}) {
  const W = template.labelWidthMm;
  const H = template.labelHeightMm;
  // Round 14 (user 2026-07-20): the find-code text line is gone — the label
  // is the NAME on top and the bars below, nothing else. Padding stays
  // squeezed (round 12, real 43×25 stock) so content keeps every spare mm.
  const padPx = Math.min(W, H) * 0.035 * mmPx;
  const innerW = W * mmPx - 2 * padPx;
  const innerH = H * mmPx - 2 * padPx;
  const name = label.productName || '';
  // Round 15 (user 2026-07-23): name MODERATELY bigger (cap ~45% of the label
  // height vs ~30% before — «kattaroq, lekin ko'p ham katta emas») and the
  // bars also end up taller than the old code-line layout because they take
  // ALL the remaining height. Sized by a greedy word-wrap simulation
  // (fitWrapSize), not a total-width estimate — the flat estimate over-sized
  // long names and the 2-line clamp ate their tail («Samsung Galaxy S24…»).
  // Product flow ONLY — the cell (yacheyka) label is a separate component
  // (stores/cell-label-print.tsx).
  const nameLines = name ? (innerH > 70 ? 2 : 1) : 0;
  const gapZone = Math.max(2, innerH * 0.02);
  const sizeCap = nameLines ? (innerH * 0.45 - gapZone) / (1.12 * nameLines) : 0;
  const nameSize = nameLines ? fitWrapSize(name, nameLines, sizeCap, 8, innerW) : 0;
  const nameZone = nameLines ? nameSize * 1.12 * nameLines + 2 : 0;
  const barsH = Math.max(20, innerH - nameZone - (nameLines ? gapZone : 0));

  return (
    <div
      className="absolute border border-slate-200"
      data-test-id="barcode-template-cell"
      style={{
        left: `${x * mmPx}px`,
        top: `${y * mmPx}px`,
        width: `${W * mmPx}px`,
        height: `${H * mmPx}px`,
        padding: `${padPx}px`,
        fontFamily: TAG_FONT,
        color: '#000',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {nameLines > 0 && (
        <div
          data-test-id="barcode-cell-name"
          style={{
            height: `${nameZone}px`,
            marginBottom: `${gapZone}px`,
            fontWeight: 800,
            fontSize: `${nameSize}px`,
            lineHeight: 1.12,
            textAlign: 'center',
            letterSpacing: '-0.01em',
            display: '-webkit-box',
            WebkitLineClamp: nameLines,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            overflowWrap: 'anywhere',
            width: '100%',
          }}
        >
          {name}
        </div>
      )}
      <Code128Svg value={label.barcode} widthPx={innerW} heightPx={barsH} />
    </div>
  );
}

// =========================================================================
// fitWrapSize — largest font size at which `name` survives a greedy
// word-wrap into `lines` lines without the -webkit-line-clamp ellipsis.
// Same per-glyph width estimates as qr-price-tag-print's fitSize (digits
// ≈0.6em, letters ≈0.66em, thin marks ≈0.34em), but wrap-aware: a flat
// total-width check assumes perfect packing across lines, which greedy
// browser wrapping never achieves for multi-word names.
// =========================================================================

function textUnits(text: string): number {
  let units = 0;
  for (const ch of text) {
    // Latin + Cyrillic letters score wider; digits narrower (Cyrillic uses escapes).
    units += /[0-9]/.test(ch) ? 0.6 : /[a-z\u0430-\u044f\u0451]/i.test(ch) ? 0.66 : 0.34;
  }
  return units;
}

function fitWrapSize(
  name: string,
  lines: number,
  maxPx: number,
  minPx: number,
  lineWidthPx: number,
): number {
  const words = name.split(/\s+/).filter(Boolean);
  const wordUnits = words.map(textUnits);
  const spaceUnits = 0.34;
  for (let size = Math.floor(maxPx); size > minPx; size--) {
    // 0.93 slack absorbs estimator error vs real Segoe 800 metrics.
    const maxLineUnits = (lineWidthPx * 0.93) / size;
    let line = 0;
    let cur = 0;
    let fits = true;
    for (const u of wordUnits) {
      if (u > maxLineUnits) {
        fits = false; // single word can't fit a line at this size
        break;
      }
      if (cur === 0) {
        cur = u;
      } else if (cur + spaceUnits + u <= maxLineUnits) {
        cur += spaceUnits + u;
      } else {
        line += 1;
        cur = u;
        if (line >= lines) {
          fits = false;
          break;
        }
      }
    }
    if (fits) return size;
  }
  return minPx;
}

// =========================================================================
// Code128Svg — REAL Code 128 B bars (lib/barcode128, integrity-tested).
// preserveAspectRatio="none" stretches the symbol linearly to the given
// box — bar/space RATIOS (what scanners read) are preserved.
// =========================================================================

// 6 in-SVG modules + the cell's own white padding together stay ≥ the
// 10-module quiet zone the spec asks for, while giving the bars ~8% more
// width (user round 8: «shtrix codni bolder qil»).
const CODE128_QUIET_MODULES = 6;

function Code128Svg({
  value,
  widthPx,
  heightPx,
}: {
  value: string;
  widthPx: number;
  heightPx: number;
}) {
  const { bars, total } = useMemo(() => {
    let widths: number[];
    try {
      widths = encodeCode128B(value || '-');
    } catch {
      // Non-ASCII value (never expected for codes/barcodes) — encode a
      // visible placeholder instead of crashing the print sheet.
      widths = encodeCode128B('-');
    }
    const rects: Array<{ x: number; w: number }> = [];
    let cursor = CODE128_QUIET_MODULES;
    widths.forEach((w, i) => {
      if (i % 2 === 0) rects.push({ x: cursor, w });
      cursor += w;
    });
    return { bars: rects, total: cursor + CODE128_QUIET_MODULES };
  }, [value]);

  return (
    <svg
      viewBox={`0 0 ${total} 100`}
      width={widthPx}
      height={heightPx}
      preserveAspectRatio="none"
      style={{ shapeRendering: 'crispEdges', display: 'block' }}
      role="img"
      aria-label={value}
      data-test-id="barcode-cell-svg"
    >
      {bars.map((b) => (
        <rect key={b.x} x={b.x} y={0} width={b.w} height={100} fill="#000" />
      ))}
    </svg>
  );
}

// (QrLabelCell removed 2026-07-05 — user rule: no QR anywhere, barcode only.)
