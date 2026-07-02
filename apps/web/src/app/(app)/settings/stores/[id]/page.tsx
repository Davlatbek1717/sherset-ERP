'use client';

import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useEditFormLabels } from '@/hooks/use-edit-form-labels';
import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import {
  Badge,
  Button,
  Checkbox,
  EditForm,
  FormField,
  FormSection,
  Input,
  NativeSelect,
  Textarea,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const TEXTAREA_CLASS =
  'w-full min-h-[80px] px-3 py-2 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] hover:border-[var(--ms-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 placeholder:text-[var(--ms-text-placeholder)]';

interface AddressFull {
  postalCode?: string | null;
  country?: string | null;
  region?: string | null;
  district?: string | null;
  city?: string | null;
  street?: string | null;
  house?: string | null;
  apartment?: string | null;
  comment?: string | null;
}

interface StoreDetail {
  id: string;
  version: number;
  name: string;
  code: string | null;
  externalCode: string | null;
  description: string | null;
  address: string | null;
  addressFull: AddressFull | null;
  pathName: string | null;
  parentId: string | null;
  zones: string[];
  slots: string[];
  shared: boolean;
  allowNegativeStock: boolean;
  archived: boolean;
}

interface StoreOption {
  id: string;
  name: string;
}

interface StoresList {
  items: StoreOption[];
}

/** Convert a comma/newline-separated user input into a clean string list. */
function parseList(input: string): string[] {
  return input
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function EditStorePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const t = useTranslations('pages.stores');
  const tCommon = useTranslations('common');
  const tForm = useTranslations('form');
  const editFormLabels = useEditFormLabels();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [externalCode, setExternalCode] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [parentId, setParentId] = useState<string>('');
  const [zonesText, setZonesText] = useState('');
  const [slotsText, setSlotsText] = useState('');
  const [shared, setShared] = useState(false);
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [addr, setAddr] = useState<AddressFull>({});
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<StoreDetail>({
    queryKey: ['store', id],
    queryFn: () => api.get<StoreDetail>(`/admin/stores/${id}`),
    enabled: !!id,
  });

  const { data: parents } = useQuery<StoresList>({
    queryKey: ['stores', 'all'],
    queryFn: () => api.get<StoresList>('/admin/stores?archived=false&limit=100'),
  });

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setCode(data.code ?? '');
    setExternalCode(data.externalCode ?? '');
    setDescription(data.description ?? '');
    setAddress(data.address ?? '');
    setParentId(data.parentId ?? '');
    setZonesText(data.zones.join(', '));
    setSlotsText(data.slots.join(', '));
    setShared(data.shared);
    setAllowNegativeStock(data.allowNegativeStock);
    setAddr(data.addressFull ?? {});
  }, [data]);

  // On an optimistic-lock 409 (another user changed this store while the form
  // was open) show the reload dialog. The form re-hydrates automatically: the
  // `useEffect([data])` above re-seeds every field setter when the invalidated
  // query refetches, so no explicit reHydrate callback is needed.
  const onConflict = useConflictReload(['store', id]);
  const updateMut = useMutation({
    mutationFn: () => {
      if (!data) throw new Error(tCommon('not_found'));
      if (!name.trim()) throw new Error(t('name_required'));
      const cleanAddr = Object.fromEntries(
        Object.entries(addr).filter(([, v]) => v != null && v !== ''),
      );
      return api.patch<StoreDetail>(`/admin/stores/${id}`, {
        // Optimistic-lock token — the version this form loaded (from the
        // server query `data`, NOT form state, which has no version field).
        version: data.version,
        name,
        code: code || null,
        externalCode: externalCode || null,
        description: description || null,
        address: address || null,
        addressFull: Object.keys(cleanAddr).length > 0 ? cleanAddr : null,
        parentId: parentId || null,
        zones: parseList(zonesText),
        slots: parseList(slotsText),
        shared,
        allowNegativeStock,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store', id] });
      qc.invalidateQueries({ queryKey: ['stores'] });
    },
    onError: (e: Error) => {
      // A real concurrency conflict — let the reload dialog handle it and keep
      // it out of the inline error banner.
      if (isOptimisticConflict(e)) {
        onConflict();
        return;
      }
      setError(e.message);
    },
  });

  const archiveMut = useMutation({
    mutationFn: () => api.post<StoreDetail>(`/admin/stores/${id}/archive`, {}),
    onSuccess: () => router.push('/settings/stores'),
    onError: (e: Error) => setError(e.message),
  });

  const restoreMut = useMutation({
    mutationFn: () => api.post<StoreDetail>(`/admin/stores/${id}/restore`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['store', id] }),
    onError: (e: Error) => setError(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete<unknown>(`/admin/stores/${id}`),
    onSuccess: () => router.push('/settings/stores'),
    onError: (e: Error) => setError(e.message),
  });

  const { runDestructive } = useDestructiveMutation();

  if (isLoading) {
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  }
  if (!data) {
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('not_found')}</div>;
  }

  // Filter out self from parent picker (no self-ref).
  const parentOptions = (parents?.items ?? []).filter((s) => s.id !== id);

  return (
    <EditForm
      {...editFormLabels}
      testId="stores-edit-page"
      title={t('edit_title')}
      breadcrumbs={[{ label: t('title'), href: '/settings/stores' }, { label: data.name }]}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        updateMut.mutate();
      }}
      cancelHref="/settings/stores"
      saving={updateMut.isPending}
      error={error}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone={archivedTone(data.archived)}>
            {data.archived ? tCommon('archived') : tCommon('active')}
          </Badge>
          {data.pathName && data.pathName !== data.name && (
            <span className="font-mono text-[var(--ms-text-muted)] text-xs">{data.pathName}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {data.archived ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => restoreMut.mutate()}
              loading={restoreMut.isPending}
            >
              {tCommon('restore')}
            </Button>
          ) : (
            <Button
              type="button"
              variant="tertiary"
              onClick={() => archiveMut.mutate()}
              loading={archiveMut.isPending}
            >
              {tCommon('archive')}
            </Button>
          )}
          <Button
            type="button"
            variant="destructive"
            onClick={() =>
              runDestructive({
                title: tCommon('delete_confirm', { name: data.name }),
                run: () => deleteMut.mutateAsync(),
              })
            }
            loading={deleteMut.isPending}
          >
            {tCommon('delete')}
          </Button>
        </div>
      </div>

      <FormSection title={tForm('section_main')}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField id="name" label={t('name')} required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-test-id="field-name"
            />
          </FormField>
          <FormField id="code" label={t('code')}>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              data-test-id="field-code"
            />
          </FormField>
          <FormField id="externalCode" label={t('external_code')}>
            <Input
              value={externalCode}
              onChange={(e) => setExternalCode(e.target.value)}
              data-test-id="field-external-code"
            />
          </FormField>
          <FormField id="parentId" label={t('parent')}>
            <NativeSelect
              id="parentId"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              data-test-id="field-parent"
            >
              <option value="">{t('parent_root')}</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </div>
        <FormField id="description" label={t('description')}>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={TEXTAREA_CLASS}
            data-test-id="field-description"
          />
        </FormField>
      </FormSection>

      <FormSection title={t('section_address')}>
        <FormField id="address" label={t('address')}>
          <Textarea
            id="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className={TEXTAREA_CLASS}
            data-test-id="field-address"
          />
        </FormField>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <FormField id="postalCode" label={t('postal_code')}>
            <Input
              value={addr.postalCode ?? ''}
              onChange={(e) => setAddr({ ...addr, postalCode: e.target.value || null })}
            />
          </FormField>
          <FormField id="country" label={t('country')}>
            <Input
              value={addr.country ?? ''}
              onChange={(e) => setAddr({ ...addr, country: e.target.value || null })}
            />
          </FormField>
          <FormField id="region" label={t('region')}>
            <Input
              value={addr.region ?? ''}
              onChange={(e) => setAddr({ ...addr, region: e.target.value || null })}
            />
          </FormField>
          <FormField id="district" label={t('district')}>
            <Input
              value={addr.district ?? ''}
              onChange={(e) => setAddr({ ...addr, district: e.target.value || null })}
            />
          </FormField>
          <FormField id="city" label={t('city')}>
            <Input
              value={addr.city ?? ''}
              onChange={(e) => setAddr({ ...addr, city: e.target.value || null })}
            />
          </FormField>
          <FormField id="street" label={t('street')}>
            <Input
              value={addr.street ?? ''}
              onChange={(e) => setAddr({ ...addr, street: e.target.value || null })}
            />
          </FormField>
          <FormField id="house" label={t('house')}>
            <Input
              value={addr.house ?? ''}
              onChange={(e) => setAddr({ ...addr, house: e.target.value || null })}
            />
          </FormField>
          <FormField id="apartment" label={t('apartment')}>
            <Input
              value={addr.apartment ?? ''}
              onChange={(e) => setAddr({ ...addr, apartment: e.target.value || null })}
            />
          </FormField>
        </div>
        <FormField id="addressComment" label={t('address_comment')}>
          <Textarea
            id="addressComment"
            value={addr.comment ?? ''}
            onChange={(e) => setAddr({ ...addr, comment: e.target.value || null })}
            className={TEXTAREA_CLASS}
            data-test-id="field-address-comment"
          />
        </FormField>
      </FormSection>

      <FormSection title={t('section_layout')}>
        <FormField id="zones" label={t('zones')} hint={t('zones_hint')}>
          <Textarea
            id="zones"
            value={zonesText}
            onChange={(e) => setZonesText(e.target.value)}
            className={TEXTAREA_CLASS}
            placeholder={t('zones_placeholder')}
            data-test-id="field-zones"
          />
        </FormField>
        <FormField id="slots" label={t('slots')} hint={t('slots_hint')}>
          <Textarea
            id="slots"
            value={slotsText}
            onChange={(e) => setSlotsText(e.target.value)}
            className={TEXTAREA_CLASS}
            placeholder={t('slots_placeholder')}
            data-test-id="field-slots"
          />
        </FormField>
      </FormSection>

      <FormSection title={t('section_advanced')}>
        <FormField id="allowNegativeStock" label="">
          <label
            htmlFor="allowNegativeStock"
            className="inline-flex cursor-pointer items-center gap-2 text-sm"
          >
            <Checkbox
              id="allowNegativeStock"
              checked={allowNegativeStock}
              onCheckedChange={(v) => setAllowNegativeStock(!!v)}
              data-test-id="field-allow-negative-stock"
            />
            <span>{t('allow_negative_stock')}</span>
          </label>
        </FormField>
        <FormField id="shared" label="">
          <label htmlFor="shared" className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              id="shared"
              checked={shared}
              onCheckedChange={(v) => setShared(!!v)}
              data-test-id="field-shared"
            />
            <span>{t('shared')}</span>
          </label>
        </FormField>
      </FormSection>
    </EditForm>
  );
}
