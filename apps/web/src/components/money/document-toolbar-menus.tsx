'use client';

/**
 * Shared moysklad-parity «Изменить» / «Печать» toolbar dropdowns for the
 * money documents (cash-in, cash-out, payments-in, payments-out) and the
 * two invoice lists (invoices-out, invoices-in).
 *
 * Source-of-truth: docs/moysklad-reference/<module>/states/metadata.json,
 * states `03-edit-dropdown` and `05-print-dropdown`, captured 2026-05-30
 * via `pnpm capture-moysklad <module>`.
 *
 * The four money documents share one identical edit + print item set;
 * the two invoices share the edit set (with «Объединить» appended) and
 * each have a document-specific print set. Centralising the arrays here
 * keeps the 10-item money print menu from being copy-pasted into four
 * pages (CLAUDE.md "ikki xillik bo'lmasin").
 *
 * Disabled placeholders — these items appear in moysklad's dropdown but
 * their backend is not built for these entities yet, so they render
 * disabled (the demands precedent, print-dropdown.tsx):
 *   - Копировать / Провести / Снять проведение / Объединить — bulk copy,
 *     FSM transition and merge endpoints are not wired for money docs.
 *   - The per-document print forms (Приходный ордер, Платежное поручение,
 *     Счет покупателю …) need a selected row + PrintTemplate binding.
 *
 * Массовое редактирование is ENABLED whenever `onMassEdit` is supplied.
 * All six money/invoice lists now pass it — every entity has a working
 * `/<entity>/mass-edit` controller (owner / project / description patch,
 * mirroring invoice-out.service.massEditApply). Without `onMassEdit` the
 * item still renders, but disabled, so the helper stays reusable for any
 * future list whose backend is not yet built.
 */

import { type ListToolbarMenuItem, useConfirm } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

export interface DocEditMenuArgs {
  /** Selected row ids from the bulk hook (`bulk.selectedIds`). */
  selectedIds: Set<string>;
  /** `bulk.bulkDelete.mutate` — receives the selected id array. */
  onBulkDelete: (ids: string[]) => void;
  /** Disable «Удалить» while a delete mutation is in flight. */
  deletePending?: boolean;
  /**
   * Opens the MassEditModal. Supply only when the entity has a working
   * `/<entity>/mass-edit` endpoint — otherwise «Массовое редактирование»
   * renders as a disabled placeholder.
   */
  onMassEdit?: (ids: string[]) => void;
  /** Append «Объединить» (invoices only). */
  includeMerge?: boolean;
}

/**
 * moysklad «Изменить» dropdown — order (per metadata.json):
 * Удалить · Копировать · Массовое редактирование · Провести ·
 * Снять проведение · [Объединить].
 */
export function useDocEditMenuItems({
  selectedIds,
  onBulkDelete,
  deletePending,
  onMassEdit,
  includeMerge,
}: DocEditMenuArgs): ListToolbarMenuItem[] {
  const t = useTranslations('money_docs_menu');
  const tCommon = useTranslations('common');
  const tBulk = useTranslations('bulk');
  const tBulkActions = useTranslations('bulk_actions');
  const { confirm } = useConfirm();
  const noSelection = selectedIds.size === 0;

  const items: ListToolbarMenuItem[] = [
    {
      id: 'delete',
      label: tCommon('delete'),
      destructive: true,
      disabled: noSelection || deletePending === true,
      onSelect: async () => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;
        const ok = await confirm({
          title: tBulk('delete_confirm', { count: ids.length }),
          confirmLabel: tCommon('delete'),
          tone: 'destructive',
        });
        if (ok === true) onBulkDelete(ids);
      },
    },
    { id: 'copy', label: tBulkActions('copy'), disabled: true },
    {
      id: 'mass-edit',
      label: tBulkActions('mass_edit'),
      disabled: onMassEdit === undefined || noSelection,
      onSelect: onMassEdit ? () => onMassEdit(Array.from(selectedIds)) : undefined,
    },
    { id: 'post', label: t('post'), disabled: true },
    { id: 'unpost', label: t('unpost'), disabled: true },
  ];
  if (includeMerge) items.push({ id: 'merge', label: tBulkActions('merge'), disabled: true });
  return items;
}

/**
 * moysklad «Печать» dropdown for the four money documents — 9 items,
 * identical across cash-in/out and payments-in/out. The five «Список …»
 * reports navigate to the matching list route; the per-document forms are
 * disabled placeholders. (No «Настроить…» — money docs have no print-template
 * entity; templates are managed from documents that do, via the slide-over.)
 */
export function useMoneyPrintMenuItems(): ListToolbarMenuItem[] {
  const t = useTranslations('money_docs_menu');
  const router = useRouter();
  return [
    { id: 'all-payments', label: t('all_payments'), onSelect: () => router.push('/money') },
    { id: 'cash-in-list', label: t('cash_in_list'), onSelect: () => router.push('/cash-in') },
    { id: 'cash-in-form', label: t('cash_in_form'), disabled: true },
    { id: 'cash-out-list', label: t('cash_out_list'), onSelect: () => router.push('/cash-out') },
    { id: 'cash-out-form', label: t('cash_out_form'), disabled: true },
    {
      id: 'payment-in-list',
      label: t('payment_in_list'),
      onSelect: () => router.push('/payments-in'),
    },
    {
      id: 'payment-out-list',
      label: t('payment_out_list'),
      onSelect: () => router.push('/payments-out'),
    },
    { id: 'payment-order', label: t('payment_order'), disabled: true },
    { id: 'payment-order-uz', label: t('payment_order_uz'), disabled: true },
  ];
}

/**
 * moysklad «Печать» dropdown for invoices-out (Счета покупателям) — 6 items.
 * «Список счетов» navigates to the list; the four Счет покупателю forms
 * and «Комплект…» are disabled placeholders.
 */
export function useInvoiceOutPrintMenuItems(): ListToolbarMenuItem[] {
  const t = useTranslations('money_docs_menu');
  const router = useRouter();
  return [
    { id: 'list', label: t('inv_list'), onSelect: () => router.push('/invoices-out') },
    { id: 'schet-uz', label: t('inv_out_uz'), disabled: true },
    { id: 'schet-uz-new', label: t('inv_out_uz_new'), disabled: true },
    { id: 'schet-stamp', label: t('inv_out_stamp'), disabled: true },
    { id: 'schet', label: t('inv_out_plain'), disabled: true },
    { id: 'set', label: t('set'), disabled: true },
  ];
}

/**
 * moysklad «Печать» dropdown for invoices-in (Счета поставщиков) — 3 items.
 */
export function useInvoiceInPrintMenuItems(): ListToolbarMenuItem[] {
  const t = useTranslations('money_docs_menu');
  const router = useRouter();
  return [
    { id: 'list', label: t('inv_list'), onSelect: () => router.push('/invoices-in') },
    { id: 'schet-supplier', label: t('inv_in_supplier'), disabled: true },
    { id: 'set', label: t('set'), disabled: true },
  ];
}
