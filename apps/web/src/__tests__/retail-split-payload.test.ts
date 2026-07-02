import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Retail-split payload gate (permanent regression guard).
 *
 * Bug-class (caught in the prepayments / prepayment-returns detail audit,
 * 2026-06-03g): the detail page cleared a retail-split component
 * (cashSumMinor / noCashSumMinor / qrSumMinor) by sending JSON `null`. But the
 * columns are non-nullable BigInt @default(0) and the Update*Schema declares
 * them `bigintMinor.optional()` (string | undefined) on a `.strict()` object —
 * `null` is REJECTED, so EVERY wholesale (no-split) save 400'd and silently
 * failed (the existing update tests only sent `{ description }`, so they stayed
 * green). The fix sends '0' (a valid bigintMinor string) instead of null.
 *
 * This gate asserts both money-doc detail pages that carry a retail split send
 * each split field as `form.<field> || '0'` and never as a bare `... : null`.
 */

const APP = join(__dirname, '..', 'app', '(app)');
const SPLIT_PAGES = [
  join(APP, 'prepayments', '[id]', 'page.tsx'),
  join(APP, 'prepayment-returns', '[id]', 'page.tsx'),
] as const;
const SPLIT_FIELDS = ['cashSumMinor', 'noCashSumMinor', 'qrSumMinor'] as const;

describe('retail-split detail save sends "0", never null', () => {
  it.each(SPLIT_PAGES)('%s sends each split field as `|| "0"`', (file) => {
    const src = readFileSync(file, 'utf8');
    for (const field of SPLIT_FIELDS) {
      // Post-fix form: `<field>: form.<field> || '0'`
      expect(src).toMatch(new RegExp(`${field}: form\\.${field} \\|\\| '0'`));
      // The buggy `<field>: form.<field> !== '0' ? ... : null` form must be gone.
      expect(src).not.toMatch(new RegExp(`${field}: form\\.${field} !== '0' \\? .*: null`));
    }
  });
});
