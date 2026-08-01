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

interface DemandDetail {
  id: string;
  name: string;
  moment: string;
  description: string | null;
  sumMinor: string;
  vatEnabled: boolean;
  vatIncluded: boolean;
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
  customerOrder: { id: string; name: string } | null;
  positions: PositionDetail[];
}

export default function PrintDemandPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const auto = searchParams.get('auto') === '1';
  const t = useTranslations('pages.print');

  const { data, isLoading } = useQuery<DemandDetail>({
    queryKey: ['demand', id],
    queryFn: () => api.get<DemandDetail>(`/demands/${id}`),
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
        docTitle={t('doc_title.demand')}
        docNumber={data.name}
        docDate={data.moment}
        organization={{
          label: t('party.organization'),
          name: data.organization.legalTitle ?? data.organization.name,
          // Full requisites — a printed primary document must identify the
          // issuer by STIR and bank, not just by name (the form used to print
          // the legal address alone even though the API returns all of this).
          details:
            [
              data.organization.legalAddress,
              data.organization.uzRequisites?.inn
                ? `${t('req.inn')}: ${data.organization.uzRequisites.inn}`
                : null,
              data.organizationAccount?.accountNumber
                ? `${t('req.account')}: ${data.organizationAccount.accountNumber}`
                : null,
              data.organizationAccount?.bankName,
              data.organizationAccount?.bic
                ? `${t('req.mfo')}: ${data.organizationAccount.bic}`
                : null,
              data.organization.phone ? `${t('req.phone')}: ${data.organization.phone}` : null,
            ]
              .filter(Boolean)
              .join('\n') || null,
        }}
        agent={{
          label: t('party.agent'),
          name: data.agent.legalTitle ?? data.agent.name,
          details:
            [
              data.agent.legalAddress,
              data.agent.uzRequisites?.inn
                ? `${t('req.inn')}: ${data.agent.uzRequisites.inn}`
                : null,
            ]
              .filter(Boolean)
              .join('\n') || null,
        }}
        reference={
          data.customerOrder ? `${t('doc_title.customer_order')} ${data.customerOrder.name}` : null
        }
        positions={positions}
        currency="UZS"
        subtotalMinor={subtotalMinor.toString()}
        vatTotalMinor={vatTotalMinor.toString()}
        grandTotalMinor={data.sumMinor}
        description={data.description}
        // moysklad/UZ practice: the issuing side signs by NAME and POSITION
        // (director, then chief accountant when the account records one), the
        // receiving side signs blank. Previously both lines just repeated the
        // company name, which is not a usable signature block.
        signatures={[
          {
            label: data.organization.directorPosition ?? t('signature.issued_by'),
            name: data.organization.director ?? data.organization.name,
          },
          ...(data.organization.chiefAccountant
            ? [
                {
                  label: t('signature.accountant'),
                  name: data.organization.chiefAccountant,
                },
              ]
            : []),
          { label: t('signature.received_by'), name: data.agent.name },
        ]}
      />
    </PrintShell>
  );
}
