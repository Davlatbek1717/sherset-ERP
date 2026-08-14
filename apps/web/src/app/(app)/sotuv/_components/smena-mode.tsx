'use client';

/**
 * «Smena» rejimi — sessiya ma'lumotlari, kassa operatsiyalari (kirim/chiqim,
 * qarz to'lovi, xarajat/inkassatsiya), Z-hisobot va smenani yopish formasi.
 *
 * F1 (POS redizayn, 2026-08-14): JSX `page.tsx` dan XULQNI O'ZGARTIRMASDAN
 * ko'chirildi. Holat, so'rovlar va mutatsiyalar sahifada QOLADI — bu komponent
 * faqat props orqali oladi va chizadi. Barcha props MAJBURIY (prop-drop
 * bug-klassi typecheck'da tutilsin — [[documenteditor-prop-drop-bug]]).
 */

import type { CurrentSession } from '@moysklad/contracts';
import { formatMoney } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import type { Dispatch, SetStateAction } from 'react';

/**
 * Dollar summani (sentda) ekranga chiqaradi — ishora `$` dan OLDIN: `-$10.00`
 * (K-2 tuzatishi: ilgari `$-10.00` chiqardi va so'm qatoridagi
 * «-5 000,00 сум» bilan boshqacha o'qilardi).
 */
function formatUsd(minor: bigint): string {
  const abs = minor < 0n ? -minor : minor;
  return `${minor < 0n ? '-' : ''}$${(Number(abs) / 100).toFixed(2)}`;
}

interface SmenaModeProps {
  session: CurrentSession;
  /** Z-hisobotni chop etish — chek bilan ayni yo'l (agent → popup fallback). */
  printZReport: (sessionId: string) => Promise<void>;
  drawerMode: 'in' | 'out' | null;
  setDrawerMode: Dispatch<SetStateAction<'in' | 'out' | null>>;
  drawerAmount: string;
  setDrawerAmount: Dispatch<SetStateAction<string>>;
  drawerComment: string;
  setDrawerComment: Dispatch<SetStateAction<string>>;
  drawerPending: boolean;
  onDrawerSubmit: () => void;
  /** Mijoz kartasi — mijoz TANLANMAGAN holda ochiladi (qidiruvdan boshlanadi). */
  onOpenCustomerCard: () => void;
  /** Qarz to'lovi oynasi — mijoz tanlanmagan holda. */
  onOpenDebtPay: () => void;
  /** Xarajat (RKO) / inkassatsiya oynasi. */
  onOpenCashOut: () => void;
  showCloseForm: boolean;
  setShowCloseForm: Dispatch<SetStateAction<boolean>>;
  closingCash: string;
  setClosingCash: Dispatch<SetStateAction<string>>;
  closingCashUsd: string;
  setClosingCashUsd: Dispatch<SetStateAction<string>>;
  usdInPlay: boolean;
  expectedCash: bigint | null;
  closeVariance: bigint | null;
  expectedCashUsd: bigint | null;
  closeVarianceUsd: bigint | null;
  varianceNote: string;
  setVarianceNote: Dispatch<SetStateAction<string>>;
  closePending: boolean;
  onCloseShift: () => void;
}

export function SmenaMode({
  session,
  printZReport,
  drawerMode,
  setDrawerMode,
  drawerAmount,
  setDrawerAmount,
  drawerComment,
  setDrawerComment,
  drawerPending,
  onDrawerSubmit,
  onOpenCustomerCard,
  onOpenDebtPay,
  onOpenCashOut,
  showCloseForm,
  setShowCloseForm,
  closingCash,
  setClosingCash,
  closingCashUsd,
  setClosingCashUsd,
  usdInPlay,
  expectedCash,
  closeVariance,
  expectedCashUsd,
  closeVarianceUsd,
  varianceNote,
  setVarianceNote,
  closePending,
  onCloseShift,
}: SmenaModeProps) {
  const t = useTranslations('pages.sotuv');
  const tCommon = useTranslations('common');
  // F9 — mijoz kartasi yorliqlari POS komponentlari bilan bir joyda
  // (`pages.pos`), chunki panelning o'zi shu namespace'ni o'qiydi.
  const tPos = useTranslations('pages.pos');

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
      {/* Session info */}
      <div className="rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-app)] px-4 py-3 text-sm">
        <div className="flex justify-between mb-1">
          <span className="text-[var(--ms-text-muted)]">{t('cashier')}</span>
          <span className="font-medium">{session.cashier.name}</span>
        </div>
        {session.store && (
          <div className="flex justify-between mb-1">
            <span className="text-[var(--ms-text-muted)]">{t('store')}</span>
            <span className="font-medium">{session.store.name}</span>
          </div>
        )}
        {session.cashDesk && (
          <div className="flex justify-between mb-1">
            <span className="text-[var(--ms-text-muted)]">{t('cash_desk')}</span>
            <span className="font-medium">{session.cashDesk.name}</span>
          </div>
        )}
        <div className="flex justify-between mb-1">
          <span className="text-[var(--ms-text-muted)]">{t('opened_at')}</span>
          <span className="font-medium tabular-nums">
            {new Date(session.openedAt).toLocaleTimeString('uz-UZ', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--ms-text-muted)]">{t('sales')}</span>
          <span className="font-medium tabular-nums">
            {t('sales_count', { n: session.salesCount })} ·{' '}
            {formatMoney(BigInt(session.salesSumMinor))}
          </span>
        </div>
      </div>

      {/* Z-hisobot link */}
      <a
        href={`/retail/sessions/${session.id}`}
        className="flex items-center justify-between rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] px-4 py-3 text-sm font-medium text-[var(--ms-text-primary)] hover:bg-[var(--ms-bg-hover)]"
      >
        <span>{t('z_report')}</span>
        <span className="text-[var(--ms-text-muted)]">→</span>
      </a>

      {/* Z-hisobotni chop etish (F11). Ochiq smenada ham ishlaydi —
          server shu holatda sanoq va farqni `null` qaytaradi, chek
          esa ularni «sanalmagan» deb chizadi (nol EMAS). */}
      <button
        type="button"
        onClick={() => void printZReport(session.id)}
        data-test-id="print-z-report"
        className="flex w-full items-center justify-between rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] px-4 py-3 text-left font-medium text-[var(--ms-text-primary)] text-sm hover:bg-[var(--ms-bg-hover)]"
      >
        <span>{t('print_z_report')}</span>
        <span className="text-[var(--ms-text-muted)]">🖨</span>
      </button>

      {/* Drawer — Внесение / Изъятие */}
      <div className="rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--ms-text-muted)]">
          {t('cash_operation')}
        </p>
        <div className="mb-3 flex gap-2">
          <button
            type="button"
            onClick={() => setDrawerMode(drawerMode === 'in' ? null : 'in')}
            className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
              drawerMode === 'in'
                ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                : 'border-[var(--ms-border)] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]'
            }`}
          >
            + {t('drawer_in')}
          </button>
          <button
            type="button"
            onClick={() => setDrawerMode(drawerMode === 'out' ? null : 'out')}
            className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
              drawerMode === 'out'
                ? 'border-orange-400 bg-orange-50 text-orange-700'
                : 'border-[var(--ms-border)] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]'
            }`}
          >
            − {t('drawer_out')}
          </button>
        </div>
        {/* Qarz to'lovi (kassa TZ §7.2) — naqd bo'lsa shu smenaning
            «kutilgan naqd»iga kiradi, ya'ni smena yakunida ortiqcha
            ko'rinmaydi. Shuning uchun u shu yerda, kassa operatsiyalari
            ichida turadi. */}
        {/* F9 — mijoz kartasi: telefon-qidiruv, qarz (ikki daftar),
            oxirgi cheklar, jarayondagi zakazlar. */}
        <button
          type="button"
          onClick={onOpenCustomerCard}
          data-test-id="pos-customer-card-open"
          className="mb-3 w-full rounded-lg border border-[var(--ms-border)] py-2 text-sm font-medium text-[var(--ms-text-primary)] transition-colors hover:bg-[var(--ms-bg-hover)]"
        >
          {tPos('customer_card_title')}
        </button>
        <button
          type="button"
          onClick={onOpenDebtPay}
          data-test-id="pos-debt-pay-open"
          className="mb-3 w-full rounded-lg border border-[var(--ms-border)] py-2 text-sm font-medium text-[var(--ms-text-primary)] transition-colors hover:bg-[var(--ms-bg-hover)]"
        >
          {t('debt_payment')}
        </button>
        {/* Xarajat (RKO) va inkassatsiya — kassa TZ §8.2/§8.3. Ikkalasi
            ham yashiqdan pul chiqaradi, ya'ni smena yakunidagi
            «kutilgan naqd» shuncha kamayadi. */}
        <button
          type="button"
          onClick={onOpenCashOut}
          data-test-id="pos-cash-out-open"
          className="mb-3 w-full rounded-lg border border-[var(--ms-border)] py-2 text-sm font-medium text-[var(--ms-text-primary)] transition-colors hover:bg-[var(--ms-bg-hover)]"
        >
          {t('expense_or_collection')}
        </button>
        {drawerMode && (
          <div className="flex flex-col gap-2">
            <input
              type="number"
              min="0"
              inputMode="decimal"
              value={drawerAmount}
              onChange={(e) => setDrawerAmount(e.target.value)}
              placeholder={t('amount_placeholder')}
              // biome-ignore lint/a11y/noAutofocus: intentional POS focus — cashier types the amount immediately when this drawer opens.
              autoFocus
              className="h-10 w-full rounded-lg border border-[var(--ms-border)] bg-[var(--ms-bg-input)] px-3 text-sm focus:outline-none focus:border-[var(--ms-border-focus)]"
            />
            <input
              type="text"
              value={drawerComment}
              onChange={(e) => setDrawerComment(e.target.value)}
              placeholder={t('comment_placeholder')}
              className="h-10 w-full rounded-lg border border-[var(--ms-border)] bg-[var(--ms-bg-input)] px-3 text-sm focus:outline-none focus:border-[var(--ms-border-focus)]"
            />
            <button
              type="button"
              onClick={onDrawerSubmit}
              disabled={drawerPending || !(Number(drawerAmount) > 0)}
              className={`h-10 w-full rounded-lg font-semibold text-sm text-white disabled:opacity-40 ${
                drawerMode === 'in'
                  ? 'bg-emerald-500 hover:bg-emerald-600'
                  : 'bg-orange-500 hover:bg-orange-600'
              }`}
            >
              {drawerPending
                ? '...'
                : drawerMode === 'in'
                  ? t('drawer_in_confirm')
                  : t('drawer_out_confirm')}
            </button>
          </div>
        )}
      </div>

      {/* Close shift */}
      <div className="rounded-xl border border-red-200 bg-[var(--ms-bg-surface)] p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--ms-text-muted)]">
          {t('shift_close_section')}
        </p>
        {!showCloseForm ? (
          <button
            type="button"
            onClick={() => setShowCloseForm(true)}
            className="w-full rounded-lg border border-red-300 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            {t('shift_close_btn')}
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <input
              type="number"
              min="0"
              value={closingCash}
              onChange={(e) => setClosingCash(e.target.value)}
              placeholder={t('closing_cash_placeholder')}
              // biome-ignore lint/a11y/noAutofocus: intentional POS focus — cashier enters the closing cash count immediately when this dialog opens.
              autoFocus
              className="h-10 w-full rounded-lg border border-[var(--ms-border)] bg-[var(--ms-bg-input)] px-3 text-sm focus:outline-none focus:border-[var(--ms-border-focus)]"
            />

            {/* MK31 — sanalgan DOLLAR (§8.4). Faqat smenada dollar
                oqimi bo'lgan holatda; server bu holatda sanoqni
                MAJBURIY qiladi. */}
            {usdInPlay && (
              <input
                type="number"
                min="0"
                step="0.01"
                value={closingCashUsd}
                onChange={(e) => setClosingCashUsd(e.target.value)}
                placeholder={t('closing_cash_usd_placeholder')}
                data-test-id="close-cash-usd"
                className="h-10 w-full rounded-lg border border-[var(--ms-border)] bg-[var(--ms-bg-input)] px-3 text-sm focus:outline-none focus:border-[var(--ms-border-focus)]"
              />
            )}

            {/* Kutilgan naqd va farq — TASDIQLASHDAN OLDIN.
                Kassir raqamni ko'rmasdan yopsa, farqni faqat menejer
                ertaga ko'radi va sababini hech kim eslamaydi. */}
            {expectedCash !== null && (
              <div className="rounded-lg border border-[var(--ms-border)] bg-[var(--ms-bg-input)] px-3 py-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[var(--ms-text-muted)]">{t('expected_cash')}</span>
                  <span className="font-medium tabular-nums">{formatMoney(expectedCash)}</span>
                </div>
                {closeVariance !== null && (
                  <div
                    className={`mt-1 flex justify-between font-semibold ${
                      closeVariance === 0n
                        ? 'text-emerald-700'
                        : closeVariance < 0n
                          ? 'text-red-700'
                          : 'text-amber-700'
                    }`}
                    data-test-id="close-variance"
                  >
                    <span>
                      {closeVariance === 0n
                        ? t('variance_none')
                        : closeVariance < 0n
                          ? t('variance_shortage')
                          : t('variance_surplus')}
                    </span>
                    <span className="tabular-nums">
                      {closeVariance === 0n ? '0' : formatMoney(closeVariance)}
                    </span>
                  </div>
                )}

                {/* Dollar qatori — SENTDA, so'mga o'girilmaydi (§8.4).
                    O'girilsa yo'qolgan dollar «taxminiy so'm»ga
                    aylanib, farq dalil bo'lishdan to'xtardi. */}
                {usdInPlay && expectedCashUsd !== null && (
                  <>
                    <div className="mt-1 flex justify-between border-t border-[var(--ms-border)] pt-1">
                      <span className="text-[var(--ms-text-muted)]">{t('expected_cash_usd')}</span>
                      <span className="font-medium tabular-nums">{formatUsd(expectedCashUsd)}</span>
                    </div>
                    {closeVarianceUsd !== null && (
                      <div
                        className={`mt-1 flex justify-between font-semibold ${
                          closeVarianceUsd === 0n
                            ? 'text-emerald-700'
                            : closeVarianceUsd < 0n
                              ? 'text-red-700'
                              : 'text-amber-700'
                        }`}
                        data-test-id="close-variance-usd"
                      >
                        <span>
                          {closeVarianceUsd === 0n
                            ? t('variance_none')
                            : closeVarianceUsd < 0n
                              ? t('variance_shortage')
                              : t('variance_surplus')}
                        </span>
                        <span className="tabular-nums">{formatUsd(closeVarianceUsd)}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Izoh maydoni FAQAT farq bo'lganda: farqsiz smenada u
                ortiqcha savol bo'lardi va kassir uni e'tiborsiz
                qoldirishga o'rganib qolardi. */}
            {((closeVariance !== null && closeVariance !== 0n) ||
              (closeVarianceUsd !== null && closeVarianceUsd !== 0n)) && (
              <input
                type="text"
                value={varianceNote}
                onChange={(e) => setVarianceNote(e.target.value)}
                placeholder={t('variance_note_placeholder')}
                data-test-id="close-variance-note"
                className="h-10 w-full rounded-lg border border-amber-300 bg-amber-50 px-3 text-sm focus:outline-none focus:border-amber-500"
              />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCloseShift}
                disabled={closePending}
                className="flex-1 h-10 rounded-lg bg-red-600 font-semibold text-sm text-white hover:bg-red-700 disabled:opacity-40"
              >
                {closePending ? t('closing') : t('confirm')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCloseForm(false);
                  setClosingCash('');
                  setVarianceNote('');
                }}
                className="h-10 rounded-lg border border-[var(--ms-border)] px-4 text-sm text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]"
              >
                {tCommon('cancel')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
