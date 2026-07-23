'use client';

import { PrintDoc, type PrintDocPosition } from '@/components/print/print-doc';
import { PrintShell } from '@/components/print/print-shell';
import { api } from '@/lib/api-client';
import { computePositionTotal } from '@moysklad/money';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useSearchParams } from 'next/navigation';

interface PositionDetail {
  id: string;
  position: number;
  quantity: string;
  priceMinor: string;
  discount: string;
  vat: number | null;
  product: { id: string; name: string; code: string | null; uom: string | null } | null;
}

interface InvoiceDetail {
  id: string;
  name: string;
  moment: string;
  description: string | null;
  sumMinor: string;
  vatEnabled: boolean;
  vatIncluded: boolean;
  currency: string;
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
  positions: PositionDetail[];
}

export default function PrintInvoiceInPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const auto = searchParams.get('auto') === '1';
  const t = useTranslations('pages.print');

  const { data, isLoading } = useQuery<InvoiceDetail>({
    queryKey: ['invoice-in', id],
    queryFn: () => api.get<InvoiceDetail>(`/invoices-in/${id}`),
  });

  if (isLoading) return <div style={{ padding: 24 }}>Loading...</div>;
  if (!data) return <div style={{ padding: 24 }}>Not found</div>;

  let subtotalMinor = 0n;
  let vatTotalMinor = 0n;
  const positions: PrintDocPosition[] = data.positions.map((p) => {
    const c = computePositionTotal(p, data.vatEnabled, data.vatIncluded);
    subtotalMinor += c.baseMinor;
    vatTotalMinor += c.vatAmountMinor;
    return {
      position: p.position,
      productName: p.product?.name ?? '—',
      productCode: p.product?.code ?? null,
      uom: p.product?.uom ?? null,
      quantity: p.quantity,
      priceMinor: p.priceMinor,
      totalMinor: c.totalMinor.toString(),
      discount: p.discount,
      vat: p.vat,
      vatAmountMinor: c.vatAmountMinor.toString(),
    };
  });

  return (
    <PrintShell autoPrint={auto}>
      <PrintDoc
        docTitle={t('doc_title.invoice_in')}
        docNumber={data.name}
        docDate={data.moment}
        organization={{
          label: t('party.organization'),
          name: data.organization.legalTitle ?? data.organization.name,
          details: data.organization.legalAddress,
        }}
        agent={{
          label: t('party.agent'),
          name: data.agent.legalTitle ?? data.agent.name,
          details:
            [
              data.agent.legalAddress,
              data.agent.uzRequisites?.inn ? `STIR: ${data.agent.uzRequisites.inn}` : null,
            ]
              .filter(Boolean)
              .join('\n') || null,
        }}
        positions={positions}
        currency={data.currency}
        subtotalMinor={subtotalMinor.toString()}
        vatTotalMinor={vatTotalMinor.toString()}
        grandTotalMinor={data.sumMinor}
        description={data.description}
        signatures={[
          { label: t('signature.director'), name: data.organization.name },
          { label: t('signature.received_by'), name: data.agent.name },
        ]}
      />
    </PrintShell>
  );
}
