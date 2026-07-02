'use client';

import { DetailHeader, DetailToolbar } from '@/components/document-detail';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { api } from '@/lib/api-client';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import {
  CatalogPicker,
  CatalogPickerField,
  FormField,
  FormSection,
  Input,
  NativeSelect,
  type PickerItem,
  Textarea,
} from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const SELECT_CLASS =
  'w-full h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)]';

const TEXTAREA_CLASS =
  'w-full min-h-[96px] px-3 py-2 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] hover:border-[var(--ms-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 placeholder:text-[var(--ms-text-placeholder)]';

type TaskStatus = 'open' | 'in_progress' | 'done' | 'cancelled';
type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

const STATUSES: TaskStatus[] = ['open', 'in_progress', 'done', 'cancelled'];
const PRIORITIES: TaskPriority[] = ['low', 'normal', 'high', 'urgent'];

interface EmployeeRef {
  id: string;
  name: string;
  email: string;
}

interface TaskDetail {
  id: string;
  version: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  assignee: { id: string; name: string } | null;
}

export default function NewTaskPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('pages.tasks');
  const tCommon = useTranslations('common');
  const tForm = useTranslations('form');

  // Pre-fill from query params when navigated from a document page
  const prefillAssigneeId = searchParams.get('assigneeId');
  // Edit mode: the detail page's Edit button routes here with ?taskId=<id>.
  // Without this, the page POSTed a brand-new task → silent DUPLICATE on edit.
  const editId = searchParams.get('taskId');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState<string | null>(prefillAssigneeId);
  const [assigneeLabel, setAssigneeLabel] = useState('');
  const [status, setStatus] = useState<TaskStatus>('open');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [dueAt, setDueAt] = useState('');
  const [pickerAssignee, setPickerAssignee] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit mode: load the existing task and seed the form.
  const { data: editTask } = useQuery<TaskDetail>({
    queryKey: ['task', editId],
    queryFn: () => api.get<TaskDetail>(`/tasks/${editId}`),
    enabled: !!editId,
  });
  useEffect(() => {
    if (!editTask) return;
    setTitle(editTask.title);
    setDescription(editTask.description ?? '');
    setStatus(editTask.status);
    setPriority(editTask.priority);
    setDueAt(editTask.dueAt ? editTask.dueAt.slice(0, 10) : '');
    setAssigneeId(editTask.assignee?.id ?? null);
    setAssigneeLabel(editTask.assignee?.name ?? '');
  }, [editTask]);

  // Optimistic-lock conflict (409 OPTIMISTIC_LOCK): re-seed the form from the
  // now-fresh task. The seed effect above re-runs on every new `editTask`
  // reference, so invalidating the query is enough — no explicit reset needed.
  const onConflict = useConflictReload(['task', editId]);

  const employeeFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: EmployeeRef[] }>(
      `/employees?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((e) => ({
      id: e.id,
      primary: e.name,
      secondary: e.email,
    }));
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error(tCommon('field_required', { field: t('fields.title') }));
      const body: Record<string, unknown> = {
        title: title.trim(),
        status,
        priority,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(assigneeId ? { assigneeId } : {}),
        ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}),
      };
      // Edit (taskId present) → PATCH the existing task; otherwise create.
      // The PATCH body carries the optimistic-lock token — the version this
      // form loaded (from the server query `editTask`, NOT form state). The
      // create branch never sends version.
      return editId
        ? api.patch<{ id: string }>(`/tasks/${editId}`, {
            ...body,
            version: editTask?.version,
          })
        : api.post<{ id: string }>('/tasks', body);
    },
    onSuccess: (saved) => router.push(`/tasks/${editId ?? saved.id}`),
    onError: (e: Error) => {
      // A real optimistic-lock conflict → reload dialog; suppress the error
      // banner (it would race the dialog). Any other error → normal banner.
      if (isOptimisticConflict(e)) {
        onConflict();
        return;
      }
      setError(e.message);
    },
  });

  const handleSave = () => {
    setError(null);
    saveMut.mutate();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="task-new-page"
    >
      <DetailToolbar
        isDirty={!!(title || description)}
        isSaving={saveMut.isPending}
        onSave={handleSave}
        onClose={() => router.push('/tasks')}
        createMenuItems={[]}
      />
      <DetailHeader
        titlePrefix={t('title')}
        name=""
        moment={new Date().toISOString()}
        stateLabel={editId ? t(`statuses.${status}`) : tCommon('new_state')}
        stateTone="neutral"
        stateSlug="new"
        applicable={false}
        hideApplicable
        customTitle={editId ? title || t('edit_title') : t('new_title')}
      />
      {error && (
        <div className="border-[var(--ms-destructive-100)] border-b bg-[var(--ms-destructive-50)] px-4 py-2 text-[var(--ms-text-destructive)] text-sm">
          {error}
        </div>
      )}
      <main className="flex-1 px-4 py-4">
        <div className="space-y-4">
          <FormSection title={tForm('section_main')}>
            <FormField id="title" label={t('fields.title')} required>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('fields.title')}
                data-test-id="field-title"
              />
            </FormField>

            <FormField id="description" label={t('fields.description')}>
              <Textarea
                id="description"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={tCommon('description')}
                className={TEXTAREA_CLASS}
                data-test-id="field-description"
              />
            </FormField>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField id="status" label={t('fields.status')}>
                <NativeSelect
                  id="status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TaskStatus)}
                  className={SELECT_CLASS}
                  data-test-id="field-status"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`statuses.${s}`)}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>

              <FormField id="priority" label={t('fields.priority')}>
                <NativeSelect
                  id="priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  className={SELECT_CLASS}
                  data-test-id="field-priority"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {t(`priorities.${p}`)}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField id="assignee" label={t('fields.assignee')}>
                <CatalogPickerField
                  value={assigneeId ? { id: assigneeId, label: assigneeLabel } : null}
                  placeholder={t('select_assignee')}
                  onPick={() => setPickerAssignee(true)}
                  onClear={() => {
                    setAssigneeId(null);
                    setAssigneeLabel('');
                  }}
                  testId="field-assignee"
                />
              </FormField>

              <FormField id="dueAt" label={t('fields.due_at')}>
                <Input
                  type="date"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  data-test-id="field-due-at"
                />
              </FormField>
            </div>
          </FormSection>

          <CatalogPicker
            open={pickerAssignee}
            onClose={() => setPickerAssignee(false)}
            title={t('assignee_picker_title')}
            fetcher={employeeFetcher}
            onSelect={(item) => {
              setAssigneeId(item.id);
              setAssigneeLabel(String(item.primary));
            }}
          />
        </div>
      </main>
    </form>
  );
}
