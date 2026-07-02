'use client';

import { api } from '@/lib/api-client';
import { Button, Checkbox, Icons, Input, useConfirm } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface ReasonCode {
  id: string;
  label: string;
  active: boolean;
}
interface ReasonListResponse {
  items: ReasonCode[];
  total: number;
}

export function ReasonCodesView() {
  const t = useTranslations('pages.analitika_settings');
  const qc = useQueryClient();
  const { confirm } = useConfirm();

  const reasonsQuery = useQuery<ReasonListResponse>({
    queryKey: ['analitika', 'reason-codes'],
    queryFn: () => api.get<ReasonListResponse>('/analitika/reason-codes'),
  });
  const [newLabel, setNewLabel] = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['analitika', 'reason-codes'] });

  const addReason = useMutation({
    mutationFn: () => api.post('/analitika/reason-codes', { label: newLabel.trim() }),
    onSuccess: () => {
      setNewLabel('');
      invalidate();
    },
  });
  const toggleReason = useMutation({
    mutationFn: (r: ReasonCode) =>
      api.patch(`/analitika/reason-codes/${r.id}`, { active: !r.active }),
    onSuccess: invalidate,
  });
  const removeReason = useMutation({
    mutationFn: (id: string) => api.delete(`/analitika/reason-codes/${id}`),
    onSuccess: invalidate,
  });

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: t('delete'),
      description: t('delete_confirm'),
      confirmLabel: t('delete'),
      cancelLabel: t('cancel'),
      tone: 'destructive',
    });
    if (ok) removeReason.mutate(id);
  };

  return (
    <section className="rounded-lg border border-[var(--ms-border)] bg-white p-5">
      <h2 className="font-medium text-[var(--ms-text-primary)]">{t('reason_title')}</h2>
      <p className="mt-1 text-[var(--ms-text-muted)] text-sm">{t('reason_hint')}</p>

      <div className="mt-4 flex items-center gap-2">
        <Input
          value={newLabel}
          placeholder={t('reason_label')}
          onChange={(e) => setNewLabel(e.target.value)}
          className="max-w-xs"
        />
        <Button
          variant="secondary"
          onClick={() => addReason.mutate()}
          disabled={addReason.isPending || newLabel.trim().length === 0}
        >
          {t('reason_add')}
        </Button>
        {addReason.isError && (
          <span className="text-[var(--ms-destructive-500)] text-sm">
            {(addReason.error as Error).message}
          </span>
        )}
      </div>

      <ul className="mt-4 divide-y divide-[var(--ms-border)]">
        {(reasonsQuery.data?.items ?? []).map((r) => (
          <li key={r.id} className="flex items-center justify-between py-2">
            <span
              className={
                r.active
                  ? 'text-[var(--ms-text-primary)]'
                  : 'text-[var(--ms-text-muted)] line-through'
              }
            >
              {r.label}
            </span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1 text-[var(--ms-text-muted)] text-xs">
                <Checkbox checked={r.active} onCheckedChange={() => toggleReason.mutate(r)} />
                {t('active')}
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('delete')}
                className="hover:text-[var(--ms-destructive-500)]"
                onClick={() => handleDelete(r.id)}
              >
                <Icons.delete className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
        {reasonsQuery.data && reasonsQuery.data.items.length === 0 && (
          <li className="py-3 text-[var(--ms-text-muted)] text-sm">{t('reason_empty')}</li>
        )}
      </ul>
    </section>
  );
}
