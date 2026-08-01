'use client';

import { PrintDoc, type PrintDocPosition } from '@/components/print/print-doc';
import { PrintShell } from '@/components/print/print-shell';
import { api } from '@/lib/api-client';
import { agentParty, orgParty, partySignatures } from '@/lib/print-party';
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
  vatSumMinor: string;
  vatEnabled: boolean;
  vatIncluded: boolean;
  agent: {
    id: string;
    name: string;
    legalTitle: string | null;
    legalAddress: string | null;
    uzRequisites?: { inn?: string } | null;
    phone: string | null;
  };
  organization: {
    id: string;
    name: string;
    legalTitle: string | null;
    legalAddress: string | null;
    phone: string | null;
    director: string | null;
    directorPosition: string | null;
    chiefAccountant: string | null;
    uzRequisites?: { inn?: string } | null;
  };
  organizationAccount?: {
    accountNumber: string | null;
    bankName: string | null;
    bic: string | null;
  } | null;
  positions: PositionDetail[];
}

export default function PrintInvoiceOutPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const auto = searchParams.get('auto') === '1';
  const t = useTranslations('pages.print');

  const { data, isLoading } = useQuery<InvoiceDetail>({
    queryKey: ['invoice-out', id],
    queryFn: () => api.get<InvoiceDetail>(`/invoices-out/${id}`),
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
        docTitle={t('doc_title.invoice_out')}
        docNumber={data.name}
        docDate={data.moment}
        organization={orgParty(
          t,
          t('party.organization'),
          data.organization,
          data.organizationAccount,
        )}
        agent={agentParty(t, t('party.agent'), data.agent)}
        positions={positions}
        currency="UZS"
        subtotalMinor={subtotalMinor.toString()}
        vatTotalMinor={vatTotalMinor.toString()}
        grandTotalMinor={data.sumMinor}
        description={data.description}
        signatures={partySignatures(
          t,
          data.organization,
          data.agent.name,
          t('signature.received_by'),
        )}
      />
    </PrintShell>
  );
}
