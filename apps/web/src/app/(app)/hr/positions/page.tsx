'use client';

/**
 * HR Lavozimlar (Positions) — name-catalog CRUD + drill.
 *
 * Same shape as Bo'limlar, but each row is clickable → the position's
 * employee list (/hr/positions/{id}/employees), filtered by the position
 * name string. Edit/delete live in a stopPropagation action cell so they
 * don't trigger the drill. See spec §5.2.
 */

import { hrPositionApi } from '@/lib/hr-api';
import type { HrPosition } from '@/lib/hr-api';
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
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function HrPositionsPage() {
  const t = useTranslations('pages.hrPositions');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const router = useRouter();
  const { confirm } = useConfirm();
  const { toast } = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<HrPosition | null>(null);

  const {
    data: rows = [],
    isLoading,
    error,
    refetch,
  } = useQuery<HrPosition[]>({
    queryKey: ['hr-positions'],
    queryFn: () => hrPositionApi.list(),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => hrPositionApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-positions'] });
      toast.success(tCommon('saved'));
    },
    onError: (e: Error) => toast.error(tCommon('action_failed'), { description: e.message }),
  });

  const handleDelete = async (row: HrPosition) => {
    const ok = await confirm({
      title: t('delete_confirm'),
      description: row.name,
      confirmLabel: tCommon('delete'),
      tone: 'destructive',
    });
    if (ok) deleteMut.mutate(row.id);
  };

  const openDrill = (id: string) => router.push(`/hr/positions/${id}/employees`);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-semibold text-2xl text-[var(--ms-text-strong)]">{t('title')}</h1>
          <p className="text-[var(--ms-text-muted)] text-sm">{t('subtitle')}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-test-id="hr-positions-create">
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
        ) : rows.length === 0 ? (
          <EmptyState title={t('empty')} />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-app)] text-[var(--ms-text-muted)] text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t('col_name')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('col_employees')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('col_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  tabIndex={0}
                  className="cursor-pointer border-[var(--ms-border-default)] border-b last:border-b-0 hover:bg-[var(--ms-bg-hover)] focus:bg-[var(--ms-bg-hover)] focus:outline-none"
                  onClick={() => openDrill(row.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openDrill(row.id);
                    }
                  }}
                  data-test-id={`hr-position-row-${row.id}`}
                >
                  <td className="px-3 py-2 font-medium text-[var(--ms-text-primary)]">
                    {row.name}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone="neutral">{row.employeeCount ?? 0}</Badge>
                  </td>
                  <td
                    className="px-3 py-2"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setEditTarget(row)}
                        title={tCommon('edit')}
                        aria-label={tCommon('edit')}
                        data-test-id={`hr-position-edit-${row.id}`}
                      >
                        ✏️
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(row)}
                        title={tCommon('delete')}
                        aria-label={tCommon('delete')}
                        className="hover:text-[var(--ms-text-destructive)]"
                        data-test-id={`hr-position-delete-${row.id}`}
                      >
                        ❌
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <PositionFormModal open={createOpen} onOpenChange={setCreateOpen} mode="create" />
      <PositionFormModal
        open={!!editTarget}
        onOpenChange={(v) => !v && setEditTarget(null)}
        mode="edit"
        initial={editTarget}
      />
    </div>
  );
}

function PositionFormModal({
  open,
  onOpenChange,
  mode,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  initial?: HrPosition | null;
}) {
  const t = useTranslations('pages.hrPositions');
  const qc = useQueryClient();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? '');
    setError(null);
  }, [open, initial]);

  const saveMut = useMutation({
    mutationFn: () => {
      if (mode === 'edit' && initial) {
        return hrPositionApi.update(initial.id, { name: name.trim() });
      }
      return hrPositionApi.create({ name: name.trim() });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-positions'] });
      toast.success(t('save'));
      onOpenChange(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  const submit = () => {
    setError(null);
    if (!name.trim()) {
      setError(t('form_name'));
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
      testId="hr-position-modal"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button onClick={submit} disabled={saveMut.isPending} data-test-id="hr-position-save">
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
            htmlFor="hr-position-name"
            className="font-medium text-[var(--ms-text-primary)] text-sm"
          >
            {t('form_name')}
            <span className="ml-1 text-[var(--ms-text-destructive)]">*</span>
          </label>
          <Input
            id="hr-position-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-auto"
            data-test-id="hr-position-name-input"
          />
        </div>

        {error && (
          <div
            className="text-[var(--ms-text-destructive)] text-sm"
            role="alert"
            data-test-id="hr-position-modal-error"
          >
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
