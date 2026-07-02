'use client';

import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { api } from '@/lib/api-client';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Container,
  FormField,
  FormSection,
  Icons,
  Input,
  PageHeader,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface PriceType {
  id: string;
  name: string;
  currency: string;
  isDefault: boolean;
  position: number;
  version: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function PriceTypesPage() {
  const qc = useQueryClient();
  const t = useTranslations('pages.price_types');
  const tCommon = useTranslations('common');

  const [draft, setDraft] = useState<{ name: string; currency: string; isDefault: boolean } | null>(
    null,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    name: string;
    currency: string;
    isDefault: boolean;
    version: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery<{ items: PriceType[] }>({
    queryKey: ['price-types'],
    queryFn: () => api.get<{ items: PriceType[] }>('/price-types'),
  });

  const createMut = useMutation({
    mutationFn: (input: { name: string; currency: string; isDefault: boolean }) =>
      api.post<PriceType>('/price-types', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-types'] });
      setDraft(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const onConflict = useConflictReload(['price-types']);

  const updateMut = useMutation({
    mutationFn: (input: {
      id: string;
      body: { name?: string; currency?: string; isDefault?: boolean; version: number };
    }) => api.patch<PriceType>(`/price-types/${input.id}`, input.body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-types'] });
      setEditingId(null);
      setEditDraft(null);
    },
    onError: (e: Error) => {
      if (isOptimisticConflict(e)) {
        onConflict();
      } else {
        setError(e.message);
      }
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/price-types/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['price-types'] }),
    onError: (e: Error) => setError(e.message),
  });

  const { runDestructive } = useDestructiveMutation();

  const startEdit = (pt: PriceType) => {
    setEditingId(pt.id);
    setEditDraft({
      name: pt.name,
      currency: pt.currency,
      isDefault: pt.isDefault,
      version: pt.version,
    });
  };

  return (
    <Container className="space-y-4 py-4" data-test-id="price-types-page">
      <PageHeader
        title={t('title')}
        subtitle={
          list.data ? tCommon('records_count', { count: list.data.items.length }) : undefined
        }
        actions={
          !draft && (
            <Button
              onClick={() => setDraft({ name: '', currency: 'UZS', isDefault: false })}
              data-test-id="add-price-type"
            >
              <Icons.create className="h-4 w-4" />
              {t('add_button')}
            </Button>
          )
        }
      />

      {error && <Alert tone="destructive">{error}</Alert>}

      {draft && (
        <FormSection title={t('add_title')}>
          <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-4">
            <FormField id="draft-name" label={t('col_name')} required>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                autoFocus
                data-test-id="draft-name"
              />
            </FormField>
            <FormField id="draft-currency" label={t('col_currency')}>
              <Input
                value={draft.currency}
                onChange={(e) =>
                  setDraft({ ...draft, currency: e.target.value.toUpperCase().slice(0, 3) })
                }
                maxLength={3}
                data-test-id="draft-currency"
              />
            </FormField>
            <FormField id="draft-default" label={t('col_default')}>
              <label className="flex h-9 items-center gap-2 text-sm">
                <Checkbox
                  checked={draft.isDefault}
                  onCheckedChange={(v) => setDraft({ ...draft, isDefault: v === true })}
                  data-test-id="draft-default"
                />
                {t('mark_default')}
              </label>
            </FormField>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  setError(null);
                  createMut.mutate(draft);
                }}
                disabled={!draft.name.trim() || createMut.isPending}
                loading={createMut.isPending}
                data-test-id="save-draft"
              >
                {tCommon('save')}
              </Button>
              <Button variant="ghost" onClick={() => setDraft(null)}>
                {tCommon('cancel')}
              </Button>
            </div>
          </div>
        </FormSection>
      )}

      <div className="overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--ms-bg-muted)]">
            <tr>
              <th className="h-9 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                {t('col_name')}
              </th>
              <th className="h-9 w-24 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                {t('col_currency')}
              </th>
              <th className="h-9 w-28 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                {t('col_default')}
              </th>
              <th className="h-9 w-56 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                {tCommon('actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading && (
              <tr>
                <td colSpan={4} className="h-24 text-center text-[var(--ms-text-muted)] text-xs">
                  {tCommon('loading')}
                </td>
              </tr>
            )}
            {list.data?.items.length === 0 && (
              <tr>
                <td colSpan={4} className="h-24 text-center text-[var(--ms-text-muted)] text-xs">
                  {t('empty')}
                </td>
              </tr>
            )}
            {list.data?.items.map((pt) => {
              const isEditing = editingId === pt.id && editDraft !== null;
              return (
                <tr
                  key={pt.id}
                  className="border-[var(--ms-border-default)] border-t"
                  data-test-id={`price-type-${pt.id}`}
                >
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <Input
                        value={editDraft.name}
                        onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                        autoFocus
                        data-test-id={`edit-name-${pt.id}`}
                      />
                    ) : (
                      <span className="font-medium">{pt.name}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <Input
                        value={editDraft.currency}
                        onChange={(e) =>
                          setEditDraft({
                            ...editDraft,
                            currency: e.target.value.toUpperCase().slice(0, 3),
                          })
                        }
                        maxLength={3}
                        className="w-20"
                      />
                    ) : (
                      <span className="text-sm">{pt.currency}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <Checkbox
                        checked={editDraft.isDefault}
                        onCheckedChange={(v) =>
                          setEditDraft({ ...editDraft, isDefault: v === true })
                        }
                      />
                    ) : pt.isDefault ? (
                      <Badge tone="success">{t('default_badge')}</Badge>
                    ) : (
                      <span className="text-[var(--ms-text-muted)] text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isEditing ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            setError(null);
                            updateMut.mutate({ id: pt.id, body: editDraft });
                          }}
                          loading={updateMut.isPending}
                          data-test-id={`save-${pt.id}`}
                        >
                          {tCommon('save')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(null);
                            setEditDraft(null);
                          }}
                        >
                          {tCommon('cancel')}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="tertiary"
                          onClick={() => startEdit(pt)}
                          data-test-id={`edit-${pt.id}`}
                        >
                          <Icons.edit className="h-4 w-4" />
                          {tCommon('edit')}
                        </Button>
                        {!pt.isDefault && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              setError(null);
                              runDestructive({
                                title: tCommon('delete_confirm', { name: pt.name }),
                                run: () => deleteMut.mutateAsync(pt.id),
                              });
                            }}
                            loading={deleteMut.isPending}
                            data-test-id={`delete-${pt.id}`}
                          >
                            <Icons.delete className="h-4 w-4" />
                            {tCommon('delete')}
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Container>
  );
}
