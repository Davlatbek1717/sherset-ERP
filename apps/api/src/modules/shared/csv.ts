import { z } from 'zod';

/**
 * moysklad-parity multi-select reference filter — the list filter panels send
 * `<field>Ids` as a comma-separated string (or a repeated query param → array).
 * Both shapes normalize to a non-empty `string[]` of UUIDs, so a service can do
 * `{ <field>Id: { in: filter.<field>Ids } }`.
 *
 * Extracted from purchase-order.schema.ts (where it was a local const) so every
 * list module's «Контрагент»/«Организация»/… filters share ONE definition
 * instead of re-declaring it per file.
 */
export const csvUuid = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : v.split(',')))
  .pipe(z.array(z.string().uuid()).min(1));
