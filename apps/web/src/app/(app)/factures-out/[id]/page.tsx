'use client';

import { api } from '@/lib/api-client';
import { documentStateTone } from '@/lib/document-state-tone';
import { Badge, formatDate, formatMoney } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';

/**
 * «Счёт-фактура выданная» (FactureOut) — read-only detail.
 *
 * Generated from an Отгрузка (Demand); no manual update endpoint (BE exposes
 * GET /:id but no PATCH), so this is a view, not an edit form. Before this page
 * existed the list linked every row to /factures-out/[id] which 404'd
 * (1:1 plan §2.1). Unlike the received facture there is no «Входящий №»/«дата» —
 * an issued facture carries only its own number (name).
 */
interface FactureOutDetail {
  id: string;
  name: string;
  code: string | null;
  state: 'draft' | 'posted' | 'cancelled';
  moment: string;
  sumMinor: string;
  agent: { id: string; name: string } | null;
  organization: { id: string; name: string } | null;
  demand: { id: string; name: string } | null;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-0.5 text-[var(--ms-text-muted)] text-xs">{label}</div>
      <div className="text-[var(--ms-text-primary)]">{value}</div>
    </div>
  );
}

export default function FactureOutDetailPage() {
  const { id } = useParams<{ id: string }>();
  const tCommon = useTranslations('common');
  const t = useTranslations('pages.factures_out');
  const tFields = useTranslations('fields');
  const tStates = useTranslations('states.facture');

  const { data, isLoading } = useQuery<FactureOutDetail>({
    queryKey: ['facture-out', id],
    queryFn: () => api.get<FactureOutDetail>(`/factures-out/${id}`),
  });

  if (isLoading) {
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  }
  if (!data) {
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('not_found')}</div>;
  }

  return (
    <div className="max-w-2xl p-4" data-test-id="facture-out-detail-page">
      <div className="mb-4">
        <a href="/factures-out" className="text-[var(--ms-text-brand)] text-sm hover:underline">
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
        <Field label={tFields('sum')} value={formatMoney(data.sumMinor)} />
        {data.demand && (
          <div>
            <div className="mb-0.5 text-[var(--ms-text-muted)] text-xs">{t('col_demand')}</div>
            <a
              href={`/demands/${data.demand.id}`}
              className="text-[var(--ms-text-brand)] hover:underline"
            >
              {data.demand.name}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
