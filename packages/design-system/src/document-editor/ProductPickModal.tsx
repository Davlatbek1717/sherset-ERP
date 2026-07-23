'use client';

import { Money } from '@moysklad/money';
import * as React from 'react';
import { Modal } from '../feedback/Modal.tsx';
import { formatMoney } from '../lib/format.ts';
import { Button } from '../primitives/Button.tsx';

/** Band-1 modal labels (i18n-injected by the page — ru/uz, Variant B). */
export interface ProductPickModalLabels {
  /** «Остаток» */ stock: string;
  /** «Цена» (original, read-only) */ price: string;
  /** «Количество» */ quantity: string;
  /** «Цена» (sale amount, input) */ salePrice: string;
  /** «Только в этой продаже» — price applies to this document only. */ priceThisSale: string;
  /** «Постоянная цена» — write the price to the product card (all future sales). */
  pricePermanent: string;
  /** «Сохранить» */ save: string;
  /** «Отменить» */ cancel: string;
}

export interface ProductPickModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Modal title — the picked product's name. */
  productName: string;
  /** Available stock (item.available). */
  available?: number;
  /** Unit label for the stock line (e.g. «шт»). */
  uomLabel?: string;
  /** Original/default price in MINOR units (read-only reference). */
  originalPriceMinor?: string;
  /** Document currency (formatting + major→minor). */
  currency: string;
  labels: ProductPickModalLabels;
  /** Fires with the entered qty + sale price (minor) on save. `permanent` is
   *  true when the «Постоянная цена» checkbox was ticked — the page then also
   *  writes the price to the product card (owner 2026-07-17). */
  onSave: (entry: { quantity: string; priceMinor: string; permanent: boolean }) => void;
  /** Price-scope checkboxes («Только в этой продаже» / «Постоянная цена») are
   *  sale-doc semantics — pass `false` on purchase/warehouse documents so the
   *  block doesn't render at all (a permanent-price write from a buy price
   *  would corrupt the product card's SALE price). Default `true`. */
  permanentPriceOption?: boolean;
  /** Threaded to the underlying Modal — fires when the dialog unmounts and
   *  Radix would restore focus. The inline-add bar uses it to hand focus to
   *  the freshly-added row's «Кол-во» (owner 2026-07-18: modal → table chain). */
  onCloseAutoFocus?: (e: Event) => void;
}

/** Sale-price major string → minor string, using the document currency's
 *  minor-unit rules. Pure + exported for tests. Empty → "0". */
export function pickPriceToMinor(major: string, currency: string): string {
  const src = major.trim() === '' ? '0' : major;
  // Cast via Parameters<> so this compiles under BOTH module resolutions the
  // monorepo uses: @moysklad/money resolves to source (currency: CurrencyCode)
  // inside this package, but to the built dist (currency: string) from the web
  // app — naming CurrencyCode directly breaks the latter (dist omits the export).
  return Money.fromMajor(src, currency as Parameters<typeof Money.fromMajor>[1]).minor.toString();
}

const PICK_INPUT_CLASS =
  'h-8 w-36 rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-input)] px-2 text-right tabular-nums focus:border-[var(--ms-border-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ms-text-brand)]';

function formatStock(available: number | undefined, uom: string | undefined): string {
  if (available == null || !Number.isFinite(available)) return '—';
  return `${available.toLocaleString('ru-RU')}${uom ? ` ${uom}` : ''}`;
}

/**
 * «Добавить товар» pick modal (Band 1). Opens when a product is chosen from
 * the position search on a SALES document. Layout top→bottom:
 *   Остаток (read-only) · Цена — original (read-only) · Количество (input,
 *   default "1") · Цена — sale amount (input, default "1").
 *
 * Cursor flow (owner spec 2026-07-18, supersedes the 3-Enter flow): open →
 * focus «Количество» (its «1» selected); Enter → «Цена» (selected); Enter →
 * SAVE immediately (the «Сохранить» button stays for mouse users). After the
 * save the inline-add bar hands focus to the new table row's «Кол-во» so the
 * in-table entry chain continues (modal → table, sequential).
 * A field entered via keyboard/auto-focus selects its text so the first
 * keystroke overwrites from scratch; a mouse-click keeps the caret where
 * clicked (continue editing) — moysklad grid parity.
 */
export function ProductPickModal({
  open,
  onOpenChange,
  productName,
  available,
  uomLabel,
  originalPriceMinor,
  currency,
  labels,
  onSave,
  permanentPriceOption = true,
  onCloseAutoFocus,
}: ProductPickModalProps) {
  // moysklad parity + task: qty and sale-price both default to "1" on open.
  const [qty, setQty] = React.useState('1');
  const [priceMajor, setPriceMajor] = React.useState('1');
  // Price scope (owner 2026-07-17): two mutually-exclusive checkboxes. null =
  // neither ticked = «faqat shu savdoda» (this sale only) — the fast default,
  // no mandatory choice. 'permanent' also writes the product card's sale price.
  const [scope, setScope] = React.useState<'sale' | 'permanent' | null>(null);
  const qtyRef = React.useRef<HTMLInputElement>(null);
  const priceRef = React.useRef<HTMLInputElement>(null);
  // select-all only on keyboard/programmatic focus, NOT on a mouse click (the
  // caret stays where clicked so the user can continue editing — task §4.3).
  const mouseFocusRef = React.useRef(false);

  // Reset to defaults + focus «Количество» (select-all) every time it opens.
  // rAF runs AFTER Radix Dialog's own open-autofocus so ours wins.
  React.useEffect(() => {
    if (!open) return;
    setQty('1');
    setPriceMajor('1');
    setScope(null);
    const id = requestAnimationFrame(() => {
      qtyRef.current?.focus();
      qtyRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  const selectHandlers = {
    onMouseDown: () => {
      mouseFocusRef.current = true;
    },
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
      if (!mouseFocusRef.current) e.currentTarget.select();
      mouseFocusRef.current = false;
    },
  };

  const save = () => {
    onSave({
      quantity: qty.trim() === '' ? '0' : qty,
      priceMinor: pickPriceToMinor(priceMajor, currency),
      permanent: scope === 'permanent',
    });
    onOpenChange(false);
  };

  // Checkbox-looking mutual-exclusive toggle: ticking one clears the other;
  // re-ticking the same clears it back to the default (this-sale-only).
  const toggleScope = (value: 'sale' | 'permanent') =>
    setScope((s) => (s === value ? null : value));

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={productName}
      widthClass="w-[360px]"
      testId="product-pick-modal"
      onCloseAutoFocus={onCloseAutoFocus}
      footer={
        <>
          <Button
            type="button"
            variant="success"
            size="sm"
            onClick={save}
            data-test-id="product-pick-save"
          >
            {labels.save}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            {labels.cancel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 px-4 py-3 text-sm">
        {/* 1. Остаток (read-only) */}
        <div className="flex items-center justify-between">
          <span className="text-[var(--ms-text-muted)]">{labels.stock}</span>
          <span className="tabular-nums" data-test-id="product-pick-stock">
            {formatStock(available, uomLabel)}
          </span>
        </div>
        {/* 2. Цена — original price (read-only) */}
        <div className="flex items-center justify-between">
          <span className="text-[var(--ms-text-muted)]">{labels.price}</span>
          <span className="tabular-nums" data-test-id="product-pick-orig-price">
            {formatMoney(originalPriceMinor ?? '0', currency, { displayAs: 'none' })}
          </span>
        </div>
        {/* 3. Количество — default "1", auto-focused */}
        <label className="flex items-center justify-between gap-3">
          <span className="text-[var(--ms-text-muted)]">{labels.quantity}</span>
          <input
            ref={qtyRef}
            type="text"
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                priceRef.current?.focus();
                priceRef.current?.select();
              }
            }}
            {...selectHandlers}
            className={PICK_INPUT_CLASS}
            data-test-id="product-pick-qty"
          />
        </label>
        {/* 4. Цена — sale amount, default "1", Enter → SAVE (owner 2026-07-18:
            qty → Enter → price → Enter → saved; focus then continues into the
            new table row via the inline-add bar's onCloseAutoFocus chain). */}
        <label className="flex items-center justify-between gap-3">
          <span className="text-[var(--ms-text-muted)]">{labels.salePrice}</span>
          <input
            ref={priceRef}
            type="text"
            inputMode="decimal"
            value={priceMajor}
            onChange={(e) => setPriceMajor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                save();
              }
            }}
            {...selectHandlers}
            className={PICK_INPUT_CLASS}
            data-test-id="product-pick-price"
          />
        </label>
        {/* 5. Price scope — «Faqat shu savdoda» / «Doimiy narx» (owner 2026-07-17).
            Mutually exclusive; both unchecked = this-sale-only (the default).
            «Doimiy narx» writes the product CARD's default sale price, which is
            account-currency (UZS) — on a foreign-currency document the entered
            amount would land unconverted (e.g. 100 USD stored as 100 сум), so the
            permanent option only renders on UZS documents (review 2026-07-17).
            Sale-doc semantics only — purchase/warehouse pages pass
            `permanentPriceOption={false}` and the whole block is hidden. */}
        {permanentPriceOption && (
          <div className="space-y-1.5 border-[var(--ms-border-default)] border-t pt-2.5">
            <label className="flex cursor-pointer items-center gap-2 text-[12px]">
              <input
                type="checkbox"
                checked={scope === 'sale'}
                onChange={() => toggleScope('sale')}
                className="h-3.5 w-3.5"
                data-test-id="product-pick-scope-sale"
              />
              {labels.priceThisSale}
            </label>
            {currency === 'UZS' && (
              <label className="flex cursor-pointer items-center gap-2 text-[12px]">
                <input
                  type="checkbox"
                  checked={scope === 'permanent'}
                  onChange={() => toggleScope('permanent')}
                  className="h-3.5 w-3.5"
                  data-test-id="product-pick-scope-permanent"
                />
                {labels.pricePermanent}
              </label>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
