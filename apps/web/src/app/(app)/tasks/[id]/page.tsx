'use client';

import { AttachmentsSection } from '@/components/attachments-section';
import { DocumentTabs } from '@/components/document-tabs';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { api } from '@/lib/api-client';
import { taskStatusTone } from '@/lib/domain-status-tone';
import { Badge, Button, DetailView, FormSection, Icons, InfoGrid } from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';

type TaskStatus = 'open' | 'in_progress' | 'done' | 'cancelled';
type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

interface TaskDetail {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  completedAt: string | null;
  entity: string | null;
  entityId: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string; email: string } | null;
  assignee: { id: string; name: string; email: string } | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateOnly(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export default function TaskDetailPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const t = useTranslations('pages.tasks');
  const tCommon = useTranslations('common');

  const { data, isLoading } = useQuery<TaskDetail>({
    queryKey: ['task', id],
    queryFn: () => api.get<TaskDetail>(`/tasks/${id}`),
    enabled: !!id,
  });

  const transitionMut = useApiMutation({
    mutationFn: (status: TaskStatus) => api.post<TaskDetail>(`/tasks/${id}/transition`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', id] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const archiveMut = useApiMutation({
    mutationFn: (archive: boolean) =>
      api.post<unknown>(`/tasks/${id}/${archive ? 'archive' : 'restore'}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', id] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete<unknown>(`/tasks/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      router.push('/tasks');
    },
  });

  const { runDestructive } = useDestructiveMutation();

  if (isLoading) {
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  }
  if (!data) {
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('not_found')}</div>;
  }

  const isTerminal = data.status === 'done' || data.status === 'cancelled';
  const isOverdue =
    data.status === 'open' && data.dueAt != null && new Date(data.dueAt) < new Date();

  return (
    <DetailView
      testId="task-detail-page"
      title={data.title}
      breadcrumbs={[{ label: t('title'), href: '/tasks' }, { label: data.title }]}
      status={
        data.archived ? (
          <Badge tone="neutral">{tCommon('archived')}</Badge>
        ) : (
          <Badge tone={taskStatusTone(data.status)}>{t(`statuses.${data.status}`)}</Badge>
        )
      }
      actions={
        <>
          {!data.archived && !isTerminal && (
            <>
              {data.status === 'open' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => transitionMut.mutate('in_progress')}
                  disabled={transitionMut.isPending}
                  data-test-id="action-in-progress"
                >
                  {t('actions.mark_in_progress')}
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={() => transitionMut.mutate('done')}
                disabled={transitionMut.isPending}
                data-test-id="action-done"
              >
                {t('actions.mark_done')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => transitionMut.mutate('cancelled')}
                disabled={transitionMut.isPending}
                data-test-id="action-cancel"
              >
                {t('actions.cancel')}
              </Button>
            </>
          )}
          {!data.archived && isTerminal && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => transitionMut.mutate('open')}
              disabled={transitionMut.isPending}
              data-test-id="action-reopen"
            >
              {t('actions.reopen')}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push(`/tasks/new?taskId=${data.id}`)}
            data-test-id="edit-button"
          >
            <Icons.edit className="h-4 w-4" />
            {tCommon('edit')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => archiveMut.mutate(!data.archived)}
            loading={archiveMut.isPending}
            data-test-id={data.archived ? 'restore-button' : 'archive-button'}
          >
            <Icons.archive className="h-4 w-4" />
            {data.archived ? tCommon('restore') : tCommon('archive')}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() =>
              runDestructive({
                title: tCommon('delete_confirm', { name: data.title }),
                run: () => deleteMut.mutateAsync(),
              })
            }
            loading={deleteMut.isPending}
            data-test-id="delete-button"
          >
            <Icons.delete className="h-4 w-4" />
            {tCommon('delete')}
          </Button>
        </>
      }
    >
      <FormSection title={t('fields.title')}>
        <InfoGrid
          columns={2}
          items={[
            {
              label: t('fields.status'),
              value: (
                <Badge tone={taskStatusTone(data.status)}>{t(`statuses.${data.status}`)}</Badge>
              ),
            },
            {
              label: t('fields.priority'),
              value: (
                <span
                  className={
                    data.priority === 'urgent'
                      ? 'font-semibold text-[var(--ms-text-destructive)]'
                      : data.priority === 'high'
                        ? 'font-semibold text-[var(--ms-text-warning)]'
                        : data.priority === 'low'
                          ? 'text-[var(--ms-text-muted)]'
                          : ''
                  }
                >
                  {t(`priorities.${data.priority}`)}
                </span>
              ),
            },
            {
              label: t('fields.assignee'),
              value: data.assignee?.name ?? '—',
            },
            {
              label: t('fields.author'),
              value: data.author?.name ?? '—',
            },
            {
              label: t('fields.due_at'),
              value: (
                <span className={isOverdue ? 'font-medium text-[var(--ms-text-destructive)]' : ''}>
                  {formatDateOnly(data.dueAt)}
                </span>
              ),
            },
            {
              label: t('fields.completed_at'),
              value: formatDate(data.completedAt),
            },
          ]}
        />
      </FormSection>

      {data.description && (
        <FormSection title={t('fields.description')}>
          <p className="whitespace-pre-wrap text-sm">{data.description}</p>
        </FormSection>
      )}

      {data.entity && data.entityId && (
        <FormSection title={t('fields.linked_entity')}>
          <InfoGrid
            columns={2}
            items={[
              { label: t('fields.linked_entity'), value: data.entity },
              { label: 'ID', value: data.entityId },
            ]}
          />
        </FormSection>
      )}

      <AttachmentsSection entity="Task" entityId={data.id} />

      <DocumentTabs auditEntity="Task" entityId={data.id} relatedGroups={[]} />

      <FormSection title={tCommon('meta')}>
        <InfoGrid
          columns={3}
          items={[
            { label: tCommon('created'), value: formatDate(data.createdAt) },
            { label: tCommon('updated'), value: formatDate(data.updatedAt) },
            { label: tCommon('owner'), value: data.author?.name ?? '—' },
          ]}
        />
      </FormSection>
    </DetailView>
  );
}
