'use client';

/**
 * /settings/label-templates/[id] — Edit a label template.
 *
 * Hydrates the same form layout as /new from the API response. Adds
 * Archive + Delete actions in a danger zone. Save uses PATCH with the
 * full set of fields (the backend ignores unchanged columns thanks to
 * Prisma update).
 */

import { useConflictReload } from '@/hooks/use-conflict-reload';
import { api } from '@/lib/api-client';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import { Alert, Button, Checkbox, Input, SegmentedControl, useConfirm } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type PageSize = 'A4' | 'A5' | 'A6' | 'custom';
type BarcodeFormat = 'EAN13' | 'CODE128' | 'QR';

interface TemplateDetail {
  id: string;
  version: number;
  name: string;
  description: string | null;
  pageSize: PageSize;
  pageWidthMm: number | null;
  pageHeightMm: number | null;
  cols: number;
  rows: number;
  marginTopMm: number;
  marginLeftMm: number;
  columnGapMm: number;
  rowGapMm: number;
  labelWidthMm: number;
  labelHeightMm: number;
  includeName: boolean;
  includePrice: boolean;
  includeBarcode: boolean;
  includeArticle: boolean;
  headerText: string | null;
  barcodeFormat: BarcodeFormat;
  archived: boolean;
}

const PAGE_PRESETS: Record<Exclude<PageSize, 'custom'>, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  A6: { w: 105, h: 148 },
};

export default function LabelTemplateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { confirm } = useConfirm();
  const t = useTranslations('pages.label_templates');
  const tCommon = useTranslations('common');
  const tForm = useTranslations('form');
  const tFields = useTranslations('fields');

  const { data, isLoading } = useQuery<TemplateDetail>({
    queryKey: ['label-template', id],
    queryFn: () => api.get(`/label-templates/${id}`),
  });

  const [form, setForm] = useState<TemplateDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onConflict = useConflictReload(['label-template', id]);

  useEffect(() => {
    if (data && !form) setForm({ ...data });
  }, [data, form]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!form) throw new Error(t('err_form_not_loaded'));
      const payload: Record<string, unknown> = {
        version: form.version,
        name: form.name.trim(),
        description: form.description || null,
        pageSize: form.pageSize,
        pageWidthMm: form.pageSize === 'custom' ? form.pageWidthMm : null,
        pageHeightMm: form.pageSize === 'custom' ? form.pageHeightMm : null,
        cols: form.cols,
        rows: form.rows,
        marginTopMm: form.marginTopMm,
        marginLeftMm: form.marginLeftMm,
        columnGapMm: form.columnGapMm,
        rowGapMm: form.rowGapMm,
        labelWidthMm: form.labelWidthMm,
        labelHeightMm: form.labelHeightMm,
        includeName: form.includeName,
        includePrice: form.includePrice,
        includeBarcode: form.includeBarcode,
        includeArticle: form.includeArticle,
        headerText: form.headerText || null,
        barcodeFormat: form.barcodeFormat,
      };
      return api.patch(`/label-templates/${id}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['label-template', id] });
      qc.invalidateQueries({ queryKey: ['label-templates'] });
      setError(null);
    },
    onError: (e: Error) => {
      if (isOptimisticConflict(e)) {
        onConflict();
      } else {
        setError(e.message);
      }
    },
  });

  const archiveMut = useMutation({
    mutationFn: () => api.post(`/label-templates/${id}/archive`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['label-template', id] });
      qc.invalidateQueries({ queryKey: ['label-templates'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/label-templates/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['label-templates'] });
      router.push('/settings/label-templates');
    },
    onError: (e: Error) => setError(e.message),
  });

  if (isLoading || !form)
    return <div className="p-8 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;

  const set = <K extends keyof TemplateDetail>(k: K, v: TemplateDetail[K]) => {
    setForm((s) => (s ? { ...s, [k]: v } : s));
  };

  // Re-apply page presets when user changes pageSize
  const onPageSizeChange = (next: PageSize) => {
    set('pageSize', next);
    if (next !== 'custom') {
      set('pageWidthMm', PAGE_PRESETS[next].w);
      set('pageHeightMm', PAGE_PRESETS[next].h);
    }
  };

  const previewScale = 240 / (form.pageWidthMm ?? 210);
  const previewW = (form.pageWidthMm ?? 210) * previewScale;
  const previewH = (form.pageHeightMm ?? 297) * previewScale;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-[var(--ms-text-primary)] text-xl">{form.name}</h1>
          <p className="text-[var(--ms-text-muted)] text-xs">
            {form.pageSize} · {form.cols}×{form.rows} · {form.barcodeFormat}
            {form.archived && ` · ${t('archived_suffix')}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => router.push(`/labels/print?templateId=${id}`)}>
            {t('print_with_template')}
          </Button>
          <Button variant="ghost" onClick={() => router.push('/settings/label-templates')}>
            {t('back_to_list')}
          </Button>
        </div>
      </div>

      {error && <Alert tone="destructive">{error}</Alert>}
      {form.archived && <Alert tone="warning">{t('archived_alert')}</Alert>}

      <div className="grid grid-cols-[1fr_280px] gap-6">
        <div className="space-y-4">
          <Section title={tForm('section_main')}>
            <Field label={tFields('name')}>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label={tFields('description')}>
              <Input
                value={form.description ?? ''}
                onChange={(e) => set('description', e.target.value || null)}
              />
            </Field>
          </Section>

          <Section title={t('section_paper')}>
            <Field label={t('size_label')}>
              <SegmentedControl<PageSize>
                value={form.pageSize}
                onChange={onPageSizeChange}
                ariaLabel={t('size_label')}
                options={(['A4', 'A5', 'A6', 'custom'] as const).map((size) => ({
                  value: size,
                  label: size === 'custom' ? t('custom_size') : size,
                }))}
              />
            </Field>
            {form.pageSize === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('width_mm')}>
                  <Input
                    type="number"
                    value={form.pageWidthMm ?? ''}
                    onChange={(e) => set('pageWidthMm', Number(e.target.value))}
                  />
                </Field>
                <Field label={t('height_mm')}>
                  <Input
                    type="number"
                    value={form.pageHeightMm ?? ''}
                    onChange={(e) => set('pageHeightMm', Number(e.target.value))}
                  />
                </Field>
              </div>
            )}
          </Section>

          <Section title={t('section_grid_dims')}>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('cols_label')}>
                <Input
                  type="number"
                  value={form.cols}
                  onChange={(e) => set('cols', Math.max(1, Number(e.target.value)))}
                />
              </Field>
              <Field label={t('rows_label')}>
                <Input
                  type="number"
                  value={form.rows}
                  onChange={(e) => set('rows', Math.max(1, Number(e.target.value)))}
                />
              </Field>
              <Field label={t('margin_top')}>
                <Input
                  type="number"
                  value={form.marginTopMm}
                  onChange={(e) => set('marginTopMm', Number(e.target.value))}
                />
              </Field>
              <Field label={t('margin_left')}>
                <Input
                  type="number"
                  value={form.marginLeftMm}
                  onChange={(e) => set('marginLeftMm', Number(e.target.value))}
                />
              </Field>
              <Field label={t('column_gap')}>
                <Input
                  type="number"
                  value={form.columnGapMm}
                  onChange={(e) => set('columnGapMm', Number(e.target.value))}
                />
              </Field>
              <Field label={t('row_gap')}>
                <Input
                  type="number"
                  value={form.rowGapMm}
                  onChange={(e) => set('rowGapMm', Number(e.target.value))}
                />
              </Field>
              <Field label={t('label_width')}>
                <Input
                  type="number"
                  value={form.labelWidthMm}
                  onChange={(e) => set('labelWidthMm', Number(e.target.value))}
                />
              </Field>
              <Field label={t('label_height')}>
                <Input
                  type="number"
                  value={form.labelHeightMm}
                  onChange={(e) => set('labelHeightMm', Number(e.target.value))}
                />
              </Field>
            </div>
          </Section>

          <Section title={t('section_fields')}>
            <CheckRow
              label={t('field_product_name')}
              checked={form.includeName}
              onChange={(v) => set('includeName', v)}
            />
            <CheckRow
              label={t('field_price')}
              checked={form.includePrice}
              onChange={(v) => set('includePrice', v)}
            />
            <CheckRow
              label={t('field_barcode')}
              checked={form.includeBarcode}
              onChange={(v) => set('includeBarcode', v)}
            />
            <CheckRow
              label={t('field_article')}
              checked={form.includeArticle}
              onChange={(v) => set('includeArticle', v)}
            />
            <Field label={t('header_text')}>
              <Input
                value={form.headerText ?? ''}
                onChange={(e) => set('headerText', e.target.value || null)}
              />
            </Field>
          </Section>

          <Section title={t('section_barcode_format')}>
            <SegmentedControl<BarcodeFormat>
              value={form.barcodeFormat}
              onChange={(v) => set('barcodeFormat', v)}
              ariaLabel={t('section_barcode_format')}
              options={(['EAN13', 'CODE128', 'QR'] as const).map((fmt) => ({
                value: fmt,
                label: fmt,
              }))}
            />
          </Section>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => router.push('/settings/label-templates')}>
              {tCommon('cancel')}
            </Button>
            <Button variant="primary" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {tCommon('save')}
            </Button>
          </div>

          <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-destructive-200)] bg-[var(--ms-destructive-50)] p-4">
            <div className="mb-2 font-medium text-[var(--ms-text-destructive)] text-sm">
              {t('danger_zone')}
            </div>
            <div className="flex gap-2">
              {!form.archived && (
                <Button variant="tertiary" onClick={() => archiveMut.mutate()}>
                  {tCommon('archive')}
                </Button>
              )}
              <Button
                variant="destructive"
                onClick={async () => {
                  const ok = await confirm({
                    title: t('delete_confirm_title'),
                    description: tCommon('action_irreversible'),
                    confirmLabel: tCommon('delete'),
                    tone: 'destructive',
                  });
                  if (ok) deleteMut.mutate();
                }}
              >
                {tCommon('delete')}
              </Button>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="sticky top-4 self-start">
          <div className="mb-2 text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
            {t('grid_preview')}
          </div>
          <div
            className="relative rounded-md border border-[var(--ms-border-default)] bg-white shadow-sm"
            style={{ width: previewW, height: previewH }}
          >
            {Array.from({ length: form.rows }).map((_, ri) =>
              Array.from({ length: form.cols }).map((__, ci) => {
                const x = form.marginLeftMm + ci * (form.labelWidthMm + form.columnGapMm);
                const y = form.marginTopMm + ri * (form.labelHeightMm + form.rowGapMm);
                return (
                  // Key off the computed pixel offset — unique per cell and not
                  // the loop index, so a static preview grid stays stable.
                  <div
                    key={`cell-${x}-${y}`}
                    className="absolute rounded-[2px] border border-[var(--ms-text-brand)] bg-[var(--ms-bg-brand-subtle)]/40"
                    style={{
                      left: x * previewScale,
                      top: y * previewScale,
                      width: form.labelWidthMm * previewScale,
                      height: form.labelHeightMm * previewScale,
                    }}
                  />
                );
              }),
            )}
          </div>
          <div className="mt-2 text-[var(--ms-text-muted)] text-xs">
            {t('labels_per_page', { count: form.cols * form.rows })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
      <div className="mb-3 font-medium text-[var(--ms-text-primary)] text-sm">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  // Caption + arbitrary children — `children` is opaque (may be a control
  // or a group), so this is a visual caption (<span>), not a programmatic
  // <label>. Inputs that need association use their own htmlFor/id pairs.
  return (
    <div>
      <span className="mb-1 block text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
        {label}
      </span>
      {children}
    </div>
  );
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <span>{label}</span>
    </label>
  );
}
