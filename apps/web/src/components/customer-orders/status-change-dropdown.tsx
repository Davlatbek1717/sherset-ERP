'use client';

/**
 * "Статус ▾" quick-change dropdown — moysklad parity.
 *
 * Mirrors moysklad's color-list-box-popup, captured 2026-04-30 in
 * docs/moysklad-reference/visual-captures/03-module/customerorder/
 *   screenshots/i-dropdown-status.dom.html
 *
 * Each item is a `<div class="item-status">` with a colored square
 * (`b-color-square` background-color) and a label. Clicking it applies the
 * chosen status to all selected rows.
 *
 * The dropdown has TWO render modes (see the detailed block below): the
 * PRIMARY mode lists the account's custom statuses and applies them by
 * `statusId` via /bulk-set-status; the FALLBACK mode (only when the account
 * has no custom statuses) lists the OrderState FSM enum and applies a `target`
 * state via /bulk-transition (which rejects any non-enum slug with 400). The
 * colour map below is the FSM fallback palette; custom statuses use their own
 * `color`.
 *
 * TWO MODES (moysklad parity):
 *  1. Account-defined custom statuses (moysklad's editable "Статус" with
 *     «Настроить статусы»: coloured names like "Текширилмаган") — State rows
 *     with entityType="customerorder". When the caller passes `customStatuses`
 *     (the list page's /states?entityType=customerorder query), the dropdown
 *     lists those and applies the chosen one via POST /bulk-set-status, which
 *     sends `statusId` (the State id) — NOT a name. The backend validates the
 *     id against the account's State table ONCE before fanning out, so an
 *     invalid id is a 400, not a per-row 500. (A previous version sent
 *     name.toLowerCase() as an FSM target and crashed with 500 — that path is
 *     gone; statusId is an opaque id, never an enum slug.)
 *  2. No custom statuses configured → fall back to the FSM `state` lifecycle
 *     via bulk-transition (the OrderState enum below).
 *
 * This pairs with the list's custom-status COLUMN and «Статус» FILTER, which
 * key off the same State query — all three light up together for an account
 * that has configured custom order statuses.
 */

import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { Button, DropdownMenu, Icons, useConfirm } from '@moysklad/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

/** Mirrors customer-order.schema.ts OrderStateSchema enum verbatim. */
const ORDER_STATES = [
  'draft',
  'confirmed',
  'awaiting_payment',
  'paid',
  'partially_shipped',
  'fully_shipped',
  'closed',
  'cancelled',
] as const;
type OrderState = (typeof ORDER_STATES)[number];

/**
 * Colour palette is a moysklad-parity `b-color-square` SHADOW of the
 * canonical badge tones from the shared documentStateTone()
 * (lib/document-state-tone.ts), kept in sync BY HAND (plus the moysklad
 * screenshot's pill colours from i-default.png). It cannot route through
 * Badge tones — the popup renders literal `b-color-square` colour squares,
 * which need actual hex values, not tone names.
 */
const STATE_COLOR: Record<OrderState, string> = {
  draft: '#9ca3af', // neutral grey
  confirmed: '#2563eb', // brand blue
  awaiting_payment: '#e68116', // orange (matches account custom Карз колди)
  paid: '#008739', // green (matches account custom Туланди Накт)
  partially_shipped: '#a2c617', // lime
  fully_shipped: '#16a34a', // green
  closed: '#475569', // slate
  cancelled: '#e92919', // red (matches account custom Текширилмаган)
};

interface BulkResult {
  total: number;
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
}

/** One account-defined custom order status (a State row). */
export interface CustomOrderStatus {
  id: string;
  name: string;
  color: string | null;
}

export interface StatusChangeDropdownProps {
  selectedIds: Set<string>;
  listQueryKey: readonly unknown[];
  onClearSelection: () => void;
  /**
   * Account-defined custom statuses (State rows, entityType="customerorder").
   * When non-empty, the dropdown lists these and applies them via
   * bulk-set-status (statusId); otherwise it falls back to the FSM-state
   * bulk-transition. Mirrors the list column + «Статус» filter, which key off
   * the same /states?entityType=customerorder query.
   */
  customStatuses?: CustomOrderStatus[];
}

export function StatusChangeDropdown({
  selectedIds,
  listQueryKey,
  onClearSelection,
  customStatuses = [],
}: StatusChangeDropdownProps) {
  const t = useTranslations('status_change');
  const tStates = useTranslations('states.customer_order');
  const tBulk = useTranslations('bulk');
  const { confirm } = useConfirm();
  const qc = useQueryClient();
  const ids = Array.from(selectedIds);
  const hasSelection = ids.length > 0;

  const hasCustom = customStatuses.length > 0;

  const bulkTransition = useApiMutation({
    mutationFn: async (input: { ids: string[]; target: OrderState }) =>
      api.post<BulkResult>('/customer-orders/bulk-transition', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listQueryKey });
      onClearSelection();
    },
  });

  const bulkSetStatus = useApiMutation({
    mutationFn: async (input: { ids: string[]; statusId: string | null }) =>
      api.post<BulkResult>('/customer-orders/bulk-set-status', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listQueryKey });
      onClearSelection();
    },
  });

  const isPending = bulkTransition.isPending || bulkSetStatus.isPending;

  const handlePickCustom = (status: CustomOrderStatus) => async () => {
    const ok = await confirm({
      title: tBulk('transition_confirm', { count: ids.length, target: status.name }),
      confirmLabel: status.name,
      cancelLabel: tBulk('clear_selection'),
    });
    if (ok) bulkSetStatus.mutate({ ids, statusId: status.id });
  };

  const handlePick = (state: OrderState) => async () => {
    const label = tStates(state);
    const ok = await confirm({
      title: tBulk('transition_confirm', {
        count: ids.length,
        target: label,
      }),
      confirmLabel: label,
      cancelLabel: tBulk('clear_selection'),
      tone: state === 'cancelled' ? 'destructive' : 'default',
    });
    if (ok) bulkTransition.mutate({ ids, target: state });
  };

  return (
    <DropdownMenu
      trigger={
        <Button variant="secondary" disabled={!hasSelection || isPending}>
          {t('trigger')}
          <Icons.down className="h-4 w-4" />
        </Button>
      }
      testId="status-change-dropdown"
    >
      {hasCustom
        ? customStatuses.map((s) => (
            <DropdownMenu.Item
              key={s.id}
              onSelect={handlePickCustom(s)}
              disabled={!hasSelection || isPending}
              testId={`status-change-option-${s.id}`}
              icon={
                <span
                  className="block h-3 w-3 rounded-sm border border-[var(--ms-border-default)]"
                  style={{ backgroundColor: s.color ?? 'var(--ms-text-muted)' }}
                  aria-hidden
                />
              }
            >
              {s.name}
            </DropdownMenu.Item>
          ))
        : ORDER_STATES.map((state) => (
            <DropdownMenu.Item
              key={state}
              onSelect={handlePick(state)}
              disabled={!hasSelection || isPending}
              testId={`status-change-option-${state}`}
              icon={
                <span
                  className="block h-3 w-3 rounded-sm border border-[var(--ms-border-default)]"
                  style={{ backgroundColor: STATE_COLOR[state] }}
                  aria-hidden
                />
              }
            >
              {tStates(state)}
            </DropdownMenu.Item>
          ))}
    </DropdownMenu>
  );
}
