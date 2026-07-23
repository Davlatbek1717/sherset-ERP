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
  // Loss line cost basis — a POSTED line carries its frozen себестоимость
  // (costMinor); a DRAFT line has none yet and falls back to the product cost
  // (buyPrice) — the same basis the detail grid's «Цена» shows.
  costMinor: string | null;
  product: {
    id: string;
    name: string;
    code: string | null;
    uom: string | null;
    buyPrice: string | null;
  } | null;
}

interface LossDetail {
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
 * «Списание» print form — the toolbar «Печать → ТОРГ-16 / МБ-8» target on
 * losses/[id] and losses/new (the /new items save first, then open this tab).
 * A loss is an internal stock-out: the two parties are Организация + Склад
 * (no counterparty) and the lines carry a bare cost — no discount, no VAT.
 */
export default function PrintLossPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const auto = searchParams.get('auto') === '1';
  const t = useTranslations('pages.print');

  const { data, isLoading } = useQuery<LossDetail>({
    queryKey: ['loss', id],
    queryFn: () => api.get<LossDetail>(`/losses/${id}`),
  });

  if (isLoading) return <div style={{ padding: 24 }}>Loading...</div>;
  if (!data) return <div style={{ padding: 24 }}>Not found</div>;

  let subtotalMinor = 0n;
  const positions: PrintDocPosition[] = data.positions.map((p) => {
    const costMinor = p.costMinor ?? p.product?.buyPrice ?? '0';
    const totalMinor = scaleMinorByQty(BigInt(costMinor), p.quantity || '0');
    subtotalMinor += totalMinor;
    return {
      position: p.position,
      productName: p.product?.name ?? '—',
      productCode: p.product?.code ?? null,
      uom: p.product?.uom ?? null,
      quantity: p.quantity,
      priceMinor: costMinor,
      totalMinor: totalMinor.toString(),
      discount: '0',
      vat: null,
    };
  });

  return (
    <PrintShell autoPrint={auto}>
      <PrintDoc
        docTitle={t('doc_title.loss')}
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
        signatures={[{ label: t('signature.issued_by'), name: data.organization.name }]}
      />
    </PrintShell>
  );
}
