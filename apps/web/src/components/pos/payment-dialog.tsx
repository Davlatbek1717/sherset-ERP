'use client';

import { ceilAmountInput, formatAmountInput, parseAmountToMinor } from '@/lib/pos/parse-amount';
import type { CurrencyCode } from '@moysklad/money/currencies';
import { formatMoney, noAccidentalClose } from '@moysklad/ui';
import * as Dialog from '@radix-ui/react-dialog';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sumMinor: bigint;
  /** Kassa valyutasi — major→minor konversiya scale'ini belgilaydi (FE-08). */
  currency?: CurrencyCode;
  onConfirm: (cashAmountMinor: bigint, cardAmountMinor: bigint, changeMinor: bigint) => void;
  loading?: boolean;
}

/**
 * F3 (POS redizayn, spec §5.1): banknot nominallari — bosilganda qiymat naqd
 * maydoniga **O'RNATILADI** (eski +1 000…+50 000 QO'SHISH tugmalari bekor:
 * kassir «500 ming berdi» deb bosganda avvalgi kiritma ustiga qo'shilib
 * summa adashardi).
 */
const QUICK_SET_AMOUNTS = [100_000_00n, 200_000_00n, 500_000_00n];

/** Tugma yorlig'i: «100 000» (valyutasiz — nominal, summa emas; NBSP emas
    oddiy bo'shliq — testlar/qidiruv matn bo'yicha topa olsin). */
function quickLabel(amountMinor: bigint): string {
  return Number(amountMinor / 100n)
    .toLocaleString('uz-UZ')
    .replace(/ /g, ' ');
}

export function PaymentDialog({
  open,
  onOpenChange,
  sumMinor,
  currency = 'UZS',
  onConfirm,
  loading = false,
}: PaymentDialogProps) {
  const t = useTranslations('pages.payment_dialog');

  const [cashInput, setCashInput] = useState('');
  const [cardInput, setCardInput] = useState('');
  const [activeField, setActiveField] = useState<'cash' | 'card'>('cash');

  // FE-08/FE-09: yagona pul-parse. Ilgari `parseInt(s, 10) * 100` edi —
  // kiritilgan tiyinni jim kesardi, 0 kasrli kassada 100× shishirardi va
  // 15+ raqamda `BigInt()` RangeError bilan oynani yiqitardi.
  const cashAmount = parseAmountToMinor(cashInput, currency);
  const cardAmount = parseAmountToMinor(cardInput, currency);
  const totalPaid = cashAmount + cardAmount;
  const change = totalPaid >= sumMinor ? totalPaid - sumMinor : 0n;
  const canConfirm = totalPaid >= sumMinor && !loading;

  const handleDigit = useCallback(
    (digit: string) => {
      if (activeField === 'cash') {
        setCashInput((prev) => (prev === '0' ? digit : prev + digit));
      } else {
        setCardInput((prev) => (prev === '0' ? digit : prev + digit));
      }
    },
    [activeField],
  );

  const handleBackspace = useCallback(() => {
    if (activeField === 'cash') {
      setCashInput((prev) => prev.slice(0, -1));
    } else {
      setCardInput((prev) => prev.slice(0, -1));
    }
  }, [activeField]);

  const handleExact = () => {
    setCashInput(ceilAmountInput(sumMinor, currency));
    setCardInput('');
  };

  // O'RNATADI, qo'shmaydi (yuqoridagi QUICK_SET_AMOUNTS izohi). Faol maydon
  // naqdga qaytariladi — nominal tugmalar naqd pul haqida.
  const handleQuickSet = (amountMinor: bigint) => {
    setCashInput(formatAmountInput(amountMinor, currency));
    setActiveField('cash');
  };

  const handleConfirm = () => {
    if (canConfirm) {
      onConfirm(cashAmount, cardAmount, change);
    }
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) {
      setCashInput('');
      setCardInput('');
      setActiveField('cash');
    }
    onOpenChange(o);
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        {/* Tasodifiy yopilish yo'q: Esc ham, chetiga bosish ham oynani
            yopmaydi — faqat «Bekor» / to'lov tugmasi (kassir monoblokda
            yarim kiritilgan to'lovni yo'qotardi). */}
        <Dialog.Content
          {...noAccidentalClose}
          className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 w-full max-w-md rounded-xl bg-[var(--ms-bg-surface)] p-6 shadow-2xl outline-none"
        >
          <Dialog.Title className="mb-4 font-semibold text-[var(--ms-text-primary)] text-lg">
            {t('title')}
          </Dialog.Title>

          {/* Total */}
          <div className="mb-4 text-center">
            <div className="text-[var(--ms-text-muted)] text-sm">{t('total_label')}</div>
            <div className="font-bold text-3xl text-[var(--ms-text-primary)] tabular-nums">
              {formatMoney(sumMinor)}
            </div>
          </div>

          {/* Cash / Card inputs */}
          <div className="mb-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              data-test-id="payment-cash-field"
              onClick={() => setActiveField('cash')}
              className={`flex flex-col rounded-lg border-2 p-3 text-left transition-colors ${
                activeField === 'cash'
                  ? 'border-[var(--ms-brand)] bg-[var(--ms-brand)]/5'
                  : 'border-[var(--ms-border)] bg-[var(--ms-bg-input)]'
              }`}
            >
              <span className="mb-1 text-[var(--ms-text-muted)] text-xs">{t('cash')}</span>
              <span className="font-semibold text-[var(--ms-text-primary)] text-xl tabular-nums">
                {cashInput ? formatMoney(cashAmount) : '0'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveField('card')}
              className={`flex flex-col rounded-lg border-2 p-3 text-left transition-colors ${
                activeField === 'card'
                  ? 'border-[var(--ms-brand)] bg-[var(--ms-brand)]/5'
                  : 'border-[var(--ms-border)] bg-[var(--ms-bg-input)]'
              }`}
            >
              <span className="mb-1 text-[var(--ms-text-muted)] text-xs">{t('card')}</span>
              <span className="font-semibold text-[var(--ms-text-primary)] text-xl tabular-nums">
                {cardInput ? formatMoney(cardAmount) : '0'}
              </span>
            </button>
          </div>

          {/* Change */}
          {change > 0n && (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-center">
              <span className="text-green-700 text-sm">{t('change')}: </span>
              <span className="font-bold text-green-800 text-lg tabular-nums">
                {formatMoney(change)}
              </span>
            </div>
          )}

          {/* Tez-summa tugmalari (F3): «Aniq summa» + banknot nominallari.
              Balandlik px'da (48px) — barmoq nishoni (ildiz font 12px,
              rem-klasslar 0.75× kichik chiqadi). */}
          <div className="mb-4 grid grid-cols-4 gap-2">
            <button
              type="button"
              data-test-id="payment-quick-exact"
              onClick={handleExact}
              className="h-[48px] rounded-lg border border-[var(--ms-border)] bg-[var(--ms-bg-input)] px-1 font-semibold text-[14px] transition-colors hover:bg-[var(--ms-bg-hover)]"
            >
              {t('exact')}
            </button>
            {QUICK_SET_AMOUNTS.map((amount) => (
              <button
                type="button"
                key={amount.toString()}
                data-test-id="payment-quick-set"
                onClick={() => handleQuickSet(amount)}
                className="h-[48px] rounded-lg border border-[var(--ms-border)] bg-[var(--ms-bg-input)] px-1 font-semibold text-[14px] tabular-nums transition-colors hover:bg-[var(--ms-bg-hover)]"
              >
                {quickLabel(amount)}
              </button>
            ))}
          </div>

          {/* Numeric keypad */}
          <div className="mb-4 grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'].map((k) => (
              <button
                type="button"
                key={k}
                onClick={() => (k === '⌫' ? handleBackspace() : handleDigit(k))}
                className="h-12 rounded-lg border border-[var(--ms-border)] bg-[var(--ms-bg-input)] font-semibold text-[var(--ms-text-primary)] text-lg transition-all hover:bg-[var(--ms-bg-hover)] active:scale-95"
              >
                {k}
              </button>
            ))}
          </div>

          {/* Confirm button */}
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="h-12 w-full rounded-xl bg-[var(--ms-brand)] font-semibold text-base text-white transition-all hover:bg-[var(--ms-brand-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? '...' : t('confirm')}
          </button>

          <Dialog.Close asChild>
            <button
              type="button"
              className="mt-3 h-10 w-full rounded-xl border border-[var(--ms-border)] text-[var(--ms-text-muted)] text-sm transition-colors hover:bg-[var(--ms-bg-hover)]"
            >
              {t('cancel')}
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
