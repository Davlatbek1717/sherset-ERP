import { type ZodTypeAny, z } from 'zod';

/**
 * The list envelope every paginated ERP endpoint returns.
 *
 * 92 web files hand-declare their own `interface ListResponse` (FE-12 audit).
 * They do NOT all agree, and the disagreement is real rather than sloppy:
 *
 *   - `cash-desk.service.ts:34` → `{ items, nextCursor, total }`
 *   - `store.service.ts:115`    → `{ items, nextCursor, total }`
 *   - `product.service.ts:164`  → `{ items }` (the storage-location sub-list)
 *
 * So `total`/`nextCursor` are genuinely optional across the API surface, and a
 * shared envelope must model them as optional. Callers that need `total` as a
 * number already write `data?.total ?? 0`; the few that treat it as required
 * keep their own narrowed type until they are migrated individually.
 *
 * `nextCursor` is `string | undefined` (absent when there is no next page) —
 * the API omits the key rather than sending `null` (`hasMore ? … : undefined`).
 */
export function listEnvelope<T extends ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().optional(),
    nextCursor: z.string().optional(),
  });
}

/** Type-level form of {@link listEnvelope} for `import type` consumers. */
export interface ListEnvelope<T> {
  items: T[];
  total?: number;
  nextCursor?: string;
}
