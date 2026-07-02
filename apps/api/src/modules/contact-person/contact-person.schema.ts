import { z } from 'zod';
import { tryNormalizeUzPhone } from '../shared/phone.js';

const uuid = z.string().uuid();

export const CreateContactPersonSchema = z.object({
  counterpartyId: uuid,
  name: z.string().min(1).max(255),
  position: z.string().max(255).nullish(),
  phone: z
    .string()
    .max(40)
    .nullish()
    .transform((v) => {
      if (!v || v.trim() === '') return null;
      return tryNormalizeUzPhone(v) ?? v.trim();
    }),
  email: z
    .string()
    .email()
    .max(255)
    .nullish()
    .or(z.literal('').transform(() => null)),
  description: z.string().max(4000).nullish(),
});
export type CreateContactPersonInput = z.infer<typeof CreateContactPersonSchema>;

export const UpdateContactPersonSchema = CreateContactPersonSchema.partial().extend({
  version: z.number().int().nonnegative(),
});
export type UpdateContactPersonInput = z.infer<typeof UpdateContactPersonSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const ContactPersonFilterSchema = z.object({
  counterpartyId: uuid.optional(),
  archived: boolFromString.optional(),
  search: z.string().max(100).optional(),
  ownerId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: uuid.optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt', 'agent']).default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});
export type ContactPersonFilterInput = z.infer<typeof ContactPersonFilterSchema>;
