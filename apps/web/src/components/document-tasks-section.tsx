'use client';

/**
 * Document «Задачи» tab — moysklad 1:1 (2026-07-08). moysklad shows a LEFT-aligned
 * coloured «⊕ Задача» button (blue circle-plus), then a task TABLE (done-circle ·
 * title · coloured status pill · assignee avatar+name), then a pager. NO right-aligned
 * button, NO «▼ Задачи» collapsible header.
 *
 *   ⊕ Задача
 *   ──────────────────────────────────────────
 *   ○  test uchun          ● Текшириш   👤 Сардор Х.
 *   1 - 1 из 1
 *
 * «⊕ Задача» opens the create modal — NO navigation. On an unsaved doc the parent
 * passes `ensurePersisted` (moysklad silently saves the draft first so the task can
 * link); the modal then opens in place — no full-page reload, the button never moves.
 * Creating a task opens its detail slide-over (moysklad). Tasks link via
 * Task.entity + Task.entityId (polymorphic; server enforces TASK_ENTITY_WHITELIST).
 *
 * Generic — used on every document detail page AND the /new create forms.
 */

import { api } from '@/lib/api-client';
import { Avatar, Icons } from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { TaskCreateModal } from './task-create-modal';
import { TaskDetailPanel } from './task-detail-panel';

interface TaskRow {
  id: string;
  title: string;
  done: boolean;
  status: string;
  dueAt: string | null;
  assignee: { id: string; name: string } | null;
  state: { id: string; name: string; color: string | null } | null;
}

interface TaskListResponse {
  items: TaskRow[];
  total: number;
}

export interface DocumentTasksSectionProps {
  /** Polymorphic entity name (TASK_ENTITY_WHITELIST member). */
  entity: string;
  /** Persisted doc id, or '' on an unsaved /new form. */
  entityId: string;
  /**
   * On an unsaved doc (empty entityId), «⊕ Задача» calls this to persist the draft
   * first (moysklad silently saves so the task can attach). Returns the new id, or
   * null when it couldn't save (e.g. a required «Контрагент» is missing — the page
   * flags the field itself). When omitted, «⊕ Задача» is disabled on an unsaved doc.
   */
  ensurePersisted?: () => Promise<string | null>;
}

export function DocumentTasksSection({
  entity,
  entityId,
  ensurePersisted,
}: DocumentTasksSectionProps) {
  const t = useTranslations('detail_tabs');
  const tForm = useTranslations('form');
  const tc = useTranslations('task_create');
  const [modalOpen, setModalOpen] = useState(false);
  // Clicking a task opens the moysklad detail slide-over (not a page nav).
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  // «⊕ Задача» on an unsaved doc: persist first, then open the modal once the new
  // id has propagated (parent re-renders with entityId). This flag bridges the gap.
  const [pendingOpen, setPendingOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  // moysklad silently saves a /new doc on «⊕ Задача», lands on the saved doc, and the
  // create modal is already open. The /new page navigates here with `?task=new`; we
  // auto-open the modal once, then strip the flag so a refresh doesn't re-open it.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const autoOpenHandled = useRef(false);

  const queryKey = ['tasks', entity, entityId] as const;
  const { data } = useQuery<TaskListResponse>({
    queryKey,
    queryFn: () =>
      api.get<TaskListResponse>(
        `/tasks?entity=${encodeURIComponent(entity)}&entityId=${encodeURIComponent(entityId)}`,
      ),
    enabled: !!entityId,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? items.length;

  // Once the draft is persisted (entityId arrives), open the create modal in place.
  useEffect(() => {
    if (pendingOpen && entityId) {
      setModalOpen(true);
      setPendingOpen(false);
    }
  }, [pendingOpen, entityId]);

  // «?task=new» arrival (from a /new form's «⊕ Задача») → open the create modal once.
  useEffect(() => {
    if (autoOpenHandled.current || !entityId) return;
    if (searchParams.get('task') === 'new') {
      autoOpenHandled.current = true;
      setModalOpen(true);
      router.replace(pathname, { scroll: false });
    }
  }, [entityId, searchParams, router, pathname]);

  const onAdd = async () => {
    if (entityId) {
      setModalOpen(true);
      return;
    }
    if (!ensurePersisted) return;
    setSaving(true);
    try {
      const id = await ensurePersisted();
      if (id) setPendingOpen(true); // effect opens the modal when entityId updates
    } finally {
      setSaving(false);
    }
  };

  const toggleDone = async (task: TaskRow) => {
    await api.post(`/tasks/${task.id}/transition`, { status: task.done ? 'open' : 'done' });
    qc.invalidateQueries({ queryKey });
  };

  return (
    <div className="bg-[var(--ms-bg-surface)] px-4 py-3" data-test-id="tasks-section">
      {/* «⊕ Задача» — LEFT, coloured circle-plus (moysklad). */}
      <button
        type="button"
        onClick={onAdd}
        disabled={saving}
        className="inline-flex items-center gap-1.5 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-3 py-1.5 text-[var(--ms-text-primary)] text-sm hover:bg-[var(--ms-bg-hover)] disabled:opacity-50"
        data-test-id="tasks-section-add"
      >
        <Icons.createCircle className="h-4 w-4 text-[var(--ms-text-brand)]" />
        {tForm('add_task')}
      </button>

      {items.length > 0 && (
        <>
          <ul
            className="mt-3 border-[var(--ms-border-default)] border-t"
            data-test-id="tasks-section-list"
          >
            {items.map((task) => (
              <li
                key={task.id}
                className="flex items-center gap-3 border-[var(--ms-border-default)] border-b px-1 py-2.5 text-sm hover:bg-[var(--ms-bg-hover)]"
                data-test-id={`tasks-section-item-${task.id}`}
              >
                {/* done-circle (moysklad) — click completes / reopens */}
                <button
                  type="button"
                  onClick={() => toggleDone(task)}
                  aria-label={tc('done')}
                  aria-pressed={task.done}
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    task.done
                      ? 'border-[var(--ms-brand-500)] bg-[var(--ms-brand-500)] text-white'
                      : 'border-[var(--ms-border-strong)] text-transparent hover:border-[var(--ms-brand-500)]'
                  }`}
                  data-test-id={`tasks-section-toggle-${task.id}`}
                >
                  <Icons.check className="h-2.5 w-2.5" />
                </button>
                {/* title */}
                <button
                  type="button"
                  onClick={() => setDetailTaskId(task.id)}
                  className={
                    task.done
                      ? 'min-w-0 flex-1 truncate text-left text-[var(--ms-text-muted)] line-through'
                      : 'min-w-0 flex-1 truncate text-left text-[var(--ms-text-primary)] hover:text-[var(--ms-text-brand)]'
                  }
                  data-test-id={`tasks-section-open-${task.id}`}
                >
                  {task.title}
                </button>
                {/* status pill — state dot + name (moysklad) */}
                {task.state && (
                  <span className="flex w-[200px] shrink-0 items-center gap-1.5 text-[var(--ms-text-primary)]">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: task.state.color ?? '#9ca3af' }}
                      aria-hidden
                    />
                    <span className="truncate">{task.state.name}</span>
                  </span>
                )}
                {/* assignee — avatar + name (moysklad) */}
                {task.assignee && (
                  <span className="flex w-[200px] shrink-0 items-center gap-2 text-[var(--ms-text-primary)]">
                    <Avatar name={task.assignee.name} size="sm" />
                    <span className="truncate">{task.assignee.name}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {/* pager (moysklad «1 - N из total»). */}
          <div
            className="mt-2 text-[var(--ms-text-muted)] text-xs"
            data-test-id="tasks-section-pager"
          >
            {t('tasks_range', { from: 1, to: items.length, total })}
          </div>
        </>
      )}

      <TaskCreateModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        entity={entity}
        entityId={entityId}
        invalidateKey={queryKey}
        onCreated={(id) => {
          setModalOpen(false);
          setDetailTaskId(id);
        }}
      />
      <TaskDetailPanel
        taskId={detailTaskId}
        open={detailTaskId !== null}
        onOpenChange={(o) => {
          if (!o) setDetailTaskId(null);
        }}
        invalidateKey={queryKey}
      />
    </div>
  );
}
