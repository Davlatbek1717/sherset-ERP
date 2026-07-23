import { z } from 'zod';

/**
 * moysklad «Привязать документ» — a manual link between two documents. The FE
 * snapshots both endpoints' display fields (name/date/sum/state) at link time so
 * the related-docs panel renders each linked card without a cross-model lookup.
 */
export const CreateDocumentLinkSchema = z.object({
  sourceType: z.string().min(1).max(64),
  sourceId: z.string().uuid(),
  sourceName: z.string().min(1).max(255),
  sourceMoment: z.string().min(1),
  sourceSumMinor: z.string().regex(/^-?\d+$/, 'sumMinor must be an integer string'),
  sourceState: z.string().max(32).default('draft'),
  targetType: z.string().min(1).max(64),
  targetId: z.string().uuid(),
  targetName: z.string().min(1).max(255),
  targetMoment: z.string().min(1),
  targetSumMinor: z.string().regex(/^-?\d+$/, 'sumMinor must be an integer string'),
  targetState: z.string().max(32).default('draft'),
});
export type CreateDocumentLinkInput = z.infer<typeof CreateDocumentLinkSchema>;

export const ListDocumentLinksSchema = z.object({
  entityType: z.string().min(1).max(64),
  entityId: z.string().uuid(),
});

const csv = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) =>
    v == null ? [] : (Array.isArray(v) ? v : v.split(',')).map((s) => s.trim()).filter(Boolean),
  );

/**
 * «Привязка документа» modal search — a UNIFIED cross-document list to pick docs
 * to link. Filters mirror moysklad: number, period, counterparty, organization,
 * type, status, source/target store. Excludes the current doc (self).
 */
export const SearchDocumentsSchema = z.object({
  // The document being edited — excluded from results.
  selfType: z.string().max(64).optional(),
  selfId: z.string().uuid().optional(),
  number: z.string().max(100).optional(),
  agentIds: csv,
  organizationIds: csv,
  // doc-type keys to include (empty = «Все»).
  types: csv,
  state: z.string().max(30).optional(),
  storeFromId: z.string().uuid().optional(),
  storeToId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});
export type SearchDocumentsInput = z.infer<typeof SearchDocumentsSchema>;
