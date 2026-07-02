'use client';

/**
 * /production/processes/[id] — «Техпроцесс» detail/edit.
 *
 * §126/round-6c — full moysklad parity. Loads `positions[]` (each
 * referencing a STANDALONE Этап) + the `nextPositions` DAG, lets the
 * user re-pick/replace stages, define new ones inline, and edit the
 * multi-successor links. PATCH /processing-processes/:id replace-all
 * when `stages` present. Re-saving a loaded position reuses its
 * standalone Этап (sends `processingStageId`) — no stage churn.
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

interface StageRef {
  id: string;
  name: string;
  code: string | null;
  laborCostMinor: string;
  materialMarkup: number;
  allPerformers: boolean;
}

interface PositionItem {
  id: string;
  position: number;
  processingStageId: string;
  processingStage: StageRef;
  nextPositionIds: string[];
}

interface ProcessDetail {
  id: string;
  version: number;
  name: string;
  code: string | null;
  externalCode: string | null;
  description: string | null;
  shared: boolean;
  archived: boolean;
  positions: PositionItem[];
  _count: { positions: number };
}

interface PosRow {
  _uid: string;
  mode: 'existing' | 'new';
  stageId: string | null;
  stageLabel: string;
  name: string;
  laborCost: string;
  materialMarkup: string;
  isDefault: boolean;
  allPerformers: boolean;
  nextUids: string[];
}

function uid() {
  return Math.random().toString(36).slice(2);
}

function somToTiyin(som: string): string {
  const n = Number(som);
  if (!Number.isFinite(n) || n < 0) return '0';
  return String(Math.round(n * 100));
}

/** integer tiyin string → so'm display string (trim trailing .00). */
function tiyinToSom(tiyin: string): string {
  const n = Number(tiyin);
  if (!Number.isFinite(n)) return '0';
  const som = n / 100;
  return Number.isInteger(som) ? String(som) : som.toFixed(2);
}

function newRow(): PosRow {
  return {
    _uid: uid(),
    mode: 'existing',
    stageId: null,
    stageLabel: '',
    name: '',
    laborCost: '0',
    materialMarkup: '0',
    isDefault: true,
    allPerformers: true,
    nextUids: [],
  };
}

export default function ProcessDetailPage() {
  const params = useParams<{ id: string }>();
  const qc = useQueryClient();
  const t = useTranslations('pages.processes');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const editFormLabels = useEditFormLabels();

  const { data: proc, isLoading } = useQuery<ProcessDetail>({
    queryKey: ['processing-process', params.id],
    queryFn: () => api.get<ProcessDetail>(`/processing-processes/${params.id}`),
  });

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [externalCode, setExternalCode] = useState('');
  const [description, setDescription] = useState('');
  const [shared, setShared] = useState(false);
  const [rows, setRows] = useState<PosRow[]>([]);
  const [pickerUid, setPickerUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!proc) return;
    setName(proc.name);
    setCode(proc.code ?? '');
    setExternalCode(proc.externalCode ?? '');
    setDescription(proc.description ?? '');
    setShared(proc.shared);
    // position.id is unique → use it as the stable row _uid so the
    // nextPositionIds (which are position ids) map straight to nextUids.
    setRows(
      proc.positions.map((p) => ({
        _uid: p.id,
        mode: 'existing' as const,
        stageId: p.processingStageId,
        stageLabel: p.processingStage.name,
        name: p.processingStage.name,
        laborCost: tiyinToSom(p.processingStage.laborCostMinor),
        materialMarkup: String(p.processingStage.materialMarkup),
        isDefault: true,
        allPerformers: p.processingStage.allPerformers ?? true,
        nextUids: p.nextPositionIds,
      })),
    );
  }, [proc]);

  const addRow = () => setRows((xs) => [...xs, newRow()]);
  const patchRow = (u: string, patch: Partial<PosRow>) =>
    setRows((xs) => xs.map((r) => (r._uid === u ? { ...r, ...patch } : r)));
  const removeRow = (u: string) =>
    setRows((xs) =>
      xs
        .filter((r) => r._uid !== u)
        .map((r) => ({ ...r, nextUids: r.nextUids.filter((x) => x !== u) })),
    );
  const toggleNext = (u: string, target: string) =>
    setRows((xs) =>
      xs.map((r) =>
        r._uid === u
          ? {
              ...r,
              nextUids: r.nextUids.includes(target)
                ? r.nextUids.filter((x) => x !== target)
                : [...r.nextUids, target],
            }
          : r,
      ),
    );

  const rowLabel = (r: PosRow, i: number) =>
    r.stageLabel || r.name || t('position_label', { n: i + 1 });

  const stageFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string; code: string | null }> }>(
      `/processing-stages?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((x) => ({ id: x.id, primary: x.name, secondary: x.code ?? undefined }));
  };

  // Optimistic-lock: re-hydrates automatically — the `[proc]` useEffect above
  // re-seeds the form whenever the detail query refetches, so no onReloaded
  // callback is needed (the discounts/opportunity precedent).
  const onConflict = useConflictReload(['processing-process', params.id]);

  const saveMut = useApiMutation({
    onConflict,
    mutationFn: async () => {
      if (!proc) throw new Error('not loaded');
      if (!name.trim()) throw new Error(tCommon('field_required', { field: tFields('name') }));
      if (rows.length === 0) throw new Error(t('err_no_positions'));
      for (const r of rows) {
        if (r.mode === 'existing' && !r.stageId) throw new Error(t('err_pick_stage'));
        if (r.mode === 'new' && !r.name.trim()) throw new Error(t('err_stage_name'));
      }
      const stages = rows.map((r, i) => ({
        ...(r.mode === 'existing' && r.stageId
          ? { processingStageId: r.stageId }
          : {
              name: r.name,
              laborCostMinor: somToTiyin(r.laborCost),
              materialMarkup: Math.max(0, Math.trunc(Number(r.materialMarkup) || 0)),
              default: r.isDefault,
              allPerformers: r.allPerformers,
            }),
        position: i,
        nextPositionIndexes: r.nextUids
          .map((u) => rows.findIndex((x) => x._uid === u))
          .filter((idx) => idx >= 0 && idx !== i),
      }));
      await api.patch(`/processing-processes/${params.id}`, {
        version: proc.version,
        name,
        // null (not undefined) so emptying a field persists the clear.
        code: code || null,
        externalCode: externalCode || null,
        description: description || null,
        shared,
        stages,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['processing-process', params.id] });
      void qc.invalidateQueries({ queryKey: ['processing-processes'] });
    },
    onError: (e: Error) => {
      if (isOptimisticConflict(e)) return;
      setError(e.message);
    },
  });

  const archiveMut = useApiMutation({
    mutationFn: () =>
      proc?.archived
        ? api.post(`/processing-processes/${params.id}/restore`, {})
        : api.delete(`/processing-processes/${params.id}/archive`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['processing-process', params.id] });
      void qc.invalidateQueries({ queryKey: ['processing-processes'] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-[var(--ms-text-muted)] text-sm">
        {tCommon('loading')}
      </div>
    );
  }
  if (!proc) {
    return (
      <div className="flex items-center justify-center p-8 text-[var(--ms-text-muted)] text-sm">
        {tCommon('not_found')}
      </div>
    );
  }

  return (
    <EditForm
      {...editFormLabels}
      testId="process-detail-page"
      title={
        <span className="flex items-center gap-2">
          {proc.name}
          {proc.archived && <Badge tone={archivedTone(proc.archived)}>{tCommon('archived')}</Badge>}
        </span>
      }
      breadcrumbs={[{ label: t('title'), href: '/production/processes' }, { label: proc.name }]}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        saveMut.mutate();
      }}
      cancelHref="/production/processes"
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
          {proc.archived ? tCommon('restore') : tCommon('archive')}
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField id="external-code" label={tFields('external_code')}>
            <Input
              value={externalCode}
              onChange={(e) => setExternalCode(e.target.value)}
              data-test-id="field-external-code"
            />
          </FormField>
          <FormField id="shared" label={t('shared_label')}>
            <label className="flex h-9 items-center gap-2 text-sm">
              <Checkbox
                checked={shared}
                onCheckedChange={(v) => setShared(v === true)}
                data-test-id="field-shared"
              />
              <span className="text-[var(--ms-text-muted)]">{t('shared_label')}</span>
            </label>
          </FormField>
        </div>
      </FormSection>

      <FormSection
        title={t('section_positions')}
        description={t('positions_count', { count: rows.length })}
      >
        {rows.length === 0 ? (
          <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] border-dashed py-6 text-center text-[var(--ms-text-muted)] text-sm">
            {tCommon('no_records')}
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((r, i) => (
              <div
                key={r._uid}
                className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] p-3"
                data-test-id={`position-row-${r._uid}`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                    {t('position_label', { n: i + 1 })}
                  </span>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => removeRow(r._uid)}
                    aria-label={tCommon('delete')}
                    data-test-id={`position-remove-${r._uid}`}
                  >
                    <Icons.close className="h-4 w-4" />
                  </Button>
                </div>

                <div className="mb-2 inline-flex overflow-hidden rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] text-sm">
                  {(['existing', 'new'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => patchRow(r._uid, { mode: m })}
                      className={`px-3 py-1 ${
                        r.mode === m
                          ? 'bg-[var(--ms-text-brand)] text-white'
                          : 'bg-[var(--ms-bg-surface)] text-[var(--ms-text-muted)]'
                      }`}
                      data-test-id={`position-mode-${m}-${r._uid}`}
                    >
                      {m === 'existing' ? t('tab_existing') : t('tab_new')}
                    </button>
                  ))}
                </div>

                {r.mode === 'existing' ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 truncate rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)] px-3 py-1.5 text-sm">
                      {r.stageLabel || (
                        <span className="text-[var(--ms-text-muted)]">{t('pick_stage')}</span>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setPickerUid(r._uid)}
                      data-test-id={`position-pick-${r._uid}`}
                    >
                      {r.stageId ? t('change_stage') : t('pick_stage')}
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr,130px,110px]">
                    <Input
                      value={r.name}
                      onChange={(e) => patchRow(r._uid, { name: e.target.value })}
                      placeholder={t('stage_name')}
                      data-test-id={`position-name-${r._uid}`}
                    />
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={r.laborCost}
                      onChange={(e) => patchRow(r._uid, { laborCost: e.target.value })}
                      className="text-right"
                      aria-label={t('stage_labor_cost')}
                      data-test-id={`position-labor-${r._uid}`}
                    />
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={r.materialMarkup}
                      onChange={(e) => patchRow(r._uid, { materialMarkup: e.target.value })}
                      className="text-right"
                      aria-label={t('stage_markup')}
                      data-test-id={`position-markup-${r._uid}`}
                    />
                  </div>
                )}

                {rows.length > 1 && (
                  <div className="mt-3">
                    <div className="mb-1 text-[var(--ms-text-muted)] text-xs">
                      {t('next_stages')} — <span className="italic">{t('next_stages_help')}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {rows
                        .filter((o) => o._uid !== r._uid)
                        .map((o) => {
                          const oi = rows.findIndex((x) => x._uid === o._uid);
                          const on = r.nextUids.includes(o._uid);
                          return (
                            <button
                              key={o._uid}
                              type="button"
                              onClick={() => toggleNext(r._uid, o._uid)}
                              className={`rounded-full border px-2.5 py-0.5 text-xs ${
                                on
                                  ? 'border-[var(--ms-text-brand)] bg-[var(--ms-text-brand)] text-white'
                                  : 'border-[var(--ms-border-default)] text-[var(--ms-text-muted)]'
                              }`}
                              data-test-id={`position-next-${r._uid}-${o._uid}`}
                            >
                              {rowLabel(o, oi)}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <Button type="button" variant="secondary" onClick={addRow} data-test-id="add-position">
          <Icons.create className="h-4 w-4" />
          {t('add_position')}
        </Button>
      </FormSection>

      <DocumentTabs auditEntity="processingprocess" entityId={proc.id} relatedGroups={[]} />

      <CatalogPicker
        open={pickerUid !== null}
        onClose={() => setPickerUid(null)}
        title={t('pick_stage')}
        fetcher={stageFetcher}
        onSelect={(item) => {
          if (pickerUid) {
            patchRow(pickerUid, {
              stageId: item.id,
              stageLabel: String(item.primary),
              mode: 'existing',
            });
          }
        }}
      />
    </EditForm>
  );
}
