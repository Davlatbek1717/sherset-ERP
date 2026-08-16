import { z } from 'zod';

/**
 * Publication — public-link sharing for documents.
 *
 * One publication per (account, targetType, targetId). Re-publishing
 * the same doc returns the existing row (idempotent via upsert).
 *
 * Token is generated server-side (32 chars URL-safe base64) and embedded
 * in the public URL: `/p/<token>`. Anyone with the token can view the doc
 * — guard accordingly when sharing externally.
 */

const uuid = z.string().uuid();

export const PublicationTargetTypeSchema = z.enum([
  'customerorder',
  'invoiceout',
  'demand',
  'supply',
  'paymentin',
  'paymentout',
  'cashin',
  'cashout',
  'salesreturn',
  'purchasereturn',
  'move',
  'enter',
  'loss',
  'inventory',
  'purchaseorder',
  'invoicein',
  'payroll',
  'factureout',
  'facturein',
  'commissionreport',
  'consignment',
  'pricelist',
  'prepayment',
  'prepaymentreturn',
  'internalorder',
  'counterpartyadjustment',
  'processingorder',
  'processing',
  /**
   * Kassa cheki (2026-08-16). Mijozga Telegram xabarida «🧾 Chek: …» havolasi
   * shu tur orqali beriladi — MoySklad'ning `mskld.ru/...` havolasi ekvivalenti.
   */
  'retailsale',
]);
export type PublicationTargetType = z.infer<typeof PublicationTargetTypeSchema>;

export const CreatePublicationSchema = z.object({
  targetType: PublicationTargetTypeSchema,
  targetId: uuid,
  description: z.string().max(1024).optional(),
  expiresAt: z.string().optional(),
  /** Optional plain-text password; service hashes it before persist. */
  password: z.string().min(4).max(255).optional(),
});
export type CreatePublicationInput = z.infer<typeof CreatePublicationSchema>;

export const UpdatePublicationSchema = z
  .object({
    version: z.number().int().nonnegative(),
    description: z.string().max(1024).nullable().optional(),
    expiresAt: z.string().nullable().optional(),
    password: z.string().min(4).max(255).nullable().optional(),
  })
  .strict();
export type UpdatePublicationInput = z.infer<typeof UpdatePublicationSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const PublicationFilterSchema = z.object({
  targetType: PublicationTargetTypeSchema.optional(),
  targetId: uuid.optional(),
  ownerId: uuid.optional(),
  revoked: boolFromString.optional(),
  expired: boolFromString.optional(),
  search: z.string().max(100).optional(),
  includeDeleted: boolFromString.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: uuid.optional(),
  sortBy: z.enum(['createdAt', 'lastViewedAt', 'viewCount']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type PublicationFilterInput = z.infer<typeof PublicationFilterSchema>;

/** Public-viewer password check (separate endpoint). */
export const PublicationVerifyPasswordSchema = z.object({
  password: z.string().min(1).max(255),
});
