import { z } from 'zod';

/**
 * LabelTemplate — reusable barcode-label paper layout config.
 *
 * A template defines:
 *  - paper format (A4 / A5 / A6 / custom)
 *  - grid dimensions (cols × rows)
 *  - per-label fields to include (name, price, barcode, article)
 *  - barcode format (EAN13 / CODE128 / QR)
 *
 * Print operations consume a template + product list, render the page,
 * record a LabelPrintJob audit row, and let the browser print.
 */

const uuid = z.string().uuid();
const intMm = z.coerce.number().int().min(0).max(500);

export const BarcodeFormatSchema = z.enum(['EAN13', 'CODE128', 'QR']);
export const PageSizeSchema = z.enum(['A4', 'A5', 'A6', 'custom']);

export const CreateLabelTemplateSchema = z
  .object({
    name: z.string().min(1).max(255),
    description: z.string().max(1024).optional(),
    pageSize: PageSizeSchema.default('A4'),
    pageWidthMm: intMm.optional(),
    pageHeightMm: intMm.optional(),
    cols: z.coerce.number().int().min(1).max(20).default(3),
    rows: z.coerce.number().int().min(1).max(40).default(8),
    marginTopMm: intMm.default(10),
    marginLeftMm: intMm.default(10),
    columnGapMm: intMm.default(3),
    rowGapMm: intMm.default(3),
    labelWidthMm: intMm.default(60),
    labelHeightMm: intMm.default(30),
    includeName: z.boolean().default(true),
    includePrice: z.boolean().default(true),
    includeBarcode: z.boolean().default(true),
    includeArticle: z.boolean().default(true),
    headerText: z.string().max(255).optional(),
    barcodeFormat: BarcodeFormatSchema.default('EAN13'),
  })
  .refine(
    (d) => {
      // When custom paper, both dimensions are required.
      if (d.pageSize === 'custom') {
        return d.pageWidthMm !== undefined && d.pageHeightMm !== undefined;
      }
      return true;
    },
    { message: "Custom paper size'da pageWidthMm va pageHeightMm majburiy" },
  );
export type CreateLabelTemplateInput = z.infer<typeof CreateLabelTemplateSchema>;

export const UpdateLabelTemplateSchema = z
  .object({
    version: z.number().int().nonnegative(),
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(1024).nullable().optional(),
    pageSize: PageSizeSchema.optional(),
    pageWidthMm: intMm.nullable().optional(),
    pageHeightMm: intMm.nullable().optional(),
    cols: z.coerce.number().int().min(1).max(20).optional(),
    rows: z.coerce.number().int().min(1).max(40).optional(),
    marginTopMm: intMm.optional(),
    marginLeftMm: intMm.optional(),
    columnGapMm: intMm.optional(),
    rowGapMm: intMm.optional(),
    labelWidthMm: intMm.optional(),
    labelHeightMm: intMm.optional(),
    includeName: z.boolean().optional(),
    includePrice: z.boolean().optional(),
    includeBarcode: z.boolean().optional(),
    includeArticle: z.boolean().optional(),
    headerText: z.string().max(255).nullable().optional(),
    barcodeFormat: BarcodeFormatSchema.optional(),
    archived: z.boolean().optional(),
  })
  .strict();
export type UpdateLabelTemplateInput = z.infer<typeof UpdateLabelTemplateSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const LabelTemplateFilterSchema = z.object({
  search: z.string().max(100).optional(),
  archived: boolFromString.optional(),
  pageSize: PageSizeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});

/**
 * Render request — given a template + product+qty list, returns:
 *   - per-product display data (name, price, barcode string, article)
 *   - layout config (paper size, grid)
 * The client uses this to render the print preview / sheet.
 *
 * Optionally records a LabelPrintJob audit row when `recordJob=true`.
 */
export const RenderLabelsSchema = z.object({
  templateId: uuid,
  items: z
    .array(
      z.object({
        productId: uuid,
        quantity: z.coerce.number().int().min(1).max(10_000),
      }),
    )
    .min(1, 'Kamida 1 ta mahsulot'),
  /** When true, persist a LabelPrintJob row for audit. */
  recordJob: z.boolean().default(false),
});
export type RenderLabelsInput = z.infer<typeof RenderLabelsSchema>;
