'use client';

/**
 * /print/picking/[orderId] — «Omborchi yig'ish varaqalari» (Sherset custom),
 * THERMAL (Xprinter 80/58mm). Read-only: one strip per sklad (warehouse zone) —
 * the products that zone's omborchi must collect, each with its bin location
 * «NN-NN-NN-NN». Creates NO tasks, sends NO notifications. Each sklad is its own
 * tear-off strip (thermal-cut → page-break). `?source=retailsale` reads a kassa
 * sale; default reads a customer order. `?w=58` for the compact printer.
 *
 * 🔴 PRINTER TANLASH YO'Q (egasi, 2026-08-16): «saytdan hech biriga alohida
 * printer ulanmaydi — kompyuterning o'ziga ulangan printerdan chop qilsin».
 * Ilgari bu sahifa ombor→printer biriktirmasini o'qib har varaqni O'Z
 * printeriga raw-matn qilib yuborardi; endi u qatlam butunlay yo'q va sahifa
 * `?auto=1` bilan oddiy brauzer chopini chaqiradi (qurilmaning sukut
 * printeri). Bu sahifa — ZAXIRA yo'l; kassa qobig'i chekni o'zi jim chiqaradi.
 *
 * 2026-07-20g: per-line QR code (linked to /scan/{productId}) removed —
 * the omborchi picks by bin LOCATION CODE (NN-NN-NN-NN), not by scanning a
 * per-line QR before even finding the product; the location code is now the
 * most prominent element on each line instead of competing with a QR image.
 *
 * 2026-08-10 (owner, climart namunasi): the bespoke «YIG'ISH VARAQASI» strip is
 * gone — every sheet now renders the SHARED «Товарный чек» receipt template
 * (<PickReceiptBody>), the same one the document «Лист сборки» prints. One
 * receipt per sheet; sarlavha (`groupLabel`) SERVERDAN keladi — varaqlar
 * birlashtirilgan bo'lsa u `null` va sarlavha umuman chiqmaydi.
 */

import { PickReceiptBody, type ReceiptData } from '@/components/pick-list/receipt-print-portal';
import { ThermalShell } from '@/components/print/thermal-shell';
import { api } from '@/lib/api-client';
import type { AgentPickingSheetsResponse } from '@/lib/print-agent';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useSearchParams } from 'next/navigation';

interface SheetLine {
  productId: string | null;
  productName: string;
  quantity: string;
  binLocation: string | null;
  uom?: string | null;
  // Multi-bin: additional shelves this product also sits on (besides the primary).
  extraBins?: string[];
}
interface PickingSheet {
  skladNo: number | null;
  /** Server sarlavhasi; `null` = varaqlar birlashtirilgan ⇒ sarlavha yo'q. */
  groupLabel: string | null;
  omborchiName: string | null;
  lines: SheetLine[];
}
interface PickingSheetsResponse extends AgentPickingSheetsResponse {
  storeName: string | null;
  sheets: PickingSheet[];
}

function fmtSklad(n: number | null): string {
  return n == null ? '—' : String(n).padStart(2, '0');
}

/** ISO instant → «DD.MM.YYYY» for the receipt's «от» line. */
function receiptDateOf(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/**
 * One sklad sheet → the shared receipt's shape. `groups` is passed explicitly
 * (a single group) so the server's serpentine pick-route ORDER survives —
 * letting <PickReceiptBody> group the positions itself would re-sort them by
 * cell code and send the omborchi walking the aisles twice.
 */
function sheetToReceipt(
  sheet: PickingSheet,
  res: PickingSheetsResponse | undefined,
  title: string,
): ReceiptData {
  const positions = sheet.lines.map((l) => ({
    name: l.productName,
    qty: Number(l.quantity),
    uom: l.uom ?? null,
    cell: l.binLocation,
  }));
  return {
    title,
    number: res?.docNumber ?? res?.sourceName ?? '—',
    dateStr: receiptDateOf(res?.docDate),
    agentName: res?.buyerName ?? null,
    agentPhone: res?.buyerPhone ?? null,
    ownerName: res?.sellerName ?? null,
    description: res?.comment ?? null,
    positions,
    // Uch holat: «01» · null ⇒ tarjima qilingan «Yacheykasiz» sarlavhasi ·
    // undefined ⇒ sarlavha YO'Q (server varaqlarni birlashtirgan). Sarlavha
    // matni SHU YERDA tuziladi — sahifa tarjimaga ega, server esa yo'q;
    // serverdan faqat «birlashtirilganmi» qarori olinadi.
    groups: [
      {
        warehouse:
          sheet.groupLabel === null
            ? undefined
            : sheet.skladNo != null
              ? fmtSklad(sheet.skladNo)
              : null,
        positions,
      },
    ],
  };
}

export default function PrintPickingPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const searchParams = useSearchParams();
  const auto = searchParams.get('auto') === '1';
  const source = searchParams.get('source') === 'retailsale' ? 'retailsale' : 'customerorder';
  const widthMm = searchParams.get('w') === '58' ? 58 : 80;
  const t = useTranslations('picking');
  // The receipt template's own strings live with the shared body's namespace.
  const tReceipt = useTranslations('pages.pickLists');

  const { data, isLoading, error } = useQuery<PickingSheetsResponse>({
    queryKey: ['picking-sheets', source, orderId],
    queryFn: () => api.get(`/restock-tasks/picking-sheets/${source}/${orderId}`),
    enabled: !!orderId,
    retry: false,
  });

  if (isLoading) return <div style={{ padding: 24 }}>{t('print_loading')}</div>;
  if (error) return <div style={{ padding: 24 }}>{(error as Error).message}</div>;
  const sheets = data?.sheets ?? [];
  if (sheets.length === 0) return <div style={{ padding: 24 }}>{t('print_empty')}</div>;

  // Hamma varaq brauzer chopiga ketadi — qurilmaning O'Z printeriga
  // (printer tanlash qatlami 2026-08-16 da olib tashlandi).
  const printSheets = sheets;

  // The receipt column inside the paper (climart 1:1 uses 72mm on an 80mm roll).
  const bodyWidthMm = widthMm === 58 ? 54 : 72;

  return (
    <>
      {printSheets.length > 0 && (
        <ThermalShell widthMm={widthMm} autoPrint={auto}>
          <style>{`
            .rcpt table th, .rcpt table td { border: 1.5px solid #000; }
            .rcpt, .rcpt table { font-weight: 600; }
            .rcpt td.rcpt-name { font-weight: 700; }
          `}</style>
          {printSheets.map((sheet, idx) => (
            <section key={`${sheet.skladNo ?? 'none'}-${idx}`} className="thermal-cut">
              <PickReceiptBody
                data={sheetToReceipt(sheet, data, tReceipt('receipt_title'))}
                widthMm={bodyWidthMm}
              />
            </section>
          ))}
        </ThermalShell>
      )}
    </>
  );
}
