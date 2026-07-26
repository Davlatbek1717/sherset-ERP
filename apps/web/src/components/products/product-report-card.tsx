'use client';

/**
 * «Buyum bo'yicha hisobot» card for the product detail page. Generates an .xlsx
 * of the product's sales grouped by counterparty (qty, sum, current debt),
 * sends the admin a bot link, and lists prior reports with download links.
 */

import { api } from '@/lib/api-client';
import { Button, useToast } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

interface ReportItem {
  id: string;
  token: string;
  fileName: string;
  finalBalanceMinor: string;
  currency: string;
  createdAt: string;
}

export function ProductReportCard({ productId }: { productId: string }) {
  const t = useTranslations('pages.products');
  const { toast } = useToast();
  const qc = useQueryClient();

  const listQuery = useQuery<{ items: ReportItem[] }>({
    queryKey: ['product-statements', productId],
    queryFn: () => api.get(`/product-statements/${productId}`),
  });

  const genMut = useMutation({
    mutationFn: () =>
      api.post<{ downloadUrl: string; productName: string }>(
        `/product-statements/${productId}`,
        {},
      ),
    onSuccess: () => {
      toast.success(t('report_sent'));
      qc.invalidateQueries({ queryKey: ['product-statements', productId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = listQuery.data?.items ?? [];

  return (
    <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
      <h3 className="mb-3 font-semibold text-[var(--ms-text-strong)] text-sm">
        {t('report_title')}
      </h3>
      <div className="space-y-3">
        <Button
          onClick={() => genMut.mutate()}
          disabled={genMut.isPending}
          data-test-id="product-report-generate"
        >
          {genMut.isPending ? t('report_generating') : t('report_generate')}
        </Button>

        {items.length === 0 ? (
          <p className="text-[var(--ms-text-muted)] text-sm">{t('report_empty')}</p>
        ) : (
          <ul className="divide-y divide-[var(--ms-border-default)] text-sm">
            {items.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                <span className="text-[var(--ms-text-muted)] text-xs">
                  {new Date(s.createdAt).toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <a
                  href={`/api/v1/akt/${s.token}`}
                  className="shrink-0 font-medium text-[var(--ms-text-link)] hover:underline"
                  data-test-id={`product-report-download-${s.id}`}
                >
                  {t('report_download')}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
