'use client';

/**
 * «Задача» — the task DETAIL right slide-over (moysklad 1:1, live-grounded
 * 2026-07-07 from the #task detail panel). Opens over the document «Задачи» tab
 * when a task row is clicked, instead of navigating to a full page.
 *
 * Layout: a light-grey panel from the right — header («Задача» title + Ссылка /
 * Копировать / Удалить + × + «Изменения: date») then two columns of white cards:
 *   LEFT  — Описание задачи (inline-editable) · comment surface (disabled: the
 *           task-comment backend isn't built yet, so the box is read-only).
 *   RIGHT — Срок выполнения · Выполнена (toggle) · Тип задачи (coloured chip, ×
 *           removes) · Автор (read-only) · Исполнитель (picker) · Документ (the
 *           linked doc card, × unlinks).
 *
 * Every field edits live: PATCH /tasks/:id {version, …}. «Выполнена» uses the
 * status transition; «Копировать» POSTs a fresh task with the same fields;
 * «Удалить» DELETEs; «Ссылка» copies the task URL.
 */

import { useApiMutation } from '@/hooks/use-api-mutation';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { api } from '@/lib/api-client';
import {
  Avatar,
  Button,
  CatalogPicker,
  DatePicker,
  Icons,
  type PickerItem,
  Textarea,
  noAccidentalClose,
  useToast,
} from '@moysklad/ui';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface TaskState {
  id: string;
  name: string;
  color: string | null;
}
interface TaskDetail {
  id: string;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'done' | 'cancelled';
  done: boolean;
  dueAt: string | null;
  entity: string | null;
  entityId: string | null;
  stateId: string | null;
  version: number;
  updatedAt: string;
  author: { id: string; name: string } | null;
  assignee: { id: string; name: string } | null;
  state: TaskState | null;
}

/** entity (PascalCase model) → the list route + the document-type i18n key.
 *  Exported so the create modal can show the same «Документ» card. */
export const DOC_ROUTE: Record<string, { route: string; titleKey: string }> = {
  Demand: { route: 'demands', titleKey: 'demand' },
  PurchaseOrder: { route: 'purchase-orders', titleKey: 'purchase_order' },
  CustomerOrder: { route: 'customer-orders', titleKey: 'customer_order' },
  Supply: { route: 'supplies', titleKey: 'supply' },
  InvoiceIn: { route: 'invoices-in', titleKey: 'invoice_in' },
  InvoiceOut: { route: 'invoices-out', titleKey: 'invoice_out' },
  SalesReturn: { route: 'sales-returns', titleKey: 'sales_return' },
  PurchaseReturn: { route: 'purchase-returns', titleKey: 'purchase_return' },
  Move: { route: 'moves', titleKey: 'move' },
  Enter: { route: 'enters', titleKey: 'enter' },
  Loss: { route: 'losses', titleKey: 'loss' },
  Inventory: { route: 'inventories', titleKey: 'inventory' },
  PaymentIn: { route: 'payments-in', titleKey: 'payment_in' },
  PaymentOut: { route: 'payments-out', titleKey: 'payment_out' },
  CashIn: { route: 'cash-in', titleKey: 'cash_in' },
  CashOut: { route: 'cash-out', titleKey: 'cash_out' },
  Counterparty: { route: 'counterparties', titleKey: 'counterparty' },
};

export interface TaskDetailPanelProps {
  taskId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Query key to invalidate after any edit/delete (the caller's task list). */
  invalidateKey?: readonly unknown[];
}

export function TaskDetailPanel({
  taskId,
  open,
  onOpenChange,
  invalidateKey,
}: TaskDetailPanelProps) {
  const t = useTranslations('task_detail');
  const tc = useTranslations('task_create');
  const tCommon = useTranslations('common');
  const tTitles = useTranslations('detail_titles');
  const { toast } = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const { runDestructive } = useDestructiveMutation();

  const [descEditing, setDescEditing] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);

  const { data, isLoading } = useQuery<TaskDetail>({
    queryKey: ['task', taskId],
    queryFn: () => api.get<TaskDetail>(`/tasks/${taskId}`),
    enabled: open && !!taskId,
  });

  // Reset transient edit state whenever a different task opens.
  useEffect(() => {
    setDescEditing(false);
    setTypeMenuOpen(false);
  }, []);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['task', taskId] });
    qc.invalidateQueries({ queryKey: ['tasks'] });
    if (invalidateKey) qc.invalidateQueries({ queryKey: invalidateKey });
  };

  // «Тип задачи» options (task states).
  const { data: typeData } = useQuery<{ items: TaskState[] }>({
    queryKey: ['states', 'task'],
    queryFn: () => api.get('/states?entityType=task&archived=false&limit=200'),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const taskStates = typeData?.items ?? [];

  // Linked-document display name (moysklad shows «Заказ поставщику № 00980 …»).
  const docInfo = data?.entity ? DOC_ROUTE[data.entity] : undefined;
  const { data: docDoc } = useQuery<{ id: string; name: string; moment?: string }>({
    queryKey: ['task-linked-doc', data?.entity, data?.entityId],
    queryFn: () => api.get(`/${docInfo?.route}/${data?.entityId}`),
    enabled: open && !!docInfo && !!data?.entityId,
    staleTime: 60_000,
  });

  const patchMut = useApiMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      api.patch(`/tasks/${taskId}`, { version: data?.version, ...patch }),
    onSuccess: invalidate,
  });
  const transitionMut = useApiMutation({
    mutationFn: (status: string) => api.post(`/tasks/${taskId}/transition`, { status }),
    onSuccess: invalidate,
  });
  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/tasks/${taskId}`),
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
    },
  });
  const copyMut = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>('/tasks', {
        title: data?.title,
        description: data?.description ?? undefined,
        assigneeId: data?.assignee?.id ?? undefined,
        stateId: data?.stateId ?? undefined,
        entity: data?.entity ?? undefined,
        entityId: data?.entityId ?? undefined,
        status: 'open',
      }),
    onSuccess: () => {
      invalidate();
      toast.success(t('title'));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const employeeFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/employees?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((e) => ({ id: e.id, primary: e.name }));
  };

  const copyLink = () => {
    try {
      const url = `${window.location.origin}/tasks/${taskId}`;
      void navigator.clipboard?.writeText(url);
      toast.success(t('copied'));
    } catch {
      /* clipboard blocked — no-op */
    }
  };

  const linkText = '-mt-0.5 text-[var(--ms-text-brand)] text-sm hover:underline';
  const cardCls =
    'rounded-[var(--ms-radius-default)] bg-[var(--ms-bg-surface)] p-4 shadow-[var(--ms-shadow-sm)]';
  const labelCls = 'block text-[var(--ms-text-muted)] text-xs';
  const dueLabel = data?.dueAt
    ? new Date(data.dueAt).toLocaleDateString('ru-RU')
    : tc('due_unlimited');

  return (
    <>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay
            className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-[var(--ms-z-overlay)] bg-black/30 backdrop-blur-[1px] data-[state=closed]:animate-out data-[state=open]:animate-in"
            style={{ animationDuration: '150ms' }}
          />
          <Dialog.Content
            {...noAccidentalClose}
            data-testid="task-detail-panel"
            className="data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right fixed top-0 right-0 z-[var(--ms-z-modal)] flex h-screen w-[min(1040px,98vw)] max-w-[100vw] flex-col bg-[var(--ms-bg-app)] shadow-[var(--ms-shadow-lg)] focus:outline-none data-[state=closed]:animate-out data-[state=open]:animate-in"
            style={{ animationDuration: '200ms' }}
          >
            {/* Header — × + «Задача» + Ссылка/Копировать/Удалить + «Изменения». */}
            <header className="flex items-center gap-4 px-6 pt-5 pb-4">
              <Dialog.Close
                aria-label={tCommon('close')}
                className="shrink-0 rounded-full p-1 text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-muted)] hover:text-[var(--ms-text-primary)] focus-visible:outline-none"
                data-test-id="task-detail-close"
              >
                <Icons.close className="h-5 w-5" />
              </Dialog.Close>
              <Dialog.Title className="font-bold text-2xl text-[var(--ms-text-primary)]">
                {t('title')}
              </Dialog.Title>
              <button
                type="button"
                onClick={copyLink}
                className={linkText}
                data-test-id="task-detail-link"
              >
                {t('link')}
              </button>
              <button
                type="button"
                onClick={() => copyMut.mutate()}
                disabled={copyMut.isPending || !data}
                className={linkText}
                data-test-id="task-detail-copy"
              >
                {t('copy')}
              </button>
              <button
                type="button"
                onClick={() =>
                  data &&
                  runDestructive({
                    title: t('delete'),
                    run: () => deleteMut.mutateAsync(),
                    successMessage: t('deleted'),
                  })
                }
                className="-mt-0.5 text-[var(--ms-action-destructive)] text-sm hover:underline"
                data-test-id="task-detail-delete"
              >
                {t('delete')}
              </button>
              {data && (
                <span className="ml-auto text-[var(--ms-text-muted)] text-xs">
                  {t('changed')}: {new Date(data.updatedAt).toLocaleString('ru-RU')}
                </span>
              )}
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
              {isLoading || !data ? (
                <div className="py-10 text-center text-[var(--ms-text-muted)] text-sm">
                  {tCommon('loading')}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                  {/* LEFT — Описание + comments */}
                  <div className="space-y-4">
                    <div className={cardCls}>
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className="text-[var(--ms-text-primary)] text-sm">
                          {t('description')}
                        </span>
                        {!descEditing && (
                          <button
                            type="button"
                            onClick={() => {
                              setDescDraft(data.description ?? '');
                              setDescEditing(true);
                            }}
                            aria-label={tCommon('edit')}
                            className="text-[var(--ms-text-muted)] hover:text-[var(--ms-text-brand)]"
                            data-test-id="task-detail-desc-edit"
                          >
                            <Icons.edit className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {descEditing ? (
                        <div className="space-y-2">
                          <Textarea
                            value={descDraft}
                            onChange={(e) => setDescDraft(e.target.value)}
                            rows={4}
                            data-test-id="task-detail-desc-input"
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => {
                                patchMut.mutate({ description: descDraft.trim() || null });
                                setDescEditing(false);
                              }}
                              disabled={patchMut.isPending}
                            >
                              {tCommon('save')}
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setDescEditing(false)}
                            >
                              {tCommon('cancel')}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap text-[var(--ms-text-primary)] text-sm">
                          {data.description || '—'}
                        </p>
                      )}
                    </div>

                    {/* Comments — no backend yet, so the box is read-only (honest). */}
                    <div className={cardCls}>
                      <p className="pb-4 text-[var(--ms-text-muted)] text-sm">{t('no_comments')}</p>
                      <Textarea
                        value=""
                        readOnly
                        disabled
                        rows={3}
                        placeholder={t('comment_placeholder')}
                        data-test-id="task-detail-comment"
                      />
                      <p className="mt-1.5 text-[var(--ms-text-muted)] text-xs">
                        {t('comments_soon')}
                      </p>
                    </div>
                  </div>

                  {/* RIGHT — Срок / Выполнена / Тип / Автор / Исполнитель / Документ */}
                  <div className="space-y-4">
                    <div className={cardCls}>
                      <span className={labelCls}>{tc('due')}</span>
                      <div className="mt-1">
                        {/* moysklad «Срок»: own calendar popover, not the browser's native
                            date widget — the DS DatePicker drives a custom trigger so the
                            empty-state text stays ours. */}
                        <DatePicker
                          value={data.dueAt ? data.dueAt.slice(0, 10) : null}
                          onChange={(next) => patchMut.mutate({ dueAt: next })}
                          clearable
                          ariaLabel={tc('due')}
                          trigger={
                            <button
                              type="button"
                              aria-label={tc('due')}
                              data-test-id="task-detail-due"
                              className="flex w-full items-center gap-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] px-3 py-2 text-left text-sm"
                            >
                              <Icons.calendar className="h-4 w-4 shrink-0 text-[var(--ms-text-muted)]" />
                              <span className={data.dueAt ? '' : 'text-[var(--ms-text-muted)]'}>
                                {dueLabel}
                              </span>
                            </button>
                          }
                        />
                      </div>
                    </div>

                    <div className={cardCls}>
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={data.done}
                          onClick={() => transitionMut.mutate(data.done ? 'open' : 'done')}
                          disabled={transitionMut.isPending}
                          data-test-id="task-detail-done"
                          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${data.done ? 'bg-[var(--ms-brand-500)]' : 'bg-[var(--ms-border-strong)]'}`}
                        >
                          <span
                            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${data.done ? 'left-[18px]' : 'left-0.5'}`}
                          />
                        </button>
                        <span className="text-[var(--ms-text-primary)] text-sm">{tc('done')}</span>
                      </div>
                    </div>

                    <div className={cardCls}>
                      <span className={labelCls}>{tc('type')}</span>
                      <div className="relative mt-1">
                        {data.state ? (
                          <span className="inline-flex items-center gap-2 rounded-full bg-[var(--ms-bg-muted)] py-1 pr-1.5 pl-2.5 text-sm">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: data.state.color ?? '#9ca3af' }}
                            />
                            {data.state.name}
                            <button
                              type="button"
                              onClick={() => patchMut.mutate({ stateId: null })}
                              aria-label={tCommon('delete')}
                              className="rounded-full p-0.5 text-[var(--ms-text-muted)] hover:text-[var(--ms-text-destructive)]"
                              data-test-id="task-detail-type-clear"
                            >
                              <Icons.close className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setTypeMenuOpen((v) => !v)}
                            className="flex w-full items-center justify-between rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] px-3 py-2 text-left text-sm text-[var(--ms-text-muted)] hover:border-[var(--ms-border-strong)]"
                            data-test-id="task-detail-type"
                          >
                            {tc('type_placeholder')}
                            <Icons.down className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {typeMenuOpen && !data.state && (
                          <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] py-1 shadow-[var(--ms-shadow-md)]">
                            {taskStates.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => {
                                  patchMut.mutate({ stateId: s.id });
                                  setTypeMenuOpen(false);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--ms-bg-muted)]"
                              >
                                <span
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{ backgroundColor: s.color ?? '#9ca3af' }}
                                />
                                {s.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className={cardCls}>
                      <span className={labelCls}>{t('author')}</span>
                      <div className="mt-1.5 flex items-center gap-2">
                        <Avatar name={data.author?.name ?? '—'} size="sm" />
                        <span className="text-[var(--ms-text-primary)] text-sm">
                          {data.author?.name ?? '—'}
                        </span>
                      </div>
                    </div>

                    <div className={cardCls}>
                      <span className={labelCls}>{tc('assignee')}</span>
                      <button
                        type="button"
                        onClick={() => setAssigneePickerOpen(true)}
                        className="mt-1.5 flex w-full items-center gap-2 text-left"
                        data-test-id="task-detail-assignee"
                      >
                        <Avatar name={data.assignee?.name ?? '—'} size="sm" />
                        <span className="flex-1 text-[var(--ms-text-primary)] text-sm">
                          {data.assignee?.name ?? '—'}
                        </span>
                        <Icons.edit className="h-3.5 w-3.5 text-[var(--ms-text-muted)]" />
                      </button>
                    </div>

                    {data.entity && (
                      <div className={cardCls}>
                        <span className={labelCls}>{t('doc')}</span>
                        <div className="mt-1.5 flex items-start gap-2 rounded-[var(--ms-radius-default)] bg-[var(--ms-bg-muted)] p-3">
                          <Icons.file className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ms-text-muted)]" />
                          <div className="min-w-0 flex-1">
                            <div className="text-[var(--ms-text-muted)] text-xs">
                              {docInfo ? tTitles(docInfo.titleKey as 'demand') : data.entity}
                            </div>
                            {docInfo ? (
                              <button
                                type="button"
                                onClick={() => {
                                  onOpenChange(false);
                                  router.push(`/${docInfo.route}/${data.entityId}`);
                                }}
                                className="text-[var(--ms-text-brand)] text-sm hover:underline"
                                data-test-id="task-detail-doc-open"
                              >
                                {docDoc?.name ? `№ ${docDoc.name}` : t('open')}
                              </button>
                            ) : (
                              <span className="text-[var(--ms-text-primary)] text-sm">
                                {data.entityId}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => patchMut.mutate({ entity: null, entityId: null })}
                            aria-label={tCommon('delete')}
                            className="shrink-0 rounded p-0.5 text-[var(--ms-text-muted)] hover:text-[var(--ms-text-destructive)]"
                            data-test-id="task-detail-doc-unlink"
                          >
                            <Icons.close className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <CatalogPicker
        open={assigneePickerOpen}
        onClose={() => setAssigneePickerOpen(false)}
        title={tc('assignee')}
        fetcher={employeeFetcher}
        onSelect={(item) => patchMut.mutate({ assigneeId: item.id })}
      />
    </>
  );
}
