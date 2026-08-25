'use client';

import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { isKioskUser, useAuth } from '@/lib/auth-store';
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
  cashDesk: { id: string; name: string; currency: string };
  store: { id: string; name: string };
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

/**
 * §8.5 to'liq Z-hisobot (`/cashier-sessions/:id/z-report`).
 *
 * Eski `/retail-sales/z-report` faqat naqd/karta ajratmasini bilardi.
 * Bu — TZ §8.5 bandlari: to'lov turlari kesimi, o'rtacha chek, yalpi
 * foyda, chegirma, qarzga sotilgan, qabul qilingan qarz to'lovlari,
 * xarajatlar (moddalar bo'yicha), inkassatsiya va farq aktlari.
 *
 * `null` — «noma'lum», `'0'` — «haqiqatan nol». Ikkalasi turlicha
 * ko'rsatiladi: yalpi foyda `null` bo'lsa «—» chiqadi, chunki uni 0 deb
 * ko'rsatish «100% marja» yolg'onini berardi.
 */
interface ZFull {
  salesCount: number;
  revenueMinor: string;
  revenueByMethod: Array<{ method: string; sumMinor: string }>;
  averageReceiptMinor: string | null;
  grossProfitMinor: string | null;
  discountMinor: string;
  creditSoldMinor: string;
  debtPaidMinor: string;
  returnsMinor: string;
  expenseMinor: string;
  collectionMinor: string;
  /** G1 — vozvratlar uchun mijozlarga kassadan qaytarilgan naqd. */
  returnPayoutMinor: string;
  /**
   * A1 — mijozlardan qabul qilingan AVANS. IXTIYORIY: maydonsiz javobda
   * (eski server) qator UMUMAN chizilmaydi — `'0'` deb ko'rsatish «bugun
   * avans bo'lmagan» degan ishonarli yolg'on bo'lardi.
   */
  prepayMinor?: string;
  /** A2 — avansdan to'langan summa (naqd EMAS, `credit_sold` turkumi). */
  prepaySpentMinor?: string;
  /** A3 — mijozlarga naqd qaytarilgan avans. */
  prepayRefundMinor?: string;
  expenseByItem: Array<{ id: string | null; name: string | null; sumMinor: string }>;
  expectedCashMinor: string;
  /**
   * «Kassada bo'lishi kerak» summasining TARKIBI (server `collectCashInputs`
   * dan). Ochiq smenada shu blok ko'rsatiladi — egasi, 2026-08-19: naqd qarz
   * to'lovi (chek №EA8E779A) yashiqqa tushgan-u, ekranda smena bo'yicha
   * «bo'lishi kerak bo'lgan summa» faqat YOPILGANDAN keyin chiqardi.
   */
  cashBreakdown: {
    openingMinor: string;
    salesCashMinor: string;
    debtCashMinor: string;
    drawerInMinor: string;
    drawerOutMinor: string;
    returnsCashMinor: string;
    sumMinor: string;
  };
  countedCashMinor: string | null;
  varianceMinor: string | null;
  variances: Array<{
    currency: string;
    expectedMinor: string;
    countedMinor: string;
    varianceMinor: string;
    kind: string;
    cashierNote: string | null;
    acknowledgedAt: string | null;
  }>;
}

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('pages.cashier_sessions');
  const tZ = useTranslations('pages.z_report');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');

  const { user } = useAuth();

  const { data: session, isLoading } = useQuery<SessionDetail>({
    queryKey: ['cashier-session', id],
    queryFn: () => api.get<SessionDetail>(`/cashier-sessions/${id}`),
  });

  const { data: zReport } = useQuery<ZReport>({
    queryKey: ['z-report', id],
    queryFn: () => api.get<ZReport>(`/retail-sales/z-report?sessionId=${id}`),
    enabled: !!id,
  });

  const { data: zFull } = useQuery<ZFull>({
    queryKey: ['z-report-full', id],
    queryFn: () => api.get<ZFull>(`/cashier-sessions/${id}/z-report`),
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
  const currency = session.cashDesk.currency;
  // Major-units drawer input → minor units via the currency-aware Money helper
  // (string-decimal parse, no IEEE-754 *100 drift, correct scale per currency).
  // Empty/<=0 disables the buttons. (2026-06-03h)
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
          <span className="text-[var(--ms-text-muted)] text-sm">·</span>
          <span className="text-[var(--ms-text-muted)] text-sm">{session.cashDesk.name}</span>
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
          <div>
            <div className="mb-0.5 text-[var(--ms-text-muted)] text-xs">{tFields('store')}</div>
            <div>{session.store.name}</div>
          </div>
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

      {/* §8.5 — to'liq Z-hisobot */}
      {zFull && (
        <div className="mb-4 rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] p-4">
          <h2 className="mb-3 font-semibold text-sm">{tZ('full_title')}</h2>

          {/* To'lov turlari kesimi — §8.5 birinchi bandi. `cashAmountMinor`
              va `cardAmountMinor` ikki ustunidan kanalni tiklab bo'lmaydi,
              shuning uchun manba `RetailSalePayment` qatorlari. */}
          <div className="mb-3 flex flex-col gap-1">
            {zFull.revenueByMethod.length === 0 ? (
              <div className="text-[var(--ms-text-muted)] text-sm">—</div>
            ) : (
              zFull.revenueByMethod.map((r) => (
                <div key={r.method} className="flex justify-between text-sm">
                  <span className="text-[var(--ms-text-muted)]">{r.method}</span>
                  <span className="font-medium tabular-nums">
                    {formatMoney(BigInt(r.sumMinor), currency)}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 border-[var(--ms-border)] border-t pt-3 text-sm">
            <MetaRow
              label={tZ('revenue')}
              value={formatMoney(BigInt(zFull.revenueMinor), currency)}
              bold
            />
            <MetaRow label={tZ('receipts')} value={String(zFull.salesCount)} />
            <MetaRow
              label={tZ('avg_receipt')}
              value={
                zFull.averageReceiptMinor
                  ? formatMoney(BigInt(zFull.averageReceiptMinor), currency)
                  : '—'
              }
            />
            <MetaRow
              label={tZ('gross_profit')}
              value={
                zFull.grossProfitMinor ? formatMoney(BigInt(zFull.grossProfitMinor), currency) : '—'
              }
            />
            <MetaRow
              label={tZ('discount')}
              value={formatMoney(BigInt(zFull.discountMinor), currency)}
            />
            <MetaRow
              label={tZ('credit_sold')}
              value={formatMoney(BigInt(zFull.creditSoldMinor), currency)}
            />
            <MetaRow
              label={tZ('debt_paid')}
              value={formatMoney(BigInt(zFull.debtPaidMinor), currency)}
            />
            <MetaRow
              label={tZ('returns')}
              value={formatMoney(BigInt(zFull.returnsMinor), currency)}
            />
            <MetaRow
              label={tZ('expense')}
              value={formatMoney(BigInt(zFull.expenseMinor), currency)}
            />
            <MetaRow
              label={tZ('collection')}
              value={formatMoney(BigInt(zFull.collectionMinor), currency)}
            />
            {/* G1 — vozvrat puli o'z qatori (xarajatga aralashmaydi). */}
            <MetaRow
              label={tZ('return_payout')}
              value={formatMoney(BigInt(zFull.returnPayoutMinor), currency)}
            />
            {/* A1 — mijozlardan qabul qilingan avans. ⚠️ KIRIM qatori:
                kutilgan naqd ichida ALLAQACHON bor, bu yerda faqat
                ko'rinish uchun. */}
            {zFull.prepayMinor != null && (
              <MetaRow
                label={tZ('prepay')}
                value={formatMoney(BigInt(zFull.prepayMinor), currency)}
              />
            )}
            {/* A2 — avansdan TO'LANGAN summa. Yuqoridagi qator bilan
                qo'shilmaydi: biri kirim, ikkinchisi sarf. */}
            {zFull.prepaySpentMinor != null && (
              <MetaRow
                label={tZ('prepay_spent')}
                value={formatMoney(BigInt(zFull.prepaySpentMinor), currency)}
              />
            )}
            {/* A3 — mijozga NAQD qaytarilgan avans. Yuqoridagi ikkalasi
                bilan ham qo'shilmaydi: kirim / sarf / chiqim — uch xil
                hodisa. */}
            {zFull.prepayRefundMinor != null && (
              <MetaRow
                label={tZ('prepay_refund')}
                value={formatMoney(BigInt(zFull.prepayRefundMinor), currency)}
              />
            )}
          </div>

          {/* Xarajatlar moddalar bo'yicha — §8.5 «xarajatlar (moddalar
              bo'yicha)» bandi; jami raqam qayerga ketganini ko'rsatadi. */}
          {zFull.expenseByItem.length > 0 && (
            <div className="mt-3 border-[var(--ms-border)] border-t pt-3">
              <div className="mb-1 text-[var(--ms-text-muted)] text-xs">
                {tZ('expense_by_item')}
              </div>
              {zFull.expenseByItem.map((i) => (
                <div key={i.id ?? 'none'} className="flex justify-between text-sm">
                  <span>{i.name ?? tZ('expense_no_item')}</span>
                  <span className="tabular-nums">{formatMoney(BigInt(i.sumMinor), currency)}</span>
                </div>
              ))}
            </div>
          )}

          {/* «Kassada bo'lishi kerak» — OCHIQ smenada ham (egasi, 2026-08-19,
              chek №EA8E779A). Ilgari bu blok faqat `state === 'closed'` da
              chizilardi: kassir naqd qarz to'lovini qabul qilgach, pul
              yashiqqa tushar, kutilgan naqd formulasiga ham kirar edi —
              lekin smena yopilmaguncha «bo'lishi kerak bo'lgan summa» hech
              qayerda KO'RINMASDI. Yopilgan smenada quyidagi eski blok
              muzlatilgan raqamni ko'rsatadi (hujjat), bu esa JONLI hisob.

              🔴 Kassirning O'ZIGA ko'rsatilmaydi (kiosk foydalanuvchi yoki
              shu smenaning kassiri): smena yopish sanog'i ataylab YOPIQ
              (F5/Q7) — kutilgan raqamni oldindan ko'rgan kassir sanoqni
              unga moslab yozardi. Menejer/egaga esa aynan shu son kerak. */}
          {session.state === 'open' && !isKioskUser(user) && user?.id !== session.cashier.id && (
            <div
              className="mt-3 border-[var(--ms-border)] border-t pt-3"
              data-test-id="shift-expected-live"
            >
              <div className="mb-1 text-[var(--ms-text-muted)] text-xs">
                {tZ('expected_live_title')}
              </div>
              <div className="flex flex-col gap-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--ms-text-muted)]">{t('opening_cash')}</span>
                  <span className="tabular-nums">
                    {formatMoney(BigInt(zFull.cashBreakdown.openingMinor), currency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--ms-text-muted)]">{tZ('sales_cash')}</span>
                  <span className="tabular-nums">
                    {formatMoney(BigInt(zFull.cashBreakdown.salesCashMinor), currency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--ms-text-muted)]">{tZ('debt_cash')}</span>
                  <span className="tabular-nums" data-test-id="shift-expected-debt-cash">
                    {formatMoney(BigInt(zFull.cashBreakdown.debtCashMinor), currency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--ms-text-muted)]">{tZ('drawer_in')}</span>
                  <span className="tabular-nums">
                    {formatMoney(BigInt(zFull.cashBreakdown.drawerInMinor), currency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--ms-text-muted)]">{tZ('drawer_out')}</span>
                  <span className="tabular-nums">
                    −{formatMoney(BigInt(zFull.cashBreakdown.drawerOutMinor), currency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--ms-text-muted)]">{tZ('returns_cash')}</span>
                  <span className="tabular-nums">
                    −{formatMoney(BigInt(zFull.cashBreakdown.returnsCashMinor), currency)}
                  </span>
                </div>
                <div className="mt-1 flex justify-between border-[var(--ms-border)] border-t pt-1 font-semibold">
                  <span>{t('expected_cash')}</span>
                  <span className="tabular-nums">
                    {formatMoney(BigInt(zFull.cashBreakdown.sumMinor), currency)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Farq aktlari — dalil. Menejer ko'rgani ham shu yerda. */}
          {zFull.variances.length > 0 && (
            <div className="mt-3 border-[var(--ms-border)] border-t pt-3">
              <div className="mb-1 text-[var(--ms-text-muted)] text-xs">{tZ('variance_acts')}</div>
              {zFull.variances.map((v) => (
                <div
                  key={v.currency}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    v.kind === 'shortage'
                      ? 'border-red-200 bg-red-50 text-red-800'
                      : 'border-amber-200 bg-amber-50 text-amber-800'
                  }`}
                  data-test-id={`variance-act-${v.currency}`}
                >
                  <div className="flex justify-between font-semibold">
                    <span>
                      {v.currency} · {tZ(v.kind === 'shortage' ? 'shortage' : 'surplus')}
                    </span>
                    <span className="tabular-nums">
                      {formatMoney(BigInt(v.varianceMinor), v.currency)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs opacity-80">
                    {tZ('expected')}: {formatMoney(BigInt(v.expectedMinor), v.currency)} ·{' '}
                    {tZ('counted')}: {formatMoney(BigInt(v.countedMinor), v.currency)}
                  </div>
                  {v.cashierNote && <div className="mt-1 text-xs">{v.cashierNote}</div>}
                  <div className="mt-1 text-[11px] opacity-70">
                    {v.acknowledgedAt ? tZ('ack_done') : tZ('ack_pending')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
