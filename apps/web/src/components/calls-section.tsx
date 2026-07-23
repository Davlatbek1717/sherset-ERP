'use client';

import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
import { callDirectionTone, callStatusTone } from '@/lib/domain-status-tone';
import { Badge, Button, FormSection, Icons } from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Call {
  id: string;
  direction: 'in' | 'out';
  channel: 'call' | 'sms' | 'email' | 'meeting';
  status: 'completed' | 'missed' | 'cancelled' | 'scheduled';
  startedAt: string;
  durationSec: number | null;
  externalNumber: string | null;
  summary: string | null;
  archived: boolean;
  contactPerson: { id: string; name: string } | null;
}

export interface CallsSectionProps {
  counterpartyId: string;
}

function formatDuration(sec: number | null): string {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s} с`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Inline Calls block for the Counterparty detail page.
 * Lists active calls/messages/meetings with click-to-call/email links and a
 * "+" button that jumps to the new-call form pre-filled with this counterparty.
 */
export function CallsSection({ counterpartyId }: CallsSectionProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTranslations('pages.calls');
  const tCommon = useTranslations('common');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ items: Call[] }>({
    queryKey: ['calls-of', counterpartyId],
    queryFn: () => api.get<{ items: Call[] }>(`/calls?counterpartyId=${counterpartyId}&limit=50`),
  });

  const archiveMut = useApiMutation({
    mutationFn: (id: string) => api.post<unknown>(`/calls/${id}/archive`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calls-of', counterpartyId] });
      qc.invalidateQueries({ queryKey: ['calls'] });
    },
  });

  const deleteMut = useApiMutation({
    mutationFn: (id: string) => api.delete<unknown>(`/calls/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calls-of', counterpartyId] });
      qc.invalidateQueries({ queryKey: ['calls'] });
      setConfirmingId(null);
    },
  });

  const items = data?.items ?? [];
  const count = items.length;

  return (
    <FormSection
      title={t('section_title')}
      description={count > 0 ? tCommon('records_count', { count }) : undefined}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[var(--ms-text-muted)] text-xs">
          {isLoading ? tCommon('loading') : count === 0 ? t('empty_title') : ''}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            router.push(`/calls/new?counterpartyId=${counterpartyId}`);
          }}
          data-test-id="add-call"
        >
          <Icons.create className="h-4 w-4" />
          {t('create_button')}
        </Button>
      </div>

      {count > 0 && (
        <div className="overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--ms-bg-muted)]">
              <tr>
                <th className="h-8 w-44 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('started_at')}
                </th>
                <th className="h-8 w-28 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('direction')}
                </th>
                <th className="h-8 w-28 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('channel')}
                </th>
                <th className="h-8 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('contact_person')}
                </th>
                <th className="h-8 w-24 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('duration')}
                </th>
                <th className="h-8 w-32 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('status')}
                </th>
                <th className="h-8 w-40 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {tCommon('actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr
                  key={c.id}
                  className="border-[var(--ms-border-default)] border-t"
                  data-test-id={`call-${c.id}`}
                >
                  <td className="px-3 py-2">
                    <a
                      href={`/calls/${c.id}`}
                      className="font-medium tabular-nums underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
                    >
                      {formatDateTime(c.startedAt)}
                    </a>
                    {c.archived && (
                      <Badge tone={archivedTone(c.archived)} className="ml-2">
                        {tCommon('archived')}
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={callDirectionTone(c.direction)}>
                      {t(`directions.${c.direction}`)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-[var(--ms-text-muted)] text-sm">
                    {t(`channels.${c.channel}`)}
                  </td>
                  <td className="px-3 py-2">
                    {c.contactPerson ? (
                      <a
                        href={`/contact-persons/${c.contactPerson.id}`}
                        className="text-[var(--ms-text-brand)] text-sm underline-offset-2 hover:underline"
                      >
                        {c.contactPerson.name}
                      </a>
                    ) : c.externalNumber ? (
                      <span className="text-sm tabular-nums">{c.externalNumber}</span>
                    ) : (
                      <span className="text-[var(--ms-text-muted)] text-xs">—</span>
                    )}
                    {c.summary && (
                      <span className="block max-w-[280px] truncate text-[var(--ms-text-muted)] text-[11px]">
                        {c.summary}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm tabular-nums">
                    {formatDuration(c.durationSec)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={callStatusTone(c.status)}>{t(`statuses.${c.status}`)}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {confirmingId === c.id ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteMut.mutate(c.id)}
                          loading={deleteMut.isPending}
                          data-test-id={`confirm-delete-${c.id}`}
                        >
                          {tCommon('delete')}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmingId(null)}>
                          {tCommon('cancel')}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1">
                        {!c.archived && (
                          <Button
                            size="sm"
                            variant="tertiary"
                            onClick={() => archiveMut.mutate(c.id)}
                            disabled={archiveMut.isPending}
                            data-test-id={`archive-${c.id}`}
                          >
                            <Icons.archive className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="tertiary"
                          onClick={() => setConfirmingId(c.id)}
                          data-test-id={`delete-${c.id}`}
                        >
                          <Icons.delete className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </FormSection>
  );
}
