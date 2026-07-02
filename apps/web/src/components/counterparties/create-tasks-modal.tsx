'use client';

/**
 * Counterparty list «Создать задачи» — bulk task-create drawer (moysklad parity,
 * live-captured 2026-06-18 on farrux@climart_santex_group). Selecting rows and
 * clicking «Создать задачи» opens a form whose parameters apply to EVERY created
 * task — one task per selected counterparty, each linked to and assigned to that
 * counterparty's owner («Владелец-сотрудник»).
 *
 * Fields (grounded): Описание задач* · Срок выполнения · Тип задач · Исполнитель
 * (=Владелец-сотрудник, owner mode). Mirrors the single-task TaskCreateModal but
 * fans out to the selection via POST /counterparties/bulk-create-tasks.
 */

import { api } from '@/lib/api-client';
import { Button, Input, Modal, NativeSelect, Textarea } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/** A task `state` row (moysklad's «Тип задачи» = State, entityType="task"). */
interface TaskStateRow {
  id: string;
  name: string;
  color: string | null;
}

export interface CounterpartyCreateTasksModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Selected counterparty ids — one task is created per id. */
  ids: string[];
  /** Invalidate this query key + clear the selection after a successful create. */
  invalidateKey?: readonly unknown[];
  onCreated?: () => void;
}

export function CounterpartyCreateTasksModal({
  open,
  onOpenChange,
  ids,
  invalidateKey,
  onCreated,
}: CounterpartyCreateTasksModalProps) {
  const t = useTranslations('pages.counterparties');
  const tTask = useTranslations('task_create');
  const qc = useQueryClient();
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [stateId, setStateId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const count = ids.length;

  // moysklad «Тип задач» = the task's `state` (State rows, entityType="task").
  const { data: typeData } = useQuery<{ items: TaskStateRow[] }>({
    queryKey: ['states', 'task'],
    queryFn: () =>
      api.get<{ items: TaskStateRow[] }>('/states?entityType=task&archived=false&limit=200'),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const taskStates = typeData?.items ?? [];

  const reset = () => {
    setDescription('');
    setDueAt('');
    setStateId('');
    setError(null);
  };

  const createMut = useMutation({
    mutationFn: () =>
      api.post<{ created: number }>('/counterparties/bulk-create-tasks', {
        ids,
        description: description.trim(),
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        stateId: stateId || null,
      }),
    onSuccess: () => {
      if (invalidateKey) qc.invalidateQueries({ queryKey: invalidateKey });
      reset();
      onCreated?.();
      onOpenChange(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  const submit = () => {
    setError(null);
    if (!description.trim()) {
      setError(t('create_tasks_description_required'));
      return;
    }
    createMut.mutate();
  };

  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
      title={`${t('create_tasks_title')} (${count})`}
      widthClass="w-[560px]"
      testId="counterparty-create-tasks-modal"
      footer={
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
            data-test-id="counterparty-create-tasks-cancel"
          >
            {tTask('cancel')}
          </Button>
          <Button
            onClick={submit}
            disabled={createMut.isPending || count === 0}
            data-test-id="counterparty-create-tasks-submit"
          >
            {t('create_tasks_submit')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[var(--ms-text-muted)] text-sm">{t('create_tasks_hint')}</p>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="cp-tasks-desc"
            className="font-medium text-[var(--ms-text-primary)] text-sm"
          >
            {t('create_tasks_description_label')}
            <span className="ml-1 text-[var(--ms-text-destructive)]">*</span>
          </label>
          <Textarea
            id="cp-tasks-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('create_tasks_description_placeholder')}
            rows={5}
            data-test-id="counterparty-create-tasks-description"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="cp-tasks-due"
            className="font-medium text-[var(--ms-text-primary)] text-sm"
          >
            {tTask('due')}
          </label>
          <Input
            id="cp-tasks-due"
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            placeholder={tTask('due_unlimited')}
            data-test-id="counterparty-create-tasks-due"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="cp-tasks-type"
            className="font-medium text-[var(--ms-text-primary)] text-sm"
          >
            {t('create_tasks_type_label')}
          </label>
          <NativeSelect
            id="cp-tasks-type"
            value={stateId}
            onChange={(e) => setStateId(e.target.value)}
            data-test-id="counterparty-create-tasks-type"
          >
            <option value="">{t('create_tasks_type_placeholder')}</option>
            {taskStates.map((tt) => (
              <option key={tt.id} value={tt.id}>
                {tt.name}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="flex flex-col gap-1">
          <span className="font-medium text-[var(--ms-text-primary)] text-sm">
            {tTask('assignee')}
          </span>
          {/* moysklad default «Владелец-сотрудник» — each task is assigned to its
              own counterparty's owner; resolved per-row on the server. */}
          <div className="rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)] px-3 py-1.5 text-sm">
            {t('create_tasks_assignee_owner')}
          </div>
          <span className="text-[var(--ms-text-muted)] text-xs">
            {t('create_tasks_assignee_hint')}
          </span>
        </div>

        {error && (
          <div
            className="text-[var(--ms-text-destructive)] text-sm"
            data-test-id="counterparty-create-tasks-error"
          >
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
