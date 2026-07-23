'use client';

import { PrintDoc, type PrintDocPosition } from '@/components/print/print-doc';
import { PrintShell } from '@/components/print/print-shell';
import { api } from '@/lib/api-client';
import { scaleMinorByQty } from '@moysklad/money';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useSearchParams } from 'next/navigation';

interface PositionDetail {
  id: string;
  position: number;
  quantity: string;
  priceMinor: string | null;
  vat: number | null;
  product: {
    id: string;
    name: string;
    code: string | null;
    uom: string | null;
  } | null;
}

interface InternalOrderDetail {
  id: string;
  name: string;
  moment: string;
  description: string | null;
  sumMinor: string;
  vatSumMinor: string;
  vatIncluded: boolean;
  organization: { id: string; name: string };
  store: { id: string; name: string };
  positions: PositionDetail[];
}

/**
 * «Внутренний заказ» print form — the toolbar «Печать → Внутренний заказ»
 * target on internal-orders/new (the /new item saves first, then opens this
 * tab). An internal order is an internal stock-transfer request: the two
 * parties are Организация + Склад (destination) and the lines carry the
 * indicative «Цена» — no counterparty, no discount.
 */
export default function PrintInternalOrderPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const auto = searchParams.get('auto') === '1';
  const t = useTranslations('pages.print');

  const { data, isLoading } = useQuery<InternalOrderDetail>({
    queryKey: ['internal-order', id],
    queryFn: () => api.get<InternalOrderDetail>(`/internal-orders/${id}`),
  });

  if (isLoading) return <div style={{ padding: 24 }}>Loading...</div>;
  if (!data) return <div style={{ padding: 24 }}>Not found</div>;

  let subtotalMinor = 0n;
  const positions: PrintDocPosition[] = data.positions.map((p) => {
    const priceMinor = p.priceMinor ?? '0';
    const totalMinor = scaleMinorByQty(BigInt(priceMinor), p.quantity || '0');
    subtotalMinor += totalMinor;
    return {
      position: p.position,
      productName: p.product?.name ?? '—',
      productCode: p.product?.code ?? null,
      uom: p.product?.uom ?? null,
      quantity: p.quantity,
      priceMinor,
      totalMinor: totalMinor.toString(),
      discount: '0',
      vat: p.vat,
    };
  });

  const vatTotalMinor = BigInt(data.vatSumMinor || '0');
  // The stored header total is VAT-exclusive (additive convention) — when the
  // document prices don't include VAT, the payable grand total adds it on top.
  const grandTotalMinor = data.vatIncluded ? subtotalMinor : subtotalMinor + vatTotalMinor;

  return (
    <PrintShell autoPrint={auto}>
      <PrintDoc
        docTitle={t('doc_title.internal_order')}
        docNumber={data.name}
        docDate={data.moment}
        organization={{
          label: t('party.organization'),
          name: data.organization.name,
          details: null,
        }}
        agent={{
          label: t('party.store'),
          name: data.store.name,
          details: null,
        }}
        positions={positions}
        currency="UZS"
        subtotalMinor={subtotalMinor.toString()}
        vatTotalMinor={vatTotalMinor.toString()}
        grandTotalMinor={grandTotalMinor.toString()}
        description={data.description}
        signatures={[{ label: t('signature.issued_by'), name: data.organization.name }]}
      />
    </PrintShell>
  );
}
