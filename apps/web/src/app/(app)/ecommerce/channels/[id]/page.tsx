'use client';

import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useEditFormLabels } from '@/hooks/use-edit-form-labels';
import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
import { syncStatusTone } from '@/lib/domain-status-tone';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import {
  Badge,
  Button,
  EditForm,
  FormField,
  FormSection,
  Input,
  NativeSelect,
  Textarea,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const SELECT_CLASS =
  'w-full h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)]';

const TEXTAREA_CLASS =
  'w-full min-h-[80px] px-3 py-2 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] hover:border-[var(--ms-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 placeholder:text-[var(--ms-text-placeholder)] font-mono';

type ChannelKind =
  | 'telegram'
  | 'instagram'
  | 'website'
  | 'marketplace_uzum'
  | 'marketplace_olcha'
  | 'custom';

const KINDS: ChannelKind[] = [
  'telegram',
  'instagram',
  'website',
  'marketplace_uzum',
  'marketplace_olcha',
  'custom',
];

interface ChannelDetail {
  id: string;
  version: number;
  name: string;
  kind: string;
  externalRef: string | null;
  externalCode: string | null;
  settings: Record<string, unknown> | null;
  archived: boolean;
  lastSyncedAt: string | null;
  lastSyncOk: boolean | null;
  lastSyncMsg: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function EditSalesChannelPage() {
  const _router = useRouter();
  const qc = useQueryClient();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const t = useTranslations('pages.sales_channels');
  const tCommon = useTranslations('common');
  const editFormLabels = useEditFormLabels();

  const [name, setName] = useState('');
  const [kind, setKind] = useState<ChannelKind>('telegram');
  const [externalRef, setExternalRef] = useState('');
  const [externalCode, setExternalCode] = useState('');
  const [settingsText, setSettingsText] = useState('');
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onConflict = useConflictReload(['sales-channel', id]);

  const { data, isLoading } = useQuery<ChannelDetail>({
    queryKey: ['sales-channel', id],
    queryFn: () => api.get<ChannelDetail>(`/sales-channels/${id}`),
    enabled: !!id,
  });

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setKind(data.kind as ChannelKind);
    setExternalRef(data.externalRef ?? '');
    setExternalCode(data.externalCode ?? '');
    setSettingsText(data.settings ? JSON.stringify(data.settings, null, 2) : '');
  }, [data]);

  const parseSettings = (): Record<string, unknown> | null | undefined => {
    const trimmed = settingsText.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      // Throw synchronously — the stale-state check let invalid settings JSON be
      // silently dropped and the channel saved without it.
      setSettingsError(t('invalid_json'));
      throw new Error(t('invalid_json'));
    }
  };

  const updateMut = useMutation({
    mutationFn: () => {
      if (!data) throw new Error('not loaded');
      setSettingsError(null);
      const settings = parseSettings();
      return api.patch<ChannelDetail>(`/sales-channels/${id}`, {
        version: data.version,
        name,
        kind,
        // send the values directly so emptying a field persists the clear
        // (`|| undefined` omitted them → a cleared field never updated).
        externalRef,
        externalCode,
        settings,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales-channel', id] }),
    onError: (e: Error) => {
      if (isOptimisticConflict(e)) {
        onConflict();
      } else {
        setError(e.message);
      }
    },
  });

  const archiveMut = useMutation({
    mutationFn: () =>
      data?.archived
        ? api.post(`/sales-channels/${id}/restore`, {})
        : api.post(`/sales-channels/${id}/archive`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-channel', id] });
      qc.invalidateQueries({ queryKey: ['sales-channels'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center text-[var(--ms-text-muted)] text-sm">
        {tCommon('loading')}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-48 items-center justify-center text-[var(--ms-text-muted)] text-sm">
        {tCommon('not_found')}
      </div>
    );
  }

  // null (never evaluated) → null = no badge; the `syncTone !== null` render
  // guard below is the same `lastSyncOk !== null` check this page always had.
  const syncTone = syncStatusTone(data.lastSyncOk);

  return (
    <EditForm
      {...editFormLabels}
      testId="sales-channel-edit-page"
      title={data.name}
      breadcrumbs={[{ label: t('title'), href: '/ecommerce/channels' }, { label: data.name }]}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        updateMut.mutate();
      }}
      cancelHref="/ecommerce/channels"
      saving={updateMut.isPending}
      error={error}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone={archivedTone(data.archived)}>
            {data.archived ? tCommon('archived') : tCommon('active')}
          </Badge>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => archiveMut.mutate()}
          loading={archiveMut.isPending}
        >
          {data.archived ? tCommon('restore') : tCommon('archive')}
        </Button>
      </div>
      <FormSection title={t('section_main')}>
        <FormField id="name" label={t('name')} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} data-test-id="field-name" />
        </FormField>

        <FormField id="kind" label={t('kind')}>
          <NativeSelect
            id="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as ChannelKind)}
            className={SELECT_CLASS}
            data-test-id="field-kind"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}` as Parameters<typeof t>[0])}
              </option>
            ))}
          </NativeSelect>
        </FormField>

        <FormField id="externalRef" label={t('external_ref')}>
          <Input
            value={externalRef}
            onChange={(e) => setExternalRef(e.target.value)}
            placeholder={t('external_ref_placeholder')}
            data-test-id="field-external-ref"
          />
        </FormField>

        <FormField id="externalCode" label={t('external_code')}>
          <Input
            value={externalCode}
            onChange={(e) => setExternalCode(e.target.value)}
            data-test-id="field-external-code"
          />
        </FormField>
      </FormSection>

      <FormSection title={t('section_settings')}>
        <FormField id="settings" label={t('settings_label')}>
          <Textarea
            id="settings"
            value={settingsText}
            onChange={(e) => {
              setSettingsText(e.target.value);
              setSettingsError(null);
            }}
            className={TEXTAREA_CLASS}
            placeholder={'{\n  "key": "value"\n}'}
            data-test-id="field-settings"
          />
          {settingsError && <p className="mt-1 text-red-600 text-xs">{settingsError}</p>}
          <p className="mt-1 text-[var(--ms-text-muted)] text-xs">{t('settings_hint')}</p>
        </FormField>
      </FormSection>

      {data.lastSyncedAt && (
        <FormSection title={t('section_sync')}>
          <div className="text-[var(--ms-text-muted)] text-sm">
            <span>{t('last_sync')}: </span>
            <span className="text-[var(--ms-text-primary)]">
              {new Date(data.lastSyncedAt).toLocaleString('uz-UZ')}
            </span>
            {syncTone !== null && (
              <Badge tone={syncTone} className="ml-2">
                {data.lastSyncOk ? t('sync_ok') : t('sync_error')}
              </Badge>
            )}
            {data.lastSyncMsg && <p className="mt-1 text-xs">{data.lastSyncMsg}</p>}
          </div>
        </FormSection>
      )}
    </EditForm>
  );
}
