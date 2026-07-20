'use client';

import { api } from '@/lib/api-client';
import { Button, Container, NativeSelect, PageHeader, Wizard, type WizardStep } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, useMemo, useState } from 'react';

// Mirrors CreateMxikSchema (apps/api/src/modules/mxik/mxik.schema.ts:18) minus
// the auto-derivable hierarchy fields (groupCode/classCode are slices of code).
const FIELD_KEYS = ['code', 'nameUz', 'nameRu', 'nameEn', 'unitCode'] as const;
type FieldKey = (typeof FIELD_KEYS)[number];
type FieldMap = Partial<Record<FieldKey, string>>;

interface ParsedRow {
  values: Record<string, string>;
  sourceLine: number;
}

interface ImportResult {
  total: number;
  inserted: Array<{ index: number; result: { code: string } }>;
  failed: Array<{ index: number; error: string }>;
}

/** Strict CSV parser — same shape as the counterparty importer; see notes there. */
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

function autoMapColumns(headers: string[]): FieldMap {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[\s_-]+/g, '')
      .replace(/[^a-z0-9]/g, '');
  const aliases: Record<FieldKey, string[]> = {
    code: ['code', 'kod', 'код', 'mxik', 'mxikcode'],
    nameUz: ['nameuz', 'nomi', 'nomuz', 'наименованиеuz'],
    nameRu: ['nameru', 'наименование', 'название'],
    nameEn: ['nameen', 'name', 'englishname'],
    unitCode: ['unit', 'unitcode', 'olchov', 'единица', 'единицаизмерения'],
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

function buildPayload(row: ParsedRow, map: FieldMap, source: 'soliq' | 'manual'): BuiltRow {
  const p: Record<string, unknown> = { source };
  let error: string | null = null;
  for (const key of FIELD_KEYS) {
    const col = map[key];
    if (!col) continue;
    const v = row.values[col];
    if (!v) continue;
    p[key] = v;
  }
  // Server-side schema enforces 17-digit code; we surface the friendly hint here.
  const code = String(p.code ?? '');
  if (!/^\d{17}$/.test(code)) {
    error = `Kod 17 raqamdan iborat bo'lishi kerak (topildi: ${code.length} ta belgi)`;
  } else if (!p.nameUz || String(p.nameUz).trim().length === 0) {
    error = 'Nomi (UZ) majburiy';
  }
  return { payload: p, sourceLine: row.sourceLine, error };
}

export default function MxikImportPage() {
  const router = useRouter();
  const t = useTranslations('pages.mxik_admin');
  const tCommon = useTranslations('common');

  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fieldMap, setFieldMap] = useState<FieldMap>({});
  const [source, setSource] = useState<'soliq' | 'manual'>('soliq');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const builtRows = useMemo(
    () => parsedRows.map((r) => buildPayload(r, fieldMap, source)),
    [parsedRows, fieldMap, source],
  );
  const validCount = builtRows.filter((b) => !b.error).length;
  const invalidCount = builtRows.length - validCount;

  const steps: WizardStep[] = [
    { key: 'upload', label: t('import_step_upload'), description: t('import_step_upload_desc') },
    { key: 'mapping', label: t('import_step_mapping') },
    { key: 'preview', label: t('import_step_preview') },
    { key: 'result', label: t('import_step_result') },
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
          setParseError(t('import_parse_error_empty'));
          setHeaders([]);
          setParsedRows([]);
          return;
        }
        if (rows.length > 2000) {
          setParseError(t('import_parse_error_too_many', { limit: '2000' }));
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
      const result = await api.post<ImportResult>('/mxik/bulk-import', {
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
    const validBuilt = builtRows.filter((b) => !b.error);
    const lines = [
      `"source_line","error","code","nameUz"`,
      ...importResult.failed.map((f) => {
        const built = validBuilt[f.index];
        const sourceLine = built?.sourceLine ?? '?';
        const code = String(built?.payload.code ?? '').replace(/"/g, '""');
        const name = String(built?.payload.nameUz ?? '').replace(/"/g, '""');
        const err = f.error.replace(/"/g, '""');
        return `"${sourceLine}","${err}","${code}","${name}"`;
      }),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mxik-import-errors.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ----- step bodies -----

  function renderUploadStep() {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <label className="text-sm" htmlFor="import-source">
            {t('import_source_label')}
          </label>
          <NativeSelect
            id="import-source"
            value={source}
            onChange={(e) => setSource(e.target.value as 'soliq' | 'manual')}
            data-test-id="import-source"
          >
            <option value="soliq">{t('source_soliq')}</option>
            <option value="manual">{t('source_manual')}</option>
          </NativeSelect>
          <span className="text-[var(--ms-text-muted)] text-xs">
            {source === 'soliq' ? t('import_source_hint_soliq') : t('import_source_hint_manual')}
          </span>
        </div>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={onFileChange}
          data-test-id="import-file"
          className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-[var(--ms-bg-muted)] file:px-3 file:py-1.5 file:font-medium file:text-sm hover:file:bg-[var(--ms-bg-default)]"
        />
        {fileName && !parseError && parsedRows.length > 0 && (
          <p className="text-[var(--ms-text-success,#15803d)] text-sm">
            ✓ {fileName} — {parsedRows.length} {t('import_rows')}, {headers.length}{' '}
            {t('import_columns')}
          </p>
        )}
        {parseError && <p className="text-[var(--ms-text-destructive)] text-sm">{parseError}</p>}
        <details className="mt-3 text-[var(--ms-text-muted)] text-xs">
          <summary className="cursor-pointer">{t('import_format_hint_summary')}</summary>
          <pre className="mt-2 overflow-x-auto rounded bg-[var(--ms-bg-muted)] p-2">{`code,nameUz,nameRu,unitCode
"01234567890123456","Non, oddiy","Хлеб обычный","796"
"02345678901234567","Sut, 1 litr","Молоко, 1 литр","112"`}</pre>
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
              <th className="h-9 px-3 text-left font-medium">{t('import_field')}</th>
              <th className="h-9 px-3 text-left font-medium">{t('import_csv_column')}</th>
            </tr>
          </thead>
          <tbody>
            {FIELD_KEYS.map((field) => (
              <tr key={field} className="border-[var(--ms-border-default)] border-t">
                <td className="px-3 py-2 font-medium">
                  {t(`import_field_${field}`)}
                  {(field === 'code' || field === 'nameUz') && (
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
                    <option value="">— {t('import_not_mapped')} —</option>
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
            ✓ {validCount} {t('import_valid_rows')}
          </span>
          {invalidCount > 0 && (
            <span className="text-[var(--ms-text-destructive)]">
              ✗ {invalidCount} {t('import_invalid_rows')}
            </span>
          )}
        </div>
        <div className="overflow-hidden rounded border border-[var(--ms-border-default)]">
          <table className="w-full text-xs">
            <thead className="bg-[var(--ms-bg-muted)] text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
              <tr>
                <th className="h-7 px-2 text-left font-medium">#</th>
                <th className="h-7 px-2 text-left font-medium">{t('col_code')}</th>
                <th className="h-7 px-2 text-left font-medium">{t('col_name_uz')}</th>
                <th className="h-7 px-2 text-left font-medium">{t('import_row_error')}</th>
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
                  <td className="px-2 py-1 font-mono">{String(b.payload.code ?? '—')}</td>
                  <td className="px-2 py-1">{String(b.payload.nameUz ?? '—')}</td>
                  <td className="px-2 py-1 text-[var(--ms-text-destructive)]">{b.error ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {builtRows.length > 25 && (
            <p className="border-[var(--ms-border-default)] border-t bg-[var(--ms-bg-muted)] px-2 py-1.5 text-[var(--ms-text-muted)] text-xs">
              {t('import_preview_truncated', {
                shown: '25',
                total: String(builtRows.length),
              })}
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
            ✓ {importResult.inserted.length} {t('import_inserted')}
          </span>
          {importResult.failed.length > 0 && (
            <span className="text-[var(--ms-text-destructive)]">
              ✗ {importResult.failed.length} {t('import_failed')}
            </span>
          )}
          <span className="text-[var(--ms-text-muted)]">
            / {importResult.total} {t('import_total')}
          </span>
        </div>
        {importResult.failed.length > 0 && (
          <Button variant="secondary" size="sm" onClick={downloadErrorCsv}>
            {t('import_download_errors')}
          </Button>
        )}
        <Button variant="primary" size="sm" onClick={() => router.push('/settings/mxik')}>
          {t('import_go_to_list')}
        </Button>
      </div>
    );
  }

  const canGoNext = (() => {
    if (step === 0) return parsedRows.length > 0 && !parseError;
    if (step === 1) return !!fieldMap.code && !!fieldMap.nameUz;
    if (step === 2) return validCount > 0 && !importing;
    return false;
  })();

  const nextLabel = step === 2 ? `${t('import_button_action')} (${validCount})` : tCommon('next');

  return (
    <Container size="full" className="py-4">
      <PageHeader title={t('import_title')} subtitle={t('import_subtitle')} />
      <Wizard
        steps={steps}
        activeIndex={step}
        onCancel={step < 3 ? () => router.push('/settings/mxik') : undefined}
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
        testId="mxik-import-wizard"
      >
        {step === 0 && renderUploadStep()}
        {step === 1 && renderMappingStep()}
        {step === 2 && renderPreviewStep()}
        {step === 3 && renderResultStep()}
      </Wizard>
    </Container>
  );
}
