import { z } from 'zod';

const uuid = z.string().uuid();
const optionalEmpty = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.length === 0 ? null : v),
    z.string().max(max).nullish(),
  );

const slug = z
  .string()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9-_]*$/, "Slug: lowercase, raqamlar va '-_' belgilari");

export const HelpLocaleSchema = z.enum(['uz', 'ru', 'en']);
export type HelpLocale = z.infer<typeof HelpLocaleSchema>;

export const CreateHelpArticleSchema = z.object({
  slug,
  routeKey: optionalEmpty(120),
  locale: HelpLocaleSchema.default('uz'),
  title: z.string().min(1).max(255),
  bodyMd: z.string().min(1).max(200_000),
  position: z.coerce.number().int().min(0).max(9999).default(0),
  category: optionalEmpty(80),
  tags: z.array(z.string().min(1).max(50)).max(20).default([]),
  enabled: z.coerce.boolean().default(true),
});
export type CreateHelpArticleInput = z.infer<typeof CreateHelpArticleSchema>;

export const UpdateHelpArticleSchema = CreateHelpArticleSchema.partial();
export type UpdateHelpArticleInput = z.infer<typeof UpdateHelpArticleSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const HelpArticleFilterSchema = z.object({
  locale: HelpLocaleSchema.optional(),
  routeKey: z.string().max(120).optional(),
  category: z.string().max(80).optional(),
  enabled: boolFromString.optional(),
  archived: boolFromString.optional(),
  search: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: uuid.optional(),
});
export type HelpArticleFilterInput = z.infer<typeof HelpArticleFilterSchema>;
