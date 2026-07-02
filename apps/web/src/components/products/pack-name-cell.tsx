'use client';

import { type ComboboxItem, Icons, Input } from '@moysklad/ui';
import * as Popover from '@radix-ui/react-popover';
import { useMemo, useRef, useState } from 'react';

/**
 * «Упаковка» pack-row «Наименование» cell — moysklad parity (live-grounded
 * 2026-06-25, docs/audits/product-pack-focus-PLAN-2026-06-25.md).
 *
 * In moysklad the pack name is a SuggestBox over the UNIT-OF-MEASURE registry
 * (the popup lists «10^3 м^2 · блок · кг · л · м · шт …», the same units the
 * product's «Единица измерения» uses) with free typing kept, plus a green «+»
 * that creates a NEW unit of measure. We keep `ProductPack.name` a free string
 * (no schema change): the suggestions come from the units reference, the input
 * stays free-text (so a custom pack name like «Коробка» is never lost), and «+»
 * raises `onCreateUnit` for the page to run the create-unit flow.
 */
export interface PackNameCellProps {
  value: string;
  onChange: (next: string) => void;
  /** Unit reference items ({value,label} = unit name) — the suggest source. */
  uomItems: ComboboxItem[];
  /** Raised by the green «+» with the current text prefilled — the page opens
   *  its create-unit modal and, on success, sets the name to the new unit. */
  onCreateUnit: (prefill: string) => void;
  placeholder?: string;
  createLabel: string;
  /** Borderless input classes (the pack-row convention). */
  inputClassName?: string;
  /** Chevron reveal classes (hidden at rest, shown on row hover/focus). */
  chevronClassName?: string;
  testId?: string;
}

const DISPLAY_CAP = 12;

export function PackNameCell({
  value,
  onChange,
  uomItems,
  onCreateUnit,
  placeholder,
  createLabel,
  inputClassName = '',
  chevronClassName = '',
  testId = 'pack-name',
}: PackNameCellProps) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter the units by the typed text (matches name + description); empty
  // text shows the whole registry, exactly like moysklad's ▾.
  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    const src = q
      ? uomItems.filter((it) =>
          (it.searchText ?? `${it.value} ${it.label}`).toLowerCase().includes(q),
        )
      : uomItems;
    return src.slice(0, DISPLAY_CAP);
  }, [uomItems, value]);

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div className="flex items-center gap-1">
      <Popover.Root open={open && matches.length > 0} onOpenChange={setOpen}>
        <Popover.Anchor asChild>
          <div className="relative flex-1">
            <Input
              ref={inputRef}
              className={`${inputClassName} pr-6`}
              value={value}
              onChange={(e) => {
                onChange(e.target.value);
                if (!open) setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              placeholder={placeholder}
              data-test-id={testId}
            />
            {/* ▾ — opens the full units list (moysklad parity); revealed on row
                hover/focus like the other pack-cell chevrons. */}
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => {
                e.preventDefault();
                setOpen((o) => !o);
                inputRef.current?.focus();
              }}
              className={`-translate-y-1/2 absolute top-1/2 right-1 text-[var(--ms-text-muted)] ${chevronClassName}`}
              aria-hidden
              data-test-id="pack-name-chevron"
            >
              <Icons.down className="size-3.5" />
            </button>
          </div>
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={2}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onInteractOutside={(e) => {
              if (
                inputRef.current &&
                e.target instanceof Node &&
                inputRef.current.contains(e.target)
              ) {
                e.preventDefault();
              }
            }}
            className="z-[var(--ms-z-popover)] max-h-[260px] w-[var(--radix-popover-trigger-width)] min-w-[180px] overflow-auto rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] shadow-[var(--ms-shadow-elevated)]"
            data-test-id="pack-name-suggest"
          >
            <ul>
              {matches.map((it) => (
                <li key={it.value}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(it.value);
                    }}
                    className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-[var(--ms-bg-muted)]"
                    data-test-id="pack-name-suggest-item"
                  >
                    <span className="flex-1 truncate">{it.label}</span>
                    {it.sublabel && (
                      <span className="text-[var(--ms-text-muted)] text-xs">{it.sublabel}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {/* green «+» — create a NEW unit of measure (moysklad parity). */}
      <button
        type="button"
        onClick={() => onCreateUnit(value.trim())}
        className="shrink-0 text-[var(--ms-success-500)] opacity-0 transition-opacity hover:opacity-100 focus:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
        aria-label={createLabel}
        title={createLabel}
        data-test-id="pack-name-create-unit"
      >
        <Icons.createCircle className="size-4" aria-hidden />
      </button>
    </div>
  );
}
