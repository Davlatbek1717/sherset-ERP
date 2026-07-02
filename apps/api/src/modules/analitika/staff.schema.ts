import { z } from 'zod';

const numFromString = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === 'number' ? v : Number.parseInt(v, 10)));

/**
 * Filter for the analitika staff list. Lean by design — full HR-side editing
 * remains in `/hr/employees`; this endpoint exposes only what the Analitika
 * /xodimlar pages render, gated by the `analitika.view` RBAC entity.
 */
export const StaffListFilterSchema = z.object({
  search: z.string().max(100).optional(),
  page: numFromString.pipe(z.number().int().min(1)).default(1),
  pageSize: numFromString.pipe(z.number().int().min(1).max(200)).default(50),
});
export type StaffListFilterInput = z.infer<typeof StaffListFilterSchema>;

const phonePattern = /^\+?\d{9,15}$/;
const usernamePattern = /^[a-z0-9_]+$/;
const emptyToUndef = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());

/**
 * Create payload — wizard captures basic identity + a password + a set of
 * role ids. Email is required (login key); username is optional (used as a
 * short login alias when present).
 */
export const CreateStaffSchema = z.object({
  email: z.string().trim().email().max(255),
  name: z.string().trim().min(1).max(255),
  fullName: emptyToUndef.pipe(z.string().max(310).optional()),
  firstName: emptyToUndef.pipe(z.string().max(100).optional()),
  lastName: emptyToUndef.pipe(z.string().max(100).optional()),
  position: emptyToUndef.pipe(z.string().max(255).optional()),
  phone: emptyToUndef.pipe(
    z
      .string()
      .refine((v) => phonePattern.test(v), 'Telefon formati notoʼgʼri')
      .optional(),
  ),
  username: emptyToUndef.pipe(
    z
      .string()
      .min(3)
      .max(50)
      .refine((v) => usernamePattern.test(v), 'Faqat kichik lotin harf/raqam/_')
      .optional(),
  ),
  password: z.string().min(8).max(255),
  roleIds: z.array(z.string().uuid()).default([]),
});
export type CreateStaffInput = z.infer<typeof CreateStaffSchema>;

/**
 * Update payload — every field optional. Password resets only when present
 * and non-empty (edit form leaves it blank when unchanged).
 */
export const UpdateStaffSchema = z.object({
  email: z.string().trim().email().max(255).optional(),
  name: z.string().trim().min(1).max(255).optional(),
  fullName: emptyToUndef.pipe(z.string().max(310).optional()),
  firstName: emptyToUndef.pipe(z.string().max(100).optional()),
  lastName: emptyToUndef.pipe(z.string().max(100).optional()),
  position: emptyToUndef.pipe(z.string().max(255).optional()),
  phone: emptyToUndef.pipe(
    z
      .string()
      .refine((v) => phonePattern.test(v), 'Telefon formati notoʼgʼri')
      .optional(),
  ),
  username: emptyToUndef.pipe(
    z
      .string()
      .min(3)
      .max(50)
      .refine((v) => usernamePattern.test(v), 'Faqat kichik lotin harf/raqam/_')
      .optional(),
  ),
  password: emptyToUndef.pipe(z.string().min(8).max(255).optional()),
  roleIds: z.array(z.string().uuid()).optional(),
  archived: z.boolean().optional(),
  // Optimistic-lock token (moysklad parity). REQUIRED on update — the same
  // Employee row is also editable from /hr/employees and /auth/me, so the
  // version this form loaded must round-trip or the lost-update guard is
  // silently bypassable. Guards the FULL update incl. the EmployeeRole rewrite.
  version: z.number().int().nonnegative(),
});
export type UpdateStaffInput = z.infer<typeof UpdateStaffSchema>;
