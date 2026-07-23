'use client';

/**
 * Owner 2026-07-19 (2nd band): the module/tab toggle tree lives ON THE CARD
 * too, in the «Уведомления» area — same data as the «Настройка доступа»
 * modal (the selected role's RolePermission cells), saving independently.
 * The «Настроить права» button + its MoySklad modal stay untouched; both
 * surfaces share the ['role-detail', roleId] query, so saving in one
 * refreshes the other.
 */

import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import type { MatrixCell } from '@/lib/module-permissions';
import { Button } from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ModuleAccessEditor } from './module-access-editor';

interface RoleDetail {
  id: string;
  name: string;
  isSystem: boolean;
  version: number;
  permissions: MatrixCell[];
}

export function RoleAccessInline({ roleId }: { roleId: string }) {
  const t = useTranslations('pages.employee_card');
  const qc = useQueryClient();

  const roleQuery = useQuery<RoleDetail>({
    queryKey: ['role-detail', roleId],
    queryFn: () => api.get<RoleDetail>(`/roles/${roleId}`),
  });

  const [cells, setCells] = useState<MatrixCell[]>([]);
  useEffect(() => {
    if (roleQuery.data) setCells(roleQuery.data.permissions);
  }, [roleQuery.data]);

  const saveMutation = useApiMutation<unknown, Error, void>({
    mutationFn: () =>
      api.patch(`/roles/${roleId}`, {
        version: roleQuery.data?.version,
        permissions: cells,
      }),
    successMessage: t('rights_saved'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['role-detail'] });
      qc.invalidateQueries({ queryKey: ['roles'] });
    },
  });

  if (!roleQuery.data) {
    return <div className="py-4 text-[13px] text-[var(--ms-text-muted)]">…</div>;
  }

  return (
    <div className="flex flex-col gap-3" data-testid="role-access-inline">
      <ModuleAccessEditor value={cells} onChange={setCells} />
      {/* owner screenshot (3-rasm): «Отмена» then green «Сохранить», bottom-right */}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="secondary"
          onClick={() => setCells(roleQuery.data?.permissions ?? [])}
          data-testid="role-access-inline-reset"
        >
          {t('cancel')}
        </Button>
        <Button
          variant="success"
          onClick={() => saveMutation.mutate()}
          loading={saveMutation.isPending}
          data-testid="role-access-inline-save"
        >
          {t('save')}
        </Button>
      </div>
    </div>
  );
}
