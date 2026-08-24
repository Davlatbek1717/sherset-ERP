'use client';

/**
 * «Склад» card — moysklad #Warehouse/edit 1:1 (LIVE-grounded 2026-07-03,
 * docs/audits/stores-1to1-2026-07-03/GROUND.md + ms-card-full.png).
 *
 * Two-column card (not the generic sectioned EditForm):
 *   toolbar: Сохранить(green) · Закрыть · Поместить в архив/Извлечь из архива ·
 *            Изменить ▾ {Удалить, Копировать} · [owner cluster + «Изменения»]
 *   left  : *Наименование · Адрес(+structured) · Комментарий к адресу ·
 *           Комментарий · Код · Группа(picker) · «Внешний код»(link→dialog) ·
 *           Дополнительные поля block
 *   right : «Адресное хранение товаров» (checkbox + Зоны + Ячейки)
 *
 * One component serves both /new (id=null → address-storage drafts flushed
 * after create) and /[id] (id set → live CRUD + optimistic-lock).
 */

import {
  OwnerAccessPopover,
  type OwnerAccessValue,
} from '@/components/documents/owner-access-popover';
import {
  type AddressStorageDrafts,
  AddressStorageSection,
  draftPolka,
} from '@/components/stores/address-storage-section';
import { StorePickerDialog } from '@/components/stores/store-picker-dialog';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import {
  Button,
  CatalogPickerField,
  Checkbox,
  DropdownMenu,
  Icons,
  Input,
  Modal,
  Textarea,
  formatDate,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface AddressFull {
  postalCode?: string | null;
  country?: string | null;
  city?: string | null;
  street?: string | null;
  house?: string | null;
  apartment?: string | null;
  addInfo?: string | null;
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
  /** «Группа» = parent WAREHOUSE (hierarchy) — distinct from `group` below. */
  parent: { id: string; name: string } | null;
  /** «Владелец-отдел» (department). */
  group: { id: string; name: string } | null;
  /** «Владелец-сотрудник». */
  owner: { id: string; name: string } | null;
  shared: boolean;
  allowNegativeStock: boolean;
  cellInventory: boolean;
  /** F6 — kassa stok-kaskadi prioriteti (1 = birinchi; null = qatnashmaydi). */
  posPriority: number | null;
  /** F7 — joylashtirish manbai: sanashda yacheykaga kirgan tovar shu ombordan ko'chadi. */
  unassignedSource: boolean;
  /** G3 — BRAK ombori (vozvrat qabulida brak tovar shu yerga tushadi). */
  brakStore: boolean;
  archived: boolean;
  updatedAt: string;
}

const FIELD_LABEL = 'mb-1 block text-[12px] text-[#222222]';
const REQUIRED_MARK = <span className="text-[var(--ms-text-error)]">* </span>;

/** «Внешний код» dialog — moysklad's external-code-dialog (title + input + Сохранить/Отменить). */
function ExternalCodeDialog({
  open,
  value,
  onClose,
  onSave,
}: {
  open: boolean;
  value: string;
  onClose(): void;
  onSave(v: string): void;
}) {
  const t = useTranslations('pages.stores');
  const tCommon = useTranslations('common');
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);
  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title={t('external_code')}
      widthClass="w-[420px]"
      testId="store-external-code-dialog"
      footer={
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={() => {
              onSave(draft.trim());
              onClose();
            }}
            data-test-id="external-code-save"
          >
            {tCommon('save')}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
        </div>
      }
    >
      <div className="flex items-center gap-3 py-1">
        <span className="text-[#222222] text-[12px]">{t('external_code')}</span>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="flex-1"
          data-test-id="external-code-input"
        />
      </div>
    </Modal>
  );
}

export function StoreCard({
  id,
  basePath = '/stores',
}: {
  id: string | null;
  /** List route this card returns to («Закрыть» / redirects). The Склад-section
   *  chrome (/stores) is the moysklad-parity home; /settings/stores keeps its own. */
  basePath?: string;
}) {
  const isNew = id === null;
  const router = useRouter();
  const qc = useQueryClient();
  const auth = useAuth();
  const t = useTranslations('pages.stores');
  const tCommon = useTranslations('common');
  const tBulk = useTranslations('bulk_actions');

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [externalCode, setExternalCode] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [addr, setAddr] = useState<AddressFull>({});
  const [addrOpen, setAddrOpen] = useState(false);
  const [parentId, setParentId] = useState<string | null>(null);
  const [parentLabel, setParentLabel] = useState('');
  const [cellInventory, setCellInventory] = useState(true);
  // F6 — «Kassa prioriteti (POS)»: matn holida (bo'sh = kaskadda emas).
  const [posPriority, setPosPriority] = useState('');
  // F7 — «Joylashtirish manbai» (Taqsimlanmagan hovuzi) belgisi.
  const [unassignedSource, setUnassignedSource] = useState(false);
  const [brakStore, setBrakStore] = useState(false);
  // «Владелец» cluster (owner employee / department / Общий доступ) — moysklad
  // shows it top-right and edits it via the owner popover.
  const [ownerAccess, setOwnerAccess] = useState<OwnerAccessValue>({
    ownerId: null,
    ownerLabel: '',
    groupId: null,
    groupLabel: '',
    shared: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [extCodeOpen, setExtCodeOpen] = useState(false);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  // Unsaved address-storage rows. Persisted to localStorage per store so they
  // SURVIVE a page refresh on THIS browser (user 2026-07-05) — yet, because
  // they never reach the server until «Сохранить», other laptops still can't
  // see them. Cleared on successful save.
  const draftsKey = `moysklad:store-drafts:${id ?? 'new'}`;
  const [drafts, setDrafts] = useState<AddressStorageDrafts>({ zones: [], cells: [] });
  // `false` until the persisted buffer has been read in — gates the persist
  // effect so the empty first render can never clobber stored drafts.
  const [draftsHydrated, setDraftsHydrated] = useState(false);

  // Load persisted drafts once per store (client-only; done in an effect, not a
  // lazy initializer, to avoid an SSR hydration mismatch).
  useEffect(() => {
    setDraftsHydrated(false);
    try {
      const raw = localStorage.getItem(draftsKey);
      const parsed = raw ? JSON.parse(raw) : null;
      setDrafts(
        parsed && Array.isArray(parsed.zones) && Array.isArray(parsed.cells)
          ? { zones: parsed.zones, cells: parsed.cells }
          : { zones: [], cells: [] },
      );
    } catch {
      setDrafts({ zones: [], cells: [] });
    }
    setDraftsHydrated(true);
  }, [draftsKey]);

  // Persist on every change once hydrated (empty buffer ⇒ drop the key).
  useEffect(() => {
    if (!draftsHydrated) return;
    try {
      if (drafts.zones.length === 0 && drafts.cells.length === 0)
        localStorage.removeItem(draftsKey);
      else localStorage.setItem(draftsKey, JSON.stringify(drafts));
    } catch {
      /* private mode / quota — drafts still live in memory this session */
    }
  }, [drafts, draftsHydrated, draftsKey]);

  const { data, isLoading } = useQuery<StoreDetail>({
    queryKey: ['store', id],
    queryFn: () => api.get<StoreDetail>(`/admin/stores/${id}`),
    enabled: !isNew,
  });

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setCode(data.code ?? '');
    setExternalCode(data.externalCode ?? '');
    setDescription(data.description ?? '');
    setAddress(data.address ?? '');
    setAddr(data.addressFull ?? {});
    setParentId(data.parentId);
    setParentLabel(data.parent?.name ?? '');
    setCellInventory(data.cellInventory);
    setPosPriority(data.posPriority == null ? '' : String(data.posPriority));
    setUnassignedSource(data.unassignedSource === true);
    setBrakStore(data.brakStore === true);
    setOwnerAccess({
      ownerId: data.owner?.id ?? null,
      ownerLabel: data.owner?.name ?? '',
      groupId: data.group?.id ?? null,
      groupLabel: data.group?.name ?? '',
      shared: data.shared,
    });
  }, [data]);

  const onConflict = useConflictReload(['store', id]);
  const { runDestructive } = useDestructiveMutation();

  const buildPayload = () => {
    const cleanAddr = Object.fromEntries(
      Object.entries(addr).filter(([, v]) => v != null && v !== ''),
    );
    // F6: bo'sh/noto'g'ri kiritma → null (ombor kaskaddan chiqadi) —
    // server null'da `__posPriority` kalitini o'chiradi.
    const posPriorityNum = Number.parseInt(posPriority, 10);
    return {
      name,
      code: code || null,
      externalCode: externalCode || null,
      description: description || null,
      address: address || null,
      addressFull: Object.keys(cleanAddr).length > 0 ? cleanAddr : null,
      parentId: parentId || null,
      ownerId: ownerAccess.ownerId,
      groupId: ownerAccess.groupId,
      shared: ownerAccess.shared,
      cellInventory,
      posPriority: Number.isInteger(posPriorityNum) && posPriorityNum > 0 ? posPriorityNum : null,
      // F7: server `false` da `__unassignedSource` kalitini o'chiradi.
      unassignedSource,
      // G3: server `false` da `__brakStore` kalitini o'chiradi.
      brakStore,
    };
  };

  // Push the buffered address-storage drafts (unsaved polkas/cells) to the
  // server on «Сохранить» — user 2026-07-05: an unsaved cell must NOT be
  // visible to other laptops until the card is saved. Polka = the cell code's
  // 3rd segment, so a zone is find-or-created per distinct seg3 (never blindly
  // duplicated against zones another user already created).
  const flushDrafts = async (
    targetId: string,
    existingZones: ReadonlyArray<{ id: string; name: string }>,
    existingCellNames: ReadonlySet<string> = new Set(),
  ) => {
    if (drafts.zones.length === 0 && drafts.cells.length === 0) return;
    const zoneIdByName = new Map<string, string>(existingZones.map((z) => [z.name, z.id]));
    const ensureZone = async (polkaName: string): Promise<string> => {
      const found = zoneIdByName.get(polkaName);
      if (found) return found;
      const nz = await api.post<{ id: string }>(`/admin/stores/${targetId}/zones`, {
        name: polkaName,
      });
      zoneIdByName.set(polkaName, nz.id);
      return nz.id;
    };
    // Explicit polka-only drafts (a polka added with no cells yet).
    for (const z of drafts.zones) await ensureZone(z.name);
    for (const c of drafts.cells) {
      // Skip a persisted draft that already landed on the server (saved here
      // earlier or on another laptop) — its name is unique per store.
      if (existingCellNames.has(c.name)) continue;
      const polka = draftPolka(c);
      const zoneId = polka ? await ensureZone(polka) : null;
      await api.post(`/admin/stores/${targetId}/cells`, {
        name: c.name,
        zoneId,
        barcode: c.barcode,
      });
    }
  };

  const createMut = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error(t('name_required'));
      const created = await api.post<StoreDetail>('/admin/stores', buildPayload());
      // A brand-new store has no server zones yet.
      await flushDrafts(created.id, []);
      return created;
    },
    onSuccess: (created) => {
      setDrafts({ zones: [], cells: [] });
      qc.invalidateQueries({ queryKey: ['stores'] });
      // moysklad keeps the saved card open (the URL flips to the edit route).
      router.push(`${basePath}/${created.id}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error(tCommon('not_found'));
      if (!name.trim()) throw new Error(t('name_required'));
      const saved = await api.patch<StoreDetail>(`/admin/stores/${id}`, {
        version: data.version,
        ...buildPayload(),
      });
      // Flush buffered cells/polkas against the store's current zones so a
      // just-typed «20» polka doesn't re-create a zone a teammate already made.
      if (id && (drafts.zones.length > 0 || drafts.cells.length > 0)) {
        const current = await api.get<{
          zones: Array<{ id: string; name: string }>;
          cells: Array<{ name: string }>;
        }>(`/admin/stores/${id}/address-storage`);
        await flushDrafts(id, current.zones, new Set(current.cells.map((c) => c.name)));
      }
      return saved;
    },
    onSuccess: () => {
      setDrafts({ zones: [], cells: [] });
      // moysklad's «Сохранить» saves and STAYS on the card; «Закрыть» exits.
      qc.invalidateQueries({ queryKey: ['store', id] });
      qc.invalidateQueries({ queryKey: ['store-address', id] });
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
    mutationFn: () =>
      api.post<StoreDetail>(`/admin/stores/${id}/${data?.archived ? 'restore' : 'archive'}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store', id] });
      qc.invalidateQueries({ queryKey: ['stores'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const cloneMut = useMutation({
    mutationFn: () => api.post<StoreDetail>(`/admin/stores/${id}/copy`, {}),
    onSuccess: (copy) => {
      qc.invalidateQueries({ queryKey: ['stores'] });
      router.push(`${basePath}/${copy.id}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete<unknown>(`/admin/stores/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stores'] });
      router.push(basePath);
    },
    onError: (e: Error) => setError(e.message),
  });

  const save = () => {
    setError(null);
    if (isNew) createMut.mutate();
    else updateMut.mutate();
  };
  const saving = createMut.isPending || updateMut.isPending;

  if (!isNew && isLoading) {
    return <div className="p-6 text-[12px] text-[var(--ms-text-muted)]">{tCommon('loading')}</div>;
  }
  if (!isNew && !data) {
    return (
      <div className="p-6 text-[12px] text-[var(--ms-text-muted)]">{tCommon('not_found')}</div>
    );
  }

  return (
    <div className="p-4" data-test-id={isNew ? 'store-new-page' : 'store-edit-page'}>
      {/* ---- toolbar ---- */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Button onClick={save} loading={saving} data-test-id="store-save">
          {tCommon('save')}
        </Button>
        <Button
          variant="secondary"
          onClick={() => router.push(basePath)}
          data-test-id="store-close"
        >
          {tCommon('close')}
        </Button>
        {/* (?) help — moysklad shows it between Закрыть and Поместить в архив. */}
        <a
          href="https://support.moysklad.ru/hc/ru/articles/360012658594"
          target="_blank"
          rel="noreferrer"
          aria-label="help"
          className="ml-3 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-[var(--ms-border-strong)] text-[11px] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-muted)]"
          data-test-id="store-help"
        >
          ?
        </a>
        {!isNew && (
          <Button
            variant="secondary"
            onClick={() => archiveMut.mutate()}
            loading={archiveMut.isPending}
            data-test-id="store-archive"
          >
            {data?.archived ? tCommon('restore') : tCommon('archive')}
          </Button>
        )}
        {!isNew && (
          <DropdownMenu
            trigger={
              <Button variant="secondary" data-test-id="store-edit-menu-trigger">
                {tBulk('trigger')}
                <Icons.down className="h-4 w-4" />
              </Button>
            }
            testId="store-edit-menu"
          >
            <DropdownMenu.Item
              destructive
              onSelect={() =>
                runDestructive({
                  title: tCommon('delete_confirm', { name: data?.name ?? '' }),
                  run: () => deleteMut.mutateAsync(),
                })
              }
              testId="store-menu-delete"
            >
              {tBulk('delete')}
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => cloneMut.mutate()} testId="store-menu-copy">
              {tBulk('copy')}
            </DropdownMenu.Item>
          </DropdownMenu>
        )}

        {/* owner cluster + «Изменения» (moysklad top-right on the toolbar row).
            The owner block is CLICKABLE — opens the «Владелец» popover
            (employee / department / Общий доступ), saved with «Сохранить». */}
        <div className="ml-auto flex items-center gap-6">
          <OwnerAccessPopover
            value={
              ownerAccess.ownerLabel
                ? ownerAccess
                : { ...ownerAccess, ownerLabel: auth.user?.name ?? '' }
            }
            onChange={setOwnerAccess}
          />
          {!isNew && data && (
            <div className="flex flex-col text-right leading-tight">
              <span className="text-[12px] text-[var(--ms-text-muted)]">{t('changes_label')}</span>
              <span className="text-[10px] text-[var(--ms-text-brand)]">
                {formatDate(data.updatedAt)}
              </span>
            </div>
          )}
        </div>
      </div>

      {error && <p className="mb-3 text-[12px] text-[var(--ms-text-error)]">{error}</p>}

      {!isNew && data?.archived && (
        <p className="mb-3 text-[12px] text-[var(--ms-text-warning)]">{t('archived_banner')}</p>
      )}

      {/* ---- two columns ---- */}
      {/* Mobile: the field column + Адресное хранение column stack. */}
      <div className="flex flex-wrap gap-x-16 gap-y-6 max-lg:flex-col">
        {/* left column */}
        <div className="w-[290px] shrink-0 space-y-4">
          <div>
            <span className={FIELD_LABEL}>
              {REQUIRED_MARK}
              {t('name')}
            </span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-test-id="field-name"
            />
          </div>

          <div>
            <span className={FIELD_LABEL}>{t('address')}</span>
            <div className="flex items-start gap-1">
              <Textarea
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="min-h-[44px] flex-1"
                data-test-id="field-address"
              />
              <button
                type="button"
                onClick={() => setAddrOpen((v) => !v)}
                aria-expanded={addrOpen}
                className="flex h-8 w-7 shrink-0 items-center justify-center rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-muted)]"
                data-test-id="address-toggle"
              >
                {addrOpen ? '▲' : '▼'}
              </button>
            </div>
            {addrOpen && (
              <div className="mt-2 space-y-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)] p-3">
                {(
                  [
                    ['postalCode', t('postal_code')],
                    ['country', t('country')],
                    ['city', t('city')],
                    ['street', t('street')],
                    ['house', t('house')],
                    ['apartment', t('apartment')],
                    ['addInfo', t('other')],
                  ] as const
                ).map(([key, label]) => (
                  <div
                    key={key}
                    className="grid grid-cols-[100px_minmax(0,1fr)] items-center gap-2"
                  >
                    <span className="text-[12px] text-[var(--ms-text-muted)]">{label}</span>
                    <Input
                      value={(addr[key] as string) ?? ''}
                      onChange={(e) => setAddr({ ...addr, [key]: e.target.value || null })}
                      data-test-id={`addr-${key}`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <span className={FIELD_LABEL}>{t('address_comment')}</span>
            <Textarea
              rows={2}
              value={addr.comment ?? ''}
              onChange={(e) => setAddr({ ...addr, comment: e.target.value || null })}
              data-test-id="field-address-comment"
            />
          </div>

          <div>
            <span className={FIELD_LABEL}>{t('description')}</span>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              data-test-id="field-description"
            />
          </div>

          <div>
            <span className={FIELD_LABEL}>{t('code')}</span>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              data-test-id="field-code"
            />
          </div>

          <div>
            <span className={FIELD_LABEL}>{t('pos_priority')}</span>
            <Input
              type="number"
              min={1}
              max={999}
              value={posPriority}
              onChange={(e) => setPosPriority(e.target.value)}
              data-test-id="field-pos-priority"
            />
            <p className="mt-1 text-[11px] text-[var(--ms-text-muted)]">{t('pos_priority_hint')}</p>
          </div>

          <div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-[#222222] text-[12px]">
              <Checkbox
                checked={unassignedSource}
                onCheckedChange={(v) => setUnassignedSource(!!v)}
                data-test-id="field-unassigned-source"
              />
              <span>{t('unassigned_source')}</span>
            </label>
            <p className="mt-1 text-[11px] text-[var(--ms-text-muted)]">
              {t('unassigned_source_hint')}
            </p>
          </div>

          <div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-[#222222] text-[12px]">
              <Checkbox
                checked={brakStore}
                onCheckedChange={(v) => setBrakStore(!!v)}
                data-test-id="field-brak-store"
              />
              <span>{t('brak_store')}</span>
            </label>
            <p className="mt-1 text-[11px] text-[var(--ms-text-muted)]">{t('brak_store_hint')}</p>
          </div>

          <div>
            <span className={FIELD_LABEL}>{t('parent')}</span>
            <CatalogPickerField
              value={parentId ? { id: parentId, label: parentLabel || parentId } : null}
              placeholder=""
              onPick={() => setGroupPickerOpen(true)}
              onClear={() => {
                setParentId(null);
                setParentLabel('');
              }}
              testId="field-parent"
            />
          </div>

          <button
            type="button"
            onClick={() => setExtCodeOpen(true)}
            className="text-[12px] text-[var(--ms-text-link)] hover:underline"
            data-test-id="external-code-link"
          >
            {t('external_code')}
          </button>

          {/* Дополнительные поля (custom-fields block placeholder — moysklad parity). */}
          <div className="pt-2">
            <div className="text-[15px] text-[rgb(204,66,12)]">{t('custom_fields_title')}</div>
            <p className="mt-1 max-w-[360px] text-[#222222] text-[12px]">
              {t('custom_fields_desc')}
            </p>
            <a
              href="/settings/attributes"
              className="text-[12px] text-[var(--ms-text-link)] hover:underline"
            >
              {t('custom_fields_link')}
            </a>
          </div>
        </div>

        {/* right column — Адресное хранение. Mobile: the intrinsic ~760px grid
            kept re-widening every auto-width ancestor (no definite width to
            scroll against), so the column itself becomes the scroll box with a
            VIEWPORT-definite cap — content keeps its shape and pans. */}
        <div className="min-w-[600px] flex-1 max-lg:min-w-0 max-lg:w-full max-lg:max-w-[calc(100vw-32px)] max-lg:overflow-x-auto">
          <div className="mb-4 flex items-center gap-2">
            <a
              href="https://support.moysklad.ru/hc/ru/articles/4404897834513"
              target="_blank"
              rel="noreferrer"
              aria-label="help"
              className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-[var(--ms-border-strong)] text-[11px] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-muted)]"
            >
              ?
            </a>
            <span className="text-[15px] text-[rgb(204,66,12)]">{t('address_storage.title')}</span>
          </div>
          <AddressStorageSection
            storeId={id}
            storeCode={code}
            cellInventory={cellInventory}
            onCellInventoryChange={setCellInventory}
            drafts={drafts}
            onDraftsChange={setDrafts}
          />
        </div>
      </div>

      <ExternalCodeDialog
        open={extCodeOpen}
        value={externalCode}
        onClose={() => setExtCodeOpen(false)}
        onSave={setExternalCode}
      />
      <StorePickerDialog
        open={groupPickerOpen}
        onClose={() => setGroupPickerOpen(false)}
        allowRoot
        excludeIds={id ? [id] : []}
        onSelect={(picked) => {
          setParentId(picked?.id ?? null);
          setParentLabel(picked?.name ?? '');
        }}
      />
    </div>
  );
}
