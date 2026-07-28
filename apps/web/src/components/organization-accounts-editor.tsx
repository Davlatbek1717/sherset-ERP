'use client';

/**
 * moysklad «Расчётные счета» — an organization's settlement accounts edited
 * INLINE on the Юр.лицо form (not a separate page). Mirrors moysklad's stacked
 * light-blue «Расчётный счёт» cards: each card edits one account; «+ Расчётный
 * счёт» adds; the ✕ removes; «Основной счёт» marks the default (one per currency).
 *
 * The card's required «Расчётный счёт» field maps to the account `name` (the value
 * shown in document account pickers — climart's «Сум»/«Доллар»/…). `accountNumber`
 * is carried hidden so inline edits never clobber a stored bank number. Balance is
 * read-only here (changing it is a money-ledger operation, out of this form's scope).
 *
 * Controlled: the parent org form owns the array and sends it back in the org save
 * payload, so org fields + accounts persist atomically in one «Сохранить».
 */

import { Icons, Input, NativeSelect, RadioGroup, formatMoney } from '@moysklad/ui';
import { useTranslations } from 'next-intl';

const CURRENCIES = ['UZS', 'USD', 'EUR', 'RUB'] as const;

export interface OrgAccountCard {
  /** Stable React key (a fresh uuid for new rows, the real id for existing ones). */
  key: string;
  /** Present ⇒ existing account (update); absent ⇒ new account (create). */
  id?: string;
  /** Optimistic-lock token for an existing account (undefined for a new card). */
  version?: number;
  name: string;
  currency: string;
  bic: string;
  bankName: string;
  bankLocation: string;
  /** Hidden — preserved round-trip so inline edits don't wipe a stored number. */
  accountNumber: string;
  correspondentAccount: string;
  /** Read-only minor-unit balance string (display only). */
  balanceMinor: string;
  isDefault: boolean;
}

/** A blank card for «+ Расчётный счёт». `crypto.randomUUID` keys it for React only. */
export function newOrgAccountCard(): OrgAccountCard {
  return {
    key:
      typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Math.random()}`,
    name: '',
    currency: 'UZS',
    bic: '',
    bankName: '',
    bankLocation: '',
    accountNumber: '',
    correspondentAccount: '',
    balanceMinor: '0',
    isDefault: false,
  };
}

const SELECT_CLASS =
  'w-full h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)]';

function Row({
  label,
  required,
  children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-center gap-1 sm:grid-cols-[150px_1fr] sm:gap-3">
      <span className="text-[12px] text-[var(--ms-text-primary)] sm:text-right">
        {required && <span className="mr-0.5 text-[var(--ms-text-destructive)]">*</span>}
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function OrganizationAccountsEditor({
  value,
  onChange,
}: {
  value: OrgAccountCard[];
  onChange: (next: OrgAccountCard[]) => void;
}) {
  const t = useTranslations('pages.organizations');

  const patch = (key: string, partial: Partial<OrgAccountCard>) =>
    onChange(value.map((c) => (c.key === key ? { ...c, ...partial } : c)));

  // moysklad «Основной счёт» is one per currency — selecting a card demotes the
  // others that share its currency (matches the server-side normalisation).
  const setDefault = (key: string) => {
    const target = value.find((c) => c.key === key);
    if (!target) return;
    onChange(
      value.map((c) => {
        if (c.key === key) return { ...c, isDefault: true };
        if (c.currency === target.currency) return { ...c, isDefault: false };
        return c;
      }),
    );
  };

  // Changing a card's currency must preserve the one-default-per-currency invariant:
  // if the edited card is the default, demote any OTHER card that now shares its new
  // currency (else two «Основной счёт» radios could light up for the same currency,
  // and the server would silently pick the wrong one). (Adversarial QA 2026-06-21 #3.)
  const setCurrency = (key: string, currency: string) => {
    const target = value.find((c) => c.key === key);
    onChange(
      value.map((c) => {
        if (c.key === key) return { ...c, currency };
        if (target?.isDefault && c.currency === currency) return { ...c, isDefault: false };
        return c;
      }),
    );
  };

  const remove = (key: string) => onChange(value.filter((c) => c.key !== key));
  const add = () => onChange([...value, newOrgAccountCard()]);
  // moysklad caps an org at a sane number of accounts; mirror the server's 50-cap so
  // the «+» can't push past it into a raw 400. (Adversarial QA 2026-06-21 #6.)
  const atCap = value.length >= 50;

  return (
    <div className="space-y-3" data-test-id="org-accounts-editor">
      {value.map((card) => (
        <div
          key={card.key}
          className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-brand-50)]/40 p-4"
          data-test-id="org-account-card"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="font-medium text-[13px] text-[var(--ms-text-brand)]">
              {t('account_settlement')}
            </span>
            <button
              type="button"
              onClick={() => remove(card.key)}
              aria-label={t('remove_account')}
              className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)] hover:text-[var(--ms-text-destructive)]"
              data-test-id="org-account-remove"
            >
              <Icons.close className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div className="space-y-2">
            <Row label={t('bic')}>
              <Input value={card.bic} onChange={(e) => patch(card.key, { bic: e.target.value })} />
            </Row>
            <Row label={t('bank_name')}>
              <Input
                value={card.bankName}
                onChange={(e) => patch(card.key, { bankName: e.target.value })}
              />
            </Row>
            <Row label={t('bank_location')}>
              <Input
                value={card.bankLocation}
                onChange={(e) => patch(card.key, { bankLocation: e.target.value })}
              />
            </Row>
            <Row label={t('correspondent_account')}>
              <Input
                value={card.correspondentAccount}
                onChange={(e) => patch(card.key, { correspondentAccount: e.target.value })}
              />
            </Row>
            <Row label={t('account_settlement')} required>
              <Input
                value={card.name}
                onChange={(e) => patch(card.key, { name: e.target.value })}
                data-test-id="org-account-name"
              />
            </Row>
            <Row label={t('account_currency')} required>
              <NativeSelect
                value={card.currency}
                onChange={(e) => setCurrency(card.key, e.target.value)}
                className={SELECT_CLASS}
                data-test-id="org-account-currency"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </NativeSelect>
            </Row>
            <Row label={t('current_balance')}>
              <span className="text-[13px] text-[var(--ms-text-primary)] tabular-nums">
                {formatMoney(card.balanceMinor, card.currency)}
              </span>
            </Row>
            <Row label="">
              {/* One radio per account card — the group spans the sibling cards,
                  so each card contributes a single option under a shared `name`
                  (that shared name is what makes them mutually exclusive; the
                  pre-DS markup had no name at all). */}
              <RadioGroup
                name="org-account-default"
                value={card.isDefault ? card.key : undefined}
                onChange={() => setDefault(card.key)}
                className="text-[12px]"
                options={[
                  {
                    value: card.key,
                    label: t('is_default_account'),
                    testId: 'org-account-default',
                  },
                ]}
              />
            </Row>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        disabled={atCap}
        className="inline-flex items-center gap-1 text-[13px] text-[var(--ms-text-brand)] hover:underline disabled:cursor-not-allowed disabled:text-[var(--ms-text-muted)] disabled:no-underline"
        data-test-id="org-account-add"
      >
        <Icons.create className="h-4 w-4" aria-hidden />
        {t('account_settlement')}
      </button>
    </div>
  );
}
