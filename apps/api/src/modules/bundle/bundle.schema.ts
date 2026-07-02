import { z } from 'zod';

/**
 * Bundle (Комплект) — a composite product whose stock is derived from its
 * components. Reuses Product.kind='bundle' as the parent row; the
 * BundleComponent table attaches component products/variants with qty.
 */

const uuid = z.string().uuid();

export const BundleComponentInputSchema = z
  .object({
    componentProductId: uuid.nullable().optional(),
    componentVariantId: uuid.nullable().optional(),
    quantity: z.coerce.string().regex(/^\d+(\.\d{1,6})?$/, 'quantity must be a positive decimal'),
    position: z.coerce.number().int().min(0).default(0),
  })
  .refine((v) => !!v.componentProductId || !!v.componentVariantId, {
    message: 'componentProductId or componentVariantId required',
    path: ['componentProductId'],
  });
export type BundleComponentInput = z.infer<typeof BundleComponentInputSchema>;

export const SetBundleComponentsSchema = z.object({
  components: z.array(BundleComponentInputSchema).min(1, 'Kamida bitta component kerak'),
});
export type SetBundleComponentsInput = z.infer<typeof SetBundleComponentsSchema>;
