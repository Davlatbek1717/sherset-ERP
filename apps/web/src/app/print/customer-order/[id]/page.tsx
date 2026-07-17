'use client';

/**
 * Buyurtma savdo cheki — TOR «TOVAR CHEKI» formatida (2026-07-17 talab).
 *
 * Ilgari bu sahifa A4 `PrintDoc` (TASHKILOT/KONTRAGENT kartalari, QQS ustuni,
 * imzo chiziqlari) chiqarardi — foydalanuvchi «tartibsiz» deb topdi va
 * «Elektro sentr» namunasidagi tor tovar-chek formatini so'radi. Endi
 * `ThermalShell` (80mm, `?w=58` bilan 58mm) + `TovarChek` ishlatiladi.
 * Xuddi shu format: demand (jo'natma) va sales-return (qaytarish).
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
    phone: string | null;
  };
  organization: {
    id: string;
    name: string;
    legalTitle: string | null;
    phone: string | null;
  };
  owner: { id: string; name: string } | null;
  positions: PositionDetail[];
}

export default function PrintCustomerOrderPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const auto = searchParams.get('auto') === '1';
  // Chek eni — 80mm default (Xprinter), `?w=58` tor lenta uchun.
  const widthMm = searchParams.get('w') === '58' ? 58 : 80;
  const t = useTranslations('pages.print');

  const { data, isLoading } = useQuery<OrderDetail>({
    queryKey: ['customer-order', id],
    queryFn: () => api.get<OrderDetail>(`/customer-orders/${id}`),
  });

  if (isLoading) return <div style={{ padding: 24 }}>Loading...</div>;
  if (!data) return <div style={{ padding: 24 }}>Not found</div>;

  // Qator jami — chegirma/QQS hisobga olingan (hujjatdagi bilan bir xil hisob).
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
        positions={positions}
        totalMinor={data.sumMinor}
        widthMm={widthMm}
      />
    </ThermalShell>
  );
}
