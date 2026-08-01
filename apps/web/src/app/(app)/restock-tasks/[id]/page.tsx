'use client';

/**
 * /restock-tasks/[id] — «Joylashtirish vazifasi» checklist (Sherset custom).
 * The warehouse-keeper (omborchi) sees each returned product + its home bin
 * location «NN-NN-NN-NN» and confirms placement by scanning the senik QR (camera)
 * or pressing «Joylandi». When every line is confirmed the task is «done».
 */
import { QrScanner } from '@/components/restock/qr-scanner';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { restockStatusTone } from '@/lib/domain-status-tone';
import { Badge, Button, Modal, formatDate } from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

interface RestockLine {
  id: string;
  productId: string | null;
  productName: string;
  quantity: string;
  binLocation: string | null;
  confirmedAt: string | null;
  confirmedByName: string | null;
}
interface RestockTaskDetail {
  id: string;
  sourceName: string | null;
  storeName: string | null;
  assigneeName: string | null;
  createdByName: string | null;
  status: 'pending' | 'in_progress' | 'done';
  note: string | null;
  createdAt: string;
  lines: RestockLine[];
}

/** Pull the product UUID out of a scanned senik QR («{origin}/products/{id}»). */
function productIdFromScan(text: string): string | null {
  const m = text.match(
    /products\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/,
  );
  if (m?.[1]) return m[1];
  // Bare UUID fallback (if the QR encodes just the id).
  const bare = text
    .trim()
    .match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);
  return bare?.[0] ?? null;
}

export default function RestockTaskDetailPage() {
  const t = useTranslations('restock');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [scanOpen, setScanOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['restock-task', id],
    queryFn: () => api.get<RestockTaskDetail>(`/restock-tasks/${id}`),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['restock-task', id] });

  const confirmLineMut = useApiMutation({
    mutationFn: (lineId: string) => api.post(`/restock-tasks/${id}/lines/${lineId}/confirm`, {}),
    successMessage: t('placed_success'),
    onSuccess: invalidate,
  });

  const confirmScanMut = useApiMutation({
    mutationFn: (productId: string) => api.post(`/restock-tasks/${id}/confirm-scan`, { productId }),
    successMessage: t('scan_success'),
    onSuccess: invalidate,
  });

  const handleScan = (text: string) => {
    const productId = productIdFromScan(text);
    if (!productId) return; // ignore non-product QR codes
    confirmScanMut.mutate(productId);
  };

  if (isLoading || !data) {
    return <div className="p-6 text-[var(--ms-text-muted)]">…</div>;
  }

  const total = data.lines.length;
  const confirmed = data.lines.filter((l) => l.confirmedAt).length;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => router.push('/restock-tasks')}
            className="mb-1 text-[var(--ms-text-muted)] text-xs hover:underline"
          >
            ← {t('list_title')}
          </button>
          <h1 className="font-semibold text-[var(--ms-text-primary)] text-xl">
            {data.sourceName ?? t('source_fallback')}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[var(--ms-text-muted)] text-sm">
            {data.storeName && <span>{data.storeName}</span>}
            <span>
              {t('col_omborchi')}:{' '}
              <span className="text-[var(--ms-text-secondary)]">{data.assigneeName ?? '—'}</span>
            </span>
            <span>{formatDate(data.createdAt)}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge tone={restockStatusTone(data.status)}>{t(`status_${data.status}`)}</Badge>
          <span className="text-[var(--ms-text-muted)] text-sm tabular-nums">
            {confirmed}/{total}
          </span>
        </div>
      </div>

      <div>
        <Button
          variant="primary"
          onClick={() => setScanOpen(true)}
          disabled={confirmed === total}
          data-test-id="restock-scan-open"
        >
          {t('scan_button')}
        </Button>
      </div>

      <div className="overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]">
        <table className="w-full text-sm" data-test-id="restock-lines-table">
          <thead>
            <tr className="border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-muted)] text-left text-[var(--ms-text-secondary)] text-xs">
              <th className="px-3 py-2 font-medium">{t('line_product')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('line_qty')}</th>
              <th className="px-3 py-2 font-medium">{t('line_location')}</th>
              <th className="px-3 py-2 font-medium">{t('line_status')}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {data.lines.map((line) => (
              <tr
                key={line.id}
                className="border-[var(--ms-border-default)] border-b last:border-0"
                data-test-id={`restock-line-${line.id}`}
              >
                <td className="px-3 py-2 font-medium text-[var(--ms-text-primary)]">
                  {line.productName}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(line.quantity)}</td>
                <td className="px-3 py-2">
                  <span className="font-mono font-semibold text-[var(--ms-text-primary)] tabular-nums tracking-wider">
                    {line.binLocation ?? '—'}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {line.confirmedAt ? (
                    <span
                      className="inline-flex items-center gap-1 text-[var(--ms-text-success)]"
                      data-test-id="line-confirmed"
                    >
                      ✓ {t('confirmed')}
                      {line.confirmedByName && (
                        <span className="text-[var(--ms-text-muted)] text-xs">
                          · {line.confirmedByName}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-[var(--ms-text-muted)]">{t('pending')}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {!line.confirmedAt && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => confirmLineMut.mutate(line.id)}
                      loading={confirmLineMut.isPending}
                      data-test-id={`restock-place-${line.id}`}
                    >
                      {t('placed_button')}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.note && (
        <div className="text-[var(--ms-text-muted)] text-sm">
          {t('note_label')}: {data.note}
        </div>
      )}

      <Modal
        open={scanOpen}
        onOpenChange={setScanOpen}
        title={t('scan_button')}
        widthClass="w-[380px]"
        testId="restock-scan-modal"
      >
        <div className="space-y-2">
          <p className="text-[var(--ms-text-muted)] text-sm">{t('scan_hint')}</p>
          {scanOpen && <QrScanner onResult={handleScan} />}
        </div>
      </Modal>
    </div>
  );
}
