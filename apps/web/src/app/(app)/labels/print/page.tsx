'use client';

/**
 * /labels/print — mahsulot yorliqlarini chop etish.
 * Shablon tanlash yo'q — default A4 layout (2×5, 90×50mm) avtomatik ishlatiladi.
 * Yorliqda: nom, joylashuv kodi (01-02-03-05), narx, QR (mahsulot URL).
 */

import { api } from '@/lib/api-client';
import { formatBinLocation } from '@/lib/bin-location';
import {
  Button,
  CatalogPicker,
  CatalogPickerField,
  Icons,
  Input,
  type PickerItem,
  formatMoney,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';

// ── Default template (hardcoded, no DB lookup) ────────────────────────────────

const DEFAULT_TEMPLATE = {
  pageSize: 'A4',
  pageWidthMm: 210,
  pageHeightMm: 297,
  cols: 2,
  rows: 5,
  marginTopMm: 10,
  marginLeftMm: 10,
  columnGapMm: 5,
  rowGapMm: 5,
  labelWidthMm: 87.5,
  labelHeightMm: 50,
  includeName: true,
  includePrice: true,
  includeBarcode: true,
  includeArticle: true,
  includeLocation: true,
  barcodeFormat: 'QR',
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

interface PrintItem {
  _uid: string;
  productId: string;
  productLabel: string;
  quantity: number;
}

interface LabelData {
  productId: string;
  productName: string;
  article: string;
  priceMinor: string;
  binLocation: string;
}

function genUid(): string {
  return `it-${Math.random().toString(36).slice(2, 10)}`;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PrintLabelsPage() {
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const router = useRouter();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<PrintItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState<null | string>(null); // rowUid or null
  const [rendered, setRendered] = useState<LabelData[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill from ?productIds=a,b,c or ?productId=x
  const prefillIds = (searchParams?.get('productIds') ?? searchParams?.get('productId') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  useQuery({
    queryKey: ['labels-prefill', prefillIds.join(',')],
    queryFn: async () => {
      const rows = await Promise.all(
        prefillIds.map(async (id) => {
          const p = await api.get<{ id: string; name: string }>(`/products/${id}`);
          return { _uid: genUid(), productId: p.id, productLabel: p.name, quantity: 1 } satisfies PrintItem;
        }),
      );
      if (rows.length > 0) setItems(rows);
      return rows;
    },
    enabled: prefillIds.length > 0 && items.length === 0,
  });

  const productFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{
      items: Array<{ id: string; name: string; code: string | null; salePrices: Array<{ value: string }> }>;
    }>(`/products?search=${encodeURIComponent(s)}&limit=50`);
    return d.items.map((p) => ({
      id: p.id,
      primary: p.name,
      secondary: p.code ?? undefined,
      meta: p.salePrices[0]?.value ? formatMoney(p.salePrices[0].value, 'UZS') : undefined,
    }));
  };

  const addItem = () =>
    setItems((arr) => [...arr, { _uid: genUid(), productId: '', productLabel: '', quantity: 1 }]);
  const updateItem = (uid: string, patch: Partial<PrintItem>) =>
    setItems((arr) => arr.map((i) => (i._uid === uid ? { ...i, ...patch } : i)));
  const removeItem = (uid: string) =>
    setItems((arr) => arr.filter((i) => i._uid !== uid));

  const handlePreview = async () => {
    const filled = items.filter((i) => i.productId && i.quantity > 0);
    if (filled.length === 0) { setError('Kamida 1 ta mahsulot qo\'shing'); return; }
    setLoading(true);
    setError(null);
    try {
      // Fetch product details (binLocation, article, price) for each unique product
      const byId = new Map<string, LabelData>();
      await Promise.all(
        [...new Set(filled.map((i) => i.productId))].map(async (id) => {
          const p = await api.get<{
            id: string;
            name: string;
            code: string | null;
            salePrices: Array<{ value: string }> | null;
            locSklad: number | null;
            locPolka: number | null;
            locQavat: number | null;
            locYacheyka: number | null;
          }>(`/products/${id}`);
          byId.set(id, {
            productId: p.id,
            productName: p.name,
            article: p.code ?? '',
            priceMinor: p.salePrices?.[0]?.value ?? '0',
            binLocation: formatBinLocation(p),
          });
        }),
      );
      // Expand by quantity
      const labels: LabelData[] = [];
      for (const item of filled) {
        const data = byId.get(item.productId);
        if (data) for (let q = 0; q < item.quantity; q++) labels.push(data);
      }
      setRendered(labels);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Xatolik');
    } finally {
      setLoading(false);
    }
  };

  if (rendered) {
    return (
      <RenderedSheet
        labels={rendered}
        onBack={() => setRendered(null)}
        onPrint={() => window.print()}
      />
    );
  }

  const totalQty = items.reduce((s, i) => s + (i.productId ? i.quantity : 0), 0);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-semibold text-[var(--ms-text-primary)] text-xl">Yorliq chop etish</h1>
        <Button variant="ghost" onClick={() => router.back()}>← {tCommon('back')}</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700 text-sm">{error}</div>
      )}

      <div className="space-y-4 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
        <div className="flex items-center justify-between">
          <span className="text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
            {tFields('products')}
          </span>
          <Button variant="secondary" size="sm" onClick={addItem}>
            <Icons.create className="h-3.5 w-3.5" />
            Qo'shish
          </Button>
        </div>

        {items.length === 0 ? (
          <div className="rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] border-dashed p-6 text-center text-[var(--ms-text-muted)] text-sm">
            Mahsulot qo'shing
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_100px_36px] gap-2 px-2 text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
              <div>{tFields('product')}</div>
              <div className="text-right">{tFields('quantity')}</div>
              <div />
            </div>
            {items.map((it) => (
              <div key={it._uid} className="grid grid-cols-[1fr_100px_36px] items-center gap-2">
                <CatalogPickerField
                  value={it.productId ? { id: it.productId, label: it.productLabel } : null}
                  placeholder="Mahsulot tanlang"
                  onPick={() => setPickerOpen(it._uid)}
                  onClear={() => updateItem(it._uid, { productId: '', productLabel: '' })}
                />
                <Input
                  type="number"
                  min="1"
                  max="10000"
                  value={it.quantity}
                  onChange={(e) => updateItem(it._uid, { quantity: Math.max(1, Number(e.target.value)) })}
                  className="text-right tabular-nums"
                />
                <Button type="button" size="icon-sm" variant="ghost" onClick={() => removeItem(it._uid)}>
                  <Icons.close className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="text-[var(--ms-text-muted)] text-xs">Jami: {totalQty} ta yorliq</div>
          </div>
        )}

        <div className="flex justify-end border-[var(--ms-border-default)] border-t pt-4">
          <Button
            variant="primary"
            onClick={handlePreview}
            disabled={items.length === 0 || loading}
          >
            {loading ? 'Yuklanmoqda...' : 'Ko\'rish va chop etish'}
          </Button>
        </div>
      </div>

      <CatalogPicker
        open={!!pickerOpen}
        onClose={() => setPickerOpen(null)}
        title="Mahsulot tanlash"
        fetcher={productFetcher}
        onSelect={(item) => {
          if (!pickerOpen) return;
          updateItem(pickerOpen, { productId: item.id, productLabel: String(item.primary) });
          setPickerOpen(null);
        }}
      />
    </div>
  );
}

// ── RenderedSheet ─────────────────────────────────────────────────────────────

function RenderedSheet({
  labels,
  onBack,
  onPrint,
}: { labels: LabelData[]; onBack: () => void; onPrint: () => void }) {
  const tpl = DEFAULT_TEMPLATE;
  const mmPx = 3.7795;
  const labelsPerPage = tpl.cols * tpl.rows;
  const pages: LabelData[][] = [];
  for (let i = 0; i < labels.length; i += labelsPerPage) pages.push(labels.slice(i, i + labelsPerPage));

  return (
    <div className="min-h-screen bg-slate-100">
      <style>{`
        @media print {
          @page { size: ${tpl.pageWidthMm}mm ${tpl.pageHeightMm}mm; margin: 0; }
          html, body { background: white; margin: 0; padding: 0; }
          .no-print { display: none !important; }
          .print-page { page-break-after: always; margin: 0 !important; box-shadow: none !important; border: none !important; }
          .print-page:last-child { page-break-after: auto; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 border-slate-200 border-b bg-white px-6 py-3 shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <div className="font-medium text-slate-800">Yorliqlar</div>
            <div className="text-slate-500 text-xs">
              {labels.length} ta yorliq · {pages.length} ta sahifa · A4 · {tpl.cols}×{tpl.rows}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onBack}>← Orqaga</Button>
            <Button variant="primary" onClick={onPrint}>
              <Icons.print className="h-4 w-4" />
              Chop etish
            </Button>
          </div>
        </div>
      </div>

      <div className="py-6">
        {pages.map((pageLabels, pageIdx) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: print pages are positional
            key={pageIdx}
            className="print-page relative mx-auto mb-6 bg-white shadow-sm"
            style={{ width: `${tpl.pageWidthMm * mmPx}px`, height: `${tpl.pageHeightMm * mmPx}px` }}
          >
            {pageLabels.map((label, idx) => {
              const ri = Math.floor(idx / tpl.cols);
              const ci = idx % tpl.cols;
              const x = tpl.marginLeftMm + ci * (tpl.labelWidthMm + tpl.columnGapMm);
              const y = tpl.marginTopMm + ri * (tpl.labelHeightMm + tpl.rowGapMm);
              // biome-ignore lint/suspicious/noArrayIndexKey: grid cells are positional
              return <LabelCell key={idx} label={label} x={x} y={y} mmPx={mmPx} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── LabelCell ─────────────────────────────────────────────────────────────────

function LabelCell({ label, x, y, mmPx }: { label: LabelData; x: number; y: number; mmPx: number }) {
  const tpl = DEFAULT_TEMPLATE;
  const widthPx = tpl.labelWidthMm * mmPx;
  const heightPx = tpl.labelHeightMm * mmPx;
  const qrValue =
    typeof window !== 'undefined'
      ? `${window.location.origin}/products/${label.productId}`
      : `/products/${label.productId}`;
  const qrSize = Math.round(heightPx * 0.5);

  return (
    <div
      className="absolute flex flex-col justify-between overflow-hidden border border-slate-200 px-2 py-1.5"
      style={{ left: `${x * mmPx}px`, top: `${y * mmPx}px`, width: widthPx, height: heightPx, fontSize: '9px', lineHeight: '12px' }}
    >
      <div className="line-clamp-2 font-medium text-slate-800" style={{ fontSize: '10px' }}>
        {label.productName}
      </div>

      {label.binLocation && (
        <div className="font-mono font-bold text-slate-900 tabular-nums tracking-widest" style={{ fontSize: '13px' }}>
          {label.binLocation}
        </div>
      )}

      <div className="flex items-end justify-between gap-1">
        <div className="flex flex-col gap-0.5">
          {label.article && (
            <div className="text-slate-400" style={{ fontSize: '7px' }}>{label.article}</div>
          )}
          <QRCodeSVG value={qrValue} size={qrSize} level="M" marginSize={0} />
        </div>
        {label.priceMinor !== '0' && (
          <div className="shrink-0 self-end text-right font-bold text-slate-900 tabular-nums" style={{ fontSize: '13px' }}>
            {(Number(label.priceMinor) / 100).toLocaleString('uz', { maximumFractionDigits: 0 })}
          </div>
        )}
      </div>
    </div>
  );
}
