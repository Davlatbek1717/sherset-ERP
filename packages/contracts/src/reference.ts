import { z } from 'zod';
import { MinorAmount, Uuid } from './wire.js';

/**
 * Reference rows — the `{ id, name }`-shaped picker payloads that almost every
 * page re-declares locally. Each schema is a documented LOWER BOUND on the
 * server response: the endpoint returns at least these keys (the list services
 * return whole Prisma rows), and `contract-provenance` pins that claim to the
 * schema so a renamed column fails a test instead of a user's screen.
 */

/** `GET /cash-desks` row (`cash-desk.service.ts` → `list`). */
export const CashDeskRefSchema = z.object({
  id: Uuid,
  name: z.string(),
  /** ISO-4217 alpha code. The POS till currency is read straight off this. */
  currency: z.string(),
});
export type CashDeskRef = z.infer<typeof CashDeskRefSchema>;

/**
 * `GET /cash-desks` row including the running balance.
 *
 * `balanceMinor` is a `BigInt` column that `cash-desk.service.ts:35` stringifies
 * EXPLICITLY (`r.balanceMinor.toString()`) on top of the global BigInt→string
 * rule — either way it is a string on the wire, never a number.
 */
export const CashDeskRowSchema = CashDeskRefSchema.extend({
  balanceMinor: MinorAmount,
  archived: z.boolean(),
});
export type CashDeskRow = z.infer<typeof CashDeskRowSchema>;

/** `GET /stores` row (`store.service.ts` → `list`, via `serializeStore`). */
export const StoreRefSchema = z.object({
  id: Uuid,
  name: z.string(),
});
export type StoreRef = z.infer<typeof StoreRefSchema>;

/** `GET /organizations` row (`organization.service.ts` → `list`). */
export const OrganizationRefSchema = z.object({
  id: Uuid,
  name: z.string(),
});
export type OrganizationRef = z.infer<typeof OrganizationRefSchema>;

/** An employee/user reference (`{ id, name }` select on a `User` relation). */
export const UserRefSchema = z.object({
  id: Uuid,
  name: z.string(),
});
export type UserRef = z.infer<typeof UserRefSchema>;
