'use client';

/**
 * «Создание задачи» — RIGHT slide-over drawer (moysklad pixel-1:1, live-grounded 2026-06-25
 * docs/audits/task-slideover-2026-06-25/01-slideover-full.png): a light-grey panel sliding in
 * from the right with a top-left × + a 24px bold title, then white rounded cards:
 *   Card 1 — Описание задачи* (textarea) · Срок выполнения (📅 «Не ограничен») · «Выполнена»
 *            toggle · Тип задачи. Card 2 — Исполнитель*. Card 3 — Контрагент (chip, when linked).
 *   Footer — «Создать задачу» (blue) + «Не сейчас» (link).
 *
 * Backend POST /tasks: {title, description, assigneeId, typeId, entity, entityId, agentId,
 * status, dueAt}. title = first line of description (moysklad shows only the description).
 * Attachments: the 📎 stages files locally (the task has no id yet); after POST /tasks returns,
 * each staged file is uploaded via POST /attachments {entity:'Task', entityId:<new id>, ...} —
 * the same base64 path AttachmentsSection uses (Task ∈ ATTACHMENT_ENTITIES). The «Срок» field
 * opens the native date picker on click (showPicker) and clears back to «Не ограничен».
 */

import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { Button, CatalogPicker, Icons, type PickerItem, Textarea } from '@moysklad/ui';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

/** A task `state` row (moysklad's «Тип задачи» = State, entityType="task"). */
interface TaskStateRow {
  id: string;
  name: string;
  color: string | null;
}

export interface TaskCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Polymorphic target — one of TASK_ENTITY_WHITELIST. */
  entity: string;
  entityId: string;
  /** moysklad «Контрагент» link (Task.agentId) — set when creating from a counterparty
   *  card so the card's «Задачи» tab (reads by ?agentId=) surfaces the new task. */
  agentId?: string;
  /** «Контрагент» display name → shows the pre-linked counterparty chip (moysklad parity). */
  agentLabel?: string;
  /** Invalidate this query key after a successful create. */
  invalidateKey?: readonly unknown[];
}

/** Derive a 1–120-char title from the description's first non-empty line. */
function deriveTitle(description: string): string {
  const line = description.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
  const trimmed = line.trim().slice(0, 120);
  return trimmed || 'Задача';
}

/** A file chosen via 📎 while composing — held locally, uploaded after the task is created. */
interface StagedAttachment {
  key: string;
  file: File;
  /** object-URL thumbnail for image files (revoked on remove / reset). */
  previewUrl: string | null;
}

const MAX_ATTACHMENT_BYTES = 10_000_000;

/** Read a File as a base64 data URL — the shape POST /attachments accepts. */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r === 'string') resolve(r);
      else reject(new Error('read failed'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('read error'));
    reader.readAsDataURL(file);
  });
}

export function TaskCreateModal({
  open,
  onOpenChange,
  entity,
  entityId,
  agentId,
  agentLabel,
  invalidateKey,
}: TaskCreateModalProps) {
  const t = useTranslations('task_create');
  const tFields = useTranslations('fields');
  const tAtt = useTranslations('pages.attachments');
  const qc = useQueryClient();
  const { user } = useAuth();
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [done, setDone] = useState(false);
  const [stateId, setStateId] = useState<string>('');
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [assigneeLabel, setAssigneeLabel] = useState('');
  // «Контрагент» starts pre-linked to the card's counterparty; the chip × clears it.
  const [agentCleared, setAgentCleared] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // moysklad «📎» — files attached while composing. The task has no id yet, so they are
  // staged locally and uploaded after POST /tasks returns (same path as AttachmentsSection).
  const [staged, setStaged] = useState<StagedAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // moysklad defaults «Исполнитель» to the current user when the drawer opens.
  useEffect(() => {
    if (open && !assigneeId && user) {
      setAssigneeId(user.id);
      setAssigneeLabel(user.name);
    }
  }, [open, assigneeId, user]);

  // moysklad «Тип задачи» = the task's `state` (State rows, entityType="task").
  const { data: typeData } = useQuery<{ items: TaskStateRow[] }>({
    queryKey: ['states', 'task'],
    queryFn: () =>
      api.get<{ items: TaskStateRow[] }>('/states?entityType=task&archived=false&limit=200'),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const taskStates = typeData?.items ?? [];
  const selectedState = taskStates.find((s) => s.id === stateId) ?? null;

  const employeeFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/employees?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((e) => ({ id: e.id, primary: e.name }));
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const task = await api.post<{ id: string }>('/tasks', {
        title: deriveTitle(description),
        description: description.trim() || undefined,
        entity,
        entityId,
        agentId: agentCleared ? undefined : agentId || undefined,
        assigneeId: assigneeId ?? undefined,
        stateId: stateId || undefined,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        status: done ? 'done' : 'open',
      });
      // Upload any staged files onto the freshly-created task (Task ∈ ATTACHMENT_ENTITIES).
      for (const s of staged) {
        const dataBase64 = await readFileAsDataUrl(s.file);
        await api.post('/attachments', {
          entity: 'Task',
          entityId: task.id,
          filename: s.file.name,
          mime: s.file.type || 'application/octet-stream',
          dataBase64,
        });
      }
      return task;
    },
    onSuccess: () => {
      if (invalidateKey) qc.invalidateQueries({ queryKey: invalidateKey });
      reset();
      onOpenChange(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  const reset = () => {
    setDescription('');
    setDueAt('');
    setDone(false);
    setStateId('');
    setTypeMenuOpen(false);
    setAssigneeId(null);
    setAssigneeLabel('');
    setAgentCleared(false);
    setStaged((prev) => {
      for (const s of prev) if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
      return [];
    });
    setError(null);
  };

  const triggerFilePicker = () => fileInputRef.current?.click();

  const addStagedFiles = (files: FileList | File[]) => {
    setError(null);
    const incoming = Array.from(files);
    if (incoming.some((f) => f.size > MAX_ATTACHMENT_BYTES)) {
      setError(tAtt('error_too_large', { size: String(MAX_ATTACHMENT_BYTES / 1_000_000) }));
    }
    const ok = incoming.filter((f) => f.size <= MAX_ATTACHMENT_BYTES);
    setStaged((prev) => [
      ...prev,
      ...ok.map((file, i) => ({
        key: `${file.name}-${file.size}-${file.lastModified}-${prev.length + i}`,
        file,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      })),
    ]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeStaged = (key: string) =>
    setStaged((prev) => {
      const hit = prev.find((s) => s.key === key);
      if (hit?.previewUrl) URL.revokeObjectURL(hit.previewUrl);
      return prev.filter((s) => s.key !== key);
    });

  const submit = () => {
    setError(null);
    if (!description.trim()) {
      setError(t('description_label'));
      return;
    }
    createMut.mutate();
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const labelCls = 'block text-[var(--ms-text-primary)] text-sm';
  const cardCls =
    'rounded-[var(--ms-radius-default)] bg-[var(--ms-bg-surface)] p-5 shadow-[var(--ms-shadow-sm)]';

  return (
    <>
      <Dialog.Root
        open={open}
        onOpenChange={(v) => {
          if (!v) reset();
          onOpenChange(v);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay
            className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-[var(--ms-z-overlay)] bg-black/30 backdrop-blur-[1px] data-[state=closed]:animate-out data-[state=open]:animate-in"
            style={{ animationDuration: '150ms' }}
          />
          <Dialog.Content
            data-testid="task-create-modal"
            className="data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right fixed top-0 right-0 z-[var(--ms-z-modal)] flex h-screen w-[min(940px,96vw)] max-w-[100vw] flex-col bg-[var(--ms-bg-app)] shadow-[var(--ms-shadow-lg)] focus:outline-none data-[state=closed]:animate-out data-[state=open]:animate-in"
            style={{ animationDuration: '200ms' }}
          >
            {/* Header — top-left × + 24px bold title (moysklad). */}
            <header className="flex items-center gap-3 px-6 pt-5 pb-4">
              <Dialog.Close
                aria-label={t('cancel')}
                className="shrink-0 rounded-full p-1 text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-muted)] hover:text-[var(--ms-text-primary)] focus-visible:outline-none"
                data-test-id="task-create-close"
              >
                <Icons.close className="h-5 w-5" />
              </Dialog.Close>
              <Dialog.Title className="font-bold text-2xl text-[var(--ms-text-primary)]">
                {t('title')}
              </Dialog.Title>
            </header>

            {/* Body — white cards on the light-grey panel. */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
              <div className="mx-auto max-w-[660px] space-y-4">
                {/* Card 1 — описание · срок · выполнена · тип */}
                <div className={`${cardCls} space-y-5`}>
                  <div className="space-y-1.5">
                    <label htmlFor="task-desc" className={labelCls}>
                      {t('description_label')}
                      <span className="text-[var(--ms-text-destructive)]">*</span>
                    </label>
                    <div className="relative">
                      <Textarea
                        id="task-desc"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder={t('description_placeholder')}
                        rows={4}
                        className="pb-7"
                        data-test-id="task-create-description"
                      />
                      {/* moysklad's «📎» — opens the file picker; chosen files are staged below
                          and uploaded onto the task after it is created. */}
                      <button
                        type="button"
                        onClick={triggerFilePicker}
                        aria-label={tAtt('add_file')}
                        className="absolute bottom-2.5 left-3 text-[var(--ms-text-muted)] hover:text-[var(--ms-text-brand)]"
                        data-test-id="task-create-attach"
                      >
                        <Icons.paperclip className="h-4 w-4" />
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.length) addStagedFiles(e.target.files);
                        }}
                        data-test-id="task-create-file-input"
                      />
                    </div>
                    {staged.length > 0 && (
                      <ul className="space-y-1.5" data-test-id="task-create-staged">
                        {staged.map((s) => (
                          <li
                            key={s.key}
                            className="flex items-center gap-2 rounded-[var(--ms-radius-default)] bg-[var(--ms-bg-muted)] py-1.5 pr-2 pl-2.5 text-sm"
                          >
                            {s.previewUrl ? (
                              <img
                                src={s.previewUrl}
                                alt=""
                                className="h-6 w-6 shrink-0 rounded-sm object-cover"
                              />
                            ) : (
                              <Icons.paperclip className="h-4 w-4 shrink-0 text-[var(--ms-text-muted)]" />
                            )}
                            <span className="min-w-0 flex-1 truncate text-[var(--ms-text-primary)]">
                              {s.file.name}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeStaged(s.key)}
                              aria-label={t('cancel')}
                              className="shrink-0 rounded p-0.5 text-[var(--ms-text-muted)] hover:text-[var(--ms-text-destructive)]"
                              data-test-id={`task-create-staged-remove-${s.key}`}
                            >
                              <Icons.close className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="task-due" className={labelCls}>
                      {t('due')}
                    </label>
                    {/* moysklad «Срок выполнения»: a calendar-iconed field that reads «Не ограничен»
                        until a date is picked. A transparent native date input on top drives the
                        picker (so the empty-state text is ours, not the browser's «mm/dd/yyyy»). */}
                    <div className="relative">
                      <div className="flex items-center gap-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-3 py-2 pr-8 text-sm">
                        <Icons.calendar
                          className="h-4 w-4 shrink-0 text-[var(--ms-text-muted)]"
                          aria-hidden
                        />
                        <span className={dueAt ? '' : 'text-[var(--ms-text-muted)]'}>
                          {dueAt ? dueAt.split('-').reverse().join('.') : t('due_unlimited')}
                        </span>
                      </div>
                      <input
                        id="task-due"
                        type="date"
                        value={dueAt}
                        onChange={(e) => setDueAt(e.target.value)}
                        onClick={(e) => {
                          // A native date input doesn't open its calendar on a plain click; ask
                          // for it explicitly so clicking anywhere on the field shows the picker.
                          try {
                            (
                              e.currentTarget as HTMLInputElement & { showPicker?: () => void }
                            ).showPicker?.();
                          } catch {
                            // showPicker unsupported / blocked — focus still allows keyboard entry.
                          }
                        }}
                        aria-label={t('due')}
                        className="absolute inset-0 cursor-pointer opacity-0"
                        data-test-id="task-create-due"
                      />
                      {dueAt && (
                        <button
                          type="button"
                          onClick={() => setDueAt('')}
                          aria-label={t('cancel')}
                          className="-translate-y-1/2 absolute top-1/2 right-2 z-10 rounded p-0.5 text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]"
                          data-test-id="task-create-due-clear"
                        >
                          <Icons.close className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* «Выполнена» — toggle switch (moysklad), not a checkbox. */}
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={done}
                      onClick={() => setDone((v) => !v)}
                      data-test-id="task-create-done"
                      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                        done ? 'bg-[var(--ms-brand-500)]' : 'bg-[var(--ms-border-strong)]'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white shadow-sm transition-all ${
                          done ? 'left-[18px]' : 'left-0.5'
                        }`}
                      >
                        {done ? (
                          <Icons.check className="h-2.5 w-2.5 text-[var(--ms-brand-500)]" />
                        ) : (
                          <Icons.close className="h-2.5 w-2.5 text-[var(--ms-text-muted)]" />
                        )}
                      </span>
                    </button>
                    <span className="text-[var(--ms-text-primary)] text-sm">{t('done')}</span>
                  </div>

                  {/* «Тип задачи» — the task's `state` (coloured dots, moysklad parity). A
                      custom dropdown because a native <select> can't render colour swatches. */}
                  <div className="space-y-1.5">
                    <span className={labelCls}>{t('type')}</span>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setTypeMenuOpen((v) => !v)}
                        aria-haspopup="menu"
                        aria-expanded={typeMenuOpen}
                        data-test-id="task-create-type"
                        className="flex w-full items-center justify-between rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-3 py-2 text-left text-sm hover:border-[var(--ms-border-strong)]"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {selectedState ? (
                            <>
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: selectedState.color ?? '#9ca3af' }}
                                aria-hidden
                              />
                              <span className="truncate">{selectedState.name}</span>
                            </>
                          ) : (
                            <span className="text-[var(--ms-text-muted)]">
                              {t('type_placeholder')}
                            </span>
                          )}
                        </span>
                        <Icons.down className="h-3.5 w-3.5 shrink-0 text-[var(--ms-text-muted)]" />
                      </button>
                      {typeMenuOpen && (
                        <>
                          <button
                            type="button"
                            aria-hidden
                            tabIndex={-1}
                            className="fixed inset-0 z-10 cursor-default"
                            onClick={() => setTypeMenuOpen(false)}
                          />
                          <div
                            data-test-id="task-create-type-menu"
                            className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] py-1 shadow-[var(--ms-shadow-md)]"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setStateId('');
                                setTypeMenuOpen(false);
                              }}
                              className="flex w-full items-center px-3 py-1.5 text-left text-[var(--ms-text-muted)] text-sm hover:bg-[var(--ms-bg-muted)]"
                            >
                              {t('type_placeholder')}
                            </button>
                            {taskStates.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => {
                                  setStateId(s.id);
                                  setTypeMenuOpen(false);
                                }}
                                data-test-id={`task-create-type-opt-${s.id}`}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--ms-bg-muted)]"
                              >
                                <span
                                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: s.color ?? '#9ca3af' }}
                                  aria-hidden
                                />
                                <span className="truncate">{s.name}</span>
                                {s.id === stateId && (
                                  <Icons.check className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--ms-text-brand)]" />
                                )}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card 2 — Исполнитель (picker, ✎ + chevron). */}
                <div className={`${cardCls} space-y-1.5`}>
                  <span className={labelCls}>
                    {t('assignee')}
                    <span className="text-[var(--ms-text-destructive)]">*</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    data-test-id="task-create-assignee-pick"
                    className="flex w-full items-center justify-between rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-3 py-2 text-left text-sm hover:border-[var(--ms-border-strong)]"
                  >
                    <span className={assigneeLabel ? '' : 'text-[var(--ms-text-muted)]'}>
                      {assigneeLabel || t('assignee_placeholder')}
                    </span>
                    <span className="flex items-center gap-1.5 text-[var(--ms-text-muted)]">
                      <Icons.edit className="h-3.5 w-3.5" />
                      <Icons.down className="h-3.5 w-3.5" />
                    </span>
                  </button>
                </div>

                {/* Card 3 — Контрагент: a picker-style field (like Исполнитель) + the picked
                    counterparty as a removable chip below (moysklad's exact two-row layout). */}
                {agentId && agentLabel && !agentCleared && (
                  <div className={`${cardCls} space-y-3`}>
                    <div className="space-y-1.5">
                      <span className={labelCls}>{tFields('agent')}</span>
                      <div className="flex w-full items-center justify-between rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-3 py-2 text-sm">
                        <span className="truncate">{agentLabel}</span>
                        <span className="flex items-center gap-1.5 text-[var(--ms-text-muted)]">
                          <Icons.edit className="h-3.5 w-3.5" />
                          <Icons.down className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <span className="block text-[var(--ms-text-muted)] text-xs">
                        {tFields('agent')}
                      </span>
                      <div
                        className="inline-flex max-w-full items-center gap-2 rounded-[var(--ms-radius-default)] bg-[var(--ms-brand-50)] py-1.5 pr-2 pl-3"
                        data-test-id="task-create-agent-chip"
                      >
                        <Icons.user className="h-4 w-4 shrink-0 text-[var(--ms-text-brand)]" />
                        <span className="truncate text-[var(--ms-text-brand)] text-sm">
                          {agentLabel}
                        </span>
                        <button
                          type="button"
                          onClick={() => setAgentCleared(true)}
                          aria-label={t('cancel')}
                          className="shrink-0 rounded p-0.5 text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]"
                          data-test-id="task-create-agent-clear"
                        >
                          <Icons.close className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {error && (
                  <div
                    className="text-[var(--ms-text-destructive)] text-sm"
                    data-test-id="task-create-error"
                  >
                    {error}
                  </div>
                )}
              </div>
            </div>

            {/* Footer — «Создать задачу» (blue) + «Не сейчас» (link). */}
            <footer className="flex items-center gap-4 border-[var(--ms-border-default)] border-t bg-[var(--ms-bg-surface)] px-6 py-3">
              <Button
                onClick={submit}
                disabled={createMut.isPending}
                data-test-id="task-create-submit"
              >
                {t('create')}
              </Button>
              <button
                type="button"
                onClick={close}
                className="text-[var(--ms-text-brand)] text-sm hover:underline"
                data-test-id="task-create-cancel"
              >
                {t('cancel')}
              </button>
            </footer>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <CatalogPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={t('assignee')}
        fetcher={employeeFetcher}
        onSelect={(item) => {
          setAssigneeId(item.id);
          setAssigneeLabel(String(item.primary));
        }}
      />
    </>
  );
}
