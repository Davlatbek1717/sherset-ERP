/**
 * moysklad API compatibility types — wire shape that callers (1C, partner
 * scripts, the CLIMART proxy at D:\projects-desktop\projects\moysklad)
 * expect when hitting `/api/remap/1.2/*`.
 *
 * Every entity row is wrapped with `meta` so consumers can dereference
 * across requests; FK columns become Meta references rather than bare
 * IDs.
 */

export interface MoyskladMeta {
  href: string;
  metadataHref?: string;
  type: string;
  mediaType: string;
  uuidHref?: string;
  size?: number;
  limit?: number;
  offset?: number;
  nextHref?: string;
  previousHref?: string;
}

export interface MoyskladListResponse<T = unknown> {
  context: { employee: { meta: MoyskladMeta } };
  meta: MoyskladMeta;
  rows: T[];
}

export interface MoyskladSingleResponse {
  context?: { employee: { meta: MoyskladMeta } };
  meta: MoyskladMeta;
  rows?: never;
  // The entity fields are spread at the top level alongside meta.
  [field: string]: unknown;
}

/** Common moysklad query params our compat router parses. */
export interface MoyskladListParams {
  /** 1-1000, default 1000. */
  limit: number;
  /** 0-based offset. */
  offset: number;
  /** Comma-separated list of relation names to inline expand. */
  expand?: string[];
  /** moysklad's filter syntax: `name~Test;agent=https://api.../id`. */
  filter?: string;
  /** moysklad's order syntax: `name,asc` or `name`. */
  order?: string;
  /** Free-text search across canonical text fields. */
  search?: string;
}
