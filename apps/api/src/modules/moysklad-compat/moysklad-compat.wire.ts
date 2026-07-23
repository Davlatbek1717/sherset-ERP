import { HttpException } from '@nestjs/common';

/**
 * Pure wire-shape helpers for the moysklad-compat router (Biznesjon A–D):
 * money normalisation to UZS, attributes object→array conversion, expand
 * parsing. No DB/DI so every rule is unit-testable.
 */

/** rateValue is a fixed-point currency rate with 8 decimals (1e8 = 1.0). */
const RATE_SCALE = 100_000_000n;

/**
 * Document-currency minor units → UZS minor units (tiyin), rounded half
 * away from zero. Both currencies use 1/100 minor units, so
 * cents × (som-per-dollar) = tiyin: 82300 × 12200.0 = 1_004_060_000.
 * BigInt end-to-end — money must not float.
 */
export function toUzsMinor(minor: bigint, rateValue: bigint): number {
  const product = minor * rateValue;
  const quotient = product / RATE_SCALE;
  const remainder = product % RATE_SCALE;
  const roundUp = (remainder < 0n ? -remainder : remainder) * 2n >= RATE_SCALE;
  const sign = product < 0n ? -1n : 1n;
  return Number(roundUp ? quotient + sign : quotient);
}

function preconditionFailed(message: string): HttpException {
  return new HttpException({ errors: [{ error: message }] }, 412);
}

export interface ParsedExpand {
  /** FK relation names to inline (e.g. 'agent', 'organization', 'store'). */
  fields: string[];
  positions: boolean;
  /** expand=positions.assortment — inline product name into each position. */
  positionsAssortment: boolean;
}

/**
 * Validates moysklad `expand=` tokens against what this slug can expand:
 * its FK relations (fkFields minus the Id suffix) and, for document slugs,
 * `positions` / `positions.assortment`. Unknown tokens → 412, mirroring the
 * no-silent-ignore contract the filter parser established.
 */
export function parseExpand(
  expand: string[] | undefined,
  fkFields: string[],
  hasPositions: boolean,
): ParsedExpand {
  const result: ParsedExpand = { fields: [], positions: false, positionsAssortment: false };
  if (!expand?.length) return result;
  const expandable = new Set(fkFields.map((f) => f.replace(/Id$/, '')));
  for (const rawToken of expand) {
    const token = rawToken.trim();
    if (!token) continue;
    if (token === 'positions' || token === 'positions.assortment') {
      if (!hasPositions) {
        throw preconditionFailed(`Expand 'positions' is not available for this entity`);
      }
      result.positions = true;
      if (token === 'positions.assortment') result.positionsAssortment = true;
      continue;
    }
    if (expandable.has(token)) {
      result.fields.push(token);
      continue;
    }
    throw preconditionFailed(
      `Unknown expand '${token}'. Available: ${[...expandable].join(', ')}${
        hasPositions ? ', positions, positions.assortment' : ''
      }`,
    );
  }
  return result;
}

/** AttributeMetadata row subset the converter needs. */
export interface AttrDef {
  id: string;
  code: string;
  name: string;
  type: string;
  referenceEntity: string | null;
}

/** PascalCase referenceEntity → compat slug (for value meta hrefs). */
export const REFERENCE_ENTITY_SLUGS: Record<string, string> = {
  Counterparty: 'counterparty',
  Product: 'product',
  Employee: 'employee',
  Organization: 'organization',
  Store: 'store',
};

export interface AttributeWireItem {
  meta: { href: string; type: 'attributemetadata'; mediaType: 'application/json' };
  id: string;
  name: string;
  type: string;
  value: unknown;
}

/**
 * Our storage is `{code: value}`; moysklad's wire is an ARRAY of
 * `{meta, id, name, type, value}` (Biznesjon item D — their Уста/tgid flow
 * reads it by name). Reference values become `{meta, name}` objects when the
 * referenced row's name was resolved (refNames key = `${entity}:${id}`).
 */
export function buildAttributesArray(
  attrObj: Record<string, unknown>,
  defs: AttrDef[],
  slug: string,
  remapBase: string,
  refNames: Map<string, string>,
): AttributeWireItem[] {
  const out: AttributeWireItem[] = [];
  for (const def of defs) {
    const value = attrObj[def.code];
    if (value === undefined || value === null || value === '') continue;
    let wireValue: unknown = value;
    if (def.type === 'reference' && typeof value === 'string' && def.referenceEntity) {
      const refSlug = REFERENCE_ENTITY_SLUGS[def.referenceEntity];
      wireValue = {
        ...(refSlug
          ? {
              meta: {
                href: `${remapBase}/entity/${refSlug}/${value}`,
                type: refSlug,
                mediaType: 'application/json',
              },
            }
          : {}),
        name: refNames.get(`${def.referenceEntity}:${value}`) ?? value,
      };
    }
    out.push({
      meta: {
        href: `${remapBase}/entity/${slug}/metadata/attributes/${def.id}`,
        type: 'attributemetadata',
        mediaType: 'application/json',
      },
      id: def.id,
      name: def.name,
      type: def.type,
      value: wireValue,
    });
  }
  return out;
}
