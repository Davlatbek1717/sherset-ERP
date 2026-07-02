'use client';

/**
 * Counterparty CRM «Статус» manager — the moysklad-parity «Настроить…» inline status editor,
 * opened from the ⚙ next to the card's «Статус» dropdown (moysklad manages counterparty statuses
 * from the status dropdown itself, not a separate Settings page). Create / rename / recolour /
 * delete the account's counterparty States (entityType='counterparty').
 *
 * Mirrors group-manager-modal.tsx; the full-page equivalent is /settings/counterparty-statuses.
 * RU-styled (no i18n) — consistent with the «Массовое редактирование» / group-manager siblings.
 */

import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { Button, Icons, Input, Modal, useConfirm } from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

interface StatusRow {
  id: string;
  name: string;
  color: string | null;
}

// moysklad's saturated status palette (matches the climart counterparty hues + the
// /settings/counterparty-statuses page defaults).
const PALETTE = [
  '#E67E16',
  '#999999',
  '#E93A19',
  '#008739',
  '#A2C617',
  '#3B82F6',
  '#8B5CF6',
  '#6B7280',
];

export function CounterpartyStatusManagerModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { confirm } = useConfirm();
  const { data } = useQuery<{ items: StatusRow[] }>({
    queryKey: ['states', 'counterparty', 'active'],
    queryFn: () =>
      api.get<{ items: StatusRow[] }>('/states?entityType=counterparty&archived=false&limit=200'),
    enabled: open,
  });
  const [edits, setEdits] = useState<Record<string, { name: string; color: string | null }>>({});
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(PALETTE[0] ?? '#3B82F6');
  // Invalidate every `states` query so the card dropdown + list pill refresh too.
  const refetch = () => qc.invalidateQueries({ queryKey: ['states'] });

  const createMut = useApiMutation({
    mutationFn: (vars: { name: string; color: string }) =>
      api.post('/states', {
        entityType: 'counterparty',
        name: vars.name,
        color: vars.color,
        position: (data?.items.length ?? 0) * 10,
      }),
    onSuccess: () => {
      setNewName('');
      refetch();
    },
  });
  const renameMut = useApiMutation({
    mutationFn: (vars: { id: string; name: string; color: string | null }) =>
      api.patch(`/states/${vars.id}`, { name: vars.name, color: vars.color }),
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
    mutationFn: (id: string) => api.delete(`/states/${id}`),
    onSuccess: () => refetch(),
  });

  const rows = data?.items ?? [];

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Настройка статусов"
      widthClass="w-[520px]"
    >
      <div className="space-y-3" data-test-id="cp-status-manager">
        {rows.map((s) => {
          const e = edits[s.id] ?? { name: s.name, color: s.color };
          const dirty =
            e.name.trim().length > 0 && (e.name.trim() !== s.name || e.color !== s.color);
          return (
            <div key={s.id} className="flex items-center gap-2">
              <div className="flex gap-1">
                {PALETTE.map((c) => (
                  <button
                    type="button"
                    key={c}
                    aria-label={c}
                    onClick={() => setEdits((p) => ({ ...p, [s.id]: { ...e, color: c } }))}
                    className={`h-5 w-5 rounded-sm border-2 ${
                      e.color === c ? 'border-[var(--ms-text-brand)]' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <Input
                value={e.name}
                onChange={(ev) =>
                  setEdits((p) => ({ ...p, [s.id]: { ...e, name: ev.target.value } }))
                }
                data-test-id={`cp-status-name-${s.id}`}
              />
              <Button
                variant="secondary"
                disabled={!dirty || renameMut.isPending}
                onClick={() => renameMut.mutate({ id: s.id, name: e.name.trim(), color: e.color })}
              >
                Сохранить
              </Button>
              <Button
                variant="ghost"
                aria-label="Удалить статус"
                disabled={deleteMut.isPending}
                onClick={async () => {
                  const r = await confirm({
                    title: `Удалить статус «${s.name}»?`,
                    description: 'Контрагенты с этим статусом сохранятся (статус будет очищен).',
                    confirmLabel: 'Удалить',
                    tone: 'destructive',
                  });
                  if (r === true || r === 'confirm') deleteMut.mutate(s.id);
                }}
                data-test-id={`cp-status-delete-${s.id}`}
              >
                <Icons.delete className="h-4 w-4" />
              </Button>
            </div>
          );
        })}

        {/* Add a new status */}
        <div className="flex items-center gap-2 border-[var(--ms-border-default)] border-t pt-3">
          <div className="flex gap-1">
            {PALETTE.map((c) => (
              <button
                type="button"
                key={c}
                aria-label={`new-${c}`}
                onClick={() => setNewColor(c)}
                className={`h-5 w-5 rounded-sm border-2 ${
                  newColor === c ? 'border-[var(--ms-text-brand)]' : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Новый статус"
            data-test-id="cp-status-new-name"
          />
          <Button
            disabled={!newName.trim() || createMut.isPending}
            onClick={() => createMut.mutate({ name: newName.trim(), color: newColor })}
            data-test-id="cp-status-new-create"
          >
            Добавить
          </Button>
        </div>
      </div>
    </Modal>
  );
}
