'use client';

import { computePositionTotal } from '@moysklad/money';
import * as React from 'react';
import { Icons } from '../icons/action-icons.ts';
import { formatMoney } from '../lib/format.ts';
import { Button } from '../primitives/Button.tsx';
import { Input } from '../primitives/Input.tsx';
import { MoneyInput } from '../primitives/MoneyInput.tsx';
import { CatalogPicker, CatalogPickerField, type PickerItem } from './CatalogPicker.tsx';

/**
 * Position editor — used by all line-item documents (CustomerOrder, InvoiceOut,
 * Demand, Supply, ...). Mirrors moysklad's positions table: product picker per
 * row, qty/price/discount/vat inline, realtime line+grand totals, add/remove.
 *
 * Owns picker dialog state internally; parent owns the positions array via
 * controlled value/onChange.
 */

export interface PositionRow {
  _uid: string;
  assortmentId: string | null;
  productLabel: string;
  productUom: string | null;
  quantity: string;
  priceMinor: string;
  discount: string;
  vat: string;
  vatEnabled: boolean;
  /** Customs block (import-inbound positions — Приёмка §41, Возврат §45).
   *  Optional: only the `customs`-enabled documents read/write these. */
  gtdNumber?: string;
  gtdSumMinor?: string;
  countryId?: string | null;
  countryLabel?: string;
  /** «Причина оприходования» — per-position free text (Enter). Carried through
   *  the round-trip even when no column renders it, so a detail save can't wipe
   *  it. Editing UI (a reason column) is opt-in per page. */
  reason?: string;
  /** «РНПТ» (goods-batch reg. no.) / «Ячейка» (warehouse bin) — Enter free-text.
   *  Carried through the round-trip so a detail save can't wipe them (the old
   *  PositionEditor shell has no column for them yet — set on /new). */
  rnpt?: string;
  cell?: string;
}

/**
 * Customs-block configuration (moysklad ГТД/Страна on import-inbound docs).
 * Opt-in per document: Приёмка (§41) enables all three; Возврат покупателя
 * (§45) enables gtdSum + country only. When undefined the editor renders
 * exactly as before — zero change for the documents that don't import.
 */
export interface PositionCustomsConfig {
  gtdNumber?: boolean;
  gtdSum?: boolean;
  country?: boolean;
  /** «РНПТ» (goods-batch reg. no.) / «Ячейка» (warehouse bin) — Enter free-text. */
  rnpt?: boolean;
  cell?: boolean;
  /** «Сумма ГТД» (Приёмка) vs «Себестоимость ГТД» (Возврат). */
  gtdSumLabel?: string;
  /** «Страна» column header + picker placeholder override. Pages pass the
   *  locale-resolved label (e.g. tFields('country')) so the customs country
   *  column matches the rest of the localized editor; defaults to «Страна». */
  countryLabel?: string;
  /** Country («Страна») picker fetcher — required when `country` is on. */
  countryFetcher?: (search: string) => Promise<PickerItem[]>;
}

export interface PositionTotals {
  net: bigint;
  vat: bigint;
  gross: bigint;
}

export function makePositionRow(initial: Partial<PositionRow> = {}): PositionRow {
  return {
    _uid: Math.random().toString(36).slice(2),
    assortmentId: null,
    productLabel: '',
    productUom: null,
    quantity: '1',
    priceMinor: '0',
    discount: '0',
    vat: '12',
    vatEnabled: true,
    ...initial,
  };
}

// Delegates to the shared `computePositionTotal` — the SAME micro-tiyin,
// single-round-half-up discipline the API posts with — so every document
// detail page that reduces with this (customer-orders/[id], demands,
// invoices, moves, …) shows the EXACT total the database stores. The old
// inline math rounded price×qty before the discount and truncated the
// discount division (a tiyin of FE↔BE drift), and `BigInt(Number(p.vat))`
// threw a RangeError on a fractional «НДС» (e.g. 7.5) — crashing the row.
// The try/catch degrades transient malformed input to zero, not a throw.
export function computeLineTotal(p: PositionRow, vatIncluded: boolean): PositionTotals {
  try {
    const { totalMinor, vatAmountMinor, baseMinor } = computePositionTotal(
      {
        quantity: p.quantity || '0',
        priceMinor: p.priceMinor || '0',
        discount: p.discount || '0',
        vat: p.vatEnabled && p.vat ? Number(p.vat) : null,
      },
      p.vatEnabled,
      vatIncluded,
    );
    return { net: baseMinor, vat: vatAmountMinor, gross: totalMinor };
  } catch {
    return { net: 0n, vat: 0n, gross: 0n };
  }
}

export function computeOrderTotals(positions: PositionRow[], vatIncluded: boolean): PositionTotals {
  return positions.reduce<PositionTotals>(
    (acc, p) => {
      const t = computeLineTotal(p, vatIncluded);
      return { net: acc.net + t.net, vat: acc.vat + t.vat, gross: acc.gross + t.gross };
    },
    { net: 0n, vat: 0n, gross: 0n },
  );
}

export interface PositionEditorLabels {
  empty: string;
  /** Position-number column header. Defaults to "№". */
  number?: string;
  product: string;
  quantity: string;
  pricePerUnit: string;
  /** Used in mode='qty-cost'. Defaults to "Tannarx". */
  costPerUnit?: string;
  discount: string;
  vat: string;
  lineTotal: string;
  addPosition: string;
  pickProduct: string;
  productPickerTitle: string;
  subtotal: string;
  vatRow: string;
  total: string;
  createProduct?: string;
}

const DEFAULT_LABELS: PositionEditorLabels & { costPerUnit: string; number: string } = {
  empty: "Hali pozitsiya yo'q",
  number: '№',
  product: 'Tovar',
  quantity: 'Miqdor',
  pricePerUnit: 'Narx',
  costPerUnit: 'Tannarx',
  discount: 'Skidka %',
  vat: 'NDS %',
  lineTotal: 'Jami',
  addPosition: "Pozitsiya qo'shish",
  pickProduct: 'Tovar tanlang',
  productPickerTitle: 'Tovarni tanlash',
  subtotal: 'Podytog',
  vatRow: 'NDS',
  total: 'Jami',
};

export type PositionEditorMode = 'full' | 'qty-only' | 'qty-cost';

export interface PositionEditorProps<T = unknown> {
  positions: PositionRow[];
  onChange: (next: PositionRow[]) => void;
  vatEnabled: boolean;
  vatIncluded: boolean;
  productFetcher: (search: string) => Promise<Array<PickerItem & { raw?: T }>>;
  /** Called when picking a product — should return defaults to apply to row */
  onPickProduct?: (
    raw: T | undefined,
  ) => { priceMinor?: string; vat?: string; productUom?: string | null } | undefined;
  onCreateProduct?: () => void;
  readOnly?: boolean;
  /** "full" (default) shows product/qty/price/discount/vat/lineTotal columns + grand-total
   *  footer. "qty-only" shows just product + qty (Move/Loss/Enter use this). */
  mode?: PositionEditorMode;
  /** Hide the built-in grand-total footer. Pages that render a separate
   *  totals sidebar (e.g. <DetailTotalsSidebar>) pass this to avoid the
   *  duplicate totals block moysklad does not show. */
  hideTotals?: boolean;
  labels?: Partial<PositionEditorLabels>;
  /** Opt-in customs columns (ГТД/Страна). Undefined → editor unchanged. */
  customs?: PositionCustomsConfig;
  testId?: string;
}

export function PositionEditor<T = unknown>({
  positions,
  onChange,
  vatEnabled,
  vatIncluded,
  productFetcher,
  onPickProduct,
  onCreateProduct,
  readOnly = false,
  mode = 'full',
  hideTotals = false,
  labels: labelOverrides,
  customs,
  testId,
}: PositionEditorProps<T>) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };
  const [pickerRowUid, setPickerRowUid] = React.useState<string | null>(null);
  const [countryPickerRowUid, setCountryPickerRowUid] = React.useState<string | null>(null);
  const isQtyOnly = mode === 'qty-only';
  const isQtyCost = mode === 'qty-cost';
  const isFull = mode === 'full';
  // Customs block (ГТД/Страна/РНПТ/Ячейка) — opt-in per document. Available in
  // `full` (Приёмка/Возврат) AND `qty-cost` (Оприходование has no VAT/discount,
  // so it runs in qty-cost but still carries the import grid). Each flag adds one
  // column before the trailing action cell; default (undefined) = grid untouched.
  const customsAllowed = isFull || isQtyCost;
  const cust = {
    gtdNumber: customsAllowed && !!customs?.gtdNumber,
    gtdSum: customsAllowed && !!customs?.gtdSum,
    country: customsAllowed && !!customs?.country,
    rnpt: customsAllowed && !!customs?.rnpt,
    cell: customsAllowed && !!customs?.cell,
  };
  const customsActive = cust.gtdNumber || cust.gtdSum || cust.country || cust.rnpt || cust.cell;
  // CSS grid-template-columns is SPACE-separated, NOT comma-separated.
  // The previous comma-form parsed as a single invalid value → grid
  // collapsed to a single 1fr column and every cell stacked vertically
  // in the customer-order detail page (real-browser smoke-test caught it).
  //
  // Leading 40px column is the position number (№). moysklad parity —
  // every detail-page table starts with this row counter.
  const customsTrack = [
    cust.gtdNumber ? '150px' : '',
    cust.gtdSum ? '120px' : '',
    cust.country ? '150px' : '',
    cust.rnpt ? '150px' : '',
    cust.cell ? '90px' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const gridCols = isQtyOnly
    ? '40px 1fr 140px 40px'
    : isQtyCost
      ? `40px 1fr 140px 160px${customsActive ? ` ${customsTrack}` : ''} 40px`
      : `40px 1fr 100px 140px 80px 80px 120px${customsActive ? ` ${customsTrack}` : ''} 40px`;

  const addRow = () => onChange([...positions, makePositionRow({ vatEnabled })]);
  const updateRow = (uid: string, patch: Partial<PositionRow>) =>
    onChange(positions.map((p) => (p._uid === uid ? { ...p, ...patch } : p)));
  const removeRow = (uid: string) => onChange(positions.filter((p) => p._uid !== uid));

  const grandTotal = computeOrderTotals(positions, vatIncluded);

  return (
    <div data-test-id={testId}>
      {positions.length === 0 ? (
        <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] border-dashed py-6 text-center text-[var(--ms-text-muted)] text-sm">
          {labels.empty}
        </div>
      ) : (
        <div className="space-y-2">
          <div
            className="grid gap-2 px-2 font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
            style={{ gridTemplateColumns: gridCols }}
          >
            <div className="text-right">{labels.number ?? '№'}</div>
            <div>{labels.product}</div>
            <div className="text-right">{labels.quantity}</div>
            {isQtyCost && (
              <div className="text-right">{labels.costPerUnit ?? labels.pricePerUnit}</div>
            )}
            {isFull && (
              <>
                <div className="text-right">{labels.pricePerUnit}</div>
                <div className="text-right">{labels.discount}</div>
                <div className="text-right">{labels.vat}</div>
                <div className="text-right">{labels.lineTotal}</div>
              </>
            )}
            {cust.gtdNumber && <div>Номер ГТД</div>}
            {cust.gtdSum && <div className="text-right">{customs?.gtdSumLabel ?? 'Сумма ГТД'}</div>}
            {cust.country && <div>{customs?.countryLabel ?? 'Страна'}</div>}
            {cust.rnpt && <div>РНПТ</div>}
            {cust.cell && <div>Ячейка</div>}
            <div />
          </div>
          {positions.map((p, index) => {
            const lineTotal = computeLineTotal(p, vatIncluded);
            return (
              <div
                key={p._uid}
                className="grid items-center gap-2"
                style={{ gridTemplateColumns: gridCols }}
                data-test-id={`position-row-${p._uid}`}
              >
                <div
                  className="text-right text-[var(--ms-text-muted)] text-sm tabular-nums"
                  data-test-id={`position-row-${p._uid}-number`}
                >
                  {index + 1}
                </div>
                <CatalogPickerField
                  value={p.assortmentId ? { id: p.assortmentId, label: p.productLabel } : null}
                  placeholder={labels.pickProduct}
                  onPick={() => !readOnly && setPickerRowUid(p._uid)}
                  onClear={() =>
                    !readOnly &&
                    updateRow(p._uid, {
                      assortmentId: null,
                      productLabel: '',
                      productUom: null,
                    })
                  }
                  disabled={readOnly}
                />
                <Input
                  type="text"
                  inputMode="decimal"
                  value={p.quantity}
                  onChange={(e) => updateRow(p._uid, { quantity: e.target.value })}
                  className="text-right"
                  disabled={readOnly}
                />
                {isQtyCost && (
                  <MoneyInput
                    valueMinor={p.priceMinor}
                    onChangeMinor={(v) => updateRow(p._uid, { priceMinor: v })}
                    className="text-right"
                    disabled={readOnly}
                  />
                )}
                {isFull && (
                  <>
                    <MoneyInput
                      valueMinor={p.priceMinor}
                      onChangeMinor={(v) => updateRow(p._uid, { priceMinor: v })}
                      className="text-right"
                      disabled={readOnly}
                    />
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={p.discount}
                      onChange={(e) => updateRow(p._uid, { discount: e.target.value })}
                      className="text-right"
                      disabled={readOnly}
                    />
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={p.vat}
                      onChange={(e) => updateRow(p._uid, { vat: e.target.value })}
                      className="text-right"
                      disabled={readOnly || !p.vatEnabled}
                    />
                    <div className="text-right font-medium text-sm tabular-nums">
                      {formatMoney(lineTotal.gross)}
                    </div>
                  </>
                )}
                {cust.gtdNumber && (
                  <Input
                    type="text"
                    value={p.gtdNumber ?? ''}
                    onChange={(e) => updateRow(p._uid, { gtdNumber: e.target.value })}
                    disabled={readOnly}
                  />
                )}
                {cust.gtdSum && (
                  <MoneyInput
                    valueMinor={p.gtdSumMinor ?? ''}
                    onChangeMinor={(v) => updateRow(p._uid, { gtdSumMinor: v })}
                    className="text-right"
                    disabled={readOnly}
                  />
                )}
                {cust.country && (
                  <CatalogPickerField
                    value={p.countryId ? { id: p.countryId, label: p.countryLabel ?? '' } : null}
                    placeholder={customs?.countryLabel ?? 'Страна'}
                    onPick={() => !readOnly && setCountryPickerRowUid(p._uid)}
                    onClear={() =>
                      !readOnly && updateRow(p._uid, { countryId: null, countryLabel: '' })
                    }
                    disabled={readOnly}
                  />
                )}
                {cust.rnpt && (
                  <Input
                    type="text"
                    value={p.rnpt ?? ''}
                    onChange={(e) => updateRow(p._uid, { rnpt: e.target.value })}
                    disabled={readOnly}
                  />
                )}
                {cust.cell && (
                  <Input
                    type="text"
                    value={p.cell ?? ''}
                    onChange={(e) => updateRow(p._uid, { cell: e.target.value })}
                    disabled={readOnly}
                  />
                )}
                {!readOnly && (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => removeRow(p._uid)}
                    aria-label="Remove row"
                  >
                    <Icons.close className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!readOnly && (
        <Button type="button" variant="secondary" onClick={addRow} data-test-id="add-position">
          <Icons.create className="h-4 w-4" />
          {labels.addPosition}
        </Button>
      )}

      {isFull && !hideTotals && positions.length > 0 && (
        <div className="mt-3 flex justify-end border-[var(--ms-border-default)] border-t pt-3">
          <dl className="min-w-[280px] space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--ms-text-muted)]">{labels.subtotal}:</dt>
              <dd className="font-medium tabular-nums">{formatMoney(grandTotal.net)}</dd>
            </div>
            {vatEnabled && (
              <div className="flex justify-between">
                <dt className="text-[var(--ms-text-muted)]">{labels.vatRow}:</dt>
                <dd className="tabular-nums">{formatMoney(grandTotal.vat)}</dd>
              </div>
            )}
            <div className="flex justify-between border-[var(--ms-border-default)] border-t pt-1 font-semibold text-base">
              <dt>{labels.total}:</dt>
              <dd className="tabular-nums">{formatMoney(grandTotal.gross)}</dd>
            </div>
          </dl>
        </div>
      )}

      <CatalogPicker
        open={pickerRowUid !== null}
        onClose={() => setPickerRowUid(null)}
        title={labels.productPickerTitle}
        fetcher={productFetcher}
        onCreate={onCreateProduct}
        createLabel={labels.createProduct}
        onSelect={(item) => {
          if (!pickerRowUid) return;
          const defaults = onPickProduct?.(item.raw);
          updateRow(pickerRowUid, {
            assortmentId: item.id,
            productLabel: String(item.primary),
            productUom: defaults?.productUom ?? null,
            priceMinor: defaults?.priceMinor ?? '0',
            vat: defaults?.vat ?? '12',
          });
        }}
      />

      {customs?.countryFetcher && (
        <CatalogPicker
          open={countryPickerRowUid !== null}
          onClose={() => setCountryPickerRowUid(null)}
          title="Страна"
          fetcher={customs.countryFetcher}
          onSelect={(item) => {
            if (!countryPickerRowUid) return;
            updateRow(countryPickerRowUid, {
              countryId: item.id,
              countryLabel: String(item.primary),
            });
          }}
        />
      )}
    </div>
  );
}
