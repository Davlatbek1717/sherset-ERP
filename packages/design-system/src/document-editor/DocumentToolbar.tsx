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
 * cannot reorder the buttons themselves; that's a deliberate UX
 * choice mirrored 1:1 from moysklad so users get a stable surface
 * across modules. The one exception moysklad itself makes: document
 * types with no downstream docs (Оприходование, Списание, …) show NO
 * «Создать документ» slot at all — pages opt in via `hideCreateDoc`
 * (ground: live #enter/edit?new toolbar, user screenshots 2026-07-12).
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
  /**
   * Raw block rendered as-is INSTEAD of a menu item row — for moysklad's
   * non-interactive dropdown footers (the «Запросить форму» promo block with
   * its own header/subtitle/CTA button). Not keyboard-navigable, mirrors the
   * list-page PrintDropdown promo footer.
   */
  content?: React.ReactNode;
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
  /**
   * Hide the «Создать документ» slot entirely (not just disable it) — moysklad
   * omits it on document types with no downstream docs (e.g. Оприходование).
   */
  hideCreateDoc?: boolean;
  /** «Печать» dropdown — print template chooser. */
  printMenu?: ToolbarMenuItem[];
  printLabel?: React.ReactNode;
  /** «Отправить» dropdown — Email, Telegram, soliq.uz, etc. */
  sendMenu?: ToolbarMenuItem[];
  sendLabel?: React.ReactNode;
  /** Buttons rendered right AFTER the «Отправить» dropdown, in the same button
   *  row — moysklad pins each configured print form here as its own quick button. */
  trailingSlot?: React.ReactNode;
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
        ) : item.content ? (
          // Raw block (promo footer etc.) — rendered as-is, not a menu row.
          // biome-ignore lint/suspicious/noArrayIndexKey: static toolbar dropdown — items don't reorder
          <div key={`content-${i}`} data-test-id={item.testId}>
            {item.content}
          </div>
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
  hideCreateDoc,
  printMenu = [],
  printLabel,
  sendMenu = [],
  sendLabel,
  trailingSlot,
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
      {/* Mobile (≤767px): the joined ~490px bar cannot fit a phone row and was
          THE document-page horizontal-overflow driver — the joining classes are
          md:-scoped so phones get individually-rounded buttons that wrap. */}
      <div className="inline-flex items-center max-md:flex-wrap max-md:gap-1 [&>*:hover]:relative [&>*:hover]:z-10 md:[&>*:not(:first-child)]:-ml-px md:[&>*:not(:first-child)]:rounded-l-none md:[&>*:not(:last-child)]:rounded-r-none">
        <ToolbarDropdown
          label={modifyLabel ?? "O'zgartirish"}
          items={modifyMenu}
          testId="doc-toolbar-modify"
        />
        {!hideCreateDoc && (
          <ToolbarDropdown
            label={createDocLabel ?? 'Hujjat yaratish'}
            items={createDocMenu}
            testId="doc-toolbar-create-doc"
          />
        )}
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
      {/* moysklad pins each configured print form as its own button right after
          «Отправить» (data-driven — none when the account has no custom forms). */}
      {trailingSlot && (
        <div className="flex items-center gap-2" data-test-id="doc-toolbar-trailing">
          {trailingSlot}
        </div>
      )}
      {rightSlot && (
        <>
          <div className="flex-1" />
          {rightSlot}
        </>
      )}
    </div>
  );
}
