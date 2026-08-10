'use client';

import { useConflictReload } from '@/hooks/use-conflict-reload';
import { api } from '@/lib/api-client';
import { systemTone } from '@/lib/domain-status-tone';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import { Badge, Button, Input, useConfirm } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { type MatrixCell, type MatrixMeta, PermissionMatrix } from './permission-matrix';

interface RoleDetail {
  id: string;
  version: number;
  name: string;
  description: string | null;
  isSystem: boolean;
  memberCount: number;
  permissions: MatrixCell[];
}

export function RoleDetailView({ id }: { id: string }) {
  const t = useTranslations('pages.analitika_settings');
  const qc = useQueryClient();
  const router = useRouter();
  const { confirm } = useConfirm();

  const metaQuery = useQuery<MatrixMeta>({
    queryKey: ['roles', 'meta'],
    queryFn: () => api.get<MatrixMeta>('/roles/meta'),
    staleTime: 5 * 60 * 1000,
  });
  const roleQuery = useQuery<RoleDetail>({
    queryKey: ['roles', 'detail', id],
    queryFn: () => api.get<RoleDetail>(`/roles/${id}`),
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [perms, setPerms] = useState<MatrixCell[]>([]);

  // Hydrate local state from server on first load / role change. This effect is
  // keyed on `roleQuery.data`, so after an optimistic-lock reload (the conflict
  // dialog → invalidate → refetch) it re-fires and re-seeds name/description/
  // perms from the fresh copy automatically — no extra reHydrate callback needed.
  useEffect(() => {
    if (roleQuery.data) {
      setName(roleQuery.data.name);
      setDescription(roleQuery.data.description ?? '');
      setPerms(roleQuery.data.permissions);
    }
  }, [roleQuery.data]);

  // Optimistic-lock conflict handler — same query key the role loads with;
  // re-hydration is handled by the `[roleQuery.data]` effect above, so no
  // second arg.
  const onConflict = useConflictReload(['roles', 'detail', id]);

  const dirty = useMemo(() => {
    if (!roleQuery.data) return 0;
    let changes = 0;
    if (name !== roleQuery.data.name) changes += 1;
    if ((description || null) !== (roleQuery.data.description ?? null)) changes += 1;
    // Count permission diffs (sparse map comparison).
    const before = serializeCells(roleQuery.data.permissions);
    const after = serializeCells(perms);
    if (before !== after) changes += 1;
    return changes;
  }, [name, description, perms, roleQuery.data]);

  const save = useMutation({
    mutationFn: () => {
      // Optimistic-lock token — the version this form loaded (from the server
      // query `roleQuery.data`, NOT local edit state, which has no version).
      const body: Record<string, unknown> = {
        version: roleQuery.data?.version,
        permissions: perms,
      };
      if (!roleQuery.data?.isSystem) {
        body.name = name;
        body.description = description.trim() || null;
      }
      return api.patch(`/roles/${id}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (err) => {
      // A 409 OPTIMISTIC_LOCK means someone else changed the role while this
      // form was open — show the reload dialog instead of the raw error toast.
      if (isOptimisticConflict(err)) onConflict();
    },
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/roles/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] });
      router.push('/analitika/sozlamalar/rollar');
    },
  });

  const handleDelete = async () => {
    const ok = await confirm({
      title: t('role_delete'),
      description: t('role_delete_confirm'),
      confirmLabel: t('role_delete'),
      cancelLabel: t('cancel'),
      tone: 'destructive',
    });
    if (ok) remove.mutate();
  };

  const handleDiscard = () => {
    if (!roleQuery.data) return;
    setName(roleQuery.data.name);
    setDescription(roleQuery.data.description ?? '');
    setPerms(roleQuery.data.permissions);
  };

  if (roleQuery.isLoading || metaQuery.isLoading || !metaQuery.data) {
    return <p className="text-[var(--ms-text-muted)] text-sm">{t('loading')}</p>;
  }
  if (!roleQuery.data) {
    return <p className="text-[var(--ms-destructive-500)] text-sm">{t('roles_empty')}</p>;
  }
  const role = roleQuery.data;
  const isSystem = role.isSystem;

  return (
    <div className="space-y-4">
      <a
        href="/analitika/sozlamalar/rollar"
        className="text-[var(--ms-text-brand)] text-sm hover:underline"
      >
        {t('role_back')}
      </a>

      {/* Header card — name/description editor + system badge */}
      <section className="rounded-lg border border-[var(--ms-border)] bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="font-semibold text-[var(--ms-text-primary)] text-lg">{role.name}</h2>
            <Badge tone={systemTone(isSystem)}>
              {isSystem ? t('role_system') : t('role_custom')}
            </Badge>
            <span className="text-[var(--ms-text-muted)] text-xs">
              · {role.memberCount} {t('role_members').toLowerCase()}
            </span>
          </div>
          <div className="flex gap-2">
            {!isSystem && (
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={remove.isPending || role.memberCount > 0}
              >
                {t('role_delete')}
              </Button>
            )}
          </div>
        </div>

        {isSystem && (
          <p className="mt-3 rounded border border-blue-200 bg-blue-50 p-2 text-blue-900 text-xs">
            {t('role_system_locked')}
          </p>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="block text-[var(--ms-text-muted)]">{t('role_name')}</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSystem}
              className="mt-1"
              placeholder={t('role_name_ph')}
            />
          </label>
          <label className="block text-sm">
            <span className="block text-[var(--ms-text-muted)]">{t('role_desc')}</span>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSystem}
              className="mt-1"
              placeholder={t('role_desc_ph')}
            />
          </label>
        </div>
      </section>

      {/* Permission matrix */}
      <PermissionMatrix meta={metaQuery.data} value={perms} onChange={setPerms} />

      {/* Sticky save bar */}
      <div className="-mx-6 sticky bottom-0 z-20 border-[var(--ms-border)] border-t bg-white px-6 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[var(--ms-text-muted)] text-xs">
            {save.isSuccess && dirty === 0 && (
              <span className="text-[var(--ms-success-600)]">{t('role_saved')}</span>
            )}
            {/* role="alert" — G1 rad javobi (mavjud rolga o'zingda yo'q scope
                yozish) shu yerda chiqadi; ovozli o'quvchi e'lon qilishi kerak. */}
            {save.isError && !isOptimisticConflict(save.error) && (
              <span
                role="alert"
                className="text-[var(--ms-destructive-500)]"
                data-test-id="role-save-error"
              >
                {(save.error as Error)?.message}
              </span>
            )}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={handleDiscard}
              disabled={dirty === 0 || save.isPending}
            >
              {t('role_discard')}
            </Button>
            <Button onClick={() => save.mutate()} disabled={dirty === 0 || save.isPending}>
              {dirty > 0 ? t('role_save_changes', { n: dirty }) : t('role_save')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function serializeCells(cells: MatrixCell[]): string {
  return [...cells]
    .filter((c) => c.scope !== 'NO')
    .map((c) => `${c.entity}:${c.action}=${c.scope}`)
    .sort()
    .join('|');
}
