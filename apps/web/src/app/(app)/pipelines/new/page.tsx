'use client';

import { DetailHeader, DetailToolbar } from '@/components/document-detail';
import { PipelineEditor, type StageDraft } from '@/components/pipeline-editor';
import { api } from '@/lib/api-client';
import { Checkbox, FormField, FormSection, Input } from '@moysklad/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

// Stage names are localized in-component via t() (RU/UZ parity); only the
// non-text seed (type/probability/color) lives here.
const DEFAULT_STAGE_SEED = [
  { nameKey: 'default_stage_new', type: 'open', probability: 10, color: '#94A3B8' },
  { nameKey: 'default_stage_contact', type: 'open', probability: 30, color: '#3B82F6' },
  { nameKey: 'default_stage_proposal', type: 'open', probability: 60, color: '#F59E0B' },
  { nameKey: 'default_stage_negotiation', type: 'open', probability: 80, color: '#8B5CF6' },
  { nameKey: 'default_stage_won', type: 'won', probability: 100, color: '#10B981' },
  { nameKey: 'default_stage_lost', type: 'lost', probability: 0, color: '#EF4444' },
] as const;

export default function NewPipelinePage() {
  const router = useRouter();
  const t = useTranslations('pages.pipelines');
  const tCommon = useTranslations('common');
  const tForm = useTranslations('form');

  const [name, setName] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [stages, setStages] = useState<StageDraft[]>(() =>
    DEFAULT_STAGE_SEED.map((s) => ({
      name: t(s.nameKey),
      type: s.type,
      probability: s.probability,
      color: s.color,
    })),
  );
  const [error, setError] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error(tCommon('field_required', { field: t('name') }));
      if (stages.length === 0) throw new Error(t('err_min_one_stage'));
      if (stages.some((s) => !s.name.trim())) throw new Error(t('err_stage_name'));
      return api.post<{ id: string }>('/pipelines', {
        name,
        isDefault,
        stages: stages.map((s) => ({
          name: s.name,
          type: s.type,
          probability: s.probability,
          color: s.color,
        })),
      });
    },
    onSuccess: (created) => router.push(`/pipelines/${created.id}`),
    onError: (e: Error) => setError(e.message),
  });

  const handleSave = () => {
    setError(null);
    createMut.mutate();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="pipeline-new-page"
    >
      <DetailToolbar
        isDirty={!!(name || stages.length !== DEFAULT_STAGE_SEED.length)}
        isSaving={createMut.isPending}
        onSave={handleSave}
        onClose={() => router.push('/pipelines')}
        createMenuItems={[]}
      />
      <DetailHeader
        titlePrefix=""
        name=""
        moment={new Date().toISOString()}
        stateLabel={tCommon('new_state')}
        stateTone="neutral"
        stateSlug="new"
        applicable={false}
        customTitle={t('new_title')}
      />
      {error && (
        <div className="border-[var(--ms-destructive-100)] border-b bg-[var(--ms-destructive-50)] px-4 py-2 text-[var(--ms-text-destructive)] text-sm">
          {error}
        </div>
      )}
      <main className="flex-1 px-4 py-4">
        <div className="space-y-4">
          <FormSection title={tForm('section_main')}>
            <FormField id="name" label={t('name')} required>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                placeholder="B2B asosiy"
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
