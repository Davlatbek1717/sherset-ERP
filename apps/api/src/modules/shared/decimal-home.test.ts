import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addDecimals,
  compareDecimals,
  computeLineCost,
  computePerUnitCost,
  formatDecimalScaled,
  minDecimal,
  parseDecimalScaled,
  roundHalfUp,
  subtractDecimals,
} from './decimal.js';

/**
 * Faza Q17 — the decimal primitives have ONE home (`shared/decimal.ts`).
 *
 * History (Faza 34 DEFER-5): the primitives lived in `demand/fifo-consumer.ts`
 * — a file whose name has been a lie since Faza 18a retired the FIFO lot walk.
 * Sixteen modules imported cost arithmetic from a *sales document's* folder,
 * which made the leaf layer invisible in the module map and invited a second
 * copy (Faza 34 already had to delete one such copy from `stock.service.ts`).
 *
 * This file locks the new home and, just as importantly, locks the *shape* of
 * the transition: the old path may only survive as a thin re-export for the
 * files this session was not allowed to touch (a parallel session owned
 * `modules/store/`). Anything else importing the old path is a regression.
 */

const MODULES_DIR = join(__dirname, '..');

/**
 * Files still allowed to import the deprecated `demand/fifo-consumer.js` path.
 * Owned by a parallel session at the time of Faza Q17 (CLAUDE.md §6.1 forbids
 * writing to another session's files), so their import was left alone.
 * Shrinking this list is the whole point — it must never grow.
 */
const LEGACY_IMPORTERS = ['store/cell-migration.ts', 'store/cell-migration.runner.ts'];

function walkTs(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkTs(full, out);
    } else if (entry.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('shared/decimal — the primitives home (Faza Q17)', () => {
  it('exports every primitive the cost layer needs', () => {
    expect(parseDecimalScaled('3.5')).toBe(3_500_000n);
    expect(formatDecimalScaled(3_500_000n)).toBe('3.5');
    expect(roundHalfUp(5n, 2n)).toBe(3n);
    expect(computeLineCost('3.5', 12_000n)).toBe(42_000n);
    expect(subtractDecimals('5', '1.5')).toBe('3.5');
    expect(addDecimals('0.1', '0.2')).toBe('0.3');
    expect(compareDecimals('1', '2')).toBe(-1);
    expect(minDecimal('1', '2')).toBe('1');
    expect(computePerUnitCost(1000n, '3')).toBe(333n);
  });

  it('the arithmetic is exact where float is not', () => {
    // Evidence first (the drift this layer exists to prevent).
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(String(0.3 - 0.1)).not.toBe('0.2');
    // The primitives are exact.
    expect(addDecimals('0.1', '0.2')).toBe('0.3');
    expect(subtractDecimals('0.3', '0.1')).toBe('0.2');
  });

  it('no module imports the deprecated demand/fifo-consumer path (except the legacy allowlist)', () => {
    const offenders: string[] = [];
    for (const file of walkTs(MODULES_DIR)) {
      const rel = file.slice(MODULES_DIR.length + 1).replace(/\\/g, '/');
      if (LEGACY_IMPORTERS.includes(rel)) continue;
      const src = readFileSync(file, 'utf8');
      if (/from '[^']*fifo-consumer\.js'/.test(src)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it('the legacy allowlist is exactly the parallel-session files (it must never grow)', () => {
    const importers: string[] = [];
    for (const file of walkTs(MODULES_DIR)) {
      const rel = file.slice(MODULES_DIR.length + 1).replace(/\\/g, '/');
      const src = readFileSync(file, 'utf8');
      if (/from '[^']*fifo-consumer\.js'/.test(src)) importers.push(rel);
    }
    expect(importers.sort()).toEqual([...LEGACY_IMPORTERS].sort());
  });

  it('demand/fifo-consumer.ts survives only as a re-export shim (no arithmetic of its own)', () => {
    const shim = readFileSync(join(MODULES_DIR, 'demand', 'fifo-consumer.ts'), 'utf8');
    expect(shim).toMatch(/^export \{[^}]*\} from '\.\.\/shared\/decimal\.js';$/m);
    // No implementation may be left behind — a second copy is exactly the
    // bug-class Faza 34 deleted from stock.service.ts.
    expect(shim).not.toMatch(/const SCALE = /);
    expect(shim).not.toMatch(/\bfunction\b/);
  });

  it('the cross-module leaf imports are gone: cost-basis modules live in shared/', () => {
    const demandBasis = readFileSync(join(MODULES_DIR, 'shared', 'demand-cost-basis.ts'), 'utf8');
    // Previously `demand/demand-cost-basis.ts` reached into `../move/…`.
    expect(demandBasis).not.toMatch(/from '\.\.\/move\//);
    expect(demandBasis).toMatch(/from '\.\/move-cost-basis\.js'/);
  });
});
