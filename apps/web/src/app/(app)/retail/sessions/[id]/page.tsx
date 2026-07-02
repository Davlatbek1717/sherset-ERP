'use client';

import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { RETAIL_SESSION_STATE_TONE, documentStateTone } from '@/lib/document-state-tone';
import { Money } from '@moysklad/money';
import { isCurrencyCode } from '@moysklad/money/currencies';
import { Badge, Button, Input, formatDate, formatMoney } from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useState } from 'react';

interface DrawerOp {
  id: string;
  name: string;
  sumMinor: string;
  description: string | null;
  createdAt: string;
}
interface DrawerOps {
  cashIn: DrawerOp[];
  cashOut: DrawerOp[];
}

interface SessionDetail {
  id: string;
  state: 'open' | 'closed';
  openedAt: string;
  closedAt: string | null;
  cashier: { id: string; name: string };
  cashDesk: { id: string; name: string; currency: string } | null;
  store: { id: string; name: string } | null;
  organization: { id: string; name: string };
  salesCount: number;
  salesSumMinor: string;
  returnsCount: number;
  returnsSumMinor: string;
  openingCashMinor: string;
  closingCashMinor: string | null;
  expectedCashMinor: string | null;
  discrepancyMinor: string | null;
  externalCode: string | null;
}

interface ZReport {
  session: {
    id: string;
    state: string;
    openedAt: string;
    closedAt: string | null;
    cashier: { name: string };
    cashDesk: { name: string; currency: string };
    store: { name: string };
    organization: { name: string };
    openingCashMinor: string;
    closingCashMinor: string | null;
    expectedCashMinor: string | null;
    discrepancyMinor: string | null;
  };
  salesCount: number;
  salesSumMinor: string;
  cashSalesMinor: string;
  cardSalesMinor: string;
  returnsCount: number;
  returnsSumMinor: string;
  cashReturnsMinor: string;
  cardReturnsMinor: string;
  netSumMinor: string;
}

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('pages.cashier_sessions');
  const tZ = useTranslations('pages.z_report');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');

  const { data: session, isLoading } = useQuery<SessionDetail>({
    queryKey: ['cashier-session', id],
    queryFn: () => api.get<SessionDetail>(`/cashier-sessions/${id}`),
  });

  const { data: zReport } = useQuery<ZReport>({
    queryKey: ['z-report', id],
    queryFn: () => api.get<ZReport>(`/retail-sales/z-report?sessionId=${id}`),
    enabled: !!id,
  });

  const qc = useQueryClient();
  const [drawerAmount, setDrawerAmount] = useState('');
  const [drawerComment, setDrawerComment] = useState('');
  const { data: drawerOps } = useQuery<DrawerOps>({
    queryKey: ['drawer-ops', id],
    queryFn: () => api.get<DrawerOps>(`/cashier-sessions/${id}/drawer`),
    enabled: !!id,
  });
  const afterDrawer = () => {
    setDrawerAmount('');
    setDrawerComment('');
    qc.invalidateQueries({ queryKey: ['drawer-ops', id] });
    qc.invalidateQueries({ queryKey: ['cashier-session', id] });
    qc.invalidateQueries({ queryKey: ['z-report', id] });
  };
  // moysklad's Внесение/Изъятие dialog carries a Комментарий — the backend
  // DrawerCashSchema already accepts `description`. (2026-06-03h)
  const drawerInMut = useApiMutation({
    mutationFn: (sumMinor: string) =>
      api.post(`/cashier-sessions/${id}/drawer-in`, {
        sumMinor,
        description: drawerComment.trim() || undefined,
      }),
    onSuccess: afterDrawer,
  });
  const drawerOutMut = useApiMutation({
    mutationFn: (sumMinor: string) =>
      api.post(`/cashier-sessions/${id}/drawer-out`, {
        sumMinor,
        description: drawerComment.trim() || undefined,
      }),
    onSuccess: afterDrawer,
  });
  const drawerBusy = drawerInMut.isPending || drawerOutMut.isPending;

  if (isLoading) {
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  }

  if (!session) {
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('not_found')}</div>;
  }

  const disc = session.discrepancyMinor ? BigInt(session.discrepancyMinor) : null;
  const currency = session.cashDesk?.currency ?? 'UZS';
  const tillCurrency = isCurrencyCode(currency) ? currency : 'UZS';
  const drawerMinor =
    Number(drawerAmount) > 0
      ? Money.fromMajor(drawerAmount, tillCurrency).toMinor().toString()
      : null;

  return (
    <div className="max-w-2xl p-4">
      <div className="mb-4 flex items-center gap-3">
        <a href="/retail/sessions" className="text-[var(--ms-text-brand)] text-sm hover:underline">
          ← {t('title')}
        </a>
      </div>

      {/* Session header */}
      <div className="mb-4 rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] p-4">
        <div className="mb-3 flex items-center gap-3">
          <Badge tone={documentStateTone(session.state, RETAIL_SESSION_STATE_TONE)}>
            {t(`statuses.${session.state}` as 'statuses.open' | 'statuses.closed')}
          </Badge>
          <span className="font-medium text-sm">{session.cashier.name}</span>
          {session.cashDesk && <>
          <span className="text-[var(--ms-text-muted)] text-sm">·</span>
          <span className="text-[var(--ms-text-muted)] text-sm">{session.cashDesk.name}</span>
          </>}
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="mb-0.5 text-[var(--ms-text-muted)] text-xs">{t('opened_at')}</div>
            <div>{formatDate(session.openedAt)}</div>
          </div>
          {session.closedAt && (
            <div>
              <div className="mb-0.5 text-[var(--ms-text-muted)] text-xs">{t('closed_at')}</div>
              <div>{formatDate(session.closedAt)}</div>
            </div>
          )}
          {session.store && (
          <div>
            <div className="mb-0.5 text-[var(--ms-text-muted)] text-xs">{tFields('store')}</div>
            <div>{session.store.name}</div>
          </div>
          )}
          <div>
            <div className="mb-0.5 text-[var(--ms-text-muted)] text-xs">
              {tFields('organization')}
            </div>
            <div>{session.organization.name}</div>
          </div>
          {session.externalCode && (
            <div>
              <div className="mb-0.5 text-[var(--ms-text-muted)] text-xs">
                {tFields('external_code')}
              </div>
              <div className="tabular-nums">{session.externalCode}</div>
            </div>
          )}
        </div>
      </div>

      {/* Z-Report */}
      {zReport && (
        <div className="mb-4 rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] p-4">
          <h2 className="mb-3 font-semibold text-sm">{tZ('title')}</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <MetaRow
              label={tZ('total_sales')}
              value={`${zReport.salesCount} ${tCommon('pcs')} · ${formatMoney(BigInt(zReport.salesSumMinor), currency)}`}
            />
            <MetaRow
              label={tZ('total_cash')}
              value={formatMoney(BigInt(zReport.cashSalesMinor), currency)}
            />
            <MetaRow
              label={tZ('total_card')}
              value={formatMoney(BigInt(zReport.cardSalesMinor), currency)}
            />
            <MetaRow
              label={tZ('total_returns')}
              value={`${zReport.returnsCount} ${tCommon('pcs')} · ${formatMoney(BigInt(zReport.returnsSumMinor), currency)}`}
            />
            <MetaRow
              label={tZ('net_sales')}
              value={formatMoney(BigInt(zReport.netSumMinor), currency)}
              bold
            />
          </div>

          {/* Cash reconciliation */}
          {session.state === 'closed' && session.expectedCashMinor && (
            <div className="mt-3 border-[var(--ms-border)] border-t pt-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <MetaRow
                  label={t('opening_cash')}
                  value={formatMoney(BigInt(session.openingCashMinor), currency)}
                />
                <MetaRow
                  label={t('closing_cash')}
                  value={
                    session.closingCashMinor
                      ? formatMoney(BigInt(session.closingCashMinor), currency)
                      : '—'
                  }
                />
                <MetaRow
                  label={t('expected_cash')}
                  value={formatMoney(BigInt(session.expectedCashMinor), currency)}
                />
                {disc !== null && (
                  <div>
                    <div className="mb-0.5 text-[var(--ms-text-muted)] text-xs">
                      {t('discrepancy')}
                    </div>
                    <div
                      className={`font-semibold ${
                        disc < 0n
                          ? 'text-red-600'
                          : disc > 0n
                            ? 'text-yellow-600'
                            : 'text-green-600'
                      }`}
                    >
                      {disc >= 0n ? '+' : ''}
                      {formatMoney(disc, currency)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Kassa operatsiyalari — Внесение / Изъятие (open shift only) */}
      {session.state === 'open' && (
        <div className="mb-4 rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] p-4">
          <h2 className="mb-3 font-semibold text-sm">{t('cash_operations')}</h2>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <div className="mb-0.5 text-[var(--ms-text-muted)] text-xs">{tFields('sum')}</div>
              <Input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={drawerAmount}
                placeholder="0"
                onChange={(e) => setDrawerAmount(e.target.value)}
                data-test-id="drawer-amount"
              />
            </div>
            <div className="min-w-[12rem] flex-1">
              <div className="mb-0.5 text-[var(--ms-text-muted)] text-xs">
                {t('drawer_comment')}
              </div>
              <Input
                value={drawerComment}
                placeholder={t('drawer_comment')}
                onChange={(e) => setDrawerComment(e.target.value)}
                data-test-id="drawer-comment"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={!drawerMinor || drawerBusy}
              onClick={() => drawerMinor && drawerInMut.mutate(drawerMinor)}
              data-test-id="drawer-in-btn"
            >
              + {t('drawer_in')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!drawerMinor || drawerBusy}
              onClick={() => drawerMinor && drawerOutMut.mutate(drawerMinor)}
              data-test-id="drawer-out-btn"
            >
              − {t('drawer_out')}
            </Button>
          </div>
          {(drawerInMut.error || drawerOutMut.error) && (
            <div className="mt-2 text-red-600 text-xs">
              {(drawerInMut.error as Error | null)?.message ??
                (drawerOutMut.error as Error | null)?.message}
            </div>
          )}
          {drawerOps && (drawerOps.cashIn.length > 0 || drawerOps.cashOut.length > 0) && (
            <div className="mt-3 space-y-1 border-[var(--ms-border)] border-t pt-3 text-sm">
              {drawerOps.cashIn.map((o) => (
                <div key={o.id} className="flex justify-between">
                  <span className="text-[var(--ms-text-muted)]">
                    {o.name} {o.description ? `· ${o.description}` : ''}
                  </span>
                  <span className="font-medium text-green-600 tabular-nums">
                    +{formatMoney(BigInt(o.sumMinor), currency)}
                  </span>
                </div>
              ))}
              {drawerOps.cashOut.map((o) => (
                <div key={o.id} className="flex justify-between">
                  <span className="text-[var(--ms-text-muted)]">
                    {o.name} {o.description ? `· ${o.description}` : ''}
                  </span>
                  <span className="font-medium text-red-600 tabular-nums">
                    −{formatMoney(BigInt(o.sumMinor), currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recent sales link */}
      <a
        href={`/retail/sales?sessionId=${session.id}`}
        className="text-[var(--ms-text-brand)] text-sm hover:underline"
      >
        {t('session_sales_link')} →
      </a>
    </div>
  );
}

function MetaRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div>
      <div className="mb-0.5 text-[var(--ms-text-muted)] text-xs">{label}</div>
      <div className={bold ? 'font-semibold' : ''}>{value}</div>
    </div>
  );
}
