'use client';

/**
 * «Склады» — «Массовое редактирование» modal.
 *
 * Field set NOT captured live (the GWT menu ignored automation clicks —
 * docs/audits/stores-1to1-2026-07-03/GROUND.md §NOT-captured); mirrored from
 * the live-grounded counterparty mass-edit wizard (2026-06-18) restricted to
 * the store model: Архивный · Владелец-сотрудник · Владелец-отдел · Общий
 * доступ. Each field is opt-in via a leading checkbox; only enabled fields
 * land in POST /admin/stores/bulk-update. RU-styled like the assortment /
 * counterparty siblings (moysklad-parity wizards are intentionally not i18n).
 */

import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { Button, Checkbox, Combobox, Modal, NativeSelect } from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

interface BulkResult {
  total: number;
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
}

interface RefItem {
  id: string;
  name: string;
}

const YES_NO = [
  { value: 'true', label: 'Да' },
  { value: 'false', label: 'Нет' },
];

function FieldRow({
  label,
  enabled,
  onToggle,
  children,
}: {
  label: string;
  enabled: boolean;
  onToggle(next: boolean): void;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[24px_170px_minmax(0,1fr)] items-center gap-2 py-1">
      <Checkbox checked={enabled} onCheckedChange={(v) => onToggle(!!v)} />
      <span className="text-[12px] text-[var(--ms-text-primary)]">{label}</span>
      <div className={enabled ? '' : 'pointer-events-none opacity-50'}>{children}</div>
    </div>
  );
}

export function StoresMassEditModal({
  open,
  onClose,
  selectedIds,
  listQueryKey,
  onDone,
}: {
  open: boolean;
  onClose(): void;
  selectedIds: Set<string>;
  listQueryKey: readonly unknown[];
  onDone(): void;
}) {
  const qc = useQueryClient();
  const [useArchived, setUseArchived] = useState(false);
  const [archived, setArchived] = useState('false');
  const [useOwner, setUseOwner] = useState(false);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [useDept, setUseDept] = useState(false);
  const [deptId, setDeptId] = useState<string | null>(null);
  const [useShared, setUseShared] = useState(false);
  const [shared, setShared] = useState('true');

  const { data: employees } = useQuery<{ items: RefItem[] }>({
    queryKey: ['employees', 'mass-edit-ref'],
    queryFn: () => api.get<{ items: RefItem[] }>('/employees?limit=100'),
    enabled: open,
    staleTime: 60_000,
  });
  const { data: groups } = useQuery<{ items: RefItem[] }>({
    queryKey: ['groups', 'mass-edit-ref'],
    queryFn: () => api.get<{ items: RefItem[] }>('/groups?limit=100'),
    enabled: open,
    staleTime: 60_000,
  });

  const mutation = useApiMutation({
    mutationFn: async () => {
      const set: Record<string, unknown> = {};
      if (useArchived) set.archived = archived === 'true';
      if (useOwner) set.ownerId = ownerId;
      if (useDept) set.groupId = deptId;
      if (useShared) set.shared = shared === 'true';
      return api.post<BulkResult>('/admin/stores/bulk-update', {
        ids: Array.from(selectedIds),
        set,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listQueryKey });
      qc.invalidateQueries({ queryKey: ['stores'] });
      onDone();
      onClose();
    },
  });

  const anyField = useArchived || useOwner || useDept || useShared;

  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title="Массовое редактирование"
      widthClass="w-[520px]"
      testId="stores-mass-edit-modal"
      footer={
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={!anyField || selectedIds.size === 0 || mutation.isPending}
            loading={mutation.isPending}
            data-test-id="stores-mass-edit-apply"
          >
            Изменить
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Отменить
          </Button>
        </div>
      }
    >
      <div className="space-y-1 py-1">
        <div className="pb-2 text-[12px] text-[var(--ms-text-muted)]">
          {selectedIds.size > 0
            ? `Выбрано складов: ${selectedIds.size}`
            : 'Не выбран ни один склад — отметьте строки в списке.'}
        </div>
        <FieldRow label="Архивный" enabled={useArchived} onToggle={setUseArchived}>
          <NativeSelect value={archived} onChange={(e) => setArchived(e.target.value)}>
            {YES_NO.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </FieldRow>
        <FieldRow label="Владелец-сотрудник" enabled={useOwner} onToggle={setUseOwner}>
          <Combobox
            id="stores-mass-edit-owner"
            testId="stores-mass-edit-owner"
            items={(employees?.items ?? []).map((e) => ({ value: e.id, label: e.name }))}
            value={ownerId ?? undefined}
            onChange={(next) => setOwnerId(next ?? null)}
            placeholder=""
            searchPlaceholder="Поиск"
            emptyText="Ничего не найдено"
            ariaLabel="Владелец-сотрудник"
          />
        </FieldRow>
        <FieldRow label="Владелец-отдел" enabled={useDept} onToggle={setUseDept}>
          <Combobox
            id="stores-mass-edit-dept"
            testId="stores-mass-edit-dept"
            items={(groups?.items ?? []).map((g) => ({ value: g.id, label: g.name }))}
            value={deptId ?? undefined}
            onChange={(next) => setDeptId(next ?? null)}
            placeholder=""
            searchPlaceholder="Поиск"
            emptyText="Ничего не найдено"
            ariaLabel="Владелец-отдел"
          />
        </FieldRow>
        <FieldRow label="Общий доступ" enabled={useShared} onToggle={setUseShared}>
          <NativeSelect value={shared} onChange={(e) => setShared(e.target.value)}>
            {YES_NO.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </FieldRow>
      </div>
    </Modal>
  );
}
