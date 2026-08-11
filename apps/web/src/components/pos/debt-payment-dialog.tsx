'use client';

import { api } from '@/lib/api-client';
import { formatAmountInput, parseAmountToMinor } from '@/lib/pos/parse-amount';
import { formatForeignMajor } from '@/lib/pos/receipt-payments';
import { RATE_SCALE, convertByRateE8 } from '@moysklad/money';
import type { CurrencyCode } from '@moysklad/money/currencies';
import { Input, formatMoney } from '@moysklad/ui';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CreditCard, DollarSign, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

interface CounterpartyRow {
  id: string;
  name: string;
  phone: string | null;
}

interface DebtRow {
  id: string;
  name: string;
  totalMinor: string;
  paidMinor: string;
  outstandingMinor: string;
  currency: string;
  orderAt: string;
}

interface DebtSummary {
  counterparty: CounterpartyRow;
  outstandingMinor: string;
  openCount: number;
  oldestAt: string | null;
  debts: DebtRow[];
}

interface PayResult {
  batchId: string;
  receipt: {
    batchId: string;
    paidMinor: string;
    currency: string;
    /** F6 — mijoz bergan ASL summa (USD → sent); so'm to'lovda `null`. */
    originalMinor: string | null;
    /** F6 — chekka MUZLATILGAN kurs, kanonik ×10^8; so'm to'lovda `null`. */
    exchangeRate: string | null;
    method: string;
    lines: Array<{ debtName: string; amountMinor: string; closed: boolean }>;
    outstandingAfterMinor: string;
  };
  closedCount: number;
}

/** `GET /exchange-rates/rate?currency=USD` javobi (kerakli qismi). */
interface UsdRateRow {
  date: string;
  currency: string;
  rate: string;
  /** Kanonik ×10^8 — payload'ga AYNAN shu ketadi (FE qayta hisoblamaydi). */
  rateMinor: string;
}

/** To'lov valyutasi — serverdagi `PosDebtPaymentSchema.currency` bilan bir xil. */
type PayCurrency = 'UZS' | 'USD';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Joriy smena — naqd to'lov shu smenaning «kutilgan naqd»iga kiradi (TZ §8.4). */
  sessionId: string;
  cashDeskId?: string | null;
  /** Kassa valyutasi — major→minor scale (FE-08). */
  currency?: CurrencyCode;
  /**
   * F9 — mijoz kartasidan «Qarzni to'lash» bosilganda oldindan tanlangan
   * mijoz. Berilsa qidiruv qadami O'TKAZIB YUBORILADI: kassir mijozni
   * kartada allaqachon topgan, uni ikkinchi marta qidirish xato kiritish
   * yo'lini ochardi (bir xil ismli ikkinchi mijozga to'lov).
   */
  initialAgent?: CounterpartyRow | null;
  onPaid?: (result: PayResult) => void;
}

const NUMPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'];

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Eng eski qarzdan bugungacha necha kun — kassir «qancha eski» ekanini ko'rsin. */
function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return ms > 0 ? Math.floor(ms / 86_400_000) : 0;
}

/**
 * POS «Qarz to'lovi» oynasi (kassa TZ §7.2).
 *
 * Kassir mijozni topadi → qoldiqni KO'RADI (jami, eng eski qarz sanasi,
 * qarzlar ro'yxati) → summa kiritadi → tasdiqlaydi. Qaysi `QRZ-` hujjatga
 * tushishini tanlamaydi: server eng eskisidan FIFO bo'yicha taqsimlaydi.
 *
 * NEGA qoldiq ko'rsatiladi: faqat summa maydonini berish kassirni ko'r-ko'rona
 * kiritishga majbur qilardi — mijoz «hammasini yopaman» desa qancha ekanini
 * bilmasdi. «Hammasi» tugmasi ham shuning uchun bor.
 *
 * ⚠️ Ortiqcha to'lovni server RAD etadi (qaytim naqddan beriladi, §6.2), shuning
 * uchun tugma bu yerda ham oldindan bloklanadi — kassir xatoni bosgandan KEYIN
 * emas, OLDIN ko'rsin.
 */
export function DebtPaymentDialog({
  open,
  onOpenChange,
  sessionId,
  cashDeskId,
  currency = 'UZS',
  initialAgent = null,
  onPaid,
}: Props) {
  const qc = useQueryClient();
  const t = useTranslations('pages.pos');
  const tCommon = useTranslations('common');
  const [search, setSearch] = useState('');
  const [agent, setAgent] = useState<CounterpartyRow | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [method, setMethod] = useState<'cash' | 'terminal'>('cash');
  /** F6 — mijoz qaysi valyutada to'layapti. Kassa valyutasidan MUSTAQIL. */
  const [payCurrency, setPayCurrency] = useState<PayCurrency>('UZS');
  const [error, setError] = useState<string | null>(null);

  const { data: cpData, isLoading: cpLoading } = useQuery<{ items: CounterpartyRow[] }>({
    queryKey: ['cp-debt-search', search],
    queryFn: () => api.get(`/counterparties?search=${encodeURIComponent(search)}&limit=20`),
    enabled: open && !agent,
  });

  const { data: summary, isLoading: sumLoading } = useQuery<DebtSummary>({
    queryKey: ['debt-pos-summary', agent?.id],
    queryFn: () => api.get(`/debts/pos/summary/${agent?.id}`),
    enabled: open && !!agent,
  });

  /**
   * F6 — kunlik dollar kursi SERVERDAN. 🔴 Kassir uni QO'LDA kiritmaydi
   * (`rasmilashtirish-modal.tsx` bilan bir xil naqsh va bir xil so'rov).
   *
   * `retry: false` — kurs YO'Q kun normal holat (CBU dam olish kunlarida
   * e'lon qilmaydi; carry-forward server tomonda).
   */
  const { data: usdRate, isLoading: usdRateLoading } = useQuery<UsdRateRow>({
    queryKey: ['pos-usd-rate'],
    queryFn: () => api.get<UsdRateRow>('/exchange-rates/rate?currency=USD'),
    enabled: open,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const usdRateE8 = usdRate?.rateMinor ? BigInt(usdRate.rateMinor) : null;
  /** Kurs yo'q ⇒ dollar tanlovi yopiq. Jim 1:1 ga tushish TAQIQ (TZ §6.2). */
  const usdBlocked = usdRateE8 == null || usdRateE8 <= 0n;
  const isUsd = payCurrency === 'USD';

  const outstanding = BigInt(summary?.outstandingMinor ?? '0');
  // FE-09: yagona pul-parse. Ilgari bu yerda lokal `toMinor` yashardi —
  // float orqali yaxlitlardi va valyuta scale'ini qattiq 100 deb olardi.
  //
  // F6: dollar ALOHIDA valyutada parse qilinadi (sent ≠ tiyin). `amountMinor`
  // serverga AYNAN shu ko'rinishda ketadi — so'mga o'girishni SERVER qiladi.
  const amountMinor = parseAmountToMinor(amountInput, isUsd ? 'USD' : currency);
  /**
   * So'm ekvivalenti — FAQAT ko'rsatish va ortiqcha-to'lov chegarasi uchun.
   * Formula server bilan bitta (`convertByRateE8` ≡ `usdCentsToSomTiyin`);
   * payload'ga bu qiymat YUBORILMAYDI (ikki manba bo'lmasin).
   */
  const somMinor =
    isUsd && usdRateE8 != null ? convertByRateE8(amountMinor, usdRateE8) : isUsd ? 0n : amountMinor;
  const overpay = somMinor > outstanding ? somMinor - outstanding : 0n;
  const canConfirm =
    amountMinor > 0n &&
    somMinor > 0n &&
    overpay === 0n &&
    outstanding > 0n &&
    !(isUsd && usdBlocked);

  /**
   * «Hammasi» tugmasi qiymati.
   *
   * 🔴 Dollarda PASTGA yaxlitlanadi: 1 sent ≈ 124 tiyin, ya'ni so'mdagi
   * qarzni dollar bilan tiyin-ba-tiyin yopib bo'lmaydi. Yuqoriga yaxlitlansa
   * server ortiqcha to'lovni RAD etardi (qaytim faqat naqddan, §6.2) —
   * kassir tushunarsiz 400 olardi. Yopilmay qolgan qoldiq esa OCHIQ
   * ko'rsatiladi (pastdagi izoh), jimgina yo'qolmaydi.
   */
  const payAllMinor =
    isUsd && usdRateE8 != null && usdRateE8 > 0n
      ? (outstanding * RATE_SCALE) / usdRateE8
      : isUsd
        ? 0n
        : outstanding;
  const payAllInput = formatAmountInput(payAllMinor, isUsd ? 'USD' : currency);
  /** «Hammasi» bosilganda yopilmay qoladigan so'm (dollar granulyarligi). */
  const payAllResidual =
    isUsd && usdRateE8 != null && usdRateE8 > 0n
      ? outstanding - convertByRateE8(payAllMinor, usdRateE8)
      : 0n;

  const payMut = useMutation<PayResult>({
    mutationFn: () =>
      api.post<PayResult>('/debts/pos/pay', {
        counterpartyId: agent?.id,
        // 🔴 To'lov VALYUTASINING minor birligida (UZS → tiyin, USD → sent).
        amountMinor: amountMinor.toString(),
        currency: payCurrency,
        // Kurs MUZLATILADI — serverdan olingan satr aynan qaytariladi.
        ...(isUsd && usdRate?.rateMinor ? { exchangeRate: usdRate.rateMinor } : {}),
        method,
        cashDeskId: cashDeskId ?? null,
        retailShiftId: sessionId,
      }),
    onSuccess: (result) => {
      // Smena yig'indilari o'zgardi: naqd to'lov «kutilgan naqd»ga kiradi.
      qc.invalidateQueries({ queryKey: ['cashier-session-current'] });
      qc.invalidateQueries({ queryKey: ['debt-pos-summary'] });
      onPaid?.(result);
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : t('debt_error'));
    },
  });

  const reset = useCallback(() => {
    setSearch('');
    setAgent(null);
    setAmountInput('');
    setMethod('cash');
    setPayCurrency('UZS');
    setError(null);
  }, []);

  /**
   * Valyuta almashtirilganda kiritilgan summa TOZALANADI: «100» so'mda
   * 100 so'm, dollarda $100 — bir xil raqam ikki xil pul. Tozalamasak
   * kassir bir bosishda summani ~12 000× oshirib yuborardi.
   *
   * Dollar TERMINAL orqali kelmaydi (terminal — so'mdagi karta o'tkazmasi),
   * shuning uchun USD tanlanganda usul naqdga qaytadi.
   */
  const selectCurrency = useCallback((next: PayCurrency) => {
    setPayCurrency(next);
    setAmountInput('');
    setError(null);
    if (next === 'USD') setMethod('cash');
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  /**
   * F9 — oldindan tanlangan mijozni OCHILGANDA o'rnatadi. `reset()` faqat
   * yopilishda yuguradi, ya'ni bu effekt uning ustidan yozmaydi; oyna
   * yopilib qayta ochilganda esa yangi `initialAgent` qo'llanadi.
   */
  useEffect(() => {
    if (open && initialAgent) setAgent(initialAgent);
  }, [open, initialAgent]);

  const handleDigit = useCallback((d: string) => {
    setError(null);
    setAmountInput((prev) => {
      const next = prev + d;
      return next.length > 12 ? prev : next;
    });
  }, []);

  const oldestDays = daysSince(summary?.oldestAt ?? null);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        {/* K-1: tavsif matni ataylab yo'q — Radix'ning rasmiy opt-out'i
            (`aria-describedby={undefined}`) console warning'ni o'chiradi. */}
        <Dialog.Content
          aria-describedby={undefined}
          className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-[var(--ms-bg-surface)] shadow-2xl outline-none"
        >
          <div className="flex items-center justify-between border-[var(--ms-border)] border-b px-5 py-3">
            <Dialog.Title className="font-semibold text-[var(--ms-text-primary)] text-lg">
              {t('debt_title')}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={tCommon('close')}
                className="rounded-lg p-1 text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {/* ── 1-qadam: mijoz ──────────────────────────────────────────── */}
            {!agent ? (
              <div className="flex flex-col gap-3">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('debt_search_placeholder')}
                  autoFocus
                />
                {cpLoading && (
                  <p className="text-[var(--ms-text-muted)] text-sm">{t('searching')}</p>
                )}
                <div className="flex flex-col gap-1">
                  {(cpData?.items ?? []).map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => setAgent(row)}
                      data-test-id={`debt-pay-cp-${row.id}`}
                      className="flex flex-col rounded-lg border border-[var(--ms-border)] px-3 py-2 text-left transition-colors hover:bg-[var(--ms-bg-hover)]"
                    >
                      <span className="font-medium text-[var(--ms-text-primary)] text-sm">
                        {row.name}
                      </span>
                      {row.phone && (
                        <span className="text-[var(--ms-text-muted)] text-xs">{row.phone}</span>
                      )}
                    </button>
                  ))}
                  {!cpLoading && (cpData?.items ?? []).length === 0 && (
                    <p className="py-6 text-center text-[var(--ms-text-muted)] text-sm">
                      {t('debt_no_customers')}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* ── 2-qadam: qoldiq konteksti ─────────────────────────────── */}
                <div className="flex items-center justify-between rounded-lg border border-[var(--ms-border)] bg-[var(--ms-bg-input)] px-3 py-2">
                  <div>
                    <div className="font-medium text-[var(--ms-text-primary)] text-sm">
                      {agent.name}
                    </div>
                    {agent.phone && (
                      <div className="text-[var(--ms-text-muted)] text-xs">{agent.phone}</div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAgent(null);
                      setAmountInput('');
                    }}
                    className="text-[var(--ms-brand)] text-xs hover:underline"
                  >
                    {t('change_customer')}
                  </button>
                </div>

                {sumLoading ? (
                  <p className="text-[var(--ms-text-muted)] text-sm">{t('debt_loading')}</p>
                ) : outstanding === 0n ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-4 text-center">
                    <p className="font-semibold text-emerald-800 text-sm">{t('debt_none_title')}</p>
                    <p className="mt-1 text-emerald-700 text-xs">{t('debt_none_hint')}</p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
                      <div className="text-orange-700 text-xs">{t('debt_total')}</div>
                      <div
                        className="font-bold text-2xl text-orange-900 tabular-nums"
                        data-test-id="debt-pay-outstanding"
                      >
                        {formatMoney(outstanding)}
                      </div>
                      <div className="mt-1 text-orange-700 text-xs">
                        {t('debt_meta', {
                          count: summary?.openCount ?? 0,
                          date: fmtDate(summary?.oldestAt ?? null),
                        })}
                        {oldestDays !== null &&
                          oldestDays > 0 &&
                          ` (${t('debt_days', { days: oldestDays })})`}
                      </div>
                    </div>

                    {/* Qarzlar ro'yxati — qaysi biri qachon ochilgani ko'rinsin. */}
                    <div className="flex flex-col gap-1">
                      {(summary?.debts ?? []).map((d) => (
                        <div
                          key={d.id}
                          className="flex items-center justify-between rounded-lg border border-[var(--ms-border)] px-3 py-1.5 text-xs"
                        >
                          <span className="text-[var(--ms-text-muted)]">
                            {d.name} · {fmtDate(d.orderAt)}
                          </span>
                          <span className="font-medium tabular-nums">
                            {formatMoney(BigInt(d.outstandingMinor))}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* ── 3-qadam: to'lov VALYUTASI (F6) ──────────────────────── */}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        data-test-id="debt-pay-currency-uzs"
                        onClick={() => selectCurrency('UZS')}
                        className={`flex flex-1 items-center justify-center gap-2 rounded-lg border py-2 font-medium text-sm transition-colors ${
                          !isUsd
                            ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                            : 'border-[var(--ms-border)] text-[var(--ms-text-muted)]'
                        }`}
                      >
                        <Banknote size={16} /> {t('debt_currency_uzs')}
                      </button>
                      <button
                        type="button"
                        data-test-id="debt-pay-currency-usd"
                        disabled={usdBlocked}
                        onClick={() => selectCurrency('USD')}
                        className={`flex flex-1 items-center justify-center gap-2 rounded-lg border py-2 font-medium text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                          isUsd
                            ? 'border-teal-400 bg-teal-50 text-teal-700'
                            : 'border-[var(--ms-border)] text-[var(--ms-text-muted)]'
                        }`}
                      >
                        <DollarSign size={16} /> {t('debt_currency_usd')}
                      </button>
                    </div>

                    {/* Kurs holati — sana bilan (carry-forward tufayli bugungi
                        bo'lmasligi mumkin) yoki bloklash sababi. */}
                    {usdBlocked ? (
                      usdRateLoading ? null : (
                        <p
                          data-test-id="debt-usd-rate-missing"
                          className="-mt-2 font-medium text-[11px] text-orange-500"
                        >
                          {t('usd_rate_missing')}
                        </p>
                      )
                    ) : (
                      <p
                        data-test-id="debt-usd-rate"
                        className="-mt-2 text-[11px] text-[var(--ms-text-muted)] tabular-nums"
                      >
                        {t('usd_rate_hint', {
                          rate: usdRate?.rate ?? '',
                          date: usdRate?.date ?? '',
                        })}
                      </p>
                    )}

                    {/* ── 4-qadam: to'lov turi ────────────────────────────────── */}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        data-test-id="debt-pay-method-cash"
                        onClick={() => setMethod('cash')}
                        className={`flex flex-1 items-center justify-center gap-2 rounded-lg border py-2 font-medium text-sm transition-colors ${
                          method === 'cash'
                            ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                            : 'border-[var(--ms-border)] text-[var(--ms-text-muted)]'
                        }`}
                      >
                        <Banknote size={16} /> {t('cash')}
                      </button>
                      <button
                        type="button"
                        data-test-id="debt-pay-method-terminal"
                        // Dollar terminal orqali kelmaydi — terminal so'mdagi
                        // karta o'tkazmasi (`debt-cash-ledger.ts` qoidasi).
                        disabled={isUsd}
                        onClick={() => setMethod('terminal')}
                        className={`flex flex-1 items-center justify-center gap-2 rounded-lg border py-2 font-medium text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                          method === 'terminal'
                            ? 'border-purple-400 bg-purple-50 text-purple-700'
                            : 'border-[var(--ms-border)] text-[var(--ms-text-muted)]'
                        }`}
                      >
                        <CreditCard size={16} /> {t('terminal')}
                      </button>
                    </div>

                    {/* ── 5-qadam: summa ─────────────────────────────────────── */}
                    <div className="rounded-xl border-2 border-[var(--ms-brand)] bg-[var(--ms-brand)]/5 px-4 py-3">
                      <div className="text-[var(--ms-text-muted)] text-xs">{t('pay_amount')}</div>
                      <div
                        className="font-bold text-2xl text-[var(--ms-text-primary)] tabular-nums"
                        data-test-id="debt-pay-amount"
                      >
                        {amountInput
                          ? isUsd
                            ? formatForeignMajor(amountMinor, 'USD')
                            : formatMoney(amountMinor)
                          : '0'}
                      </div>
                      {/* So'm ekvivalenti — SERVER formulasi bilan, JONLI.
                          Qarz daftari so'mda yuriladi, kassir qancha yopilishini
                          bosishdan OLDIN ko'rsin. */}
                      {isUsd && amountMinor > 0n && (
                        <div
                          data-test-id="debt-usd-equivalent"
                          className="text-[var(--ms-text-muted)] text-xs tabular-nums"
                        >
                          ≈ {formatMoney(somMinor)}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        data-test-id="debt-pay-all"
                        onClick={() => setAmountInput(payAllInput)}
                        className="flex-1 rounded-lg border border-[var(--ms-border)] py-2 font-medium text-xs hover:bg-[var(--ms-bg-hover)]"
                      >
                        {t('debt_pay_all', {
                          sum: isUsd
                            ? formatForeignMajor(payAllMinor, 'USD')
                            : formatMoney(outstanding),
                        })}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAmountInput('')}
                        className="rounded-lg border border-[var(--ms-border)] px-3 py-2 text-xs hover:bg-[var(--ms-bg-hover)]"
                      >
                        {t('clear')}
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {NUMPAD_KEYS.map((k) => (
                        <button
                          type="button"
                          key={k}
                          onClick={() =>
                            k === '⌫' ? setAmountInput((p) => p.slice(0, -1)) : handleDigit(k)
                          }
                          className="h-11 rounded-lg border border-[var(--ms-border)] bg-[var(--ms-bg-input)] font-semibold text-[var(--ms-text-primary)] text-lg transition-all hover:bg-[var(--ms-bg-hover)] active:scale-95"
                        >
                          {k}
                        </button>
                      ))}
                    </div>

                    {isUsd && payAllResidual > 0n && (
                      <p
                        data-test-id="debt-usd-residual"
                        className="text-[11px] text-[var(--ms-text-muted)]"
                      >
                        {t('debt_usd_residual', { sum: formatMoney(payAllResidual) })}
                      </p>
                    )}
                    {overpay > 0n && (
                      <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700 text-xs">
                        {t('debt_overpay', { sum: formatMoney(overpay) })}
                      </p>
                    )}
                    {error && (
                      <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700 text-xs">{error}</p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {agent && outstanding > 0n && (
            <div className="border-[var(--ms-border)] border-t px-5 py-3">
              <button
                type="button"
                onClick={() => payMut.mutate()}
                disabled={!canConfirm || payMut.isPending}
                data-test-id="debt-pay-confirm"
                className="h-12 w-full rounded-xl bg-[var(--ms-brand)] font-semibold text-base text-white transition-all hover:bg-[var(--ms-brand-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {payMut.isPending ? '...' : t('debt_submit')}
              </button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
