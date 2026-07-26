'use client';

/**
 * Kontragent akt-sverka card. Two scopes — «Barcha savdo» (full history) and
 * «Buyum bo'yicha» (a picked product) — each with TWO explicit actions:
 *   • «Yaratish»            → generate + store; admin gets a bot link + download.
 *   • «Kontragentga yuborish» → the same PLUS the file is sent to the counterparty
 *                               (MTProto). Never automatic — an explicit press.
 */

import { CounterpartyFormCard } from '@/components/counterparty-form-layout';
import { api } from '@/lib/api-client';
import { Button, CatalogPickerField, type PickerItem, useToast } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

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
  const [product, setProduct] = useState<{ id: string; name: string } | null>(null);

  const listQuery = useQuery<{ items: StatementItem[] }>({
    queryKey: ['cp-statements', counterpartyId],
    queryFn: () => api.get(`/counterparty-statements/${counterpartyId}`),
  });

  const genMut = useMutation({
    mutationFn: (opts: { productId?: string; deliver: boolean }) => {
      const params = new URLSearchParams();
      if (opts.productId) params.set('productId', opts.productId);
      if (opts.deliver) params.set('deliver', 'true');
      const qs = params.toString();
      return api.post<{ counterpartySent: boolean }>(
        `/counterparty-statements/${counterpartyId}${qs ? `?${qs}` : ''}`,
        {},
      );
    },
    onSuccess: (res) => {
      toast.success(res.counterpartySent ? t('akt_toast_sent') : t('akt_toast_created'));
      qc.invalidateQueries({ queryKey: ['cp-statements', counterpartyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = listQuery.data?.items ?? [];
  const busy = genMut.isPending;

  return (
    <CounterpartyFormCard title={t('akt_title')} testId="cp-card-akt">
      <div className="space-y-4">
        {/* Barcha savdo */}
        <div className="space-y-2">
          <div className="font-medium text-[var(--ms-text-primary)] text-sm">
            {t('akt_all_scope')}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => genMut.mutate({ deliver: false })}
              data-test-id="cp-akt-generate"
            >
              {t('akt_btn_create')}
            </Button>
            <Button
              disabled={busy}
              onClick={() => genMut.mutate({ deliver: true })}
              data-test-id="cp-akt-send"
            >
              {t('akt_btn_send')}
            </Button>
          </div>
        </div>

        {/* Buyum bo'yicha */}
        <div className="space-y-2 border-[var(--ms-border-default)] border-t pt-3">
          <div className="font-medium text-[var(--ms-text-primary)] text-sm">
            {t('akt_by_product')}
          </div>
          <CatalogPickerField
            value={product ? { id: product.id, label: product.name } : null}
            placeholder={t('akt_pick_product')}
            onPick={() => {}}
            onClear={() => setProduct(null)}
            inlineFetcher={async (q): Promise<PickerItem[]> => {
              const r = await api.get<{
                items: { id: string; name: string; code: string | null }[];
              }>(`/products?search=${encodeURIComponent(q)}&limit=20`);
              return r.items.map((p) => ({
                id: p.id,
                primary: p.name,
                secondary: p.code ?? undefined,
              }));
            }}
            onInlineSelect={(it: PickerItem) =>
              setProduct({
                id: it.id,
                name: typeof it.primary === 'string' ? it.primary : String(it.primary),
              })
            }
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={!product || busy}
              onClick={() => product && genMut.mutate({ productId: product.id, deliver: false })}
              data-test-id="cp-akt-generate-product"
            >
              {t('akt_btn_create')}
            </Button>
            <Button
              disabled={!product || busy}
              onClick={() => product && genMut.mutate({ productId: product.id, deliver: true })}
              data-test-id="cp-akt-send-product"
            >
              {t('akt_btn_send')}
            </Button>
          </div>
        </div>

        {/* Saqlangan aktlar */}
        {items.length === 0 ? (
          <p className="text-[var(--ms-text-muted)] text-sm">{t('akt_empty')}</p>
        ) : (
          <ul className="divide-y divide-[var(--ms-border-default)] border-[var(--ms-border-default)] border-t text-sm">
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
