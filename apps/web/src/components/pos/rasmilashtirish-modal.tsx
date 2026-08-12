'use client';

import { api } from '@/lib/api-client';
import { formatAmountInput, parseAmountToMinor } from '@/lib/pos/parse-amount';
import { formatForeignMajor } from '@/lib/pos/receipt-payments';
import { RATE_SCALE, convertByRateE8 } from '@moysklad/money';
import type { CurrencyCode } from '@moysklad/money/currencies';
import { Input, formatMoney, noAccidentalClose } from '@moysklad/ui';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Banknote, CreditCard, DollarSign, Monitor, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

interface CounterpartyRow {
  id: string;
  name: string;
  phone: string | null;
  tags: string[];
  companyType: string;
}

/** Mijoz turi rozetkasi. Yorliq chaqiruvchidan keladi — modul darajasida
 *  `useTranslations` chaqirib bo'lmaydi (hook), shuning uchun `t` uzatiladi. */
function cpTypeBadge(row: CounterpartyRow, t: (key: string) => string) {
  if (row.tags.includes('usta')) return { label: t('type_usta'), cls: 'bg-blue-100 text-blue-700' };
  if (row.tags.includes('dokon'))
    return { label: t('type_dokon'), cls: 'bg-orange-100 text-orange-700' };
  return null; // oddiy — badge yo'q
}

interface ConfirmParams {
  cashAmountMinor: bigint;
  cardAmountMinor: bigint;
  terminalAmountMinor: bigint;
  debtAmountMinor: bigint;
  /** MK31 — mijoz bergan dollar naqd, SENTDA. */
  cashUsdAmountMinor: bigint;
  /**
   * Chekka MUZLATILADIGAN kurs — kanonik ×10^8, SERVERDAN olingan satr
   * (`GET /exchange-rates/rate`). Dollar berilmagan bo'lsa `null`.
   * 🔴 Bu qiymat ekranda qo'lda kiritilmaydi va qayta hisoblanmaydi.
   */
  usdRateMinor: string | null;
  agentId?: string;
}

/** `GET /exchange-rates/rate?currency=USD` javobi (kerakli qismi). */
interface UsdRateRow {
  date: string;
  currency: string;
  rate: string;
  /** Kanonik ×10^8 — payload'ga aynan shu ketadi. */
  rateMinor: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sumMinor: bigint;
  /** Kassa valyutasi — major→minor scale (FE-08). */
  currency?: CurrencyCode;
  onConfirm: (params: ConfirmParams) => void;
  loading?: boolean;
}

const NUMPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'];

type ActiveField = 'cash' | 'cashUsd' | 'card' | 'terminal';

const FIELD_COLORS: Record<ActiveField, { border: string; bg: string; icon: string; dot: string }> =
  {
    cash: {
      border: 'border-emerald-400',
      bg: 'bg-emerald-50',
      icon: 'bg-emerald-500',
      dot: 'bg-emerald-500',
    },
    // Dollar — naqdning ukasi, lekin ATAYLAB boshqa rang: kassir yashiqda
    // qaysi pul turganini bir qarashda ajratishi kerak (§8.4 — USD farqi
    // so'mga o'girilmaydi, alohida sanaladi).
    cashUsd: {
      border: 'border-teal-400',
      bg: 'bg-teal-50',
      icon: 'bg-teal-500',
      dot: 'bg-teal-500',
    },
    card: { border: 'border-blue-400', bg: 'bg-blue-50', icon: 'bg-blue-500', dot: 'bg-blue-500' },
    terminal: {
      border: 'border-purple-400',
      bg: 'bg-purple-50',
      icon: 'bg-purple-500',
      dot: 'bg-purple-500',
    },
  };

export function RasmiyashtirishModal({
  open,
  onOpenChange,
  sumMinor,
  currency = 'UZS',
  onConfirm,
  loading = false,
}: Props) {
  const t = useTranslations('pages.pos');
  const tCommon = useTranslations('common');
  // ── Counterparty ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [agent, setAgent] = useState<CounterpartyRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newType, setNewType] = useState<'oddiy' | 'usta' | 'dokon'>('oddiy');

  const { data: cpData, isLoading: cpLoading } = useQuery<{ items: CounterpartyRow[] }>({
    queryKey: ['cp-pos-search', search],
    queryFn: () => api.get(`/counterparties?search=${encodeURIComponent(search)}&limit=20`),
    enabled: open && !agent,
  });

  const createMut = useMutation({
    mutationFn: (body: {
      name: string;
      phone: string | null;
      companyType: string;
      tags: string[];
    }) => api.post<CounterpartyRow>('/counterparties', body),
    onSuccess: (row) => {
      setAgent(row);
      setCreating(false);
      setNewName('');
      setNewPhone('');
      setNewType('oddiy');
    },
  });

  // ── Payment inputs (major units string → minor bigint) ────────────────────
  const [cashInput, setCashInput] = useState('');
  const [cashUsdInput, setCashUsdInput] = useState('');
  const [cardInput, setCardInput] = useState('');
  const [terminalInput, setTerminalInput] = useState('');
  const [activeField, setActiveField] = useState<ActiveField>('cash');

  /**
   * MK31 — kunlik dollar kursi SERVERDAN. 🔴 Kassir uni QO'LDA kiritmaydi
   * (`call-outcome-modal.tsx` dagi qo'lda-kiritish naqshi bu yerga
   * KO'CHIRILMADI): kursni odam yozsa, chek qanday kurs bo'yicha yopilgani
   * kassirning kayfiyatiga bog'liq bo'lardi.
   *
   * `retry: false` — kurs YO'Q kun normal holat (CBU dam olish kunlarida
   * e'lon qilmaydi, carry-forward server tomonda). Qayta urinish faqat
   * bloklangan holatni kechiktirardi.
   */
  // `isError` ATAYLAB olinmaydi: «kurs yo'q» va «so'rov yiqildi» kassir uchun
  // bir xil natija beradi — dollar maydoni yopiladi. Ikkinchi bayroq faqat
  // ishlatilmay qolardi (lint:product `noUnusedVariables` bilan tutdi).
  const { data: usdRate, isLoading: usdRateLoading } = useQuery<UsdRateRow>({
    queryKey: ['pos-usd-rate'],
    queryFn: () => api.get<UsdRateRow>('/exchange-rates/rate?currency=USD'),
    enabled: open,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const usdRateE8 = usdRate?.rateMinor ? BigInt(usdRate.rateMinor) : null;
  /** Kurs yo'q ⇒ dollar maydoni yopiq. Jim 1:1 ga tushish TAQIQ (TZ §6.2). */
  const usdBlocked = usdRateE8 == null || usdRateE8 <= 0n;

  // FE-09: yagona pul-parse (lokal float nusxasi o'rniga).
  const cashMinor = parseAmountToMinor(cashInput, currency);
  // Dollar ALOHIDA valyutada parse qilinadi (sent ≠ tiyin) — kassa valyutasi
  // bilan aralashtirilsa summa 100× siljirdi.
  const cashUsdMinor = usdBlocked ? 0n : parseAmountToMinor(cashUsdInput, 'USD');
  // So'm ekvivalenti — SERVER formulasi (`retail-tenders.ts` → `usdBaseMinor`
  // ham shu funksiyani chaqiradi). Ekran o'z formulasini yozmaydi.
  const cashUsdBaseMinor =
    usdRateE8 != null && cashUsdMinor > 0n ? convertByRateE8(cashUsdMinor, usdRateE8) : 0n;
  const cardMinor = parseAmountToMinor(cardInput, currency);
  const terminalMinor = parseAmountToMinor(terminalInput, currency);
  const totalPaid = cashMinor + cashUsdBaseMinor + cardMinor + terminalMinor;
  const debtMinor = totalPaid < sumMinor ? sumMinor - totalPaid : 0n;
  const change = totalPaid > sumMinor ? totalPaid - sumMinor : 0n;

  // Qaytim FAQAT naqddan (kassa TZ §6.2). Karta/terminal ortiqcha o'tkazilsa
  // kassa uni naqd bilan qaytarib bera olmaydi — server buni rad etadi, shu
  // sababli tugmani shu yerda ham bloklaymiz: kassir xatoni bosgandan KEYIN
  // emas, oldin ko'rsin.
  //
  // MK31: dollar ham NAQD, shuning uchun chegaraga uning so'm ekvivalenti
  // kiradi — `retail-tenders.ts:174` dagi `cashLikeMinor` bilan AYNAN bir xil.
  // Aks holda $1 bilan 1 000 so'mlik tovar olgan mijozning cheki ekranda
  // bloklanib, serverda esa o'tib ketardi.
  const changeExceedsCash = change > cashMinor + cashUsdBaseMinor;

  // To'liq to'langan bo'lsa — bo'ldi; qarz qolsa mijoz MAJBURIY.
  //
  // 🔴 Ilgari bu yerda `totalPaid > 0n` turardi va TO'LIQ QARZ (0 to'lov)
  // holatini bloklardi: kassir butun chekni mijozga yozmoqchi bo'lsa, tugma
  // o'lik qolib, majburan 1 so'm NAQD kiritardi — kassa naqdi ham, qarz
  // summasi ham 1 so'mga siljib ketardi. Server bu holatni ALLAQACHON qabul
  // qiladi (`retail-tenders.ts` — `paid + debt === total`, mijoz esa
  // `retail-sale.service.ts` da talab qilinadi), ya'ni to'siq faqat ekranda
  // edi.
  //
  // Sharti «bo'sh chek»ni ochib yubormasligi uchun ikkiga bo'lindi: summasi 0
  // chekda `totalPaid >= sumMinor` (0 >= 0) rost bo'lardi va tugma yonardi.
  const hasSomethingToSettle = totalPaid > 0n || debtMinor > 0n;
  const canConfirm =
    !loading &&
    hasSomethingToSettle &&
    !changeExceedsCash &&
    (totalPaid >= sumMinor || (debtMinor > 0n && agent !== null));

  // ── Reset on close ────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setSearch('');
    setAgent(null);
    setCreating(false);
    setNewName('');
    setNewPhone('');
    setNewType('oddiy');
    setCashInput('');
    setCashUsdInput('');
    setCardInput('');
    setTerminalInput('');
    setActiveField('cash');
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  // ── Numpad handlers ───────────────────────────────────────────────────────
  const SETTERS: Record<ActiveField, (v: string | ((prev: string) => string)) => void> = {
    cash: setCashInput,
    cashUsd: setCashUsdInput,
    card: setCardInput,
    terminal: setTerminalInput,
  };
  const setActive = SETTERS[activeField];
  const INPUTS: Record<ActiveField, string> = {
    cash: cashInput,
    cashUsd: cashUsdInput,
    card: cardInput,
    terminal: terminalInput,
  };

  const handleDigit = useCallback(
    (d: string) => {
      setActive((prev) => {
        const next = prev + d;
        return next.length > 12 ? prev : next;
      });
    },
    [setActive],
  );

  const handleBack = useCallback(() => {
    setActive((prev) => prev.slice(0, -1));
  }, [setActive]);

  const handleExact = () => {
    const others =
      (activeField === 'cash' ? 0n : cashMinor) +
      (activeField === 'cashUsd' ? 0n : cashUsdBaseMinor) +
      (activeField === 'card' ? 0n : cardMinor) +
      (activeField === 'terminal' ? 0n : terminalMinor);
    const left = sumMinor > others ? sumMinor - others : 0n;
    if (activeField === 'cashUsd') {
      if (usdRateE8 == null || usdRateE8 <= 0n) return;
      // So'm qoldig'ini dollarga teskari o'girish — YUQORIGA yaxlitlanadi.
      // Pastga yaxlitlansa summa bir sentga kam bo'lib, server «to'lov
      // yetarli emas» deb 400 berardi (qaytim esa har doim so'mda).
      const cents = (left * RATE_SCALE + usdRateE8 - 1n) / usdRateE8;
      setActive(formatAmountInput(cents, 'USD'));
      return;
    }
    // `Number(left) / 100` EMAS: katta summada yaxlitlardi va 0 kasrli
    // kassada 100× kichraytirardi (FE-08).
    setActive(formatAmountInput(left, currency));
  };

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm({
      cashAmountMinor: cashMinor,
      cardAmountMinor: cardMinor,
      terminalAmountMinor: terminalMinor,
      debtAmountMinor: debtMinor,
      cashUsdAmountMinor: cashUsdMinor,
      // Kurs FAQAT dollar berilganda ketadi — server sxemasi ham shuni
      // kutadi (`cashUsdAmountMinor === 0 || usdRateMinor != null`).
      usdRateMinor: cashUsdMinor > 0n && usdRate ? usdRate.rateMinor : null,
      agentId: agent?.id,
    });
  };

  const colors = FIELD_COLORS[activeField];

  const fieldLabel: Record<ActiveField, string> = {
    cash: t('field_cash'),
    cashUsd: t('field_cash_usd'),
    card: t('field_card'),
    terminal: t('field_terminal'),
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        {/* K-1: tavsif matni ataylab yo'q — Radix'ning rasmiy opt-out'i
            (`aria-describedby={undefined}`) console warning'ni o'chiradi. */}
        <Dialog.Content
          {...noAccidentalClose}
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 w-[min(96vw,42rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-[var(--ms-bg-surface)] shadow-2xl outline-none flex flex-col max-h-[92dvh]"
        >
          {/* Header */}
          <div className="shrink-0 bg-[var(--ms-bg-app)] px-6 py-4 border-b border-[var(--ms-border)] rounded-t-2xl">
            <div className="flex items-start justify-between">
              <div>
                <Dialog.Title className="text-[10px] font-bold uppercase tracking-widest text-[var(--ms-text-muted)]">
                  {t('pay_amount')}
                </Dialog.Title>
                <div className="mt-0.5 text-3xl font-bold tabular-nums text-[var(--ms-text-primary)] leading-none">
                  {formatMoney(sumMinor)}
                </div>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Two-column body */}
          <div className="flex flex-1 min-h-0">
            {/* LEFT — payment summary, confirm pinned at bottom */}
            <div className="flex w-60 shrink-0 flex-col border-r border-[var(--ms-border)]">
              {/* Scrollable area */}
              <div className="flex-1 overflow-y-auto flex flex-col">
                {/* Counterparty — always shown; optional for oddiy, required for usta/dokon */}
                <div className="px-4 pt-4 pb-3 border-b border-[var(--ms-border)]">
                  <div className="mb-2">
                    <span className="text-[10px] text-[var(--ms-text-muted)] italic">
                      {t('customer_optional')}
                    </span>
                  </div>
                  {agent ? (
                    <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-sm text-[var(--ms-text-primary)] truncate">
                            {agent.name}
                          </span>
                          {(() => {
                            const b = cpTypeBadge(agent, t);
                            return b ? (
                              <span
                                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${b.cls}`}
                              >
                                {b.label}
                              </span>
                            ) : null;
                          })()}
                        </div>
                        {agent.phone && (
                          <div className="text-xs text-[var(--ms-text-muted)]">{agent.phone}</div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setAgent(null)}
                        className="shrink-0 text-xs text-[var(--ms-text-muted)] hover:text-red-500"
                      >
                        ✕
                      </button>
                    </div>
                  ) : creating ? (
                    <div className="flex flex-col gap-2">
                      {/* Tur tanlash */}
                      <div className="flex gap-1 rounded-lg bg-[var(--ms-bg-input)] p-0.5">
                        {/* `t` translator bilan to'qnashmasligi uchun parametr `kind` */}
                        {(['oddiy', 'usta', 'dokon'] as const).map((kind) => (
                          <button
                            key={kind}
                            type="button"
                            onClick={() => setNewType(kind)}
                            className={`flex-1 rounded-md py-1 text-[10px] font-semibold transition-all ${
                              newType === kind
                                ? 'bg-white text-[var(--ms-text-primary)] shadow-sm'
                                : 'text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]'
                            }`}
                          >
                            {t(`type_${kind}`)}
                          </button>
                        ))}
                      </div>
                      <Input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder={t('new_customer_name_placeholder')}
                        autoFocus
                      />
                      <Input
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        placeholder="+998 __ ___ __ __"
                        inputMode="tel"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            createMut.mutate({
                              name: newName.trim(),
                              phone: newPhone.trim() || null,
                              companyType: newType === 'dokon' ? 'legalUZ' : 'individualUZ',
                              tags: newType !== 'oddiy' ? [newType] : [],
                            })
                          }
                          disabled={!newName.trim() || createMut.isPending}
                          className="flex-1 rounded-lg bg-[var(--ms-brand)] py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                        >
                          {createMut.isPending ? '...' : t('add')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setCreating(false)}
                          className="rounded-lg border border-[var(--ms-border)] px-3 py-1.5 text-xs text-[var(--ms-text-muted)]"
                        >
                          {tCommon('cancel')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-[var(--ms-border)] overflow-hidden">
                      <div className="p-1.5 border-b border-[var(--ms-border)]">
                        <Input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder={t('search_placeholder')}
                        />
                      </div>
                      <div className="max-h-28 overflow-y-auto">
                        {cpLoading ? (
                          <p className="py-3 text-center text-xs text-[var(--ms-text-muted)]">
                            ...
                          </p>
                        ) : (cpData?.items.length ?? 0) === 0 ? (
                          <p className="py-3 text-center text-xs text-[var(--ms-text-muted)]">
                            {t('not_found')}
                          </p>
                        ) : (
                          cpData?.items.map((c) => {
                            const badge = cpTypeBadge(c, t);
                            return (
                              <button
                                type="button"
                                key={c.id}
                                onClick={() => setAgent(c)}
                                className="flex w-full items-center gap-2 border-b border-[var(--ms-border)] last:border-0 px-3 py-2 text-left hover:bg-[var(--ms-bg-hover)]"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-medium text-xs truncate">{c.name}</span>
                                    {badge && (
                                      <span
                                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${badge.cls}`}
                                      >
                                        {badge.label}
                                      </span>
                                    )}
                                  </div>
                                  {c.phone && (
                                    <span className="text-[10px] text-[var(--ms-text-muted)]">
                                      {c.phone}
                                    </span>
                                  )}
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setCreating(true);
                          setNewType('oddiy');
                        }}
                        className="w-full border-t border-[var(--ms-border)] px-3 py-2 text-left text-xs text-[var(--ms-text-brand)] hover:bg-[var(--ms-bg-hover)]"
                      >
                        {t('new_customer')}
                      </button>
                    </div>
                  )}
                </div>

                {/* Payment method cards */}
                <div className="flex flex-col gap-2 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--ms-text-muted)]">
                    {t('payment_method')}
                  </p>

                  {/* Naqd */}
                  <button
                    type="button"
                    data-test-id="pos-tender-cash"
                    onClick={() => setActiveField('cash')}
                    className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${
                      activeField === 'cash'
                        ? 'border-emerald-400 bg-emerald-50'
                        : 'border-[var(--ms-border)] bg-[var(--ms-bg-app)] hover:border-emerald-200'
                    }`}
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${activeField === 'cash' ? 'bg-emerald-500' : 'bg-[var(--ms-bg-input)]'}`}
                    >
                      <Banknote
                        className={`h-4 w-4 ${activeField === 'cash' ? 'text-white' : 'text-[var(--ms-text-muted)]'}`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]">
                        {t('cash')}
                      </div>
                      <div
                        className={`font-bold tabular-nums leading-tight text-sm ${cashMinor > 0n ? 'text-[var(--ms-text-primary)]' : 'text-[var(--ms-text-muted)]'}`}
                      >
                        {cashMinor > 0n ? formatMoney(cashMinor) : '—'}
                      </div>
                    </div>
                    {activeField === 'cash' && (
                      <div className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                    )}
                  </button>

                  {/* Naqd USD (MK31) — kurs serverdan, kassir kiritmaydi. */}
                  <button
                    type="button"
                    data-test-id="pos-tender-cash-usd"
                    disabled={usdBlocked}
                    onClick={() => setActiveField('cashUsd')}
                    className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                      activeField === 'cashUsd'
                        ? 'border-teal-400 bg-teal-50'
                        : 'border-[var(--ms-border)] bg-[var(--ms-bg-app)] hover:border-teal-200'
                    }`}
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${activeField === 'cashUsd' ? 'bg-teal-500' : 'bg-[var(--ms-bg-input)]'}`}
                    >
                      <DollarSign
                        className={`h-4 w-4 ${activeField === 'cashUsd' ? 'text-white' : 'text-[var(--ms-text-muted)]'}`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]">
                        {t('cash_usd')}
                      </div>
                      <div
                        className={`font-bold tabular-nums leading-tight text-sm ${cashUsdMinor > 0n ? 'text-[var(--ms-text-primary)]' : 'text-[var(--ms-text-muted)]'}`}
                      >
                        {cashUsdMinor > 0n ? formatForeignMajor(cashUsdMinor, 'USD') : '—'}
                      </div>
                      {/* So'm ekvivalenti — server formulasi bilan, JONLI. */}
                      {cashUsdMinor > 0n && (
                        <div
                          data-test-id="pos-usd-equivalent"
                          className="text-[10px] tabular-nums text-[var(--ms-text-muted)]"
                        >
                          ≈ {formatMoney(cashUsdBaseMinor)}
                        </div>
                      )}
                    </div>
                    {activeField === 'cashUsd' && (
                      <div className="h-2 w-2 shrink-0 rounded-full bg-teal-500" />
                    )}
                  </button>

                  {/* Kurs holati — sana bilan (carry-forward tufayli bugungi
                      bo'lmasligi mumkin) yoki bloklash sababi. */}
                  {usdBlocked ? (
                    usdRateLoading ? null : (
                      <p
                        data-test-id="pos-usd-rate-missing"
                        className="-mt-1 text-[10px] font-medium text-orange-500"
                      >
                        {t('usd_rate_missing')}
                      </p>
                    )
                  ) : (
                    <p
                      data-test-id="pos-usd-rate"
                      className="-mt-1 text-[10px] text-[var(--ms-text-muted)] tabular-nums"
                    >
                      {t('usd_rate_hint', { rate: usdRate?.rate ?? '', date: usdRate?.date ?? '' })}
                    </p>
                  )}

                  {/* Karta */}
                  <button
                    type="button"
                    data-test-id="pos-tender-card"
                    onClick={() => setActiveField('card')}
                    className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${
                      activeField === 'card'
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-[var(--ms-border)] bg-[var(--ms-bg-app)] hover:border-blue-200'
                    }`}
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${activeField === 'card' ? 'bg-blue-500' : 'bg-[var(--ms-bg-input)]'}`}
                    >
                      <CreditCard
                        className={`h-4 w-4 ${activeField === 'card' ? 'text-white' : 'text-[var(--ms-text-muted)]'}`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]">
                        {t('card')}
                      </div>
                      <div
                        className={`font-bold tabular-nums leading-tight text-sm ${cardMinor > 0n ? 'text-[var(--ms-text-primary)]' : 'text-[var(--ms-text-muted)]'}`}
                      >
                        {cardMinor > 0n ? formatMoney(cardMinor) : '—'}
                      </div>
                    </div>
                    {activeField === 'card' && (
                      <div className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                    )}
                  </button>

                  {/* Terminal */}
                  <button
                    type="button"
                    data-test-id="pos-tender-terminal"
                    onClick={() => setActiveField('terminal')}
                    className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${
                      activeField === 'terminal'
                        ? 'border-purple-400 bg-purple-50'
                        : 'border-[var(--ms-border)] bg-[var(--ms-bg-app)] hover:border-purple-200'
                    }`}
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${activeField === 'terminal' ? 'bg-purple-500' : 'bg-[var(--ms-bg-input)]'}`}
                    >
                      <Monitor
                        className={`h-4 w-4 ${activeField === 'terminal' ? 'text-white' : 'text-[var(--ms-text-muted)]'}`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]">
                        {t('terminal')}
                      </div>
                      <div
                        className={`font-bold tabular-nums leading-tight text-sm ${terminalMinor > 0n ? 'text-[var(--ms-text-primary)]' : 'text-[var(--ms-text-muted)]'}`}
                      >
                        {terminalMinor > 0n ? formatMoney(terminalMinor) : '—'}
                      </div>
                    </div>
                    {activeField === 'terminal' && (
                      <div className="h-2 w-2 shrink-0 rounded-full bg-purple-500" />
                    )}
                  </button>
                </div>

                {/* Remaining / Change — pushed to bottom */}
                <div className="mt-auto px-4 pb-4">
                  {debtMinor > 0n ? (
                    agent ? (
                      <div className="rounded-xl bg-red-50 border border-red-300 px-3 py-3 text-center">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-red-500 mb-0.5">
                          {t('debt')}
                        </p>
                        <p className="text-xl font-bold tabular-nums text-red-700 leading-none">
                          {formatMoney(debtMinor)}
                        </p>
                        <p className="mt-1 text-[10px] text-red-400">
                          {t('debt_assigned_to', { name: agent.name })}
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-xl bg-orange-50 border border-orange-200 px-3 py-3 text-center">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-orange-500 mb-0.5">
                          {t('remaining')}
                        </p>
                        <p className="text-xl font-bold tabular-nums text-orange-700 leading-none">
                          {formatMoney(debtMinor)}
                        </p>
                        <p className="mt-1 text-[10px] text-orange-400">
                          {t('select_customer_for_debt')}
                        </p>
                      </div>
                    )
                  ) : change > 0n ? (
                    <div className="rounded-xl bg-emerald-50 border border-emerald-300 px-3 py-3 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-500 mb-0.5">
                        {t('change_due')}
                      </p>
                      <p className="text-2xl font-bold tabular-nums text-emerald-700 leading-none">
                        {formatMoney(change)}
                      </p>
                    </div>
                  ) : totalPaid > 0n && totalPaid === sumMinor ? (
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-center">
                      <p className="text-sm font-semibold text-emerald-700">✓ {t('exact_paid')}</p>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Confirm — pinned at bottom, never scrolls */}
              <div className="shrink-0 p-4 border-t border-[var(--ms-border)]">
                {/* Hint: why button is disabled */}
                {changeExceedsCash && !loading && (
                  <p className="mb-2 text-center text-[10px] font-medium text-red-500">
                    {t('change_cash_only')}
                  </p>
                )}
                {/* `!canConfirm` bilan bog'landi: to'liq qarz holatida tugma
                    YONIQ, va o'sha payt «summani kiriting» deb turish kassirni
                    yo'q to'siqqa ishontirardi. */}
                {!canConfirm && totalPaid === 0n && !loading && (
                  <p className="mb-2 text-center text-[10px] text-[var(--ms-text-muted)]">
                    {t('enter_amount')}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={!canConfirm}
                  className="h-12 w-full rounded-xl bg-emerald-500 font-bold text-sm text-white shadow-md transition-all hover:bg-emerald-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg
                        className="h-4 w-4 animate-spin"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      {t('saving')}
                    </span>
                  ) : (
                    `✓ ${t('checkout_submit')}`
                  )}
                </button>
              </div>
            </div>

            {/* RIGHT — numpad panel */}
            <div className="flex flex-1 flex-col gap-2 p-4 bg-[var(--ms-bg-app)]">
              {/* Active field — real input, keyboard + numpad both work */}
              <div
                className={`rounded-xl border-2 px-4 py-2 transition-colors ${colors.border} bg-white`}
              >
                <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--ms-text-muted)] mb-0.5">
                  {fieldLabel[activeField]}
                </div>
                <input
                  key={activeField}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={INPUTS[activeField]}
                  onChange={(e) => setActive(e.target.value)}
                  placeholder="0"
                  // biome-ignore lint/a11y/noAutofocus: intentional POS focus — cashier types the payment amount immediately when this modal opens.
                  autoFocus
                  className="w-full bg-transparent text-2xl font-bold tabular-nums text-[var(--ms-text-primary)] leading-none outline-none placeholder:text-[var(--ms-text-muted)] placeholder:font-normal placeholder:text-lg [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </div>

              {/* Aniq summa */}
              <button
                type="button"
                onClick={handleExact}
                className="w-full rounded-xl border-2 border-dashed border-[var(--ms-border)] bg-white py-2 text-sm font-bold text-[var(--ms-text-primary)] hover:border-[var(--ms-brand)] hover:bg-[var(--ms-bg-hover)] transition-colors"
              >
                {t('exact_amount')}
              </button>

              {/* Numpad — grows to fill remaining space */}
              <div className="grid grid-cols-3 grid-rows-4 gap-1.5 flex-1">
                {NUMPAD_KEYS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => (k === '⌫' ? handleBack() : handleDigit(k))}
                    className={`rounded-xl border font-semibold text-xl transition-all active:scale-95 ${
                      k === '⌫'
                        ? 'border-[var(--ms-border)] bg-[var(--ms-bg-input)] text-[var(--ms-text-muted)] hover:bg-red-50 hover:text-red-500 hover:border-red-200'
                        : 'border-[var(--ms-border)] bg-white text-[var(--ms-text-primary)] hover:bg-[var(--ms-bg-hover)] shadow-sm'
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
