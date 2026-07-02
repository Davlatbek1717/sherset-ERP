'use client';

import { api } from '@/lib/api-client';
import { Button, Container, NativeSelect, PageHeader, Wizard, type WizardStep } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, useMemo, useState } from 'react';

// Logical fields the operator can map their CSV columns to. The set mirrors
// CreateCounterpartySchema (apps/api/src/modules/counterparty/counterparty.schema.ts:34)
// minus structured fields like uzRequisites which need a dedicated screen.
const FIELD_KEYS = [
  'name',
  'legalTitle',
  'legalAddress',
  'companyType',
  'email',
  'phone',
  'description',
  'code',
] as const;
type FieldKey = (typeof FIELD_KEYS)[number];

type FieldMap = Partial<Record<FieldKey, string>>;

interface ParsedRow {
  values: Record<string, string>;
  /** 1-based source row number for error reporting (header is row 1). */
  sourceLine: number;
}

interface ImportResult {
  total: number;
  inserted: Array<{ index: number; result: { id: string; name: string } }>;
  failed: Array<{ index: number; error: string }>;
}

// Mirrors CompanyTypeSchema in apps/api/src/modules/counterparty/counterparty.schema.ts:16.
// Update this list whenever the enum on the API side gains a value.
const COMPANY_TYPES = [
  'legalUZ',
  'entrepreneurUZ',
  'individualUZ',
  'legal',
  'entrepreneur',
  'individual',
] as const;

/**
 * Strict CSV parser — handles quoted fields, escaped quotes ("") and commas
 * inside quotes. Does NOT use a library: the CSV is small (≤500 rows) and
 * pulling in `papaparse` adds 30 KB to a settings page used twice a quarter.
 */
function parseCsv(text: string): { headers: string[]; rows: ParsedRow[] } {
  const lines: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"' && field.length === 0) {
      inQuotes = true;
    } else if (c === ',') {
      cur.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      cur.push(field);
      field = '';
      // Skip empty trailing lines
      if (cur.length > 1 || (cur.length === 1 && (cur[0]?.length ?? 0) > 0)) {
        lines.push(cur);
      }
      cur = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    lines.push(cur);
  }
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = (lines[0] ?? []).map((h) => h.trim());
  const rows: ParsedRow[] = lines.slice(1).map((row, idx) => {
    const values: Record<string, string> = {};
    headers.forEach((h, j) => {
      values[h] = (row[j] ?? '').trim();
    });
    return { values, sourceLine: idx + 2 };
  });
  return { headers, rows };
}

/** Best-effort column auto-mapping from common header names. */
function autoMapColumns(headers: string[]): FieldMap {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[\s_-]+/g, '')
      .replace(/[^a-z0-9]/g, '');
  const aliases: Record<FieldKey, string[]> = {
    name: ['name', 'nomi', 'наименование', 'название', 'company', 'kompaniya'],
    legalTitle: ['legaltitle', 'yuridiknomi', 'юрнаименование', 'legalname'],
    legalAddress: ['legaladdress', 'address', 'manzil', 'адрес'],
    companyType: ['companytype', 'tashkilotturi', 'type', 'тип'],
    email: ['email', 'pochta', 'почта'],
    phone: ['phone', 'tel', 'telefon', 'телефон'],
    description: ['description', 'note', 'izoh', 'описание', 'примечание'],
    code: ['code', 'kod', 'код', 'sku'],
  };
  const out: FieldMap = {};
  for (const h of headers) {
    const n = norm(h);
    for (const key of FIELD_KEYS) {
      if (out[key]) continue;
      if (aliases[key].some((a) => norm(a) === n)) {
        out[key] = h;
        break;
      }
    }
  }
  return out;
}

interface BuiltRow {
  payload: Record<string, unknown>;
  sourceLine: number;
  error: string | null;
}

function buildPayload(row: ParsedRow, map: FieldMap): BuiltRow {
  const p: Record<string, unknown> = {};
  let error: string | null = null;
  for (const key of FIELD_KEYS) {
    const col = map[key];
    if (!col) continue;
    const v = row.values[col];
    if (!v) continue;
    if (key === 'companyType') {
      if (!(COMPANY_TYPES as readonly string[]).includes(v)) {
        error = `Noto'g'ri tashkilot turi: "${v}"`;
        continue;
      }
    }
    p[key] = v;
  }
  if (!p.name || String(p.name).length === 0) {
    error = error ?? 'Nomi majburiy';
  }
  return { payload: p, sourceLine: row.sourceLine, error };
}

export default function CounterpartyImportPage() {
  const router = useRouter();
  const t = useTranslations('pages.counterparty_import');
  const tCommon = useTranslations('common');

  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fieldMap, setFieldMap] = useState<FieldMap>({});
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const builtRows = useMemo(
    () => parsedRows.map((r) => buildPayload(r, fieldMap)),
    [parsedRows, fieldMap],
  );
  const validCount = builtRows.filter((b) => !b.error).length;
  const invalidCount = builtRows.length - validCount;

  const steps: WizardStep[] = [
    { key: 'upload', label: t('step_upload'), description: t('step_upload_desc') },
    { key: 'mapping', label: t('step_mapping'), description: t('step_mapping_desc') },
    { key: 'preview', label: t('step_preview'), description: t('step_preview_desc') },
    { key: 'result', label: t('step_result') },
  ];

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParseError(null);
    file
      .text()
      .then((text) => {
        const { headers: h, rows } = parseCsv(text);
        if (h.length === 0 || rows.length === 0) {
          setParseError(t('parse_error_empty'));
          setHeaders([]);
          setParsedRows([]);
          return;
        }
        if (rows.length > 500) {
          setParseError(t('parse_error_too_many', { limit: '500' }));
          setHeaders([]);
          setParsedRows([]);
          return;
        }
        setHeaders(h);
        setParsedRows(rows);
        setFieldMap(autoMapColumns(h));
      })
      .catch((err: unknown) => {
        setParseError((err as Error).message);
      });
  }

  async function runImport() {
    setImporting(true);
    setSubmitError(null);
    try {
      const validPayloads = builtRows.filter((b) => !b.error).map((b) => b.payload);
      const result = await api.post<ImportResult>('/counterparties/bulk-import', {
        rows: validPayloads,
      });
      setImportResult(result);
      setStep(3);
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  function downloadErrorCsv() {
    if (!importResult || importResult.failed.length === 0) return;
    // Map failed indices back to original rows so the operator can fix + retry
    const validBuiltRows = builtRows.filter((b) => !b.error);
    const lines = [
      `"source_line","error","name"`,
      ...importResult.failed.map((f) => {
        const built = validBuiltRows[f.index];
        const sourceLine = built?.sourceLine ?? '?';
        const name = String(built?.payload.name ?? '').replace(/"/g, '""');
        const err = f.error.replace(/"/g, '""');
        return `"${sourceLine}","${err}","${name}"`;
      }),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'counterparty-import-errors.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ----- step body renderers -----

  function renderUploadStep() {
    return (
      <div className="space-y-3">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={onFileChange}
          data-test-id="import-file"
          className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-[var(--ms-bg-muted)] file:px-3 file:py-1.5 file:font-medium file:text-sm hover:file:bg-[var(--ms-bg-default)]"
        />
        {fileName && !parseError && parsedRows.length > 0 && (
          <p className="text-[var(--ms-text-success,#15803d)] text-sm">
            ✓ {fileName} — {parsedRows.length} {t('rows')}, {headers.length} {t('columns')}
          </p>
        )}
        {parseError && <p className="text-[var(--ms-text-destructive)] text-sm">{parseError}</p>}
        <details className="mt-3 text-[var(--ms-text-muted)] text-xs">
          <summary className="cursor-pointer">{t('format_hint_summary')}</summary>
          <pre className="mt-2 overflow-x-auto rounded bg-[var(--ms-bg-muted)] p-2">{`name,phone,email,companyType
"MCHJ Demo","+998901234567","info@demo.uz","legalUZ"
"Ali YaTT","+998998887766","","individual"`}</pre>
        </details>
      </div>
    );
  }

  function renderMappingStep() {
    return (
      <div className="space-y-3">
        <table className="w-full text-sm">
          <thead className="bg-[var(--ms-bg-muted)] text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
            <tr>
              <th className="h-9 px-3 text-left font-medium">{t('field')}</th>
              <th className="h-9 px-3 text-left font-medium">{t('csv_column')}</th>
            </tr>
          </thead>
          <tbody>
            {FIELD_KEYS.map((field) => (
              <tr key={field} className="border-[var(--ms-border-default)] border-t">
                <td className="px-3 py-2 font-medium">
                  {t(`field_${field}`)}
                  {field === 'name' && (
                    <span className="ml-1 text-[var(--ms-text-destructive)]">*</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <NativeSelect
                    value={fieldMap[field] ?? ''}
                    onChange={(e) =>
                      setFieldMap((prev) => ({
                        ...prev,
                        [field]: e.target.value || undefined,
                      }))
                    }
                    data-test-id={`map-${field}`}
                  >
                    <option value="">— {t('not_mapped')} —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </NativeSelect>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderPreviewStep() {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-[var(--ms-text-success,#15803d)]">
            ✓ {validCount} {t('valid_rows')}
          </span>
          {invalidCount > 0 && (
            <span className="text-[var(--ms-text-destructive)]">
              ✗ {invalidCount} {t('invalid_rows')}
            </span>
          )}
        </div>
        <div className="overflow-hidden rounded border border-[var(--ms-border-default)]">
          <table className="w-full text-xs">
            <thead className="bg-[var(--ms-bg-muted)] text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
              <tr>
                <th className="h-7 px-2 text-left font-medium">#</th>
                <th className="h-7 px-2 text-left font-medium">{t('row_status')}</th>
                <th className="h-7 px-2 text-left font-medium">{t('field_name')}</th>
                <th className="h-7 px-2 text-left font-medium">{t('field_phone')}</th>
                <th className="h-7 px-2 text-left font-medium">{t('row_error')}</th>
              </tr>
            </thead>
            <tbody>
              {builtRows.slice(0, 25).map((b) => (
                <tr
                  key={b.sourceLine}
                  className="border-[var(--ms-border-default)] border-t"
                  data-test-id={`preview-row-${b.sourceLine}`}
                >
                  <td className="px-2 py-1 text-[var(--ms-text-muted)] tabular-nums">
                    {b.sourceLine}
                  </td>
                  <td className="px-2 py-1">
                    {b.error ? (
                      <span className="text-[var(--ms-text-destructive)]">✗</span>
                    ) : (
                      <span className="text-[var(--ms-text-success,#15803d)]">✓</span>
                    )}
                  </td>
                  <td className="px-2 py-1">{String(b.payload.name ?? '—')}</td>
                  <td className="px-2 py-1">{String(b.payload.phone ?? '—')}</td>
                  <td className="px-2 py-1 text-[var(--ms-text-destructive)]">{b.error ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {builtRows.length > 25 && (
            <p className="border-[var(--ms-border-default)] border-t bg-[var(--ms-bg-muted)] px-2 py-1.5 text-[var(--ms-text-muted)] text-xs">
              {t('preview_truncated', { shown: '25', total: String(builtRows.length) })}
            </p>
          )}
        </div>
        {submitError && <p className="text-[var(--ms-text-destructive)] text-sm">{submitError}</p>}
      </div>
    );
  }

  function renderResultStep() {
    if (!importResult) return null;
    return (
      <div className="space-y-4" data-test-id="import-result">
        <div className="flex items-center gap-4 text-base">
          <span className="text-[var(--ms-text-success,#15803d)]">
            ✓ {importResult.inserted.length} {t('inserted')}
          </span>
          {importResult.failed.length > 0 && (
            <span className="text-[var(--ms-text-destructive)]">
              ✗ {importResult.failed.length} {t('failed')}
            </span>
          )}
          <span className="text-[var(--ms-text-muted)]">
            / {importResult.total} {t('total')}
          </span>
        </div>
        {importResult.failed.length > 0 && (
          <Button variant="secondary" size="sm" onClick={downloadErrorCsv}>
            {t('download_errors')}
          </Button>
        )}
        <Button variant="primary" size="sm" onClick={() => router.push('/counterparties')}>
          {t('go_to_list')}
        </Button>
      </div>
    );
  }

  // ----- nav guards -----

  const canGoNext = (() => {
    if (step === 0) return parsedRows.length > 0 && !parseError;
    if (step === 1) return !!fieldMap.name;
    if (step === 2) return validCount > 0 && !importing;
    return false;
  })();

  const nextLabel = step === 2 ? `${t('import_button')} (${validCount})` : tCommon('next');

  return (
    <Container size="md" className="py-4">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <Wizard
        steps={steps}
        activeIndex={step}
        onCancel={step < 3 ? () => router.push('/counterparties') : undefined}
        onBack={step > 0 && step < 3 ? () => setStep(step - 1) : undefined}
        onNext={
          step < 3
            ? () => {
                if (step === 2) {
                  void runImport();
                  return;
                }
                setStep(step + 1);
              }
            : undefined
        }
        nextLabel={nextLabel}
        nextDisabled={!canGoNext || importing}
        finishVariant={step === 2}
        cancelLabel={tCommon('cancel')}
        backLabel={tCommon('back')}
        testId="counterparty-import-wizard"
      >
        {step === 0 && renderUploadStep()}
        {step === 1 && renderMappingStep()}
        {step === 2 && renderPreviewStep()}
        {step === 3 && renderResultStep()}
      </Wizard>
    </Container>
  );
}
