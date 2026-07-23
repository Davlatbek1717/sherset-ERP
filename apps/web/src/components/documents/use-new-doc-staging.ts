'use client';

/**
 * Staging store for an UNSAVED /new document form (moysklad old-design parity,
 * 2026-07-09). moysklad's create form has a server-side draft, so «Привязать
 * документ» / «⊕ Задача» / «⊕ Файл» all work in place with no navigation. Our
 * /new has no id until save — so everything is staged LOCALLY and persisted in
 * one flush right after the document itself is created:
 *
 *   const staging = useNewDocStaging({ entityType: 'PurchaseOrder', route: 'purchase-orders' });
 *   …
 *   onSuccess: async (created) => { await staging.flush(created.id); router.push(…); }
 *
 * flush = attachments (POST /attachments) + manual links (POST /document-links,
 * source snapshot re-read from the saved doc) + tasks (POST /tasks + their files).
 * Failures are best-effort (allSettled) — the document itself is already saved.
 */

import { type StagedFile, readFileAsBase64 } from '@/components/attachments-section';
import type { SearchDoc } from '@/components/documents/link-document-modal';
import type { StagedTaskPayload } from '@/components/task-create-modal';
import { api } from '@/lib/api-client';
import { useCallback, useState } from 'react';

export interface StagedTask extends StagedTaskPayload {
  key: string;
}

export interface NewDocStaging {
  links: SearchDoc[];
  addLinks: (docs: SearchDoc[]) => void;
  removeLink: (key: string) => void;
  tasks: StagedTask[];
  addTask: (t: StagedTaskPayload) => void;
  removeTask: (key: string) => void;
  files: StagedFile[];
  addFiles: (files: File[]) => void;
  removeFile: (key: string) => void;
  /** Persist everything staged onto the just-created document. */
  flush: (entityId: string) => Promise<void>;
}

export function useNewDocStaging(opts: { entityType: string; route: string }): NewDocStaging {
  const { entityType, route } = opts;
  const [links, setLinks] = useState<SearchDoc[]>([]);
  const [tasks, setTasks] = useState<StagedTask[]>([]);
  const [files, setFiles] = useState<StagedFile[]>([]);

  const addLinks = useCallback((docs: SearchDoc[]) => {
    setLinks((prev) => {
      const seen = new Set(prev.map((d) => `${d.type}:${d.id}`));
      return [...prev, ...docs.filter((d) => !seen.has(`${d.type}:${d.id}`))];
    });
  }, []);
  const removeLink = useCallback(
    (key: string) => setLinks((prev) => prev.filter((d) => `${d.type}:${d.id}` !== key)),
    [],
  );

  const addTask = useCallback(
    (t: StagedTaskPayload) =>
      setTasks((prev) => [...prev, { ...t, key: `task-${prev.length}-${t.title.slice(0, 24)}` }]),
    [],
  );
  const removeTask = useCallback(
    (key: string) => setTasks((prev) => prev.filter((t) => t.key !== key)),
    [],
  );

  const addFiles = useCallback((incoming: File[]) => {
    setFiles((prev) => [
      ...prev,
      ...incoming.map((file) => ({
        key: crypto.randomUUID(),
        file,
        addedAt: new Date().toISOString(),
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      })),
    ]);
  }, []);
  const removeFile = useCallback(
    (key: string) =>
      setFiles((prev) => {
        const gone = prev.find((s) => s.key === key);
        if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
        return prev.filter((s) => s.key !== key);
      }),
    [],
  );

  const flush = useCallback(
    async (entityId: string) => {
      // 1. «⊕ Файл» — attachments straight onto the saved document.
      if (files.length > 0) {
        await Promise.allSettled(
          files.map(async (s) =>
            api.post('/attachments', {
              entity: entityType,
              entityId,
              filename: s.file.name,
              mime: s.file.type || 'application/octet-stream',
              dataBase64: await readFileAsBase64(s.file),
            }),
          ),
        );
      }
      // 2. «Привязать документ» — DocumentLink rows need the SOURCE snapshot
      //    (name/moment/sum/state); re-read the just-saved doc once.
      if (links.length > 0) {
        try {
          const doc = await api.get<{
            name: string;
            moment: string;
            sumMinor: string;
            state?: string;
          }>(`/${route}/${entityId}`);
          await Promise.allSettled(
            links.map((d) =>
              api.post('/document-links', {
                sourceType: entityType,
                sourceId: entityId,
                sourceName: doc.name,
                sourceMoment: doc.moment,
                sourceSumMinor: doc.sumMinor,
                sourceState: doc.state ?? 'draft',
                targetType: d.type,
                targetId: d.id,
                targetName: d.name,
                targetMoment: d.moment,
                targetSumMinor: d.sumMinor,
                targetState: d.state,
              }),
            ),
          );
        } catch {
          // snapshot read failed — skip links rather than block the save flow
        }
      }
      // 3. «⊕ Задача» — create each staged task linked to the doc (+ its files).
      for (const t of tasks) {
        try {
          const task = await api.post<{ id: string }>('/tasks', {
            title: t.title,
            description: t.description,
            entity: entityType,
            entityId,
            assigneeId: t.assigneeId,
            stateId: t.stateId,
            dueAt: t.dueAt,
            status: t.status,
          });
          for (const file of t.files) {
            await api.post('/attachments', {
              entity: 'Task',
              entityId: task.id,
              filename: file.name,
              mime: file.type || 'application/octet-stream',
              dataBase64: await readFileAsBase64(file),
            });
          }
        } catch {
          // best-effort — the document itself is already saved
        }
      }
    },
    [entityType, route, files, links, tasks],
  );

  return {
    links,
    addLinks,
    removeLink,
    tasks,
    addTask,
    removeTask,
    files,
    addFiles,
    removeFile,
    flush,
  };
}
