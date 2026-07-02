'use client';

/**
 * HR Roles CRUD — Sozlamalar → Rollar.
 *
 * Lists every HrRole with inline-edit on `label` (technical `value` is
 * immutable after create). Standart (isDefault=true) rolls cannot be
 * deleted — the API enforces this; we mirror it client-side as a
 * disabled button + tooltip.
 */

import { systemTone } from '@/lib/domain-status-tone';
import { hrRoleApi } from '@/lib/hr-api';
import type { HrRole } from '@/lib/hr-api';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  Skeleton,
  useConfirm,
  useToast,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export default function HrRolesPage() {
  const t = useTranslations('pages.hrRoles');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const { confirm } = useConfirm();
  const { toast } = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<HrRole | null>(null);

  const {
    data: roles = [],
    isLoading,
    error,
    refetch,
  } = useQuery<HrRole[]>({
    queryKey: ['hr-roles'],
    queryFn: () => hrRoleApi.list(),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => hrRoleApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-roles'] });
      toast.success(tCommon('saved'));
    },
    onError: (e: Error) => toast.error(tCommon('action_failed'), { description: e.message }),
  });

  const handleDelete = async (row: HrRole) => {
    if (row.isDefault) return;
    const ok = await confirm({
      title: t('delete_confirm'),
      description: row.label,
      confirmLabel: tCommon('delete'),
      tone: 'destructive',
    });
    if (ok) deleteMut.mutate(row.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-semibold text-2xl text-[var(--ms-text-strong)]">{t('title')}</h1>
          <p className="text-[var(--ms-text-muted)] text-sm">{t('subtitle')}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-test-id="hr-roles-create">
          + {t('create_button')}
        </Button>
      </div>

      <div className="overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]">
        {isLoading ? (
          <div className="p-4">
            <Skeleton className="h-8 w-full" />
          </div>
        ) : error ? (
          <ErrorState
            title={tCommon('action_failed')}
            description={(error as Error).message}
            onRetry={() => refetch()}
          />
        ) : roles.length === 0 ? (
          <EmptyState title={t('empty')} />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-app)] text-[var(--ms-text-muted)] text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t('col_label')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('col_value')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('col_type')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('col_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((row) => (
                <tr
                  key={row.id}
                  className="border-[var(--ms-border-default)] border-b last:border-b-0"
                  data-test-id={`hr-role-row-${row.value}`}
                >
                  <td className="px-3 py-2 font-medium text-[var(--ms-text-primary)]">
                    {row.label}
                  </td>
                  <td className="px-3 py-2 font-mono text-[var(--ms-text-muted)] text-xs">
                    {row.value}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={systemTone(row.isDefault)}>
                      {row.isDefault ? t('type_default') : t('type_custom')}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setEditTarget(row)}
                        title={tCommon('edit')}
                        aria-label={tCommon('edit')}
                        data-test-id={`hr-role-edit-${row.value}`}
                      >
                        ✏️
                      </Button>
                      {/* span carries the tooltip: DS Button sets
                          disabled:pointer-events-none, so a disabled button's own
                          title never fires — the wrapper still receives hover. */}
                      <span title={row.isDefault ? t('delete_default_blocked') : undefined}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleDelete(row)}
                          disabled={row.isDefault}
                          title={row.isDefault ? undefined : tCommon('delete')}
                          aria-label={tCommon('delete')}
                          className="hover:text-[var(--ms-text-destructive)]"
                          data-test-id={`hr-role-delete-${row.value}`}
                        >
                          ❌
                        </Button>
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <RoleFormModal open={createOpen} onOpenChange={setCreateOpen} mode="create" />
      <RoleFormModal
        open={!!editTarget}
        onOpenChange={(v) => !v && setEditTarget(null)}
        mode="edit"
        initial={editTarget}
      />
    </div>
  );
}

function RoleFormModal({
  open,
  onOpenChange,
  mode,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  initial?: HrRole | null;
}) {
  const t = useTranslations('pages.hrRoles');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const { toast } = useToast();

  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValue(initial?.value ?? '');
    setLabel(initial?.label ?? '');
    setError(null);
  }, [open, initial]);

  const saveMut = useMutation({
    mutationFn: () => {
      if (mode === 'edit' && initial) {
        return hrRoleApi.update(initial.id, { label: label.trim() });
      }
      return hrRoleApi.create({ value: value.trim(), label: label.trim() });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-roles'] });
      toast.success(tCommon('saved'));
      onOpenChange(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  const submit = () => {
    setError(null);
    if (mode === 'create' && !value.trim()) {
      setError(t('form_value'));
      return;
    }
    if (!label.trim()) {
      setError(t('form_label'));
      return;
    }
    saveMut.mutate();
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={mode === 'edit' ? t('edit_title') : t('create_title')}
      widthClass="w-[480px]"
      testId="hr-role-modal"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button onClick={submit} disabled={saveMut.isPending} data-test-id="hr-role-save">
            {t('save')}
          </Button>
        </div>
      }
    >
      <div
        className="flex flex-col gap-4 p-4"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
      >
        <div className="flex flex-col gap-1">
          <label
            htmlFor="hr-role-value"
            className="font-medium text-[var(--ms-text-primary)] text-sm"
          >
            {t('form_value')}
            <span className="ml-1 text-[var(--ms-text-destructive)]">*</span>
          </label>
          <Input
            id="hr-role-value"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={mode === 'edit'}
            className="w-auto font-mono"
            data-test-id="hr-role-value-input"
          />
          <span className="text-[var(--ms-text-muted)] text-xs">{t('form_value_hint')}</span>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="hr-role-label"
            className="font-medium text-[var(--ms-text-primary)] text-sm"
          >
            {t('form_label')}
            <span className="ml-1 text-[var(--ms-text-destructive)]">*</span>
          </label>
          <Input
            id="hr-role-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-auto"
            data-test-id="hr-role-label-input"
          />
        </div>

        {error && (
          <div
            className="text-[var(--ms-text-destructive)] text-sm"
            role="alert"
            data-test-id="hr-role-modal-error"
          >
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
