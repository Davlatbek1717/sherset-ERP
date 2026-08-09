/**
 * @deprecated Faza Q17 — moved to `../shared/decimal.js`.
 *
 * These primitives were never demand-specific: Faza 18a (QAROR-A) retired the
 * FIFO lot walk this file was named after, and by Faza 34 sixteen modules were
 * importing generic decimal arithmetic out of a sales document's folder. The
 * implementation now lives in `modules/shared/decimal.ts` — ONE home, no copy.
 *
 * This shim exists for exactly one reason: at the time of the move a parallel
 * session owned `modules/store/` (CLAUDE.md §6.1 — writing to another
 * session's files is forbidden), so `store/cell-migration.ts` and
 * `store/cell-migration.runner.ts` still import this path. `shared/
 * decimal-home.test.ts` pins that allowlist so it can only shrink.
 *
 * DELETE THIS FILE once those two imports are repointed.
 */
export {
  addDecimals,
  compareDecimals,
  computeLineCost,
  computePerUnitCost,
  formatDecimalScaled,
  minDecimal,
  parseDecimalScaled,
  roundHalfUp,
  subtractDecimals,
} from '../shared/decimal.js';
