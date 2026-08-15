'use client';

import { api } from '@/lib/api-client';
import type { ListEnvelope } from '@moysklad/contracts';
import type { CurrencyCode } from '@moysklad/money/currencies';
import { Input, formatMoney } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Receipt } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { CustomerCardRow } from './customer-card-panel';

/**
 * F7/P07 (2026-08-13, egasi) — o'ng paneldagi «Mijozlar» tabi (Cheklar va
 * Smena orasida): «mijoz qarzidan pul to'lasa yoki nimadir qaytarsa, qulay
 * ishlash».
 *
 * Panel FAQAT ko'rsatadi va yo'naltiradi — pul amali bajarmaydi:
 * - qarz to'lash → `onPayDebt` (chaqiruvchi `DebtPaymentDialog`ni shu mijoz
 *   bilan ochadi — qidiruv qadami o'tkazib yuboriladi);
 * - tarix/telefon-tahrir → `onOpenCustomerCard` (`CustomerCardPanel`);
 * - qaytarish → `onOpenChek` (`ChekDetailPanel`, F6 oqimi).
 *
 * Ekrandagi qarz — BITTA HALOL RAQAM: `payableMinor` (server AYNAN shu
 * summagacha qabul qiladi; xotira `pos-customer-card-one-number`).
 * `balanceMinor === null` — O'LCHANMAGAN, 0 emas: alohida qator bo'lib
 * OCHIQ aytiladi, raqam yashirilmaydi.
 *
 * Yangi backend YO'Q (reja taqig'i) — uch mavjud endpoint, hammasi
 * kiosk-policy'da ochiq: `GET /counterparties?search=`,
 * `GET /debts/pos/summary/:id`, `GET /retail-sales?agentId=`.
 */

/** `GET /debts/pos/summary/:id` javobining bu panel o'qiydigan qismi. */
interface DebtSummaryLite {
  payableMinor: string;
  /** `CounterpartyBalance` qatori; `null` = O'LCHANMAGAN (0 EMAS). */
  balanceMinor: string | null;
}

interface ChekRow {
  id: string;
  name: string;
  moment: string;
  sumMinor: string;
  state: string;
}

interface Props {
  /** Kassa valyutasi — qarz AYNAN shu valyuta kesimida o'qiladi. */
  currency?: CurrencyCode;
  /** «Mijoz kartasi» — chaqiruvchi `CustomerCardPanel`ni ochadi. */
  onOpenCustomerCard: (agent: CustomerCardRow) => void;
  /** «Qarzni to'lash» — chaqiruvchi qarz oynasini shu mijoz bilan ochadi. */
  onPayDebt: (agent: CustomerCardRow) => void;
  /** Chek bosildi — chaqiruvchi `ChekDetailPanel`ni ochadi (F6 qaytarish). */
  onOpenChek: (saleId: string) => void;
}

export function CustomersPanel({
  currency = 'UZS',
  onOpenCustomerCard,
  onPayDebt,
  onOpenChek,
}: Props) {
  const t = useTranslations('pages.pos');

  const [search, setSearch] = useState('');
  const [agent, setAgent] = useState<CustomerCardRow | null>(null);
  const [cheksOpen, setCheksOpen] = useState(false);

  const { data: cpData, isLoading: cpLoading } = useQuery<ListEnvelope<CustomerCardRow>>({
    queryKey: ['pos-customers-search', search],
    queryFn: () => api.get(`/counterparties?search=${encodeURIComponent(search)}&limit=20`),
    enabled: !agent,
  });

  const { data: summary } = useQuery<DebtSummaryLite>({
    // Valyuta kalitda: kassa valyutasi o'zgarsa boshqa qoldiq o'qiladi.
    queryKey: ['pos-customers-debt', agent?.id, currency],
    queryFn: () => api.get(`/debts/pos/summary/${agent?.id}?currency=${currency}`),
    enabled: !!agent,
  });

  const { data: cheks } = useQuery<ListEnvelope<ChekRow>>({
    queryKey: ['pos-customers-cheks', agent?.id],
    queryFn: () =>
      api.get(`/retail-sales?agentId=${agent?.id}&limit=50&sortBy=moment&sortDir=desc`),
    enabled: !!agent && cheksOpen,
  });

  function selectAgent(row: CustomerCardRow) {
    setAgent(row);
    // Oldingi mijozning ochiq cheklar ro'yxati yangisiga «meros» qolmasin.
    setCheksOpen(false);
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      {/* F4 — faqat O'LCHAM-pass (spec §5.3/§4): qatorlar 64px, tugmalar
          ≥56px, shriftlar px-shkala; to'liq-ekranda o'qilishi uchun kontent
          640px ustunga yig'ilgan. Mantiq/DOM-tuzilma o'zgarmagan. */}
      {!agent && (
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-2 p-3">
          {/* 🔴 `inputMode="tel"` OLIB TASHLANDI (2026-08-15, monoblokda):
              qobiq ekran-klaviaturasi `tel` rejimda FAQAT raqam panelini
              chiqaradi — «Telefon YOKI ISM» qidiruvida harf yozib bo'lmasdi.
              Matn rejimida raqam qatori baribir bor. */}
          <Input
            type="text"
            data-test-id="pos-customers-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('customer_card_search_placeholder')}
            className="h-[48px] text-[16px]"
          />
          {cpLoading && <p className="text-[16px] text-[var(--ms-text-muted)]">{t('searching')}</p>}
          {!cpLoading && (cpData?.items.length ?? 0) === 0 && (
            <p className="text-[16px] text-[var(--ms-text-muted)]">{t('debt_no_customers')}</p>
          )}
          <ul className="flex flex-col gap-1.5">
            {(cpData?.items ?? []).map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  data-test-id="pos-customers-result"
                  onClick={() => selectAgent(row)}
                  className="flex min-h-[var(--pos-row-h)] w-full items-center justify-between gap-3 rounded-xl border border-[var(--ms-border)] px-4 text-left hover:bg-[var(--ms-bg-hover)] active:bg-[var(--ms-bg-hover)]"
                >
                  <span className="truncate font-medium text-[18px]">{row.name}</span>
                  <span className="shrink-0 text-[14px] text-[var(--ms-text-muted)]">
                    {row.phone ?? '—'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {agent && (
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3 p-3">
          {/* ── Sarlavha ───────────────────────────────────────────────── */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-[20px] text-[var(--ms-text-primary)]">
                {agent.name}
              </p>
              <p className="text-[16px] text-[var(--ms-text-muted)]">{agent.phone ?? '—'}</p>
            </div>
            <button
              type="button"
              data-test-id="pos-customers-change"
              onClick={() => setAgent(null)}
              className="h-[48px] shrink-0 rounded-lg border border-[var(--ms-border)] px-4 text-[16px] hover:bg-[var(--ms-bg-hover)]"
            >
              {t('change_customer')}
            </button>
          </div>

          {/* ── Qarz: BITTA HALOL RAQAM ────────────────────────────────── */}
          {!summary ? (
            <p className="text-[16px] text-[var(--ms-text-muted)]">{t('debt_loading')}</p>
          ) : (
            <div
              data-test-id="pos-customers-debt"
              className="rounded-xl border border-[var(--ms-border)] p-4"
            >
              <p className="text-[14px] text-[var(--ms-text-muted)]">
                {t('customer_card_payable')}
              </p>
              <p className="font-semibold text-[32px] tabular-nums text-[var(--ms-text-primary)]">
                {formatMoney(summary.payableMinor, currency)}
              </p>
              <p className="text-[14px] text-[var(--ms-text-muted)]">
                {t('customer_card_payable_hint')}
              </p>
              {summary.balanceMinor === null && (
                <p
                  data-test-id="pos-customers-balance-missing"
                  className="mt-2 rounded-lg bg-[var(--ms-bg-hover)] px-3 py-2 text-[14px] text-[var(--ms-text-muted)]"
                >
                  {t('customer_card_balance_missing')}
                </p>
              )}
            </div>
          )}

          {/* ── Uch amal ───────────────────────────────────────────────── */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              data-test-id="pos-customers-pay"
              onClick={() => onPayDebt(agent)}
              className="h-[var(--pos-touch-min)] rounded-xl bg-[var(--ms-bg-brand)] font-semibold text-[18px] text-white active:scale-[0.99]"
            >
              {t('customer_card_pay_debt')}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                data-test-id="pos-customers-card"
                onClick={() => onOpenCustomerCard(agent)}
                className="h-[var(--pos-touch-min)] flex-1 rounded-xl border border-[var(--ms-border)] text-[16px] hover:bg-[var(--ms-bg-hover)]"
              >
                {t('customer_card_title')}
              </button>
              <button
                type="button"
                data-test-id="pos-customers-cheks"
                onClick={() => setCheksOpen((v) => !v)}
                className={`h-[var(--pos-touch-min)] flex-1 rounded-xl border text-[16px] ${
                  cheksOpen
                    ? 'border-[var(--ms-text-brand)] text-[var(--ms-text-brand)]'
                    : 'border-[var(--ms-border)] hover:bg-[var(--ms-bg-hover)]'
                }`}
              >
                {t('customers_cheks')}
              </button>
            </div>
          </div>

          {/* ── Cheklari (F6 qaytarish shu yerdan ochiladi) ────────────── */}
          {cheksOpen &&
            (!cheks || cheks.items.length === 0 ? (
              <p className="text-[16px] text-[var(--ms-text-muted)]">
                {t('customer_card_no_sales')}
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-[var(--ms-border)] rounded-xl border border-[var(--ms-border)]">
                {cheks.items.map((sale) => (
                  <button
                    type="button"
                    key={sale.id}
                    data-test-id="pos-customers-chek"
                    onClick={() => onOpenChek(sale.id)}
                    className="flex min-h-[var(--pos-row-h)] w-full items-center gap-3 px-4 text-left hover:bg-[var(--ms-bg-hover)] active:bg-[var(--ms-bg-hover)]"
                  >
                    <Receipt className="h-5 w-5 shrink-0 text-[var(--ms-text-muted)]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium text-[18px] text-[var(--ms-text-primary)]">
                          {sale.name}
                        </span>
                        <span className="shrink-0 font-semibold text-[18px] tabular-nums">
                          {formatMoney(sale.sumMinor, currency)}
                        </span>
                      </div>
                      <span className="text-[14px] text-[var(--ms-text-muted)]">
                        {new Date(sale.moment).toLocaleDateString('uz-UZ', {
                          day: '2-digit',
                          month: '2-digit',
                          year: '2-digit',
                        })}{' '}
                        {new Date(sale.moment).toLocaleTimeString('uz-UZ', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-[var(--ms-text-muted)]" />
                  </button>
                ))}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
