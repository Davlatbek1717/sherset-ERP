'use client';

/**
 * Kontragent akt-sverka card — «Отправить акт сверки» button + list of past
 * statements with download links. Posts to /counterparty-statements/:id (which
 * generates the .xlsx, delivers it to the counterparty via MTProto and the admin
 * bot link) and lists prior statements (download via the capability token URL).
 */

import { CounterpartyFormCard } from '@/components/counterparty-form-layout';
import { api } from '@/lib/api-client';
import { Button, useToast } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

interface StatementItem {
  id: string;
  token: string;
  fileName: string;
  finalBalanceMinor: string;
  currency: string;
  createdAt: string;
}

function fmtBalance(
  minorStr: string,
  t: (k: string, v?: Record<string, string>) => string,
): string {
  const minor = BigInt(minorStr || '0');
  const abs = minor < 0n ? -minor : minor;
  const amt = new Intl.NumberFormat('ru-RU').format(Number(abs) / 100);
  if (minor > 0n) return t('akt_owes_us', { amt });
  if (minor < 0n) return t('akt_we_owe', { amt });
  return t('akt_settled');
}

export function AktSverkaCard({ counterpartyId }: { counterpartyId: string }) {
  const t = useTranslations('pages.counterparties');
  const { toast } = useToast();
  const qc = useQueryClient();

  const listQuery = useQuery<{ items: StatementItem[] }>({
    queryKey: ['cp-statements', counterpartyId],
    queryFn: () => api.get(`/counterparty-statements/${counterpartyId}`),
  });

  const genMut = useMutation({
    mutationFn: () =>
      api.post<{ downloadUrl: string; counterpartySent: boolean }>(
        `/counterparty-statements/${counterpartyId}`,
        {},
      ),
    onSuccess: (res) => {
      toast.success(res.counterpartySent ? t('akt_sent_cp') : t('akt_sent'));
      qc.invalidateQueries({ queryKey: ['cp-statements', counterpartyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = listQuery.data?.items ?? [];

  return (
    <CounterpartyFormCard title={t('akt_title')} testId="cp-card-akt">
      <div className="space-y-3">
        <Button
          onClick={() => genMut.mutate()}
          disabled={genMut.isPending}
          data-test-id="cp-akt-generate"
        >
          {genMut.isPending ? t('akt_generating') : t('akt_generate')}
        </Button>

        {items.length === 0 ? (
          <p className="text-[var(--ms-text-muted)] text-sm">{t('akt_empty')}</p>
        ) : (
          <ul className="divide-y divide-[var(--ms-border-default)] text-sm">
            {items.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <div className="text-[var(--ms-text-muted)] text-xs">
                    {new Date(s.createdAt).toLocaleString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                  <div className="truncate">{fmtBalance(s.finalBalanceMinor, t)}</div>
                </div>
                <a
                  href={`/api/v1/akt/${s.token}`}
                  className="shrink-0 font-medium text-[var(--ms-text-link)] hover:underline"
                  data-test-id={`cp-akt-download-${s.id}`}
                >
                  {t('akt_download')}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </CounterpartyFormCard>
  );
}
