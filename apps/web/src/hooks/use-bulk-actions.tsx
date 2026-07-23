'use client';

import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import {
  type BulkAction,
  BulkActionBar,
  Icons,
  type ListToolbarMenu,
  useConfirm,
  useToast,
} from '@moysklad/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

interface BulkResult {
  total: number;
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
}

export interface UseBulkActionsOptions {
  /**
   * FSM-backed entities (documents with post/unpost/cancel) get the three
   * transition buttons. Catalog entities (product, counterparty) skip them.
   */
  hasFSM?: boolean;
  /**
   * Custom transition targets if the entity FSM differs from the default
   * `post | unpost | cancel`. E.g. customer-order has `confirm`.
   */
  transitionTargets?: Array<'post' | 'unpost' | 'cancel' | 'confirm'>;
  /**
   * Catalog/reference entities (counterparty, product, variant, contact-person,
   * opportunity, task, call, price-type) expose archive/restore alongside delete.
   * The backend exposes POST /{entity}/bulk-archive and bulk-restore.
   */
  hasArchive?: boolean;
  /**
   * When provided, an extra "Изменить" button appears in the bulk-action
   * bar between transitions and delete. The hook only forwards the
   * currently selected ids — the consuming page opens its own
   * MassEditModal (since the modal needs owner/project pickers that
   * live at page level). When the modal submits, call the returned
   * `massEdit.mutate({ ids, ...patch })`.
   */
  onMassEditClick?: (ids: string[]) => void;
  /**
   * When true, a "Pechat" button appears in the bulk-action bar. The
   * button POSTs to `/<entity>/bulk-print`, expects an
   * `application/pdf` blob back, and triggers a browser download
   * named `<entity>-<count>-<timestamp>.pdf`. The backend endpoint
   * must exist (currently shipped on customer-orders; other FSM docs
   * land in a follow-up). Backend also flips `printed=true` on each
   * selected row to mirror moysklad's "Уже напечатано" workflow.
   */
  hasBulkPrint?: boolean;
}

/**
 * High-level bulk-action hook + ready-to-render bar for every list page.
 * Usage in a list page:
 *
 *   const bulk = useBulkDocumentActions('sales-returns', listQueryKey, { hasFSM: true });
 *   return <ListView {...bulk.listViewProps} bulkActionBar={bulk.bar} columns={...} />;
 *
 * This keeps the wire-up identical across all 13 list pages and the bar UX
 * matches moysklad's inline action bar 1:1 (count badge + per-verb buttons
 * + clear X on the right).
 */
export function useBulkDocumentActions(
  entity: string,
  listQueryKey: readonly unknown[],
  options: UseBulkActionsOptions = {},
) {
  const {
    hasFSM = true,
    transitionTargets = ['post', 'unpost', 'cancel'],
    hasArchive = false,
    onMassEditClick,
    hasBulkPrint = false,
  } = options;
  const qc = useQueryClient();
  const tBulk = useTranslations('bulk');
  const tCommon = useTranslations('common');
  const { confirm } = useConfirm();
  const { toast } = useToast();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const clearSelection = () => setSelectedIds(new Set());

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: listQueryKey });
    clearSelection();
  };

  const bulkDelete = useApiMutation({
    mutationFn: async (ids: string[]) => api.post<BulkResult>(`/${entity}/bulk-delete`, { ids }),
    onSuccess: (res: BulkResult) => {
      invalidate();
      // moysklad parity: a blocked delete (e.g. a POSTED document — the backend
      // only deletes drafts) comes back 200 with the row in `failed[]`, NOT as a
      // thrown error, so it would otherwise be silent. Surface the backend's own
      // localized reason so the row-hover ✕ AND the bulk «Удалить» both tell the
      // user why nothing was removed (instead of a confusing no-op).
      if (res.failed.length > 0) {
        toast.error(res.failed[0]?.error ?? tCommon('action_failed'));
      }
    },
  });

  const bulkTransition = useApiMutation({
    mutationFn: async (input: { ids: string[]; target: string }) =>
      api.post<BulkResult>(`/${entity}/bulk-transition`, input),
    onSuccess: invalidate,
  });

  const bulkArchive = useApiMutation({
    mutationFn: async (ids: string[]) => api.post<BulkResult>(`/${entity}/bulk-archive`, { ids }),
    onSuccess: invalidate,
  });

  const bulkRestore = useApiMutation({
    mutationFn: async (ids: string[]) => api.post<BulkResult>(`/${entity}/bulk-restore`, { ids }),
    onSuccess: invalidate,
  });

  /**
   * moysklad "Изменить" (mass-edit): patch ownerId / projectId /
   * description across every selected row. The caller assembles the
   * patch from the modal's filled fields — empty patch is rejected
   * server-side, so the callsite must ensure at least one field is
   * present before invoking this mutation.
   */
  const massEdit = useApiMutation({
    mutationFn: async (input: {
      ids: string[];
      ownerId?: string | null;
      projectId?: string | null;
      description?: string | null;
      // moysklad #bulkEdit extras (owner 2026-07-09): Владелец-отдел /
      // Общий доступ / Статья расходов — whitelisted per entity on the BE.
      groupId?: string | null;
      shared?: boolean;
      expenseItem?: string | null;
    }) => api.post<BulkResult>(`/${entity}/mass-edit`, input),
    onSuccess: invalidate,
  });

  /**
   * moysklad "Печать" (bulk-print): the backend renders each selected
   * doc as a one-page PDF and returns the merged file as a binary
   * stream. `api.postDownload` triggers a browser download honouring
   * the server's Content-Disposition; the success invalidator then
   * refreshes the list so the now-flipped `printed=true` flag shows
   * in the row badges immediately.
   */
  const bulkPrint = useApiMutation({
    mutationFn: async (ids: string[]) => {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      await api.postDownload(
        `/${entity}/bulk-print`,
        { ids },
        `${entity}-${ids.length}-${stamp}.pdf`,
      );
      return { ok: true } as const;
    },
    onSuccess: invalidate,
  });

  const isPending =
    bulkDelete.isPending ||
    bulkTransition.isPending ||
    bulkArchive.isPending ||
    bulkRestore.isPending ||
    bulkPrint.isPending;

  const actions: BulkAction[] = useMemo(() => {
    const list: BulkAction[] = [];
    if (hasFSM) {
      for (const target of transitionTargets) {
        // The cast is now correct: every value of `transitionTargets` —
        // including 'confirm' for customer-order's FSM — is in the bulk
        // namespace. Without 'confirm' here the runtime t() lookup
        // failed silently in production logs; uz/ru bundles updated.
        type BulkLabelKey = 'post' | 'unpost' | 'cancel' | 'confirm';
        list.push({
          key: target,
          label: tBulk(target as BulkLabelKey),
          disabled: isPending,
          onClick: async (ids) => {
            const ok = await confirm({
              title: tBulk('transition_confirm', {
                count: ids.length,
                target: tBulk(target as BulkLabelKey),
              }),
              confirmLabel: tBulk(target as BulkLabelKey),
              cancelLabel: tBulk('clear_selection'),
              tone: target === 'cancel' ? 'destructive' : 'default',
            });
            if (ok) bulkTransition.mutate({ ids, target });
          },
          destructive: target === 'cancel',
        });
      }
    }
    if (onMassEditClick) {
      list.push({
        key: 'mass-edit',
        label: tBulk('mass_edit'),
        disabled: isPending,
        onClick: (ids) => onMassEditClick(ids),
      });
    }
    if (hasBulkPrint) {
      list.push({
        key: 'print',
        label: tBulk('print'),
        disabled: isPending,
        onClick: (ids) => bulkPrint.mutate(ids),
      });
    }
    if (hasArchive) {
      list.push({
        key: 'archive',
        label: tBulk('archive'),
        disabled: isPending,
        onClick: async (ids) => {
          const ok = await confirm({
            title: tBulk('archive_confirm', { count: ids.length }),
            confirmLabel: tBulk('archive'),
            cancelLabel: tBulk('clear_selection'),
            tone: 'default',
          });
          if (ok) bulkArchive.mutate(ids);
        },
      });
      list.push({
        key: 'restore',
        label: tBulk('restore'),
        disabled: isPending,
        onClick: async (ids) => {
          const ok = await confirm({
            title: tBulk('restore_confirm', { count: ids.length }),
            confirmLabel: tBulk('restore'),
            cancelLabel: tBulk('clear_selection'),
            tone: 'default',
          });
          if (ok) bulkRestore.mutate(ids);
        },
      });
    }
    list.push({
      key: 'delete',
      label: tBulk('delete'),
      destructive: true,
      disabled: isPending,
      onClick: async (ids) => {
        const ok = await confirm({
          title: tBulk('delete_confirm', { count: ids.length }),
          confirmLabel: tBulk('delete'),
          cancelLabel: tBulk('clear_selection'),
          tone: 'destructive',
        });
        if (ok) bulkDelete.mutate(ids);
      },
    });
    return list;
  }, [
    hasFSM,
    transitionTargets,
    hasArchive,
    onMassEditClick,
    hasBulkPrint,
    isPending,
    tBulk,
    bulkDelete,
    bulkTransition,
    bulkArchive,
    bulkRestore,
    bulkPrint,
    confirm,
  ]);

  const bar = (
    <BulkActionBar
      selectedIds={selectedIds}
      onClear={clearSelection}
      actions={actions}
      countLabel={(n) => tBulk('selected_count', { count: n })}
      clearLabel={tBulk('clear_selection')}
    />
  );

  /**
   * moysklad-parity «Изменить ▾» dropdown built from the SAME bulk actions —
   * pass to `<ListView editMenu={bulk.editMenu} ... />` instead of the sticky
   * `bulkActionBar`. moysklad has no separate selection bar: the trigger is
   * always shown (auto-disabled by ListView at 0 selection), and each action
   * stays disabled until rows are picked.
   */
  const editMenu: ListToolbarMenu = {
    items: actions.map((a) => ({
      id: a.key,
      label: a.label,
      icon: a.icon,
      onSelect: () => a.onClick(Array.from(selectedIds)),
      disabled: a.disabled || selectedIds.size === 0,
      destructive: a.destructive,
    })),
  };

  /**
   * moysklad row-hover «quick-delete» — a grey circle with a white ✕ revealed
   * at the right edge of a list row on hover (live on online.moysklad.uz
   * «Товары и услуги», 2026-06-19), deleting that one row through a confirm.
   * Pass to `<DataTable rowActions={(row) => bulk.rowDelete(row.id)} />` (via
   * ListView). Reuses `bulkDelete` scoped to one id — so it invalidates + clears
   * selection exactly like the bulk path.
   *
   * CATALOG/reference lists only (products & family, counterparties, …): a
   * one-click delete is correct there. Do NOT wire it on FSM document lists —
   * a posted document must be unposted before deletion, so it never gets a
   * one-click affordance (moysklad omits it there too).
   */
  const rowDelete = (id: string) => (
    <button
      type="button"
      aria-label={tBulk('delete')}
      disabled={bulkDelete.isPending}
      onClick={async (e) => {
        e.stopPropagation();
        const ok = await confirm({
          title: tBulk('delete_confirm', { count: 1 }),
          tone: 'destructive',
        });
        if (ok) bulkDelete.mutate([id]);
      }}
      className="inline-flex h-4 w-4 items-center justify-center text-[#9e9e9e] opacity-0 transition-opacity hover:text-[#7a7a7a] disabled:opacity-40 group-hover:opacity-100"
      data-test-id={`row-delete-${id}`}
    >
      <Icons.rowDelete className="h-4 w-4" />
    </button>
  );

  /**
   * Spread these onto `<ListView {...listViewProps} editMenu={bulk.editMenu} … />`
   * to enable multi-select + the moysklad «Изменить ▾» bulk menu.
   */
  const listViewProps = {
    selectable: true as const,
    selectedIds,
    onSelectionChange: setSelectedIds,
  };

  return {
    selectedIds,
    setSelectedIds,
    clearSelection,
    bulkDelete,
    bulkTransition,
    bulkArchive,
    bulkRestore,
    massEdit,
    bulkPrint,
    bar,
    editMenu,
    rowDelete,
    listViewProps,
  };
}
