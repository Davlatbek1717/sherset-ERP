'use client';

/**
 * counterparty card «Показатели» inline create-forms (moysklad 1:1, user-grounded from the
 * live «Создание корректировки» / «Создание акта сверки» panels):
 *
 * moysklad opens these IN PLACE — the form replaces the toolbar inside the «Показатели»
 * panel (NO floating dialog, NO backdrop); the «Баланс»/«Продажи»/«Возвраты» figures stay
 * visible below it, separated by a divider. So these are plain inline blocks, not Modals.
 *
 *   AdjustmentCreateForm   — «Создание корректировки»: one «Организация» select →
 *                            «Создать» opens the full adjustment editor pre-filled with this
 *                            counterparty + the chosen organization (the moysklad flow: the
 *                            panel only picks the org, the doc is filled in the editor).
 *   ReconciliationActForm  — «Создание акта сверки»: «Период:» quick-presets (вч·сег·нед·мес) +
 *                            a date range + «Организация» + «Договор», then «Печать ▾».
 *                            The взаиморасчёты report is the act's data source (the printable
 *                            PDF act itself is a separate, not-yet-built feature).
 */

import { api } from '@/lib/api-client';
import { Button, Icons, Input, NativeSelect } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface RefRow {
  id: string;
  name: string;
}

/** Organizations (наши юр-лица) — small list, fetched once when the form mounts. */
function useOrganizations() {
  return (
    useQuery<{ items: RefRow[] }>({
      queryKey: ['organizations', 'metrics-form'],
      queryFn: () => api.get<{ items: RefRow[] }>('/organizations?limit=100'),
      staleTime: 5 * 60_000,
    }).data?.items ?? []
  );
}

interface AdjustmentFormProps {
  counterpartyId: string;
  counterpartyName?: string;
  onClose: () => void;
}

export function AdjustmentCreateForm({
  counterpartyId,
  counterpartyName,
  onClose,
}: AdjustmentFormProps) {
  const t = useTranslations('counterparty_activity');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const router = useRouter();
  const orgs = useOrganizations();
  const [orgId, setOrgId] = useState('');

  const create = () => {
    // moysklad: the panel only chooses the organization; the doc itself is filled in the
    // editor. Hand off agent + org (with labels) so the editor opens pre-filled.
    const qs = new URLSearchParams({ agentId: counterpartyId });
    if (counterpartyName) qs.set('agentLabel', counterpartyName);
    if (orgId) {
      qs.set('organizationId', orgId);
      const name = orgs.find((o) => o.id === orgId)?.name;
      if (name) qs.set('organizationLabel', name);
    }
    router.push(`/counterparty-adjustments/new?${qs.toString()}`);
  };

  return (
    <div className="max-w-[460px]" data-test-id="adj-create-form">
      <div className="mb-4 font-semibold text-[var(--ms-text-primary)]">{t('adj_modal_title')}</div>
      <div className="flex flex-col gap-1">
        <label htmlFor="adj-org" className="font-medium text-[var(--ms-text-primary)] text-sm">
          {tFields('organization')}
        </label>
        <NativeSelect
          id="adj-org"
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
          data-test-id="adj-create-org"
        >
          <option value="">{t('metric_org_placeholder')}</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="mt-4 flex gap-2">
        <Button onClick={create} data-test-id="adj-create-submit">
          {tCommon('create')}
        </Button>
        <Button variant="secondary" onClick={onClose} data-test-id="adj-create-cancel">
          {tCommon('cancel')}
        </Button>
      </div>
    </div>
  );
}

interface ReconFormProps {
  counterpartyId: string;
  onClose: () => void;
}

const pad = (n: number) => n.toString().padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function ReconciliationActForm({ counterpartyId, onClose }: ReconFormProps) {
  const t = useTranslations('counterparty_activity');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const orgs = useOrganizations();
  const contracts =
    useQuery<{ items: RefRow[] }>({
      queryKey: ['contracts', 'metrics-form', counterpartyId],
      queryFn: () => api.get<{ items: RefRow[] }>(`/contracts?agentId=${counterpartyId}&limit=100`),
      enabled: !!counterpartyId,
      staleTime: 5 * 60_000,
    }).data?.items ?? [];

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [orgId, setOrgId] = useState('');
  const [contractId, setContractId] = useState('');

  // «Период:» quick-presets (вч·сег·нед·мес) — fill the date range. Week starts Monday.
  const preset = (kind: 'yesterday' | 'today' | 'week' | 'month') => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (kind === 'today') {
      setFrom(ymd(today));
      setTo(ymd(today));
    } else if (kind === 'yesterday') {
      const y = new Date(today);
      y.setDate(today.getDate() - 1);
      setFrom(ymd(y));
      setTo(ymd(y));
    } else if (kind === 'week') {
      const w = new Date(today);
      w.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      setFrom(ymd(w));
      setTo(ymd(today));
    } else {
      setFrom(ymd(new Date(today.getFullYear(), today.getMonth(), 1)));
      setTo(ymd(today));
    }
  };

  const print = () => {
    // «Акт сверки взаимных расчётов» — open the printable act in a new tab for this
    // organization × counterparty × period × contract. An act is between ONE of our
    // organizations and the counterparty, so fall back to the first available org when the
    // user left the field on its placeholder.
    const organizationId = orgId || orgs[0]?.id;
    if (!organizationId) return;
    const qs = new URLSearchParams({ organizationId, counterpartyId });
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    if (contractId) qs.set('contractId', contractId);
    window.open(`/print/reconciliation-act?${qs.toString()}`, '_blank');
  };

  const presetBtn = (kind: 'yesterday' | 'today' | 'week' | 'month', key: string) => (
    <button
      type="button"
      onClick={() => preset(kind)}
      className="text-[var(--ms-text-brand)] text-sm hover:underline"
      data-test-id={`recon-preset-${kind}`}
    >
      {t(key)}
    </button>
  );

  return (
    <div className="max-w-[460px]" data-test-id="recon-create-form">
      <div className="mb-4 font-semibold text-[var(--ms-text-primary)]">
        {t('recon_modal_title')}
      </div>
      <div className="flex flex-col gap-4">
        {/* «Период:» + the four quick-presets, one line (moysklad: «вч · сег · нед · мес»). */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[var(--ms-text-muted)]">{t('metric_period')}:</span>
          {presetBtn('yesterday', 'metric_period_yesterday')}
          <span className="text-[var(--ms-text-muted)]">·</span>
          {presetBtn('today', 'metric_period_today')}
          <span className="text-[var(--ms-text-muted)]">·</span>
          {presetBtn('week', 'metric_period_week')}
          <span className="text-[var(--ms-text-muted)]">·</span>
          {presetBtn('month', 'metric_period_month')}
        </div>

        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            data-test-id="recon-from"
          />
          <span className="text-[var(--ms-text-muted)]">–</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            data-test-id="recon-to"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="recon-org" className="font-medium text-[var(--ms-text-primary)] text-sm">
            {tFields('organization')}
          </label>
          <NativeSelect
            id="recon-org"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            data-test-id="recon-org"
          >
            <option value="">{t('metric_org_placeholder')}</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="recon-contract"
            className="font-medium text-[var(--ms-text-primary)] text-sm"
          >
            {tFields('contract')}
          </label>
          <NativeSelect
            id="recon-contract"
            value={contractId}
            onChange={(e) => setContractId(e.target.value)}
            data-test-id="recon-contract"
          >
            <option value="">{t('metric_contract_placeholder')}</option>
            {contracts.map((cn) => (
              <option key={cn.id} value={cn.id}>
                {cn.name}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="flex gap-2">
          <Button onClick={print} data-test-id="recon-print">
            <Icons.print className="mr-1 h-4 w-4" />
            {tCommon('print')}
            <Icons.down className="ml-1 h-3 w-3" />
          </Button>
          <Button variant="secondary" onClick={onClose} data-test-id="recon-cancel">
            {tCommon('cancel')}
          </Button>
        </div>
      </div>
    </div>
  );
}
