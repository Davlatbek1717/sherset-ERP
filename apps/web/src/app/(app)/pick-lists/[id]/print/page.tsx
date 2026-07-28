'use client';

/**
 * /pick-lists/[id]/print — preview + print of a MoySklad-synced pick list.
 * Rendering lives in the shared <ReceiptPrintPortal> (also used by the
 * «Печать → Лист сборки» action on customer-orders/new + sales-returns/new).
 * The browser print dialog opens ONLY from the «Печать» button (owner v3);
 * the first print stamps printedAt.
 */

import {
  type ReceiptData,
  ReceiptPrintPortal,
  receiptDate,
} from '@/components/pick-list/receipt-print-portal';
import { api } from '@/lib/api-client';
import type { PickPosition } from '@/lib/pick-list-group';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface PickListDetail {
  id: string;
  name: string;
  docType: string;
  moment: string;
  agentName: string | null;
  agentPhone: string | null;
  ownerName: string | null;
  description: string | null;
  positions: Array<PickPosition & { uom?: string | null }>;
}

export default function PickListPrintPage() {
  const t = useTranslations('pages.pickLists');
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<PickListDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const printedRef = useRef(false);

  useEffect(() => {
    if (!params?.id) return;
    api
      .get<PickListDetail>(`/pick-lists/${params.id}`)
      .then(setDetail)
      .catch((e) => setError(String(e)));
  }, [params?.id]);

  const data: ReceiptData | null = detail
    ? {
        title: detail.docType === 'salesreturn' ? t('receipt_title_return') : t('receipt_title'),
        number: detail.name,
        dateStr: receiptDate(new Date(detail.moment)),
        agentName: detail.agentName,
        agentPhone: detail.agentPhone,
        ownerName: detail.ownerName,
        description: detail.description,
        positions: detail.positions.map((p) => ({
          name: p.name,
          qty: p.qty,
          uom: p.uom ?? null,
          cell: p.cell,
        })),
      }
    : null;

  return (
    <ReceiptPrintPortal
      data={data}
      error={error}
      onPrint={() => {
        if (detail && !printedRef.current) {
          printedRef.current = true;
          api.post(`/pick-lists/${detail.id}/printed`, {}).catch(() => {});
        }
      }}
    />
  );
}
