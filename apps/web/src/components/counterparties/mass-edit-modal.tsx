'use client';

/**
 * Counterparty «Массовое редактирование» — 2-step bulk-edit wizard.
 *
 * Live-grounded on the climart account 2026-06-18 (docs/audits/counterparty-mass-
 * edit-live-spec-2026-06-18.md): moysklad's #bulkEdit «Настройка параметров» →
 * «Подтверждение». Each field is opt-in via a leading checkbox; only enabled fields
 * land in the PATCH posted to /counterparties/bulk-update. `null` clears a field.
 *
 * Scope: the fields that map cleanly to our model. The many-group «Добавить/Убрать
 * группы» modes are deferred (need a counterparty↔group many-to-many model — see the
 * spec); «Владелец-отдел» here is our single `groupId`. Like the assortment sibling,
 * the wizard is RU-styled (moysklad-parity), not i18n.
 */

import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { attrReferenceEndpoint } from '@/lib/custom-attr';
import {
  Button,
  CatalogPicker,
  CatalogPickerField,
  Checkbox,
  type ComboboxItem,
  DatePicker,
  Icons,
  Input,
  MultiCombobox,
  NativeSelect,
  type PickerItem,
  RadioGroup,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

interface RefItem {
  id: string;
  name: string;
}
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

export interface CounterpartyMassEditModalProps {
  open: boolean;
  onClose: () => void;
  selectedIds: Set<string>;
  /** CRM «Статус» options (the page already fetches them — passed in to avoid a refetch). */
  crmStates: { id: string; name: string }[];
  /** Account «Дополнительные поля» metadata (the page already fetches it). */
  attrMeta: AttrMeta[];
  /** Called after a successful save (the page clears the selection + invalidates the list). */
  onDone: () => void;
}

// moysklad counterparty types → RU labels (the wizard is RU-styled, like the
// assortment sibling). The 6 model values; UZ vs non-UZ residency is internal.
const COMPANY_TYPES: { value: string; label: string }[] = [
  { value: 'legalUZ', label: 'Юридическое лицо' },
  { value: 'entrepreneurUZ', label: 'Индивидуальный предприниматель' },
  { value: 'individualUZ', label: 'Физическое лицо' },
  { value: 'legal', label: 'Юр. лицо (нерезидент)' },
  { value: 'entrepreneur', label: 'ИП (нерезидент)' },
  { value: 'individual', label: 'Физ. лицо (нерезидент)' },
];

const FIELD_LABELS: Record<string, string> = {
  archived: 'Архивный',
  state: 'Статус',
  setGroups: 'Установить группы',
  addGroups: 'Добавить в группы',
  removeGroups: 'Убрать из групп',
  companyType: 'Тип контрагента',
  gender: 'Пол',
  birthDate: 'Дата рождения',
  priceType: 'Цены',
  owner: 'Владелец-сотрудник',
  dept: 'Владелец-отдел',
  shared: 'Общий доступ',
};

const YES_NO = [
  { value: 'true', label: 'Да' },
  { value: 'false', label: 'Нет' },
];

// «Выбран 1 контрагент» / «Выбрано N контрагента/ов» (Russian plural).
function selectedCountLabel(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `Выбран ${n} контрагент`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `Выбрано ${n} контрагента`;
  return `Выбрано ${n} контрагентов`;
}

export function CounterpartyMassEditModal({
  open,
  onClose,
  selectedIds,
  crmStates,
  attrMeta,
  onDone,
}: CounterpartyMassEditModalProps) {
  const ids = [...selectedIds];
  const [step, setStep] = useState<'config' | 'confirm'>('config');
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [infoOpen, setInfoOpen] = useState(true);

  // Field values (only the enabled ones are sent).
  const [archived, setArchived] = useState<'true' | 'false'>('true');
  const [stateId, setStateId] = useState('');
  const [companyType, setCompanyType] = useState('legalUZ');
  const [gender, setGender] = useState('');
  const [birthDate, setBirthDate] = useState<string | null>(null);
  const [priceTypeId, setPriceTypeId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [shared, setShared] = useState<'true' | 'false'>('true');
  // Custom-attr values: a string for scalars, or a { id, name } for reference attrs.
  const [attrVals, setAttrVals] = useState<Record<string, unknown>>({});
  // The open reference-attr picker (counterparty/product/…); null when closed.
  const [attrPicker, setAttrPicker] = useState<{
    code: string;
    type: string;
    referenceEntity?: string | null;
  } | null>(null);
  // «Группы» (m2m) — three independent modes (selected CounterpartyGroup ids).
  const [setGroups, setSetGroups] = useState<string[]>([]);
  const [addGroups, setAddGroups] = useState<string[]>([]);
  const [removeGroups, setRemoveGroups] = useState<string[]>([]);

  const customFields = attrMeta.filter((a) => !a.archived).sort((a, b) => a.position - b.position);

  // Reference data for the selects (first 200 each — accounts rarely exceed that).
  const { data: priceTypes } = useQuery<{ items: RefItem[] }>({
    queryKey: ['price-types', 'massedit'],
    queryFn: () => api.get('/price-types?archived=false&limit=200'),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });
  const { data: employees } = useQuery<{ items: RefItem[] }>({
    queryKey: ['employees', 'massedit'],
    queryFn: () => api.get('/employees?limit=200'),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });
  const { data: groups } = useQuery<{ items: RefItem[] }>({
    queryKey: ['groups', 'massedit'],
    queryFn: () => api.get('/groups?limit=200'),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });
  // «Группы» (counterparty groups, m2m) — distinct from /groups (departments) above.
  const { data: cpGroups } = useQuery<{ items: RefItem[] }>({
    queryKey: ['counterparty-groups', 'massedit'],
    queryFn: () => api.get('/counterparty-groups'),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });
  const groupItems: ComboboxItem[] = (cpGroups?.items ?? []).map((g) => ({
    value: g.id,
    label: g.name,
  }));

  const toggle = (k: string) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  // Touching a control auto-ticks its checkbox so a filled value is never dropped.
  const enable = (k: string) => setEnabled((prev) => (prev.has(k) ? prev : new Set(prev).add(k)));
  const on = (k: string) => enabled.has(k);

  const reset = () => {
    setStep('config');
    setEnabled(new Set());
    setAttrVals({});
    setSetGroups([]);
    setAddGroups([]);
    setRemoveGroups([]);
  };

  const bulkUpdate = useApiMutation({
    mutationFn: async (vars: { ids: string[]; patch: Record<string, unknown> }) =>
      api.post<{ total: number; succeeded: string[]; failed: unknown[] }>(
        '/counterparties/bulk-update',
        vars,
      ),
    onSuccess: () => {
      onDone();
      reset();
      onClose();
    },
  });

  const apply = () => {
    const patch: Record<string, unknown> = {};
    if (on('archived')) patch.archived = archived === 'true';
    if (on('state')) patch.stateId = stateId || null;
    if (on('setGroups')) patch.setGroupIds = setGroups;
    if (on('addGroups')) patch.addGroupIds = addGroups;
    if (on('removeGroups')) patch.removeGroupIds = removeGroups;
    if (on('companyType')) patch.companyType = companyType;
    if (on('gender')) patch.gender = gender || null;
    if (on('birthDate')) patch.birthDate = birthDate || null;
    if (on('priceType')) patch.priceTypeId = priceTypeId || null;
    if (on('owner')) patch.ownerId = ownerId || null;
    if (on('dept')) patch.groupId = groupId || null;
    if (on('shared')) patch.shared = shared === 'true';
    // Custom «Дополнительные поля» — only the enabled ones, merged server-side. A
    // reference attr's value is a { id, name } object; a scalar's is a string.
    const attrs: Record<string, unknown> = {};
    for (const f of customFields) if (on(`attr_${f.code}`)) attrs[f.code] = attrVals[f.code] ?? '';
    if (Object.keys(attrs).length) patch.attributes = attrs;
    bulkUpdate.mutate({ ids, patch });
  };

  const empty = enabled.size === 0;
  if (!open) return null;

  // One opt-in field row (moysklad #bulkEdit layout): leading checkbox + label in
  // the left column, the control always visible in the right column.
  const row = (key: string, label: string, control: ReactNode) => (
    <div className="grid grid-cols-[200px_minmax(0,300px)] items-start gap-3">
      <label className="flex items-start gap-2 pt-1.5 text-[13px]">
        <Checkbox
          className="mt-0.5"
          checked={enabled.has(key)}
          onCheckedChange={() => toggle(key)}
          data-test-id={`cp-massedit-toggle-${key}`}
        />
        <span>{label}</span>
      </label>
      <div onFocusCapture={() => enable(key)}>{control}</div>
    </div>
  );

  const enabledLabels = [...enabled].map((k) =>
    k.startsWith('attr_')
      ? (customFields.find((f) => `attr_${f.code}` === k)?.name ?? k)
      : (FIELD_LABELS[k] ?? k),
  );

  return (
    <div
      className="fixed top-[42px] right-0 bottom-0 left-0 z-[100] overflow-auto bg-[var(--ms-bg-base,#fff)] text-sm"
      data-test-id="cp-massedit-page"
    >
      <div className="mx-auto max-w-4xl px-6 py-5">
        <Button variant="secondary" onClick={onClose} data-test-id="cp-massedit-close">
          Закрыть
        </Button>

        <h1 className="mt-4 flex items-center gap-2 font-semibold text-[20px] text-[var(--ms-text-primary)]">
          <Icons.help className="h-5 w-5 text-[var(--ms-text-muted)]" />
          Массовое редактирование: Контрагенты
        </h1>

        {infoOpen && (
          <div className="relative mt-3 max-w-xl rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-info,#eef6fb)] p-3 pr-9 text-[13px] text-[var(--ms-text-primary)]">
            Массовое редактирование позволяет заполнять, изменять и очищать поля сразу в нескольких
            записях справочников или документах.
            <button
              type="button"
              onClick={() => setInfoOpen(false)}
              className="absolute top-2 right-2 text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]"
              aria-label="Закрыть"
            >
              <Icons.close className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="mt-4 flex items-center gap-4">
          <div className="space-y-1 text-[13px]">
            <div
              className={
                step === 'config'
                  ? 'font-semibold text-[var(--ms-text-brand)]'
                  : 'text-[var(--ms-text-muted)]'
              }
            >
              ▸ Настройка параметров
            </div>
            <div
              className={
                step === 'confirm'
                  ? 'font-semibold text-[var(--ms-text-brand)]'
                  : 'text-[var(--ms-text-muted)]'
              }
            >
              Подтверждение
            </div>
          </div>
          <span
            className="inline-block rounded-[var(--ms-radius-sm)] bg-[var(--ms-bg-muted)] px-3 py-1.5 text-[13px]"
            data-test-id="cp-massedit-count"
          >
            {selectedCountLabel(ids.length)}
          </span>
        </div>

        <div className="mt-4 mb-3 text-[var(--ms-text-brand)]">
          {step === 'config' ? 'Настройка параметров' : 'Подтверждение'}
        </div>

        {step === 'config' ? (
          <div className="space-y-2.5" data-test-id="cp-massedit-config">
            {row(
              'archived',
              'Архивный',
              <RadioGroup
                value={archived}
                onChange={(v) => setArchived(v as 'true' | 'false')}
                options={YES_NO}
              />,
            )}
            {row(
              'state',
              'Статус',
              <NativeSelect value={stateId} onChange={(e) => setStateId(e.target.value)}>
                <option value="">—</option>
                {crmStates.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>,
            )}
            {/* «Группы» (m2m) — three independent modes, moysklad #bulkEdit order. */}
            {row(
              'setGroups',
              'Установить группы',
              <MultiCombobox
                value={setGroups}
                onChange={setSetGroups}
                items={groupItems}
                testId="cp-massedit-set-groups"
              />,
            )}
            {row(
              'addGroups',
              'Добавить в группы',
              <MultiCombobox
                value={addGroups}
                onChange={setAddGroups}
                items={groupItems}
                testId="cp-massedit-add-groups"
              />,
            )}
            {row(
              'removeGroups',
              'Убрать из групп',
              <MultiCombobox
                value={removeGroups}
                onChange={setRemoveGroups}
                items={groupItems}
                testId="cp-massedit-remove-groups"
              />,
            )}
            {row(
              'companyType',
              'Тип контрагента',
              <NativeSelect value={companyType} onChange={(e) => setCompanyType(e.target.value)}>
                {COMPANY_TYPES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </NativeSelect>,
            )}
            {row(
              'gender',
              'Пол',
              <NativeSelect value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">—</option>
                <option value="male">Мужской</option>
                <option value="female">Женский</option>
              </NativeSelect>,
            )}
            {row(
              'birthDate',
              'Дата рождения',
              <DatePicker value={birthDate} onChange={setBirthDate} />,
            )}
            {row(
              'priceType',
              'Цены',
              <NativeSelect value={priceTypeId} onChange={(e) => setPriceTypeId(e.target.value)}>
                <option value="">—</option>
                {(priceTypes?.items ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>,
            )}
            {row(
              'owner',
              'Владелец-сотрудник',
              <NativeSelect value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                <option value="">—</option>
                {(employees?.items ?? []).map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </NativeSelect>,
            )}
            {row(
              'dept',
              'Владелец-отдел',
              <NativeSelect value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                <option value="">—</option>
                {(groups?.items ?? []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </NativeSelect>,
            )}
            {row(
              'shared',
              'Общий доступ',
              <RadioGroup
                value={shared}
                onChange={(v) => setShared(v as 'true' | 'false')}
                options={YES_NO}
              />,
            )}

            {customFields.length > 0 && (
              <div className="pt-2 font-medium text-[var(--ms-text-brand)]">
                Дополнительные поля
              </div>
            )}
            {customFields.map((f) => {
              // Reference attr (Усто = counterparty) → entity PICKER storing { id, name },
              // mirroring the new/edit forms; enum → dropdown; else text.
              if (attrReferenceEndpoint(f)) {
                const v = attrVals[f.code] as { id?: string; name?: string } | undefined;
                return row(
                  `attr_${f.code}`,
                  f.name,
                  <CatalogPickerField
                    value={v?.id ? { id: v.id, label: v.name || v.id } : null}
                    placeholder=""
                    onPick={() =>
                      setAttrPicker({
                        code: f.code,
                        type: f.type,
                        referenceEntity: f.referenceEntity,
                      })
                    }
                    onClear={() =>
                      setAttrVals((p) => {
                        const next = { ...p };
                        delete next[f.code];
                        return next;
                      })
                    }
                    testId={`cp-massedit-attr-${f.code}`}
                  />,
                );
              }
              return row(
                `attr_${f.code}`,
                f.name,
                f.enumOptions?.length ? (
                  <NativeSelect
                    value={(attrVals[f.code] as string) ?? ''}
                    onChange={(e) => setAttrVals((p) => ({ ...p, [f.code]: e.target.value }))}
                  >
                    <option value="">—</option>
                    {f.enumOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </NativeSelect>
                ) : (
                  <Input
                    value={(attrVals[f.code] as string) ?? ''}
                    onChange={(e) => setAttrVals((p) => ({ ...p, [f.code]: e.target.value }))}
                    data-test-id={`cp-massedit-attr-${f.code}`}
                  />
                ),
              );
            })}
          </div>
        ) : (
          <div className="space-y-1" data-test-id="cp-massedit-confirm">
            <p className="text-[var(--ms-text-muted)]">
              Будут изменены поля ({enabled.size}) у {ids.length} записей:
            </p>
            <ul className="list-inside list-disc">
              {enabledLabels.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 max-w-2xl border-[var(--ms-border-default)] border-t pt-4">
          {step === 'config' ? (
            <Button
              onClick={() => setStep('confirm')}
              disabled={empty}
              data-test-id="cp-massedit-next"
            >
              Далее
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setStep('config')}>
                Назад
              </Button>
              <Button
                onClick={apply}
                disabled={empty || bulkUpdate.isPending}
                data-test-id="cp-massedit-apply"
              >
                Применить
              </Button>
            </div>
          )}
        </div>

        {/* Reference custom-attr picker (e.g. «Усто» → counterparty). Sources entities from
            the attr's /reference endpoint; stores the denormalized { id, name } the list
            column + filter + single-record forms all expect. */}
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
            setAttrVals((p) => ({ ...p, [code]: { id: item.id, name: String(item.primary) } }));
            setAttrPicker(null);
          }}
        />
      </div>
    </div>
  );
}
