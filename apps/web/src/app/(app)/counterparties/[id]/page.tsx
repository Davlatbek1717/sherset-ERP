'use client';

/**
 * /counterparties/[id] — inline-edit detail page (moysklad-parity).
 *
 * Paired with /counterparties/new: moysklad uses ONE unified create/edit form, so both
 * pages share the same 2-column shell and the same LEFT card order (live-grounded
 * 2026-06-21, docs/audits/counterparty-card-1to1-2026-06-20/live-2026-06-21/):
 *   1. О контрагенте  2. Контактные лица  3. Дополнительные поля
 *   4. Реквизиты (+ Расчётный счёт)  5. Скидки и цены  6. Доступ
 * Difference vs /new: useQuery hydration + PATCH (optimistic version) mutation, the inline
 * status/group managers (edit-only), and the live ContactPersons/BankAccounts CRUD.
 * The legacy «УЗ реквизиты» extras (МФО/ПИНФЛ/КПП/дата рожд./пол) are not in moysklad's
 * form; they are no longer shown but PRESERVED on save (the uzRequisites JSON is merged).
 */

import { BankAccountsSection } from '@/components/bank-accounts-section';
import { ContactPersonsSection } from '@/components/contact-persons-section';
import { CounterpartyActivityWidget } from '@/components/counterparty-activity-widget';
import {
  type AddressFull,
  CounterpartyAddressGroup,
} from '@/components/counterparty-address-group';
import {
  CounterpartyFieldRow,
  CounterpartyFormCard,
  CounterpartyFormShell,
} from '@/components/counterparty-form-layout';
import { DetailToolbar } from '@/components/document-detail';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useDetailNavigation } from '@/hooks/use-detail-navigation';
import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
import { attrReferenceEndpoint } from '@/lib/custom-attr';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Avatar,
  Badge,
  CatalogPicker,
  CatalogPickerField,
  Checkbox,
  type ComboboxItem,
  DropdownMenu,
  Icons,
  Input,
  MultiCombobox,
  NativeSelect,
  type PickerItem,
  Textarea,
  formatDate,
} from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

const CounterpartyFormSchema = z.object({
  name: z.string().min(1).max(255),
  legalTitle: z.string().max(255).optional(),
  // Denormalised single-line addresses (kept for the list «Адрес» column/filter); the
  // structured «Фактический»/«Юридический адрес» (Индекс…Другое + Комментарий) lives in
  // actualAddr/legalAddr state and is saved as actualAddressFull/legalAddressFull.
  legalAddress: z.string().optional(),
  actualAddress: z.string().max(255).optional(),
  // All 6 model values — the DB has RU-variant rows (individual/legal) imported
  // from moysklad; a 3-value enum here silently blocked editing ~99% of them.
  companyType: z
    .enum(['legalUZ', 'entrepreneurUZ', 'individualUZ', 'legal', 'entrepreneur', 'individual'])
    .default('legalUZ'),
  inn: z
    .string()
    .regex(/^(\d{9}|\d{14})?$/)
    .optional(),
  okoned: z.string().max(20).optional(),
  priceTypeId: z.string().uuid().nullable().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(20).optional(),
  fax: z.string().max(50).optional(),
  code: z.string().max(50).optional(),
  externalCode: z.string().max(255).optional(),
  discountCardNumber: z.string().max(100).optional(),
  description: z.string().optional(),
});

type Values = z.infer<typeof CounterpartyFormSchema>;

interface CounterpartyBalance {
  currency: string;
  balanceMinor: string;
  updatedAt: string;
}

interface CounterpartyDetail {
  id: string;
  name: string;
  legalTitle: string | null;
  legalAddress: string | null;
  // Structured «Юридический адрес» (Индекс…Другое + Комментарий к адресу).
  legalAddressFull: AddressFull | null;
  actualAddress: string | null;
  // Structured «Фактический адрес» (Индекс…Другое + Комментарий к адресу).
  actualAddressFull: AddressFull | null;
  companyType: string;
  email: string | null;
  phone: string | null;
  fax: string | null;
  code: string | null;
  externalCode: string | null;
  syncId: string | null;
  discountCardNumber: string | null;
  version: number;
  bonusPoints: number;
  description: string | null;
  uzRequisites: {
    inn?: string;
    okoned?: string;
    mfo?: string;
    account?: string;
    pinfl?: string;
    kpp?: string;
    birthDate?: string;
    gender?: 'male' | 'female';
  } | null;
  tags: string[];
  archived: boolean;
  // «Доступ» → «Общий доступ» (shared). The BE findById returns the full row,
  // so `shared` is present in the response even though the older FE type omitted it.
  shared: boolean;
  salesAmount: string;
  createdAt: string;
  updatedAt: string;
  owner: { id: string; name: string; email: string } | null;
  group: { id: string; name: string } | null; // «Отдел» (access dept)
  groups: { id: string; name: string }[]; // «Группы» (m2m membership)
  state: { id: string; name: string; color: string | null; stateType: string } | null;
  priceType: { id: string; name: string; currency: string } | null;
  bonusProgram: { id: string; name: string; currency: string } | null;
  balances: CounterpartyBalance[];
  // «Дополнительные поля» — custom-attribute values (string, or { id, name } for a
  // reference type like «Усто» = counterparty).
  attributes: Record<string, unknown> | null;
}

// One account-defined custom counterparty attribute (moysklad «Доп. поле»).
interface AttrMeta {
  id: string;
  code: string;
  name: string;
  type: string;
  archived: boolean;
  position: number;
  enumOptions?: Array<{ value: string; label: string }> | null;
  referenceEntity?: string | null;
}

export default function CounterpartyDetailPage() {
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tDetailHeader = useTranslations('detail_header');
  // «Копировать» reuses the shared bulk-actions label (no new i18n key).
  const tBulk = useTranslations('bulk_actions');
  const t = useTranslations('pages.counterparty_new');
  // Reuses the shared «Дополнительные поля» / «Контактные лица» titles.
  const tAttr = useTranslations('attributes');
  const tContacts = useTranslations('pages.contact_persons');
  const { id } = useParams<{ id: string }>();
  // Server-backed «N из ВСЕГО ‹ ›» (real total over the default list, shown even on a
  // direct-URL open — moysklad parity, mirrors CO/PO).
  const detailNav = useDetailNavigation('counterparties', id, { server: true });
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<CounterpartyDetail>({
    queryKey: ['counterparty', id],
    queryFn: () => api.get<CounterpartyDetail>(`/counterparties/${id}`),
  });

  const form = useForm<Values>({
    resolver: zodResolver(CounterpartyFormSchema),
    defaultValues: { companyType: 'legalUZ', name: '' },
  });

  // CRM «Статус» — tenant-defined State rows (entityType 'counterparty'), backed by
  // Counterparty.stateId. Managed outside RHF (mirrors the other non-RHF fields).
  const [stateId, setStateId] = useState<string | null>(null);
  const [stateChanged, setStateChanged] = useState(false);
  // «Группы» (m2m membership) — managed outside RHF like stateId.
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [groupsChanged, setGroupsChanged] = useState(false);
  const { data: crmStates } = useQuery<{
    items: { id: string; name: string; color: string | null }[];
  }>({
    queryKey: ['states', 'counterparty'],
    queryFn: () =>
      api.get<{ items: { id: string; name: string; color: string | null }[] }>(
        '/states?entityType=counterparty&archived=false',
      ),
    staleTime: 5 * 60 * 1000,
  });
  const crmStateOptions = crmStates?.items ?? [];
  // The saved status's colour → a solid coloured dropdown bar (moysklad parity, matches /new).
  const stateColor = crmStateOptions.find((s) => s.id === stateId)?.color ?? null;

  // «Группы» (counterparty groups, m2m) — options for the multi-select.
  const cpGroupsQuery = useQuery<{ items: { id: string; name: string }[] }>({
    queryKey: ['counterparty-groups'],
    queryFn: () => api.get('/counterparty-groups'),
    staleTime: 5 * 60 * 1000,
  });
  const groupItems: ComboboxItem[] = (cpGroupsQuery.data?.items ?? []).map((g) => ({
    value: g.id,
    label: g.name,
  }));

  // «Дополнительные поля» — account custom attributes, rendered type-aware (reference
  // → picker, enum → dropdown, else text). Managed outside RHF like groups.
  const { data: attrMeta } = useQuery<{ items: AttrMeta[] }>({
    queryKey: ['attribute-metadata', 'Counterparty'],
    queryFn: () => api.get('/attribute-metadata/entity/Counterparty'),
    staleTime: 5 * 60 * 1000,
  });
  const customFields = (attrMeta?.items ?? [])
    .filter((a) => !a.archived)
    .sort((a, b) => a.position - b.position);
  const [attrVals, setAttrVals] = useState<Record<string, unknown>>({});
  const [attrsChanged, setAttrsChanged] = useState(false);
  // The open reference-attr picker (counterparty/product/…); null when closed.
  const [attrPicker, setAttrPicker] = useState<{ code: string; type: string } | null>(null);

  // Structured «Фактический»/«Юридический адрес» (moysklad *Full). Loaded from the
  // detail in form.reset; composed into the actualAddress/legalAddress single lines.
  const [actualAddr, setActualAddr] = useState<AddressFull>({});
  const [legalAddr, setLegalAddr] = useState<AddressFull>({});
  const [addrChanged, setAddrChanged] = useState(false);

  // «Доступ» — owner (Сотрудник) · group (Отдел) · shared (Общий доступ).
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [ownerLabel, setOwnerLabel] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [groupLabel, setGroupLabel] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  const [accessChanged, setAccessChanged] = useState(false);
  const [accessPicker, setAccessPicker] = useState<'owner' | 'group' | null>(null);
  const ownerFetcher = async (q: string): Promise<PickerItem[]> => {
    const r = await api.get<{ items: { id: string; name: string }[] }>(
      `/employees?search=${encodeURIComponent(q)}&limit=20`,
    );
    return r.items.map((x) => ({ id: x.id, primary: x.name }));
  };
  const groupFetcher = async (q: string): Promise<PickerItem[]> => {
    const r = await api.get<{ items: { id: string; name: string }[] }>(
      `/groups?search=${encodeURIComponent(q)}&limit=20`,
    );
    return r.items.map((x) => ({ id: x.id, primary: x.name }));
  };

  // Price type (Цены) picker.
  const [pricePickerOpen, setPricePickerOpen] = useState(false);
  const [priceLabel, setPriceLabel] = useState<string | null>(null);
  const priceTypeFetcher = async (search: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string; currency: string }> }>(
      `/price-types?search=${encodeURIComponent(search)}&limit=50`,
    );
    return d.items.map((p) => ({ id: p.id, primary: p.name, secondary: p.currency }));
  };

  useEffect(() => {
    if (!data) return;
    form.reset({
      name: data.name,
      legalTitle: data.legalTitle ?? '',
      legalAddress: data.legalAddress ?? '',
      actualAddress: data.actualAddress ?? '',
      companyType: (data.companyType as Values['companyType']) ?? 'legalUZ',
      inn: data.uzRequisites?.inn ?? '',
      okoned: data.uzRequisites?.okoned ?? '',
      priceTypeId: data.priceType?.id ?? null,
      email: data.email ?? '',
      phone: data.phone ?? '',
      fax: data.fax ?? '',
      code: data.code ?? '',
      externalCode: data.externalCode ?? '',
      discountCardNumber: data.discountCardNumber ?? '',
      description: data.description ?? '',
    });
    setActualAddr(data.actualAddressFull ?? {});
    setLegalAddr(data.legalAddressFull ?? {});
    setAddrChanged(false);
    setStateId(data.state?.id ?? null);
    setStateChanged(false);
    setGroupIds(data.groups?.map((g) => g.id) ?? []);
    setGroupsChanged(false);
    setAttrVals(data.attributes ?? {});
    setAttrsChanged(false);
    setOwnerId(data.owner?.id ?? null);
    setOwnerLabel(data.owner?.name ?? null);
    setGroupId(data.group?.id ?? null);
    setGroupLabel(data.group?.name ?? null);
    setShared(data.shared ?? false);
    setAccessChanged(false);
    setPriceLabel(data.priceType?.name ?? null);
  }, [data, form]);

  const onConflict = useConflictReload(['counterparty', id]);
  const updateMut = useApiMutation({
    onConflict,
    mutationFn: async (v: Values) => {
      if (!data) throw new Error('not loaded');
      const payload = {
        version: data.version,
        name: v.name,
        legalTitle: v.legalTitle || null,
        legalAddress: v.legalAddress || null,
        actualAddress: v.actualAddress || null,
        // Structured «Фактический»/«Юридический адрес» (Индекс…Другое + Комментарий) —
        // always send the current object so clearing every field (→ {}) actually persists
        // (sending undefined would leave the old structured address in place).
        actualAddressFull: actualAddr,
        legalAddressFull: legalAddr,
        companyType: v.companyType,
        email: v.email || null,
        phone: v.phone || null,
        fax: v.fax || null,
        code: v.code || null,
        externalCode: v.externalCode || null,
        discountCardNumber: v.discountCardNumber || null,
        description: v.description || null,
        stateId: stateId ?? null,
        ownerId: ownerId ?? null,
        groupId: groupId ?? null,
        // Only send «Группы» when touched — absent leaves memberships unchanged.
        ...(groupsChanged ? { groupIds } : {}),
        // «Дополнительные поля» — send the full attributes map only when touched.
        ...(attrsChanged ? { attributes: attrVals } : {}),
        shared,
        priceTypeId: v.priceTypeId || null,
        // «Реквизиты» shows only ИНН + ОКЭД; the legacy UZ keys (mfo/account/pinfl/kpp/
        // birthDate/gender) are not in moysklad's form — preserve any saved values by
        // merging the existing uzRequisites rather than overwriting it.
        uzRequisites: {
          ...(data.uzRequisites ?? {}),
          inn: v.inn || undefined,
          okoned: v.okoned || undefined,
        },
      };
      return api.patch<CounterpartyDetail>(`/counterparties/${id}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['counterparty', id] });
      qc.invalidateQueries({ queryKey: ['counterparties'] });
    },
  });

  const archiveMut = useApiMutation({
    mutationFn: (archive: boolean) =>
      api.post(`/counterparties/${id}/${archive ? 'archive' : 'restore'}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['counterparty', id] });
      qc.invalidateQueries({ queryKey: ['counterparties'] });
    },
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/counterparties/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['counterparties'] });
      router.push('/counterparties');
    },
  });

  // «...» → «Копировать» — server clone, then open the new card.
  const cloneMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/counterparties/${id}/clone`, {}),
    onSuccess: (clone) => {
      qc.invalidateQueries({ queryKey: ['counterparties'] });
      router.push(`/counterparties/${clone.id}`);
    },
  });

  const { runDestructive } = useDestructiveMutation();

  if (isLoading)
    return <div className="p-8 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  if (!data) return <div className="p-8 text-sm">{tCommon('not_found')}</div>;

  const handleSave = form.handleSubmit((v) => updateMut.mutate(v));

  return (
    <form
      onSubmit={handleSave}
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="counterparty-detail-page"
    >
      {/* moysklad counterparty-card header (live-grounded 2026-06-25 cp-card-pixel/00-top-viewport.png):
          ONLY Сохранить · Закрыть · [N из M ‹ ›] · «Изменения: <user> <date>» + avatar + «...».
          NO Изменить/Создать документ/Печать/Отправить (those are the DOCUMENT toolbar — moysklad's
          counterparty card has none of them). Delete + archive live inside the «...» menu. */}
      <DetailToolbar
        isDirty={
          form.formState.isDirty ||
          stateChanged ||
          accessChanged ||
          groupsChanged ||
          attrsChanged ||
          addrChanged
        }
        isSaving={updateMut.isPending}
        onSave={() => handleSave()}
        onClose={() => router.push('/counterparties')}
        position={detailNav.position}
        onPrev={detailNav.onPrev}
        onNext={detailNav.onNext}
        apiData={data}
        hideEditMenu
        hidePrintMenu
        hideSendMenu
        rightSlot={
          <div className="flex items-center gap-2" data-test-id="detail-header">
            {data.archived && (
              <Badge tone={archivedTone(data.archived)} data-test-id="archived-badge">
                {tCommon('archived')}
              </Badge>
            )}
            <div className="flex flex-col items-end text-xs leading-tight">
              <span className="text-[var(--ms-text-muted)]" data-test-id="detail-header-updated">
                {tDetailHeader('changed')}: {data.owner?.name ?? '—'}
              </span>
              <span className="text-[var(--ms-text-muted)]">{formatDate(data.updatedAt)}</span>
            </div>
            <Avatar
              name={data.owner?.name ?? '—'}
              size="md"
              data-test-id="detail-header-author-avatar"
            />
            {/* moysklad's «...» — far right, after the avatar. Delete + archive live here
                (moysklad's counterparty card hides these behind the three-dot menu). */}
            <DropdownMenu
              align="end"
              testId="cp-actions-menu"
              trigger={
                <button
                  type="button"
                  aria-label={tCommon('actions')}
                  className="flex h-7 w-7 items-center justify-center rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-muted)]"
                  data-test-id="cp-actions-trigger"
                >
                  <Icons.more className="h-4 w-4" />
                </button>
              }
            >
              {/* moysklad «...» order (live-grounded): Копировать · Поместить в архив · Удалить. */}
              <DropdownMenu.Item
                icon={<Icons.copy className="h-4 w-4" />}
                disabled={cloneMut.isPending}
                onSelect={() => cloneMut.mutate()}
                testId="cp-action-clone"
              >
                {tBulk('copy')}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                icon={<Icons.archive className="h-4 w-4" />}
                onSelect={() => archiveMut.mutate(!data.archived)}
                testId="cp-action-archive"
              >
                {data.archived ? tCommon('restore') : tCommon('archive')}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                destructive
                icon={<Icons.delete className="h-4 w-4" />}
                disabled={data.archived}
                onSelect={() =>
                  runDestructive({
                    title: tCommon('delete_confirm', { name: data.name }),
                    run: () => deleteMut.mutateAsync(),
                    successMessage: tCommon('saved'),
                  })
                }
                testId="cp-action-delete"
              >
                {tCommon('delete')}
              </DropdownMenu.Item>
            </DropdownMenu>
          </div>
        }
      />

      <main className="flex-1 px-4 py-4">
        {/* Optimistic-lock conflicts are handled by the reload dialog (onConflict),
            so keep them out of the inline error banner. */}
        {((updateMut.error && !isOptimisticConflict(updateMut.error)) || archiveMut.error) && (
          <Alert tone="destructive" className="mb-3">
            {((updateMut.error ?? archiveMut.error) as Error).message}
          </Alert>
        )}

        <CounterpartyFormShell
          top={
            // moysklad's «* Наименование» input is ~605px, NOT the full shell width.
            <div className="max-w-[620px]">
              <label
                htmlFor="name"
                className="mb-1 block font-medium text-[var(--ms-text-primary)] text-sm"
              >
                <span className="text-[var(--ms-text-destructive)]">*</span> {t('name_label')}
              </label>
              <Input
                id="name"
                data-test-id="field-name"
                invalid={!!form.formState.errors.name}
                {...form.register('name')}
              />
              {form.formState.errors.name?.message && (
                <p className="mt-1 text-[var(--ms-text-destructive)] text-xs">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>
          }
          left={
            <div className="space-y-4">
              {/* 1. «О контрагенте» — Статус (+ inline «Настроить…») + Группы first. */}
              <CounterpartyFormCard title={t('section_about')} testId="cp-card-about">
                <CounterpartyFieldRow label={tFields('state')}>
                  <div className="flex gap-2">
                    <NativeSelect
                      id="state"
                      data-test-id="field-state"
                      className="flex-1"
                      value={stateId ?? ''}
                      onChange={(e) => {
                        setStateId(e.target.value || null);
                        setStateChanged(true);
                      }}
                      style={
                        stateColor
                          ? { backgroundColor: stateColor, borderColor: stateColor, color: '#fff' }
                          : undefined
                      }
                    >
                      <option value="" style={{ color: 'var(--ms-text-primary)' }}>
                        —
                      </option>
                      {crmStateOptions.map((s) => (
                        <option key={s.id} value={s.id} style={{ color: 'var(--ms-text-primary)' }}>
                          {s.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                </CounterpartyFieldRow>
                {/* «Группы» — moysklad shows just the picker (groups are managed in settings,
                    NOT created inline on the card). */}
                <CounterpartyFieldRow label={t('groups_label')}>
                  <MultiCombobox
                    value={groupIds}
                    onChange={(next) => {
                      setGroupIds(next);
                      setGroupsChanged(true);
                    }}
                    items={groupItems}
                    placeholder=""
                    testId="field-groups"
                  />
                </CounterpartyFieldRow>
                <CounterpartyFieldRow label={t('phone_label')}>
                  <Input id="phone" data-test-id="field-phone" {...form.register('phone')} />
                </CounterpartyFieldRow>
                <CounterpartyFieldRow label={t('fax_label')}>
                  <Input id="fax" data-test-id="field-fax" {...form.register('fax')} />
                </CounterpartyFieldRow>
                <CounterpartyFieldRow
                  label={t('email_label')}
                  hint={form.formState.errors.email?.message}
                >
                  <Input
                    id="email"
                    type="email"
                    data-test-id="field-email"
                    invalid={!!form.formState.errors.email}
                    {...form.register('email')}
                  />
                </CounterpartyFieldRow>
                <Controller
                  control={form.control}
                  name="actualAddress"
                  render={({ field }) => (
                    <CounterpartyAddressGroup
                      label={t('actual_address_label')}
                      idPrefix="actual"
                      value={actualAddr}
                      onChange={(next) => {
                        setActualAddr(next);
                        setAddrChanged(true);
                      }}
                      text={field.value ?? ''}
                      onTextChange={field.onChange}
                    />
                  )}
                />
                <CounterpartyFieldRow label={t('description_label')}>
                  <Textarea
                    id="description"
                    data-test-id="field-description"
                    {...form.register('description')}
                  />
                </CounterpartyFieldRow>
                <CounterpartyFieldRow label={t('code_label')}>
                  <Input id="code" data-test-id="field-code" {...form.register('code')} />
                </CounterpartyFieldRow>
                {/* «Внешний код» — moysklad puts it last in «О контрагенте» (after Код). */}
                <CounterpartyFieldRow label={t('external_code_label')}>
                  <Input
                    id="externalCode"
                    data-test-id="field-externalCode"
                    {...form.register('externalCode')}
                  />
                </CounterpartyFieldRow>
              </CounterpartyFormCard>

              {/* 2. «Контактные лица» — live CRUD (add navigates to the contact form). */}
              <CounterpartyFormCard title={tContacts('title')} testId="cp-card-contacts">
                <ContactPersonsSection counterpartyId={data.id} bare />
              </CounterpartyFormCard>

              {/* 3. «Дополнительные поля» — type-aware account custom attributes. */}
              {customFields.length > 0 && (
                <CounterpartyFormCard title={tAttr('section_title')} testId="cp-card-attrs">
                  {customFields.map((attr) => {
                    if (attrReferenceEndpoint(attr)) {
                      const v = attrVals[attr.code] as { id?: string; name?: string } | undefined;
                      return (
                        <CounterpartyFieldRow key={attr.code} label={attr.name}>
                          <CatalogPickerField
                            value={v?.id ? { id: v.id, label: v.name || v.id } : null}
                            placeholder=""
                            onPick={() => setAttrPicker({ code: attr.code, type: attr.type })}
                            onClear={() => {
                              setAttrVals((prev) => {
                                const next = { ...prev };
                                delete next[attr.code];
                                return next;
                              });
                              setAttrsChanged(true);
                            }}
                            inlineFetcher={async (q) => {
                              const ep = attrReferenceEndpoint(attr);
                              if (!ep) return [];
                              const r = await api.get<{ items: { id: string; name: string }[] }>(
                                `${ep}?search=${encodeURIComponent(q)}&limit=20`,
                              );
                              return r.items.map((x) => ({ id: x.id, primary: x.name }));
                            }}
                            onInlineSelect={(item) => {
                              setAttrVals((prev) => ({
                                ...prev,
                                [attr.code]: { id: item.id, name: String(item.primary) },
                              }));
                              setAttrsChanged(true);
                            }}
                            testId={`field-attr-${attr.code}`}
                          />
                        </CounterpartyFieldRow>
                      );
                    }
                    if (attr.enumOptions?.length) {
                      return (
                        <CounterpartyFieldRow key={attr.code} label={attr.name}>
                          <NativeSelect
                            value={(attrVals[attr.code] as string) ?? ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setAttrVals((prev) => ({ ...prev, [attr.code]: val }));
                              setAttrsChanged(true);
                            }}
                            data-test-id={`field-attr-${attr.code}`}
                          >
                            <option value="">—</option>
                            {attr.enumOptions.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </NativeSelect>
                        </CounterpartyFieldRow>
                      );
                    }
                    return (
                      <CounterpartyFieldRow key={attr.code} label={attr.name}>
                        <Input
                          value={(attrVals[attr.code] as string) ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setAttrVals((prev) => ({ ...prev, [attr.code]: val }));
                            setAttrsChanged(true);
                          }}
                          data-test-id={`field-attr-${attr.code}`}
                        />
                      </CounterpartyFieldRow>
                    );
                  })}
                </CounterpartyFormCard>
              )}

              {/* 4. «Реквизиты» — legal/tax requisites + bank accounts (live CRUD). */}
              <CounterpartyFormCard title={t('section_requisites')} testId="cp-card-requisites">
                <CounterpartyFieldRow label={t('company_type_label')}>
                  <NativeSelect
                    id="companyType"
                    {...form.register('companyType')}
                    data-test-id="field-companyType"
                  >
                    <option value="legalUZ">{t('company_type_legalUZ')}</option>
                    <option value="entrepreneurUZ">{t('company_type_entrepreneurUZ')}</option>
                    <option value="individualUZ">{t('company_type_individualUZ')}</option>
                    <option value="legal">{t('company_type_legal')}</option>
                    <option value="entrepreneur">{t('company_type_entrepreneur')}</option>
                    <option value="individual">{t('company_type_individual')}</option>
                  </NativeSelect>
                </CounterpartyFieldRow>
                <CounterpartyFieldRow
                  label={t('inn_label')}
                  hint={form.formState.errors.inn?.message}
                >
                  <Input
                    id="inn"
                    data-test-id="field-inn"
                    inputMode="numeric"
                    invalid={!!form.formState.errors.inn}
                    {...form.register('inn')}
                  />
                </CounterpartyFieldRow>
                <CounterpartyFieldRow label={t('legal_title_label')}>
                  <Textarea
                    id="legalTitle"
                    data-test-id="field-legalTitle"
                    rows={2}
                    {...form.register('legalTitle')}
                  />
                </CounterpartyFieldRow>
                <Controller
                  control={form.control}
                  name="legalAddress"
                  render={({ field }) => (
                    <CounterpartyAddressGroup
                      label={t('legal_address_label')}
                      idPrefix="legal"
                      value={legalAddr}
                      onChange={(next) => {
                        setLegalAddr(next);
                        setAddrChanged(true);
                      }}
                      text={field.value ?? ''}
                      onTextChange={field.onChange}
                    />
                  )}
                />
                <CounterpartyFieldRow label={t('okoned_label')}>
                  <Input id="okoned" data-test-id="field-okoned" {...form.register('okoned')} />
                </CounterpartyFieldRow>
                {/* «+ Расчётный счёт» — inline bank-account CRUD, embedded in the card. */}
                <BankAccountsSection counterpartyId={data.id} bare />
              </CounterpartyFormCard>

              {/* 5. «Скидки и цены» — default price type + discount card number. */}
              <CounterpartyFormCard
                title={t('section_discounts_prices')}
                testId="cp-card-discounts"
              >
                <CounterpartyFieldRow label={t('price_type_label')}>
                  <Controller
                    control={form.control}
                    name="priceTypeId"
                    render={({ field }) => (
                      <>
                        <CatalogPickerField
                          value={
                            field.value ? { id: field.value, label: priceLabel ?? '...' } : null
                          }
                          placeholder=""
                          onPick={() => setPricePickerOpen(true)}
                          onClear={() => {
                            field.onChange(null);
                            setPriceLabel(null);
                          }}
                          inlineFetcher={priceTypeFetcher}
                          onInlineSelect={(item) => {
                            field.onChange(item.id);
                            setPriceLabel(String(item.primary));
                          }}
                          testId="field-priceTypeId"
                        />
                        <CatalogPicker
                          open={pricePickerOpen}
                          onClose={() => setPricePickerOpen(false)}
                          title={t('price_type_pick_title')}
                          fetcher={priceTypeFetcher}
                          onSelect={(item) => {
                            field.onChange(item.id);
                            setPriceLabel(String(item.primary));
                          }}
                          searchPlaceholder={t('price_type_search')}
                          testId="price-type-picker"
                        />
                      </>
                    )}
                  />
                </CounterpartyFieldRow>
                <CounterpartyFieldRow label={t('discount_card_label')}>
                  <Input
                    id="discountCardNumber"
                    data-test-id="field-discountCardNumber"
                    {...form.register('discountCardNumber')}
                  />
                </CounterpartyFieldRow>
              </CounterpartyFormCard>

              {/* 6. «Доступ» — owner / department / shared (bottom, mirrors moysklad). */}
              <CounterpartyFormCard title={t('section_access')} testId="cp-card-access">
                <CounterpartyFieldRow label={t('owner_label')}>
                  <CatalogPickerField
                    value={ownerId ? { id: ownerId, label: ownerLabel ?? '…' } : null}
                    placeholder=""
                    onPick={() => setAccessPicker('owner')}
                    onClear={() => {
                      setOwnerId(null);
                      setOwnerLabel(null);
                      setAccessChanged(true);
                    }}
                    inlineFetcher={ownerFetcher}
                    onInlineSelect={(item) => {
                      setOwnerId(item.id);
                      setOwnerLabel(String(item.primary));
                      setAccessChanged(true);
                    }}
                    testId="field-owner"
                  />
                </CounterpartyFieldRow>
                <CounterpartyFieldRow label={t('department_label')}>
                  <CatalogPickerField
                    value={groupId ? { id: groupId, label: groupLabel ?? '…' } : null}
                    placeholder=""
                    onPick={() => setAccessPicker('group')}
                    onClear={() => {
                      setGroupId(null);
                      setGroupLabel(null);
                      setAccessChanged(true);
                    }}
                    inlineFetcher={groupFetcher}
                    onInlineSelect={(item) => {
                      setGroupId(item.id);
                      setGroupLabel(String(item.primary));
                      setAccessChanged(true);
                    }}
                    testId="field-group"
                  />
                </CounterpartyFieldRow>
                <CounterpartyFieldRow label={t('shared_label')}>
                  <Checkbox
                    id="shared"
                    checked={shared}
                    onCheckedChange={(v) => {
                      setShared(!!v);
                      setAccessChanged(true);
                    }}
                    data-test-id="field-shared"
                  />
                </CounterpartyFieldRow>
              </CounterpartyFormCard>

              <CatalogPicker
                open={accessPicker === 'owner'}
                onClose={() => setAccessPicker(null)}
                title={t('owner_pick_title')}
                fetcher={ownerFetcher}
                onSelect={(item) => {
                  setOwnerId(item.id);
                  setOwnerLabel(String(item.primary));
                  setAccessChanged(true);
                }}
                searchPlaceholder={t('owner_search')}
                testId="owner-picker"
              />
              <CatalogPicker
                open={accessPicker === 'group'}
                onClose={() => setAccessPicker(null)}
                title={t('department_pick_title')}
                fetcher={groupFetcher}
                onSelect={(item) => {
                  setGroupId(item.id);
                  setGroupLabel(String(item.primary));
                  setAccessChanged(true);
                }}
                searchPlaceholder={t('department_search')}
                testId="group-picker"
              />
              {/* Reference custom-attribute picker (e.g. «Усто» → counterparty). */}
              <CatalogPicker
                open={!!attrPicker}
                onClose={() => setAttrPicker(null)}
                title={customFields.find((a) => a.code === attrPicker?.code)?.name ?? ''}
                fetcher={async (q): Promise<PickerItem[]> => {
                  const attr = customFields.find((a) => a.code === attrPicker?.code);
                  const ep = attr ? attrReferenceEndpoint(attr) : null;
                  if (!ep) return [];
                  const r = await api.get<{ items: { id: string; name: string }[] }>(
                    `${ep}?search=${encodeURIComponent(q)}&limit=20`,
                  );
                  return r.items.map((x) => ({ id: x.id, primary: x.name }));
                }}
                onSelect={(item) => {
                  if (!attrPicker) return;
                  const code = attrPicker.code;
                  setAttrVals((prev) => ({
                    ...prev,
                    [code]: { id: item.id, name: String(item.primary) },
                  }));
                  setAttrsChanged(true);
                }}
              />
            </div>
          }
          right={
            /* moysklad CRM activity widget — События/Задачи/Документы/Файлы/Показатели. */
            <CounterpartyActivityWidget counterpartyId={data.id} counterpartyName={data.name} />
          }
        />
      </main>
    </form>
  );
}
