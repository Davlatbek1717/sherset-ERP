'use client';

import { PrintDoc, type PrintDocPosition } from '@/components/print/print-doc';
import { PrintShell } from '@/components/print/print-shell';
import { ThermalShell } from '@/components/print/thermal-shell';
import { type ChekPosition, TovarChek } from '@/components/print/tovar-chek';
import { api } from '@/lib/api-client';
import { agentParty, orgParty, partySignatures } from '@/lib/print-party';
import { computePositionTotal, scaleMinorByQty } from '@moysklad/money';
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

interface OrderDetail {
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
    phone: string | null;
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
  owner: { id: string; name: string } | null;
  organizationAccount?: {
    accountNumber: string | null;
    bankName: string | null;
    bic: string | null;
  } | null;
  positions: PositionDetail[];
}

export default function PrintCustomerOrderPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const auto = searchParams.get('auto') === '1';
  const form = searchParams.get('form');
  // Chek eni — 80mm default (Xprinter), `?w=58` tor lenta uchun.
  const widthMm = searchParams.get('w') === '58' ? 58 : 80;
  const t = useTranslations('pages.print');

  const { data, isLoading } = useQuery<OrderDetail>({
    queryKey: ['customer-order', id],
    queryFn: () => api.get<OrderDetail>(`/customer-orders/${id}`),
  });

  if (isLoading) return <div style={{ padding: 24 }}>Loading...</div>;
  if (!data) return <div style={{ padding: 24 }}>Not found</div>;

  // ── ?form=chek — xaridorga beriladigan TOR chek ──────────────────────────
  if (form === 'chek') {
    // Chegirmasiz yalpi (narx × miqdor) — chekdagi «Chegirma» qatori uchun.
    let grossMinor = 0n;
    const chekPositions: ChekPosition[] = data.positions.map((p) => {
      const c = computePositionTotal(p, data.vatEnabled, data.vatIncluded);
      grossMinor += scaleMinorByQty(BigInt(p.priceMinor), p.quantity);
      return {
        position: p.position,
        name: p.product?.name ?? '—',
        code: p.product?.code ?? null,
        uom: p.product?.uom ?? null,
        quantity: p.quantity,
        priceMinor: p.priceMinor,
        sumMinor: c.totalMinor.toString(),
      };
    });
    return (
      <ThermalShell widthMm={widthMm} autoPrint={auto}>
        <TovarChek
          title={t('chek_title_sale')}
          docNumber={data.name}
          docDate={data.moment}
          orgName={data.organization.legalTitle ?? data.organization.name}
          orgPhone={data.organization.phone}
          sellerName={data.owner?.name ?? null}
          buyerName={data.agent.legalTitle ?? data.agent.name}
          buyerPhone={data.agent.phone}
          comment={data.description}
          reference={null}
          positions={chekPositions}
          totalMinor={data.sumMinor}
          subtotalMinor={grossMinor.toString()}
          widthMm={widthMm}
        />
      </ThermalShell>
    );
  }

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
        docTitle={t('doc_title.customer_order')}
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
