'use client';

import { cn } from '../lib/cn.ts';

export interface PositionNameCellProps {
  /** Product main-image URL — a small inline thumbnail; omitted when absent. */
  imageUrl?: string;
  /** Product code, rendered BOLD before the name (moysklad parity). */
  code?: string;
  /** Product name (regular weight). */
  label?: string;
  /** Placeholder shown when no product is picked yet (rare with inline-add). */
  placeholder?: string;
  /** Open the per-row product picker. */
  onPick: () => void;
  /** Read-only (posted document) — renders as plain non-clickable text. */
  disabled?: boolean;
  testId?: string;
}

/**
 * moysklad-parity position «Наименование» cell.
 *
 * moysklad's OLD-design position grid shows the name cell as BORDERLESS plain
 * text: `[small product thumbnail] **code** name` (the code in bold, the name in
 * regular weight; the thumbnail appears only when the product has an image).
 * There is no bordered input box / chevron — unlike a reference `CatalogPickerField`.
 * Clicking the cell re-opens the product picker (when editable). A not-yet-picked
 * row falls back to the placeholder.
 *
 * Replaces the old `renderPositionNameCell` → `<CatalogPickerField>` (a bordered
 * box showing name-only) used by the document position tables.
 */
export function PositionNameCell({
  imageUrl,
  code,
  label,
  placeholder,
  onPick,
  disabled,
  testId,
}: PositionNameCellProps) {
  const picked = Boolean(label || code);
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
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="h-[18px] w-[18px] shrink-0 rounded-[2px] border border-[var(--ms-border-default)] object-cover"
        />
      ) : null}
      <span className="min-w-0 flex-1 truncate">
        {picked ? (
          <>
            {code ? <span className="font-semibold">{code} </span> : null}
            <span>{label}</span>
          </>
        ) : (
          <span className="text-[var(--ms-text-placeholder)]">{placeholder}</span>
        )}
      </span>
    </button>
  );
}
