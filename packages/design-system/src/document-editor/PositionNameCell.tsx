'use client';

import { cn } from '../lib/cn.ts';

export interface PositionNameCellProps {
  /** Product main-image URL — a small inline thumbnail; omitted when absent. */
  imageUrl?: string;
  /** Product code. RESERVED — no longer rendered in the position «Наименование»
   *  cell: it shows the product NAME only (account choice 2026-07-06; the code
   *  keeps its own «Код» column). Kept in the interface so existing callers that
   *  still pass `code=` keep type-checking. */
  code?: string;
  /** Product name (regular weight). */
  label?: string;
  /** Placeholder shown when no product is picked yet (rare with inline-add). */
  placeholder?: string;
  /** Open the per-row product picker (used for the empty placeholder + as the
   *  legacy click-to-swap when `productHref` is not supplied). */
  onPick: () => void;
  /** Read-only (posted document) — renders as plain non-clickable text. */
  disabled?: boolean;
  testId?: string;
  /**
   * Product-card href (e.g. `/products/{id}`). moysklad parity: a position's
   * PICKED product name is a LINK to its product card — that card is where the
   * «Аналоги» tab lives (the only place moysklad surfaces analogs in the sales
   * flow). When supplied + a product is picked + editable, the name renders as
   * a blue link to the card; the per-row product SWAP then lives in the row ⋮
   * menu («Заменить»). Omitted → the name stays a picker-trigger button (legacy).
   */
  productHref?: string;
  /** SPA navigation for the product-card link — when supplied the link calls
   *  this (preventing a full reload) instead of letting the anchor navigate. */
  onNavigate?: () => void;
}

/**
 * moysklad-parity position «Наименование» cell.
 *
 * moysklad's OLD-design position grid shows the name cell as BORDERLESS plain
 * text: `[small product thumbnail] name` — the product NAME only (the code has its
 * own «Код» column; gluing the code to the name confused it with a cell path, so
 * it was dropped 2026-07-06). The thumbnail appears only when the product has an
 * image. There is no bordered input box / chevron — unlike a `CatalogPickerField`.
 * Clicking the cell re-opens the product picker (when editable). A not-yet-picked
 * row falls back to the placeholder.
 *
 * Replaces the old `renderPositionNameCell` → `<CatalogPickerField>` (a bordered
 * box showing name-only) used by the document position tables.
 */
export function PositionNameCell({
  imageUrl,
  label,
  placeholder,
  onPick,
  disabled,
  testId,
  productHref,
  onNavigate,
}: PositionNameCellProps) {
  const picked = Boolean(label);
  const inner = (
    <>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="h-[18px] w-[18px] shrink-0 rounded-[2px] border border-[var(--ms-border-default)] object-cover"
        />
      ) : null}
      <span className="min-w-0 flex-1 truncate">
        {picked ? (
          // moysklad position «Наименование» shows the product NAME only — the
          // code lives in its own «Код» column, not glued to the name.
          <span>{label}</span>
        ) : (
          <span className="text-[var(--ms-text-placeholder)]">{placeholder}</span>
        )}
      </span>
    </>
  );

  // moysklad parity: a PICKED product's name is a LINK to its product card (where
  // the «Аналоги» tab lives) — clicking it opens the card, NOT a swap picker. The
  // swap moves to the row ⋮ «Заменить». Only when href is supplied + a product is
  // picked + the row is editable; otherwise we fall back to the picker button.
  if (picked && productHref && !disabled) {
    return (
      <a
        href={productHref}
        onClick={
          onNavigate
            ? (e) => {
                e.preventDefault();
                onNavigate();
              }
            : undefined
        }
        className="flex w-full min-w-0 items-center gap-2 text-left text-[12px] text-[var(--ms-text-brand)] hover:underline focus:outline-none"
        title={label}
        data-test-id={testId}
      >
        {inner}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className={cn(
        'flex w-full min-w-0 items-center gap-2 text-left text-[12px] focus:outline-none',
        disabled ? 'cursor-default' : 'cursor-pointer hover:text-[var(--ms-text-brand)]',
      )}
      title={label}
      data-test-id={testId}
    >
      {inner}
    </button>
  );
}
