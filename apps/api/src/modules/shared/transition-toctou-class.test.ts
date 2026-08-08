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
    // Faza 14 (`PP-06`): tasdiq zanjiri uchib turgan qabulni o'chirish SHU
    // ATOMIK yozuvning o'zida bloklanadi (alohida oldindan-tekshiruv emas) —
    // parallel `send()` (none → awaiting_supplier) delete'ni o'tkazib yubora
    // olmasligi uchun. Shart qo'shimcha, ya'ni guard KUCHAYDI; shuning uchun
    // umumiy shakl «}» bilan tugashni talab qilmaydi (pastdagi `[,}]`).
    deleteAlso: 'approvalStage:\\s*\\{\\s*notIn:\\s*\\[\\.\\.\\.IN_FLIGHT_STAGES\\]\\s*\\}',
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

    it('every atomic claim rejects the losing race (claim.count === 0 → ConflictException)', () => {
      // MASTER-TODO #25: this asserted an exact `toBe(3)` (post + unpost +
      // cancel). enter.service.ts now has FOUR — the extra one is a
      // version-checked claim on a posted row (`state: 'posted', version:
      // parsed.version`), i.e. a STRONGER guard, not a missing transition. A
      // hardcoded count turns "someone added protection" into a red test.
      //
      // The three transitions are already pinned individually above, so what
      // this adds is the invariant that matters and cannot drift: EVERY
      // `const claim = await tx.<model>.updateMany(...)` is followed by a
      // count check. An unchecked claim is exactly the TOCTOU hole.
      const claims = SOURCE.match(new RegExp(`const claim = await tx\\.${m}\\.updateMany`, 'g'));
      const guards = SOURCE.match(/claim\.count === 0/g) ?? [];
      expect(claims, `${svc.name}: no atomic claim found (scan broken?)`).not.toBeNull();
      expect(claims?.length ?? 0).toBeGreaterThanOrEqual(3); // post + unpost + cancel
      expect(guards.length, 'every claim must be checked for the lost race').toBe(
        claims?.length ?? 0,
      );
      expect(SOURCE).toMatch(/throw new ConflictException\(/);
    });

    it('delete() folds the state check into one conditional updateMany', () => {
      // `[,}]` — the guard may carry EXTRA conditions after the standard ones
      // (a stronger atomic write, e.g. supply's approvalStage clause). Pinning
      // a closing brace here would turn "someone added protection" into a red
      // test, the same drift trap called out on the claim-count assertion.
      expect(SOURCE).toMatch(
        new RegExp(
          `${m}\\.updateMany\\(\\{\\s*where:\\s*\\{\\s*id,\\s*accountId,\\s*${svc.delete}\\s*[,}]`,
        ),
      );
      expect(SOURCE).toMatch(/res\.count === 0/);
      // …and where an extra condition IS required, pin it inside the SAME write.
      const also = (svc as { deleteAlso?: string }).deleteAlso;
      if (also) {
        expect(SOURCE).toMatch(
          new RegExp(
            `${m}\\.updateMany\\(\\{\\s*where:\\s*\\{\\s*id,\\s*accountId,\\s*${svc.delete},\\s*${also}`,
          ),
        );
      }
    });
  });
}

/**
 * loss (Списание) — the stock document this class-lock never covered, which is
 * exactly why the hole survived (STK-01, Faza 5, 2026-08-08).
 *
 * post() got its inline claim in 2026-07-29, but unpost() and cancel() kept
 * reading the state OUTSIDE the tx and flipping it blind, and cancel() ran at
 * the DEFAULT isolation level — no `isolationLevel` argument at all. Two
 * parallel cancels (or a cancel racing an unpost) credited the written-off qty
 * AND costBalanceMinor back twice. The two new claims go through the shared
 * `transitionWithClaim()` primitive, so the shape pinned here is the same one
 * the money family uses; post() keeps its (equivalent) inline claim.
 *
 * Behavioural counterpart: `../loss/loss-transition-race.test.ts`.
 *
 * NOT pinned here: `loss.delete()` still does read-check-then-write (a post
 * racing a soft-delete can orphan stock) — a real, separate hole left open by
 * Faza 5's scope, see the phase report.
 */
describe('loss transitions atomically claim their state (TOCTOU class-lock)', () => {
  const SOURCE = stripComments(
    readFileSync(join(__dirname, '..', 'loss', 'loss.service.ts'), 'utf8'),
  );

  it('post() claims draft→posted via a conditional updateMany', () => {
    expect(SOURCE).toMatch(
      /tx\.loss\.updateMany\(\{\s*where:\s*\{\s*id,\s*accountId,\s*state:\s*'draft'\s*\},\s*data:\s*\{\s*state:\s*'posted'\s*\}/,
    );
    expect(SOURCE).toMatch(/claim\.count === 0/);
  });

  it('unpost() claims posted→draft through the shared primitive', () => {
    expect(SOURCE).toMatch(claimRe('loss', "\\['posted'\\]", 'draft'));
  });

  it('cancel() claims the EXACT snapshotted state→cancelled', () => {
    // A state LITERAL would miss the cancel-vs-unpost race (different end
    // states); only the snapshotted state serialises those two.
    expect(SOURCE).toMatch(claimRe('loss', '\\[existing\\.state\\]', 'cancelled'));
  });

  it('all three stock-moving transitions run Serializable', () => {
    const uses = SOURCE.match(/isolationLevel: 'Serializable'/g) ?? [];
    expect(uses.length, 'post + unpost + cancel each need Serializable').toBe(3);
    expect(SOURCE).toMatch(/withSerializationRetry\(/);
  });
});

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

/**
 * ============================================================================
 * MONEY family (Faza 1, 2026-08-08 — findings M-01 + DUP-01)
 * ============================================================================
 *
 * The stock family closed this bug class in 2026-06; the MONEY document family
 * still carried it: state checked OUTSIDE the `$transaction`, default
 * ReadCommitted isolation, and a blind `update({ where: { id, accountId } })`
 * to flip it. Two concurrent «Провести» requests both saw `draft` and both ran
 * the counterparty-balance delta — the balance moved 2× silently.
 *
 * These services claim through the shared `transitionWithClaim()` primitive
 * rather than an inline `updateMany`, so the scan below pins THAT call shape
 * plus the two things that make it work: `Serializable` (via MONEY_TX_OPTS) and
 * `withSerializationRetry` around the transition dispatch.
 *
 * Non-vacuous: before the fix none of these seven files contained the string
 * `transitionWithClaim`, `MONEY_TX_OPTS` or `withSerializationRetry`.
 *
 * Behavioural counterpart (the race actually driven end-to-end):
 * `shared/money-transition-race.test.ts`.
 */
const MONEY_SERVICES = [
  {
    name: 'payment-in',
    model: 'paymentIn',
    file: ['..', 'payment-in', 'payment-in.service.ts'],
    postFrom: "\\['draft'\\]",
    unpostFrom: "\\['posted'\\]",
    cancelFrom: '\\[existing\\.state\\]',
  },
  {
    name: 'payment-out',
    model: 'paymentOut',
    file: ['..', 'payment-out', 'payment-out.service.ts'],
    postFrom: "\\['draft'\\]",
    unpostFrom: "\\['posted'\\]",
    cancelFrom: '\\[existing\\.state\\]',
  },
  {
    name: 'cash-in',
    model: 'cashIn',
    file: ['..', 'cash-in', 'cash-in.service.ts'],
    postFrom: "\\['draft'\\]",
    unpostFrom: "\\['posted'\\]",
    cancelFrom: '\\[existing\\.state\\]',
  },
  {
    name: 'cash-out',
    model: 'cashOut',
    file: ['..', 'cash-out', 'cash-out.service.ts'],
    postFrom: "\\['draft'\\]",
    unpostFrom: "\\['posted'\\]",
    cancelFrom: '\\[existing\\.state\\]',
  },
  {
    name: 'invoice-out',
    model: 'invoiceOut',
    file: ['..', 'invoice-out', 'invoice-out.service.ts'],
    postFrom: "\\['draft'\\]",
    // posted OR sent are both legal unpost sources here → snapshotted state
    unpostFrom: '\\[existing\\.state\\]',
    cancelFrom: '\\[existing\\.state\\]',
  },
  {
    name: 'invoice-in',
    model: 'invoiceIn',
    file: ['..', 'invoice-in', 'invoice-in.service.ts'],
    postFrom: "\\['draft'\\]",
    unpostFrom: "\\['posted'\\]",
    cancelFrom: '\\[existing\\.state\\]',
  },
  {
    name: 'counterparty-adjustment',
    model: 'counterpartyAdjustment',
    file: ['..', 'counterparty-adjustment', 'counterparty-adjustment.service.ts'],
    // this one gates on `applicable`, not on a state literal → snapshotted state
    postFrom: '\\[row\\.state\\]',
    unpostFrom: '\\[row\\.state\\]',
    cancelFrom: '\\[row\\.state\\]',
    // ONE $transaction branches on the target internally (unlike the other six,
    // which have a separate post()/unpost()/cancel() transaction each).
    txCount: 1,
  },
] as const;

const claimRe = (model: string, from: string, to: string) =>
  new RegExp(
    `transitionWithClaim\\(tx\\.${model},\\s*\\{\\s*id,\\s*accountId,\\s*fromStates:\\s*${from},\\s*toState:\\s*'${to}'`,
  );

for (const svc of MONEY_SERVICES) {
  const SOURCE = stripComments(readFileSync(join(__dirname, ...svc.file), 'utf8'));

  describe(`${svc.name} transitions atomically claim their state (MONEY TOCTOU class-lock)`, () => {
    it('post() claims → posted through the shared primitive', () => {
      expect(SOURCE).toMatch(claimRe(svc.model, svc.postFrom, 'posted'));
    });

    it('unpost() claims → draft', () => {
      expect(SOURCE).toMatch(claimRe(svc.model, svc.unpostFrom, 'draft'));
    });

    it('cancel() claims → cancelled', () => {
      expect(SOURCE).toMatch(claimRe(svc.model, svc.cancelFrom, 'cancelled'));
    });

    it('every transition runs Serializable (MONEY_TX_OPTS on each $transaction)', () => {
      const expected = 'txCount' in svc ? svc.txCount : 3; // post + unpost + cancel
      const uses = SOURCE.match(/\}, MONEY_TX_OPTS\)/g) ?? [];
      expect(uses.length, `${svc.name}: a transition $transaction lost its options arg`).toBe(
        expected,
      );
      expect(SOURCE).toMatch(
        /import \{ MONEY_TX_OPTS, transitionWithClaim \} from '\.\.\/shared\/transition-with-claim\.js'/,
      );
    });

    it('the transition dispatch retries serialization conflicts and re-reads the row', () => {
      // Serializable ABORTS the loser (40001/P2034) instead of queueing it, so
      // without the retry a legitimate second click would surface a raw DB
      // error. The re-read inside the closure is what stops a retry from
      // re-posting a doc a rival already posted (move/enter precedent).
      expect(SOURCE).toMatch(/withSerializationRetry\(/);
      expect(SOURCE).toMatch(/withSerializationRetry\((?:async )?\(\) => \{?\s*(?:const|this)/);
    });
  });
}

/**
 * Coverage lock: the money family list above must not silently shrink. If a
 * new money document service is added it belongs here too.
 */
describe('MONEY TOCTOU class-lock covers the whole money-document family', () => {
  it('pins all seven balance-writing transition services', () => {
    expect(MONEY_SERVICES.map((s) => s.name).sort()).toEqual([
      'cash-in',
      'cash-out',
      'counterparty-adjustment',
      'invoice-in',
      'invoice-out',
      'payment-in',
      'payment-out',
    ]);
  });
});
