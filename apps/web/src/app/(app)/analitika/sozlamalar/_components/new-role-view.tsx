'use client';

import { api } from '@/lib/api-client';
import { Button, Input } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { type MatrixCell, type MatrixMeta, PermissionMatrix } from './permission-matrix';

export function NewRoleView() {
  const t = useTranslations('pages.analitika_settings');
  const qc = useQueryClient();
  const router = useRouter();

  const metaQuery = useQuery<MatrixMeta>({
    queryKey: ['roles', 'meta'],
    queryFn: () => api.get<MatrixMeta>('/roles/meta'),
    staleTime: 5 * 60 * 1000,
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [perms, setPerms] = useState<MatrixCell[]>([]);

  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>('/roles', {
        name: name.trim(),
        description: description.trim() || undefined,
        permissions: perms,
      }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['roles'] });
      if (created?.id) router.push(`/analitika/sozlamalar/rollar/${created.id}`);
    },
  });

  const canSave = name.trim().length > 0 && !create.isPending;

  if (metaQuery.isLoading || !metaQuery.data) {
    return <p className="text-[var(--ms-text-muted)] text-sm">{t('loading')}</p>;
  }

  return (
    <div className="space-y-4">
      <a
        href="/analitika/sozlamalar/rollar"
        className="text-[var(--ms-text-brand)] text-sm hover:underline"
      >
        {t('role_back')}
      </a>

      <section className="rounded-lg border border-[var(--ms-border)] bg-white p-5">
        <h2 className="font-semibold text-[var(--ms-text-primary)] text-lg">
          {t('role_new_title')}
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="block text-[var(--ms-text-muted)]">{t('role_name')}</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('role_name_ph')}
              className="mt-1"
              autoFocus
            />
          </label>
          <label className="block text-sm">
            <span className="block text-[var(--ms-text-muted)]">{t('role_desc')}</span>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('role_desc_ph')}
              className="mt-1"
            />
          </label>
        </div>
      </section>

      <PermissionMatrix meta={metaQuery.data} value={perms} onChange={setPerms} />

      <div className="-mx-6 sticky bottom-0 z-20 border-[var(--ms-border)] border-t bg-white px-6 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-end gap-3">
          {create.isError && (
            <span className="text-[var(--ms-destructive-500)] text-xs">
              {(create.error as Error)?.message}
            </span>
          )}
          <Button onClick={() => create.mutate()} disabled={!canSave}>
            {t('role_save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
