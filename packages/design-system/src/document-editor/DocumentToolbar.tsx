'use client';

import type * as React from 'react';
import { Icons } from '../icons/action-icons.ts';
import { cn } from '../lib/cn.ts';
import { Button } from '../primitives/Button.tsx';
import { DropdownMenu } from '../primitives/DropdownMenu.tsx';

/**
 * Top toolbar for moysklad-parity document editors.
 *
 * Mirrors the row that sits above every Заказ / Приёмка / Счёт editor on
 * moysklad.uz. The action mix is intentionally fixed because the same
 * 6 affordances appear on every document type — Сохранить, Закрыть,
 * Изменить ▾, Создать документ ▾, Печать ▾, Отправить ▾. Pages
 * customise the contents of each dropdown via the `*Menu` props but
 * cannot reorder or hide the buttons themselves; that's a deliberate
 * UX choice mirrored 1:1 from moysklad so users get a stable surface
 * across modules.
 *
 * Save / Close are always present. Each dropdown auto-disables when its
 * menu prop is empty, so a brand-new document with no transitions can
 * still render a coherent toolbar without the "ghost" disabled buttons
 * that plague half-implemented forms.
 */
export interface ToolbarMenuItem {
  /** Item label. Optional: a `{ divider: true }` separator carries none. */
  label?: React.ReactNode;
  onClick?: () => void;
  href?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  destructive?: boolean;
  divider?: boolean;
  testId?: string;
}

export interface DocumentToolbarProps {
  /** Save button — always rendered, primary green colour. */
  onSave: () => void;
  saving?: boolean;
  saveDisabled?: boolean;
  saveLabel?: React.ReactNode;
  /** Close button — always rendered. Pass `undefined` to suppress. */
  onClose?: () => void;
  closeLabel?: React.ReactNode;
  /** «Изменить» dropdown contents (Удалить, Скопировать, Шаблон, etc.) */
  modifyMenu?: ToolbarMenuItem[];
  modifyLabel?: React.ReactNode;
  /** «Создать документ» dropdown — produces related downstream docs. */
  createDocMenu?: ToolbarMenuItem[];
  createDocLabel?: React.ReactNode;
  /** «Печать» dropdown — print template chooser. */
  printMenu?: ToolbarMenuItem[];
  printLabel?: React.ReactNode;
  /** «Отправить» dropdown — Email, Telegram, soliq.uz, etc. */
  sendMenu?: ToolbarMenuItem[];
  sendLabel?: React.ReactNode;
  /** Right-aligned slot — typically the «Файзуллоев Ф. / Основной» user
   *  badge moysklad shows in the top-right of every editor. */
  rightSlot?: React.ReactNode;
  testId?: string;
  className?: string;
}

function ToolbarDropdown({
  label,
  items,
  testId,
  icon,
  className,
}: {
  label: React.ReactNode;
  items: ToolbarMenuItem[];
  testId?: string;
  /** Optional leading icon — moysklad shows a printer on Печать and an
   *  envelope on Отправить (blueprint iconAffordances, ~16px at the toolbar
   *  row). The other dropdowns have no icon. */
  icon?: React.ReactNode;
  /** Button-group classes (border-collapse + end-rounding) so the four
   *  document-action dropdowns abut into one connected bar like moysklad. */
  className?: string;
}) {
  // Empty menu → render a disabled trigger so the layout stays stable
  // (moysklad keeps the slot visible even when no entries are valid for
  // the current FSM state). Users see the affordance is THERE but
  // greyed, vs. the slot disappearing and shifting the layout.
  const isEmpty = items.length === 0;
  if (isEmpty) {
    return (
      <Button variant="secondary" disabled data-test-id={testId} className={className}>
        {icon}
        {label}
        <Icons.down className="h-3 w-3 opacity-50" />
      </Button>
    );
  }
  return (
    <DropdownMenu
      trigger={
        <Button variant="secondary" data-test-id={testId} className={className}>
          {icon}
          {label}
          <Icons.down className="h-3 w-3" />
        </Button>
      }
    >
      {items.map((item, i) =>
        item.divider ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: static toolbar dropdown — items don't reorder
          <DropdownMenu.Separator key={`sep-${i}`} />
        ) : (
          <DropdownMenu.Item
            key={`${i}-${typeof item.label === 'string' ? item.label : ''}`}
            onSelect={item.onClick}
            disabled={item.disabled}
            destructive={item.destructive}
            icon={item.icon}
            testId={item.testId}
          >
            {item.href ? (
              <a href={item.href} className="block w-full">
                {item.label}
              </a>
            ) : (
              item.label
            )}
          </DropdownMenu.Item>
        ),
      )}
    </DropdownMenu>
  );
}

export function DocumentToolbar({
  onSave,
  saving,
  saveDisabled,
  saveLabel,
  onClose,
  closeLabel,
  modifyMenu = [],
  modifyLabel,
  createDocMenu = [],
  createDocLabel,
  printMenu = [],
  printLabel,
  sendMenu = [],
  sendLabel,
  rightSlot,
  testId,
  className,
}: DocumentToolbarProps) {
  return (
    <div
      className={cn(
        // Pinned to the top (the module navbar no longer pins — user 2026-06-20):
        // the «Сохранить» row stays reachable while the page scrolls under it.
        'sticky top-0 z-[var(--ms-z-sticky)] flex flex-wrap items-center gap-2 border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-surface)] px-4 py-2',
        className,
      )}
      data-test-id={testId ?? 'doc-toolbar'}
    >
      <Button
        type="button"
        variant="success"
        onClick={onSave}
        disabled={saveDisabled || saving}
        data-test-id="doc-toolbar-save"
      >
        {saveLabel ?? 'Saqlash'}
      </Button>
      {onClose && (
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
          data-test-id="doc-toolbar-close"
        >
          {closeLabel ?? 'Yopish'}
        </Button>
      )}
      {/* moysklad groups the four document-action dropdowns into one connected
          bar (Изменить · Создать документ · Печать · Отправить abut with shared
          dividers). `[&>*]` collapses each button's individual rounding; the
          group rounds only at its outer ends and `-ml-px` merges touching
          borders. `relative z-…` keeps a hovered button's border on top. */}
      <div className="[&>*:not(:first-child)]:-ml-px inline-flex items-center [&>*:hover]:relative [&>*:hover]:z-10 [&>*:not(:first-child)]:rounded-l-none [&>*:not(:last-child)]:rounded-r-none">
        <ToolbarDropdown
          label={modifyLabel ?? "O'zgartirish"}
          items={modifyMenu}
          testId="doc-toolbar-modify"
        />
        <ToolbarDropdown
          label={createDocLabel ?? 'Hujjat yaratish'}
          items={createDocMenu}
          testId="doc-toolbar-create-doc"
        />
        <ToolbarDropdown
          label={printLabel ?? 'Chop etish'}
          items={printMenu}
          testId="doc-toolbar-print"
          icon={<Icons.print className="h-4 w-4" />}
        />
        <ToolbarDropdown
          label={sendLabel ?? 'Yuborish'}
          items={sendMenu}
          testId="doc-toolbar-send"
          icon={<Icons.mail className="h-4 w-4" />}
        />
      </div>
      {rightSlot && (
        <>
          <div className="flex-1" />
          {rightSlot}
        </>
      )}
    </div>
  );
}
