'use client';

/**
 * moysklad «Настройки компании» 1:1 (owner screenshots 2026-07-16/17):
 * green Сохранить + «Изменения:» audit link on top, then
 *   Правила нумерации документов (radio ×2)
 *   Обратный адрес в письмах (radio ×2 + help link)
 *   Другие политики (5 checkboxes)
 *   Страна для базовых настроек (country select)
 * Singleton per account — GET/PUT /company-settings. «Запретить отгрузку…»
 * is LIVE (forces the demand sufficiency check account-wide); the other
 * policies persist now, their engines wire up in follow-up sessions.
 */

import { useApiMutation } from '@/hooks/use-api-mutation';
import { useAuditLabels } from '@/hooks/use-audit-labels';
import { api } from '@/lib/api-client';
import {
  type AuditEntry,
  Button,
  Checkbox,
  Drawer,
  HistoryTimeline,
  NativeSelect,
  RadioGroup,
  formatDate,
} from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface CompanySettings {
  globalOperationNumbering: boolean;
  emailReplyMode: 'EMPLOYEE' | 'COMPANY';
  checkShippingStock: boolean;
  checkMinPrice: boolean;
  useRecycleBin: boolean;
  useConsignments: boolean;
  showPositionAttributes: boolean;
  accountCountry: string;
  exists: boolean;
  updatedAt: string | null;
}

interface CountryRow {
  id: string;
  name: string;
  code: string | null;
}

const POLICY_KEYS = [
  'checkShippingStock',
  'checkMinPrice',
  'useRecycleBin',
  'useConsignments',
  'showPositionAttributes',
] as const;

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-semibold text-[19px] text-[var(--ms-text-primary)] leading-none">
      {children}
    </h2>
  );
}

export default function CompanySettingsPage() {
  const t = useTranslations('pages.company_settings');
  const tAudit = useTranslations('audit');
  const tDetailHeader = useTranslations('detail_header');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const { translateAction, translateValue } = useAuditLabels();

  const settingsQuery = useQuery<CompanySettings>({
    queryKey: ['company-settings'],
    queryFn: () => api.get<CompanySettings>('/company-settings'),
  });
  const countriesQuery = useQuery<{ items: CountryRow[] }>({
    queryKey: ['countries-for-settings'],
    queryFn: () => api.get<{ items: CountryRow[] }>('/countries?limit=250'),
  });

  // Server scopes by account itself — no entityId needed (the login-response
  // user object doesn't carry accountId, so don't depend on it client-side).
  const historyQuery = useQuery<{ items: AuditEntry[] }>({
    queryKey: ['audit-logs', 'company-settings'],
    queryFn: () =>
      api.get<{ items: AuditEntry[] }>('/admin/audit-logs?entity=companysettings&limit=50'),
  });
  const latest = historyQuery.data?.items?.[0];
  const [historyOpen, setHistoryOpen] = useState(false);

  const [form, setForm] = useState<CompanySettings | null>(null);
  useEffect(() => {
    if (settingsQuery.data) setForm(settingsQuery.data);
  }, [settingsQuery.data]);

  const saveMutation = useApiMutation<CompanySettings, Error, void>({
    mutationFn: () => {
      if (!form) throw new Error('not loaded');
      const { exists, updatedAt, ...payload } = form;
      return api.put<CompanySettings>('/company-settings', payload);
    },
    successMessage: t('saved'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company-settings'] });
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });

  // Diff-table field names → the page's own labels.
  const translateField = (field: string): string => {
    const key = `label_${field}` as 'label_checkShippingStock';
    return t.has(key) ? t(key) : field;
  };

  if (settingsQuery.isLoading || !form) {
    return (
      <div className="px-8 py-6 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>
    );
  }

  const countries = (countriesQuery.data?.items ?? []).filter(
    (c) => c.code && /^[A-Za-z]{2}$/.test(c.code),
  );
  const hasCurrentCountry = countries.some(
    (c) => (c.code ?? '').toUpperCase() === form.accountCountry,
  );

  const set = <K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  return (
    <div className="min-h-full bg-[var(--ms-bg-surface)]" data-testid="company-settings-page">
      {/* ── toolbar ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 flex items-center gap-4 border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-surface)] px-4 py-2.5">
        <Button
          variant="success"
          onClick={() => saveMutation.mutate()}
          loading={saveMutation.isPending}
          data-testid="company-settings-save"
        >
          {t('save')}
        </Button>
        {latest && (
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="ml-2 flex flex-col items-start text-left text-xs leading-tight hover:opacity-80"
            data-testid="company-settings-history-link"
          >
            <span className="text-[var(--ms-text-muted)]">
              {tDetailHeader('changed')}
              {latest.user?.name ? `: ${latest.user.name}` : ''}
            </span>
            <span className="text-[var(--ms-text-muted)] tabular-nums">
              {formatDate(latest.at)}
            </span>
          </button>
        )}
      </div>

      <div className="flex max-w-[760px] flex-col gap-8 px-8 py-6">
        <h1 className="font-semibold text-[28px] text-[var(--ms-text-primary)] leading-none">
          {t('title')}
        </h1>

        {/* Правила нумерации документов */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <SectionHeading>{t('numbering_section')}</SectionHeading>
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--ms-border-input)] text-[11px] text-[var(--ms-text-muted)]">
              ?
            </span>
          </div>
          <RadioGroup<'year' | 'all'>
            name="numbering"
            value={form.globalOperationNumbering ? 'all' : 'year'}
            onChange={(v) => set('globalOperationNumbering', v === 'all')}
            options={[
              { value: 'year', label: t('numbering_year') },
              { value: 'all', label: t('numbering_all_history') },
            ]}
          />
        </section>

        {/* Обратный адрес в письмах */}
        <section className="flex flex-col gap-4">
          <SectionHeading>{t('reply_section')}</SectionHeading>
          <RadioGroup<'EMPLOYEE' | 'COMPANY'>
            name="reply-mode"
            value={form.emailReplyMode}
            onChange={(v) => set('emailReplyMode', v)}
            options={[
              { value: 'EMPLOYEE', label: t('reply_employee') },
              { value: 'COMPANY', label: t('reply_company') },
            ]}
          />
          <a
            href="https://support.moysklad.ru"
            target="_blank"
            rel="noreferrer"
            className="w-fit text-[14px] text-[var(--ms-text-link)] hover:underline"
          >
            {t('reply_help_link')}
          </a>
        </section>

        {/* Другие политики */}
        <section className="flex flex-col gap-3">
          <SectionHeading>{t('policies_section')}</SectionHeading>
          <div className="flex flex-col gap-2.5">
            {POLICY_KEYS.map((key) => (
              <label
                key={key}
                className="flex w-fit cursor-pointer items-center gap-2 text-[14px] text-[var(--ms-text-primary)]"
              >
                <Checkbox
                  checked={form[key]}
                  onCheckedChange={(c) => set(key, c === true)}
                  data-testid={`company-settings-${key}`}
                />
                {t(`label_${key}` as 'label_checkShippingStock')}
                {(key === 'checkMinPrice' || key === 'showPositionAttributes') && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--ms-border-input)] text-[11px] text-[var(--ms-text-muted)]">
                    ?
                  </span>
                )}
              </label>
            ))}
          </div>
        </section>

        {/* Страна для базовых настроек */}
        <section className="flex flex-col gap-4">
          <SectionHeading>{t('country_section')}</SectionHeading>
          <NativeSelect
            value={form.accountCountry}
            onChange={(e) => set('accountCountry', e.target.value)}
            className="w-[300px]"
            data-testid="company-settings-country"
          >
            {!hasCurrentCountry && <option value={form.accountCountry}>{t('country_uz')}</option>}
            {countries.map((c) => (
              <option key={c.id} value={(c.code ?? '').toUpperCase()}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </section>
      </div>

      {/* «История изменений» drawer (audit diff of this page) */}
      <Drawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        title={tAudit('history_title')}
        widthClass="w-[920px]"
        // Faqat o'qiladigan audit tarixi — yo'qoladigan kiritma yo'q.
        dismissible
        testId="company-settings-history-drawer"
      >
        <div className="px-4 py-4">
          <HistoryTimeline
            entries={historyQuery.data?.items ?? []}
            emptyLabel={tAudit('history_empty')}
            translateAction={translateAction}
            translateField={translateField}
            translateValue={translateValue}
            fieldHeader={tAudit('field_col')}
            beforeHeader={tAudit('before_col')}
            afterHeader={tAudit('after_col')}
          />
        </div>
      </Drawer>
    </div>
  );
}
