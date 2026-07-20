'use client';

/**
 * Ombor kartochkasi — moysklad «Склад» kartochkasi bilan 1:1 (2026-07-16
 * talab; referens-skrinshot: online.moysklad.ru → Склад → Склады → ombor).
 *
 * Sklad bo'limidagi omborlar ro'yxatidan qator bosilganda SHU sahifa ochiladi
 * (avvalgi xato: Sozlamalar → Omborlar formasi ochilardi). Tuzilishi:
 *
 *   [Сохранить] [Закрыть]   (?) [Поместить в архив] [Изменить ▾]   Владелец · Изменения
 *   ┌ chap ustun (moysklad tartibida) ┐  ┌ o'ng: Адресное хранение товаров ┐
 *   │ *Наименование · Адрес ·         │  │ polka-svodka · Polka qo'shish · │
 *   │ Комментарий к адресу ·          │  │ yacheykalar jadvali · + Yacheyka│
 *   │ Комментарий · Код · Группа ·    │  └─────────────────────────────────┘
 *   │ Внешний код (havola)            │
 *   │ … Дополнительные поля           │
 *
 * Sozlamalardagi to'liq forma (/settings/stores/[id]) o'z joyida qoladi —
 * bu kartochka Sklad bo'limining moysklad-parity ko'rinishi.
 */

import { AddressStorageSection } from '@/components/stores/address-storage-section';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { api } from '@/lib/api-client';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import { Button, DropdownMenu, Icons, Input, NativeSelect, formatDate } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HelpCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const TEXTAREA_CLASS =
  'w-full px-3 py-2 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] hover:border-[var(--ms-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 placeholder:text-[var(--ms-text-placeholder)]';

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
  parentId: string | null;
  archived: boolean;
  updatedAt: string;
  owner: { id: string; name: string } | null;
}

interface StoreOption {
  id: string;
  name: string;
}

export default function StoreCardPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const t = useTranslations('pages.stores');
  const tCommon = useTranslations('common');
  const tBulk = useTranslations('bulk_actions');
  const tHeader = useTranslations('detail_header');
  const { runDestructive } = useDestructiveMutation();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [addressComment, setAddressComment] = useState('');
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('');
  const [parentId, setParentId] = useState('');
  const [externalCode, setExternalCode] = useState('');
  // «Внешний код» — moysklad'da havola; bosilganda input ochiladi.
  const [externalCodeOpen, setExternalCodeOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<StoreDetail>({
    queryKey: ['store', id],
    queryFn: () => api.get<StoreDetail>(`/admin/stores/${id}`),
    enabled: !!id,
  });

  const { data: parents } = useQuery<{ items: StoreOption[] }>({
    queryKey: ['stores', 'all'],
    queryFn: () => api.get<{ items: StoreOption[] }>('/admin/stores?archived=false&limit=100'),
  });

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setAddress(data.address ?? '');
    setAddressComment(data.addressFull?.comment ?? '');
    setDescription(data.description ?? '');
    setCode(data.code ?? '');
    setParentId(data.parentId ?? '');
    setExternalCode(data.externalCode ?? '');
  }, [data]);

  const isDirty =
    !!data &&
    (name !== data.name ||
      address !== (data.address ?? '') ||
      addressComment !== (data.addressFull?.comment ?? '') ||
      description !== (data.description ?? '') ||
      code !== (data.code ?? '') ||
      parentId !== (data.parentId ?? '') ||
      externalCode !== (data.externalCode ?? ''));

  const onConflict = useConflictReload(['store', id]);
  const saveMut = useMutation({
    mutationFn: () => {
      if (!data) throw new Error(tCommon('not_found'));
      if (!name.trim()) throw new Error(t('name_required'));
      // addressFull'ning boshqa maydonlari (sozlamalar formasida kiritilgan
      // strukturaviy manzil) saqlanadi — faqat comment shu yerdan boshqariladi.
      const nextAddressFull: AddressFull = {
        ...(data.addressFull ?? {}),
        comment: addressComment || null,
      };
      const hasAddressFull = Object.values(nextAddressFull).some((v) => v != null && v !== '');
      return api.patch<StoreDetail>(`/admin/stores/${id}`, {
        version: data.version,
        name,
        address: address || null,
        addressFull: hasAddressFull ? nextAddressFull : null,
        description: description || null,
        code: code || null,
        parentId: parentId || null,
        externalCode: externalCode || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store', id] });
      qc.invalidateQueries({ queryKey: ['stores'] });
    },
    onError: (e: Error) => {
      if (isOptimisticConflict(e)) {
        onConflict();
        return;
      }
      setError(e.message);
    },
  });

  const archiveMut = useMutation({
    mutationFn: () => api.post<StoreDetail>(`/admin/stores/${id}/archive`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['store', id] }),
    onError: (e: Error) => setError(e.message),
  });
  const restoreMut = useMutation({
    mutationFn: () => api.post<StoreDetail>(`/admin/stores/${id}/restore`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['store', id] }),
    onError: (e: Error) => setError(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: () => api.delete<unknown>(`/admin/stores/${id}`),
    onSuccess: () => router.push('/stores'),
    onError: (e: Error) => setError(e.message),
  });

  if (isLoading) {
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  }
  if (!data) {
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('not_found')}</div>;
  }

  const labelCls = 'text-[var(--ms-text-secondary)] text-sm';

  return (
    <div data-test-id="store-card-page">
      {/* ── Toolbar (moysklad 1:1): Сохранить · Закрыть · (?) · Поместить в
          архив · Изменить ▾ · o'ng: Владелец / Изменения ──
          2026-07-20f (responsive): <sm bo'yicha vertikal stack (flex-col) —
          eski `mx-auto` markazlash faqat sm:flex-row bir qatorli holatda
          ishlaydi; flex-wrap bilan aralashib nomutanosib markazlashuvga olib
          kelardi (audit topilmasi). */}
      <div className="sticky top-0 z-[var(--ms-z-sticky)] flex flex-col gap-2 border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-surface)] px-4 py-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="success"
            size="sm"
            onClick={() => {
              setError(null);
              saveMut.mutate();
            }}
            loading={saveMut.isPending}
            disabled={!isDirty || saveMut.isPending}
            data-test-id="store-card-save"
          >
            {tCommon('save')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => router.push('/stores')}
            data-test-id="store-card-close"
          >
            {tCommon('close')}
          </Button>
        </div>

        <div className="flex items-center gap-2 sm:mx-auto">
          <HelpCircle className="h-4 w-4 shrink-0 text-[var(--ms-text-muted)]" aria-hidden />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => (data.archived ? restoreMut.mutate() : archiveMut.mutate())}
            loading={archiveMut.isPending || restoreMut.isPending}
            data-test-id="store-card-archive"
          >
            {data.archived ? tCommon('restore') : tCommon('archive')}
          </Button>
          <DropdownMenu
            trigger={
              <Button variant="secondary" size="sm" data-test-id="store-card-edit-trigger">
                {tBulk('trigger')}
                <Icons.down className="h-4 w-4" />
              </Button>
            }
          >
            <DropdownMenu.Item
              destructive
              onSelect={() =>
                runDestructive({
                  title: tCommon('delete_confirm', { name: data.name }),
                  run: () => deleteMut.mutateAsync(),
                })
              }
              testId="store-card-delete"
            >
              {tBulk('delete')}
            </DropdownMenu.Item>
          </DropdownMenu>
        </div>

        {/* O'ng klaster — Владелец · Изменения (moysklad toolbar o'ng cheti). */}
        <div className="flex min-w-0 items-center gap-4 text-sm">
          {data.owner && (
            <span className="min-w-0 truncate font-medium text-[var(--ms-text-primary)]">
              {data.owner.name}
            </span>
          )}
          <span className="shrink-0 text-[var(--ms-text-muted)]">
            {tHeader('changed')}: {formatDate(data.updatedAt)}
          </span>
        </div>
      </div>

      {error && (
        <div
          className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700 text-sm"
          data-test-id="store-card-error"
        >
          {error}
        </div>
      )}

      {/* ── Tana: chap ustun (maydonlar) + o'ng (adresli saqlash) ── */}
      <div className="flex flex-col gap-8 px-6 py-5 lg:flex-row">
        <div className="w-full max-w-[360px] shrink-0 space-y-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="store-name" className={labelCls}>
              <span className="text-red-500">*</span> {t('name')}
            </label>
            <Input
              id="store-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-test-id="store-card-name"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="store-address" className={labelCls}>
              {t('address')}
            </label>
            <textarea
              id="store-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={`${TEXTAREA_CLASS} min-h-[38px]`}
              rows={1}
              data-test-id="store-card-address"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="store-address-comment" className={labelCls}>
              {t('address_comment')}
            </label>
            <textarea
              id="store-address-comment"
              value={addressComment}
              onChange={(e) => setAddressComment(e.target.value)}
              className={`${TEXTAREA_CLASS} min-h-[64px]`}
              data-test-id="store-card-address-comment"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="store-description" className={labelCls}>
              {t('description')}
            </label>
            <textarea
              id="store-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`${TEXTAREA_CLASS} min-h-[96px]`}
              data-test-id="store-card-description"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="store-code" className={labelCls}>
              {t('code')}
            </label>
            <Input
              id="store-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              data-test-id="store-card-code"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="store-parent" className={labelCls}>
              {t('parent')}
            </label>
            <NativeSelect
              id="store-parent"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              data-test-id="store-card-parent"
            >
              <option value="">{t('parent_root')}</option>
              {(parents?.items ?? [])
                .filter((s) => s.id !== id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </NativeSelect>
          </div>

          {/* «Внешний код» — moysklad havolasi: bosilganda input ochiladi. */}
          {externalCodeOpen || externalCode ? (
            <div className="flex flex-col gap-1">
              <label htmlFor="store-external-code" className={labelCls}>
                {t('external_code')}
              </label>
              <Input
                id="store-external-code"
                value={externalCode}
                onChange={(e) => setExternalCode(e.target.value)}
                data-test-id="store-card-external-code"
              />
            </div>
          ) : (
            <button
              type="button"
              className="text-[var(--ms-text-brand)] text-sm underline underline-offset-2 hover:no-underline"
              onClick={() => setExternalCodeOpen(true)}
              data-test-id="store-card-external-code-link"
            >
              {t('external_code')}
            </button>
          )}

          {/* «Дополнительные поля» — moysklad kartochkasining pastki bloki. */}
          <div className="pt-8">
            <h3 className="font-medium text-[#e8630a] text-base">{t('extra_fields_title')}</h3>
            <p className="mt-2 text-[var(--ms-text-secondary)] text-sm">{t('extra_fields_hint')}</p>
          </div>
        </div>

        {/* O'ng — Адресное хранение товаров (yacheykalar boshqaruvi). */}
        <div className="min-w-0 flex-1">
          <AddressStorageSection storeId={id} storeName={data.name} />
        </div>
      </div>
    </div>
  );
}
