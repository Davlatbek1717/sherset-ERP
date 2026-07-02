import { z } from 'zod';

const uuid = z.string().uuid();

export const CreateProductFolderSchema = z.object({
  name: z.string().min(1, 'Nomi majburiy').max(255),
  code: z.string().max(50).optional(),
  // moysklad «Внешний код» — universal sync key (model carries the
  // column; Update inherits via .partial()).
  externalCode: z.string().max(50).optional(),
  description: z.string().max(4096).optional(),
  parentId: uuid.nullable().optional(),
  vat: z.number().int().min(0).max(100).nullable().optional(),
  vatEnabled: z.boolean().default(true),
  useParentVat: z.boolean().default(true),
  taxSystem: z.string().max(30).optional(),
});

export const UpdateProductFolderSchema = CreateProductFolderSchema.partial();

const boolFromString = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const ProductFolderFilterSchema = z.object({
  search: z.string().optional(),
  parentId: uuid.nullable().optional(),
  archived: boolFromString.optional().default(false),
  limit: z.coerce.number().int().min(1).max(250).default(50),
});

export type CreateProductFolderInput = z.infer<typeof CreateProductFolderSchema>;
export type UpdateProductFolderInput = z.infer<typeof UpdateProductFolderSchema>;
export type ProductFolderFilter = z.infer<typeof ProductFolderFilterSchema>;
