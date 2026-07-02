'use client';

import { useApiMutation } from '@/hooks/use-api-mutation';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useEditFormLabels } from '@/hooks/use-edit-form-labels';
import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import {
  Badge,
  Button,
  EditForm,
  FormField,
  FormSection,
  Input,
  NativeSelect,
  formatMoney,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const SELECT_CLASS =
  'w-full h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)]';

const CURRENCIES = ['UZS', 'USD', 'EUR', 'RUB'] as const;
type Currency = (typeof CURRENCIES)[number];

interface CashDeskDetail {
  id: string;
  name: string;
  currency: string;
  balanceMinor: string;
  archived: boolean;
  version: number;
}

export default function EditCashDeskPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const t = useTranslations('pages.cash_desks');
  const tCommon = useTranslations('common');
  const tForm = useTranslations('form');
  const tFields = useTranslations('fields');
  const editFormLabels = useEditFormLabels();

  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<Currency>('UZS');
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<CashDeskDetail>({
    queryKey: ['cash-desk', id],
    queryFn: () => api.get<CashDeskDetail>(`/admin/cash-desks/${id}`),
    enabled: !!id,
  });

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setCurrency((data.currency as Currency) ?? 'UZS');
  }, [data]);

  const onConflict = useConflictReload(['cash-desk', id]);
  const updateMut = useApiMutation({
    onConflict,
    mutationFn: () => {
      if (!data) throw new Error('not loaded');
      if (!name.trim()) throw new Error(tCommon('field_required', { field: tFields('name') }));
      return api.patch<CashDeskDetail>(`/admin/cash-desks/${id}`, {
        name,
        currency,
        version: data.version,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-desk', id] });
      qc.invalidateQueries({ queryKey: ['cash-desks'] });
    },
  });

  const archiveMut = useMutation({
    mutationFn: () => api.post<CashDeskDetail>(`/admin/cash-desks/${id}/archive`, {}),
    onSuccess: () => router.push('/settings/cash-desks'),
    onError: (e: Error) => setError(e.message),
  });

  const restoreMut = useMutation({
    mutationFn: () => api.post<CashDeskDetail>(`/admin/cash-desks/${id}/restore`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cash-desk', id] }),
    onError: (e: Error) => setError(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete<unknown>(`/admin/cash-desks/${id}`),
    onSuccess: () => router.push('/settings/cash-desks'),
    onError: (e: Error) => setError(e.message),
  });

  const { runDestructive } = useDestructiveMutation();

  if (isLoading) {
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  }
  if (!data) {
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('not_found')}</div>;
  }

  return (
    <EditForm
      {...editFormLabels}
      testId="cash-desks-edit-page"
      title={t('edit_title')}
      breadcrumbs={[{ label: t('title'), href: '/settings/cash-desks' }, { label: data.name }]}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        updateMut.mutate(undefined, {
          // Optimistic-lock conflicts are surfaced by the reload dialog (onConflict),
          // not the inline error banner.
          onError: (e) => {
            if (!isOptimisticConflict(e)) setError((e as Error).message);
          },
        });
      }}
      cancelHref="/settings/cash-desks"
      saving={updateMut.isPending}
      error={error}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone={archivedTone(data.archived)}>
            {data.archived ? tCommon('archived') : tCommon('active')}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {data.archived ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => restoreMut.mutate()}
              loading={restoreMut.isPending}
            >
              {tCommon('restore')}
            </Button>
          ) : (
            <Button
              type="button"
              variant="tertiary"
              onClick={() => archiveMut.mutate()}
              loading={archiveMut.isPending}
            >
              {tCommon('archive')}
            </Button>
          )}
          <Button
            type="button"
            variant="destructive"
            onClick={() =>
              runDestructive({
                title: tCommon('delete_confirm', { name: data.name }),
                run: () => deleteMut.mutateAsync(),
              })
            }
            loading={deleteMut.isPending}
          >
            {tCommon('delete')}
          </Button>
        </div>
      </div>

      <FormSection title={tForm('section_main')}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField id="name" label={t('name')} required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-test-id="field-name"
            />
          </FormField>
          <FormField id="currency" label={t('currency')}>
            <NativeSelect
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
              className={SELECT_CLASS}
              data-test-id="field-currency"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </div>
        <FormField id="balance" label={t('balance')}>
          <div
            className="flex h-9 select-none items-center gap-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)] px-3 text-[var(--ms-text-muted)] text-sm"
            data-test-id="field-balance"
          >
            <span className="font-medium text-[var(--ms-text-primary)] tabular-nums">
              {formatMoney(BigInt(data.balanceMinor), data.currency)}
            </span>
            <span className="ml-2 text-xs">({t('balance_readonly_note')})</span>
          </div>
        </FormField>
      </FormSection>
    </EditForm>
  );
}
