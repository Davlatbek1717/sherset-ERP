import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * «Код» + «Внешний код» auto-assignment lock (2026-06-21).
 *
 * moysklad auto-assigns both `code` and `externalCode` on counterparty create (a
 * per-account sequence); ours left them empty until the user typed something. create()
 * now allocates them race-safely via the shared atomic `allocateDocumentNumber` counter,
 * but ONLY when the form didn't supply a value (a manual code/externalCode still wins).
 *
 * API-verified once (POST without code → code/externalCode = "5507"/"5507"; second POST →
 * "5508"; POST with code:"MANUAL-1" → code kept, externalCode auto). This source-guard keeps
 * the wiring from silently regressing back to `code: parsed.code` (which would re-empty the
 * field). Behaviour beyond this is covered by the API cert, not a brittle DB-mock unit test.
 */
const SERVICE = readFileSync(join(__dirname, 'counterparty.service.ts'), 'utf8');

describe('counterparty create — «Код» + «Внешний код» auto-assignment', () => {
  it('imports the shared race-safe sequence allocator', () => {
    expect(SERVICE).toMatch(
      /import\s+\{\s*allocateDocumentNumber\s*\}\s+from\s+'\.\.\/\.\.\/prisma\/document-number\.js'/,
    );
  });

  it('allocates a counterparty sequence and falls back to it for code + externalCode', () => {
    // The atomic counter is keyed per account on the literal 'counterparty'.
    expect(SERVICE).toMatch(
      /allocateDocumentNumber\(\s*this\.prisma\.client,\s*accountId,\s*'counterparty'/,
    );
    // A supplied value still wins (|| fallback, not an unconditional overwrite).
    expect(SERVICE).toMatch(/code = code \|\| String\(n\)/);
    expect(SERVICE).toMatch(/externalCode = externalCode \|\| String\(n\)/);
  });

  it('the create payload uses the resolved code/externalCode, not the raw parsed values', () => {
    // Regression: `code: parsed.code` / `externalCode: parsed.externalCode` would re-empty them.
    const createBlock = SERVICE.slice(
      SERVICE.indexOf('counterparty.create({'),
      SERVICE.indexOf('logAudit'),
    );
    expect(createBlock).toMatch(/\n\s*code,\n/);
    expect(createBlock).toMatch(/\n\s*externalCode,\n/);
    expect(createBlock).not.toMatch(/code: parsed\.code/);
    expect(createBlock).not.toMatch(/externalCode: parsed\.externalCode/);
  });
});
