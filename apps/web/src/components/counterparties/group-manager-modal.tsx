'use client';

/**
 * Counterparty «Группы» management modal — rename / delete the account's counterparty
 * groups (the m2m «Группы», distinct from «Отдел»). The forms + mass-edit already let
 * you CREATE a group inline, but a mistyped name was permanent (no edit/remove path),
 * even though the backend has supported PATCH/DELETE all along.
 *
 * RU-styled (no i18n) — consistent with the «Массовое редактирование» sibling and avoids
 * churning the parallel-owned ru/uz.json. Delete uses the shared ConfirmDialog (useConfirm),
 * never a native confirm; the group's m2m memberships cascade away, counterparties survive.
 */

import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { Button, Icons, Input, Modal, useConfirm } from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

interface Group {
  id: string;
  name: string;
}

export function CounterpartyGroupManagerModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { confirm } = useConfirm();
  const { data } = useQuery<{ items: Group[] }>({
    queryKey: ['counterparty-groups'],
    queryFn: () => api.get('/counterparty-groups'),
    enabled: open,
  });
  // Pending name edits, keyed by group id (un-keyed groups show their stored name).
  const [edits, setEdits] = useState<Record<string, string>>({});
  const refetch = () => qc.invalidateQueries({ queryKey: ['counterparty-groups'] });

  const renameMut = useApiMutation({
    mutationFn: (vars: { id: string; name: string }) =>
      api.patch(`/counterparty-groups/${vars.id}`, { name: vars.name }),
    onSuccess: (_r, vars) => {
      setEdits((p) => {
        const next = { ...p };
        delete next[(vars as { id: string }).id];
        return next;
      });
      refetch();
    },
  });
  const deleteMut = useApiMutation({
    mutationFn: (id: string) => api.delete(`/counterparty-groups/${id}`),
    onSuccess: () => refetch(),
  });

  const groups = data?.items ?? [];

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="Управление группами">
      <div className="space-y-2" data-test-id="cp-group-manager">
        {groups.length === 0 ? (
          <p className="text-[var(--ms-text-muted)] text-sm">Групп пока нет.</p>
        ) : (
          groups.map((g) => {
            const val = edits[g.id] ?? g.name;
            const dirty = val.trim().length > 0 && val.trim() !== g.name;
            return (
              <div key={g.id} className="flex items-center gap-2">
                <Input
                  value={val}
                  onChange={(e) => setEdits((p) => ({ ...p, [g.id]: e.target.value }))}
                  data-test-id={`cp-group-name-${g.id}`}
                />
                <Button
                  variant="secondary"
                  disabled={!dirty || renameMut.isPending}
                  onClick={() => renameMut.mutate({ id: g.id, name: val.trim() })}
                  data-test-id={`cp-group-save-${g.id}`}
                >
                  Сохранить
                </Button>
                <Button
                  variant="ghost"
                  aria-label="Удалить группу"
                  disabled={deleteMut.isPending}
                  onClick={async () => {
                    const r = await confirm({
                      title: `Удалить группу «${g.name}»?`,
                      description:
                        'Группа будет снята со всех контрагентов. Сами контрагенты сохранятся.',
                      confirmLabel: 'Удалить',
                      tone: 'destructive',
                    });
                    if (r === true || r === 'confirm') deleteMut.mutate(g.id);
                  }}
                  data-test-id={`cp-group-delete-${g.id}`}
                >
                  <Icons.delete className="h-4 w-4" />
                </Button>
              </div>
            );
          })
        )}
      </div>
    </Modal>
  );
}
