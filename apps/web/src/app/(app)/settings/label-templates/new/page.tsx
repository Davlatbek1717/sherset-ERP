'use client';

/**
 * /settings/label-templates/new — Create a label template.
 *
 * Form layout:
 *   - Paper format selector (A4 / A5 / A6 / custom + dims)
 *   - Grid (cols × rows) with live preview
 *   - Margins + gaps + label dimensions (mm)
 *   - Which product fields to include (name / price / barcode / article)
 *   - Barcode format (EAN13 / CODE128 / QR)
 *
 * A live mini-preview shows the grid layout to scale, so the user can
 * eyeball before saving.
 */

import { api } from '@/lib/api-client';
import { Alert, Button, Checkbox, Icons, Input, SegmentedControl } from '@moysklad/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type PageSize = 'A4' | 'A5' | 'A6' | 'custom';
type BarcodeFormat = 'EAN13' | 'CODE128' | 'QR';

const PAGE_PRESETS: Record<Exclude<PageSize, 'custom'>, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  A6: { w: 105, h: 148 },
};

export default function NewLabelTemplatePage() {
  const router = useRouter();
  const t = useTranslations('pages.label_templates');
  const tCommon = useTranslations('common');
  const tForm = useTranslations('form');
  const tFields = useTranslations('fields');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pageSize, setPageSize] = useState<PageSize>('A4');
  const [pageWidthMm, setPageWidthMm] = useState(210);
  const [pageHeightMm, setPageHeightMm] = useState(297);
  const [cols, setCols] = useState(3);
  const [rows, setRows] = useState(8);
  const [marginTopMm, setMarginTopMm] = useState(10);
  const [marginLeftMm, setMarginLeftMm] = useState(10);
  const [columnGapMm, setColumnGapMm] = useState(3);
  const [rowGapMm, setRowGapMm] = useState(3);
  const [labelWidthMm, setLabelWidthMm] = useState(60);
  const [labelHeightMm, setLabelHeightMm] = useState(30);
  const [includeName, setIncludeName] = useState(true);
  const [includePrice, setIncludePrice] = useState(true);
  const [includeBarcode, setIncludeBarcode] = useState(true);
  const [includeArticle, setIncludeArticle] = useState(true);
  const [headerText, setHeaderText] = useState('');
  const [barcodeFormat, setBarcodeFormat] = useState<BarcodeFormat>('EAN13');

  const [error, setError] = useState<string | null>(null);

  // When user picks a preset, snap dims to standard.
  const onPageSizeChange = (next: PageSize) => {
    setPageSize(next);
    if (next !== 'custom') {
      setPageWidthMm(PAGE_PRESETS[next].w);
      setPageHeightMm(PAGE_PRESETS[next].h);
    }
  };

  // Xprinter / thermal label presets — one click snaps the template to a common
  // Xprinter size: custom page dims, one label per feed (1×1), QR (senik). The
  // senik print already injects the matching `@page` mm, so this just fills dims.
  const applyXprinterPreset = (p: { w: number; h: number; lw: number; lh: number; m: number }) => {
    setPageSize('custom');
    setPageWidthMm(p.w);
    setPageHeightMm(p.h);
    setCols(1);
    setRows(1);
    setLabelWidthMm(p.lw);
    setLabelHeightMm(p.lh);
    setMarginTopMm(p.m);
    setMarginLeftMm(p.m);
    setColumnGapMm(0);
    setRowGapMm(0);
    setBarcodeFormat('QR');
  };

  const createMut = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error(t('name_required'));
      return api.post<{ id: string }>('/label-templates', {
        name: name.trim(),
        description: description || undefined,
        pageSize,
        ...(pageSize === 'custom' ? { pageWidthMm, pageHeightMm } : {}),
        cols,
        rows,
        marginTopMm,
        marginLeftMm,
        columnGapMm,
        rowGapMm,
        labelWidthMm,
        labelHeightMm,
        includeName,
        includePrice,
        includeBarcode,
        includeArticle,
        headerText: headerText || undefined,
        barcodeFormat,
      });
    },
    onSuccess: (created) => router.push(`/settings/label-templates/${created.id}`),
    onError: (err: Error) => setError(err.message),
  });

  // Live preview: scale page dimensions to fit a 240px-wide preview area.
  const previewScale = 240 / pageWidthMm;
  const previewW = pageWidthMm * previewScale;
  const previewH = pageHeightMm * previewScale;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-semibold text-[var(--ms-text-primary)] text-xl">{t('new_title')}</h1>
        <Button variant="ghost" onClick={() => router.push('/settings/label-templates')}>
          {t('back_to_list')}
        </Button>
      </div>

      {error && <Alert tone="destructive">{error}</Alert>}

      <div className="grid grid-cols-[1fr_280px] gap-6">
        {/* Form */}
        <div className="space-y-4">
          <Section title={tForm('section_main')}>
            <Field label={`${tFields('name')} *`}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('name_ph')}
                data-test-id="field-name"
              />
            </Field>
            <Field label={tFields('description')}>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('optional_ph')}
              />
            </Field>
          </Section>

          <Section title={t('section_paper')}>
            <Field label={t('size_label')}>
              <SegmentedControl<PageSize>
                value={pageSize}
                onChange={onPageSizeChange}
                ariaLabel={t('size_label')}
                options={(['A4', 'A5', 'A6', 'custom'] as const).map((size) => ({
                  value: size,
                  label: size === 'custom' ? t('custom_size') : size,
                }))}
              />
            </Field>
            <Field label={t('xprinter_presets')}>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => applyXprinterPreset({ w: 80, h: 50, lw: 76, lh: 46, m: 2 })}
                >
                  {t('preset_80')}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => applyXprinterPreset({ w: 58, h: 40, lw: 54, lh: 36, m: 2 })}
                >
                  {t('preset_58')}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => applyXprinterPreset({ w: 40, h: 30, lw: 38, lh: 28, m: 1 })}
                >
                  {t('preset_label')}
                </Button>
              </div>
            </Field>
            {pageSize === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('width_mm')}>
                  <Input
                    type="number"
                    value={pageWidthMm}
                    min={20}
                    max={500}
                    onChange={(e) => setPageWidthMm(Number(e.target.value))}
                  />
                </Field>
                <Field label={t('height_mm')}>
                  <Input
                    type="number"
                    value={pageHeightMm}
                    min={20}
                    max={500}
                    onChange={(e) => setPageHeightMm(Number(e.target.value))}
                  />
                </Field>
              </div>
            )}
          </Section>

          <Section title={t('section_grid')}>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('cols_label')}>
                <Input
                  type="number"
                  value={cols}
                  min={1}
                  max={20}
                  onChange={(e) => setCols(Math.max(1, Number(e.target.value)))}
                />
              </Field>
              <Field label={t('rows_label')}>
                <Input
                  type="number"
                  value={rows}
                  min={1}
                  max={40}
                  onChange={(e) => setRows(Math.max(1, Number(e.target.value)))}
                />
              </Field>
            </div>
            <div className="text-[var(--ms-text-muted)] text-xs">
              {t('labels_per_page', { count: cols * rows })}
            </div>
          </Section>

          <Section title={t('section_dims')}>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('margin_top')}>
                <Input
                  type="number"
                  value={marginTopMm}
                  min={0}
                  max={100}
                  onChange={(e) => setMarginTopMm(Number(e.target.value))}
                />
              </Field>
              <Field label={t('margin_left')}>
                <Input
                  type="number"
                  value={marginLeftMm}
                  min={0}
                  max={100}
                  onChange={(e) => setMarginLeftMm(Number(e.target.value))}
                />
              </Field>
              <Field label={t('column_gap')}>
                <Input
                  type="number"
                  value={columnGapMm}
                  min={0}
                  max={50}
                  onChange={(e) => setColumnGapMm(Number(e.target.value))}
                />
              </Field>
              <Field label={t('row_gap')}>
                <Input
                  type="number"
                  value={rowGapMm}
                  min={0}
                  max={50}
                  onChange={(e) => setRowGapMm(Number(e.target.value))}
                />
              </Field>
              <Field label={t('label_width')}>
                <Input
                  type="number"
                  value={labelWidthMm}
                  min={10}
                  max={200}
                  onChange={(e) => setLabelWidthMm(Number(e.target.value))}
                />
              </Field>
              <Field label={t('label_height')}>
                <Input
                  type="number"
                  value={labelHeightMm}
                  min={10}
                  max={200}
                  onChange={(e) => setLabelHeightMm(Number(e.target.value))}
                />
              </Field>
            </div>
          </Section>

          <Section title={t('section_fields')}>
            <CheckRow
              label={t('field_product_name')}
              checked={includeName}
              onChange={setIncludeName}
            />
            <CheckRow label={t('field_price')} checked={includePrice} onChange={setIncludePrice} />
            <CheckRow
              label={t('field_barcode')}
              checked={includeBarcode}
              onChange={setIncludeBarcode}
            />
            <CheckRow
              label={t('field_article')}
              checked={includeArticle}
              onChange={setIncludeArticle}
            />
            <Field label={t('header_text')}>
              <Input
                value={headerText}
                onChange={(e) => setHeaderText(e.target.value)}
                placeholder={t('header_text_ph')}
              />
            </Field>
          </Section>

          <Section title={t('section_barcode_format')}>
            <SegmentedControl<BarcodeFormat>
              value={barcodeFormat}
              onChange={setBarcodeFormat}
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
            <Button
              variant="primary"
              onClick={() => {
                setError(null);
                createMut.mutate();
              }}
              disabled={!name.trim() || createMut.isPending}
            >
              <Icons.save className="h-4 w-4" />
              {tCommon('save')}
            </Button>
          </div>
        </div>

        {/* Live preview */}
        <div className="sticky top-4 self-start">
          <div className="mb-2 text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
            {t('grid_preview')}
          </div>
          <div
            className="relative rounded-md border border-[var(--ms-border-default)] bg-white shadow-sm"
            style={{ width: previewW, height: previewH }}
          >
            {/* Grid cells */}
            {Array.from({ length: rows }).map((_, ri) =>
              Array.from({ length: cols }).map((__, ci) => {
                const x = marginLeftMm + ci * (labelWidthMm + columnGapMm);
                const y = marginTopMm + ri * (labelHeightMm + rowGapMm);
                return (
                  <div
                    key={`cell-${x}-${y}`}
                    className="absolute rounded-[2px] border border-[var(--ms-text-brand)] bg-[var(--ms-bg-brand-subtle)]/40"
                    style={{
                      left: x * previewScale,
                      top: y * previewScale,
                      width: labelWidthMm * previewScale,
                      height: labelHeightMm * previewScale,
                    }}
                  />
                );
              }),
            )}
          </div>
          <div className="mt-2 text-[var(--ms-text-muted)] text-xs">
            {pageWidthMm} × {pageHeightMm} mm · {t('labels_per_page', { count: cols * rows })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ----- Helpers -------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
      <div className="mb-3 font-medium text-[var(--ms-text-primary)] text-sm">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  // Caption + arbitrary children — `children` is opaque (may be a control or a
  // group), so this is a visual caption (<span>), not a programmatic <label>.
  // Inputs that need association use their own htmlFor/id pairs.
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
