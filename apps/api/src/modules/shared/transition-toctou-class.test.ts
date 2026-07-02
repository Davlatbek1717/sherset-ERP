import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Class-lock for the document-transition TOCTOU guard, extended to every
 * stock-mutating doc service (2026-06-14, follow-up to demand dd33fac5 +
 * supply/sales-return/purchase-return 0b525f80).
 *
 * Each service had post()/unpost()/cancel() read the doc state OUTSIDE its
 * $transaction and then a blind `tx.<model>.update` to flip it, plus
 * delete()/softDelete() doing read-check-then-write — the exact double-stock-
 * mutation race demand closed. Each transition now ATOMICALLY CLAIMS its state
 * change as the first op inside the tx (a conditional `updateMany WHERE
 * state=<expected>` that takes the row write lock); the loser sees count 0 →
 * ConflictException, or its serializable tx aborts with P2034 → 409. cancel()
 * claims the EXACT snapshotted state (`existing.state`) so a concurrent unpost
 * that already flipped posted→draft can't double-reverse stock.
 *
 * Non-vacuous: before the fix none of these `updateMany` claims or `count === 0`
 * guards existed in these services (the blind `tx.<model>.update` flips still
 * run for their other field writes / return value).
 */

const STD_DELETE = "state:\\s*'draft',\\s*applicable:\\s*false,\\s*deletedAt:\\s*null";

const SERVICES = [
  {
    name: 'supply',
    model: 'supply',
    file: ['..', 'supply', 'supply.service.ts'],
    delete: STD_DELETE,
  },
  {
    name: 'sales-return',
    model: 'salesReturn',
    file: ['..', 'sales-return', 'sales-return.service.ts'],
    delete: STD_DELETE,
  },
  {
    name: 'purchase-return',
    model: 'purchaseReturn',
    file: ['..', 'purchase-return', 'purchase-return.service.ts'],
    delete: STD_DELETE,
  },
  { name: 'move', model: 'move', file: ['..', 'move', 'move.service.ts'], delete: STD_DELETE },
  { name: 'enter', model: 'enter', file: ['..', 'enter', 'enter.service.ts'], delete: STD_DELETE },
  {
    name: 'production',
    model: 'production',
    file: ['..', 'production', 'production.service.ts'],
    // production delete is applicable-gated (no draft-state column on the guard)
    delete: 'applicable:\\s*false,\\s*deletedAt:\\s*null',
  },
] as const;

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

for (const svc of SERVICES) {
  const SOURCE = stripComments(readFileSync(join(__dirname, ...svc.file), 'utf8'));
  const m = svc.model;

  describe(`${svc.name} transitions atomically claim their state (TOCTOU class-lock)`, () => {
    it('post() claims draft→posted via a conditional updateMany', () => {
      expect(SOURCE).toMatch(
        new RegExp(
          `tx\\.${m}\\.updateMany\\(\\{\\s*where:\\s*\\{\\s*id,\\s*accountId,\\s*state:\\s*'draft'\\s*\\},\\s*data:\\s*\\{\\s*state:\\s*'posted'\\s*\\}`,
        ),
      );
    });

    it('unpost() claims posted→draft', () => {
      expect(SOURCE).toMatch(
        new RegExp(
          `tx\\.${m}\\.updateMany\\(\\{\\s*where:\\s*\\{\\s*id,\\s*accountId,\\s*state:\\s*'posted'\\s*\\},\\s*data:\\s*\\{\\s*state:\\s*'draft'\\s*\\}`,
        ),
      );
    });

    it('cancel() claims the EXACT snapshotted state→cancelled', () => {
      expect(SOURCE).toMatch(
        new RegExp(
          `tx\\.${m}\\.updateMany\\(\\{\\s*where:\\s*\\{\\s*id,\\s*accountId,\\s*state:\\s*existing\\.state\\s*\\},\\s*data:\\s*\\{\\s*state:\\s*'cancelled'\\s*\\}`,
        ),
      );
    });

    it('each transition rejects the losing claim (3× claim.count === 0 → ConflictException)', () => {
      const claimGuards = SOURCE.match(/claim\.count === 0/g) ?? [];
      expect(claimGuards.length).toBe(3); // post + unpost + cancel
      expect(SOURCE).toMatch(/throw new ConflictException\(/);
    });

    it('delete() folds the state check into one conditional updateMany', () => {
      expect(SOURCE).toMatch(
        new RegExp(
          `${m}\\.updateMany\\(\\{\\s*where:\\s*\\{\\s*id,\\s*accountId,\\s*${svc.delete}\\s*\\}`,
        ),
      );
      expect(SOURCE).toMatch(/res\.count === 0/);
    });
  });
}

/**
 * processing (Техоперация) is the same class but a different shape: unpost and
 * cancel-from-posted share `reverseAndUpdate`, whose claim flips posted→a
 * `targetState` variable; post's claim carries the extra applicable/deletedAt
 * keys; and BOTH the draft-cancel and softDelete paths are hardened too because
 * a concurrent post (draft→posted, applies stock) would otherwise orphan stock
 * (cancel/delete a now-posted doc with no reversal).
 */
describe('processing transitions atomically claim their state (TOCTOU class-lock)', () => {
  const SOURCE = stripComments(
    readFileSync(join(__dirname, '..', 'processing', 'processing.service.ts'), 'utf8'),
  );

  it('post() claims draft→posted as the first op inside the tx', () => {
    expect(SOURCE).toMatch(
      /tx\.processing\.updateMany\(\{\s*where:\s*\{\s*id,\s*accountId,\s*state:\s*'draft',\s*applicable:\s*false,\s*deletedAt:\s*null\s*\},\s*data:\s*\{\s*state:\s*'posted'\s*\}/,
    );
  });

  it('reverseAndUpdate (unpost / cancel-posted) claims posted→targetState', () => {
    expect(SOURCE).toMatch(
      /tx\.processing\.updateMany\(\{\s*where:\s*\{\s*id,\s*accountId,\s*state:\s*'posted',\s*applicable:\s*true,\s*deletedAt:\s*null\s*\},\s*data:\s*\{\s*state:\s*targetState\s*\}/,
    );
  });

  it('cancel-from-draft claims draft→cancelled (post-race can not orphan stock)', () => {
    expect(SOURCE).toMatch(
      /processing\.updateMany\(\{\s*where:\s*\{\s*id,\s*accountId,\s*state:\s*'draft',\s*deletedAt:\s*null\s*\},\s*data:\s*\{\s*state:\s*'cancelled',\s*applicable:\s*false\s*\}/,
    );
  });

  it('softDelete claims draft (post-race can not orphan stock)', () => {
    expect(SOURCE).toMatch(
      /processing\.updateMany\(\{\s*where:\s*\{\s*id,\s*accountId,\s*state:\s*'draft',\s*applicable:\s*false,\s*deletedAt:\s*null\s*\},\s*data:\s*\{\s*deletedAt:\s*new Date\(\),\s*state:\s*'cancelled'\s*\}/,
    );
  });

  it('rejects the losing claim on every path (post + reverse + cancel-draft + softDelete)', () => {
    expect((SOURCE.match(/claim\.count === 0/g) ?? []).length).toBe(2); // post + reverseAndUpdate
    expect((SOURCE.match(/res\.count === 0/g) ?? []).length).toBe(2); // cancel-draft + softDelete
    expect(SOURCE).toMatch(/throw new ConflictException\(/);
  });
});
