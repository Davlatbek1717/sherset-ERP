'use client';

import { api } from '@/lib/api-client';
import { bankImportStateTone, moneyFlowTone } from '@/lib/domain-status-tone';
import {
  Alert,
  Badge,
  Button,
  CatalogPicker,
  CatalogPickerField,
  Container,
  FormField,
  FormSection,
  Icons,
  Input,
  PageHeader,
  type PickerItem,
  StickyHScroll,
  Textarea,
  formatDate,
  formatMoney,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface RefItem {
  id: string;
  name: string;
  legalTitle?: string | null;
}
interface StatementRow {
  id: string;
  lineNumber: number;
  direction: 'in' | 'out';
  moment: string;
  amountMinor: string;
  currency: string;
  counterpartyName: string | null;
  counterpartyInn: string | null;
  counterpartyAccount: string | null;
  paymentPurpose: string | null;
  documentNumber: string | null;
  matchedCounterpartyId: string | null;
  matchReason: 'inn' | 'account' | 'manual' | null;
  matchedCounterparty: { id: string; name: string; legalTitle: string | null } | null;
  paymentInId: string | null;
  paymentOutId: string | null;
  paymentIn: { id: string; name: string; state: string } | null;
  paymentOut: { id: string; name: string; state: string } | null;
  error: string | null;
  skipped: boolean;
}

interface Statement {
  id: string;
  filename: string;
  state: string;
  rowCountTotal: number;
  rowCountMatched: number;
  rowCountImported: number;
  createdAt: string;
  rows: StatementRow[];
  /**
   * Faza 20 (INT-05) — upload javobi: aynan shu mazmunli fayl ilgari
   * yuklangan bo'lsa, o'sha vypiska. Yuklash bloklanmaydi, lekin operator
   * ogohlantiriladi (dublikat qatorlar commit'da rad etiladi).
   */
  duplicateOf?: {
    id: string;
    filename: string;
    createdAt: string;
    rowCountImported: number;
    state: string;
  } | null;
}

export default function BankImportPage() {
  const qc = useQueryClient();
  const t = useTranslations('pages.bank_import');
  const tCommon = useTranslations('common');

  const [filename, setFilename] = useState('');
  const [csvText, setCsvText] = useState('');
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationLabel, setOrganizationLabel] = useState('');
  const [openPicker, setOpenPicker] = useState<null | 'org' | { kind: 'agent'; rowId: string }>(
    null,
  );
  const [statement, setStatement] = useState<Statement | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const { data: orgsData } = useQuery<{ items: RefItem[] }>({
    queryKey: ['organizations'],
    queryFn: () => api.get('/organizations'),
  });

  const history = useQuery<{ items: Statement[] }>({
    queryKey: ['bank-statements'],
    queryFn: () => api.get('/bank-import'),
  });

  const uploadMut = useMutation({
    mutationFn: async () =>
      api.post<Statement>('/bank-import', {
        filename: filename || 'statement.csv',
        format: 'csv',
        content: csvText,
      }),
    onSuccess: (stm) => {
      setStatement(stm);
      qc.invalidateQueries({ queryKey: ['bank-statements'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const commitMut = useMutation({
    mutationFn: async () => {
      if (!statement) throw new Error(t('empty'));
      if (!organizationId) throw new Error('Tashkilot tanlang');
      return api.post<{
        statementId: string;
        total: number;
        succeeded: string[];
        failed: Array<{ rowId: string; error: string }>;
      }>(`/bank-import/${statement.id}/commit`, {
        organizationId,
        counterpartyOverrides: Object.keys(overrides).length > 0 ? overrides : undefined,
      });
    },
    onSuccess: async () => {
      if (statement) {
        const fresh = await api.get<Statement>(`/bank-import/${statement.id}`);
        setStatement(fresh);
      }
      qc.invalidateQueries({ queryKey: ['bank-statements'] });
      qc.invalidateQueries({ queryKey: ['payments-in'] });
      qc.invalidateQueries({ queryKey: ['payments-out'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const handleFileRead = async (file: File) => {
    setFilename(file.name);
    const text = await file.text();
    setCsvText(text);
  };

  const orgFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(`/organizations?search=${encodeURIComponent(s)}`);
    return d.items.map((o) => ({
      id: o.id,
      primary: o.name,
      secondary: o.legalTitle ?? undefined,
    }));
  };
  const agentFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{
      items: Array<{ id: string; name: string; legalTitle: string | null }>;
    }>(`/counterparties?search=${encodeURIComponent(s)}&limit=50`);
    return d.items.map((c) => ({
      id: c.id,
      primary: c.name,
      secondary: c.legalTitle ?? undefined,
    }));
  };

  const matchedCount = statement
    ? statement.rows.filter((r) => r.matchedCounterpartyId || overrides[r.id]).length
    : 0;
  const errorCount = statement ? statement.rows.filter((r) => r.error).length : 0;
  const committableCount = statement
    ? statement.rows.filter(
        (r) =>
          !r.paymentInId &&
          !r.paymentOutId &&
          !r.error &&
          (r.matchedCounterpartyId || overrides[r.id]),
      ).length
    : 0;

  const commitFailures = commitMut.data?.failed ?? [];
  const rowLineNumber = (rowId: string) =>
    statement?.rows.find((r) => r.id === rowId)?.lineNumber ?? '—';

  // Default-pick the first org once loaded.
  if (orgsData?.items[0] && !organizationId) {
    setOrganizationId(orgsData.items[0].id);
    setOrganizationLabel(orgsData.items[0].name);
  }

  return (
    <Container className="space-y-4 py-4" data-test-id="bank-import-page">
      <PageHeader title={t('title')} />

      {error && <Alert tone="destructive">{error}</Alert>}

      {statement?.duplicateOf && (
        <Alert tone="warning" data-test-id="duplicate-statement-warning">
          {t('duplicate_warning', {
            filename: statement.duplicateOf.filename,
            date: formatDate(statement.duplicateOf.createdAt),
            imported: statement.duplicateOf.rowCountImported,
          })}
        </Alert>
      )}

      {/*
        Commit natijasidagi rad etilgan qatorlar. Ilgari `failed` umuman
        ko'rsatilmasdi — operator «Hujjatlarni yaratish»ni bosib hech narsa
        sodir bo'lmaganini ko'rardi. Faza 20 dedup'i aynan shu ro'yxat orqali
        gapiradi, shuning uchun ko'rinishi shart.
      */}
      {commitFailures.length > 0 && (
        <Alert
          tone="warning"
          title={t('commit_failed_title', { count: commitFailures.length })}
          data-test-id="commit-failures"
        >
          <ul className="list-disc space-y-0.5 pl-4 text-xs">
            {commitFailures.map((f) => (
              <li key={f.rowId}>
                {t('col_line')} {rowLineNumber(f.rowId)}: {f.error}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <FormSection title={t('upload_label')}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField id="filename" label="Fayl nomi">
            <Input
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="statement.csv"
            />
          </FormField>
          <FormField id="organization" label="Tashkilot">
            <CatalogPickerField
              value={organizationId ? { id: organizationId, label: organizationLabel } : null}
              placeholder="Tashkilot tanlang"
              onPick={() => setOpenPicker('org')}
              onClear={() => {
                setOrganizationId(null);
                setOrganizationLabel('');
              }}
              testId="field-organization"
            />
          </FormField>
        </div>

        <div className="space-y-2">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFileRead(f);
            }}
            data-test-id="file-input"
            className="block w-full text-sm"
          />
          <Textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            className="min-h-[160px] w-full rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] p-2 font-mono text-xs"
            placeholder="date,amount,direction,counterparty_inn,counterparty_name,payment_purpose&#10;2026-04-24,1000000,in,123456789,Alpha LLC,Payment"
            data-test-id="csv-textarea"
          />
        </div>

        <Button
          onClick={() => {
            setError(null);
            // Oldingi commit natijasi yangi vypiskaga tegishli emas.
            commitMut.reset();
            uploadMut.mutate();
          }}
          loading={uploadMut.isPending}
          disabled={!csvText.trim()}
          data-test-id="upload-button"
        >
          <Icons.create className="h-4 w-4" />
          {t('upload_button')}
        </Button>
      </FormSection>

      {statement && (
        <FormSection
          title={t('preview_title', { total: statement.rowCountTotal })}
          description={
            <span className="flex gap-3 text-xs">
              <span className="text-[var(--ms-text-brand)]">
                {t('preview_matched', { matched: matchedCount })}
              </span>
              {errorCount > 0 && (
                <span className="text-[var(--ms-text-destructive)]">
                  {t('preview_errors', { errors: errorCount })}
                </span>
              )}
            </span>
          }
        >
          <StickyHScroll className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--ms-bg-muted)]">
                <tr>
                  <th className="h-8 w-12 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                    {t('col_line')}
                  </th>
                  <th className="h-8 w-20 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                    {t('col_direction')}
                  </th>
                  <th className="h-8 w-28 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                    {t('col_date')}
                  </th>
                  <th className="h-8 w-36 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                    {t('col_amount')}
                  </th>
                  <th className="h-8 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                    {t('col_agent')}
                  </th>
                  <th className="h-8 w-44 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                    {t('col_match')}
                  </th>
                  <th className="h-8 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                    {t('col_purpose')}
                  </th>
                  <th className="h-8 w-28 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                    {t('col_result')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {statement.rows.map((r) => {
                  const overrideId = overrides[r.id];
                  const effectiveCp = overrideId ?? r.matchedCounterpartyId;
                  const cpLabel = overrideId ? 'Manual' : (r.matchedCounterparty?.name ?? '—');
                  return (
                    <tr
                      key={r.id}
                      className="border-[var(--ms-border-default)] border-t"
                      data-test-id={`row-${r.id}`}
                    >
                      <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                        {r.lineNumber}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={moneyFlowTone(r.direction)}>
                          {t(r.direction === 'in' ? 'direction_in' : 'direction_out')}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs">{formatDate(r.moment)}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {formatMoney(r.amountMinor)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-sm">{r.counterpartyName ?? '—'}</div>
                        <div className="text-[var(--ms-text-muted)] text-xs">
                          {r.counterpartyInn && `STIR: ${r.counterpartyInn}`}
                          {r.counterpartyInn && r.counterpartyAccount && ' · '}
                          {r.counterpartyAccount && `Hisob: ${r.counterpartyAccount}`}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {effectiveCp ? (
                          <div>
                            <div className="text-sm">{cpLabel}</div>
                            <div className="text-[var(--ms-text-muted)] text-xs">
                              {r.matchReason === 'inn' && t('matched_inn')}
                              {r.matchReason === 'account' && t('matched_account')}
                              {overrideId && 'Manual'}
                            </div>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            variant="link"
                            className="h-auto px-0 font-normal text-xs"
                            onClick={() => setOpenPicker({ kind: 'agent', rowId: r.id })}
                            data-test-id={`pick-agent-${r.id}`}
                          >
                            + {t('unmatched')}
                          </Button>
                        )}
                      </td>
                      <td className="max-w-[240px] truncate px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                        {r.paymentPurpose ?? '—'}
                      </td>
                      <td className="px-3 py-2">
                        {r.error ? (
                          <Badge tone="destructive">{t('error_badge')}</Badge>
                        ) : r.paymentIn || r.paymentOut ? (
                          <Badge tone="success">{t('imported_badge')}</Badge>
                        ) : (
                          <span className="text-[var(--ms-text-muted)] text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </StickyHScroll>

          <Button
            onClick={() => {
              setError(null);
              commitMut.mutate();
            }}
            loading={commitMut.isPending}
            disabled={committableCount === 0 || !organizationId}
            data-test-id="commit-button"
          >
            <Icons.create className="h-4 w-4" />
            {t('commit_button', { count: committableCount })}
          </Button>
        </FormSection>
      )}

      <FormSection title={t('history_title')}>
        {history.data?.items.length === 0 ? (
          <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] border-dashed py-6 text-center text-[var(--ms-text-muted)] text-sm">
            {t('empty')}
          </div>
        ) : (
          <div className="overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--ms-bg-muted)]">
                <tr>
                  <th className="h-8 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                    Fayl
                  </th>
                  <th className="h-8 w-36 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                    {tCommon('created')}
                  </th>
                  <th className="h-8 w-20 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                    Qator
                  </th>
                  <th className="h-8 w-20 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                    Topildi
                  </th>
                  <th className="h-8 w-20 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                    Yaratildi
                  </th>
                  <th className="h-8 w-28 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                    Holat
                  </th>
                </tr>
              </thead>
              <tbody>
                {(history.data?.items ?? []).map((s) => (
                  <tr key={s.id} className="border-[var(--ms-border-default)] border-t">
                    <td className="px-3 py-2 font-medium">{s.filename}</td>
                    <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                      {formatDate(s.createdAt)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.rowCountTotal}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.rowCountMatched}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.rowCountImported}</td>
                    <td className="px-3 py-2">
                      <Badge tone={bankImportStateTone(s.state)}>
                        {s.state === 'parsed' || s.state === 'committed' || s.state === 'cancelled'
                          ? t(`status_${s.state}`)
                          : s.state}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </FormSection>

      <CatalogPicker
        open={openPicker === 'org'}
        onClose={() => setOpenPicker(null)}
        title="Tashkilotni tanlash"
        fetcher={orgFetcher}
        onSelect={(item) => {
          setOrganizationId(item.id);
          setOrganizationLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={typeof openPicker === 'object' && openPicker !== null && openPicker.kind === 'agent'}
        onClose={() => setOpenPicker(null)}
        title="Kontragentni tanlash"
        fetcher={agentFetcher}
        onSelect={(item) => {
          if (typeof openPicker !== 'object' || openPicker === null) return;
          setOverrides((xs) => ({ ...xs, [openPicker.rowId]: item.id }));
        }}
      />
    </Container>
  );
}
