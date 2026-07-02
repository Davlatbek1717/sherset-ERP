'use client';

/**
 * /contact-persons/[id] — inline-edit detail page (moysklad-parity).
 *
 * Mirrors /contact-persons/new layout. Same fields; difference is
 * useQuery hydration + PATCH /contact-persons/:id mutation.
 * The parent counterparty is read-only on the detail page
 * (re-parenting is not a moysklad operation from this view).
 */

import { DetailHeader, DetailToolbar } from '@/components/document-detail';
import { DocumentTabs } from '@/components/document-tabs';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useDetailNavigation } from '@/hooks/use-detail-navigation';
import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import {
  Alert,
  Avatar,
  CatalogPickerField,
  FormField,
  FormSection,
  Input,
  formatDate,
} from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface ContactPersonDetail {
  id: string;
  name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  description: string | null;
  archived: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  counterpartyId: string;
  counterparty: { id: string; name: string; legalTitle: string | null } | null;
  owner: { id: string; name: string; email: string } | null;
}

export default function ContactPersonDetailPage() {
  const tCommon = useTranslations('common');
  const tDetailHeader = useTranslations('detail_header');
  const t = useTranslations('pages.contact_persons');
  const tForm = useTranslations('form');
  const { id } = useParams<{ id: string }>();
  const detailNav = useDetailNavigation('contact-persons', id);
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<ContactPersonDetail>({
    queryKey: ['contact-person', id],
    queryFn: () => api.get<ContactPersonDetail>(`/contact-persons/${id}`),
  });

  // Editable state
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Snapshot for isDirty
  const snapshot = useRef({ name: '', position: '', phone: '', email: '', description: '' });

  useEffect(() => {
    if (!data) return;
    const n = data.name;
    const pos = data.position ?? '';
    const ph = data.phone ?? '';
    const em = data.email ?? '';
    const desc = data.description ?? '';
    setName(n);
    setPosition(pos);
    setPhone(ph);
    setEmail(em);
    setDescription(desc);
    snapshot.current = { name: n, position: pos, phone: ph, email: em, description: desc };
  }, [data]);

  const isDirty =
    name !== snapshot.current.name ||
    position !== snapshot.current.position ||
    phone !== snapshot.current.phone ||
    email !== snapshot.current.email ||
    description !== snapshot.current.description;

  const onConflict = useConflictReload(['contact-person', id]);
  const updateMut = useApiMutation({
    onConflict,
    mutationFn: async () => {
      if (!data) throw new Error('not loaded');
      if (!name.trim()) throw new Error(tCommon('field_required', { field: t('full_name') }));
      return api.patch<ContactPersonDetail>(`/contact-persons/${id}`, {
        version: data.version,
        name,
        position: position || null,
        phone: phone || null,
        email: email || null,
        description: description || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-person', id] });
      qc.invalidateQueries({ queryKey: ['contact-persons'] });
      setError(null);
    },
  });

  const archiveMut = useApiMutation({
    mutationFn: (archive: boolean) =>
      api.post(`/contact-persons/${id}/${archive ? 'archive' : 'restore'}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-person', id] });
      qc.invalidateQueries({ queryKey: ['contact-persons'] });
    },
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/contact-persons/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-persons'] });
      // Navigate back to counterparty if we know the parent, otherwise list
      if (data?.counterpartyId) {
        router.push(`/counterparties/${data.counterpartyId}`);
      } else {
        router.push('/contact-persons');
      }
    },
  });

  const { runDestructive } = useDestructiveMutation();

  if (isLoading)
    return <div className="p-8 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  if (!data) return <div className="p-8 text-sm">{tCommon('not_found')}</div>;

  const handleSave = () => {
    setError(null);
    updateMut.mutate(undefined, {
      // Optimistic-lock conflicts are surfaced by the reload dialog (onConflict),
      // not the inline error banner.
      onError: (e) => {
        if (!isOptimisticConflict(e)) setError((e as Error).message);
      },
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="contact-person-detail-page"
    >
      <DetailToolbar
        isDirty={isDirty}
        isSaving={updateMut.isPending}
        onSave={handleSave}
        onClose={() =>
          data?.counterpartyId
            ? router.push(`/counterparties/${data.counterpartyId}`)
            : router.push('/contact-persons')
        }
        position={detailNav.position}
        onPrev={detailNav.onPrev}
        onNext={detailNav.onNext}
        apiData={data}
        onDelete={
          !data.archived
            ? () =>
                runDestructive({
                  title: tCommon('delete_confirm', { name: data.name }),
                  run: () => deleteMut.mutateAsync(),
                  successMessage: tCommon('saved'),
                })
            : undefined
        }
      />
      <DetailHeader
        titlePrefix=""
        name={data.name}
        moment={data.createdAt}
        stateLabel={data.archived ? tCommon('archived') : tCommon('active')}
        stateTone={archivedTone(data.archived)}
        stateSlug={data.archived ? 'archived' : 'active'}
        applicable={false}
        hideApplicable
        customTitle={
          <span data-test-id="detail-header-title-text">
            {data.name}
            {data.position && (
              <span className="ml-2 font-normal text-[var(--ms-text-muted)] text-sm">
                · {data.position}
              </span>
            )}
          </span>
        }
        pillsSlot={
          data.archived ? (
            <button
              type="button"
              onClick={() => archiveMut.mutate(false)}
              disabled={archiveMut.isPending}
              className="rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-2 py-0.5 text-[var(--ms-text-primary)] text-xs hover:bg-[var(--ms-bg-muted)] disabled:opacity-50"
              data-test-id="detail-header-restore"
            >
              {tCommon('restore')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => archiveMut.mutate(true)}
              disabled={archiveMut.isPending}
              className="rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-2 py-0.5 text-[var(--ms-text-primary)] text-xs hover:bg-[var(--ms-bg-muted)] disabled:opacity-50"
              data-test-id="detail-header-archive"
            >
              {tCommon('archive')}
            </button>
          )
        }
        authorSlot={
          <div className="flex flex-col items-end gap-1 text-xs">
            <div className="flex items-center gap-2">
              <Avatar
                name={data.owner?.name ?? '—'}
                size="md"
                data-test-id="detail-header-author-avatar"
              />
              <div className="flex flex-col leading-tight">
                <div
                  className="font-medium text-[var(--ms-text-primary)]"
                  data-test-id="detail-header-owner"
                >
                  {data.owner?.name ?? '—'}
                </div>
                <div
                  className="text-[var(--ms-text-muted)]"
                  data-test-id="detail-header-owner-role"
                >
                  {tDetailHeader('role_primary')}
                </div>
              </div>
            </div>
            <div className="text-[var(--ms-text-muted)]" data-test-id="detail-header-updated">
              {tDetailHeader('changed')}: {data.owner?.name ?? '—'} {formatDate(data.updatedAt)}
            </div>
          </div>
        }
      />

      <main className="flex-1 px-4 py-4">
        {(error ||
          (updateMut.error && !isOptimisticConflict(updateMut.error)) ||
          archiveMut.error) && (
          <Alert tone="destructive" className="mb-3">
            {error ?? ((updateMut.error ?? archiveMut.error) as Error).message}
          </Alert>
        )}

        <div className="space-y-4">
          <FormSection title={tForm('section_main')}>
            {/* Parent counterparty — read-only on detail page */}
            <FormField id="counterparty" label={t('counterparty')} required>
              <CatalogPickerField
                value={
                  data.counterparty
                    ? { id: data.counterparty.id, label: data.counterparty.name }
                    : null
                }
                placeholder={t('select_counterparty')}
                onPick={() => {}}
                onClear={() => {}}
                disabled
                testId="field-counterparty"
              />
            </FormField>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField id="name" label={t('full_name')} required>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  data-test-id="field-name"
                />
              </FormField>
              <FormField id="position" label={t('position')}>
                <Input
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="CFO"
                  data-test-id="field-position"
                />
              </FormField>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField id="phone" label={t('phone')}>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  type="tel"
                  placeholder="+998 90 123 45 67"
                  data-test-id="field-phone"
                />
              </FormField>
              <FormField id="email" label={t('email')}>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="name@company.uz"
                  data-test-id="field-email"
                />
              </FormField>
            </div>
            <FormField id="description" label={tCommon('description')}>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                data-test-id="field-description"
              />
            </FormField>
          </FormSection>

          <DocumentTabs auditEntity="ContactPerson" entityId={data.id} relatedGroups={[]} />
        </div>
      </main>
    </form>
  );
}
