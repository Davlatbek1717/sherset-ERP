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

interface SupplyDetail {
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
  positions: PositionDetail[];
}

export default function PrintSupplyPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const auto = searchParams.get('auto') === '1';
  const t = useTranslations('pages.print');

  const { data, isLoading } = useQuery<SupplyDetail>({
    queryKey: ['supply', id],
    queryFn: () => api.get<SupplyDetail>(`/supplies/${id}`),
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
        docTitle={t('doc_title.supply')}
        docNumber={data.name}
        docDate={data.moment}
        organization={{
          label: t('party.organization'),
          name: data.organization.legalTitle ?? data.organization.name,
          // To'liq rekvizit — chop etilgan birlamchi hujjat tomonni nomi bilan
          // emas, STIR va bank bilan tanitishi kerak. API bularni allaqachon
          // qaytarardi, shakl esa faqat manzilni chizardi (jo'natmadagi bilan
          // bir xil kamchilik, 2026-08-01 da tuzatildi).
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
              data.agent.uzRequisites?.inn ? `STIR: ${data.agent.uzRequisites.inn}` : null,
            ]
              .filter(Boolean)
              .join('\n') || null,
        }}
        positions={positions}
        currency="UZS"
        subtotalMinor={subtotalMinor.toString()}
        vatTotalMinor={vatTotalMinor.toString()}
        grandTotalMinor={data.sumMinor}
        description={data.description}
        // KIRUVCHI hujjat — yo'nalish jo'natmaga TESKARI: tashkilot OLADI,
        // ta'minlovchi BERADI. Shuning uchun direktor «Olgan» tomonda imzolaydi.
        // Ilgari ikkala qator ham shunchaki kompaniya nomini takrorlardi.
        signatures={[
          {
            label: data.organization.directorPosition ?? t('signature.received_by'),
            name: data.organization.director ?? data.organization.name,
          },
          ...(data.organization.chiefAccountant
            ? [{ label: t('signature.accountant'), name: data.organization.chiefAccountant }]
            : []),
          { label: t('signature.issued_by'), name: data.agent.name },
        ]}
      />
    </PrintShell>
  );
}
