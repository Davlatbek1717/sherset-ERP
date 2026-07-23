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
  // Enter line cost basis — the grid's «Цена» (no VAT / no discount on an enter).
  costMinor: string;
  product: { id: string; name: string; code: string | null; uom: string | null } | null;
}

interface EnterDetail {
  id: string;
  name: string;
  moment: string;
  description: string | null;
  sumMinor: string;
  organization: { id: string; name: string };
  store: { id: string; name: string };
  positions: PositionDetail[];
}

/**
 * «Оприходование» print form — the toolbar «Печать → Оприходование» target on
 * enters/[id] and enters/new (the /new item saves first, then opens this tab).
 * An enter is an internal stock-in: the two parties are Организация + Склад
 * (no counterparty) and the lines carry a bare cost — no discount, no VAT.
 */
export default function PrintEnterPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const auto = searchParams.get('auto') === '1';
  const t = useTranslations('pages.print');

  const { data, isLoading } = useQuery<EnterDetail>({
    queryKey: ['enter', id],
    queryFn: () => api.get<EnterDetail>(`/enters/${id}`),
  });

  if (isLoading) return <div style={{ padding: 24 }}>Loading...</div>;
  if (!data) return <div style={{ padding: 24 }}>Not found</div>;

  let subtotalMinor = 0n;
  const positions: PrintDocPosition[] = data.positions.map((p) => {
    const totalMinor = scaleMinorByQty(BigInt(p.costMinor || '0'), p.quantity || '0');
    subtotalMinor += totalMinor;
    return {
      position: p.position,
      productName: p.product?.name ?? '—',
      productCode: p.product?.code ?? null,
      uom: p.product?.uom ?? null,
      quantity: p.quantity,
      priceMinor: p.costMinor,
      totalMinor: totalMinor.toString(),
      discount: '0',
      vat: null,
    };
  });

  return (
    <PrintShell autoPrint={auto}>
      <PrintDoc
        docTitle={t('doc_title.enter')}
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
        vatTotalMinor="0"
        grandTotalMinor={data.sumMinor}
        description={data.description}
        signatures={[{ label: t('signature.received_by'), name: data.organization.name }]}
      />
    </PrintShell>
  );
}
