import { api } from '@/lib/api-client';
import { renderHookWithProviders } from '@/test-utils';
import { useConfirm } from '@moysklad/ui';
import { QueryClient } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react';
/**
 * useBulkDocumentActions tests — verify the selection state machine,
 * the FSM-vs-catalog action set, and the confirm-then-mutate +
 * invalidate-then-clear flow. Used by every list page (~14 list
 * pages) so a regression silently breaks the bulk action bar's
 * core flow (deletes, transitions, selection).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBulkDocumentActions } from './use-bulk-actions';

vi.mock('@/lib/api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    postDownload: vi.fn(),
  },
}));

vi.mock('@moysklad/ui', async () => {
  const actual = await vi.importActual<typeof import('@moysklad/ui')>('@moysklad/ui');
  return {
    ...actual,
    useConfirm: vi.fn(),
  };
});

const mockedPost = vi.mocked(api.post);
const mockedPostDownload = vi.mocked(api.postDownload);
const mockedUseConfirm = vi.mocked(useConfirm);

describe('useBulkDocumentActions', () => {
  let confirmFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    confirmFn = vi.fn().mockResolvedValue(true);
    mockedUseConfirm.mockReturnValue({
      confirm: confirmFn,
    } as unknown as ReturnType<typeof useConfirm>);
    mockedPost.mockResolvedValue({ total: 1, succeeded: ['id-1'], failed: [] });
    mockedPostDownload.mockResolvedValue(undefined);
  });

  describe('selection state', () => {
    it('starts with an empty selection set', () => {
      const { result } = renderHookWithProviders(() =>
        useBulkDocumentActions('demands', ['demands']),
      );
      expect(result.current.selectedIds.size).toBe(0);
    });

    it('setSelectedIds replaces the selection', () => {
      const { result } = renderHookWithProviders(() =>
        useBulkDocumentActions('demands', ['demands']),
      );
      act(() => {
        result.current.setSelectedIds(new Set(['id-1', 'id-2']));
      });
      expect(Array.from(result.current.selectedIds).sort()).toEqual(['id-1', 'id-2']);
    });

    it('clearSelection empties the set', () => {
      const { result } = renderHookWithProviders(() =>
        useBulkDocumentActions('demands', ['demands']),
      );
      act(() => {
        result.current.setSelectedIds(new Set(['id-1']));
      });
      act(() => {
        result.current.clearSelection();
      });
      expect(result.current.selectedIds.size).toBe(0);
    });

    it('exposes listViewProps spread for ListView (selectable + selectedIds + onSelectionChange)', () => {
      const { result } = renderHookWithProviders(() =>
        useBulkDocumentActions('demands', ['demands']),
      );
      expect(result.current.listViewProps.selectable).toBe(true);
      expect(result.current.listViewProps.selectedIds).toBe(result.current.selectedIds);
      expect(typeof result.current.listViewProps.onSelectionChange).toBe('function');
    });
  });

  describe('bulkDelete mutation', () => {
    it('POSTs to /<entity>/bulk-delete with the ids array', async () => {
      const { result } = renderHookWithProviders(() =>
        useBulkDocumentActions('demands', ['demands']),
      );
      await act(async () => {
        await result.current.bulkDelete.mutateAsync(['id-1', 'id-2']);
      });
      expect(mockedPost).toHaveBeenCalledWith('/demands/bulk-delete', {
        ids: ['id-1', 'id-2'],
      });
    });

    it('invalidates the listQueryKey + clears selection on success', async () => {
      const qc = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
      const { result } = renderHookWithProviders(
        () => useBulkDocumentActions('demands', ['demands']),
        { queryClient: qc },
      );
      act(() => {
        result.current.setSelectedIds(new Set(['id-1']));
      });
      await act(async () => {
        await result.current.bulkDelete.mutateAsync(['id-1']);
      });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['demands'] });
      expect(result.current.selectedIds.size).toBe(0);
    });
  });

  describe('bulkTransition mutation', () => {
    it('POSTs to /<entity>/bulk-transition with { ids, target }', async () => {
      const { result } = renderHookWithProviders(() =>
        useBulkDocumentActions('demands', ['demands']),
      );
      await act(async () => {
        await result.current.bulkTransition.mutateAsync({
          ids: ['id-1'],
          target: 'post',
        });
      });
      expect(mockedPost).toHaveBeenCalledWith('/demands/bulk-transition', {
        ids: ['id-1'],
        target: 'post',
      });
    });
  });

  describe('action set', () => {
    it('includes 4 actions for FSM documents (3 transitions + delete)', () => {
      const { result } = renderHookWithProviders(() =>
        useBulkDocumentActions('demands', ['demands'], { hasFSM: true }),
      );
      const actions = result.current.bar.props.actions;
      expect(actions.length).toBe(4);
      expect(actions.map((a: { key: string }) => a.key)).toEqual([
        'post',
        'unpost',
        'cancel',
        'delete',
      ]);
    });

    it('includes ONLY delete for catalog items (hasFSM=false)', () => {
      const { result } = renderHookWithProviders(() =>
        useBulkDocumentActions('counterparties', ['counterparties'], { hasFSM: false }),
      );
      const actions = result.current.bar.props.actions;
      expect(actions.length).toBe(1);
      expect(actions[0].key).toBe('delete');
    });

    it('uses customer-order FSM transitions when transitionTargets includes "confirm"', () => {
      const { result } = renderHookWithProviders(() =>
        useBulkDocumentActions('customer-orders', ['customer-orders'], {
          hasFSM: true,
          transitionTargets: ['confirm', 'unpost', 'cancel'],
        }),
      );
      const actions = result.current.bar.props.actions;
      expect(actions.map((a: { key: string }) => a.key)).toEqual([
        'confirm',
        'unpost',
        'cancel',
        'delete',
      ]);
    });

    it('marks the cancel action as destructive', () => {
      const { result } = renderHookWithProviders(() =>
        useBulkDocumentActions('demands', ['demands']),
      );
      const cancelAction = result.current.bar.props.actions.find(
        (a: { key: string }) => a.key === 'cancel',
      );
      expect(cancelAction?.destructive).toBe(true);
    });

    it('marks the delete action as destructive', () => {
      const { result } = renderHookWithProviders(() =>
        useBulkDocumentActions('demands', ['demands']),
      );
      const deleteAction = result.current.bar.props.actions.find(
        (a: { key: string }) => a.key === 'delete',
      );
      expect(deleteAction?.destructive).toBe(true);
    });
  });

  describe('confirm-then-mutate flow', () => {
    it('delete action calls confirm and POSTs when accepted', async () => {
      const { result } = renderHookWithProviders(() =>
        useBulkDocumentActions('demands', ['demands']),
      );
      const deleteAction = result.current.bar.props.actions.find(
        (a: { key: string }) => a.key === 'delete',
      );
      await act(async () => {
        await deleteAction.onClick(['id-1', 'id-2']);
      });
      expect(confirmFn).toHaveBeenCalled();
      expect(confirmFn.mock.calls[0]?.[0]).toMatchObject({
        tone: 'destructive',
      });
      expect(mockedPost).toHaveBeenCalledWith('/demands/bulk-delete', {
        ids: ['id-1', 'id-2'],
      });
    });

    it('delete action skips POST when user cancels', async () => {
      confirmFn.mockResolvedValueOnce(false);
      const { result } = renderHookWithProviders(() =>
        useBulkDocumentActions('demands', ['demands']),
      );
      const deleteAction = result.current.bar.props.actions.find(
        (a: { key: string }) => a.key === 'delete',
      );
      await act(async () => {
        await deleteAction.onClick(['id-1']);
      });
      expect(confirmFn).toHaveBeenCalled();
      expect(mockedPost).not.toHaveBeenCalled();
    });

    it('transition action POSTs with the chosen target on confirm', async () => {
      const { result } = renderHookWithProviders(() =>
        useBulkDocumentActions('demands', ['demands']),
      );
      const postAction = result.current.bar.props.actions.find(
        (a: { key: string }) => a.key === 'post',
      );
      await act(async () => {
        await postAction.onClick(['id-1']);
      });
      await waitFor(() => {
        expect(mockedPost).toHaveBeenCalledWith('/demands/bulk-transition', {
          ids: ['id-1'],
          target: 'post',
        });
      });
    });

    it('cancel transition uses tone="destructive" in the confirm dialog', async () => {
      const { result } = renderHookWithProviders(() =>
        useBulkDocumentActions('demands', ['demands']),
      );
      const cancelAction = result.current.bar.props.actions.find(
        (a: { key: string }) => a.key === 'cancel',
      );
      await act(async () => {
        await cancelAction.onClick(['id-1']);
      });
      expect(confirmFn.mock.calls[0]?.[0]).toMatchObject({
        tone: 'destructive',
      });
    });

    it('post transition uses tone="default" (non-destructive)', async () => {
      const { result } = renderHookWithProviders(() =>
        useBulkDocumentActions('demands', ['demands']),
      );
      const postAction = result.current.bar.props.actions.find(
        (a: { key: string }) => a.key === 'post',
      );
      await act(async () => {
        await postAction.onClick(['id-1']);
      });
      expect(confirmFn.mock.calls[0]?.[0]).toMatchObject({
        tone: 'default',
      });
    });
  });

  describe('hasArchive option', () => {
    it('exposes archive + restore actions before delete when hasArchive=true', () => {
      const { result } = renderHookWithProviders(() =>
        useBulkDocumentActions('counterparties', ['counterparties'], {
          hasFSM: false,
          hasArchive: true,
        }),
      );
      expect(result.current.bar.props.actions.map((a: { key: string }) => a.key)).toEqual([
        'archive',
        'restore',
        'delete',
      ]);
    });

    it('archive action POSTs to /<entity>/bulk-archive on confirm', async () => {
      const { result } = renderHookWithProviders(() =>
        useBulkDocumentActions('counterparties', ['counterparties'], {
          hasFSM: false,
          hasArchive: true,
        }),
      );
      const archiveAction = result.current.bar.props.actions.find(
        (a: { key: string }) => a.key === 'archive',
      );
      await act(async () => {
        await archiveAction.onClick(['id-1', 'id-2']);
      });
      expect(mockedPost).toHaveBeenCalledWith('/counterparties/bulk-archive', {
        ids: ['id-1', 'id-2'],
      });
    });

    it('restore action POSTs to /<entity>/bulk-restore on confirm', async () => {
      const { result } = renderHookWithProviders(() =>
        useBulkDocumentActions('products', ['products'], {
          hasFSM: false,
          hasArchive: true,
        }),
      );
      const restoreAction = result.current.bar.props.actions.find(
        (a: { key: string }) => a.key === 'restore',
      );
      await act(async () => {
        await restoreAction.onClick(['id-9']);
      });
      expect(mockedPost).toHaveBeenCalledWith('/products/bulk-restore', { ids: ['id-9'] });
    });

    it('archive + restore use tone="default" in confirm (non-destructive)', async () => {
      const { result } = renderHookWithProviders(() =>
        useBulkDocumentActions('tasks', ['tasks'], { hasFSM: false, hasArchive: true }),
      );
      const archiveAction = result.current.bar.props.actions.find(
        (a: { key: string }) => a.key === 'archive',
      );
      const restoreAction = result.current.bar.props.actions.find(
        (a: { key: string }) => a.key === 'restore',
      );
      await act(async () => {
        await archiveAction.onClick(['id-1']);
      });
      expect(confirmFn.mock.calls.at(-1)?.[0]).toMatchObject({ tone: 'default' });
      await act(async () => {
        await restoreAction.onClick(['id-1']);
      });
      expect(confirmFn.mock.calls.at(-1)?.[0]).toMatchObject({ tone: 'default' });
    });

    it('archive action is skipped when user cancels confirm', async () => {
      confirmFn.mockResolvedValueOnce(false);
      const { result } = renderHookWithProviders(() =>
        useBulkDocumentActions('opportunities', ['opportunities'], {
          hasFSM: false,
          hasArchive: true,
        }),
      );
      const archiveAction = result.current.bar.props.actions.find(
        (a: { key: string }) => a.key === 'archive',
      );
      await act(async () => {
        await archiveAction.onClick(['id-1']);
      });
      expect(confirmFn).toHaveBeenCalled();
      expect(mockedPost).not.toHaveBeenCalled();
    });
  });

  describe('massEdit mutation', () => {
    it('POSTs to /<entity>/mass-edit with the patch payload', async () => {
      const { result } = renderHookWithProviders(() =>
        useBulkDocumentActions('customer-orders', ['customer-orders']),
      );
      await act(async () => {
        await result.current.massEdit.mutateAsync({
          ids: ['id-1', 'id-2'],
          ownerId: 'owner-1',
          description: 'note',
        });
      });
      expect(mockedPost).toHaveBeenCalledWith('/customer-orders/mass-edit', {
        ids: ['id-1', 'id-2'],
        ownerId: 'owner-1',
        description: 'note',
      });
    });

    it('passes explicit null through to clear a field', async () => {
      const { result } = renderHookWithProviders(() =>
        useBulkDocumentActions('demands', ['demands']),
      );
      await act(async () => {
        await result.current.massEdit.mutateAsync({ ids: ['id-1'], projectId: null });
      });
      expect(mockedPost).toHaveBeenCalledWith('/demands/mass-edit', {
        ids: ['id-1'],
        projectId: null,
      });
    });

    it('shows a mass-edit action button when onMassEditClick is provided', () => {
      const onMassEditClick = vi.fn();
      const { result } = renderHookWithProviders(() =>
        useBulkDocumentActions('demands', ['demands'], { onMassEditClick }),
      );
      const keys = result.current.bar.props.actions.map((a: { key: string }) => a.key);
      expect(keys).toContain('mass-edit');
    });

    it('mass-edit button forwards selected ids to onMassEditClick without confirm', async () => {
      const onMassEditClick = vi.fn();
      const { result } = renderHookWithProviders(() =>
        useBulkDocumentActions('demands', ['demands'], { onMassEditClick }),
      );
      const massEditAction = result.current.bar.props.actions.find(
        (a: { key: string }) => a.key === 'mass-edit',
      );
      await act(async () => {
        await massEditAction.onClick(['id-1', 'id-2']);
      });
      expect(onMassEditClick).toHaveBeenCalledWith(['id-1', 'id-2']);
      expect(confirmFn).not.toHaveBeenCalled();
      expect(mockedPost).not.toHaveBeenCalled();
    });

    it('omits the mass-edit button when onMassEditClick is not provided', () => {
      const { result } = renderHookWithProviders(() =>
        useBulkDocumentActions('demands', ['demands']),
      );
      const keys = result.current.bar.props.actions.map((a: { key: string }) => a.key);
      expect(keys).not.toContain('mass-edit');
    });
  });

  describe('hasBulkPrint option', () => {
    it('shows a print action button when hasBulkPrint=true', () => {
      const { result } = renderHookWithProviders(() =>
        useBulkDocumentActions('customer-orders', ['customer-orders'], { hasBulkPrint: true }),
      );
      const keys = result.current.bar.props.actions.map((a: { key: string }) => a.key);
      expect(keys).toContain('print');
    });

    it('omits the print button when hasBulkPrint is false (default)', () => {
      const { result } = renderHookWithProviders(() =>
        useBulkDocumentActions('demands', ['demands']),
      );
      const keys = result.current.bar.props.actions.map((a: { key: string }) => a.key);
      expect(keys).not.toContain('print');
    });

    it('print button forwards selected ids to api.postDownload without confirm', async () => {
      const { result } = renderHookWithProviders(() =>
        useBulkDocumentActions('customer-orders', ['customer-orders'], { hasBulkPrint: true }),
      );
      const printAction = result.current.bar.props.actions.find(
        (a: { key: string }) => a.key === 'print',
      );
      await act(async () => {
        await printAction.onClick(['id-1', 'id-2']);
      });
      expect(mockedPostDownload).toHaveBeenCalledTimes(1);
      const [path, body, filename] = mockedPostDownload.mock.calls[0]!;
      expect(path).toBe('/customer-orders/bulk-print');
      expect(body).toEqual({ ids: ['id-1', 'id-2'] });
      expect(filename).toMatch(/^customer-orders-2-.*\.pdf$/);
      expect(confirmFn).not.toHaveBeenCalled();
    });

    it('exposes the bulkPrint mutation directly for non-bar callsites', async () => {
      const { result } = renderHookWithProviders(() =>
        useBulkDocumentActions('customer-orders', ['customer-orders']),
      );
      await act(async () => {
        await result.current.bulkPrint.mutateAsync(['id-7']);
      });
      expect(mockedPostDownload).toHaveBeenCalledTimes(1);
      const [, body] = mockedPostDownload.mock.calls[0]!;
      expect(body).toEqual({ ids: ['id-7'] });
    });
  });
});
