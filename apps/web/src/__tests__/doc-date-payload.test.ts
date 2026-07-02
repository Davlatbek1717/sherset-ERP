import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Document-date payload gate (permanent regression guard).
 *
 * Bug-class (caught in the payments-out detail audit, 2026-06-03d): a document
 * `/new` page can bind an editable document-date control (`docDate` state →
 * DocumentEditor `date`/`onDateChange`) yet OMIT the date from the create
 * payload — so the operator's chosen date is silently discarded and the
 * document is dated server-now(), corrupting period/ledger reporting. Five
 * pages had this (cash-in, cash-out, inventories, payments-in, payments-out)
 * while ~16 peers forwarded it correctly.
 *
 * This gate asserts: every `(app)/ ** /new/page.tsx` that owns a `docDate`
 * state forwards it in the request body as `moment:`. A new `/new` page that
 * binds a date control but forgets to send it fails here.
 *
 * Work-orders USED to be the lone exception — it had no `moment` column, so the
 * guard accepted `plannedStartAt` (a DIFFERENT field) as the date sink. That was
 * a rationalised hole: the editable header `docDate` was still silently dropped
 * (only the optional planned-start was ever sent). The WorkOrder `moment` column
 * was added 2026-06-11 (parity with InternalOrder / Production), work-orders/new
 * now forwards `moment:`, and this gate is tightened to require `moment:`
 * everywhere — no escape hatch.
 */

const APP_DIR = join(__dirname, '..', 'app', '(app)');

function walkNewPages(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkNewPages(full));
    else if (entry.name === 'page.tsx' && full.replace(/\\/g, '/').includes('/new/')) {
      out.push(full);
    }
  }
  return out;
}

// The chosen header date must reach the backend as the document posting moment.
// (No `plannedStartAt` fallback — that allowed work-orders to "pass" while the
// real docDate was dropped; see the header comment.)
const DATE_SINK = /\bmoment:/;

const datePages = walkNewPages(APP_DIR)
  .filter((f) => /const \[docDate/.test(readFileSync(f, 'utf8')))
  .map((f) => [f.replace(/\\/g, '/').split('/(app)/')[1] ?? f, f] as const);

describe('document /new pages forward the editable document date', () => {
  it('discovers the doc-date /new pages to guard (non-vacuous)', () => {
    expect(datePages.length).toBeGreaterThanOrEqual(6);
  });

  it.each(datePages)('%s forwards docDate in the create payload', (_label, file) => {
    expect(readFileSync(file, 'utf8')).toMatch(DATE_SINK);
  });
});
