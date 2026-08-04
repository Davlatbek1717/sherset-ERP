import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_STATE_TONE,
  INVOICE_STATE_TONE,
  RETAIL_SESSION_STATE_TONE,
  documentStateTone,
} from '../lib/document-state-tone';

/**
 * Canonical document state → Badge tone — permanent drift-lock.
 *
 * Bug-class (2026-06-10 UI-uniformity audit): every document list/detail page
 * declared its OWN `const STATE_TONE = { … }` map — 54 copies + 1 `PO_STATE_TONE`.
 * A cross-entity audit showed two states had silently drifted: `posted` was
 * `success` on 40 docs but `brand` on the 4 invoice pages, and `closed` was
 * `success` on orders but `neutral` on retail/sessions. The duplication is the
 * root cause — there was no single place to keep the convention uniform.
 *
 * The fix consolidated all maps into `lib/document-state-tone.ts`
 * (`documentStateTone()`), preserving behaviour: the two genuine divergences are
 * now EXPLICIT, grounding-flagged overrides (INVOICE_STATE_TONE /
 * RETAIL_SESSION_STATE_TONE) instead of accidents buried in per-page copies.
 *
 * This guard locks three things:
 *   1. the canonical map values (so a recolour is a deliberate, reviewed edit);
 *   2. NO page may re-declare a local `*STATE_TONE` map (drift can't reappear);
 *   3. the 5 override pages keep passing their override map (so the documented
 *      divergence can't be silently dropped back to canonical).
 * (1)+(3) are the inverse of the pre-fix behaviour, so the guard is non-vacuous.
 */

const APP = join(__dirname, '..', 'app', '(app)');

function allPageFiles(): string[] {
  return readdirSync(APP, { recursive: true, encoding: 'utf8' })
    .filter((p) => p.endsWith('page.tsx'))
    .map((p) => join(APP, p));
}

describe('documentStateTone — canonical values', () => {
  // Locks the agreed cross-entity convention. Changing any of these is a
  // deliberate design decision and should update this table in the same commit.
  const EXPECTED: Record<string, string> = {
    draft: 'neutral',
    confirmed: 'brand',
    sent: 'brand',
    awaiting_payment: 'warning',
    partially_paid: 'warning',
    partially_shipped: 'warning',
    partially_received: 'warning',
    pending: 'warning',
    refunded: 'warning',
    accepted: 'info',
    in_progress: 'info',
    posted: 'success',
    paid: 'success',
    fully_shipped: 'success',
    fully_received: 'success',
    completed: 'success',
    converted: 'success',
    closed: 'success',
    open: 'success',
    rejected: 'destructive',
    overdue: 'destructive',
    cancelled: 'destructive',
  };

  for (const [state, tone] of Object.entries(EXPECTED)) {
    it(`${state} → ${tone}`, () => {
      expect(documentStateTone(state)).toBe(tone);
      expect(DOCUMENT_STATE_TONE[state]).toBe(tone);
    });
  }

  it('the canonical map has no states beyond the locked table', () => {
    expect(Object.keys(DOCUMENT_STATE_TONE).sort()).toEqual(Object.keys(EXPECTED).sort());
  });
});

describe('documentStateTone — fallback & null safety', () => {
  it('null / undefined → neutral', () => {
    expect(documentStateTone(null)).toBe('neutral');
    expect(documentStateTone(undefined)).toBe('neutral');
  });
  it('unknown state → neutral (matches old `?? "neutral"` fallback)', () => {
    expect(documentStateTone('does_not_exist')).toBe('neutral');
  });
});

describe('documentStateTone — grounding-flagged overrides preserve pre-fix behaviour', () => {
  it('invoice family: posted stays brand (intermediate), not success', () => {
    expect(INVOICE_STATE_TONE.posted).toBe('brand');
    expect(documentStateTone('posted', INVOICE_STATE_TONE)).toBe('brand');
    // canonical (stock docs) is unchanged
    expect(documentStateTone('posted')).toBe('success');
    // non-overridden invoice states still come from canonical
    expect(documentStateTone('paid', INVOICE_STATE_TONE)).toBe('success');
    expect(documentStateTone('cancelled', INVOICE_STATE_TONE)).toBe('destructive');
  });

  it('retail shift: closed stays neutral (archived), not success', () => {
    expect(RETAIL_SESSION_STATE_TONE.closed).toBe('neutral');
    expect(documentStateTone('closed', RETAIL_SESSION_STATE_TONE)).toBe('neutral');
    expect(documentStateTone('closed')).toBe('success');
    expect(documentStateTone('open', RETAIL_SESSION_STATE_TONE)).toBe('success');
  });
});

describe('drift-lock: no page re-declares a local *STATE_TONE map', () => {
  it('every document page resolves tone via the shared helper, not a local map', () => {
    const offenders: string[] = [];
    for (const file of allPageFiles()) {
      const src = readFileSync(file, 'utf8');
      // matches `const STATE_TONE:` / `const PO_STATE_TONE:` / `export const …STATE_TONE…:`
      if (/\bconst \w*STATE_TONE\w*\s*[:=]/.test(src)) {
        offenders.push(file.replace(APP, '').replace(/\\/g, '/'));
      }
    }
    expect(
      offenders,
      `These pages must use documentStateTone() instead of a local map:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});

describe('override wiring: the 5 divergent pages keep passing their override map', () => {
  const FE = (...p: string[]) => join(APP, ...p, 'page.tsx');
  // MASTER-TODO #10 (2026-07-28): the two invoice DETAIL entries were dropped.
  // Neither detail editor renders a state badge, so there is nothing to tone:
  // invoices-in/[id] passes `status="" statusOptions={[]}` behind a grounded
  // comment — «supplier invoices have no account custom statuses yet, so the
  // pill stays a grey «Статус» (FSM lifecycle is driven by «Проведено»)» — and
  // invoices-out/[id] renders ACCOUNT CUSTOM statuses (`statusOptions`), which
  // carry their own colours and are not FSM state slugs. Demanding the override
  // there would have meant adding a badge moysklad does not show.
  // The override itself is NOT orphaned — it is wired on both LIST pages, which
  // is exactly where the state badge lives; those entries stay below.
  const cases: Array<[string[], string]> = [
    [['invoices-in'], 'INVOICE_STATE_TONE'],
    [['invoices-out'], 'INVOICE_STATE_TONE'],
    [['retail', 'sessions'], 'RETAIL_SESSION_STATE_TONE'],
    [['retail', 'sessions', '[id]'], 'RETAIL_SESSION_STATE_TONE'],
    // Kunlik KPI qabul (TZ 4M.2): `accepted` bu yerda TERMINAL natija
    // (success, hujjatlardagi info emas), `stale`/`escalated` esa kanonikda
    // umuman yo'q. Override o'chirilsa uchalasi jimgina neutral bo'lib qolardi.
    [['menejer'], 'KPI_DAY_STATE_TONE'],
  ];
  for (const [segments, sym] of cases) {
    it(`${segments.join('/')} passes ${sym}`, () => {
      const src = readFileSync(FE(...segments), 'utf8');
      expect(src).toMatch(new RegExp(`documentStateTone\\([^)]*,\\s*${sym}\\)`));
      expect(src).toMatch(
        new RegExp(`import \\{[^}]*${sym}[^}]*\\} from '@/lib/document-state-tone'`),
      );
    });
  }
});
