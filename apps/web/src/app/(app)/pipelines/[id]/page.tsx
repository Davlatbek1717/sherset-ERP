'use client';

/**
 * /pipelines/[id] — moysklad-parity inline-edit pipeline detail.
 *
 * Same DetailToolbar + DetailHeader chrome as /pipelines/new and the
 * other master-data /[id] pages. The stage editor lives in its own
 * FormSection below the meta — it's drag-and-drop reorderable and
 * supports inline create / edit / delete of stages without leaving
 * the page.
 *
 * Default pipelines (isDefault=true) cannot be archived or deleted;
 * the toolbar dropdown auto-disables those entries.
 */

import { DetailHeader, DetailToolbar } from '@/components/document-detail';
import { PipelineEditor, type StageDraft } from '@/components/pipeline-editor';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { api } from '@/lib/api-client';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import { Alert, Badge, Checkbox, FormField, FormSection, Input, formatDate } from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface PipelineDetail {
  id: string;
  version: number;
  name: string;
  isDefault: boolean;
  archived: boolean;
  stages: {
    id: string;
    name: string;
    type: 'open' | 'won' | 'lost';
    probability: number;
    color: string | null;
    position: number;
  }[];
  _count: { opportunities: number };
  createdAt: string;
  updatedAt: string;
}

/**
 * Stable JSON-serialised snapshot used for `isDirty` comparison.
 * react-hook-form would be overkill here because the stages array
 * editor is its own controlled child component (PipelineEditor), so
 * we track dirty state via deep equality of the full form value.
 */
function snapshot(name: string, isDefault: boolean, stages: StageDraft[]): string {
  return JSON.stringify({ name, isDefault, stages });
}

export default function EditPipelinePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const t = useTranslations('pages.pipelines');
  const tCommon = useTranslations('common');
  const tForm = useTranslations('form');

  const [name, setName] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [stages, setStages] = useState<StageDraft[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Original snapshot taken once after the first useQuery result lands.
  // The Save button is gated on (currentSnapshot !== originalSnapshot).
  const originalSnapshotRef = useRef<string>('');

  const { data, isLoading } = useQuery<PipelineDetail>({
    queryKey: ['pipeline', id],
    queryFn: () => api.get<PipelineDetail>(`/pipelines/${id}`),
    enabled: !!id,
  });

  // Optimistic-lock conflict (HTTP 409 OPTIMISTIC_LOCK): show the reload dialog.
  // This page hydrates name/isDefault/stages in the `[data]` useEffect below,
  // which is NOT gated by `!form` — it re-runs whenever `data` changes — so the
  // invalidate→refetch inside useConflictReload re-seeds BOTH the header form
  // and the stages list automatically; no `onReloaded` re-seed needed here.
  const onConflict = useConflictReload(['pipeline', id]);

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setIsDefault(data.isDefault);
    const newStages = data.stages.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      probability: s.probability,
      color: s.color,
    }));
    setStages(newStages);
    originalSnapshotRef.current = snapshot(data.name, data.isDefault, newStages);
  }, [data]);

  const updateMut = useApiMutation({
    mutationFn: async () => {
      if (!data) throw new Error(tCommon('not_found'));
      if (!name.trim()) throw new Error(tCommon('field_required', { field: t('name') }));
      if (stages.length === 0) throw new Error(t('err_min_one_stage'));
      if (stages.some((s) => !s.name.trim())) throw new Error(t('err_stage_name'));
      return api.patch<PipelineDetail>(`/pipelines/${id}`, {
        // Optimistic-lock token — the version this form loaded (from the server
        // query `data`, alongside the name/isDefault/stages edits).
        version: data.version,
        name,
        isDefault,
        stages: stages.map((s) => ({
          ...(s.id ? { id: s.id } : {}),
          name: s.name,
          type: s.type,
          probability: s.probability,
          color: s.color,
        })),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline', id] });
      qc.invalidateQueries({ queryKey: ['pipelines'] });
    },
    onError: (e: Error) => {
      if (isOptimisticConflict(e)) return;
      setError(e.message);
    },
    onConflict,
  });

  const archiveMut = useApiMutation({
    mutationFn: () => api.post<PipelineDetail>(`/pipelines/${id}/archive`, {}),
    onSuccess: () => router.push('/pipelines'),
    onError: (e: Error) => setError(e.message),
  });

  const restoreMut = useApiMutation({
    mutationFn: () => api.post<PipelineDetail>(`/pipelines/${id}/restore`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipeline', id] }),
    onError: (e: Error) => setError(e.message),
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete<unknown>(`/pipelines/${id}`),
    onSuccess: () => router.push('/pipelines'),
    onError: (e: Error) => setError(e.message),
  });

  const { runDestructive } = useDestructiveMutation();

  if (isLoading) {
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  }
  if (!data) {
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('not_found')}</div>;
  }

  const isDirty = snapshot(name, isDefault, stages) !== originalSnapshotRef.current;

  const handleSave = (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    updateMut.mutate();
  };

  return (
    <form
      onSubmit={handleSave}
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="pipeline-edit-page"
    >
      <DetailToolbar
        isDirty={isDirty}
        isSaving={updateMut.isPending}
        onSave={() => handleSave()}
        onClose={() => router.push('/pipelines')}
        onDelete={
          // Default pipeline can't be deleted (every account needs one
          // pipeline, and the default holds new opportunities).
          !data.isDefault && !data.archived
            ? () =>
                runDestructive({
                  title: tCommon('confirm_delete'),
                  run: () => deleteMut.mutateAsync(),
                })
            : undefined
        }
        createMenuItems={[]}
      />
      <DetailHeader
        titlePrefix=""
        name={data.name}
        moment={data.createdAt}
        stateLabel={
          data.archived
            ? tCommon('archived')
            : data.isDefault
              ? tCommon('default')
              : tCommon('active')
        }
        stateTone={data.archived ? 'neutral' : data.isDefault ? 'brand' : 'success'}
        stateSlug={data.archived ? 'archived' : data.isDefault ? 'default' : 'active'}
        applicable={false}
        hideApplicable
        customTitle={
          <span data-test-id="detail-header-title-text">
            {data.name}
            <span className="ml-2 font-normal text-[var(--ms-text-muted)] text-sm">
              · {t('opportunity_count')}: {data._count?.opportunities ?? 0}
            </span>
          </span>
        }
        pillsSlot={
          // Inline archive / restore controls — pipelines don't fit
          // the standard catalog archive flow because the default
          // pipeline can never be archived.
          data.archived ? (
            <button
              type="button"
              onClick={() => restoreMut.mutate()}
              disabled={restoreMut.isPending}
              className="rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-2 py-0.5 text-[var(--ms-text-primary)] text-xs hover:bg-[var(--ms-bg-muted)] disabled:opacity-50"
              data-test-id="detail-header-restore"
            >
              {tCommon('restore')}
            </button>
          ) : (
            !data.isDefault && (
              <button
                type="button"
                onClick={() => archiveMut.mutate()}
                disabled={archiveMut.isPending}
                className="rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-2 py-0.5 text-[var(--ms-text-primary)] text-xs hover:bg-[var(--ms-bg-muted)] disabled:opacity-50"
                data-test-id="detail-header-archive"
              >
                {tCommon('archive')}
              </button>
            )
          )
        }
        authorSlot={
          <div className="flex flex-col items-end gap-1 text-xs">
            <Badge tone="neutral">
              {t('opportunity_count')}: {data._count?.opportunities ?? 0}
            </Badge>
            <div className="text-[var(--ms-text-muted)]">
              {tCommon('updated_at')}: {formatDate(data.updatedAt)}
            </div>
          </div>
        }
      />

      <main className="flex-1 px-4 py-4">
        {error && (
          <Alert tone="destructive" className="mb-3">
            {error}
          </Alert>
        )}

        <div className="space-y-4">
          <FormSection title={tForm('section_main')}>
            <FormField id="name" label={t('name')} required>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-test-id="field-name"
              />
            </FormField>
            <FormField id="isDefault" label="">
              <label
                htmlFor="isDefault"
                className="inline-flex cursor-pointer items-center gap-2 text-sm"
              >
                <Checkbox
                  id="isDefault"
                  checked={isDefault}
                  onCheckedChange={(v) => setIsDefault(!!v)}
                  data-test-id="field-is-default"
                />
                <span>{t('is_default')}</span>
              </label>
            </FormField>
          </FormSection>

          <FormSection title={t('stages')}>
            <PipelineEditor stages={stages} onChange={setStages} />
          </FormSection>
        </div>
      </main>
    </form>
  );
}
