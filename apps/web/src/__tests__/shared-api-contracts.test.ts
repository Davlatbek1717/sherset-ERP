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
const ADOPTERS = [
  'app/(app)/retail/page.tsx',
  'app/(app)/sotuv/page.tsx',
  // Faza Q15 — the document/catalogue list rows.
  'app/(app)/demands/page.tsx',
  'app/(app)/customer-orders/page.tsx',
  'app/(app)/supplies/page.tsx',
  'app/(app)/invoices-out/page.tsx',
  'app/(app)/counterparties/page.tsx',
];

/**
 * Payload type names that belong to `@moysklad/contracts` and must not be
 * re-declared locally anywhere in web. Only names that unambiguously describe
 * ONE endpoint's payload go here — `ProductRow`, for instance, is deliberately
 * absent because different list pages legitimately project different subsets,
 * and `Counterparty`/`InvoiceRow` because half the app uses those names for
 * unrelated picker/detail shapes (`InvoiceRow` is also `/invoices-in`).
 */
const OWNED_BY_CONTRACTS = ['CurrentSession', 'DemandRow', 'CustomerOrderRow', 'SupplyRow'];

/**
 * Endpoints whose list response is genuinely NOT `{ items, total?, nextCursor? }`
 * and therefore keep a local envelope declaration. Each one was read before
 * being listed — this is a description of the API, not a to-do list.
 *
 * The Faza Q15 codemod migrated the other 84 files; these six are what is left,
 * and the scan below fails if a seventh appears.
 */
const NON_ENVELOPE_LISTS: Array<{ file: string; why: string }> = [
  {
    file: 'app/(app)/analitika/kontragentlar/page.tsx',
    why: 'Returns `{ partners, groups, pagination }` — a different top-level shape entirely (no `items`).',
  },
  {
    file: 'app/(app)/commission-reports/page.tsx',
    why: 'Page-number pagination (`page`/`pageSize`) plus a five-figure `totals` block.',
  },
  {
    file: 'app/(app)/counterparties/page.tsx',
    why: 'Carries `balanceTotalMinor` — the all-pages «Итого Баланс» computed over the whole filtered set, not the page.',
  },
  {
    file: 'app/(app)/money/page.tsx',
    why: 'Carries a per-currency `totals` block, and its `nextCursor` is `string | null` (explicit null) rather than an omitted key.',
  },
  {
    file: 'app/(app)/payments/page.tsx',
    why: 'Page-number pagination plus an income/expense `totals` block.',
  },
  {
    file: 'app/(app)/settings/employees/page.tsx',
    why: 'Names its array `rows`, not `items`, and paginates with `page`/`limit`.',
  },
];

/**
 * Files still carrying a local declaration, with the reason. Each entry is
 * tracked debt, and the test below fails if an entry becomes stale — so
 * migrating a file forces its exemption to be removed rather than left to rot.
 *
 * Empty is the goal state, and it is where `CurrentSession` landed: `/sotuv`
 * sat here briefly while a parallel session held the file mid-edit (Faza 32),
 * then migrated as soon as that work committed. The mechanism stays for the
 * next contract that needs a staged rollout.
 */
const PENDING_MIGRATION: Array<{ file: string; name: string; why: string }> = [];

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
    });
  }

  it('no page re-declares the shared list envelope', () => {
    const allowed = new Set(NON_ENVELOPE_LISTS.map((e) => e.file));
    const offenders = collectSources(WEB_SRC).filter((file) => {
      const rel = file.replaceAll('\\', '/');
      if (allowed.has(rel)) return false;
      return /interface\s+ListResponse\b/.test(readFileSync(path.join(WEB_SRC, file), 'utf8'));
    });
    expect(offenders).toEqual([]);
  });

  it('every non-envelope exemption is still real (stale entries fail)', () => {
    for (const entry of NON_ENVELOPE_LISTS) {
      expect(
        /interface\s+ListResponse\b/.test(read(entry.file)),
        `${entry.file} no longer declares ListResponse — delete its NON_ENVELOPE_LISTS entry`,
      ).toBe(true);
      expect(entry.why.length).toBeGreaterThan(20);
    }
  });

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
