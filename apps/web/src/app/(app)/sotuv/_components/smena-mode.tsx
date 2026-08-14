'use client';

/**
 * «Smena» rejimi — sessiya ma'lumotlari, kassa operatsiyalari (kirim/chiqim,
 * qarz to'lovi, xarajat/inkassatsiya), Z-hisobot va smenani yopish formasi.
 *
 * F1 (POS redizayn, 2026-08-14): JSX `page.tsx` dan XULQNI O'ZGARTIRMASDAN
 * ko'chirildi. Holat, so'rovlar va mutatsiyalar sahifada QOLADI — bu komponent
 * faqat props orqali oladi va chizadi. Barcha props MAJBURIY (prop-drop
 * bug-klassi typecheck'da tutilsin — [[documenteditor-prop-drop-bug]]).
 *
 * F5 (spec §5.4, Q7 — egasi qarori): smena yopish sanog'i YOPIQ (blind).
 * Holat mashinasi SHU komponentda: `idle → counting → review → closing`.
 * `counting` da kutilgan summa DOM'ga UMUMAN chizilmaydi (so'rov sahifada
 * yuradi, lekin natijasi faqat `review` da ko'rinadi) — kassir sanoqni
 * kutilgan raqamga moslab yoza olmasin. `review` dan sanoqqa qaytish YO'Q:
 * faqat butun oqimni bekor qilish (sanoq tozalanadi). Farq≠0 → izoh MAJBURIY.
 * Server smena-qoidalari O'ZGARMAGAN — u baribir o'zi hisoblaydi.
 */

/**
 * Sanoq numpad tugmalari — `cart-line-edit-modal` naqshi, lekin `.` o'rniga
 * `000`: so'm sanog'i butun son, uch nol esa naqd pul dastalarida eng ko'p
 * bosiladigan qadam. Dollar maydoni faolida `000` → `.` (sent kiritish uchun).
 */
const COUNT_NUMPAD_SOM = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'];
const COUNT_NUMPAD_USD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

/** Maydon uzunligi chegarasi — 13 xonali summa `bigint` da ham xavfsiz. */
const COUNT_MAX_LEN = 12;

import type { CurrentSession } from '@moysklad/contracts';
import { formatMoney } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { type Dispatch, type SetStateAction, useState } from 'react';

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
  /** Kassir sanagan so'm (minor) — review'dagi «Sanadingiz» qatori. */
  countedCash: bigint | null;
  /** Kassir sanagan dollar (sent) — `null` = sanalmagan (0 EMAS). */
  countedCashUsd: bigint | null;
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
  countedCash,
  countedCashUsd,
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

  // ── F5 — yopiq sanoq holat mashinasi ──────────────────────────────────────
  // `idle` = showCloseForm false. Bosqich SHU yerda: sahifa faqat qiymatlarni
  // biladi (sanoq satri, kutilgan, farq), ko'rsatish TARTIBI esa Q7 qarori —
  // ko'rinish qatlamining ishi.
  const [closeStage, setCloseStage] = useState<'counting' | 'review'>('counting');
  // Numpad qaysi maydonga yozadi (dollar maydoni bor smenada).
  const [countField, setCountField] = useState<'som' | 'usd'>('som');

  const setCount = countField === 'som' ? setClosingCash : setClosingCashUsd;
  const handleCountKey = (key: string) => {
    if (key === '⌫') {
      setCount((prev) => prev.slice(0, -1));
      return;
    }
    setCount((prev) => {
      if (key === '.') {
        if (prev.includes('.')) return prev;
        return prev === '' ? '0.' : `${prev}.`;
      }
      const next = prev + key;
      return next.length > COUNT_MAX_LEN ? prev : next;
    });
  };

  /** Butun oqimni bekor qilish — sanoq TOZALANADI (review'dan qaytish yo'li YO'Q). */
  const cancelCloseFlow = () => {
    setShowCloseForm(false);
    setClosingCash('');
    setClosingCashUsd('');
    setVarianceNote('');
    setCloseStage('counting');
    setCountField('som');
  };

  // Farq≠0 (so'm YOKI dollar) → izoh MAJBURIY. Farq noma'lum (preview kelmadi)
  // bo'lsa majburlanmaydi — server baribir o'zi hisoblaydi (mavjud shartnoma).
  const noteRequired =
    (closeVariance !== null && closeVariance !== 0n) ||
    (closeVarianceUsd !== null && closeVarianceUsd !== 0n);

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
            onClick={() => {
              setCloseStage('counting');
              setCountField('som');
              setShowCloseForm(true);
            }}
            className="h-[var(--pos-touch-min)] w-full rounded-xl border border-red-300 text-[18px] font-semibold text-red-600 hover:bg-red-50"
          >
            {t('shift_close_btn')}
          </button>
        ) : closeStage === 'counting' ? (
          /* ── COUNTING — YOPIQ sanoq (Q7): kutilgan summa bu bosqichda
                DOM'da YO'Q. Faqat sanoq maydon(lar)i + katta numpad. */
          <div className="flex flex-col gap-2">
            <input
              type="number"
              min="0"
              value={closingCash}
              onChange={(e) => setClosingCash(e.target.value)}
              onFocus={() => setCountField('som')}
              placeholder={t('closing_cash_placeholder')}
              // biome-ignore lint/a11y/noAutofocus: intentional POS focus — cashier enters the closing cash count immediately when this dialog opens.
              autoFocus
              data-count-active={countField === 'som' || undefined}
              className={`h-[56px] w-full rounded-xl border bg-[var(--ms-bg-input)] px-3 text-[20px] tabular-nums focus:outline-none ${
                countField === 'som'
                  ? 'border-[var(--ms-border-focus)]'
                  : 'border-[var(--ms-border)]'
              }`}
            />

            {/* MK31 — sanalgan DOLLAR (§8.4). Faqat smenada dollar
                oqimi bo'lgan holatda; server bu holatda sanoqni
                MAJBURIY qiladi. Maydonning BORLIGI kutilgan summani
                oshkor qilmaydi — faqat «dollar oqimi bo'lgan» faktini. */}
            {usdInPlay && (
              <input
                type="number"
                min="0"
                step="0.01"
                value={closingCashUsd}
                onChange={(e) => setClosingCashUsd(e.target.value)}
                onFocus={() => setCountField('usd')}
                placeholder={t('closing_cash_usd_placeholder')}
                data-test-id="close-cash-usd"
                className={`h-[56px] w-full rounded-xl border bg-[var(--ms-bg-input)] px-3 text-[20px] tabular-nums focus:outline-none ${
                  countField === 'usd'
                    ? 'border-[var(--ms-border-focus)]'
                    : 'border-[var(--ms-border)]'
                }`}
              />
            )}

            {/* Katta numpad (spec §5.4) — sensorli sanoq. Faol maydonga
                yozadi; dollar faolida `000` o'rniga `.` (sent). */}
            <div className="grid grid-cols-3 gap-2" data-test-id="close-count-numpad">
              {(countField === 'usd' ? COUNT_NUMPAD_USD : COUNT_NUMPAD_SOM).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleCountKey(key)}
                  className="h-[64px] rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] text-[22px] font-semibold tabular-nums text-[var(--ms-text-primary)] transition-all hover:bg-[var(--ms-bg-hover)] active:scale-95"
                >
                  {key}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCloseStage('review')}
                disabled={closingCash.trim() === ''}
                data-test-id="close-continue"
                className="h-[var(--pos-touch-min)] flex-1 rounded-xl bg-red-600 text-[18px] font-bold text-white hover:bg-red-700 disabled:opacity-40"
              >
                {t('close_continue')}
              </button>
              <button
                type="button"
                onClick={cancelCloseFlow}
                data-test-id="close-cancel"
                className="h-[var(--pos-touch-min)] rounded-xl border border-[var(--ms-border)] px-5 text-[16px] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]"
              >
                {tCommon('cancel')}
              </button>
            </div>
          </div>
        ) : (
          /* ── REVIEW — Sanadingiz · Kutilgan · Farq. Sanoqqa QAYTISH YO'Q
                (Q7): farqni ko'rib raqamni «to'g'irlab qo'yish» yopiq —
                faqat butun oqimni bekor qilish (sanoq tozalanadi). */
          <div className="flex flex-col gap-2">
            <div className="rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-input)] px-3 py-2 text-[16px]">
              <div className="flex justify-between">
                <span className="text-[var(--ms-text-muted)]">{t('close_counted')}</span>
                <span className="font-semibold tabular-nums">{formatMoney(countedCash ?? 0n)}</span>
              </div>
              {expectedCash !== null && (
                <div className="mt-1 flex justify-between">
                  <span className="text-[var(--ms-text-muted)]">{t('expected_cash')}</span>
                  <span className="font-medium tabular-nums">{formatMoney(expectedCash)}</span>
                </div>
              )}
              {closeVariance !== null && (
                <div
                  className={`mt-1 flex justify-between text-[18px] font-bold ${
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

              {/* Dollar bloki — SENTDA, so'mga o'girilmaydi (§8.4).
                  O'girilsa yo'qolgan dollar «taxminiy so'm»ga aylanib,
                  farq dalil bo'lishdan to'xtardi. */}
              {usdInPlay && expectedCashUsd !== null && (
                <>
                  <div className="mt-1 flex justify-between border-t border-[var(--ms-border)] pt-1">
                    <span className="text-[var(--ms-text-muted)]">{t('close_counted')}</span>
                    <span className="font-medium tabular-nums">
                      {countedCashUsd === null ? '—' : formatUsd(countedCashUsd)}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between">
                    <span className="text-[var(--ms-text-muted)]">{t('expected_cash_usd')}</span>
                    <span className="font-medium tabular-nums">{formatUsd(expectedCashUsd)}</span>
                  </div>
                  {closeVarianceUsd !== null && (
                    <div
                      className={`mt-1 flex justify-between text-[18px] font-bold ${
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

            {/* Farq bor → izoh MAJBURIY (F5; ilgari ixtiyoriy edi). Sabab
                ayni damda yoziladi — ertaga hech kim eslay olmaydi. */}
            {noteRequired && (
              <>
                <input
                  type="text"
                  value={varianceNote}
                  onChange={(e) => setVarianceNote(e.target.value)}
                  placeholder={t('variance_note_placeholder')}
                  data-test-id="close-variance-note"
                  className="h-[56px] w-full rounded-xl border border-amber-300 bg-amber-50 px-3 text-[16px] focus:outline-none focus:border-amber-500"
                />
                {varianceNote.trim() === '' && (
                  <p className="text-[14px] font-medium text-amber-700">
                    {t('close_note_required')}
                  </p>
                )}
              </>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCloseShift}
                disabled={closePending || (noteRequired && varianceNote.trim() === '')}
                className="h-[var(--pos-touch-min)] flex-1 rounded-xl bg-red-600 text-[18px] font-bold text-white hover:bg-red-700 disabled:opacity-40"
              >
                {closePending ? t('closing') : t('confirm')}
              </button>
              <button
                type="button"
                onClick={cancelCloseFlow}
                data-test-id="close-cancel"
                className="h-[var(--pos-touch-min)] rounded-xl border border-[var(--ms-border)] px-5 text-[16px] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]"
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
