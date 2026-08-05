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
import { useParams, useSearchParams } from 'next/navigation';
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
  /**
   * Yacheyka qoplamasi (MoySklad buyurtmalarida).
   *
   * NEGA CHEKDAN OLDIN KO'RSATILADI: omborchi chekni qo'liga olib ketadi.
   * «3 pozitsiyada yacheyka yo'q» ni EKRANDA ko'rmasa, u javonlar orasida
   * yurib, keyin qaytib so'rashi kerak bo'ladi.
   */
  coverage?: { total: number; withCell: number; withoutCell: number; ambiguous: number };
}

export default function PickListPrintPage() {
  const t = useTranslations('pages.pickLists');
  const params = useParams<{ id: string }>();
  // O'z hisob-fakturasi boshqa endpointdan o'qiladi (manbani ro'yxat beradi).
  const source = useSearchParams().get('source');
  const [detail, setDetail] = useState<PickListDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const printedRef = useRef(false);

  useEffect(() => {
    if (!params?.id) return;
    const qs = source === 'own' ? '?source=own' : '';
    api
      .get<PickListDetail>(`/pick-lists/${params.id}${qs}`)
      .then(setDetail)
      .catch((e) => setError(String(e)));
  }, [params?.id, source]);

  const cov = detail?.coverage ?? null;

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
    <>
      {cov && cov.total > 0 && (cov.withoutCell > 0 || cov.ambiguous > 0) && (
        <div
          className="mx-auto mb-2 max-w-[420px] rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 print:hidden"
          data-test-id="pick-coverage-warning"
        >
          {cov.ambiguous > 0
            ? t('coverage_ambiguous', { ambiguous: cov.ambiguous })
            : t('coverage_partial', { withoutCell: cov.withoutCell })}
        </div>
      )}
      <ReceiptPrintPortal
        data={data}
        error={error}
        onPrint={() => {
          if (detail && !printedRef.current) {
            printedRef.current = true;
            const q = source === 'own' ? '?source=own' : '';
            api.post(`/pick-lists/${detail.id}/printed${q}`, {}).catch(() => {});
          }
        }}
      />
    </>
  );
}
