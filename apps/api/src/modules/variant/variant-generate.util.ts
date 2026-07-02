import type { Characteristic } from './variant.schema.js';

/**
 * Pure logic behind «Создание модификаций» (variant generation). Kept free of
 * NestJS/Prisma so it can be unit-tested directly. The service wraps
 * GenerateValidationError as a 400 and persists the resulting combos.
 */

/** Raised for user-fixable input problems (duplicate characteristic, no values). */
export class GenerateValidationError extends Error {}

export interface CharacteristicAxis {
  name: string;
  values: string[];
}

/**
 * Normalize the requested characteristics: trim names + values, drop empty
 * values, dedup values within each axis, and reject a characteristic name used
 * twice (moysklad lists each characteristic once per modification). Throws
 * GenerateValidationError on a user-fixable problem.
 */
export function normalizeAxes(input: CharacteristicAxis[]): CharacteristicAxis[] {
  const seen = new Set<string>();
  return input.map((axis) => {
    const name = axis.name.trim();
    if (!name) throw new GenerateValidationError('Xarakteristika nomi majburiy');
    const key = name.toLowerCase();
    if (seen.has(key)) throw new GenerateValidationError(`Xarakteristika takrorlangan: ${name}`);
    seen.add(key);
    const values = [...new Set(axis.values.map((v) => v.trim()).filter((v) => v.length > 0))];
    if (values.length === 0) throw new GenerateValidationError(`«${name}» uchun qiymat kerak`);
    return { name, values };
  });
}

/**
 * Cartesian product of characteristic values:
 * [{name:'Цвет',values:['красный','синий']},{name:'Размер',values:['S']}]
 *   → [[{Цвет,красный},{Размер,S}],[{Цвет,синий},{Размер,S}]]
 */
export function cartesian(axes: CharacteristicAxis[]): Characteristic[][] {
  let acc: Characteristic[][] = [[]];
  for (const axis of axes) {
    const next: Characteristic[][] = [];
    for (const combo of acc) {
      for (const value of axis.values) {
        next.push([...combo, { name: axis.name, value }]);
      }
    }
    acc = next;
  }
  return acc;
}

/**
 * Order-independent signature of a characteristic set, used to skip combos that
 * already exist for the product. The JSON of the [name, value] pairs, sorted —
 * so order doesn't matter and odd characters can't forge a clash.
 */
export function charSignature(chars: Characteristic[]): string {
  return JSON.stringify([...chars].map((c) => [c.name, c.value]).sort());
}
