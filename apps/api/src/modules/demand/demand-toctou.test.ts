import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Class-lock for the demand transition TOCTOU guard (2026-06-13).
 *
 * post()/unpost()/cancel() read the demand state OUTSIDE their $transaction and
 * then did a blind `tx.demand.update(...)` to flip it, so two concurrent
 * transitions could both run their full stock mutation (double FIFO
 * consumption / double refund). delete() did read-check-then-write on state in
 * two statements. The fix makes the state flip an ATOMIC CLAIM — a conditional
 * `updateMany WHERE state=<expected>` that takes the demand row's write lock —
 * so exactly one transition wins and the loser gets count 0 (→ ConflictException)
 * or a serializable P2034 (→ 409 via PrismaExceptionFilter). Never a second
 * stock mutation.
 *
 * Non-vacuous: before the fix neither `updateMany` claim nor the `count === 0`
 * guards existed in these methods, and the filter had no P2034 branch.
 */

const SERVICE = readFileSync(join(__dirname, 'demand.service.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

const FILTER = readFileSync(join(__dirname, '..', 'shared', 'prisma-exception.filter.ts'), 'utf8');

describe('demand transitions atomically claim their state (TOCTOU guard)', () => {
  it('post() claims draft→posted via a conditional updateMany', () => {
    expect(SERVICE).toMatch(
      /tx\.demand\.updateMany\(\{\s*where:\s*\{\s*id,\s*accountId,\s*state:\s*'draft'\s*\},\s*data:\s*\{\s*state:\s*'posted'\s*\}/,
    );
  });

  it('unpost() and cancel() claim posted→(draft|cancelled)', () => {
    expect(SERVICE).toMatch(
      /where:\s*\{\s*id,\s*accountId,\s*state:\s*'posted'\s*\},\s*data:\s*\{\s*state:\s*'draft'\s*\}/,
    );
    expect(SERVICE).toMatch(
      /where:\s*\{\s*id,\s*accountId,\s*state:\s*'posted'\s*\},\s*data:\s*\{\s*state:\s*'cancelled'\s*\}/,
    );
  });

  it('each transition rejects the losing claim (count === 0 → ConflictException)', () => {
    const claimGuards = SERVICE.match(/claim\.count === 0/g) ?? [];
    expect(claimGuards.length).toBe(3); // post + unpost + cancel
    expect(SERVICE).toMatch(/throw new ConflictException\(/);
  });

  it('delete() folds the draft-state check into one conditional updateMany', () => {
    expect(SERVICE).toMatch(
      /demand\.updateMany\(\{\s*where:\s*\{\s*id,\s*accountId,\s*state:\s*'draft',\s*applicable:\s*false,\s*deletedAt:\s*null\s*\}/,
    );
    expect(SERVICE).toMatch(/res\.count === 0/);
  });
});

describe('PrismaExceptionFilter maps the serializable write-conflict to 409', () => {
  it('P2034 → 409 Conflict (retry), not a raw 500', () => {
    expect(FILTER).toMatch(/exception\.code === 'P2034'/);
    expect(FILTER).toMatch(/WRITE_CONFLICT_MESSAGE/);
  });
});
