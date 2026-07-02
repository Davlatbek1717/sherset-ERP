'use client';

/**
 * /counterparties/new — create form (moysklad-parity).
 *
 * Live-grounded 2026-06-21 against the REAL moysklad counterparty create form
 * (docs/audits/counterparty-card-1to1-2026-06-20/live-2026-06-21/01-all-expanded-full.png):
 * a top «* Наименование» input, then a LEFT stack of cards in moysklad's exact order —
 *   1. О контрагенте  (Статус · Группы · Телефон · Факс · Эл.адрес · Факт.адрес ·
 *                      Комментарий к адресу · Комментарий · Код · Внешний код)
 *   2. Контактные лица  (staged on create → POSTed after the counterparty exists)
 *   3. Дополнительные поля  (account custom attributes)
 *   4. Реквизиты  (Тип контрагента · ИНН · Полное наименование · Юр.адрес ·
 *                  Комментарий к адресу · ОКЭД · + Расчётный счёт [staged])
 *   5. Скидки и цены  (Цены · Номер диск. карты)
 *   6. Доступ  (Сотрудник · Отдел · Общий доступ)
 * — and a RIGHT activity-tab region (empty pre-save, counterpartyId=null). moysklad uses ONE
 * unified create/edit form (#company/edit), so create exposes Статус + Доступ + Группы too.
 * The «Налоги» card (top, collapsed) needs a tax model we don't have → deferred.
 */

import { type StagedFile, readFileAsBase64 } from '@/components/attachments-section';
import { CounterpartyActivityWidget } from '@/components/counterparty-activity-widget';
import {
  type AddressFull,
  CounterpartyAddressGroup,
  hasAddress,
} from '@/components/counterparty-address-group';
import {
  CounterpartyFieldRow,
  CounterpartyFormCard,
  CounterpartyFormShell,
} from '@/components/counterparty-form-layout';
import { DetailToolbar } from '@/components/document-detail';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { attrReferenceEndpoint } from '@/lib/custom-attr';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Button,
  CatalogPicker,
  CatalogPickerField,
  Checkbox,
  type ComboboxItem,
  Icons,
  Input,
  MultiCombobox,
  NativeSelect,
  type PickerItem,
  Textarea,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

const CounterpartyFormSchema = z.object({
  name: z.string().min(1).max(255),
  legalTitle: z.string().max(255).optional(),
  // Denormalised single-line addresses (kept for the list «Адрес» column/filter).
  // The structured «Фактический»/«Юридический адрес» (Индекс…Другое + Комментарий)
  // lives in actualAddr/legalAddr state and is sent as actualAddressFull/legalAddressFull.
  legalAddress: z.string().optional(),
  actualAddress: z.string().max(255).optional(),
  companyType: z.enum(['legalUZ', 'entrepreneurUZ', 'individualUZ']).default('legalUZ'),
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

// «Контактные лица» / «Расчётный счёт» rows staged on the create form (no saved
// counterparty yet) → POSTed once the counterparty exists (moysklad's create-form behaviour).
interface StagedContact {
  _key: string; // local-only stable React key (excluded from the POST)
  name: string;
  position: string;
  phone: string;
  email: string;
  description: string;
}
interface StagedBank {
  accountNumber: string;
  bankName: string;
  bankLocation: string;
  correspondentAccount: string;
  mfo: string;
  currency: string;
  isMain: boolean;
}
const EMPTY_BANK: StagedBank = {
  accountNumber: '',
  bankName: '',
  bankLocation: '',
  correspondentAccount: '',
  mfo: '',
  currency: 'UZS',
  isMain: false,
};

export default function NewCounterpartyPage() {
  const router = useRouter();
  const t = useTranslations('pages.counterparty_new');
  const tFields = useTranslations('fields');
  // Reuses the shared «Дополнительные поля» / «Контактные лица» titles (no edit to ru/uz.json).
  const tAttr = useTranslations('attributes');
  const tContacts = useTranslations('pages.contact_persons');
  const tCommon = useTranslations('common');
  const form = useForm<Values>({
    resolver: zodResolver(CounterpartyFormSchema),
    defaultValues: { companyType: 'legalUZ', name: '' },
  });

  // «Группы» (m2m membership) — multi-select against the account's groups. moysklad's
  // create form is just the dropdown — no inline create/manage (those live elsewhere).
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const cpGroupsQuery = useQuery<{ items: { id: string; name: string }[] }>({
    queryKey: ['counterparty-groups'],
    queryFn: () => api.get('/counterparty-groups'),
    staleTime: 5 * 60 * 1000,
  });
  const groupItems: ComboboxItem[] = (cpGroupsQuery.data?.items ?? []).map((g) => ({
    value: g.id,
    label: g.name,
  }));

  // «Дополнительные поля» — account custom attributes, type-aware (mirrors the edit form).
  const { data: attrMeta } = useQuery<{ items: AttrMeta[] }>({
    queryKey: ['attribute-metadata', 'Counterparty'],
    queryFn: () => api.get('/attribute-metadata/entity/Counterparty'),
    staleTime: 5 * 60 * 1000,
  });
  const customFields = (attrMeta?.items ?? [])
    .filter((a) => !a.archived)
    .sort((a, b) => a.position - b.position);
  const [attrVals, setAttrVals] = useState<Record<string, unknown>>({});
  const [attrPicker, setAttrPicker] = useState<{ code: string; type: string } | null>(null);

  // Price type (Цены) — the default price list applied to this customer.
  const [pricePickerOpen, setPricePickerOpen] = useState(false);
  const [priceLabel, setPriceLabel] = useState<string | null>(null);
  const priceTypeFetcher = async (search: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string; currency: string }> }>(
      `/price-types?search=${encodeURIComponent(search)}&limit=50`,
    );
    return d.items.map((p) => ({ id: p.id, primary: p.name, secondary: p.currency }));
  };

  // CRM «Статус» + «Доступ» (owner / department / shared). moysklad uses ONE unified
  // create+edit card, so the create form exposes these too; all are accepted by
  // CreateCounterpartySchema. Managed outside RHF (like groups/attrs).
  const [stateId, setStateId] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [ownerLabel, setOwnerLabel] = useState<string | null>(null);
  const [deptId, setDeptId] = useState<string | null>(null);
  const [deptLabel, setDeptLabel] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  const [accessPicker, setAccessPicker] = useState<'owner' | 'group' | null>(null);
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
  // moysklad pre-selects the default (first/entry) status «Новый» on a new counterparty —
  // orange in the live form. The /states list is position-ordered, so the first row is the
  // entry status; pre-select it once, when the options first arrive (the user can still clear).
  const defaultStateInited = useRef(false);
  useEffect(() => {
    const first = (crmStates?.items ?? [])[0];
    if (!defaultStateInited.current && first) {
      setStateId(first.id);
      defaultStateInited.current = true;
    }
  }, [crmStates]);
  // The selected status's colour → a solid coloured dropdown bar (moysklad parity).
  const stateColor = crmStateOptions.find((s) => s.id === stateId)?.color ?? null;

  // «Доступ» defaults — moysklad pre-fills a new counterparty's Сотрудник = the current
  // user and Отдел = the user's department. useAuth carries id+name; the department needs
  // /auth/me (the user's group, which the auth token doesn't include). Pre-filled once
  // each (a ref guard), so the user can still clear or change them. The BE stamps the same
  // owner/group defaults on create, so the form just SHOWS what will be saved.
  const { user } = useAuth();
  const { data: me } = useQuery<{ group: { id: string; name: string } | null }>({
    queryKey: ['auth', 'me'],
    queryFn: () => api.get('/auth/me'),
    staleTime: 5 * 60 * 1000,
  });
  const ownerDefaultInited = useRef(false);
  const deptDefaultInited = useRef(false);
  useEffect(() => {
    if (!ownerDefaultInited.current && user) {
      setOwnerId(user.id);
      setOwnerLabel(user.name);
      ownerDefaultInited.current = true;
    }
  }, [user]);
  useEffect(() => {
    if (!deptDefaultInited.current && me?.group) {
      setDeptId(me.group.id);
      setDeptLabel(me.group.name);
      deptDefaultInited.current = true;
    }
  }, [me]);

  const ownerFetcher = async (q: string): Promise<PickerItem[]> => {
    const r = await api.get<{ items: { id: string; name: string }[] }>(
      `/employees?search=${encodeURIComponent(q)}&limit=20`,
    );
    return r.items.map((x) => ({ id: x.id, primary: x.name }));
  };
  const deptFetcher = async (q: string): Promise<PickerItem[]> => {
    const r = await api.get<{ items: { id: string; name: string }[] }>(
      `/groups?search=${encodeURIComponent(q)}&limit=20`,
    );
    return r.items.map((x) => ({ id: x.id, primary: x.name }));
  };

  // «Контактные лица» — staged locally (moysklad lets you add them on the create form),
  // POSTed to /contact-persons after the counterparty is created.
  // moysklad shows each contact as a full editable card (ФИО/Должность/Телефон/Эл.адрес/
  // Комментарий); «+ Контактное лицо» appends a blank card. POSTed (those with a name) on save.
  const [stagedContacts, setStagedContacts] = useState<StagedContact[]>([]);
  const blankContact = (): StagedContact => ({
    _key: crypto.randomUUID(),
    name: '',
    position: '',
    phone: '',
    email: '',
    description: '',
  });
  const updateContact = (i: number, patch: Partial<StagedContact>) =>
    setStagedContacts((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  // «Фактический» / «Юридический адрес» — structured (moysklad *Full); composed into
  // the denormalised actualAddress/legalAddress text fields kept in the RHF form.
  const [actualAddr, setActualAddr] = useState<AddressFull>({});
  const [legalAddr, setLegalAddr] = useState<AddressFull>({});

  // «Файлы» — staged locally (moysklad lets you attach files on the create form), POSTed to
  // /attachments after the counterparty exists.
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);

  // «Расчётный счёт» — staged locally, POSTed to /counterparties/:id/bank-accounts after create.
  const [stagedBanks, setStagedBanks] = useState<StagedBank[]>([]);
  const [bankDraft, setBankDraft] = useState<StagedBank>(EMPTY_BANK);
  const [bankFormOpen, setBankFormOpen] = useState(false);
  const [bankError, setBankError] = useState<string | null>(null);
  const addStagedBank = () => {
    if (!bankDraft.accountNumber.trim()) {
      setBankError(t('bank_account_required'));
      return;
    }
    if (bankDraft.mfo.trim() && !/^\d{5}$/.test(bankDraft.mfo.trim())) {
      setBankError(t('bank_bik_invalid'));
      return;
    }
    setStagedBanks((prev) => [...prev, bankDraft]);
    setBankDraft(EMPTY_BANK);
    setBankError(null);
    setBankFormOpen(false);
  };

  const createMut = useApiMutation({
    mutationFn: async (v: Values) => {
      const payload = {
        name: v.name,
        legalTitle: v.legalTitle || undefined,
        legalAddress: v.legalAddress || undefined,
        actualAddress: v.actualAddress || undefined,
        // Structured «Фактический»/«Юридический адрес» (Индекс…Другое + Комментарий) →
        // the moysklad *Full JSON. Sent only when the user opened the helper and filled
        // something (otherwise the plain single-line text above is enough).
        actualAddressFull: hasAddress(actualAddr) ? actualAddr : undefined,
        legalAddressFull: hasAddress(legalAddr) ? legalAddr : undefined,
        companyType: v.companyType,
        email: v.email || undefined,
        phone: v.phone || undefined,
        fax: v.fax || undefined,
        code: v.code || undefined,
        externalCode: v.externalCode || undefined,
        discountCardNumber: v.discountCardNumber || undefined,
        description: v.description || undefined,
        groupIds: groupIds.length > 0 ? groupIds : undefined,
        attributes: Object.keys(attrVals).length > 0 ? attrVals : undefined,
        priceTypeId: v.priceTypeId || undefined,
        // CRM «Статус» + «Доступ» (deptId maps to the BE `groupId` access-department FK).
        stateId: stateId || undefined,
        ownerId: ownerId || undefined,
        groupId: deptId || undefined,
        shared: shared || undefined,
        ...(v.inn || v.okoned
          ? { uzRequisites: { inn: v.inn || undefined, okoned: v.okoned || undefined } }
          : {}),
      };
      return api.post<{ id: string }>('/counterparties', payload);
    },
    onSuccess: async (created) => {
      // moysklad's create form lets you add contacts + bank accounts before the entity
      // exists; persist the staged rows now (Promise.allSettled — a single row failing
      // must not block the redirect to the freshly-created counterparty).
      const tasks: Promise<unknown>[] = [
        // Skip blank cards — only contacts with a «ФИО» are persisted.
        ...stagedContacts
          .filter((c) => c.name.trim())
          .map((c) =>
            api.post('/contact-persons', {
              counterpartyId: created.id,
              name: c.name.trim(),
              position: c.position.trim() || undefined,
              phone: c.phone.trim() || undefined,
              email: c.email.trim() || undefined,
              description: c.description.trim() || undefined,
            }),
          ),
        ...stagedBanks.map((b) =>
          api.post(`/counterparties/${created.id}/bank-accounts`, {
            accountNumber: b.accountNumber.trim(),
            bankName: b.bankName.trim() || undefined,
            bankLocation: b.bankLocation.trim() || undefined,
            correspondentAccount: b.correspondentAccount.trim() || undefined,
            ...(b.mfo.trim() ? { mfo: b.mfo.trim() } : {}),
            currency: b.currency || 'UZS',
            isMain: b.isMain,
          }),
        ),
        // «Файлы» staged before save → upload now that the counterparty exists.
        ...stagedFiles.map(async (s) =>
          api.post('/attachments', {
            entity: 'Counterparty',
            entityId: created.id,
            filename: s.file.name,
            mime: s.file.type || 'application/octet-stream',
            dataBase64: await readFileAsBase64(s.file),
          }),
        ),
      ];
      if (tasks.length > 0) await Promise.allSettled(tasks);
      router.push(`/counterparties/${created.id}`);
    },
  });

  // react-hook-form's resolver runs the Zod schema, but the schema
  // intentionally carries no per-field error messages so the UI can
  // localise them. We map the failure code → t(...) here.
  const errorMessage = (field: 'name' | 'inn' | 'email'): string | undefined => {
    if (!form.formState.errors[field]) return undefined;
    return t(`${field}_${field === 'name' ? 'required' : 'invalid'}` as 'name_required');
  };

  const handleSave = form.handleSubmit((v) => createMut.mutate(v));

  return (
    <form
      onSubmit={handleSave}
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="counterparty-new-page"
    >
      <DetailToolbar
        isDirty={form.formState.isDirty}
        isSaving={createMut.isPending}
        onSave={() => handleSave()}
        onClose={() => router.push('/counterparties')}
        createMenuItems={[]}
        // moysklad's counterparty create toolbar is Сохранить + Закрыть only — nothing
        // to edit/print/send on an unsaved record.
        hideEditMenu
        hideSendMenu
        hidePrintMenu
      />
      {/* moysklad NEW form: NO title/state/author row — the name is the «* Наименование»
          input at the shell top (a DetailHeader would duplicate it). */}
      <main className="flex-1 px-4 py-4">
        {createMut.error && (
          <Alert tone="destructive" className="mb-3">
            {(createMut.error as Error).message}
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
              {form.formState.errors.name && (
                <p className="mt-1 text-[var(--ms-text-destructive)] text-xs">
                  {errorMessage('name')}
                </p>
              )}
            </div>
          }
          left={
            <div className="space-y-4">
              {/* 1. «О контрагенте» — Статус + Группы first, then contacts/address/codes. */}
              <CounterpartyFormCard title={t('section_about')} testId="cp-card-about">
                <CounterpartyFieldRow label={tFields('state')}>
                  <NativeSelect
                    id="state"
                    data-test-id="field-state"
                    value={stateId ?? ''}
                    onChange={(e) => setStateId(e.target.value || null)}
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
                </CounterpartyFieldRow>
                <CounterpartyFieldRow label={t('groups_label')}>
                  <MultiCombobox
                    value={groupIds}
                    onChange={setGroupIds}
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
                <CounterpartyFieldRow label={t('email_label')} hint={errorMessage('email')}>
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
                      onChange={setActualAddr}
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

              {/* 2. «Контактные лица» — moysklad shows each as a full editable card. */}
              <CounterpartyFormCard title={tContacts('title')} testId="cp-card-contacts">
                <div className="space-y-3">
                  {stagedContacts.map((c, i) => (
                    <div
                      key={c._key}
                      className="relative space-y-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-3 pt-7"
                      data-test-id="contact-staged-card"
                    >
                      <button
                        type="button"
                        onClick={() => setStagedContacts((prev) => prev.filter((_, j) => j !== i))}
                        className="absolute top-1.5 right-2 text-[var(--ms-text-muted)] hover:text-[var(--ms-text-destructive)]"
                        aria-label={tCommon('delete')}
                        data-test-id="contact-remove"
                      >
                        ×
                      </button>
                      <CounterpartyFieldRow
                        label={
                          <>
                            <span className="text-[var(--ms-text-destructive)]">*</span>{' '}
                            {tContacts('full_name')}
                          </>
                        }
                      >
                        <Input
                          value={c.name}
                          onChange={(e) => updateContact(i, { name: e.target.value })}
                          data-test-id="contact-field-name"
                        />
                      </CounterpartyFieldRow>
                      <CounterpartyFieldRow label={tContacts('position')}>
                        <Input
                          value={c.position}
                          onChange={(e) => updateContact(i, { position: e.target.value })}
                          data-test-id="contact-field-position"
                        />
                      </CounterpartyFieldRow>
                      <CounterpartyFieldRow label={tContacts('phone')}>
                        <Input
                          value={c.phone}
                          onChange={(e) => updateContact(i, { phone: e.target.value })}
                          data-test-id="contact-field-phone"
                        />
                      </CounterpartyFieldRow>
                      <CounterpartyFieldRow label={t('email_label')}>
                        <Input
                          type="email"
                          value={c.email}
                          onChange={(e) => updateContact(i, { email: e.target.value })}
                          data-test-id="contact-field-email"
                        />
                      </CounterpartyFieldRow>
                      <CounterpartyFieldRow label={t('description_label')}>
                        <Textarea
                          value={c.description}
                          onChange={(e) => updateContact(i, { description: e.target.value })}
                          data-test-id="contact-field-description"
                        />
                      </CounterpartyFieldRow>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setStagedContacts((prev) => [...prev, blankContact()])}
                    data-test-id="contact-add"
                  >
                    <Icons.create className="h-4 w-4" />
                    {tContacts('create_button')}
                  </Button>
                </div>
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
                            onClear={() =>
                              setAttrVals((prev) => {
                                const next = { ...prev };
                                delete next[attr.code];
                                return next;
                              })
                            }
                            inlineFetcher={async (q) => {
                              const ep = attrReferenceEndpoint(attr);
                              if (!ep) return [];
                              const r = await api.get<{ items: { id: string; name: string }[] }>(
                                `${ep}?search=${encodeURIComponent(q)}&limit=20`,
                              );
                              return r.items.map((x) => ({ id: x.id, primary: x.name }));
                            }}
                            onInlineSelect={(item) =>
                              setAttrVals((prev) => ({
                                ...prev,
                                [attr.code]: { id: item.id, name: String(item.primary) },
                              }))
                            }
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
                            onChange={(e) =>
                              setAttrVals((prev) => ({ ...prev, [attr.code]: e.target.value }))
                            }
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
                          onChange={(e) =>
                            setAttrVals((prev) => ({ ...prev, [attr.code]: e.target.value }))
                          }
                          data-test-id={`field-attr-${attr.code}`}
                        />
                      </CounterpartyFieldRow>
                    );
                  })}
                </CounterpartyFormCard>
              )}

              {/* 4. «Реквизиты» — legal/tax requisites + bank accounts (staged). */}
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
                  </NativeSelect>
                </CounterpartyFieldRow>
                <CounterpartyFieldRow label={t('inn_label')} hint={errorMessage('inn')}>
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
                      onChange={setLegalAddr}
                      text={field.value ?? ''}
                      onTextChange={field.onChange}
                    />
                  )}
                />
                <CounterpartyFieldRow label={t('okoned_label')}>
                  <Input id="okoned" data-test-id="field-okoned" {...form.register('okoned')} />
                </CounterpartyFieldRow>

                {/* «+ Расчётный счёт» — staged bank accounts (POSTed after create). */}
                {stagedBanks.length > 0 && (
                  <div
                    className="overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]"
                    data-test-id="staged-banks"
                  >
                    <table className="w-full text-sm">
                      <tbody>
                        {stagedBanks.map((b, i) => (
                          <tr
                            key={`${b.accountNumber}-${i}`}
                            className="border-[var(--ms-border-default)] border-b last:border-b-0"
                          >
                            <td className="px-3 py-2 font-mono text-xs">{b.accountNumber}</td>
                            <td className="px-3 py-2 text-[var(--ms-text-muted)]">
                              {b.bankName || '—'}
                            </td>
                            <td className="px-3 py-2 text-[var(--ms-text-muted)]">{b.currency}</td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  setStagedBanks((prev) => prev.filter((_, j) => j !== i))
                                }
                                className="text-[var(--ms-text-muted)] hover:text-[var(--ms-text-destructive)]"
                                aria-label={tCommon('delete')}
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {bankFormOpen ? (
                  <div
                    className="space-y-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-3"
                    data-test-id="bank-staged-form"
                  >
                    {/* Live-grounded order (org-accounts-live-2026-06-21):
                        БИК · Банк · Адрес · Корр. счёт · Расчётный счёт* · Валюта счёта · Основной. */}
                    <CounterpartyFieldRow label={t('bank_bik_label')}>
                      <Input
                        value={bankDraft.mfo}
                        inputMode="numeric"
                        onChange={(e) => setBankDraft((d) => ({ ...d, mfo: e.target.value }))}
                        data-test-id="bank-field-mfo"
                      />
                    </CounterpartyFieldRow>
                    <CounterpartyFieldRow label={t('bank_col_bank')}>
                      <Input
                        value={bankDraft.bankName}
                        onChange={(e) => setBankDraft((d) => ({ ...d, bankName: e.target.value }))}
                        data-test-id="bank-field-bankName"
                      />
                    </CounterpartyFieldRow>
                    <CounterpartyFieldRow label={t('bank_location_label')}>
                      <Input
                        value={bankDraft.bankLocation}
                        onChange={(e) =>
                          setBankDraft((d) => ({ ...d, bankLocation: e.target.value }))
                        }
                        data-test-id="bank-field-bankLocation"
                      />
                    </CounterpartyFieldRow>
                    <CounterpartyFieldRow label={t('bank_correspondent_label')}>
                      <Input
                        value={bankDraft.correspondentAccount}
                        inputMode="numeric"
                        onChange={(e) =>
                          setBankDraft((d) => ({ ...d, correspondentAccount: e.target.value }))
                        }
                        data-test-id="bank-field-correspondent"
                      />
                    </CounterpartyFieldRow>
                    <CounterpartyFieldRow
                      label={
                        <>
                          <span className="text-[var(--ms-text-destructive)]">*</span>{' '}
                          {t('bank_col_account')}
                        </>
                      }
                    >
                      <Input
                        value={bankDraft.accountNumber}
                        inputMode="numeric"
                        onChange={(e) =>
                          setBankDraft((d) => ({ ...d, accountNumber: e.target.value }))
                        }
                        data-test-id="bank-field-accountNumber"
                      />
                    </CounterpartyFieldRow>
                    <CounterpartyFieldRow label={t('bank_col_currency')}>
                      <NativeSelect
                        value={bankDraft.currency}
                        onChange={(e) => setBankDraft((d) => ({ ...d, currency: e.target.value }))}
                        data-test-id="bank-field-currency"
                      >
                        {['UZS', 'USD', 'EUR', 'RUB'].map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </NativeSelect>
                    </CounterpartyFieldRow>
                    <CounterpartyFieldRow label={t('bank_main_label')}>
                      <Checkbox
                        checked={bankDraft.isMain}
                        onCheckedChange={(v) => setBankDraft((d) => ({ ...d, isMain: !!v }))}
                        data-test-id="bank-field-isMain"
                      />
                    </CounterpartyFieldRow>
                    {bankError && (
                      <p
                        className="text-[var(--ms-text-destructive)] text-xs"
                        data-test-id="bank-staged-error"
                      >
                        {bankError}
                      </p>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setBankFormOpen(false);
                          setBankError(null);
                          setBankDraft(EMPTY_BANK);
                        }}
                      >
                        {tCommon('cancel')}
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={addStagedBank}
                        data-test-id="bank-stage-add"
                      >
                        {tCommon('add')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setBankFormOpen(true)}
                    data-test-id="bank-add"
                  >
                    <Icons.create className="h-4 w-4" />
                    {t('bank_add_button')}
                  </Button>
                )}
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
                    }}
                    inlineFetcher={ownerFetcher}
                    onInlineSelect={(item) => {
                      setOwnerId(item.id);
                      setOwnerLabel(String(item.primary));
                    }}
                    testId="field-owner"
                  />
                </CounterpartyFieldRow>
                <CounterpartyFieldRow label={t('department_label')}>
                  <CatalogPickerField
                    value={deptId ? { id: deptId, label: deptLabel ?? '…' } : null}
                    placeholder=""
                    onPick={() => setAccessPicker('group')}
                    onClear={() => {
                      setDeptId(null);
                      setDeptLabel(null);
                    }}
                    inlineFetcher={deptFetcher}
                    onInlineSelect={(item) => {
                      setDeptId(item.id);
                      setDeptLabel(String(item.primary));
                    }}
                    testId="field-group"
                  />
                </CounterpartyFieldRow>
                <CounterpartyFieldRow label={t('shared_label')}>
                  <Checkbox
                    id="shared"
                    checked={shared}
                    onCheckedChange={(v) => setShared(!!v)}
                    data-test-id="field-shared"
                  />
                </CounterpartyFieldRow>
              </CounterpartyFormCard>

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
                  setAttrVals((prev) => ({
                    ...prev,
                    [attrPicker.code]: { id: item.id, name: String(item.primary) },
                  }));
                }}
              />

              {/* «Доступ» owner / department reference pickers. */}
              <CatalogPicker
                open={accessPicker === 'owner'}
                onClose={() => setAccessPicker(null)}
                title={t('owner_pick_title')}
                fetcher={ownerFetcher}
                onSelect={(item) => {
                  setOwnerId(item.id);
                  setOwnerLabel(String(item.primary));
                }}
                searchPlaceholder={t('owner_search')}
                testId="owner-picker"
              />
              <CatalogPicker
                open={accessPicker === 'group'}
                onClose={() => setAccessPicker(null)}
                title={t('department_pick_title')}
                fetcher={deptFetcher}
                onSelect={(item) => {
                  setDeptId(item.id);
                  setDeptLabel(String(item.primary));
                }}
                searchPlaceholder={t('department_search')}
                testId="group-picker"
              />
            </div>
          }
          right={
            /* moysklad shows the same activity tabs on NEW, but empty pre-save
               (counterpartyId=null disables every fetch). */
            <CounterpartyActivityWidget
              counterpartyId={null}
              stagedFiles={{
                files: stagedFiles,
                onAdd: (files) =>
                  setStagedFiles((prev) => [
                    ...prev,
                    ...files.map((file) => ({
                      key: crypto.randomUUID(),
                      file,
                      addedAt: new Date().toISOString(),
                      // Object-URL for EVERY staged file (not just images): the thumbnail uses it
                      // for images, and the «name» downloads the local file from it before save.
                      previewUrl: URL.createObjectURL(file),
                    })),
                  ]),
                onRemove: (key) =>
                  setStagedFiles((prev) => {
                    const gone = prev.find((s) => s.key === key);
                    if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
                    return prev.filter((s) => s.key !== key);
                  }),
              }}
            />
          }
        />
      </main>
    </form>
  );
}
