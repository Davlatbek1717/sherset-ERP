import { z } from 'zod';

/**
 * AttributeMetadata schema — defines custom field definitions for entities.
 *
 * Mirrors moysklad's "Дополнительные поля" admin screen. Each row defines
 * one configurable field for a specific entity type; values live in that
 * entity's `attributes Json` column keyed by `code`.
 */

/** Whitelist of entity names that can have attributes. Must match Prisma model names. */
export const AttributeEntitySchema = z.enum([
  'Counterparty',
  'Product',
  'Variant',
  'Bundle',
  'Service',
  'ProductFolder',
  'CustomerOrder',
  'Demand',
  'InvoiceOut',
  'SalesReturn',
  'PurchaseOrder',
  'Supply',
  'InvoiceIn',
  'PurchaseReturn',
  'Move',
  'Loss',
  'Enter',
  'Inventory',
  'PaymentIn',
  'PaymentOut',
  'CashIn',
  'CashOut',
  'Project',
  'Contract',
  'Employee',
  'Organization',
  'Store',
  'RetailSale',
  'InternalOrder',
  'Prepayment',
  'PriceList',
  'Production',
  'ProcessingOrder',
  'ServiceRequest',
]);
export type AttributeEntity = z.infer<typeof AttributeEntitySchema>;

/** Field type — controls input rendering and value validation. */
export const AttributeTypeSchema = z.enum([
  'string', // short text
  'text', // long text (textarea)
  'long', // 64-bit integer
  'double', // decimal number
  'boolean', // checkbox
  'date', // ISO date
  'file', // file attachment id
  'link', // URL
  'enum', // single-select from enumOptions
  'reference', // FK to another entity (referenceEntity required)
]);
export type AttributeType = z.infer<typeof AttributeTypeSchema>;

/** Single enum option — value is what's stored, label is what's shown. */
export const EnumOptionSchema = z.object({
  value: z.string().min(1).max(50),
  label: z.string().min(1).max(255),
});
export type EnumOption = z.infer<typeof EnumOptionSchema>;

/** Code rule: lowercase alphanumeric + underscore, 2-50 chars, can't change. */
const codeRegex = /^[a-z][a-z0-9_]{1,49}$/;

const baseFields = z.object({
  entity: AttributeEntitySchema,
  code: z.string().regex(codeRegex, 'code: lowercase + underscore, starts with letter'),
  name: z.string().min(1).max(255),
  type: AttributeTypeSchema,
  required: z.boolean().default(false),
  defaultValue: z.unknown().optional(),
  description: z.string().max(2000).nullish(),
  enumOptions: z.array(EnumOptionSchema).optional(),
  referenceEntity: AttributeEntitySchema.or(z.literal('CustomEntity')).nullish(),
  customEntityId: z.string().uuid().nullish(),
  position: z.number().int().min(0).max(10000).default(0),
  archived: z.boolean().default(false),
  shared: z.boolean().default(false),
});

/** Cross-field validation: enum requires options; reference requires referenceEntity. */
function refineCreate<T extends z.ZodTypeAny>(schema: T) {
  // superRefine runs over a generic `T extends z.ZodTypeAny`: the value is
  // only accessed structurally (.type/.enumOptions/.referenceEntity) and a
  // precise type would duplicate the schema shape — z.infer<ZodTypeAny>
  // collapses to any regardless.
  // biome-ignore lint/suspicious/noExplicitAny: generic Zod superRefine value (see note above)
  return schema.superRefine((val: any, ctx) => {
    if (val.type === 'enum') {
      if (!val.enumOptions || val.enumOptions.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'enum: kamida 1 ta option kerak',
          path: ['enumOptions'],
        });
      }
    }
    if (val.type === 'reference') {
      if (!val.referenceEntity) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'reference: referenceEntity tanlang',
          path: ['referenceEntity'],
        });
      }
      if (val.referenceEntity === 'CustomEntity' && !val.customEntityId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'CustomEntity reference: customEntityId tanlang',
          path: ['customEntityId'],
        });
      }
    }
  });
}

export const CreateAttributeMetadataSchema = refineCreate(baseFields);
export type CreateAttributeMetadataInput = z.infer<typeof CreateAttributeMetadataSchema>;

/** Update — code and entity are immutable. */
export const UpdateAttributeMetadataSchema = baseFields
  .omit({ entity: true, code: true })
  .partial()
  .superRefine((val, ctx) => {
    if (val.type === 'enum' && val.enumOptions && val.enumOptions.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'enum: kamida 1 ta option kerak',
        path: ['enumOptions'],
      });
    }
  });
export type UpdateAttributeMetadataInput = z.infer<typeof UpdateAttributeMetadataSchema>;

/** List filter. */
const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const AttributeMetadataFilterSchema = z.object({
  entity: AttributeEntitySchema.optional(),
  archived: boolFromString.optional(),
  search: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  cursor: z.string().uuid().optional(),
  sortBy: z.enum(['position', 'name', 'createdAt']).default('position'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});
export type AttributeMetadataFilterInput = z.infer<typeof AttributeMetadataFilterSchema>;

/**
 * Validates a single attribute value against its metadata definition.
 * Returns the normalized value or throws.
 */
export function validateAttributeValue(
  meta: {
    type: AttributeType;
    required: boolean;
    enumOptions?: EnumOption[] | null;
    name: string;
  },
  raw: unknown,
): unknown {
  if (raw == null || raw === '') {
    if (meta.required) throw new Error(`"${meta.name}" majburiy`);
    return null;
  }

  switch (meta.type) {
    case 'string':
    case 'text':
    case 'link':
      if (typeof raw !== 'string') throw new Error(`"${meta.name}" matn bo'lishi kerak`);
      return raw;
    case 'long': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isInteger(n)) throw new Error(`"${meta.name}" butun son bo'lishi kerak`);
      return n;
    }
    case 'double': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n)) throw new Error(`"${meta.name}" raqam bo'lishi kerak`);
      return n;
    }
    case 'boolean':
      return Boolean(raw);
    case 'date': {
      const d = new Date(String(raw));
      if (Number.isNaN(d.getTime())) throw new Error(`"${meta.name}" sana noto'g'ri`);
      return d.toISOString();
    }
    case 'file':
    case 'reference': {
      // Both store an id (uuid). Caller is responsible for FK existence check.
      const s = String(raw);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s))
        throw new Error(`"${meta.name}" UUID bo'lishi kerak`);
      return s;
    }
    case 'enum': {
      const s = String(raw);
      if (!meta.enumOptions?.some((o) => o.value === s))
        throw new Error(`"${meta.name}" ruxsat etilmagan qiymat`);
      return s;
    }
  }
}
