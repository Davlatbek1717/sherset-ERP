'use client';

import { api } from '@/lib/api-client';
import {
  Alert,
  Button,
  Checkbox,
  FormField,
  Icons,
  Input,
  Label,
  Modal,
  NativeSelect,
  Textarea,
} from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface AttributeRow {
  id: string;
  entity: string;
  code: string;
  name: string;
  type: string;
  required: boolean;
  position: number;
  archived: boolean;
  description: string | null;
  enumOptions: Array<{ value: string; label: string }> | null;
  referenceEntity: string | null;
  customEntityId: string | null;
  defaultValue: unknown;
}

// Display order; labels come from the shared `attribute_type` i18n namespace
// (same source the attributes list page uses — no duplicated label strings).
const ATTR_TYPE_VALUES = [
  'string',
  'text',
  'long',
  'double',
  'boolean',
  'date',
  'enum',
  'reference',
  'link',
  'file',
] as const;

const REF_ENTITIES = [
  'Counterparty',
  'Product',
  'Variant',
  'Bundle',
  'ProductFolder',
  'Project',
  'Contract',
  'Employee',
  'Organization',
  'Store',
  'CustomEntity',
];

interface BaseProps {
  onClose: () => void;
  onSaved: () => void;
}
type Props =
  | ({ mode: 'create'; entity: string } & BaseProps)
  | ({ mode: 'edit'; id: string } & BaseProps);

export function AttributeMetadataDialog(props: Props) {
  const editing = props.mode === 'edit';
  const t = useTranslations('pages.attribute_admin');
  const tTypes = useTranslations('attribute_type');
  const tEntities = useTranslations('attribute_entity');

  const { data: existing } = useQuery<AttributeRow>({
    queryKey: ['attribute-metadata', editing ? props.id : null],
    queryFn: () => api.get(`/attribute-metadata/${props.mode === 'edit' ? props.id : ''}`),
    enabled: editing,
  });

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('string');
  const [required, setRequired] = useState(false);
  const [description, setDescription] = useState('');
  const [position, setPosition] = useState(0);
  const [enumOptionsRaw, setEnumOptionsRaw] = useState(''); // "value|Label" per line
  const [referenceEntity, setReferenceEntity] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing && existing) {
      setCode(existing.code);
      setName(existing.name);
      setType(existing.type);
      setRequired(existing.required);
      setDescription(existing.description ?? '');
      setPosition(existing.position);
      if (existing.enumOptions) {
        setEnumOptionsRaw(existing.enumOptions.map((o) => `${o.value}|${o.label}`).join('\n'));
      }
      setReferenceEntity(existing.referenceEntity ?? '');
    }
  }, [editing, existing]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error(t('error_name_required'));
      if (!editing && !/^[a-z][a-z0-9_]{1,49}$/.test(code)) throw new Error(t('error_code_format'));

      const enumOptions =
        type === 'enum'
          ? enumOptionsRaw
              .split('\n')
              .map((l) => l.trim())
              .filter(Boolean)
              .map((l) => {
                const [v, lbl] = l.split('|');
                return { value: (v ?? '').trim(), label: (lbl ?? v ?? '').trim() };
              })
              .filter((o) => o.value)
          : undefined;

      if (type === 'enum' && (!enumOptions || enumOptions.length === 0))
        throw new Error(t('error_enum_min'));
      if (type === 'reference' && !referenceEntity) throw new Error(t('error_reference_target'));

      const payload: Record<string, unknown> = {
        name,
        type,
        required,
        position,
        description: description || null,
        enumOptions,
        referenceEntity: type === 'reference' ? referenceEntity : null,
      };
      if (!editing) {
        payload.entity = (props as { entity: string }).entity;
        payload.code = code;
      }

      if (editing) {
        return api.patch(`/attribute-metadata/${(props as { id: string }).id}`, payload);
      }
      return api.post('/attribute-metadata', payload);
    },
    onSuccess: () => props.onSaved(),
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Modal
      open
      onOpenChange={(o) => !o && props.onClose()}
      title={editing ? t('edit_title') : t('create_title')}
      widthClass="w-[560px]"
      testId="attribute-metadata-dialog"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={props.onClose}>
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            form="attribute-metadata-form"
            loading={saveMut.isPending}
            data-test-id="attr-save"
          >
            <Icons.save className="h-4 w-4" />
            {t('save')}
          </Button>
        </>
      }
    >
      <form
        id="attribute-metadata-form"
        className="space-y-4 px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          saveMut.mutate();
        }}
      >
        {error && <Alert tone="destructive">{error}</Alert>}

        <FormField id="name" label={t('field_name')} required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('field_name_placeholder')}
            data-test-id="attr-name"
          />
        </FormField>

        <FormField id="code" label={t('field_code')} required>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            disabled={editing}
            placeholder={t('field_code_placeholder')}
            data-test-id="attr-code"
          />
        </FormField>

        <FormField id="type" label={t('field_type')} required>
          <NativeSelect
            value={type}
            onChange={(e) => setType(e.target.value)}
            data-test-id="attr-type"
          >
            {ATTR_TYPE_VALUES.map((v) => (
              <option key={v} value={v}>
                {tTypes(v)}
              </option>
            ))}
          </NativeSelect>
        </FormField>

        {type === 'enum' && (
          <FormField id="enumOptions" label={t('field_enum_options')}>
            <Textarea
              value={enumOptionsRaw}
              onChange={(e) => setEnumOptionsRaw(e.target.value)}
              rows={4}
              className="w-full rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-3 py-2 font-mono text-sm"
              placeholder={t('field_enum_placeholder')}
              data-test-id="attr-enum"
            />
          </FormField>
        )}

        {type === 'reference' && (
          <FormField id="referenceEntity" label={t('field_reference')}>
            <NativeSelect
              value={referenceEntity}
              onChange={(e) => setReferenceEntity(e.target.value)}
              data-test-id="attr-ref-entity"
            >
              <option value="">{t('field_reference_select')}</option>
              {REF_ENTITIES.map((e) => (
                <option key={e} value={e}>
                  {tEntities(e)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        )}

        <div className="grid grid-cols-2 gap-4">
          <FormField id="required" label={t('field_required')}>
            <div className="flex h-9 items-center">
              <Checkbox checked={required} onCheckedChange={(v) => setRequired(Boolean(v))} />
              <Label className="ml-2 text-sm">{t('field_required_hint')}</Label>
            </div>
          </FormField>

          <FormField id="position" label={t('field_position')}>
            <Input
              type="number"
              value={String(position)}
              onChange={(e) => setPosition(Number.parseInt(e.target.value, 10) || 0)}
              data-test-id="attr-position"
            />
          </FormField>
        </div>

        <FormField id="description" label={t('field_description')}>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('field_description_placeholder')}
            data-test-id="attr-description"
          />
        </FormField>
      </form>
    </Modal>
  );
}
