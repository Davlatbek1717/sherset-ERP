'use client';

/**
 * Xaridordan qaytarish cheki — TOR «TOVAR CHEKI» formatida (2026-07-17 talab).
 * Eski A4 `PrintDoc` almashtirildi — buyurtma/jo'natma bilan bir xil format,
 * sarlavha «Qaytarish cheki», asos qatorida jo'natma/buyurtma raqami.
 */

import { ThermalShell } from '@/components/print/thermal-shell';
import { type ChekPosition, TovarChek } from '@/components/print/tovar-chek';
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

interface SalesReturnDetail {
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
    phone: string | null;
  };
  organization: {
    id: string;
    name: string;
    legalTitle: string | null;
    phone: string | null;
  };
  owner: { id: string; name: string } | null;
  demand: { id: string; name: string } | null;
  customerOrder: { id: string; name: string } | null;
  positions: PositionDetail[];
}

export default function PrintSalesReturnPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const auto = searchParams.get('auto') === '1';
  // Chek eni — 80mm default (Xprinter), `?w=58` tor lenta uchun.
  const widthMm = searchParams.get('w') === '58' ? 58 : 80;
  const t = useTranslations('pages.print');

  const { data, isLoading } = useQuery<SalesReturnDetail>({
    queryKey: ['sales-return', id],
    queryFn: () => api.get<SalesReturnDetail>(`/sales-returns/${id}`),
  });

  if (isLoading) return <div style={{ padding: 24 }}>Loading...</div>;
  if (!data) return <div style={{ padding: 24 }}>Not found</div>;

  const positions: ChekPosition[] = data.positions.map((p) => {
    const c = computePositionTotal(p, data.vatEnabled, data.vatIncluded);
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

  const reference = data.demand
    ? `${t('doc_title.demand')} ${data.demand.name}`
    : data.customerOrder
      ? `${t('doc_title.customer_order')} ${data.customerOrder.name}`
      : null;

  return (
    <ThermalShell widthMm={widthMm} autoPrint={auto}>
      <TovarChek
        title={t('chek_title_return')}
        docNumber={data.name}
        docDate={data.moment}
        orgName={data.organization.legalTitle ?? data.organization.name}
        orgPhone={data.organization.phone}
        sellerName={data.owner?.name ?? null}
        buyerName={data.agent.legalTitle ?? data.agent.name}
        buyerPhone={data.agent.phone}
        comment={data.description}
        reference={reference}
        positions={positions}
        totalMinor={data.sumMinor}
        widthMm={widthMm}
      />
    </ThermalShell>
  );
}
