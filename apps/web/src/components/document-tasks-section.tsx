'use client';

/**
 * Inline «Задачи» collapsible — moysklad parity for every document
 * detail page.
 *
 * Etalon: docs/moysklad-reference/visual-captures/03-module/<doc>/
 * screenshots/d-default.png — bottom-left:
 *
 *   ▼ Задачи        [+ Задача]
 *   ─────────────────────────
 *   Нет задач       (empty state)
 *
 * "+ Задача" opens a modal — NO navigation — matching moysklad
 * («Создание задачи»). Tasks link via Task.entity + Task.entityId
 * (polymorphic; server enforces TASK_ENTITY_WHITELIST).
 *
 * Generic — works on every document type (PurchaseOrder, CustomerOrder,
 * InvoiceOut, CashIn, …). Originally lived in components/customer-orders/
 * tasks-section.tsx; promoted here as the shared shell.
 */

import { api } from '@/lib/api-client';
import { Button, Checkbox, Icons, formatDate } from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { TaskCreateModal } from './task-create-modal';

interface TaskRow {
  id: string;
  title: string;
  done: boolean;
  dueAt: string | null;
  assignee: { id: string; name: string } | null;
}

interface TaskListResponse {
  items: TaskRow[];
  total: number;
}

export interface DocumentTasksSectionProps {
  /** Polymorphic entity name (TASK_ENTITY_WHITELIST member). */
  entity: string;
  entityId: string;
}

export function DocumentTasksSection({ entity, entityId }: DocumentTasksSectionProps) {
  const t = useTranslations('detail_tabs');
  const [open, setOpen] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const qc = useQueryClient();

  const queryKey = ['tasks', entity, entityId] as const;
  const { data } = useQuery<TaskListResponse>({
    queryKey,
    queryFn: () =>
      api.get<TaskListResponse>(
        `/tasks?entity=${encodeURIComponent(entity)}&entityId=${encodeURIComponent(entityId)}`,
      ),
  });

  const items = data?.items ?? [];

  return (
    <section
      className="border-[var(--ms-border-default)] border-t pt-3"
      data-test-id="tasks-section"
    >
      <header className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 font-semibold text-[var(--ms-text-primary)] text-sm hover:text-[var(--ms-text-brand)]"
          data-test-id="tasks-section-toggle"
          aria-expanded={open}
        >
          {open ? <Icons.down className="h-4 w-4" /> : <Icons.right className="h-4 w-4" />}
          {t('tasks')}{' '}
          {items.length > 0 && (
            <span className="text-[var(--ms-text-muted)] text-xs">({items.length})</span>
          )}
        </button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setModalOpen(true)}
          data-test-id="tasks-section-add"
        >
          <Icons.create className="h-4 w-4" />
          {t('add_task')}
        </Button>
      </header>

      {open && (
        <div className="mt-2">
          {items.length === 0 ? (
            <p className="text-[var(--ms-text-muted)] text-sm" data-test-id="tasks-section-empty">
              {t('no_tasks')}
            </p>
          ) : (
            <ul className="divide-y divide-[var(--ms-border-default)]">
              {items.map((task) => (
                <li
                  key={task.id}
                  className="flex items-center gap-3 py-2 text-sm"
                  data-test-id={`tasks-section-item-${task.id}`}
                >
                  <Checkbox
                    checked={task.done}
                    onCheckedChange={async (v) => {
                      await api.patch(`/tasks/${task.id}`, {
                        status: v === true ? 'done' : 'open',
                      });
                      qc.invalidateQueries({ queryKey });
                    }}
                  />
                  <Link
                    href={`/tasks/${task.id}`}
                    className={
                      task.done
                        ? 'flex-1 text-[var(--ms-text-muted)] line-through'
                        : 'flex-1 text-[var(--ms-text-primary)] hover:underline'
                    }
                  >
                    {task.title}
                  </Link>
                  {task.dueAt && (
                    <span className="text-[var(--ms-text-muted)] text-xs tabular-nums">
                      {formatDate(task.dueAt)}
                    </span>
                  )}
                  {task.assignee && (
                    <span className="text-[var(--ms-text-muted)] text-xs">
                      {task.assignee.name}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <TaskCreateModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        entity={entity}
        entityId={entityId}
        invalidateKey={queryKey}
      />
    </section>
  );
}
