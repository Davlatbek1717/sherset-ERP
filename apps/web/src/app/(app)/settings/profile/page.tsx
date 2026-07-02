'use client';

/**
 * «Настройки пользователя → Значения по умолчанию» — the per-user default
 * values (Организация / Склад / Покупатель / Поставщик / Проект) that pre-fill
 * new documents (moysklad `#account`). Wired to GET/PUT /user-settings.
 *
 * Reachable from the settings landing-page card and the settings sidebar
 * («Пользователь» group). i18n via `pages.profile_settings.*`.
 */

import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { Button, CatalogPickerField, type PickerItem } from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface Ref {
  id: string;
  name: string;
}
interface UserSettingsResponse {
  defaultCompany: Ref | null;
  defaultStore: Ref | null;
  defaultProject: Ref | null;
  defaultCustomer: Ref | null;
  defaultSupplier: Ref | null;
}

/** Build a search fetcher for a reference endpoint (id + name [+ secondary]). */
function makeFetcher(
  endpoint: string,
  secondary?: (i: { phone?: string | null; legalTitle?: string | null }) => string | undefined,
) {
  return async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{
      items: Array<{ id: string; name: string; phone?: string | null; legalTitle?: string | null }>;
    }>(`${endpoint}?search=${encodeURIComponent(s)}&limit=50`);
    return d.items.map((i) => ({ id: i.id, primary: i.name, secondary: secondary?.(i) }));
  };
}

const orgFetcher = makeFetcher('/organizations');
const storeFetcher = makeFetcher('/stores');
const projectFetcher = makeFetcher('/projects');
const counterpartyFetcher = makeFetcher(
  '/counterparties',
  (c) => c.phone ?? c.legalTitle ?? undefined,
);

export default function ProfileSettingsPage() {
  const t = useTranslations('pages.profile_settings');
  const qc = useQueryClient();

  const { data } = useQuery<UserSettingsResponse>({
    queryKey: ['user-settings'],
    queryFn: () => api.get<UserSettingsResponse>('/user-settings'),
  });

  const [org, setOrg] = useState<Ref | null>(null);
  const [store, setStore] = useState<Ref | null>(null);
  const [customer, setCustomer] = useState<Ref | null>(null);
  const [supplier, setSupplier] = useState<Ref | null>(null);
  const [project, setProject] = useState<Ref | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Seed the form from the saved settings once (then it's user-controlled).
  useEffect(() => {
    if (!data || hydrated) return;
    setOrg(data.defaultCompany);
    setStore(data.defaultStore);
    setCustomer(data.defaultCustomer);
    setSupplier(data.defaultSupplier);
    setProject(data.defaultProject);
    setHydrated(true);
  }, [data, hydrated]);

  const save = useApiMutation({
    mutationFn: () =>
      api.put('/user-settings', {
        defaultCompanyId: org?.id ?? null,
        defaultStoreId: store?.id ?? null,
        defaultCustomerId: customer?.id ?? null,
        defaultSupplierId: supplier?.id ?? null,
        defaultProjectId: project?.id ?? null,
      }),
    successMessage: t('saved'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-settings'] }),
  });

  const row = (
    label: string,
    value: Ref | null,
    setValue: (v: Ref | null) => void,
    fetcher: (s: string) => Promise<PickerItem[]>,
    testId: string,
  ) => (
    <div className="grid grid-cols-[160px_minmax(0,360px)] items-center gap-3">
      <span className="text-right text-[13px] text-[var(--ms-text-muted)]">{label}</span>
      <CatalogPickerField
        value={value ? { id: value.id, label: value.name } : null}
        placeholder={t('placeholder')}
        onPick={() => undefined}
        inlineFetcher={fetcher}
        onInlineSelect={(item) => setValue({ id: item.id, name: String(item.primary) })}
        onClear={() => setValue(null)}
        testId={testId}
      />
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl px-6 py-6" data-test-id="profile-settings-page">
      <h1 className="mb-5 font-semibold text-[var(--ms-text-primary)] text-lg">{t('title')}</h1>
      <section className="space-y-4">
        <h2 className="font-medium text-[var(--ms-text-brand)] text-base">{t('section')}</h2>
        <p className="text-[12px] text-[var(--ms-text-muted)]">{t('hint')}</p>
        <div className="space-y-2.5">
          {row(t('org'), org, setOrg, orgFetcher, 'default-org')}
          {row(t('store'), store, setStore, storeFetcher, 'default-store')}
          {row(t('customer'), customer, setCustomer, counterpartyFetcher, 'default-customer')}
          {row(t('supplier'), supplier, setSupplier, counterpartyFetcher, 'default-supplier')}
          {row(t('project'), project, setProject, projectFetcher, 'default-project')}
        </div>
        <div className="pt-2 pl-[172px]">
          <Button
            type="button"
            onClick={() => save.mutate()}
            loading={save.isPending}
            data-test-id="profile-settings-save"
          >
            {t('save')}
          </Button>
        </div>
      </section>
    </div>
  );
}
