'use client';

/**
 * /production/stages/[id] — standalone «Этап производства» detail/edit.
 * §126/round-6c. Load GET /processing-stages/:id → prefill → PATCH +
 * archive/restore + DocumentTabs. Money round-trips tiyin↔so'm.
 */

import { DocumentTabs } from '@/components/document-tabs';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useEditFormLabels } from '@/hooks/use-edit-form-labels';
import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import {
  Badge,
  Button,
  CatalogPicker,
  CatalogPickerField,
  Checkbox,
  EditForm,
  FormField,
  FormSection,
  Icons,
  Input,
  type PickerItem,
} from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

interface StageDetail {
  id: string;
  version: number;
  name: string;
  code: string | null;
  externalCode: string | null;
  description: string | null;
  laborCostMinor: string;
  materialMarkup: number;
  standardHourCostMinor: string;
  allPerformers: boolean;
  distributionRequired: boolean;
  shared: boolean;
  archived: boolean;
  materialStoreId: string | null;
  materialStore: { id: string; name: string } | null;
  performers: Array<{ id: string; name: string }>;
}

function somToTiyin(som: string): string {
  const n = Number(som);
  if (!Number.isFinite(n) || n < 0) return '0';
  return String(Math.round(n * 100));
}
function tiyinToSom(tiyin: string): string {
  const n = Number(tiyin);
  if (!Number.isFinite(n)) return '0';
  const som = n / 100;
  return Number.isInteger(som) ? String(som) : som.toFixed(2);
}

interface PerformerRow {
  id: string;
  name: string;
}

export default function StageDetailPage() {
  const params = useParams<{ id: string }>();
  const qc = useQueryClient();
  const t = useTranslations('pages.stages');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const editFormLabels = useEditFormLabels();

  const { data: stage, isLoading } = useQuery<StageDetail>({
    queryKey: ['processing-stage', params.id],
    queryFn: () => api.get<StageDetail>(`/processing-stages/${params.id}`),
  });

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [externalCode, setExternalCode] = useState('');
  const [description, setDescription] = useState('');
  const [laborCost, setLaborCost] = useState('0');
  const [materialMarkup, setMaterialMarkup] = useState('0');
  const [standardHourCost, setStandardHourCost] = useState('0');
  const [allPerformers, setAllPerformers] = useState(true);
  const [distributionRequired, setDistributionRequired] = useState(false);
  const [shared, setShared] = useState(false);
  const [materialStoreId, setMaterialStoreId] = useState<string | null>(null);
  const [materialStoreLabel, setMaterialStoreLabel] = useState('');
  const [performers, setPerformers] = useState<PerformerRow[]>([]);
  const [picker, setPicker] = useState<null | 'store' | 'performer'>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!stage) return;
    setName(stage.name);
    setCode(stage.code ?? '');
    setExternalCode(stage.externalCode ?? '');
    setDescription(stage.description ?? '');
    setLaborCost(tiyinToSom(stage.laborCostMinor));
    setMaterialMarkup(String(stage.materialMarkup));
    setStandardHourCost(tiyinToSom(stage.standardHourCostMinor));
    setAllPerformers(stage.allPerformers);
    setDistributionRequired(stage.distributionRequired);
    setShared(stage.shared);
    setMaterialStoreId(stage.materialStoreId);
    setMaterialStoreLabel(stage.materialStore?.name ?? '');
    setPerformers(stage.performers ?? []);
  }, [stage]);

  const storeFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/stores?search=${encodeURIComponent(s)}&limit=20`,
    );
    return d.items.map((x) => ({ id: x.id, primary: x.name }));
  };
  const performerFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/employees?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((e) => ({ id: e.id, primary: e.name }));
  };

  const onConflict = useConflictReload(['processing-stage', params.id]);
  const saveMut = useApiMutation({
    onConflict,
    mutationFn: async () => {
      if (!name.trim()) throw new Error(tCommon('field_required', { field: tFields('name') }));
      if (!stage) throw new Error(tCommon('not_found'));
      await api.patch(`/processing-stages/${params.id}`, {
        version: stage.version,
        name,
        // null (not undefined) so emptying a field persists the clear.
        code: code || null,
        externalCode: externalCode || null,
        description: description || null,
        laborCostMinor: somToTiyin(laborCost),
        materialMarkup: Math.max(0, Math.trunc(Number(materialMarkup) || 0)),
        standardHourCostMinor: somToTiyin(standardHourCost),
        allPerformers,
        distributionRequired,
        shared,
        materialStoreId: materialStoreId ?? null,
        performers: performers.map((p) => p.id),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['processing-stage', params.id] });
      void qc.invalidateQueries({ queryKey: ['processing-stages'] });
    },
    onError: (e: Error) => {
      if (isOptimisticConflict(e)) return;
      setError(e.message);
    },
  });

  const archiveMut = useApiMutation({
    mutationFn: () =>
      stage?.archived
        ? api.post(`/processing-stages/${params.id}/restore`, {})
        : api.delete(`/processing-stages/${params.id}/archive`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['processing-stage', params.id] });
      void qc.invalidateQueries({ queryKey: ['processing-stages'] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-[var(--ms-text-muted)] text-sm">
        {tCommon('loading')}
      </div>
    );
  }
  if (!stage) {
    return (
      <div className="flex items-center justify-center p-8 text-[var(--ms-text-muted)] text-sm">
        {tCommon('not_found')}
      </div>
    );
  }

  return (
    <EditForm
      {...editFormLabels}
      testId="stage-detail-page"
      title={
        <span className="flex items-center gap-2">
          {stage.name}
          {stage.archived && (
            <Badge tone={archivedTone(stage.archived)}>{tCommon('archived')}</Badge>
          )}
        </span>
      }
      breadcrumbs={[{ label: t('title'), href: '/production/stages' }, { label: stage.name }]}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        saveMut.mutate();
      }}
      cancelHref="/production/stages"
      saving={saveMut.isPending}
      error={error}
    >
      <div className="flex justify-end">
        <Button
          type="button"
          variant="secondary"
          onClick={() => archiveMut.mutate()}
          disabled={archiveMut.isPending}
        >
          {stage.archived ? tCommon('restore') : tCommon('archive')}
        </Button>
      </div>

      <FormSection title={t('section_main')}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField id="name" label={tFields('name')} required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-test-id="field-name"
            />
          </FormField>
          <FormField id="code" label={tFields('code')}>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              data-test-id="field-code"
            />
          </FormField>
        </div>
        <FormField id="description" label={tFields('description')}>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            data-test-id="field-description"
          />
        </FormField>
        <FormField id="external-code" label={tFields('external_code')}>
          <Input
            value={externalCode}
            onChange={(e) => setExternalCode(e.target.value)}
            data-test-id="field-external-code"
          />
        </FormField>
      </FormSection>

      <FormSection title={t('section_cost')}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FormField id="labor-cost" label={`${t('labor_cost')} (so'm)`}>
            <Input
              type="text"
              inputMode="decimal"
              value={laborCost}
              onChange={(e) => setLaborCost(e.target.value)}
              className="text-right"
              data-test-id="field-labor-cost"
            />
          </FormField>
          <FormField id="material-markup" label={t('material_markup')}>
            <Input
              type="text"
              inputMode="numeric"
              value={materialMarkup}
              onChange={(e) => setMaterialMarkup(e.target.value)}
              className="text-right"
              data-test-id="field-material-markup"
            />
          </FormField>
          <FormField id="standard-hour-cost" label={`${t('standard_hour_cost')} (so'm)`}>
            <Input
              type="text"
              inputMode="decimal"
              value={standardHourCost}
              onChange={(e) => setStandardHourCost(e.target.value)}
              className="text-right"
              data-test-id="field-standard-hour-cost"
            />
          </FormField>
        </div>
        <FormField id="material-store" label={t('material_store')}>
          <CatalogPickerField
            value={
              materialStoreId
                ? { id: materialStoreId, label: materialStoreLabel || materialStoreId }
                : null
            }
            placeholder={t('material_store')}
            onPick={() => setPicker('store')}
            onClear={() => {
              setMaterialStoreId(null);
              setMaterialStoreLabel('');
            }}
          />
        </FormField>
      </FormSection>

      <FormSection title={t('section_performers')} description={t('performers_help')}>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={allPerformers}
              onCheckedChange={(v) => setAllPerformers(v === true)}
              data-test-id="field-all-performers"
            />
            <span>{t('all_performers')}</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={distributionRequired}
              onCheckedChange={(v) => setDistributionRequired(v === true)}
              data-test-id="field-distribution-required"
            />
            <span>{t('distribution_required')}</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={shared}
              onCheckedChange={(v) => setShared(v === true)}
              data-test-id="field-shared"
            />
            <span>{t('shared_label')}</span>
          </label>
        </div>
        {!allPerformers && (
          <div className="mt-3 space-y-2">
            {performers.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] px-3 py-1.5 text-sm"
              >
                <span>{p.name}</span>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setPerformers((xs) => xs.filter((x) => x.id !== p.id))}
                  aria-label={tCommon('delete')}
                >
                  <Icons.close className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPicker('performer')}
              data-test-id="add-performer"
            >
              <Icons.create className="h-4 w-4" />
              {t('add_performer')}
            </Button>
          </div>
        )}
      </FormSection>

      <DocumentTabs auditEntity="processingstage" entityId={stage.id} relatedGroups={[]} />

      <CatalogPicker
        open={picker === 'store'}
        onClose={() => setPicker(null)}
        title={t('material_store')}
        fetcher={storeFetcher}
        onSelect={(item) => {
          setMaterialStoreId(item.id);
          setMaterialStoreLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={picker === 'performer'}
        onClose={() => setPicker(null)}
        title={t('add_performer')}
        fetcher={performerFetcher}
        onSelect={(item) =>
          setPerformers((xs) =>
            xs.some((x) => x.id === item.id)
              ? xs
              : [...xs, { id: item.id, name: String(item.primary) }],
          )
        }
      />
    </EditForm>
  );
}
