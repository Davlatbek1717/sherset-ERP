'use client';

import { api } from '@/lib/api-client';
import type { ListEnvelope as ListResponse } from '@moysklad/contracts';
import {
  CatalogPickerField,
  Checkbox,
  DatePicker,
  FormField,
  FormSection,
  Input,
  Label,
  NativeSelect,
  type PickerItem,
  Textarea,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Renders editable inputs for an entity's custom attributes (defined in
 * AttributeMetadata). Reads metadata from the API once per entity type;
 * caller passes current values + onChange.
 *
 * Values are keyed by the attribute `code`. Unknown keys in `values` are
 * preserved on output (we only render known keys), so accidental drift
 * from metadata changes never destroys data.
 */

export interface AttributeMetaRow {
  id: string;
  code: string;
  name: string;
  type:
    | 'string'
    | 'text'
    | 'long'
    | 'double'
    | 'boolean'
    | 'date'
    | 'file'
    | 'link'
    | 'enum'
    | 'reference';
  required: boolean;
  description: string | null;
  enumOptions: Array<{ value: string; label: string }> | null;
  referenceEntity: string | null;
  position: number;
}

export interface AttributesEditorProps {
  /** Entity type — must match AttributeMetadata.entity values. */
  entity: string;
  /** Current attribute values keyed by attribute code. */
  values: Record<string, unknown>;
  /** Called with the next values map when any field changes. */
  onChange: (next: Record<string, unknown>) => void;
  /** Disable all inputs (e.g. when document is `applicable`/posted). */
  disabled?: boolean;
  /** Hide the FormSection wrapper — caller renders its own header. */
  bare?: boolean;
  /** Section title override. */
  title?: string;
  /** Optional test id prefix. */
  testIdPrefix?: string;
}

export function AttributesEditor({
  entity,
  values,
  onChange,
  disabled,
  bare,
  title,
  testIdPrefix,
}: AttributesEditorProps) {
  const { data, isLoading } = useQuery<ListResponse<AttributeMetaRow>>({
    queryKey: ['attribute-metadata-entity', entity],
    queryFn: () => api.get<ListResponse<AttributeMetaRow>>(`/attribute-metadata/entity/${entity}`),
    staleTime: 60_000,
  });

  const t = useTranslations('attributes');
  const metas = data?.items ?? [];
  if (!isLoading && metas.length === 0) {
    // No custom fields defined — render nothing (don't waste vertical space).
    return null;
  }

  const update = (code: string, val: unknown) => {
    if (val === '' || val == null) {
      const next = { ...values };
      delete next[code];
      onChange(next);
    } else {
      onChange({ ...values, [code]: val });
    }
  };

  const body = (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {metas.map((m) => {
        const id = `attr-${m.code}`;
        const testId = testIdPrefix ? `${testIdPrefix}-${m.code}` : `attr-${m.code}`;
        const current = values[m.code];

        return (
          <FormField
            key={m.id}
            id={id}
            label={m.name}
            required={m.required}
            hint={m.description ?? undefined}
          >
            <AttributeInput
              meta={m}
              value={current}
              onChange={(v) => update(m.code, v)}
              disabled={disabled}
              testId={testId}
            />
          </FormField>
        );
      })}
    </div>
  );

  if (bare) return body;

  return (
    <FormSection
      title={title ?? t('section_title')}
      description={t('field_count', { count: metas.length })}
    >
      {body}
    </FormSection>
  );
}

/**
 * Renders the typed input for ONE custom attribute (per AttributeMetadata.type).
 * Extracted so both {@link AttributesEditor} (detail pages, FormField layout) and
 * the document `/new` editors (inline in the meta grid) share one input renderer.
 */
export function AttributeInput({
  meta,
  value,
  onChange,
  disabled,
  testId,
}: {
  meta: AttributeMetaRow;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
  testId: string;
}) {
  const m = meta;
  const current = value;
  const setVal = onChange;
  const strVal = current == null ? '' : String(current);

  switch (m.type) {
    case 'string':
    case 'link':
      return (
        <Input
          value={strVal}
          onChange={(e) => setVal(e.target.value)}
          disabled={disabled}
          type={m.type === 'link' ? 'url' : 'text'}
          data-test-id={testId}
        />
      );

    case 'text':
      return (
        <Textarea
          value={strVal}
          onChange={(e) => setVal(e.target.value)}
          disabled={disabled}
          rows={3}
          className="w-full resize-y rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-3 py-2 text-sm disabled:bg-[var(--ms-bg-muted)] disabled:text-[var(--ms-text-disabled)]"
          data-test-id={testId}
        />
      );

    case 'long':
      return (
        <Input
          type="number"
          step="1"
          value={strVal}
          onChange={(e) =>
            setVal(e.target.value === '' ? null : Number.parseInt(e.target.value, 10))
          }
          disabled={disabled}
          data-test-id={testId}
        />
      );

    case 'double':
      return (
        <Input
          type="number"
          step="0.01"
          value={strVal}
          onChange={(e) => setVal(e.target.value === '' ? null : Number.parseFloat(e.target.value))}
          disabled={disabled}
          data-test-id={testId}
        />
      );

    case 'boolean':
      return (
        <div className="flex h-9 items-center">
          <Checkbox
            checked={Boolean(current)}
            onCheckedChange={(v) => setVal(Boolean(v))}
            disabled={disabled}
            data-test-id={testId}
          />
          <Label className="ml-2 text-[var(--ms-text-muted)] text-sm">
            {current ? 'Ha' : "Yo'q"}
          </Label>
        </div>
      );

    case 'date':
      // moysklad DD.MM.YYYY (locale-independent) — matches the standard date
      // fields (header «от», delivery date) converted to DatePicker.
      return (
        <DatePicker
          value={strVal ? strVal.slice(0, 10) : null}
          onChange={(d) => setVal(d)}
          locale="ru-RU"
          disabled={disabled}
          testId={testId}
        />
      );

    case 'enum':
      return (
        <NativeSelect
          value={strVal}
          onChange={(e) => setVal(e.target.value || null)}
          disabled={disabled}
          data-test-id={testId}
        >
          <option value="">— tanlang —</option>
          {(m.enumOptions ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      );

    case 'reference':
      // moysklad renders reference custom-fields (e.g. «Уста» = a Контрагент
      // link) as the SAME inline type-to-search picker as the standard
      // reference fields. Reuse it; fall back to a UUID input for entities we
      // don't have a search endpoint mapping for yet.
      return (
        <ReferenceAttributeInput
          meta={m}
          value={strVal}
          onChange={setVal}
          disabled={disabled}
          testId={testId}
        />
      );

    case 'file':
      // Stores a UUID; real upload flow is a separate feature.
      return (
        <Input
          value={strVal}
          onChange={(e) => setVal(e.target.value || null)}
          disabled={disabled}
          placeholder="Fayl UUID"
          data-test-id={testId}
        />
      );
  }
}

/**
 * referenceEntity → list endpoint for custom-attribute reference pickers.
 * Keys are the PascalCase entity names stored in AttributeMetadata.referenceEntity
 * (e.g. "Counterparty"), matching the documented entity-name set.
 */
const REFERENCE_ENDPOINT: Record<string, string> = {
  Counterparty: 'counterparties',
  Product: 'products',
  Variant: 'products',
  Employee: 'employees',
  Organization: 'organizations',
  Store: 'stores',
  Contract: 'contracts',
  Project: 'projects',
  Currency: 'currencies',
};

/**
 * referenceEntity → /new create route, so a reference custom-field (e.g. «Уста» =
 * a Контрагент) gets the moysklad «+» create affordance next to the picker. Only
 * entities with a real /new page are listed; others simply omit the «+».
 */
const REFERENCE_CREATE_ROUTE: Record<string, string> = {
  Counterparty: '/counterparties/new',
  Product: '/products/new',
  Employee: '/employees/new',
  Organization: '/organizations/new',
  Store: '/stores/new',
  Contract: '/contracts/new',
  Project: '/projects/new',
};

/**
 * Inline reference picker for a custom attribute of type `reference` (moysklad
 * parity — «Уста» etc. behave exactly like the Контрагент field). Reuses the
 * shared inline CatalogPickerField. The stored value is a bare UUID, so the
 * current id is resolved to a display name once via GET /{endpoint}/{id};
 * fresh selections carry their label directly.
 */
function ReferenceAttributeInput({
  meta,
  value,
  onChange,
  disabled,
  testId,
}: {
  meta: AttributeMetaRow;
  value: string;
  onChange: (v: unknown) => void;
  disabled?: boolean;
  testId: string;
}) {
  const router = useRouter();
  const endpoint = meta.referenceEntity ? REFERENCE_ENDPOINT[meta.referenceEntity] : undefined;
  const createRoute = meta.referenceEntity
    ? REFERENCE_CREATE_ROUTE[meta.referenceEntity]
    : undefined;
  const id = value || null;
  const [picked, setPicked] = useState<{ id: string; label: string } | null>(null);

  // Resolve an existing id → name (skip when the in-session selection already
  // knows the label, or the entity is unmapped).
  const { data: resolved } = useQuery<{ name?: string }>({
    queryKey: ['attr-reference', endpoint, id],
    queryFn: () => api.get<{ name?: string }>(`/${endpoint}/${id}`),
    enabled: Boolean(endpoint && id && picked?.id !== id),
    staleTime: 60_000,
  });

  if (!endpoint) {
    // Unmapped entity — keep the raw-UUID escape hatch.
    return (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
        placeholder={`${meta.referenceEntity ?? '?'} UUID`}
        data-test-id={testId}
      />
    );
  }

  const label = picked?.id === id ? picked.label : (resolved?.name ?? id ?? '');
  const fetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{
      items: Array<{
        id: string;
        name: string;
        phone?: string | null;
        code?: string | null;
        legalTitle?: string | null;
      }>;
    }>(`/${endpoint}?search=${encodeURIComponent(s)}&limit=20`);
    return d.items.map((x) => ({
      id: x.id,
      primary: x.name,
      secondary: x.phone ?? x.code ?? x.legalTitle ?? undefined,
    }));
  };

  return (
    <CatalogPickerField
      value={id ? { id, label } : null}
      placeholder={meta.name}
      // The inline type-ahead (focus the field → dropdown) is the moysklad
      // primary path; there is no separate browse-modal for custom references.
      onPick={() => {}}
      onClear={() => {
        setPicked(null);
        onChange(null);
      }}
      inlineFetcher={fetcher}
      onInlineSelect={(item) => {
        setPicked({ id: item.id, label: String(item.primary) });
        onChange(item.id);
      }}
      // moysklad «+» — create a new referenced record (e.g. a Контрагент for «Уста»).
      onCreate={createRoute && !disabled ? () => router.push(createRoute) : undefined}
      disabled={disabled}
      testId={testId}
    />
  );
}
