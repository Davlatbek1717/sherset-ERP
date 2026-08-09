import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * SHARED API CONTRACTS — drift-back guard for audit finding `FE-12`.
 *
 * Pages used to hand-declare the shape of every response they fetch. Two of
 * them declared `/cashier-sessions/current` differently (`cashDesk` required in
 * `/retail`, nullable in `/sotuv`) and nothing could say which was right. Those
 * declarations now live in `@moysklad/contracts`, where each key is tied to the
 * apps/api code that produces it (see `contract-conformance.test.ts` there).
 *
 * Deleting an interface does not keep it deleted, though: the next page that
 * needs the same payload will happily re-type it by hand, and we are back to
 * two sources of truth. This test is what stops that.
 */

// `__dirname`, not `import.meta.url`: these tests run under happy-dom, where
// `import.meta.url` is an http URL and `fileURLToPath` rejects it. Same
// convention as `dead-route-links.test.ts`.
const WEB_SRC = path.join(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(WEB_SRC, rel), 'utf8');

/** Every shipped `.ts`/`.tsx` under `src/`, as `/`-separated paths relative to it. */
function collectSources(dir: string, prefix = '', out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      collectSources(path.join(dir, entry.name), rel, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

/** Pages that have adopted the shared contracts and must not regress. */
const ADOPTERS = ['app/(app)/retail/page.tsx'];

/**
 * Payload type names that belong to `@moysklad/contracts` and must not be
 * re-declared locally anywhere in web. Only names that unambiguously describe
 * ONE endpoint's payload go here — `ProductRow`, for instance, is deliberately
 * absent because different list pages legitimately project different subsets.
 */
const OWNED_BY_CONTRACTS = ['CurrentSession'];

/**
 * Files still carrying a local declaration, with the reason. Each entry is
 * tracked debt, and the test below fails if an entry becomes stale — so
 * migrating a file forces its exemption to be removed rather than left to rot.
 */
const PENDING_MIGRATION: Array<{ file: string; name: string; why: string }> = [
  {
    file: 'app/(app)/sotuv/page.tsx',
    name: 'CurrentSession',
    why: 'Faza 33: a parallel session was mid-edit in this file (Faza 32 POS i18n); migrating it here would have dragged their unfinished work into this commit. One import + one deleted block when that lands.',
  },
];

describe('shared API contracts', () => {
  for (const rel of ADOPTERS) {
    describe(rel, () => {
      it('imports its payload types from @moysklad/contracts', () => {
        expect(read(rel)).toMatch(/import type \{[\s\S]*?\} from '@moysklad\/contracts'/);
      });

      it('declares no local copy of a contract-owned payload type', () => {
        const src = read(rel);
        for (const name of OWNED_BY_CONTRACTS) {
          expect(src).not.toMatch(new RegExp(`interface\\s+${name}\\b`));
        }
      });

      it('declares no local ListResponse envelope', () => {
        expect(read(rel)).not.toMatch(/interface\s+ListResponse\b/);
      });
    });
  }

  it('no unlisted file re-declares a contract-owned payload type', () => {
    const files = collectSources(WEB_SRC);
    expect(files.length).toBeGreaterThan(100); // the walk actually found the tree

    const exempt = new Set(PENDING_MIGRATION.map((p) => `${p.file}::${p.name}`));
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(path.join(WEB_SRC, file), 'utf8');
      for (const name of OWNED_BY_CONTRACTS) {
        if (!new RegExp(`interface\\s+${name}\\b`).test(src)) continue;
        const key = `${file.replaceAll('\\', '/')}::${name}`;
        if (!exempt.has(key)) offenders.push(key);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every pending-migration exemption is still real (stale entries fail)', () => {
    for (const pending of PENDING_MIGRATION) {
      const src = read(pending.file);
      expect(
        new RegExp(`interface\\s+${pending.name}\\b`).test(src),
        `${pending.file} no longer declares ${pending.name} — delete its PENDING_MIGRATION entry`,
      ).toBe(true);
      expect(pending.why.length).toBeGreaterThan(20);
    }
  });
});
