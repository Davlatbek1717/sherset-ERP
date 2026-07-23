import { Prisma } from '@moysklad/db';
import { HttpException } from '@nestjs/common';

/**
 * Pure query-building logic for the moysklad-compat router: translates
 * moysklad's `filter=`/`order=` wire syntax into Prisma `where`/`orderBy`.
 *
 * Kept free of Nest DI / DB access so the translation rules are unit-testable
 * against the real dmmf (which also pins schema assumptions like "documents
 * soft-delete via deletedAt, references archive via archived").
 *
 * Wire names differ from our columns in two places: `updated`→`updatedAt`,
 * `created`→`createdAt`. Everything else must be an actual scalar column of
 * the model — unknown fields fail with moysklad's 412 (Precondition Failed)
 * instead of being silently ignored, so integrations notice their mistake.
 */

const FIELD_ALIASES: Record<string, string> = {
  updated: 'updatedAt',
  created: 'createdAt',
};

/** moysklad filter operators, longest first so `>=` wins over `>`. */
const OPERATORS = ['>=', '<=', '!=', '=~', '~=', '~', '>', '<', '='] as const;
type Operator = (typeof OPERATORS)[number];

const fieldTypeCache = new Map<string, Map<string, string>>();

/**
 * Scalar field name → dmmf type ('String' | 'DateTime' | 'Boolean' | 'Int' |
 * 'BigInt' | 'Decimal' | 'Float' | ...) for a Prisma delegate key
 * (e.g. 'customerOrder').
 */
export function scalarFieldTypes(modelKey: string): Map<string, string> {
  const cached = fieldTypeCache.get(modelKey);
  if (cached) return cached;
  const dmmfName = modelKey.charAt(0).toUpperCase() + modelKey.slice(1);
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === dmmfName);
  if (!model) throw new Error(`moysklad-compat: no dmmf model for delegate '${modelKey}'`);
  const map = new Map<string, string>();
  for (const f of model.fields) {
    if (f.kind === 'scalar' || f.kind === 'enum') map.set(f.name, f.type);
  }
  fieldTypeCache.set(modelKey, map);
  return map;
}

/** moysklad-style 412 body: {errors:[{error}]} — what real clients parse. */
function preconditionFailed(message: string): HttpException {
  return new HttpException({ errors: [{ error: message }] }, 412);
}

function resolveField(wireName: string, fields: Map<string, string>, context: string): string {
  const column = FIELD_ALIASES[wireName] ?? wireName;
  if (!fields.has(column)) {
    throw preconditionFailed(
      `Unknown ${context} field '${wireName}'. Known fields: ${[...fields.keys()]
        .map((f) => (f === 'updatedAt' ? 'updated' : f === 'createdAt' ? 'created' : f))
        .join(', ')}`,
    );
  }
  return column;
}

/**
 * Accepts moysklad datetime (`YYYY-MM-DD HH:MM:SS[.mmm]`, date-only) or full
 * ISO. Bare datetimes are read as UTC — the compat API also EMITS `updated`/
 * `created` as UTC ISO, so clients echoing our timestamps back for
 * incremental sync stay self-consistent.
 */
function parseDateValue(raw: string, wireName: string): Date {
  const bare = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2})(\.\d{1,3})?)?$/.exec(raw);
  const iso = bare ? `${bare[1]}T${bare[2] ?? '00:00:00'}${bare[3] ?? ''}Z` : raw;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw preconditionFailed(`Cannot parse datetime '${raw}' for filter field '${wireName}'`);
  }
  return date;
}

function coerceValue(raw: string, type: string, wireName: string): unknown {
  switch (type) {
    case 'DateTime':
      return parseDateValue(raw, wireName);
    case 'Boolean':
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      throw preconditionFailed(`Filter field '${wireName}' expects true/false, got '${raw}'`);
    case 'Int':
    case 'Float':
    case 'Decimal': {
      const n = Number(raw);
      if (Number.isNaN(n)) {
        throw preconditionFailed(`Filter field '${wireName}' expects a number, got '${raw}'`);
      }
      return n;
    }
    case 'BigInt': {
      try {
        return BigInt(raw);
      } catch {
        throw preconditionFailed(`Filter field '${wireName}' expects an integer, got '${raw}'`);
      }
    }
    default:
      return raw;
  }
}

interface FieldConditions {
  equals: unknown[];
  ranges: Record<string, unknown>;
}

/**
 * Parses moysklad filter syntax: `;`-separated `field OP value` conditions.
 * moysklad semantics: repeated `=` on the same field is OR (→ Prisma `in`),
 * different fields AND. String ops: `~` contains, `~=` starts-with,
 * `=~` ends-with (all case-insensitive, matching moysklad).
 */
export function parseFilter(
  filter: string,
  fields: Map<string, string>,
): { where: Record<string, unknown>; touched: Set<string> } {
  const perField = new Map<string, FieldConditions>();
  const touched = new Set<string>();

  for (const rawCond of filter.split(';')) {
    const cond = rawCond.trim();
    if (!cond) continue;
    let op: Operator | undefined;
    let idx = -1;
    for (const candidate of OPERATORS) {
      const i = cond.indexOf(candidate);
      if (i > 0 && (idx === -1 || i < idx || (i === idx && candidate.length > (op?.length ?? 0)))) {
        op = candidate;
        idx = i;
      }
    }
    if (!op || idx <= 0) {
      throw preconditionFailed(`Cannot parse filter condition '${cond}'`);
    }
    const wireName = cond.slice(0, idx).trim();
    const rawValue = cond.slice(idx + op.length).trim();
    const column = resolveField(wireName, fields, 'filter');
    const type = fields.get(column) as string;
    const isString = !['DateTime', 'Boolean', 'Int', 'Float', 'Decimal', 'BigInt'].includes(type);
    if (['~', '~=', '=~'].includes(op) && !isString) {
      throw preconditionFailed(
        `Operator '${op}' is only valid for string field, got '${wireName}'`,
      );
    }
    const value = coerceValue(rawValue, type, wireName);

    const bucket = perField.get(column) ?? { equals: [], ranges: {} };
    switch (op) {
      case '=':
        bucket.equals.push(value);
        break;
      case '!=':
        bucket.ranges.not = value;
        break;
      case '>':
        bucket.ranges.gt = value;
        break;
      case '>=':
        bucket.ranges.gte = value;
        break;
      case '<':
        bucket.ranges.lt = value;
        break;
      case '<=':
        bucket.ranges.lte = value;
        break;
      case '~':
        bucket.ranges.contains = value;
        bucket.ranges.mode = 'insensitive';
        break;
      case '~=':
        bucket.ranges.startsWith = value;
        bucket.ranges.mode = 'insensitive';
        break;
      case '=~':
        bucket.ranges.endsWith = value;
        bucket.ranges.mode = 'insensitive';
        break;
    }
    perField.set(column, bucket);
    touched.add(column);
  }

  const where: Record<string, unknown> = {};
  for (const [column, { equals, ranges }] of perField) {
    const clause: Record<string, unknown> = { ...ranges };
    if (equals.length === 1) clause.equals = equals[0];
    else if (equals.length > 1) clause.in = equals;
    // Single bare equality collapses to the scalar (nicer Prisma plans/logs).
    where[column] = Object.keys(clause).length === 1 && 'equals' in clause ? clause.equals : clause;
  }
  return { where, touched };
}

/**
 * Parses moysklad order syntax: `field[,asc|desc]` segments separated by
 * `;`. Direction defaults to asc (moysklad behaviour).
 */
export function parseOrder(
  order: string,
  fields: Map<string, string>,
): Array<Record<string, 'asc' | 'desc'>> {
  const result: Array<Record<string, 'asc' | 'desc'>> = [];
  for (const rawSegment of order.split(';')) {
    const segment = rawSegment.trim();
    if (!segment) continue;
    const [wireName = '', rawDir] = segment.split(',').map((s) => s.trim());
    const column = resolveField(wireName, fields, 'order');
    if (rawDir && rawDir !== 'asc' && rawDir !== 'desc') {
      throw preconditionFailed(`Order direction must be asc|desc, got '${rawDir}'`);
    }
    result.push({ [column]: rawDir === 'desc' ? 'desc' : 'asc' });
  }
  return result.length ? result : [{ updatedAt: 'desc' }];
}

export interface ListQueryInput {
  accountId: string;
  filter?: string;
  order?: string;
  search?: string;
}

/**
 * Builds the full Prisma list query for a compat slug. Defaults mirror
 * moysklad: archived rows hidden unless `filter=archived=true`, soft-deleted
 * rows always hidden. Both guards apply only when the model actually has the
 * column — documents have `deletedAt` but no `archived`, references the
 * opposite (this mismatch is exactly what 500'd every document slug before).
 */
export function buildListQuery(
  fields: Map<string, string>,
  input: ListQueryInput,
): { where: Record<string, unknown>; orderBy: Array<Record<string, 'asc' | 'desc'>> } {
  const { where: filterWhere, touched } = input.filter
    ? parseFilter(input.filter, fields)
    : { where: {}, touched: new Set<string>() };

  const where: Record<string, unknown> = { accountId: input.accountId, ...filterWhere };
  if (fields.has('archived') && !touched.has('archived')) where.archived = false;
  if (fields.has('deletedAt') && !touched.has('deletedAt')) where.deletedAt = null;

  if (input.search) {
    const searchable = ['name', 'code'].filter((f) => fields.get(f) === 'String');
    if (searchable.length) {
      where.OR = searchable.map((f) => ({
        [f]: { contains: input.search, mode: 'insensitive' },
      }));
    }
  }

  const orderBy = input.order ? parseOrder(input.order, fields) : [{ updatedAt: 'desc' as const }];
  return { where, orderBy };
}
