'use client';

import { CounterpartyFieldRow } from '@/components/counterparty-form-layout';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { Badge, Button, Checkbox, FormSection, Icons, Input, NativeSelect } from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface BankAccount {
  id: string;
  accountNumber: string;
  bankName: string | null;
  bankLocation: string | null;
  correspondentAccount: string | null;
  mfo: string | null;
  currency: string;
  isMain: boolean;
}

interface Draft {
  accountNumber: string;
  bankName: string;
  bankLocation: string;
  correspondentAccount: string;
  mfo: string;
  currency: string;
  isMain: boolean;
}

const EMPTY_DRAFT: Draft = {
  accountNumber: '',
  bankName: '',
  bankLocation: '',
  correspondentAccount: '',
  mfo: '',
  currency: 'UZS',
  isMain: false,
};

const toDraft = (a: BankAccount): Draft => ({
  accountNumber: a.accountNumber,
  bankName: a.bankName ?? '',
  bankLocation: a.bankLocation ?? '',
  correspondentAccount: a.correspondentAccount ?? '',
  mfo: a.mfo ?? '',
  currency: a.currency,
  isMain: a.isMain,
});

// Build the create/update payload. On update we send '' for emptied text fields
// (the BE schema accepts empty strings → the column clears), but `mfo` is special:
// its BE regex is /^\d{5}$/ which REJECTS '' — so it is omitted when empty in both
// modes (a previously-set «БИК» cannot be blanked via the API, only changed).
const toPayload = (d: Draft, mode: 'create' | 'update') => {
  const t = (s: string) => s.trim();
  const payload: Record<string, unknown> = {
    accountNumber: t(d.accountNumber),
    currency: t(d.currency) || 'UZS',
    isMain: d.isMain,
    ...(mode === 'update' || t(d.bankName) ? { bankName: t(d.bankName) } : {}),
    ...(mode === 'update' || t(d.bankLocation) ? { bankLocation: t(d.bankLocation) } : {}),
    ...(mode === 'update' || t(d.correspondentAccount)
      ? { correspondentAccount: t(d.correspondentAccount) }
      : {}),
  };
  if (t(d.mfo)) payload.mfo = t(d.mfo);
  return payload;
};

export interface BankAccountsSectionProps {
  counterpartyId: string;
  /** When embedded inside the «Реквизиты» card, render without the own FormSection chrome. */
  bare?: boolean;
}

/**
 * Inline «Расчётные счета» CRUD for the counterparty detail page, rendered as editable
 * cards (mirrors ContactPersonsSection). Each account is a card whose fields are editable
 * in place; «Сохранить» appears once a card is touched, «+ Расчётный счёт» adds a blank
 * card, and ✕ deletes.
 *
 * Field set + labels are LIVE-grounded against the bank-account sub-form (identical for
 * org + counterparty) captured at docs/audits/org-accounts-live-2026-06-21/20-org-open.txt:
 * «БИК» · «Банк» · «Адрес» · «Корр. счёт» · «Расчётный счёт» (required) · «Валюта счёта» ·
 * «Основной счёт». NOTE: the column is internally `mfo` (UZ 5-digit bank code) but moysklad.uz
 * LABELS it «БИК» — the previous «МФО» label was a §4 grounding miss (banner/assumption, not
 * the live form). The BE extras `bankInn`/`swift` are not in moysklad's account card → omitted.
 */
export function BankAccountsSection({ counterpartyId, bare }: BankAccountsSectionProps) {
  const qc = useQueryClient();
  const t = useTranslations('pages.counterparty_new');
  const tCommon = useTranslations('common');

  const { data, isLoading } = useQuery<BankAccount[]>({
    queryKey: ['counterparty-bank-accounts', counterpartyId],
    queryFn: () => api.get<BankAccount[]>(`/counterparties/${counterpartyId}/bank-accounts`),
  });

  const { data: currencies } = useQuery<{ items: { id: string; code: string }[] }>({
    queryKey: ['currencies'],
    queryFn: () => api.get<{ items: { id: string; code: string }[] }>('/currencies'),
    staleTime: 5 * 60 * 1000,
  });

  // Per-card edit drafts (id → Draft); present only once a card is touched. newDraft is
  // the blank «+ Расчётный счёт» card (null when not adding).
  const [edits, setEdits] = useState<Record<string, Draft>>({});
  const [newDraft, setNewDraft] = useState<Draft | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['counterparty-bank-accounts', counterpartyId] });
    // bank-account changes are audit-logged on the PARENT counterparty feed.
    qc.invalidateQueries({ queryKey: ['counterparty', counterpartyId] });
  };

  const createMut = useApiMutation({
    mutationFn: (d: Draft) =>
      api.post(`/counterparties/${counterpartyId}/bank-accounts`, toPayload(d, 'create')),
    onSuccess: () => {
      setNewDraft(null);
      invalidate();
    },
  });
  const updateMut = useApiMutation({
    mutationFn: ({ id, d }: { id: string; d: Draft }) =>
      api.patch(`/counterparties/${counterpartyId}/bank-accounts/${id}`, toPayload(d, 'update')),
    onSuccess: (_res, vars) => {
      setEdits((prev) => {
        const next = { ...prev };
        delete next[vars.id];
        return next;
      });
      invalidate();
    },
  });
  const deleteMut = useApiMutation({
    mutationFn: (id: string) => api.delete(`/counterparties/${counterpartyId}/bank-accounts/${id}`),
    onSuccess: () => {
      invalidate();
      setConfirmingId(null);
    },
  });

  const items = data ?? [];
  const currencyOptions = currencies?.items?.map((c) => c.code) ?? ['UZS'];

  const draftOf = (a: BankAccount): Draft => edits[a.id] ?? toDraft(a);
  const patchEdit = (a: BankAccount, patch: Partial<Draft>) =>
    setEdits((prev) => ({ ...prev, [a.id]: { ...(prev[a.id] ?? toDraft(a)), ...patch } }));

  const validate = (d: Draft): string | null => {
    if (!d.accountNumber.trim()) return t('bank_account_required');
    if (d.mfo.trim() && !/^\d{5}$/.test(d.mfo.trim())) return t('bank_bik_invalid');
    return null;
  };

  // A reusable 7-field card body (label-LEFT, live-grounded order).
  const cardFields = (d: Draft, onChange: (patch: Partial<Draft>) => void, idPrefix: string) => (
    <>
      <CounterpartyFieldRow label={t('bank_bik_label')}>
        <Input
          value={d.mfo}
          inputMode="numeric"
          onChange={(e) => onChange({ mfo: e.target.value })}
          data-test-id={`${idPrefix}-bik`}
        />
      </CounterpartyFieldRow>
      <CounterpartyFieldRow label={t('bank_col_bank')}>
        <Input
          value={d.bankName}
          onChange={(e) => onChange({ bankName: e.target.value })}
          data-test-id={`${idPrefix}-bankName`}
        />
      </CounterpartyFieldRow>
      <CounterpartyFieldRow label={t('bank_location_label')}>
        <Input
          value={d.bankLocation}
          onChange={(e) => onChange({ bankLocation: e.target.value })}
          data-test-id={`${idPrefix}-bankLocation`}
        />
      </CounterpartyFieldRow>
      <CounterpartyFieldRow label={t('bank_correspondent_label')}>
        <Input
          value={d.correspondentAccount}
          inputMode="numeric"
          onChange={(e) => onChange({ correspondentAccount: e.target.value })}
          data-test-id={`${idPrefix}-correspondent`}
        />
      </CounterpartyFieldRow>
      <CounterpartyFieldRow
        label={
          <>
            <span className="text-[var(--ms-text-destructive)]">*</span> {t('bank_col_account')}
          </>
        }
      >
        <Input
          value={d.accountNumber}
          inputMode="numeric"
          onChange={(e) => onChange({ accountNumber: e.target.value })}
          data-test-id={`${idPrefix}-accountNumber`}
        />
      </CounterpartyFieldRow>
      <CounterpartyFieldRow label={t('bank_col_currency')}>
        <NativeSelect
          value={d.currency}
          onChange={(e) => onChange({ currency: e.target.value })}
          data-test-id={`${idPrefix}-currency`}
        >
          {currencyOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </NativeSelect>
      </CounterpartyFieldRow>
      <CounterpartyFieldRow label={t('bank_main_label')}>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={d.isMain}
            onCheckedChange={(v) => onChange({ isMain: !!v })}
            data-test-id={`${idPrefix}-isMain`}
          />
        </label>
      </CounterpartyFieldRow>
    </>
  );

  const body = (
    <div className="space-y-3">
      {isLoading && (
        <div className="py-2 text-[var(--ms-text-muted)] text-xs">{tCommon('loading')}</div>
      )}

      {/* Existing accounts — editable cards. */}
      {items.map((a) => {
        const d = draftOf(a);
        const dirty = !!edits[a.id];
        return (
          <div
            key={a.id}
            className="relative space-y-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-3 pt-7"
            data-test-id={`bank-card-${a.id}`}
          >
            {a.isMain && (
              <Badge tone="success" className="absolute top-2 left-3">
                {t('bank_main_label')}
              </Badge>
            )}
            {confirmingId === a.id ? (
              <div className="absolute top-1.5 right-2 flex gap-1">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => deleteMut.mutate(a.id)}
                  loading={deleteMut.isPending}
                  data-test-id={`bank-confirm-delete-${a.id}`}
                >
                  {tCommon('delete')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmingId(null)}>
                  {tCommon('cancel')}
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingId(a.id)}
                className="absolute top-1.5 right-2 text-[var(--ms-text-muted)] hover:text-[var(--ms-text-destructive)]"
                aria-label={tCommon('delete')}
                data-test-id={`bank-delete-${a.id}`}
              >
                ×
              </button>
            )}
            {cardFields(d, (patch) => patchEdit(a, patch), `bank-edit-${a.id}`)}
            {dirty && (
              <div className="flex items-center justify-end gap-2">
                {formError && (
                  <span className="text-[var(--ms-text-destructive)] text-xs">{formError}</span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFormError(null);
                    setEdits((prev) => {
                      const next = { ...prev };
                      delete next[a.id];
                      return next;
                    });
                  }}
                >
                  {tCommon('cancel')}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={updateMut.isPending}
                  onClick={() => {
                    const err = validate(d);
                    setFormError(err);
                    if (!err) updateMut.mutate({ id: a.id, d });
                  }}
                  data-test-id={`bank-save-${a.id}`}
                >
                  {tCommon('save')}
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {/* «+ Расчётный счёт» — a blank card to add. */}
      {newDraft ? (
        <div
          className="space-y-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-3"
          data-test-id="bank-new-card"
        >
          {cardFields(
            newDraft,
            (patch) => setNewDraft((d) => ({ ...(d ?? EMPTY_DRAFT), ...patch })),
            'bank-new',
          )}
          {(formError || createMut.error) && (
            <p className="text-[var(--ms-text-destructive)] text-xs" data-test-id="bank-form-error">
              {formError ?? (createMut.error as Error).message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setNewDraft(null);
                setFormError(null);
              }}
            >
              {tCommon('cancel')}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={createMut.isPending}
              onClick={() => {
                const err = validate(newDraft);
                setFormError(err);
                if (!err) createMut.mutate(newDraft);
              }}
              data-test-id="bank-new-add"
            >
              {tCommon('add')}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            setNewDraft(EMPTY_DRAFT);
            setFormError(null);
          }}
          data-test-id="bank-add"
        >
          <Icons.create className="h-4 w-4" />
          {t('bank_add_button')}
        </Button>
      )}
    </div>
  );

  if (bare) return body;
  return <FormSection title={t('bank_section_title')}>{body}</FormSection>;
}
