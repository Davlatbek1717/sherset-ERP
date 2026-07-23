/**
 * Permission entity-list SYNC lock (2026-07-04).
 *
 * Bug-class this kills: PermissionEntity gains a new entity but one of the
 * runtime lists (seed / top-up script / dead-code seeder) silently drifts —
 * every DB seeded with the stale list then 403s that module for EVERY user.
 * Hit twice for real: «Валюта» pickers (currency missing, 2026-07-03) and
 * «label.create … sizda: NO» from a stale-seeded install (2026-07-04).
 *
 * Source-scan on purpose (no imports): seed.ts lives in another package and
 * the union type has no runtime value; text is the shared source of truth.
 *
 * NB: permissions.controller.ts's short ENTITIES list is a deliberate UI
 * subset — NOT required to match and NOT checked here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// __dirname = apps/api/src/modules/permissions → three levels up = apps/api.
const API_ROOT = join(__dirname, '..', '..', '..');
const REPO_ROOT = join(API_ROOT, '..', '..');

function extract(src: string, blockRe: RegExp, label: string): string[] {
  const block = src.match(blockRe)?.[1];
  if (!block) throw new Error(`could not locate the ${label} entity list`);
  return [...block.matchAll(/'([a-z]+)'/g)].map((m) => m[1] as string);
}

const union = extract(
  readFileSync(join(API_ROOT, 'src/modules/permissions/permissions.types.ts'), 'utf8'),
  /export type PermissionEntity =([\s\S]*?);/,
  'PermissionEntity union',
);

const lists: Array<[string, string[]]> = [
  [
    'packages/db/prisma/seed.ts (the ONLY live seeder)',
    extract(
      readFileSync(join(REPO_ROOT, 'packages/db/prisma/seed.ts'), 'utf8'),
      /const entities = \[([\s\S]*?)\];/,
      'seed.ts',
    ),
  ],
  [
    'apps/api/src/scripts/topup-role-permissions.ts (heals old DBs)',
    extract(
      readFileSync(join(API_ROOT, 'src/scripts/topup-role-permissions.ts'), 'utf8'),
      /const NEW_ENTITIES = \[([\s\S]*?)\];/,
      'top-up script',
    ),
  ],
  [
    'permissions.service.ts seedSystemRoles',
    extract(
      readFileSync(join(API_ROOT, 'src/modules/permissions/permissions.service.ts'), 'utf8'),
      /const entities: PermissionEntity\[\] = \[([\s\S]*?)\];/,
      'permissions.service.ts',
    ),
  ],
];

describe('permission entity lists stay in sync with PermissionEntity', () => {
  it('the union itself is non-trivial', () => {
    expect(union.length).toBeGreaterThan(70);
    expect(union).toContain('label');
    expect(union).toContain('currency');
  });

  for (const [name, list] of lists) {
    it(`${name} covers EVERY PermissionEntity`, () => {
      const missing = union.filter((e) => !list.includes(e));
      expect(missing, `missing from ${name}`).toEqual([]);
    });

    it(`${name} has no unknown entities`, () => {
      const unknown = list.filter((e) => !union.includes(e));
      expect(unknown, `unknown in ${name}`).toEqual([]);
    });
  }
});
