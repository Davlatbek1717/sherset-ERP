'use client';

/**
 * Counterparty balance inline display — moysklad parity.
 *
 * Etalon: every document edit form (PurchaseOrder, CustomerOrder,
 * InvoiceIn/Out, ...) — directly under the Контрагент field:
 *
 *   Баланс (нам должны): 1 013 000,00 сум
 *
 * Fetches per-currency balances from /counterparty-balances/:id.
 * Positive ⇒ «(нам должны)» — they owe us; negative ⇒ «(мы должны)»
 * — we owe them. A zero balance still renders (moysklad shows
 * «Баланс : 0,00 сум»).
 *
 * COLOUR is NOT moysklad's — it is the owner's risk rule (2026-08-08):
 * red iff the counterparty owes us, green otherwise (zero included).
 * The rule lives in {@link ../lib/counterparty-balance-tone}; read its
 * header before "fixing" the colours in a parity audit. Only the colour
 * deviates — label, qualifiers and formatting stay at parity.
 *
 * Component is read-only and self-contained — drop next to the agent
 * field on any document form. `counterpartyId={null}` ⇒ renders
 * nothing (no flicker before the user picks).
 */

import { api } from '@/lib/api-client';
import { counterpartyBalanceToneClass } from '@/lib/counterparty-balance-tone';
import { formatMoney } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

interface BalanceRow {
  currency: string;
  balanceMinor: string;
  updatedAt: string;
}

interface BalanceResponse {
  items: BalanceRow[];
}

export interface CounterpartyBalanceInlineProps {
  counterpartyId: string | null;
}

export function CounterpartyBalanceInline({ counterpartyId }: CounterpartyBalanceInlineProps) {
  const t = useTranslations('counterparty_balance');
  const { data } = useQuery<BalanceResponse>({
    queryKey: ['counterparty-balance', counterpartyId],
    queryFn: () => api.get<BalanceResponse>(`/counterparty-balances/${counterpartyId}`),
    enabled: !!counterpartyId,
  });

  const rows = (data?.items ?? []).filter((r) => r.balanceMinor !== '0');
  if (!counterpartyId) return null;

  // moysklad shows «Баланс : 0,00 сум» even when the balance is zero (base
  // currency, no directional label) — NOT a hidden line. Render that at zero.
  if (rows.length === 0) {
    return (
      <div className="mt-1 text-xs" data-test-id="counterparty-balance-inline">
        <span className={counterpartyBalanceToneClass(0n)}>
          {t('balance_label')} :{' '}
          <span className="font-medium tabular-nums">{formatMoney(0n, 'UZS')}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="mt-1 flex flex-wrap gap-x-3 text-xs" data-test-id="counterparty-balance-inline">
      {rows.map((r) => {
        const minor = BigInt(r.balanceMinor);
        // moysklad convention: positive ⇒ counterparty owes us («нам должны»);
        // we display the magnitude with the directional label. The COLOUR is
        // the owner's risk rule, not the accounting sign — see the helper.
        const positive = minor > 0n;
        const tone = counterpartyBalanceToneClass(minor);
        const abs = positive ? minor : -minor;
        return (
          <span key={r.currency} className={tone}>
            {t('balance_label')} {positive ? t('owe_us') : t('we_owe')}:{' '}
            <span className="font-medium tabular-nums">{formatMoney(abs, r.currency)}</span>
          </span>
        );
      })}
    </div>
  );
}
