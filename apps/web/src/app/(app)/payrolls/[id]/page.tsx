'use client';

/**
 * /payrolls/[id] — Ish haqi detail page.
 *
 * Locked when applicable (must unpost first to edit).
 * Inline line editor recomputes header sumMinor on every change.
 * "Yaratish → Naqd to'lov (CashOut)" creates a CashOut prefilled with the
 * net amount for the employee (manual settlement, not auto-cascade).
 */

import { AttachmentsSection } from '@/components/attachments-section';
import {
  type CreateMenuItem,
  DetailContentTabs,
  DetailHeader,
  DetailToolbar,
  DetailTotalsSidebar,
} from '@/components/document-detail';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useDetailNavigation } from '@/hooks/use-detail-navigation';
import { useSaveMutation } from '@/hooks/use-save-mutation';
import { useUnsavedGuard } from '@/hooks/use-unsaved-guard';
import { api } from '@/lib/api-client';
import { documentStateTone } from '@/lib/document-state-tone';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import {
  Alert,
  Avatar,
  Button,
  CatalogPicker,
  CatalogPickerField,
  DocumentMetaField,
  DocumentMetaPanel,
  DocumentMetaRow,
  Icons,
  Input,
  MoneyInput,
  NativeSelect,
  type PickerItem,
  formatDate,
} from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

// =========================================================================
// Types
// =========================================================================

interface PayrollLine {
  id: string;
  position: number;
  itemType: string;
  itemName: string;
  sumMinor: string;
  meta: Record<string, unknown> | null;
}

interface PayrollDetail {
  id: string;
  version: number;
  name: string;
  externalCode: string | null;
  state: string;
  applicable: boolean;
  moment: string;
  postedAt: string | null;
  description: string | null;
  periodStart: string;
  periodEnd: string;
  sumMinor: string;
  currency: string;
  organizationId: string;
  employeeId: string;
  organization: { id: string; name: string };
  employee: {
    id: string;
    name: string;
    fullName: string | null;
    position: string | null;
    inn: string | null;
  };
  owner: { id: string; name: string; email: string } | null;
  lines: PayrollLine[];
  createdAt: string;
  updatedAt: string;
}

interface LineDraft {
  _uid: string;
  itemType: string;
  itemName: string;
  /** Unsigned amount string. Sign is applied at submit via itemType. */
  sumMinorAbs: string;
}

interface FormState {
  organizationId: string;
  organizationLabel: string;
  employeeId: string;
  employeeLabel: string;
  periodStart: string;
  periodEnd: string;
  description: string;
  lines: LineDraft[];
}

type LineType =
  | 'salary'
  | 'bonus'
  | 'overtime'
  | 'vacation'
  | 'sick'
  | 'tax_income'
  | 'tax_social'
  | 'advance'
  | 'penalty'
  | 'other';

const DEDUCTION_TYPES: ReadonlySet<LineType> = new Set([
  'tax_income',
  'tax_social',
  'advance',
  'penalty',
]);

const LINE_TYPES: ReadonlyArray<{ value: LineType; isDeduction: boolean }> = [
  { value: 'salary', isDeduction: false },
  { value: 'bonus', isDeduction: false },
  { value: 'overtime', isDeduction: false },
  { value: 'vacation', isDeduction: false },
  { value: 'sick', isDeduction: false },
  { value: 'tax_income', isDeduction: true },
  { value: 'tax_social', isDeduction: true },
  { value: 'advance', isDeduction: true },
  { value: 'penalty', isDeduction: true },
  { value: 'other', isDeduction: false },
];

function genUid(): string {
  return `l-${Math.random().toString(36).slice(2, 10)}`;
}

function signedMinor(unsignedMinor: string, type: string): string {
  const abs = unsignedMinor.replace(/^[-+]/, '');
  if (!/^\d+$/.test(abs)) return '0';
  const isDeduction = DEDUCTION_TYPES.has(type as LineType);
  if (abs === '0') return '0';
  return isDeduction ? `-${abs}` : abs;
}

function fmtMoney(minor: string, currency = 'UZS'): string {
  if (!/^-?\d+$/.test(minor)) return '—';
  const negative = minor.startsWith('-');
  const abs = negative ? minor.slice(1) : minor;
  const padded = abs.padStart(3, '0');
  const whole = padded.slice(0, -2) || '0';
  const frac = padded.slice(-2);
  const wholeWithSep = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${negative ? '−' : ''}${wholeWithSep}.${frac} ${currency}`;
}

function formFromData(d: PayrollDetail): FormState {
  return {
    organizationId: d.organization.id,
    organizationLabel: d.organization.name,
    employeeId: d.employee.id,
    employeeLabel: d.employee.fullName || d.employee.name,
    periodStart: d.periodStart ? d.periodStart.slice(0, 10) : '',
    periodEnd: d.periodEnd ? d.periodEnd.slice(0, 10) : '',
    description: d.description ?? '',
    lines: d.lines.map((l) => ({
      _uid: genUid(),
      itemType: l.itemType,
      itemName: l.itemName,
      // Display unsigned — sign is recovered via itemType on submit
      sumMinorAbs: l.sumMinor.replace(/^-/, ''),
    })),
  };
}

function snapshot(s: FormState): string {
  return JSON.stringify({
    organizationId: s.organizationId,
    employeeId: s.employeeId,
    periodStart: s.periodStart,
    periodEnd: s.periodEnd,
    description: s.description,
    lines: s.lines.map((l) => ({
      itemType: l.itemType,
      itemName: l.itemName,
      sumMinorAbs: l.sumMinorAbs,
    })),
  });
}

// =========================================================================
// Component
// =========================================================================

export default function PayrollDetailPage() {
  const { id } = useParams<{ id: string }>();
  const detailNav = useDetailNavigation('payrolls', id);
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTranslations('pages.payroll');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailHeader = useTranslations('detail_header');
  const tStates = useTranslations('states.payroll');

  const { data, isLoading } = useQuery<PayrollDetail>({
    queryKey: ['payroll', id],
    queryFn: () => api.get(`/payrolls/${id}`),
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [original, setOriginal] = useState<string>('');
  const [openPicker, setOpenPicker] = useState<null | 'org' | 'emp'>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // On a stale-save 409, drop the local edit-state so the now-fresh `data`
  // re-seeds BOTH the header form and the lines via the init effect below.
  const onConflict = useConflictReload(['payroll', id], () => setForm(null));

  useEffect(() => {
    if (data && !form) {
      const init = formFromData(data);
      setForm(init);
      setOriginal(snapshot(init));
    }
  }, [data, form]);

  const isDirty = useMemo(() => (form ? snapshot(form) !== original : false), [form, original]);
  useUnsavedGuard(isDirty);

  // Live totals
  const earnings =
    form?.lines.reduce((acc, l) => {
      const big = BigInt(signedMinor(l.sumMinorAbs, l.itemType));
      return big > 0n ? acc + big : acc;
    }, 0n) ?? 0n;
  const deductions =
    form?.lines.reduce((acc, l) => {
      const big = BigInt(signedMinor(l.sumMinorAbs, l.itemType));
      return big < 0n ? acc + -big : acc;
    }, 0n) ?? 0n;
  const net = earnings - deductions;

  const transitionMut = useApiMutation({
    mutationFn: (target: string) => api.post(`/payrolls/${id}/transitions/${target}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll', id] });
      qc.invalidateQueries({ queryKey: ['payrolls'] });
    },
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/payrolls/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payrolls'] });
      router.push('/payrolls');
    },
  });

  const cloneMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/payrolls/${id}/clone`, {}),
    onSuccess: (clone) => {
      qc.invalidateQueries({ queryKey: ['payrolls'] });
      router.push(`/payrolls/${clone.id}`);
    },
  });

  const saveMut = useSaveMutation({
    mutationFn: async () => {
      if (!form || !data) throw new Error('Form not ready');
      if (form.lines.length === 0) throw new Error(t('err_min_one_line'));
      const trimmed = form.lines.filter((l) => l.itemName.trim() && l.sumMinorAbs !== '0');
      if (trimmed.length === 0) {
        throw new Error(t('err_min_one_payment_line'));
      }
      const payload: Record<string, unknown> = {
        // Optimistic-lock token — the version this form loaded (from the
        // server query `data`, NOT `form`, which has no version field).
        version: data.version,
        description: form.description || null,
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
        lines: trimmed.map((l) => ({
          itemType: l.itemType,
          itemName: l.itemName.trim(),
          sumMinor: signedMinor(l.sumMinorAbs, l.itemType),
        })),
      };
      if (data && !data.applicable) {
        payload.organizationId = form.organizationId;
        payload.employeeId = form.employeeId;
      }
      return api.patch(`/payrolls/${id}`, payload);
    },
    onSuccess: () => {
      setSaveError(null);
      qc.invalidateQueries({ queryKey: ['payroll', id] });
      qc.invalidateQueries({ queryKey: ['payrolls'] });
      if (form) setOriginal(snapshot(form));
    },
    onError: (err: Error) => {
      if (isOptimisticConflict(err)) return;
      setSaveError(err.message);
    },
    onConflict,
  });

  const { runDestructive } = useDestructiveMutation();

  // Fetchers
  const orgFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/organizations?search=${encodeURIComponent(s)}`,
    );
    return d.items.map((o) => ({ id: o.id, primary: o.name }));
  };
  const empFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{
      items: Array<{ id: string; name: string; fullName: string | null; position: string | null }>;
    }>(`/employees?search=${encodeURIComponent(s)}&limit=50`);
    return d.items.map((e) => ({
      id: e.id,
      primary: e.fullName || e.name,
      secondary: e.position ?? undefined,
    }));
  };

  // 404 (o'chirilgan hujjat yoki record-scope ko'rsatmaydigan yozuv) yuklash
  // TUGAGACH shu yerda tutiladi. Ilgari bu shart quyidagi loading-shoxidan
  // KEYIN turardi va HECH QACHON ishlamasdi (form faqat data kelganda
  // to'ladi) — sahifa abadiy «Yuklanmoqda…» bo'lib qolardi (MK40 brauzer-QA).
  if (!data)
    return isLoading ? (
      <div className="p-8 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>
    ) : (
      <div className="p-8 text-sm">{tCommon('not_found')}</div>
    );
  if (!form)
    return <div className="p-8 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;

  const editable = !data.applicable;

  const onToggleApplicable =
    data.state === 'cancelled'
      ? undefined
      : (next: boolean) => transitionMut.mutate(next ? 'post' : 'unpost');

  const addLine = () => {
    setForm(
      (s) =>
        s && {
          ...s,
          lines: [
            ...s.lines,
            { _uid: genUid(), itemType: 'other', itemName: '', sumMinorAbs: '0' },
          ],
        },
    );
  };
  const updateLine = (uid: string, patch: Partial<LineDraft>) => {
    setForm(
      (s) =>
        s && {
          ...s,
          lines: s.lines.map((l) => (l._uid === uid ? { ...l, ...patch } : l)),
        },
    );
  };
  const removeLine = (uid: string) => {
    setForm((s) => s && { ...s, lines: s.lines.filter((l) => l._uid !== uid) });
  };

  // "Yaratish" menu: spawn a CashOut prefilled with the employee + net amount
  const createMenuItems: CreateMenuItem[] = [
    {
      id: 'cashout',
      label: t('create_cashout'),
      onSelect: () => {
        // CashOut /new doesn't yet accept these prefill params natively; we
        // navigate plainly and the operator pastes the employee + amount.
        // When CashOut /new picks up ?agentId / ?sumMinor / ?description in
        // future, this becomes a one-click flow.
        router.push(
          `/cash-out/new?description=${encodeURIComponent(
            t('cashout_description', {
              name: data.name,
              employee: data.employee.fullName ?? data.employee.name,
            }),
          )}`,
        );
      },
      disabled: !data.applicable, // Only after payroll is posted
    },
  ];

  return (
    <div
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="payroll-detail-page"
    >
      <DetailToolbar
        isDirty={isDirty}
        isSaving={saveMut.isPending}
        onSave={() => saveMut.mutate()}
        onClose={() => router.push('/payrolls')}
        position={detailNav.position}
        onPrev={detailNav.onPrev}
        onNext={detailNav.onNext}
        apiData={data}
        onClone={() => cloneMut.mutate()}
        onDelete={
          editable
            ? () =>
                runDestructive({
                  title: tCommon('delete_confirm', { name: data.name }),
                  run: () => deleteMut.mutateAsync(),
                  successMessage: tCommon('saved'),
                })
            : undefined
        }
        createMenuItems={createMenuItems}
      />

      <DetailHeader
        titlePrefix={tDetailTitles('payroll')}
        name={data.name}
        moment={data.moment}
        stateLabel={tStates(data.state as 'draft' | 'posted' | 'cancelled')}
        stateTone={documentStateTone(data.state)}
        stateSlug={data.state}
        applicable={data.applicable}
        onToggleApplicable={onToggleApplicable}
        applicableBusy={transitionMut.isPending}
        pillsSlot={
          data.state !== 'cancelled' ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => transitionMut.mutate('cancel')}
              data-test-id="btn-cancel"
            >
              {t('cancel_doc')}
            </Button>
          ) : undefined
        }
        authorSlot={
          <div className="flex flex-col items-end gap-1 text-xs">
            <div className="flex items-center gap-2">
              <Avatar
                name={data.owner?.name ?? '—'}
                size="md"
                data-test-id="detail-header-author-avatar"
              />
              <div className="flex flex-col leading-tight">
                <div
                  className="font-medium text-[var(--ms-text-primary)]"
                  data-test-id="detail-header-owner"
                >
                  {data.owner?.name ?? '—'}
                </div>
                <div
                  className="text-[var(--ms-text-muted)]"
                  data-test-id="detail-header-owner-role"
                >
                  {tDetailHeader('role_primary')}
                </div>
              </div>
            </div>
            <div className="text-[var(--ms-text-muted)]" data-test-id="detail-header-updated">
              {tDetailHeader('changed')}: {data.owner?.name ?? '—'} {formatDate(data.updatedAt)}
            </div>
          </div>
        }
      />

      <main className="flex-1 px-4 py-4">
        {transitionMut.error && (
          <Alert tone="destructive" className="mb-3">
            {(transitionMut.error as Error).message}
          </Alert>
        )}
        {saveError && (
          <Alert tone="destructive" className="mb-3">
            {saveError}
          </Alert>
        )}
        {data.applicable && (
          <Alert tone="info" className="mb-3">
            {tCommon('locked_when_posted')}
          </Alert>
        )}

        <DocumentMetaPanel>
          <DocumentMetaRow>
            <DocumentMetaField label={tFields('organization')} required>
              <CatalogPickerField
                value={
                  form.organizationId
                    ? { id: form.organizationId, label: form.organizationLabel }
                    : null
                }
                placeholder={tFields('organization')}
                onPick={() => editable && setOpenPicker('org')}
                onClear={() =>
                  editable &&
                  setForm((s) => s && { ...s, organizationId: '', organizationLabel: '' })
                }
                disabled={!editable}
                testId="field-organization"
              />
            </DocumentMetaField>
            <DocumentMetaField label={t('employee')} required>
              <CatalogPickerField
                value={form.employeeId ? { id: form.employeeId, label: form.employeeLabel } : null}
                placeholder={t('employee')}
                onPick={() => editable && setOpenPicker('emp')}
                onClear={() =>
                  editable && setForm((s) => s && { ...s, employeeId: '', employeeLabel: '' })
                }
                disabled={!editable}
                testId="field-employee"
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow>
            <DocumentMetaField label={t('period_start')} required>
              <Input
                type="date"
                value={form.periodStart}
                onChange={(e) => setForm((s) => s && { ...s, periodStart: e.target.value })}
                disabled={!editable}
                data-test-id="field-period-start"
              />
            </DocumentMetaField>
            <DocumentMetaField label={t('period_end')} required>
              <Input
                type="date"
                value={form.periodEnd}
                onChange={(e) => setForm((s) => s && { ...s, periodEnd: e.target.value })}
                disabled={!editable}
                data-test-id="field-period-end"
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow>
            <DocumentMetaField label={tFields('description')}>
              <Input
                value={form.description}
                onChange={(e) => setForm((s) => s && { ...s, description: e.target.value })}
                disabled={!editable}
                data-test-id="field-description"
              />
            </DocumentMetaField>
            <DocumentMetaField label={t('posted_at')}>
              <Input
                value={data.postedAt ? formatDate(data.postedAt) : ''}
                disabled
                placeholder="—"
              />
            </DocumentMetaField>
          </DocumentMetaRow>
        </DocumentMetaPanel>

        <div className="mt-4">
          <DetailContentTabs
            auditEntity="Payroll"
            entityId={data.id}
            relatedGroups={[]}
            positionsLabel={t('lines')}
            filesSlot={<AttachmentsSection entity="Payroll" entityId={data.id} />}
          >
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0">
                {/* Lines editor */}
                <div
                  className="overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]"
                  data-test-id="payroll-lines"
                >
                  <div className="flex items-center justify-between border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-muted)] px-4 py-2">
                    <span className="font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                      {t('lines')} — {form.lines.length}
                    </span>
                    {editable && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={addLine}
                        data-test-id="btn-add-line"
                      >
                        <Icons.create className="h-3.5 w-3.5" />
                        {t('add_line')}
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-[180px_1fr_180px_40px] gap-2 border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-muted)] px-4 py-1.5 font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                    <div>{t('line_type')}</div>
                    <div>{t('line_name')}</div>
                    <div className="text-right">{t('line_sum')}</div>
                    <div />
                  </div>

                  {form.lines.map((l) => {
                    const isDeduction = DEDUCTION_TYPES.has(l.itemType as LineType);
                    return (
                      <div
                        key={l._uid}
                        className="grid grid-cols-[180px_1fr_180px_40px] items-center gap-2 border-[var(--ms-border-default)] border-b px-4 py-2 last:border-b-0"
                      >
                        <NativeSelect
                          value={l.itemType}
                          onChange={(e) => updateLine(l._uid, { itemType: e.target.value })}
                          disabled={!editable}
                          className="w-auto"
                        >
                          {LINE_TYPES.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {t(`type_${opt.value}` as 'type_salary')}
                              {opt.isDeduction ? ' (−)' : ''}
                            </option>
                          ))}
                          {/* Allow custom itemType strings from backend (unknown enum value) */}
                          {!LINE_TYPES.some((o) => o.value === l.itemType) && (
                            <option value={l.itemType}>{l.itemType}</option>
                          )}
                        </NativeSelect>
                        <Input
                          value={l.itemName}
                          onChange={(e) => updateLine(l._uid, { itemName: e.target.value })}
                          placeholder={t('line_name_placeholder')}
                          disabled={!editable}
                        />
                        <div className="flex flex-col items-end">
                          <MoneyInput
                            valueMinor={l.sumMinorAbs}
                            onChangeMinor={(v) => updateLine(l._uid, { sumMinorAbs: v })}
                            disabled={!editable}
                            className={`text-right tabular-nums ${
                              isDeduction ? 'text-[var(--ms-text-destructive)]' : ''
                            }`}
                          />
                          <span className="mt-0.5 text-[10px] text-[var(--ms-text-muted)]">
                            {fmtMoney(signedMinor(l.sumMinorAbs, l.itemType), data.currency)}
                          </span>
                        </div>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => removeLine(l._uid)}
                          disabled={!editable}
                          aria-label={t('remove_line')}
                        >
                          <Icons.close className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}

                  <div className="grid grid-cols-3 gap-4 border-[var(--ms-border-default)] border-t bg-[var(--ms-bg-muted)] px-4 py-2 text-sm">
                    <div>
                      <div className="text-[var(--ms-text-muted)] text-xs">{t('earnings')}</div>
                      <div className="font-medium tabular-nums">
                        {fmtMoney(earnings.toString(), data.currency)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--ms-text-muted)] text-xs">{t('deductions')}</div>
                      <div className="font-medium text-[var(--ms-text-destructive)] tabular-nums">
                        −{fmtMoney(deductions.toString(), data.currency).replace(/^−/, '')}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[var(--ms-text-muted)] text-xs">{t('net_total')}</div>
                      <div
                        className={`font-medium text-base tabular-nums ${
                          net < 0n
                            ? 'text-[var(--ms-text-destructive)]'
                            : 'text-[var(--ms-text-primary)]'
                        }`}
                      >
                        {fmtMoney(net.toString(), data.currency)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <DetailTotalsSidebar
                subtotalMinor={earnings.toString()}
                vatMinor="0"
                vatEnabled={false}
                vatIncluded={false}
                totalMinor={net.toString()}
                totalQty={form.lines.length}
                readOnly
                onToggleVatEnabled={() => {}}
                onToggleVatIncluded={() => {}}
              />
            </div>
          </DetailContentTabs>
        </div>
      </main>

      <CatalogPicker
        open={openPicker === 'org'}
        onClose={() => setOpenPicker(null)}
        title={tFields('organization')}
        fetcher={orgFetcher}
        onSelect={(item) =>
          setForm(
            (s) => s && { ...s, organizationId: item.id, organizationLabel: String(item.primary) },
          )
        }
      />
      <CatalogPicker
        open={openPicker === 'emp'}
        onClose={() => setOpenPicker(null)}
        title={t('employee')}
        fetcher={empFetcher}
        onSelect={(item) =>
          setForm((s) => s && { ...s, employeeId: item.id, employeeLabel: String(item.primary) })
        }
      />
    </div>
  );
}
