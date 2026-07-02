'use client';

/**
 * /production/stages/new — standalone «Этап производства» create.
 * §126/round-6c. EditForm (mirrors /production/boms/new). Money
 * (labour / standard-hour cost) entered in so'm → tiyin on submit.
 * performers: employee multi-pick (moysklad — only relevant when
 * allPerformers=false; the API auto-normalises the flag).
 */

import { useEditFormLabels } from '@/hooks/use-edit-form-labels';
import { api } from '@/lib/api-client';
import {
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
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

function somToTiyin(som: string): string {
  const n = Number(som);
  if (!Number.isFinite(n) || n < 0) return '0';
  return String(Math.round(n * 100));
}

interface PerformerRow {
  id: string;
  name: string;
}

export default function NewStagePage() {
  const router = useRouter();
  const t = useTranslations('pages.stages');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const editFormLabels = useEditFormLabels();

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

  const createMut = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error(tCommon('field_required', { field: tFields('name') }));
      return api.post<{ id: string }>('/processing-stages', {
        name,
        code: code || undefined,
        externalCode: externalCode || undefined,
        description: description || undefined,
        laborCostMinor: somToTiyin(laborCost),
        materialMarkup: Math.max(0, Math.trunc(Number(materialMarkup) || 0)),
        standardHourCostMinor: somToTiyin(standardHourCost),
        allPerformers,
        distributionRequired,
        shared,
        materialStoreId: materialStoreId ?? undefined,
        performers: performers.map((p) => p.id),
      });
    },
    onSuccess: (created) => router.push(`/production/stages/${created.id}`),
    onError: (e: Error) => setError(e.message),
  });

  return (
    <EditForm
      {...editFormLabels}
      testId="stage-new-page"
      title={t('new_title')}
      breadcrumbs={[{ label: t('title'), href: '/production/stages' }, { label: t('new_title') }]}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        createMut.mutate();
      }}
      cancelHref="/production/stages"
      saving={createMut.isPending}
      error={error}
    >
      <FormSection title={t('section_main')}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField id="name" label={tFields('name')} required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
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
            value={materialStoreId ? { id: materialStoreId, label: materialStoreLabel } : null}
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
