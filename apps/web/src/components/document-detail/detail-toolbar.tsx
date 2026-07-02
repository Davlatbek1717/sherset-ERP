'use client';

/**
 * Generic document-detail page top toolbar — moysklad parity.
 *
 * Source: docs/moysklad-reference/visual-captures/03-module/
 *   <doc-type>/screenshots/d-default.{png,dom.html}
 *
 * Layout (left → right):
 *   [Сохранить] [Закрыть] | 1 из N ‹ ›  | Изменить ▾ Создать документ ▾ Печать ▾ Отправить ▾
 *
 * The author block is rendered on the right edge by the parent
 * (DetailHeader) — this component covers only the action toolbar.
 *
 * The "Создать документ" dropdown is fully driven by the parent via
 * `createMenuItems` so each entity can declare its own downstream
 * documents (e.g. customer-order → demand/invoice/payment-in,
 * demand → sales-return, supply → invoice-in/payment-out, ...).
 */

import { usePrintTemplatesManager } from '@/components/print/print-templates-provider';
import { Button, DropdownMenu, Icons, JsonViewer, useConfirm } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import type * as React from 'react';
import { useState } from 'react';

export interface CreateMenuItem {
  /** Stable slug for testIds (e.g. "demand", "invoice-out"). */
  id: string;
  /** Localised label. */
  label: string;
  /** Click handler. Item is rendered as disabled when omitted. */
  onSelect?: () => void;
  /** Force-disabled (e.g. FSM gating) even when onSelect is set. */
  disabled?: boolean;
}

export interface DetailToolbarProps {
  /** Disable Save when no changes are pending. */
  isDirty: boolean;
  /** Show a spinner on Save while in flight. */
  isSaving: boolean;
  onSave(): void;
  onClose(): void;
  /** Optional prev/next nav between docs in the list. */
  position?: { current: number; total: number };
  onPrev?(): void;
  onNext?(): void;
  /** Edit-menu handlers. Each may be undefined to render the item disabled. */
  onClone?(): void;
  onDelete?(): void;
  /**
   * «Поместить в архив» / «Извлечь из архива» — archive toggle INSIDE the edit
   * menu (moysklad's product-card «...» menu, where archive lives in the menu
   * rather than as a header pill). When either handler is supplied an archive
   * item renders between Копировать and Удалить; it shows «Извлечь из архива»
   * (→ onRestore) when `archived`, otherwise «Поместить в архив» (→ onArchive).
   * Omitted on every existing page → no archive item (unchanged behaviour).
   */
  onArchive?(): void;
  onRestore?(): void;
  archived?: boolean;
  /**
   * Render the edit-menu trigger as a «...» (three-dot) icon button instead of
   * the «Изменить ▾» text button — moysklad's product-card style. Default
   * 'dropdown' (the text button every document detail page uses today).
   */
  editMenuStyle?: 'dropdown' | 'dots';
  /**
   * Hide the «Открыть в API» edit-menu item. moysklad's product «...» menu is
   * Копировать / Поместить в архив / Удалить only (no raw-JSON item). Default
   * false → the API item still renders for every document detail page.
   */
  hideOpenApi?: boolean;
  /** Print-menu handlers. */
  onPrintList?(): void;
  /**
   * Label for the main print item (the one wired to `onPrintList`). Despite the
   * handler's legacy name, every detail page wires it to open THIS document's
   * print form (`/print/<doc>/<id>`), never a list — so the old hardcoded
   * «Список заказов» («order list») label was wrong on every detail page.
   * Defaults to the generic «Бланк документа» (correct for any document); a page
   * passes its own form name (e.g. «Заказ» for a customer order) to match
   * moysklad's per-document print menu.
   */
  printDocumentLabel?: string;
  /**
   * moysklad print-template entity slug (e.g. 'customerorder'). When set, the
   * «Настроить…» item opens the right-side «Настройка шаблонов» slide-over scoped
   * to this entity — moysklad parity: print templates are managed from the
   * document itself, not a settings page. Takes precedence over the legacy
   * `onPrintConfigure` callback.
   */
  printEntity?: string;
  onPrintConfigure?(): void;
  /**
   * Full override for the «Печать» menu items. When provided, the toolbar renders
   * exactly these (moysklad parity: account form templates · standard form ·
   * Комплект… · Настроить…) instead of the default [printDocumentLabel · separator
   * · Настроить]. Mirrors the dynamic list-page print menu so the detail «Печать»
   * lists the same account forms. The page owns every handler (and the «Комплект…»
   * modal). Omitted on every other detail page → the simple default menu unchanged.
   */
  printMenuItems?: CreateMenuItem[];
  /** Send-menu handler — opens email composer. */
  onSendEmail?(): void;
  /**
   * Full override for the «Отправить» menu items. When provided, the toolbar
   * renders exactly these (moysklad parity: the account's print forms to email —
   * each renders the doc through that form and opens the composer with the PDF
   * attached) instead of the single «По электронной почте» item. Mirrors
   * `printMenuItems`. The page owns every handler. Omitted elsewhere → the simple
   * single-item send menu is unchanged.
   */
  sendMenuItems?: CreateMenuItem[];
  /**
   * Raw payload exposed via the "API'da ochish" menu item. When defined
   * (any non-undefined value, including null/empty objects), the menu
   * item is enabled and clicking it pops a centred modal showing the
   * pretty-printed JSON. The toolbar owns the modal's open/close state
   * so each detail page only has to pass the document object.
   */
  apiData?: unknown;
  /** Optional title override for the API viewer modal. */
  apiTitle?: React.ReactNode;
  /** Items for the "Создать документ" dropdown. Empty array hides the
   *  dropdown entirely (e.g. money documents that have no downstream). */
  createMenuItems?: CreateMenuItem[];
  /**
   * Hide the «Изменить» / «Отправить» / «Печать» menus entirely (not just disable
   * them). moysklad's CREATE forms show only Сохранить/Закрыть (+ Печать on some) —
   * there's nothing to copy/delete/email/print on an unsaved document. Each is opt-in
   * (default false) so every existing detail page keeps its menus unchanged.
   * products/new keeps Печать (moysklad shows it there); counterparties/new hides all
   * three (moysklad's counterparty create toolbar is Сохранить + Закрыть only).
   */
  hideEditMenu?: boolean;
  hideSendMenu?: boolean;
  hidePrintMenu?: boolean;
  /**
   * Right-aligned slot — moysklad shows the «Владелец» owner/access cluster +
   * «Изменения» (last-modified) link in the TOP-RIGHT of the TOOLBAR row (the
   * same row as Сохранить), NOT on the header row below. Converged detail pages
   * (PO/CO/supply) pass that cluster here. When provided, the action-menu group
   * sits LEFT — right after the pager, as in moysklad — instead of being pushed
   * to the right edge, so this slot owns the right edge. Omitted on pages that
   * still keep the owner cluster in the header → the action group keeps its
   * historical `ml-auto` right alignment (behaviour unchanged).
   */
  rightSlot?: React.ReactNode;
  /**
   * moysklad's PRODUCT card orders the right cluster «Изменения+avatar · Печать ·
   * «...»» — i.e. the rightSlot comes BEFORE the action menus, and the `dots`
   * edit-menu sits LAST (after Печать). Opt-in (default keeps the historical
   * menus-then-rightSlot order); only the product page sets it.
   */
  rightSlotFirst?: boolean;
}

export function DetailToolbar(props: DetailToolbarProps) {
  const tBulk = useTranslations('bulk_actions');
  const tCreate = useTranslations('create_related');
  const tPrint = useTranslations('print_menu');
  const tSend = useTranslations('detail_send');
  const tCommon = useTranslations('common');
  const tToolbar = useTranslations('detail_toolbar');
  const tUnsaved = useTranslations('unsaved_changes');
  const { confirm } = useConfirm();
  const { openTemplates } = usePrintTemplatesManager();

  const { printEntity } = props;
  const onConfigure = printEntity ? () => openTemplates(printEntity) : props.onPrintConfigure;

  const createItems = props.createMenuItems ?? [];
  const [apiOpen, setApiOpen] = useState(false);
  const apiEnabled = props.apiData !== undefined;

  // "Закрыть" navigates away via router.push (a button, not an <a>), so the
  // global UnsavedNavGuard's anchor interceptor can't catch it. Guard it here
  // with the same styled ConfirmDialog modal — no native alert, no silent loss.
  const handleClose = async () => {
    if (props.isDirty) {
      const res = await confirm({
        title: tUnsaved('title'),
        description: tUnsaved('description'),
        confirmLabel: tUnsaved('leave'),
        cancelLabel: tUnsaved('stay'),
        tone: 'warning',
      });
      if (res !== true && res !== 'confirm') return;
    }
    props.onClose();
  };

  // The «Изменить» / «...» edit-menu, extracted so it can sit FIRST (default) or
  // LAST (the product card's `dots` overflow, after Печать — moysklad order).
  const editMenuEl = props.hideEditMenu ? null : (
    <DropdownMenu
      trigger={
        props.editMenuStyle === 'dots' ? (
          <Button
            variant="secondary"
            size="sm"
            className="px-2"
            aria-label={tBulk('trigger')}
            data-test-id="detail-toolbar-edit-trigger"
          >
            <Icons.more className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="secondary" size="sm" data-test-id="detail-toolbar-edit-trigger">
            {tBulk('trigger')}
            <Icons.down className="h-4 w-4" />
          </Button>
        )
      }
    >
      {/* moysklad «Изменить» order (live ref): Удалить first, then Копировать
          (our extra archive/«Открыть в API» items, when shown, follow). */}
      <DropdownMenu.Item
        onSelect={props.onDelete}
        disabled={!props.onDelete}
        destructive
        testId="detail-toolbar-delete"
      >
        {tBulk('delete')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={props.onClone}
        disabled={!props.onClone}
        testId="detail-toolbar-clone"
      >
        {tBulk('copy')}
      </DropdownMenu.Item>
      {(props.onArchive || props.onRestore) && (
        <DropdownMenu.Item
          onSelect={props.archived ? props.onRestore : props.onArchive}
          disabled={props.archived ? !props.onRestore : !props.onArchive}
          testId="detail-toolbar-archive"
        >
          {props.archived ? tCommon('restore') : tCommon('archive')}
        </DropdownMenu.Item>
      )}
      {!props.hideOpenApi && (
        <DropdownMenu.Item
          onSelect={() => setApiOpen(true)}
          disabled={!apiEnabled}
          testId="detail-toolbar-open-api"
        >
          {tBulk('open_api')}
        </DropdownMenu.Item>
      )}
    </DropdownMenu>
  );

  // moysklad's product card puts «Изменения+avatar» BEFORE the action menus, then
  // Печать, then the `dots` overflow last. Opt-in via rightSlotFirst.
  const rightSlotEl = props.rightSlot ? (
    <div className="ml-auto flex items-center gap-4" data-test-id="detail-toolbar-right">
      {props.rightSlot}
    </div>
  ) : null;

  return (
    <div
      // Pinned to the top (the module navbar no longer pins — user 2026-06-20):
      // «Сохранить» stays reachable while the detail page scrolls under it.
      className="sticky top-0 z-[var(--ms-z-sticky)] flex flex-wrap items-center gap-2 border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-surface)] px-4 py-2"
      data-test-id="detail-toolbar"
    >
      {/*
        type="button" is REQUIRED: the create pages (products/new, bundles/new,
        services/new, variants/new, …) wrap their body in a <form onSubmit={save}>
        for Enter-to-submit. A <Button> with no explicit type defaults to
        type="submit", so a single click on Save fired BOTH its onClick (onSave)
        AND the native form submit → the create mutation ran twice → duplicate
        documents (a real double-create bug found in Phase-2 browser QA). Close
        had the same latent hazard (would submit-then-navigate on a dirty form).
        These are onClick-driven toolbar actions and must never implicitly submit.
      */}
      {/* moysklad parity: «Сохранить» is plain green text (NO leading check icon);
        «Закрыть» is a bordered (secondary) button, not borderless tertiary. */}
      <Button
        type="button"
        variant="success"
        size="sm"
        onClick={props.onSave}
        loading={props.isSaving}
        disabled={!props.isDirty || props.isSaving}
        data-test-id="detail-toolbar-save"
      >
        {tCommon('save')}
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => void handleClose()}
        data-test-id="detail-toolbar-close"
      >
        {tCommon('close')}
      </Button>

      {props.position && (
        <div
          className="ml-2 flex items-center gap-1 text-[var(--ms-text-muted)] text-xs"
          data-test-id="detail-toolbar-position"
        >
          <span className="tabular-nums">
            {tToolbar('pager', {
              current: props.position.current,
              total: props.position.total,
            })}
          </span>
          <button
            type="button"
            onClick={props.onPrev}
            disabled={!props.onPrev || props.position.current <= 1}
            className="rounded px-1 hover:bg-[var(--ms-bg-muted)] disabled:opacity-40"
            aria-label={tToolbar('prev')}
            data-test-id="detail-toolbar-prev"
          >
            <Icons.left className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={props.onNext}
            disabled={!props.onNext || props.position.current >= props.position.total}
            className="rounded px-1 hover:bg-[var(--ms-bg-muted)] disabled:opacity-40"
            aria-label={tToolbar('next')}
            data-test-id="detail-toolbar-next"
          >
            <Icons.right className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* rightSlotFirst (product): «Изменения+avatar» leads the right cluster. */}
      {props.rightSlotFirst && rightSlotEl}

      <div className={`flex flex-wrap items-center gap-1${props.rightSlot ? '' : ' ml-auto'}`}>
        {/* edit-menu sits FIRST, unless it's the `dots` overflow (then last, below). */}
        {props.editMenuStyle !== 'dots' && editMenuEl}

        {createItems.length > 0 && (
          <DropdownMenu
            trigger={
              <Button variant="secondary" size="sm" data-test-id="detail-toolbar-create-trigger">
                {tCreate('trigger_doc')}
                <Icons.down className="h-4 w-4" />
              </Button>
            }
          >
            {createItems.map((item) => (
              <DropdownMenu.Item
                key={item.id}
                onSelect={item.onSelect}
                disabled={item.disabled || !item.onSelect}
                testId={`detail-toolbar-create-${item.id}`}
              >
                {item.label}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu>
        )}

        {!props.hidePrintMenu && (
          <DropdownMenu
            trigger={
              <Button variant="secondary" size="sm" data-test-id="detail-toolbar-print-trigger">
                {tPrint('trigger')}
                <Icons.down className="h-4 w-4" />
              </Button>
            }
          >
            {props.printMenuItems ? (
              // moysklad-parity dynamic menu (account forms · standard · Комплект… ·
              // Настроить…) — the page builds + owns every item and its handler.
              props.printMenuItems.map((item) => (
                <DropdownMenu.Item
                  key={item.id}
                  onSelect={item.onSelect}
                  disabled={item.disabled || !item.onSelect}
                  testId={`detail-toolbar-print-${item.id}`}
                >
                  {item.label}
                </DropdownMenu.Item>
              ))
            ) : (
              <>
                <DropdownMenu.Item
                  onSelect={props.onPrintList}
                  disabled={!props.onPrintList}
                  testId="detail-toolbar-print-pdf"
                >
                  {props.printDocumentLabel ?? tPrint('document_blank')}
                </DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Item
                  onSelect={onConfigure}
                  disabled={!onConfigure}
                  testId="detail-toolbar-print-configure"
                >
                  {tPrint('configure')}
                </DropdownMenu.Item>
              </>
            )}
          </DropdownMenu>
        )}

        {!props.hideSendMenu && (
          <DropdownMenu
            trigger={
              <Button variant="secondary" size="sm" data-test-id="detail-toolbar-send-trigger">
                {tSend('trigger')}
                <Icons.down className="h-4 w-4" />
              </Button>
            }
          >
            {props.sendMenuItems ? (
              // moysklad-parity: the account's print forms to email (the page
              // renders each form, attaches the PDF and opens the composer).
              props.sendMenuItems.map((item) => (
                <DropdownMenu.Item
                  key={item.id}
                  onSelect={item.onSelect}
                  disabled={item.disabled || !item.onSelect}
                  testId={`detail-toolbar-send-${item.id}`}
                >
                  {item.label}
                </DropdownMenu.Item>
              ))
            ) : (
              <DropdownMenu.Item
                onSelect={props.onSendEmail}
                disabled={!props.onSendEmail}
                testId="detail-toolbar-send-email"
              >
                {tSend('email')}
              </DropdownMenu.Item>
            )}
          </DropdownMenu>
        )}

        {/* `dots` overflow edit-menu sits LAST (after Печать) — moysklad product order. */}
        {props.editMenuStyle === 'dots' && editMenuEl}
      </div>

      {/* Default: rightSlot trails the menus (historical). rightSlotFirst already
        rendered it above. */}
      {!props.rightSlotFirst && rightSlotEl}

      {apiEnabled && (
        <JsonViewer
          open={apiOpen}
          onOpenChange={setApiOpen}
          title={props.apiTitle ?? tBulk('open_api')}
          data={props.apiData}
          copyLabel={tCommon('copy_to_clipboard')}
          copiedLabel={tCommon('copied')}
          closeLabel={tCommon('close')}
          testId="detail-toolbar-api-modal"
        />
      )}
    </div>
  );
}
