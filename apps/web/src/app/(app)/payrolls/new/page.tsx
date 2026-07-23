'use client';

/**
 * /payrolls/new — Yangi ish haqi hujjati.
 *
 * Layout:
 *   - Header: org + employee picker + period (start/end)
 *   - Custom PayrollLineEditor: inline rows with itemType / itemName / sumMinor
 *     Live totals: earnings (positive lines), deductions (|negative|), net
 *   - Standard description + totals panel
 *
 * Net total is derived live from lines (signed sum). Server recomputes
 * the same way on POST, so the UI total is a preview — backend is the
 * source of truth.
 */

import { useDocumentEditorLabels } from '@/hooks/use-document-editor-labels';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import {
  Button,
  CatalogPicker,
  CatalogPickerField,
  DocumentEditor,
  DocumentMetaField,
  DocumentMetaPanel,
  DocumentMetaRow,
  Icons,
  Input,
  MoneyInput,
  NativeSelect,
  type PickerItem,
  Textarea,
  formatIso,
} from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
interface RefItem {
  id: string;
  name: string;
  fullName?: string | null;
  position?: string | null;
}

interface PayrollLineDraft {
  _uid: string;
  itemType: string;
  itemName: string;
  /** Signed BigInt string. UI lets user type unsigned amount + toggle sign via the type dropdown. */
  sumMinor: string;
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

/**
 * Make a signed sumMinor BigInt string from an unsigned amount and a line type.
 * Earnings stay positive; deduction types flip sign.
 */
function signedMinor(unsignedMinor: string, type: string): string {
  const abs = unsignedMinor.replace(/^[-+]/, '');
  if (!/^\d+$/.test(abs)) return '0';
  const isDeduction = DEDUCTION_TYPES.has(type as LineType);
  if (abs === '0') return '0';
  return isDeduction ? `-${abs}` : abs;
}

/** Walk digits to convert BigInt string to a human display "1 234.56 UZS" form. */
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

export default function NewPayrollPage() {
  const router = useRouter();
  const { user } = useAuth();
  const t = useTranslations('pages.payroll');
  const tForm = useTranslations('form');
  const tFields = useTranslations('fields');
  const tStates = useTranslations('states.payroll');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailHeader = useTranslations('detail_header');
  const docEditorLabels = useDocumentEditorLabels();

  const STATUS_OPTIONS = [
    { value: 'draft', label: tStates('draft'), color: '#e8eef5' },
    { value: 'posted', label: tStates('posted'), color: '#cfe8d3' },
    { value: 'cancelled', label: tStates('cancelled'), color: '#f4d4d4' },
  ];

  const { data: orgsData } = useQuery<{ items: RefItem[] }>({
    queryKey: ['organizations'],
    queryFn: () => api.get('/organizations'),
  });

  // Header
  const [docNumber, setDocNumber] = useState('');
  const [docDate, setDocDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [status, setStatus] = useState<string>('draft');
  const [applicable, setApplicable] = useState(true);

  // Meta
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationLabel, setOrganizationLabel] = useState('');
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [employeeLabel, setEmployeeLabel] = useState('');
  // Default to current month
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const isoDate = (d: Date) => formatIso(d);
  const [periodStart, setPeriodStart] = useState(isoDate(firstOfMonth));
  const [periodEnd, setPeriodEnd] = useState(isoDate(lastOfMonth));
  const [description, setDescription] = useState('');

  // Lines
  const [lines, setLines] = useState<PayrollLineDraft[]>([
    { _uid: genUid(), itemType: 'salary', itemName: '', sumMinor: '0' },
  ]);

  // Picker state
  const [openPicker, setOpenPicker] = useState<null | 'org' | 'emp'>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-fill first organization
  useEffect(() => {
    if (orgsData?.items[0] && !organizationId) {
      setOrganizationId(orgsData.items[0].id);
      setOrganizationLabel(orgsData.items[0].name);
    }
  }, [orgsData, organizationId]);

  // Live totals
  const earnings = lines.reduce((acc, l) => {
    const big = BigInt(signedMinor(l.sumMinor, l.itemType));
    return big > 0n ? acc + big : acc;
  }, 0n);
  const deductions = lines.reduce((acc, l) => {
    const big = BigInt(signedMinor(l.sumMinor, l.itemType));
    return big < 0n ? acc + -big : acc;
  }, 0n);
  const net = earnings - deductions;

  // Fetchers
  const orgFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(`/organizations?search=${encodeURIComponent(s)}`);
    return d.items.map((o) => ({ id: o.id, primary: o.name }));
  };
  const empFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(
      `/employees?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((e) => ({
      id: e.id,
      primary: e.fullName || e.name,
      secondary: e.position ?? undefined,
    }));
  };

  const addLine = (defaultType: LineType = 'other') => {
    setLines((arr) => [
      ...arr,
      { _uid: genUid(), itemType: defaultType, itemName: '', sumMinor: '0' },
    ]);
  };
  const updateLine = (uid: string, patch: Partial<PayrollLineDraft>) => {
    setLines((arr) => arr.map((l) => (l._uid === uid ? { ...l, ...patch } : l)));
  };
  const removeLine = (uid: string) => {
    setLines((arr) => arr.filter((l) => l._uid !== uid));
  };

  const createMut = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error(tForm('select_organization'));
      if (!employeeId) throw new Error(tForm('select_employee'));
      if (!periodStart || !periodEnd) throw new Error(t('select_period'));
      if (new Date(periodStart) > new Date(periodEnd)) {
        throw new Error(t('err_period_order'));
      }
      if (lines.length === 0) throw new Error(t('err_min_one_line'));
      // Filter empty lines (sumMinor=0) — UX kindness. But keep at least one.
      const trimmed = lines.filter((l) => l.itemName.trim() && l.sumMinor !== '0');
      if (trimmed.length === 0) {
        throw new Error(t('err_min_one_payment_line'));
      }
      return api.post<{ id: string }>('/payrolls', {
        organizationId,
        employeeId,
        periodStart,
        periodEnd,
        moment: docDate ? new Date(docDate).toISOString() : undefined,
        applicable,
        description: description || undefined,
        lines: trimmed.map((l) => ({
          itemType: l.itemType,
          itemName: l.itemName.trim(),
          sumMinor: signedMinor(l.sumMinor, l.itemType),
        })),
      });
    },
    onSuccess: (created) => router.push(`/payrolls/${created.id}`),
    onError: (err: Error) => setError(err.message),
  });

  return (
    <>
      <DocumentEditor
        {...docEditorLabels}
        testId="payroll-new-page"
        documentTypeLabel={tDetailTitles('payroll')}
        number={docNumber}
        onNumberChange={setDocNumber}
        date={docDate}
        onDateChange={setDocDate}
        status={status}
        statusOptions={STATUS_OPTIONS}
        onStatusChange={setStatus}
        applicable={applicable}
        onApplicableChange={setApplicable}
        applicableHelp={t('applicable_help')}
        onSave={() => {
          setError(null);
          createMut.mutate();
        }}
        saving={createMut.isPending}
        onClose={() => router.push('/payrolls')}
        modifyMenu={[]}
        createDocMenu={[]}
        printMenu={[]}
        sendMenu={[]}
        rightSlot={
          user ? (
            <div className="text-right text-xs leading-tight">
              <div className="font-medium text-[var(--ms-text-primary)]">{user.name}</div>
              <div className="text-[var(--ms-text-muted)]">
                {user.position ?? tDetailHeader('role_primary')}
              </div>
            </div>
          ) : null
        }
        error={error}
        onErrorRetry={() => {
          setError(null);
          createMut.mutate();
        }}
      >
        <div className="space-y-4">
          <DocumentMetaPanel compact>
            <DocumentMetaRow>
              <DocumentMetaField label={tFields('organization')} required>
                <CatalogPickerField
                  value={organizationId ? { id: organizationId, label: organizationLabel } : null}
                  placeholder={tForm('select_organization')}
                  onPick={() => setOpenPicker('org')}
                  onClear={() => {
                    setOrganizationId(null);
                    setOrganizationLabel('');
                  }}
                />
              </DocumentMetaField>
              <DocumentMetaField label={t('employee')} required>
                <CatalogPickerField
                  value={employeeId ? { id: employeeId, label: employeeLabel } : null}
                  placeholder={tForm('select_employee')}
                  onPick={() => setOpenPicker('emp')}
                  onClear={() => {
                    setEmployeeId(null);
                    setEmployeeLabel('');
                  }}
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            <DocumentMetaRow>
              <DocumentMetaField label={t('period_start')} required>
                <Input
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  data-test-id="field-period-start"
                />
              </DocumentMetaField>
              <DocumentMetaField label={t('period_end')} required>
                <Input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  data-test-id="field-period-end"
                />
              </DocumentMetaField>
            </DocumentMetaRow>
          </DocumentMetaPanel>

          {/* Payroll lines editor — inline rows */}
          <div
            className="overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]"
            data-test-id="payroll-lines"
          >
            <div className="flex items-center justify-between border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-muted)] px-4 py-2">
              <span className="font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                {t('lines')}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => addLine('other')}
                data-test-id="btn-add-line"
              >
                <Icons.create className="h-3.5 w-3.5" />
                {t('add_line')}
              </Button>
            </div>

            <div className="grid grid-cols-[180px_1fr_180px_40px] gap-2 border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-muted)] px-4 py-1.5 font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
              <div>{t('line_type')}</div>
              <div>{t('line_name')}</div>
              <div className="text-right">{t('line_sum')}</div>
              <div />
            </div>

            {lines.map((l) => {
              const isDeduction = DEDUCTION_TYPES.has(l.itemType as LineType);
              return (
                <div
                  key={l._uid}
                  className="grid grid-cols-[180px_1fr_180px_40px] items-center gap-2 border-[var(--ms-border-default)] border-b px-4 py-2 last:border-b-0"
                  data-test-id={`payroll-line-${l._uid}`}
                >
                  <NativeSelect
                    value={l.itemType}
                    onChange={(e) => updateLine(l._uid, { itemType: e.target.value })}
                    className="w-auto"
                  >
                    {LINE_TYPES.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {t(`type_${opt.value}` as 'type_salary')}
                        {opt.isDeduction ? ' (−)' : ''}
                      </option>
                    ))}
                  </NativeSelect>
                  <Input
                    value={l.itemName}
                    onChange={(e) => updateLine(l._uid, { itemName: e.target.value })}
                    placeholder={t('line_name_placeholder')}
                    data-test-id={`line-name-${l._uid}`}
                  />
                  <div className="flex flex-col items-end">
                    <MoneyInput
                      valueMinor={l.sumMinor.replace(/^-/, '')}
                      onChangeMinor={(v) => updateLine(l._uid, { sumMinor: v })}
                      className={`text-right tabular-nums ${
                        isDeduction ? 'text-[var(--ms-text-destructive)]' : ''
                      }`}
                      data-test-id={`line-sum-${l._uid}`}
                    />
                    <span className="mt-0.5 text-[10px] text-[var(--ms-text-muted)]">
                      {fmtMoney(signedMinor(l.sumMinor, l.itemType))}
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => removeLine(l._uid)}
                    aria-label={t('remove_line')}
                  >
                    <Icons.close className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}

            {/* Totals footer */}
            <div className="grid grid-cols-3 gap-4 border-[var(--ms-border-default)] border-t bg-[var(--ms-bg-muted)] px-4 py-2 text-sm">
              <div>
                <div className="text-[var(--ms-text-muted)] text-xs">{t('earnings')}</div>
                <div className="font-medium tabular-nums">{fmtMoney(earnings.toString())}</div>
              </div>
              <div>
                <div className="text-[var(--ms-text-muted)] text-xs">{t('deductions')}</div>
                <div className="font-medium tabular-nums text-[var(--ms-text-destructive)]">
                  −{fmtMoney(deductions.toString()).replace(/^−/, '')}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[var(--ms-text-muted)] text-xs">{t('net_total')}</div>
                <div
                  className={`text-base font-medium tabular-nums ${
                    net < 0n ? 'text-[var(--ms-text-destructive)]' : 'text-[var(--ms-text-primary)]'
                  }`}
                >
                  {fmtMoney(net.toString())}
                </div>
              </div>
            </div>
          </div>

          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={tFields('description')}
            rows={3}
            data-test-id="field-description"
          />
        </div>
      </DocumentEditor>

      <CatalogPicker
        open={openPicker === 'org'}
        onClose={() => setOpenPicker(null)}
        title={tForm('organization_picker_title')}
        fetcher={orgFetcher}
        onSelect={(item) => {
          setOrganizationId(item.id);
          setOrganizationLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'emp'}
        onClose={() => setOpenPicker(null)}
        title={tForm('employee_picker_title')}
        fetcher={empFetcher}
        onSelect={(item) => {
          setEmployeeId(item.id);
          setEmployeeLabel(String(item.primary));
        }}
      />
    </>
  );
}
