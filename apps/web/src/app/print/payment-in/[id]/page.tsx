'use client';

import { PrintReceipt } from '@/components/print/print-receipt';
import { PrintShell } from '@/components/print/print-shell';
import { api } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useSearchParams } from 'next/navigation';

interface PaymentDetail {
  id: string;
  name: string;
  moment: string;
  description: string | null;
  paymentPurpose: string | null;
  sumMinor: string;
  agent: {
    id: string;
    name: string;
    legalTitle: string | null;
    legalAddress: string | null;
    uzRequisites?: { inn?: string } | null;
  };
  organization: {
    id: string;
    name: string;
    legalTitle: string | null;
    legalAddress: string | null;
  };
}

export default function PrintPaymentInPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const auto = searchParams.get('auto') === '1';
  const t = useTranslations('pages.print');

  const { data, isLoading } = useQuery<PaymentDetail>({
    queryKey: ['payment-in', id],
    queryFn: () => api.get<PaymentDetail>(`/payments-in/${id}`),
  });

  if (isLoading) return <div style={{ padding: 24 }}>Loading...</div>;
  if (!data) return <div style={{ padding: 24 }}>Not found</div>;

  return (
    <PrintShell autoPrint={auto}>
      <PrintReceipt
        docTitle={t('doc_title.payment_in')}
        docNumber={data.name}
        docDate={data.moment}
        organization={{
          label: t('party.to'),
          name: data.organization.legalTitle ?? data.organization.name,
          details: data.organization.legalAddress,
        }}
        agent={{
          label: t('party.from'),
          name: data.agent.legalTitle ?? data.agent.name,
          details:
            [
              data.agent.legalAddress,
              data.agent.uzRequisites?.inn ? `STIR: ${data.agent.uzRequisites.inn}` : null,
            ]
              .filter(Boolean)
              .join('\n') || null,
        }}
        amountMinor={data.sumMinor}
        currency="UZS"
        purpose={data.paymentPurpose}
        description={data.description}
        signatures={[
          { label: t('signature.accountant'), name: data.organization.name },
          { label: t('signature.received_by'), name: data.agent.name },
        ]}
      />
    </PrintShell>
  );
}
