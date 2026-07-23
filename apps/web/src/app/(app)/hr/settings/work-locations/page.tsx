'use client';

/**
 * HR Sozlamalar → Filiallar / Ish joylari. Work-location (geofence) CRUD.
 * Clones the roles-page shape; the create/edit modal embeds a Leaflet map picker.
 */

import type { MapValue } from '@/components/hr/map-radius-picker';
import { type HrWorkLocation, hrWorkLocationApi } from '@/lib/hr-api';
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  Skeleton,
  useConfirm,
  useToast,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

const MapRadiusPicker = dynamic(
  () => import('@/components/hr/map-radius-picker').then((m) => m.MapRadiusPicker),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[260px] w-full items-center justify-center rounded-[var(--ms-radius-md)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)] text-[var(--ms-text-muted)] text-sm">
        …
      </div>
    ),
  },
);

const TASHKENT: MapValue = { lat: 41.311, lng: 69.24, radius: 150 };

export default function WorkLocationsPage() {
  const t = useTranslations('pages.workLocations');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const { confirm } = useConfirm();
  const { toast } = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<HrWorkLocation | null>(null);

  const {
    data: rows = [],
    isLoading,
    error,
    refetch,
  } = useQuery<HrWorkLocation[]>({
    queryKey: ['hr-work-locations'],
    queryFn: () => hrWorkLocationApi.list(),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => hrWorkLocationApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-work-locations'] });
      toast.success(tCommon('saved'));
    },
    onError: (e: Error) => toast.error(tCommon('action_failed'), { description: e.message }),
  });

  const handleDelete = async (row: HrWorkLocation) => {
    if (row.employeeCount > 0) return;
    const ok = await confirm({
      title: t('delete_confirm'),
      description: row.name,
      confirmLabel: tCommon('delete'),
      tone: 'destructive',
    });
    if (ok) deleteMut.mutate(row.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-semibold text-2xl text-[var(--ms-text-strong)]">{t('title')}</h1>
          <p className="text-[var(--ms-text-muted)] text-sm">{t('subtitle')}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-test-id="work-location-create">
          + {t('create_button')}
        </Button>
      </div>

      <div className="overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]">
        {isLoading ? (
          <div className="p-4">
            <Skeleton className="h-8 w-full" />
          </div>
        ) : error ? (
          <ErrorState
            title={tCommon('action_failed')}
            description={(error as Error).message}
            onRetry={() => refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState title={t('empty')} />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-app)] text-[var(--ms-text-muted)] text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t('col_name')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('col_location')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('col_radius')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('col_employees')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('col_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-[var(--ms-border-default)] border-b last:border-b-0"
                  data-test-id={`work-location-row-${row.id}`}
                >
                  <td className="px-3 py-2 font-medium text-[var(--ms-text-primary)]">
                    {row.name}
                  </td>
                  <td className="px-3 py-2 font-mono text-[var(--ms-text-muted)] text-xs">
                    {row.lat.toFixed(5)}, {row.lng.toFixed(5)}
                  </td>
                  <td className="px-3 py-2 text-right text-[var(--ms-text-primary)]">
                    {row.radiusMeters} {t('meters')}
                  </td>
                  <td className="px-3 py-2 text-right text-[var(--ms-text-primary)]">
                    {row.employeeCount}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setEditTarget(row)}
                        title={tCommon('edit')}
                        aria-label={tCommon('edit')}
                      >
                        ✏️
                      </Button>
                      <span title={row.employeeCount > 0 ? t('delete_blocked') : undefined}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleDelete(row)}
                          disabled={row.employeeCount > 0}
                          title={row.employeeCount > 0 ? undefined : tCommon('delete')}
                          aria-label={tCommon('delete')}
                          className="hover:text-[var(--ms-text-destructive)]"
                        >
                          ❌
                        </Button>
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <BranchFormModal open={createOpen} onOpenChange={setCreateOpen} mode="create" />
      <BranchFormModal
        open={!!editTarget}
        onOpenChange={(v) => !v && setEditTarget(null)}
        mode="edit"
        initial={editTarget}
      />
    </div>
  );
}

function BranchFormModal({
  open,
  onOpenChange,
  mode,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  initial?: HrWorkLocation | null;
}) {
  const t = useTranslations('pages.workLocations');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [geo, setGeo] = useState<MapValue>(TASHKENT);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? '');
    setGeo(
      initial ? { lat: initial.lat, lng: initial.lng, radius: initial.radiusMeters } : TASHKENT,
    );
    setError(null);
  }, [open, initial]);

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = { name: name.trim(), lat: geo.lat, lng: geo.lng, radiusMeters: geo.radius };
      if (mode === 'edit' && initial) return hrWorkLocationApi.update(initial.id, payload);
      return hrWorkLocationApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-work-locations'] });
      toast.success(tCommon('saved'));
      onOpenChange(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  const submit = () => {
    setError(null);
    if (!name.trim()) {
      setError(t('form_name'));
      return;
    }
    saveMut.mutate();
  };

  const numField = (label: string, key: 'lat' | 'lng' | 'radius', step: string) => (
    <div className="flex flex-col gap-1">
      <span className="font-medium text-[var(--ms-text-primary)] text-sm">{label}</span>
      <Input
        type="number"
        step={step}
        value={String(geo[key])}
        onChange={(e) => setGeo((g) => ({ ...g, [key]: Number(e.target.value) }))}
      />
    </div>
  );

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={mode === 'edit' ? t('edit_title') : t('create_title')}
      widthClass="w-[680px]"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button onClick={submit} disabled={saveMut.isPending} data-test-id="work-location-save">
            {t('save')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-1">
          <span className="font-medium text-[var(--ms-text-primary)] text-sm">
            {t('form_name')}
            <span className="ml-1 text-[var(--ms-text-destructive)]">*</span>
          </span>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="lg:flex-1">
            <MapRadiusPicker value={geo} onChange={setGeo} />
          </div>
          <div className="flex flex-col gap-3 lg:w-[200px]">
            {numField(t('form_lat'), 'lat', 'any')}
            {numField(t('form_lng'), 'lng', 'any')}
            {numField(t('form_radius'), 'radius', '10')}
            <span className="text-[var(--ms-text-muted)] text-xs">{t('form_radius_hint')}</span>
          </div>
        </div>

        {error && (
          <div className="text-[var(--ms-text-destructive)] text-sm" role="alert">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
