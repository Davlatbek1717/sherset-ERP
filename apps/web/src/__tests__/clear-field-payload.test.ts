import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Clear-field payload gate (permanent regression guard).
 *
 * Bug-class (found in the Cohort A Phase-2 API+browser QA, 2026-06-10c — sibling
 * of the counterparty phone-clear fix `f9ba78e1`): a detail-page save handler
 * that sends an optional field as `field || undefined`. When the user empties
 * the field, `'' || undefined` → `undefined` → the key is OMITTED from the PATCH
 * body → the service's partial update (`if (dto.x !== undefined) data.x = …`)
 * SKIPS it → the old value silently survives. The user sees the field empty in
 * the form but on reload it is back. The fix is `|| null`: the service writes
 * null (clears the column) and skips undefined.
 *
 * Live-proven for every field below (create with a value → PATCH the field as
 * null → GET shows null; PATCH the OLD way (undefined/omit) → GET shows the old
 * value survived) and browser-verified end-to-end on a cash-out draft (cleared
 * «Asos»/«Izoh» in the real form → Saqlash → API paymentPurpose=null,
 * description=null). Each `not.toMatch(... || undefined)` matched BEFORE the fix
 * (non-vacuous).
 *
 * Scope precision (intentional exclusions — do NOT widen to a blanket ban):
 *  - counterparties `uzRequisites.{inn,okoned,account}` and organizations'
 *    `uzRequisites.{inn,okoned,mfo}` sub-keys MUST stay `|| undefined`: their
 *    Zod schema is `.optional()` (rejects null → would 400), and the whole
 *    JSON column is replaced wholesale so omitting a sub-key already clears it.
 *  - position-level fields (supplies/sales-returns gtd*, internal-orders price)
 *    are rewritten wholesale (deleteMany+createMany) → omitting already clears.
 *  Both verified NOT_A_BUG in the 2026-06-10c verification fan-out.
 */

const FE = (...p: string[]) => join(__dirname, '..', 'app', '(app)', ...p);
const API = (...p: string[]) => join(__dirname, '..', '..', '..', 'api', 'src', 'modules', ...p);

// FE detail pages: each clearable header field must be `<field> ... || null`,
// and must NOT be `<field> ... || undefined` (the regressed shape).
const FE_PAGES: Array<{ file: string; fields: string[] }> = [
  { file: FE('cash-in', '[id]', 'page.tsx'), fields: ['paymentPurpose', 'description'] },
  { file: FE('cash-out', '[id]', 'page.tsx'), fields: ['paymentPurpose', 'description'] },
  {
    file: FE('payments-in', '[id]', 'page.tsx'),
    fields: ['incomingNumber', 'paymentPurpose', 'description'],
  },
  { file: FE('payments-out', '[id]', 'page.tsx'), fields: ['paymentPurpose', 'description'] },
  {
    file: FE('settings', 'bank-accounts', '[id]', 'page.tsx'),
    fields: ['bankName', 'accountNumber', 'bic'],
  },
  { file: FE('settings', 'price-types', '[id]', 'page.tsx'), fields: ['externalCode'] },
  // uoms «Полное наименование» (description) — added 2026-06-13 when the edit
  // form finally bound the field (§2.6). Non-vacuous: before that fix the page
  // sent only {name, code}, so `description: … || null` did not exist.
  { file: FE('settings', 'uoms', '[id]', 'page.tsx'), fields: ['description', 'code'] },
  {
    file: FE('settings', 'organizations', '[id]', 'page.tsx'),
    fields: [
      'legalTitle',
      'legalAddress',
      'email',
      'phone',
      'director',
      'directorPosition',
      'chiefAccountant',
      'externalCode',
    ],
  },
  {
    file: FE('production', 'stages', '[id]', 'page.tsx'),
    fields: ['code', 'externalCode', 'description'],
  },
  { file: FE('production', 'boms', '[id]', 'page.tsx'), fields: ['description', 'externalCode'] },
  {
    file: FE('production', 'processes', '[id]', 'page.tsx'),
    fields: ['code', 'externalCode', 'description'],
  },
];

describe('clear-field payloads send null (not undefined) so emptying persists', () => {
  for (const { file, fields } of FE_PAGES) {
    const rel = file.split(/[/\\]\(app\)[/\\]/)[1] ?? file;
    describe(rel, () => {
      const src = readFileSync(file, 'utf8');
      for (const f of fields) {
        it(`${f} → "|| null", never "|| undefined"`, () => {
          // positive: the field is sent as `<field>: <expr> || null`
          expect(src).toMatch(new RegExp(`${f}:\\s*[^,\\n]*\\|\\|\\s*null`));
          // non-vacuous regression ban: this exact shape existed before the fix
          expect(src).not.toMatch(new RegExp(`${f}:\\s*[^,\\n]*\\|\\|\\s*undefined`));
        });
      }
    });
  }

  // organizations: clearing ALL requisites must send `uzRequisites: ... : null`
  // (the else-branch), not `: undefined` (which left the old object untouched).
  it('organizations uzRequisites else-branch clears with null', () => {
    const src = readFileSync(FE('settings', 'organizations', '[id]', 'page.tsx'), 'utf8');
    expect(src).toMatch(/uzRequisites:[\s\S]*?:\s*null,/);
    // the nested sub-keys intentionally STAY `|| undefined` (schema .optional())
    expect(src).toMatch(/inn:\s*inn\s*\|\|\s*undefined/);
  });
});

// BE schemas widened from `.optional()` to `.nullish()` so the API ACCEPTS the
// null the edit form now sends (otherwise null → 400). Money-doc + settings
// schemas were already `.nullish()`; only the production trio needed widening.
const API_SCHEMAS: Array<{ file: string; fields: string[] }> = [
  {
    file: API('processing-stage', 'processing-stage.schema.ts'),
    fields: ['code', 'externalCode', 'description'],
  },
  { file: API('bom', 'bom.schema.ts'), fields: ['description', 'externalCode'] },
  {
    file: API('processing-process', 'processing-process.schema.ts'),
    fields: ['code', 'externalCode', 'description'],
  },
];

describe('production schemas accept null on clearable header fields (.nullish)', () => {
  for (const { file, fields } of API_SCHEMAS) {
    const name = file.split(/[/\\]modules[/\\]/)[1] ?? file;
    describe(name, () => {
      const src = readFileSync(file, 'utf8');
      for (const f of fields) {
        it(`${f} is .nullish() (accepts the clear)`, () => {
          // Same-line match (no [\s\S] cross-line span): the header field's own
          // line must end in .nullish(). processing-process keeps its EMBEDDED
          // stage-input `code/externalCode/description` as `.optional()` (line
          // ~52) — those are rewritten wholesale; only the header (line ~101)
          // is widened, and this same-line regex is satisfied by that line.
          expect(src).toMatch(new RegExp(`${f}:\\s*z\\.string\\([^\\n]*?\\.nullish\\(\\)`));
        });
      }
    });
  }
});
