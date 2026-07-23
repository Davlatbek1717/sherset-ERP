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
  actualQty: string;
  // Post-time per-unit cost snapshot — null until the inventory is posted.
  costMinor: string | null;
  product: { id: string; name: string; code: string | null; uom: string | null } | null;
}

interface InventoryDetail {
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
 * «Инвентаризация» print form — the toolbar «Печать → Инвентаризация» target on
 * inventories/[id] and inventories/new (the /new item saves first, then opens
 * this tab). Two parties (Организация · Склад); lines carry the counted qty
 * («Фактический остаток») and the post-time cost — no discount, no VAT.
 */
export default function PrintInventoryPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const auto = searchParams.get('auto') === '1';
  const t = useTranslations('pages.print');

  const { data, isLoading } = useQuery<InventoryDetail>({
    queryKey: ['inventory', id],
    queryFn: () => api.get<InventoryDetail>(`/inventories/${id}`),
  });

  if (isLoading) return <div style={{ padding: 24 }}>Loading...</div>;
  if (!data) return <div style={{ padding: 24 }}>Not found</div>;

  let subtotalMinor = 0n;
  const positions: PrintDocPosition[] = data.positions.map((p) => {
    const totalMinor = scaleMinorByQty(BigInt(p.costMinor ?? '0'), p.actualQty || '0');
    subtotalMinor += totalMinor;
    return {
      position: p.position,
      productName: p.product?.name ?? '—',
      productCode: p.product?.code ?? null,
      uom: p.product?.uom ?? null,
      quantity: p.actualQty,
      priceMinor: p.costMinor ?? '0',
      totalMinor: totalMinor.toString(),
      discount: '0',
      vat: null,
    };
  });

  return (
    <PrintShell autoPrint={auto}>
      <PrintDoc
        docTitle={t('doc_title.inventory')}
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
        grandTotalMinor={data.sumMinor !== '0' ? data.sumMinor : subtotalMinor.toString()}
        description={data.description}
        signatures={[
          { label: t('signature.issued_by'), name: data.store.name },
          { label: t('signature.received_by'), name: data.organization.name },
        ]}
      />
    </PrintShell>
  );
}
