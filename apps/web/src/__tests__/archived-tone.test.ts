import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { archivedTone } from '../lib/archived-tone';

/**
 * Canonical archived/active record → Badge tone — permanent drift-lock (UI Convention 7).
 *
 * Bug-class (2026-06-10 UI-uniformity audit): ~39 list / detail / component
 * surfaces hardcoded the same `archived → tone` mapping in three shapes —
 * a `stateTone` ternary (`archived ? 'neutral' : 'success'`), a conditional
 * badge PAIR (`{archived ? <Badge tone="neutral"> : <Badge tone="success">}`),
 * and an archived-only badge (`{archived && <Badge tone="neutral">}`). The
 * convention was uniform (archived → `neutral`, live → `success`) EXCEPT one
 * silent drift: `settings/label-templates` coloured an archived row
 * `destructive` (red). The duplication is the root cause.
 *
 * The fix consolidated every surface onto `lib/archived-tone.ts`
 * (`archivedTone()`) and fixed the drift to `neutral`. This guard locks:
 *   1. the canonical values (`true → neutral`, `false → success`);
 *   2. NO page/component re-introduces a hardcoded archived→tone binary pair
 *      (drift — incl. the label-templates `destructive` — can't reappear);
 *   3. representative migrated surfaces keep importing + using the helper.
 * (2) is the inverse of the pre-fix state (the banned patterns existed on 40
 * files before the fix), so the guard is non-vacuous — proven below with a
 * synthetic offender the detector must flag.
 *
 * EXEMPT (deliberately NOT flagged): the "archived-precedence" composites where
 * the NON-archived branch is a dynamic domain status — opportunities
 * `archived ? 'neutral' : statusTone(status)`, pipelines `… : isDefault ? …`,
 * tasks `… : <Badge tone={statusTone(...)}>`. Their non-archived tone is not a
 * literal `'success'`/`<Badge tone="success">`, so the bans below don't match
 * them; the archived branch still resolves to `neutral` (the convention).
 */

describe('archivedTone — canonical values', () => {
  it('archived → neutral', () => {
    expect(archivedTone(true)).toBe('neutral');
  });
  it('active (not archived) → success', () => {
    expect(archivedTone(false)).toBe('success');
  });
});

const SRC = join(__dirname, '..');
const APP = join(SRC, 'app', '(app)');
const COMPONENTS = join(SRC, 'components');

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((p) => p.endsWith('.tsx'))
    .map((p) => join(dir, p));
}

/** The two banned shapes — a binary archived→tone mapping NOT via the helper. */
const BAN_LITERAL_PAIR =
  /\.archived\s*\?\s*'(?:neutral|success|destructive)'\s*:\s*'(?:neutral|success|destructive)'/;
const BAN_BADGE_PAIR =
  /\.archived\s*\?\s*\(?\s*<Badge tone="neutral">[\s\S]*?<\/Badge>\s*\)?\s*:\s*\(?\s*<Badge tone="success">/;

function offends(src: string): boolean {
  return BAN_LITERAL_PAIR.test(src) || BAN_BADGE_PAIR.test(src);
}

describe('drift-lock: no surface hardcodes an archived→tone pair', () => {
  it('detector is non-vacuous (flags a synthetic offender)', () => {
    expect(offends("stateTone={data.archived ? 'neutral' : 'success'}")).toBe(true);
    expect(offends("tone={r.archived ? 'destructive' : 'success'}")).toBe(true);
    expect(
      offends(
        'row.archived ? (<Badge tone="neutral">{t("a")}</Badge>) : (<Badge tone="success">{t("b")}</Badge>)',
      ),
    ).toBe(true);
    // the helper form and the exempt precedence composites are NOT flagged
    expect(offends('tone={archivedTone(row.archived)}')).toBe(false);
    expect(offends("stateTone={data.archived ? 'neutral' : statusTone(data.status)}")).toBe(false);
  });

  it('every app page + component resolves archived→tone via archivedTone()', () => {
    const offenders: string[] = [];
    for (const file of [...tsxFiles(APP), ...tsxFiles(COMPONENTS)]) {
      if (offends(readFileSync(file, 'utf8'))) {
        offenders.push(file.replace(SRC, '').replace(/\\/g, '/'));
      }
    }
    expect(
      offenders,
      `These surfaces must use archivedTone() instead of a hardcoded pair:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});

describe('adoption: representative migrated surfaces use the helper', () => {
  const FILES = [
    join(APP, 'counterparties', '[id]', 'page.tsx'),
    join(APP, 'settings', 'cash-desks', 'page.tsx'),
    join(APP, 'settings', 'cash-desks', '[id]', 'page.tsx'),
    join(APP, 'production', 'boms', 'page.tsx'),
    join(APP, 'settings', 'label-templates', 'page.tsx'),
    join(APP, 'settings', 'currencies', 'page.tsx'),
    join(COMPONENTS, 'calls-section.tsx'),
    join(COMPONENTS, 'contact-persons-section.tsx'),
  ];
  for (const file of FILES) {
    const label = file.replace(SRC, '').replace(/\\/g, '/');
    it(`${label} imports + uses archivedTone`, () => {
      const src = readFileSync(file, 'utf8');
      expect(src).toMatch(/import \{ archivedTone \} from '@\/lib\/archived-tone'/);
      expect(src).toMatch(/archivedTone\(/);
    });
  }
});
