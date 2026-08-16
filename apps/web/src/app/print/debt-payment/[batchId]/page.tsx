'use client';

/**
 * QARZ TO'LOVI CHEKI — brauzer (zaxira) sahifasi.
 *
 * 2026-08-16 (egasi): eski «PKO» dizayni tovar cheki shabloniga almashtirildi —
 * kassa cheki bilan BITTA ko'rinish (`TovarChek`), farqlar modelda: sarlavha
 * «QARZ TO'LOVI», qatorlar «Qarz to'lovi (QRZ-N)», «Sizning qarzingiz» 0 bo'lsa
 * ham chiqadi.
 *
 * 🔴 Bu sahifa — ZAXIRA yo'l. Haqiqiy chop odatda agent (ESC/POS) yoki Electron
 * (HTML) orqali JIM ketadi (`printDebtReceiptViaAgent`); uchala renderer bitta
 * mapper'dan (`debtReceiptToSaleInput`) oziqlanadi, ya'ni bir joyda o'zgartirish
 * qolganini eskirtirmaydi (xotira: `ombor-chek-uch-renderer`).
 *
 * `batchId` bo'yicha ochiladi ⇒ chek istalgan vaqtda qayta chop etiladi
 * (kassir yo'qotdi / printer tiqildi) va AYNAN o'sha summalarni ko'rsatadi —
 * qoldiq ham server chekidan (`outstandingAfterMinor`), qayta so'ralmaydi.
 */

import { ThermalShell } from '@/components/print/thermal-shell';
import { type ChekPosition, TovarChek } from '@/components/print/tovar-chek';
import { api } from '@/lib/api-client';
import { type DebtReceiptPayload, debtReceiptToSaleInput } from '@/lib/pos/receipt-debt-model';
import { buildReceiptModel } from '@/lib/pos/receipt-model';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useSearchParams } from 'next/navigation';

export default function PrintDebtPaymentPage() {
  const { batchId } = useParams<{ batchId: string }>();
  const searchParams = useSearchParams();
  const auto = searchParams.get('auto') === '1';
  // Boshqa chek sahifalari bilan bir xil: `?w=58` tor lenta.
  const widthMm = searchParams.get('w') === '58' ? 58 : 80;
  const t = useTranslations('pages.print');

  const { data, isLoading } = useQuery<DebtReceiptPayload>({
    queryKey: ['debt-payment-receipt', batchId],
    queryFn: () => api.get<DebtReceiptPayload>(`/debts/pos/receipt/${batchId}`),
  });

  if (isLoading) return <div style={{ padding: 24 }}>Loading...</div>;
  if (!data) return <div style={{ padding: 24 }}>Not found</div>;

  // Qarorlar va formatlash mapper + sof modelda — bu sahifa faqat chizadi.
  const sale = debtReceiptToSaleInput(data);
  const model = buildReceiptModel(sale);

  const positions: ChekPosition[] = sale.positions.map((p, i) => ({
    position: i + 1,
    name: p.product?.name ?? '—',
    code: null,
    uom: p.product?.uom ?? null,
    quantity: p.quantity,
    priceMinor: p.priceMinor,
    sumMinor: p.sumMinor,
  }));

  return (
    <ThermalShell widthMm={widthMm} autoPrint={auto}>
      <TovarChek
        title={t('chek_title_debt')}
        docNumber={model.docNumber}
        docDate={sale.moment}
        orgName={model.orgName}
        orgPhone={model.orgPhone}
        sellerName={model.sellerName}
        buyerName={model.buyerName}
        comment={null}
        positions={positions}
        totalMinor={sale.sumMinor}
        payments={model.payments}
        debtAfterMinor={model.debtAfterMinor}
        showZeroDebt
        widthMm={widthMm}
      />
    </ThermalShell>
  );
}
