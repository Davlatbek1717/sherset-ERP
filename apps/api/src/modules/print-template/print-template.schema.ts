import { z } from 'zod';

const uuid = z.string().uuid();
const optionalEmpty = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.length === 0 ? null : v),
    z.string().max(max).nullish(),
  );

/**
 * Subset of the moysklad printable-doc slugs supported by the editor.
 * Mirrors WebhookEntityType but limited to entities that have a default
 * print template implementation in PrintService.
 */
export const PrintEntitySchema = z.enum([
  'customerorder',
  'demand',
  'invoiceout',
  'salesreturn',
  'purchaseorder',
  'supply',
  'invoicein',
  'purchasereturn',
  'paymentin',
  'paymentout',
  'cashin',
  'cashout',
  'move',
  'loss',
  'enter',
  'inventory',
  'retaildemand',
  'production',
]);
export type PrintEntity = z.infer<typeof PrintEntitySchema>;

export const PrintFormatSchema = z.enum(['pdf', 'docx', 'xlsx', 'html', 'txt']);
export type PrintFormat = z.infer<typeof PrintFormatSchema>;

const pageSize = z.enum(['A4', 'A5', 'Letter', 'Legal', 'Custom']);

const marginInt = z.coerce.number().int().min(0).max(100);

// Shared field set. A template body is EITHER an HTML string (the editor) OR an
// uploaded Word/Excel file (base64 → PrintTemplate.bodyDocx) — moysklad parity.
const PrintTemplateFields = z.object({
  entity: PrintEntitySchema,
  format: PrintFormatSchema.default('pdf'),
  name: z.string().min(1).max(255),
  description: optionalEmpty(2000),
  bodyHtml: z.string().max(500_000).optional(),
  /** base64 of an uploaded .docx/.xlsx template (~max 22MB encoded). */
  bodyDocxBase64: z.string().max(30_000_000).optional(),
  pageSize: pageSize.default('A4'),
  marginTop: marginInt.default(20),
  marginRight: marginInt.default(15),
  marginBottom: marginInt.default(20),
  marginLeft: marginInt.default(15),
  isDefault: z.coerce.boolean().default(false),
  enabled: z.coerce.boolean().default(true),
});

export const CreatePrintTemplateSchema = PrintTemplateFields.refine(
  (v) => (v.bodyHtml?.length ?? 0) > 0 || (v.bodyDocxBase64?.length ?? 0) > 0,
  { message: 'HTML matni yoki yuklangan fayl kerak', path: ['bodyHtml'] },
);
export type CreatePrintTemplateInput = z.infer<typeof CreatePrintTemplateSchema>;

export const UpdatePrintTemplateSchema = PrintTemplateFields.partial();
export type UpdatePrintTemplateInput = z.infer<typeof UpdatePrintTemplateSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const PrintTemplateFilterSchema = z.object({
  entity: PrintEntitySchema.optional(),
  format: PrintFormatSchema.optional(),
  enabled: boolFromString.optional(),
  archived: boolFromString.optional(),
  search: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  cursor: uuid.optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});
export type PrintTemplateFilterInput = z.infer<typeof PrintTemplateFilterSchema>;
