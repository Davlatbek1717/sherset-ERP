import { execSync } from 'node:child_process';
/**
 * Codemod: list date-tz CLASS sweep.
 *
 * Replaces the buggy UTC-midnight date-only range idiom in API list/findAll
 * WHERE builders with the shared `tashkentRangeBounds(from, to)` helper, which
 * returns a half-open Asia/Tashkent UTC window {gte, lt} (UZ is fixed UTC+5).
 *
 * Two source variants are transformed (both are the `then` branch of a
 * `filter.XFrom || filter.XTo ? { … } : {}` ternary — extracted-const OR
 * inline-spread, doesn't matter, the inner object is identical):
 *
 *   FIELD: {
 *     ...(filter.FROM ? { gte: new Date(filter.FROM) } : {}),
 *     ...(filter.TO ? { lte: new Date(`${filter.TO}T23:59:59.999Z`) } : {}),   // variant A
 *     ...(filter.TO ? { lte: new Date(filter.TO) } : {}),                       // variant B (plain)
 *   },
 *      ↓
 *   FIELD: tashkentRangeBounds(filter.FROM, filter.TO),
 *
 * EXCLUDED by design: `expiryDate` — it is the only filtered column that is
 * `@db.Date` (a pure calendar date, no time/tz). For a Date column the existing
 * inclusive `lte: new Date(to)` is CORRECT and a ±5h Tashkent shift would be
 * wrong. The codemod skips any match whose FIELD === 'expiryDate'.
 *
 * Faithful: only the bound MATH changes; the Prisma field each filter targets
 * and the gte/lt direction are preserved exactly.
 *
 * Run from repo root:  node scripts/codemod-list-date-tz.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const EXCLUDE_FIELDS = new Set(['expiryDate']);
const IMPORT_LINE = "import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';";
// product.repository.ts lives one level deeper (modules/product/) — same depth as
// other modules (modules/<m>/<file>.ts), so '../report/...' resolves for all.

// Match the inner object: FIELD: { <gte spread> <lte spread> },
// Variant A: lte uses `${filter.TO}T23:59:59.999Z`
// Variant B: lte uses plain new Date(filter.TO)
// The two spreads each sit on their own line(s); `lte` may wrap to the next
// line (facture-in incomingDate). We anchor on the gte spread then the lte spread.
const BLOCK = new RegExp(
  String.raw`(\w+):\s*\{\s*` +
    String.raw`\.\.\.\(filter\.(\w+)\s*\?\s*\{\s*gte:\s*new Date\(filter\.\2\)\s*\}\s*:\s*\{\}\),\s*` +
    String.raw`\.\.\.\(filter\.(\w+)\s*\?\s*\{\s*lte:\s*new Date\(` +
    '`' +
    String.raw`\$\{filter\.\3\}T23:59:59\.999Z` +
    '`' +
    String.raw`\)\s*\}\s*:\s*\{\}\),?\s*` +
    String.raw`\},`,
  'g',
);
const BLOCK_PLAIN = new RegExp(
  String.raw`(\w+):\s*\{\s*` +
    String.raw`\.\.\.\(filter\.(\w+)\s*\?\s*\{\s*gte:\s*new Date\(filter\.\2\)\s*\}\s*:\s*\{\}\),\s*` +
    String.raw`\.\.\.\(filter\.(\w+)\s*\?\s*\{\s*lte:\s*new Date\(filter\.\3\)\s*\}\s*:\s*\{\}\),?\s*` +
    String.raw`\},`,
  'g',
);

// Discover every candidate file by grepping for the buggy idioms. Two
// fixed-string (-F) greps — variant A marker `T23:59:59.999Z` and variant B
// `lte: new Date(filter.` — unioned (backtick/${} in a regex grep mangles
// under the shell, so -F is the robust choice).
const discover = (needle) => {
  try {
    return execSync(`git grep -lF ${JSON.stringify(needle)} -- "apps/api/src/modules/**/*.ts"`, {
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
};
const grep = [...new Set([...discover('T23:59:59.999Z'), ...discover('lte: new Date(filter.')])]
  // tests assert the old/new idiom textually — never rewrite a test file.
  .filter((f) => !f.includes('.test.') && !f.includes('.spec.'))
  .sort();

const report = [];
for (const file of grep) {
  let src = readFileSync(file, 'utf8');
  const before = src;
  const changes = [];

  const apply = (re) => {
    src = src.replace(re, (full, field, from, to) => {
      if (EXCLUDE_FIELDS.has(field)) return full; // leave @db.Date columns alone
      changes.push(`${field}(${from}→${to})`);
      return `${field}: tashkentRangeBounds(filter.${from}, filter.${to}),`;
    });
  };
  apply(BLOCK);
  apply(BLOCK_PLAIN);

  if (src !== before) {
    if (!src.includes(IMPORT_LINE)) {
      // Insert immediately BEFORE the first top-level import statement. This is
      // always safe — it can never land inside a multi-line `import { … }` block
      // (which is what "after the last import line" did wrong).
      const lines = src.split('\n');
      const firstImport = lines.findIndex((l) => /^import\s/.test(l));
      lines.splice(firstImport, 0, IMPORT_LINE);
      src = lines.join('\n');
    }
    writeFileSync(file, src);
    report.push({ file, changes });
  } else {
    report.push({ file, changes: ['NO-MATCH (review manually)'] });
  }
}

let totalSites = 0;
for (const r of report) {
  const n = r.changes.filter((c) => !c.startsWith('NO-MATCH')).length;
  totalSites += n;
  console.log(`${n === 0 ? '⚠️ ' : '✓ '}${r.file}`);
  for (const c of r.changes) console.log(`    ${c}`);
}
console.log(`\n${report.length} files scanned, ${totalSites} sites transformed.`);
