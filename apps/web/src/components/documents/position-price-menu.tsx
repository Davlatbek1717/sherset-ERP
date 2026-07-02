'use client';

/**
 * «Цена ▾» bulk-price menu — moysklad parity. A caret on the position table's
 * «Цена» header opens: «Расценить» (re-price every row by a chosen price-type)
 * and «Сохранить цены» (push the document's prices back onto the products).
 */

import { DropdownMenu } from '@moysklad/ui';
import { ChevronDown } from 'lucide-react';

export function PositionPriceMenu({
  label,
  repriceLabel,
  saveLabel,
  priceTypes,
  onReprice,
  onSavePrices,
}: {
  label: string;
  repriceLabel: string;
  saveLabel: string;
  priceTypes: Array<{ id: string; name: string }>;
  onReprice: (priceTypeId: string) => void;
  onSavePrices: () => void;
}) {
  return (
    // moysklad parity: the WHOLE «Цена ▾» is one clickable header-button — brand-blue,
    // hover-underline, caret on the right — identical to the «Наименование ▾» trigger
    // (user flagged that only the tiny caret was clickable, so «Цена» didn't read as a
    // button). Style mirrors PositionTable's name-sort trigger exactly.
    <DropdownMenu
      trigger={
        <button
          type="button"
          className="inline-flex items-center gap-0.5 text-[var(--ms-text-brand)] hover:underline focus:outline-none"
          data-test-id="position-price-menu"
        >
          {label}
          <ChevronDown className="h-3 w-3" aria-hidden />
        </button>
      }
    >
      {priceTypes.length > 0 && <DropdownMenu.Label>{repriceLabel}</DropdownMenu.Label>}
      {priceTypes.map((pt) => (
        <DropdownMenu.Item
          key={pt.id}
          onSelect={() => onReprice(pt.id)}
          data-test-id={`position-reprice-${pt.id}`}
        >
          {pt.name}
        </DropdownMenu.Item>
      ))}
      <DropdownMenu.Separator />
      <DropdownMenu.Item onSelect={onSavePrices} data-test-id="position-save-prices">
        {saveLabel}
      </DropdownMenu.Item>
    </DropdownMenu>
  );
}
