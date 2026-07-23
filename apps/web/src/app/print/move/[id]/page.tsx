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
  // Post-time per-unit cost snapshot — null until the move is posted
  // (the BE snapshots it from the source Stock row on «Проведено»).
  costMinor: string | null;
  product: { id: string; name: string; code: string | null; uom: string | null } | null;
}

interface MoveDetail {
  id: string;
  name: string;
  moment: string;
  description: string | null;
  sumMinor: string;
  currency: string;
  organization: { id: string; name: string };
  sourceStore: { id: string; name: string };
  destinationStore: { id: string; name: string };
  positions: PositionDetail[];
}

/**
 * «Перемещение» print form — the toolbar «Печать → Перемещение» target on
 * moves/[id] and moves/new (the /new item saves first, then opens this tab).
 * A move is an internal transfer: THREE parties (Организация · Со склада ·
 * На склад) and the lines carry the post-time cost — no discount, no VAT.
 */
export default function PrintMovePage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const auto = searchParams.get('auto') === '1';
  const t = useTranslations('pages.print');

  const { data, isLoading } = useQuery<MoveDetail>({
    queryKey: ['move', id],
    queryFn: () => api.get<MoveDetail>(`/moves/${id}`),
  });

  if (isLoading) return <div style={{ padding: 24 }}>Loading...</div>;
  if (!data) return <div style={{ padding: 24 }}>Not found</div>;

  let subtotalMinor = 0n;
  const positions: PrintDocPosition[] = data.positions.map((p) => {
    const totalMinor = scaleMinorByQty(BigInt(p.costMinor ?? '0'), p.quantity || '0');
    subtotalMinor += totalMinor;
    return {
      position: p.position,
      productName: p.product?.name ?? '—',
      productCode: p.product?.code ?? null,
      uom: p.product?.uom ?? null,
      quantity: p.quantity,
      priceMinor: p.costMinor ?? '0',
      totalMinor: totalMinor.toString(),
      discount: '0',
      vat: null,
    };
  });

  return (
    <PrintShell autoPrint={auto}>
      <PrintDoc
        docTitle={t('doc_title.move')}
        docNumber={data.name}
        docDate={data.moment}
        organization={{
          label: t('party.organization'),
          name: data.organization.name,
          details: null,
        }}
        agent={{
          label: t('party.store_from'),
          name: data.sourceStore.name,
          details: null,
        }}
        extraParties={[
          {
            label: t('party.store_to'),
            name: data.destinationStore.name,
            details: null,
          },
        ]}
        positions={positions}
        currency={data.currency || 'UZS'}
        subtotalMinor={subtotalMinor.toString()}
        vatTotalMinor="0"
        grandTotalMinor={data.sumMinor}
        description={data.description}
        signatures={[
          { label: t('signature.issued_by'), name: data.sourceStore.name },
          { label: t('signature.received_by'), name: data.destinationStore.name },
        ]}
      />
    </PrintShell>
  );
}
