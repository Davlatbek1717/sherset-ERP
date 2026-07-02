'use client';

import { api } from '@/lib/api-client';
import { documentStateTone } from '@/lib/document-state-tone';
import { Badge, formatDate, formatMoney } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';

/**
 * «Счёт-фактура полученная» (FactureIn) — read-only detail.
 *
 * The facture is generated from a Приёмка (Supply) / Исходящий платёж; there is
 * no manual update endpoint (BE exposes GET /:id but no PATCH), so this is a
 * view, not an edit form. Before this page existed the list linked every row to
 * /factures-in/[id] which 404'd (1:1 plan §2.1).
 */
interface FactureInDetail {
  id: string;
  name: string;
  code: string | null;
  state: 'draft' | 'posted' | 'cancelled';
  moment: string;
  sumMinor: string;
  incomingNumber: string | null;
  incomingDate: string | null;
  agent: { id: string; name: string } | null;
  organization: { id: string; name: string } | null;
  supply: { id: string; name: string } | null;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-0.5 text-[var(--ms-text-muted)] text-xs">{label}</div>
      <div className="text-[var(--ms-text-primary)]">{value}</div>
    </div>
  );
}

export default function FactureInDetailPage() {
  const { id } = useParams<{ id: string }>();
  const tCommon = useTranslations('common');
  const t = useTranslations('pages.factures_in');
  const tFields = useTranslations('fields');
  const tStates = useTranslations('states.facture');

  const { data, isLoading } = useQuery<FactureInDetail>({
    queryKey: ['facture-in', id],
    queryFn: () => api.get<FactureInDetail>(`/factures-in/${id}`),
  });

  if (isLoading) {
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  }
  if (!data) {
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('not_found')}</div>;
  }

  return (
    <div className="max-w-2xl p-4" data-test-id="facture-in-detail-page">
      <div className="mb-4">
        <a href="/factures-in" className="text-[var(--ms-text-brand)] text-sm hover:underline">
          ← {t('title')}
        </a>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <h1 className="font-bold text-[var(--ms-text-primary)] text-xl">{data.name}</h1>
        <Badge tone={documentStateTone(data.state)}>{tStates(data.state)}</Badge>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] p-4 text-sm">
        <Field label={t('col_time')} value={formatDate(data.moment)} />
        {data.agent && <Field label={tFields('agent')} value={data.agent.name} />}
        {data.organization && (
          <Field label={tFields('organization')} value={data.organization.name} />
        )}
        <Field label={t('col_incoming_number')} value={data.incomingNumber ?? '—'} />
        <Field
          label={t('col_incoming_date')}
          value={data.incomingDate ? formatDate(data.incomingDate) : '—'}
        />
        <Field label={tFields('sum')} value={formatMoney(data.sumMinor)} />
        {data.supply && (
          <div>
            <div className="mb-0.5 text-[var(--ms-text-muted)] text-xs">{t('col_supply')}</div>
            <a
              href={`/supplies/${data.supply.id}`}
              className="text-[var(--ms-text-brand)] hover:underline"
            >
              {data.supply.name}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
