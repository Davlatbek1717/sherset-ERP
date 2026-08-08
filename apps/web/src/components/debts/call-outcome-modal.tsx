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

import { type ReceiptShot, ReceiptShotPicker } from '@/components/debts/receipt-shot-picker';
import {
  type CallOutcome,
  type CallPaymentKind,
  type PaymentCurrency,
  RATE_SCALE,
  debtApi,
  todayAt9InputValue,
} from '@/lib/debt-api';
import {
  Button,
  Checkbox,
  Input,
  Modal,
  MoneyInput,
  Textarea,
  formatMoney,
  useToast,
} from '@moysklad/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const OUTCOMES: Array<{ value: CallOutcome; tone: string }> = [
  { value: 'paid_full', tone: 'bg-[var(--ms-success-100)] border-[var(--ms-success-300)]' },
  { value: 'paid_partial', tone: 'bg-[var(--ms-warning-100)] border-[var(--ms-warning-300)]' },
  { value: 'not_paid', tone: 'bg-[var(--ms-destructive-100)] border-[var(--ms-destructive-300)]' },
  { value: 'callback', tone: 'bg-[var(--ms-bg-muted)] border-[var(--ms-border-strong)]' },
];

export function outcomeLabelKey(o: CallOutcome): string {
  return `outcome_${o}`;
}

/** "12 800,5" / "12800.50" → kurs KANONIK ×10^8 (BigInt string). Bo'sh bo'lsa null. */
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

/**
 * QO'NG'IROQ NATIJASI FORMASI — modalsiz, joyida ishlatiladigan qism.
 *
 * 2026-07-14: mijoz sahifasida bu forma TO'G'RIDAN-TO'G'RI turadi (ilgari
 * «Qo'ng'iroq qilindi» tugmasini bosib modal ochish kerak edi — ortiqcha
 * qadam). Ro'yxat sahifalarida esa u modal ichida ko'rsatiladi
 * (CallOutcomeModal) — mantiq bitta joyda, dublikat yo'q.
 */
export function CallOutcomeForm({
  debtId,
  debtorName,
  remainingMinor,
  onSaved,
  onCancel,
}: {
  debtId: string;
  debtorName: string;
  /** Qolgan qarz (tiyin) — «To'ladi» tasdig'ida aynan shu summa yopiladi. */
  remainingMinor?: string;
  /** Saqlangach chaqiriladi (modal yopiladi / sahifa yangilanadi). */
  onSaved?: () => void;
  /** Berilsa «Bekor qilish» tugmasi chiqadi (modal ichida). Sahifada kerak emas. */
  onCancel?: () => void;
}) {
  const t = useTranslations('pages.debts');
  const qc = useQueryClient();
  const { toast } = useToast();

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
  /** Chek rasmi — data-URI (fayl / kamera / paste — ReceiptShotPicker). */
  const [shot, setShot] = useState<ReceiptShot | null>(null);

  // MUAMMOLI MIJOZ (2026-07-14). Natijadan MUSTAQIL: mijoz «qisman to'ladi»
  // bo'lib ham muammoli bo'lishi mumkin (har safar va'da berib, kam to'laydi).
  const [problem, setProblem] = useState(false);
  const [problemReason, setProblemReason] = useState('');

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
    setProblem(false);
    setProblemReason('');
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

  const save = useMutation({
    mutationFn: () => {
      // Click — doim so'mda; naqd — tanlangan valyutada.
      const useUsd = isPayment && kind === 'cash' && currency === 'USD';
      const originalMinor = useUsd ? usdCents : somMinor;

      return debtApi.markCall(debtId, {
        outcome: outcome as CallOutcome,
        text: text.trim() || undefined,
        // «To'ladi» da sana kerak emas (qarz yopiladi) — LEKIN muammoli deb
        // belgilansa sana MAJBURIY, aks holda server 400 qaytaradi.
        nextContactAt:
          outcome === 'paid_full' && !problem
            ? null
            : nextAt
              ? new Date(nextAt).toISOString()
              : null,
        // Muammoli belgisi FAQAT belgilangan bo'lsa yuboriladi — aks holda
        // mavjud belgi tasodifan o'chib ketardi (server `undefined` ni tegmaydi).
        ...(problem ? { problem: true, problemReason: problemReason.trim() } : {}),
        ...(isPayment && kind
          ? {
              paymentKind: kind,
              currency: useUsd ? ('USD' as const) : ('UZS' as const),
              amountOriginalMinor: originalMinor ?? undefined,
              // Kurs so'm to'lovda ham yuboriladi (ixtiyoriy ma'lumot).
              exchangeRate: rateMinor ?? undefined,
              // Click'da chek majburiy; hisob raqamda ixtiyoriy — bor bo'lsa ketadi.
              ...((kind === 'click' || kind === 'account') && shot
                ? { screenshotBase64: shot.dataUri, filename: shot.name, mime: shot.mime }
                : {}),
            }
          : {}),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['debts'] });
      // TASDIQ (2026-07-13 UX): ilgari modal jimgina yopilardi — operator
      // saqlandimi yoki yo'qmi bilmasdi va ikkinchi marta bosardi.
      toast.success(t('call_saved'), {
        description: `${debtorName} — ${t(outcomeLabelKey(outcome as CallOutcome) as 'outcome_paid_full')}`,
      });
      reset();
      onSaved?.();
    },
    onError: (e: Error) => {
      setError(e.message);
      toast.error(t('call_save_failed'), { description: e.message });
    },
  });

  // Majburiylik qoidalari:
  //   callback     → keyingi sana
  //   paid_partial → to'lov turi + summa + keyingi sana (qoldiq bor)
  //   paid_full    → to'lov turi + summa (sana kerak emas — qarz yopiladi)
  //   click        → chek rasmi
  //   dollar       → kurs
  const needsDate = outcome === 'callback' || outcome === 'paid_partial' || problem;
  const amountOk =
    !isPayment ||
    (kind === 'cash' && currency === 'USD'
      ? usdCents !== null && rateMinor !== null
      : somMinor !== '' && somMinor !== '0');
  const shotOk = !isPayment || kind !== 'click' || shot !== null;

  // Muammoli deb belgilansa — SABAB va QAYTA QO'NG'IROQ SANASI majburiy.
  // Sababsiz belgi keyingi operatorga hech narsa aytmaydi; sanasiz esa mijoz
  // ro'yxatda «osilib» qoladi va hech kim qaytib ko'rmaydi.
  const problemOk = !problem || (problemReason.trim().length > 0 && nextAt !== '');

  const valid =
    outcome !== null &&
    (!needsDate || nextAt !== '') &&
    (!isPayment || kind !== null) &&
    amountOk &&
    shotOk &&
    problemOk;

  return (
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

          <div className="grid grid-cols-3 gap-2">
            {(['cash', 'click', 'account'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setKind(k);
                  // Click va hisob raqam — faqat so'mda bo'ladi (bank o'tkazmasi).
                  if (k !== 'cash') setCurrency('UZS');
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
                {k === 'cash' ? t('pay_cash') : k === 'click' ? t('pay_click') : t('pay_account')}
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
                  <div className="mb-1 text-[var(--ms-text-muted)] text-xs">{t('rate_label')}</div>
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

          {/* ── CLICK / HISOB RAQAM formasi: summa + chek rasmi ──
              Click'da chek MAJBURIY (karta o'tkazmasida hamisha chek bor),
              hisob raqamda (2026-07-17) IXTIYORIY — bank o'tkazmasida chek
              hamisha bo'lavermaydi. Rasm uch yo'l bilan: fayl / kamera / paste. */}
          {(kind === 'click' || kind === 'account') && (
            <div className="mt-3 flex flex-col gap-3">
              <div>
                <div className="mb-1 text-[var(--ms-text-muted)] text-xs">
                  {t('amount_uzs_label')}
                  <span className="ml-1 text-[var(--ms-destructive-500)]">*</span>
                </div>
                <MoneyInput
                  valueMinor={somMinor}
                  onChangeMinor={setSomMinor}
                  data-test-id={kind === 'click' ? 'call-amount-click' : 'call-amount-account'}
                />
              </div>

              <ReceiptShotPicker
                shot={shot}
                onShot={setShot}
                onError={setError}
                required={kind === 'click'}
                testPrefix={kind === 'click' ? 'call' : 'call-account'}
              />
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

      {/* ── MUAMMOLI MIJOZ (2026-07-14) ────────────────────────────────────
            Natijadan MUSTAQIL bayroq: mijoz qisman to'lasa ham muammoli
            bo'lishi mumkin. Belgilansa — «Muammoli qarzdorlar» bo'limiga
            tushadi va sabab bilan qayta qo'ng'iroq sanasi majburiy bo'ladi. */}
      <div
        className={[
          'rounded-[var(--ms-radius-default)] border p-3 transition-colors',
          problem
            ? 'border-[var(--ms-row-unpaid-accent)] bg-[var(--ms-row-unpaid-bg)]'
            : 'border-[var(--ms-border-default)]',
        ].join(' ')}
      >
        <label className="flex cursor-pointer items-start gap-2">
          <Checkbox
            checked={problem}
            onCheckedChange={(v) => setProblem(Boolean(v))}
            className="mt-0.5"
            data-test-id="call-problem"
          />
          <span>
            <span className="font-semibold text-sm">{t('problem_mark')}</span>
            <span className="block text-[var(--ms-text-muted)] text-xs">{t('problem_hint')}</span>
          </span>
        </label>

        {problem && (
          <div className="mt-2">
            <div className="mb-1 text-[var(--ms-text-muted)] text-xs">
              {t('problem_reason')}
              <span className="ml-1 text-[var(--ms-destructive-500)]">*</span>
            </div>
            <Textarea
              value={problemReason}
              onChange={(e) => setProblemReason(e.target.value)}
              placeholder={t('problem_reason_placeholder')}
              rows={2}
              data-test-id="call-problem-reason"
            />
          </div>
        )}
      </div>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('call_comment_placeholder')}
        rows={2}
      />

      {/* paid_full'da keyingi sana kerak emas — qarz yopiladi.
            LEKIN muammoli deb belgilansa sana MAJBURIY, shuning uchun
            ko'rsatiladi (mijoz muammoli bo'lsa qarz ham yopilmagan bo'ladi). */}
      {(outcome !== 'paid_full' || problem) && (
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

      {/* Saqlash — forma o'zi bilan keladi (modalning footer'i emas), shuning
          uchun sahifada ham, modalda ham bir xil ishlaydi. */}
      <div className="flex justify-end gap-2 border-[var(--ms-border-default)] border-t pt-3">
        {onCancel && (
          <Button
            variant="secondary"
            onClick={() => {
              reset();
              onCancel();
            }}
          >
            {t('cancel')}
          </Button>
        )}
        <Button
          onClick={() => save.mutate()}
          disabled={!valid || save.isPending}
          loading={save.isPending}
          data-test-id="call-save"
        >
          {t('call_save')}
        </Button>
      </div>
    </div>
  );
}

/**
 * Ro'yxat sahifalari uchun MODAL o'ram (Bugungi qo'ng'iroqlar, Muammoli
 * qarzdorlar). Mijoz sahifasida forma modalsiz, joyida turadi.
 */
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
  remainingMinor?: string;
}) {
  const t = useTranslations('pages.debts');
  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`${t('call_modal_title')} — ${debtorName}`}
      widthClass="w-[min(560px,94vw)]"
    >
      <CallOutcomeForm
        debtId={debtId}
        debtorName={debtorName}
        remainingMinor={remainingMinor}
        onSaved={onClose}
        onCancel={onClose}
      />
    </Modal>
  );
}
