'use client';

/**
 * «QO'NG'IROQ QILINDI» modali — qarzdor bilan suhbat natijasi.
 *
 * 1-qadam — natija (4 tugma):
 *   ✅ To'ladi · 🟡 Bir qismini to'ladi · 🔴 To'lamadi · 🔁 Qayta qo'ng'iroq
 *
 * 2-qadam (2026-07-13 talab) — to'lov bo'lgan bo'lsa, MIJOZ QANDAY TO'LADI:
 *   💵 NAQD  → valyuta (so'm / dollar) + summa + kurs
 *              → mijoz kartochkasining NAQD bo'limida ko'rinadi
 *   💳 CLICK → summa + CHEK RASMI (majburiy)
 *              → mijoz kartochkasining KARTA/CLICK bo'limida ko'rinadi
 *
 * Dollar to'lovda kurs majburiy — qarz daftari so'mda yuritiladi, shuning
 * uchun server sent × kurs orqali so'mga o'giradi. So'm to'lovda ham kurs
 * kiritish mumkin (ma'lumot uchun), lekin majburiy emas.
 *
 * Qarzdorlar ro'yxati, Bugungi qo'ng'iroqlar va detal sahifasi — hammasi shu
 * bitta komponentni ishlatadi (bir xil xulq).
 */

import {
  type CallOutcome,
  type CallPaymentKind,
  type PaymentCurrency,
  RATE_SCALE,
  debtApi,
  todayAt9InputValue,
} from '@/lib/debt-api';
import { Button, Input, Modal, MoneyInput, Textarea, formatMoney } from '@moysklad/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

const OUTCOMES: Array<{ value: CallOutcome; tone: string }> = [
  { value: 'paid_full', tone: 'bg-[var(--ms-success-100)] border-[var(--ms-success-300)]' },
  { value: 'paid_partial', tone: 'bg-[var(--ms-warning-100)] border-[var(--ms-warning-300)]' },
  { value: 'not_paid', tone: 'bg-[var(--ms-destructive-100)] border-[var(--ms-destructive-300)]' },
  { value: 'callback', tone: 'bg-[var(--ms-bg-muted)] border-[var(--ms-border-strong)]' },
];

/** Chek rasmi uchun chegara — katta fayl API'ni bo'g'masin. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function outcomeLabelKey(o: CallOutcome): string {
  return `outcome_${o}`;
}

/** "12 800,5" / "12800.50" → kurs ×10000 (BigInt string). Bo'sh bo'lsa null. */
function rateToMinor(raw: string): string | null {
  const cleaned = raw.replace(/\s/g, '').replace(',', '.');
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(Math.round(n * RATE_SCALE));
}

/** "1250,75" → sent (BigInt string). Bo'sh/noto'g'ri bo'lsa null. */
function usdToCents(raw: string): string | null {
  const cleaned = raw.replace(/\s/g, '').replace(',', '.');
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(Math.round(n * 100));
}

export function CallOutcomeModal({
  debtId,
  debtorName,
  open,
  onClose,
  remainingMinor,
}: {
  debtId: string;
  debtorName: string;
  open: boolean;
  onClose: () => void;
  /** Qolgan qarz (tiyin) — «To'ladi» tasdig'ida aynan shu summa yopiladi. */
  remainingMinor?: string;
}) {
  const t = useTranslations('pages.debts');
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [text, setText] = useState('');
  const [nextAt, setNextAt] = useState(todayAt9InputValue());
  const [error, setError] = useState<string | null>(null);

  // To'lov qismi (2026-07-13)
  const [kind, setKind] = useState<CallPaymentKind | null>(null);
  const [currency, setCurrency] = useState<PaymentCurrency>('UZS');
  /** So'mdagi summa — tiyin (MoneyInput). */
  const [somMinor, setSomMinor] = useState('0');
  /** Dollardagi summa — foydalanuvchi yozgan matn ("1 250,50"). */
  const [usdText, setUsdText] = useState('');
  /** Kurs — foydalanuvchi yozgan matn ("12 800"). */
  const [rateText, setRateText] = useState('');
  /** Chek rasmi — data-URI. */
  const [shot, setShot] = useState<{ dataUri: string; name: string; mime: string } | null>(null);

  const isPayment = outcome === 'paid_full' || outcome === 'paid_partial';
  const rateMinor = rateToMinor(rateText);
  const usdCents = usdToCents(usdText);

  /** Ekranda ko'rsatiladigan so'm ekvivalenti (server ham xuddi shunday hisoblaydi). */
  const somEquivalent: string | null =
    currency === 'USD' && usdCents && rateMinor
      ? ((BigInt(usdCents) * BigInt(rateMinor)) / BigInt(RATE_SCALE)).toString()
      : null;

  function reset() {
    setOutcome(null);
    setText('');
    setNextAt(todayAt9InputValue());
    setKind(null);
    setCurrency('UZS');
    setSomMinor('0');
    setUsdText('');
    setRateText('');
    setShot(null);
    setError(null);
  }

  /** Natija almashsa — to'lov formasi tozalanadi (eski summa qolib ketmasin). */
  function pickOutcome(o: CallOutcome) {
    setOutcome(o);
    setError(null);
    if (o !== 'paid_full' && o !== 'paid_partial') {
      setKind(null);
      setSomMinor('0');
      setUsdText('');
      setShot(null);
      return;
    }
    // «To'liq to'ladi» — summa oldindan qoldiq bilan to'ldiriladi (odatiy holat).
    if (o === 'paid_full' && remainingMinor) setSomMinor(remainingMinor);
  }

  function onPickFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setError(t('screenshot_too_big'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setShot({ dataUri: String(reader.result), name: file.name, mime: file.type || 'image/png' });
      setError(null);
    };
    reader.readAsDataURL(file);
  }

  const save = useMutation({
    mutationFn: () => {
      // Click — doim so'mda; naqd — tanlangan valyutada.
      const useUsd = isPayment && kind === 'cash' && currency === 'USD';
      const originalMinor = useUsd ? usdCents : somMinor;

      return debtApi.markCall(debtId, {
        outcome: outcome as CallOutcome,
        text: text.trim() || undefined,
        nextContactAt:
          outcome === 'paid_full' ? null : nextAt ? new Date(nextAt).toISOString() : null,
        ...(isPayment && kind
          ? {
              paymentKind: kind,
              currency: useUsd ? ('USD' as const) : ('UZS' as const),
              amountOriginalMinor: originalMinor ?? undefined,
              // Kurs so'm to'lovda ham yuboriladi (ixtiyoriy ma'lumot).
              exchangeRate: rateMinor ?? undefined,
              ...(kind === 'click' && shot
                ? { screenshotBase64: shot.dataUri, filename: shot.name, mime: shot.mime }
                : {}),
            }
          : {}),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['debts'] });
      reset();
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  // Majburiylik qoidalari:
  //   callback     → keyingi sana
  //   paid_partial → to'lov turi + summa + keyingi sana (qoldiq bor)
  //   paid_full    → to'lov turi + summa (sana kerak emas — qarz yopiladi)
  //   click        → chek rasmi
  //   dollar       → kurs
  const needsDate = outcome === 'callback' || outcome === 'paid_partial';
  const amountOk =
    !isPayment ||
    (kind === 'cash' && currency === 'USD'
      ? usdCents !== null && rateMinor !== null
      : somMinor !== '' && somMinor !== '0');
  const shotOk = !isPayment || kind !== 'click' || shot !== null;

  const valid =
    outcome !== null &&
    (!needsDate || nextAt !== '') &&
    (!isPayment || kind !== null) &&
    amountOk &&
    shotOk;

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
      title={`${t('call_modal_title')} — ${debtorName}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            {t('cancel')}
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!valid || save.isPending}
            data-test-id="call-save"
          >
            {t('call_save')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {/* 1-qadam: 4 natija tugmasi */}
        <div className="grid grid-cols-2 gap-2">
          {OUTCOMES.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => pickOutcome(o.value)}
              className={[
                'rounded-[var(--ms-radius-default)] border-2 px-3 py-2.5 font-medium text-sm transition-all',
                o.tone,
                outcome === o.value
                  ? 'ring-2 ring-[var(--ms-primary-500)] ring-offset-1'
                  : 'opacity-80 hover:opacity-100',
              ].join(' ')}
              data-test-id={`call-outcome-${o.value}`}
            >
              {t(outcomeLabelKey(o.value) as 'outcome_paid_full')}
            </button>
          ))}
        </div>

        {/* 2-qadam: to'lov bo'lgan bo'lsa — QANDAY TO'LADI (naqd / Click) */}
        {isPayment && (
          <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] p-3">
            <div className="mb-2 font-semibold text-sm">
              {t('call_payment_kind')}
              <span className="ml-1 text-[var(--ms-destructive-500)]">*</span>
              <span className="ml-2 font-normal text-[var(--ms-text-muted)] text-xs">
                {t('call_payment_kind_hint')}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(['cash', 'click'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setKind(k);
                    // Click — faqat so'mda bo'ladi (bank o'tkazmasi).
                    if (k === 'click') setCurrency('UZS');
                    setError(null);
                  }}
                  className={[
                    'rounded-[var(--ms-radius-default)] border-2 px-3 py-2 font-medium text-sm transition-all',
                    kind === k
                      ? 'border-[var(--ms-primary-500)] bg-[var(--ms-primary-50)] ring-2 ring-[var(--ms-primary-500)] ring-offset-1'
                      : 'border-[var(--ms-border-strong)] bg-[var(--ms-bg-muted)] opacity-80 hover:opacity-100',
                  ].join(' ')}
                  data-test-id={`call-kind-${k}`}
                >
                  {k === 'cash' ? t('pay_cash') : t('pay_click')}
                </button>
              ))}
            </div>

            {/* ── NAQD formasi: valyuta + summa + kurs ── */}
            {kind === 'cash' && (
              <div className="mt-3 flex flex-col gap-3">
                <div>
                  <div className="mb-1 text-[var(--ms-text-muted)] text-xs">
                    {t('currency_label')}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(['UZS', 'USD'] as const).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setCurrency(c);
                          setError(null);
                        }}
                        className={[
                          'rounded-[var(--ms-radius-default)] border px-3 py-1.5 text-sm transition-all',
                          currency === c
                            ? 'border-[var(--ms-primary-500)] bg-[var(--ms-primary-50)] font-semibold'
                            : 'border-[var(--ms-border-default)] hover:bg-[var(--ms-bg-muted)]',
                        ].join(' ')}
                        data-test-id={`call-currency-${c}`}
                      >
                        {c === 'UZS' ? t('currency_uzs') : t('currency_usd')}
                      </button>
                    ))}
                  </div>
                </div>

                {currency === 'UZS' ? (
                  <div>
                    <div className="mb-1 text-[var(--ms-text-muted)] text-xs">
                      {t('amount_uzs_label')}
                      <span className="ml-1 text-[var(--ms-destructive-500)]">*</span>
                    </div>
                    <MoneyInput
                      valueMinor={somMinor}
                      onChangeMinor={setSomMinor}
                      data-test-id="call-amount"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="mb-1 text-[var(--ms-text-muted)] text-xs">
                        {t('amount_usd_label')}
                        <span className="ml-1 text-[var(--ms-destructive-500)]">*</span>
                      </div>
                      <Input
                        inputMode="decimal"
                        value={usdText}
                        onChange={(e) => setUsdText(e.target.value)}
                        placeholder="1 250,00"
                        data-test-id="call-amount-usd"
                      />
                    </div>
                    <div>
                      <div className="mb-1 text-[var(--ms-text-muted)] text-xs">
                        {t('rate_label')}
                        <span className="ml-1 text-[var(--ms-destructive-500)]">*</span>
                      </div>
                      <Input
                        inputMode="decimal"
                        value={rateText}
                        onChange={(e) => setRateText(e.target.value)}
                        placeholder="12 800"
                        data-test-id="call-rate"
                      />
                    </div>
                  </div>
                )}

                {/* So'm to'lovda kurs IXTIYORIY — ma'lumot uchun yozib qo'yiladi. */}
                {currency === 'UZS' && (
                  <div>
                    <div className="mb-1 text-[var(--ms-text-muted)] text-xs">
                      {t('rate_label')}
                    </div>
                    <Input
                      inputMode="decimal"
                      value={rateText}
                      onChange={(e) => setRateText(e.target.value)}
                      placeholder="12 800"
                      data-test-id="call-rate-uzs"
                    />
                    <div className="mt-1 text-[var(--ms-text-muted)] text-xs">{t('rate_hint')}</div>
                  </div>
                )}

                {/* Dollar to'lovning so'mdagi ekvivalenti — operator ko'rib tursin. */}
                {somEquivalent && (
                  <div className="rounded-[var(--ms-radius-default)] bg-[var(--ms-bg-muted)] px-3 py-2 text-sm">
                    {t('som_equivalent')}:{' '}
                    <b className="tabular-nums">{formatMoney(somEquivalent)}</b>
                  </div>
                )}
              </div>
            )}

            {/* ── CLICK formasi: summa + chek rasmi ── */}
            {kind === 'click' && (
              <div className="mt-3 flex flex-col gap-3">
                <div>
                  <div className="mb-1 text-[var(--ms-text-muted)] text-xs">
                    {t('amount_uzs_label')}
                    <span className="ml-1 text-[var(--ms-destructive-500)]">*</span>
                  </div>
                  <MoneyInput
                    valueMinor={somMinor}
                    onChangeMinor={setSomMinor}
                    data-test-id="call-amount-click"
                  />
                </div>

                <div>
                  <div className="mb-1 text-[var(--ms-text-muted)] text-xs">
                    {t('screenshot_label')}
                    <span className="ml-1 text-[var(--ms-destructive-500)]">*</span>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onPickFile(e.target.files?.[0])}
                    data-test-id="call-shot-input"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                    data-test-id="call-shot-pick"
                  >
                    {shot ? t('screenshot_change') : t('screenshot_pick')}
                  </Button>

                  {shot ? (
                    <div className="mt-2">
                      {/* next/image emas: bu data-URI (brauzerda tanlangan fayl),
                          optimizatsiya qilinmaydi va serverga bormaydi. */}
                      <img
                        src={shot.dataUri}
                        alt={shot.name}
                        className="max-h-40 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]"
                      />
                      <div className="mt-1 text-[var(--ms-text-muted)] text-xs">{shot.name}</div>
                    </div>
                  ) : (
                    <div className="mt-1 text-[var(--ms-text-muted)] text-xs">
                      {t('screenshot_required')}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* «To'ladi» — qarz butunlay yopilishi haqida ogohlantirish */}
        {outcome === 'paid_full' && (
          <div className="rounded-[var(--ms-radius-default)] bg-[var(--ms-success-50)] px-3 py-2 text-[var(--ms-success-700)] text-xs">
            <div className="font-semibold">{t('call_paid_full_confirm')}</div>
            {remainingMinor && (
              <div className="mt-1 tabular-nums">
                {t('call_paid_full_amount')}: <b>{formatMoney(remainingMinor)}</b>
              </div>
            )}
            <div className="mt-1">{t('call_paid_full_hint')}</div>
          </div>
        )}

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('call_comment_placeholder')}
          rows={2}
        />

        {/* paid_full'da keyingi sana kerak emas — qarz yopiladi */}
        {outcome !== 'paid_full' && (
          <div>
            <div className="mb-1 text-[var(--ms-text-muted)] text-xs">
              {t('field_next_contact')}
              {needsDate && <span className="ml-1 text-[var(--ms-destructive-500)]">*</span>}
            </div>
            <Input
              type="datetime-local"
              value={nextAt}
              onChange={(e) => setNextAt(e.target.value)}
              data-test-id="call-next-at"
            />
          </div>
        )}

        {error && <div className="text-[var(--ms-destructive-600)] text-sm">{error}</div>}
      </div>
    </Modal>
  );
}
