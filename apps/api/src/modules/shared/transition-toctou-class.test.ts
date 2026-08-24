import { readFileSync, readdirSync, statSync } from 'node:fs';
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
 * Faza Q3 (2026-08-09) closed what Faza 5 left open here: `loss.delete()` did
 * read-check-then-write, so a post racing a soft-delete orphaned the stock
 * movement. It is pinned below like every stock sibling's.
 */
describe('loss transitions atomically claim their state (TOCTOU class-lock)', () => {
  const SOURCE = stripComments(
    readFileSync(join(__dirname, '..', 'loss', 'loss.service.ts'), 'utf8'),
  );

  it('post() claims draft→posted via a conditional updateMany', () => {
    // Faza Q3 added `deletedAt: null` — a rival delete() must not be able to
    // soft-delete the draft out from under a post that then still "succeeds".
    expect(SOURCE).toMatch(
      /tx\.loss\.updateMany\(\{\s*where:\s*\{\s*id,\s*accountId,\s*state:\s*'draft',\s*deletedAt:\s*null\s*\},\s*data:\s*\{\s*state:\s*'posted'\s*\}/,
    );
    expect(SOURCE).toMatch(/claim\.count === 0/);
  });

  it('delete() folds the state check into one conditional updateMany (Faza Q3)', () => {
    // Faza 5 left this hole open ON PURPOSE (out of its scope) and said so in
    // its report: `findById` + a blind `update({ where: { id, accountId } })`.
    // A post racing that delete orphaned the StockOperation forever.
    expect(SOURCE).toMatch(
      new RegExp(
        `loss\\.updateMany\\(\\{\\s*where:\\s*\\{\\s*id,\\s*accountId,\\s*${STD_DELETE}\\s*[,}]`,
      ),
    );
    expect(SOURCE).toMatch(/res\.count === 0/);
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
    delete: STD_DELETE,
    deleteGuard: 'res\\.count === 0',
  },
  {
    name: 'payment-out',
    model: 'paymentOut',
    file: ['..', 'payment-out', 'payment-out.service.ts'],
    postFrom: "\\['draft'\\]",
    unpostFrom: "\\['posted'\\]",
    cancelFrom: '\\[existing\\.state\\]',
    delete: STD_DELETE,
    deleteGuard: 'res\\.count === 0',
  },
  {
    name: 'cash-in',
    model: 'cashIn',
    file: ['..', 'cash-in', 'cash-in.service.ts'],
    postFrom: "\\['draft'\\]",
    unpostFrom: "\\['posted'\\]",
    cancelFrom: '\\[existing\\.state\\]',
    delete: STD_DELETE,
    deleteGuard: 'res\\.count === 0',
  },
  {
    name: 'cash-out',
    model: 'cashOut',
    file: ['..', 'cash-out', 'cash-out.service.ts'],
    postFrom: "\\['draft'\\]",
    unpostFrom: "\\['posted'\\]",
    cancelFrom: '\\[existing\\.state\\]',
    delete: STD_DELETE,
    deleteGuard: 'res\\.count === 0',
  },
  {
    name: 'invoice-out',
    model: 'invoiceOut',
    file: ['..', 'invoice-out', 'invoice-out.service.ts'],
    postFrom: "\\['draft'\\]",
    // posted OR sent are both legal unpost sources here → snapshotted state
    unpostFrom: '\\[existing\\.state\\]',
    cancelFrom: '\\[existing\\.state\\]',
    delete: STD_DELETE,
    deleteGuard: 'res\\.count === 0',
  },
  {
    name: 'invoice-in',
    model: 'invoiceIn',
    file: ['..', 'invoice-in', 'invoice-in.service.ts'],
    postFrom: "\\['draft'\\]",
    unpostFrom: "\\['posted'\\]",
    cancelFrom: '\\[existing\\.state\\]',
    delete: STD_DELETE,
    deleteGuard: 'res\\.count === 0',
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
    // softDelete is legal from SEVERAL states here and reverses the balance
    // itself, so it claims the SNAPSHOTTED state + applicable (the cancel()
    // rule) instead of the `draft` literal the other six use.
    delete: 'state:\\s*row\\.state,\\s*applicable:\\s*row\\.applicable,\\s*deletedAt:\\s*null',
    deleteGuard: 'claim\\.count === 0',
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

    it('delete()/softDelete() claims the row in ONE conditional updateMany (Faza Q3)', () => {
      // Faza 1 hardened post/unpost/cancel and explicitly deferred this half:
      // `delete()` kept `findById` + a blind `update({ where: { id, accountId }
      // })`, so a concurrent post() left the doc posted AND soft-deleted — a
      // counterparty-balance / CashDesk delta nothing lists and nothing can
      // unpost. `[,}]` allows a STRONGER guard to be added later.
      expect(SOURCE).toMatch(
        new RegExp(
          `${svc.model}\\.updateMany\\(\\{\\s*where:\\s*\\{\\s*id,\\s*accountId,\\s*${svc.delete}\\s*[,}]`,
        ),
      );
      expect(SOURCE).toMatch(new RegExp(svc.deleteGuard));
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
 * work-order (ТЗ) — a stock-mutating document whose FSM lives in ONE
 * `transition()` (CAS-flipped since 2026-06), so it never fitted the
 * post/unpost/cancel table above. Its `delete()` was the gap: it refused only
 * `in_progress`, which meant a COMPLETED order — BOM components consumed,
 * output emitted, value moved (Faza Q2) — could be soft-deleted with no
 * reversal at all, and the one document able to reverse it (`completed →
 * cancelled`) vanished with it. Faza Q3 narrows deletion to the two states
 * that hold no stock effect, atomically.
 */
describe('work-order delete() cannot orphan its stock cascade (TOCTOU class-lock)', () => {
  const SOURCE = stripComments(
    readFileSync(join(__dirname, '..', 'work-order', 'work-order.service.ts'), 'utf8'),
  );

  it('the FSM flip claims the exact from-state (regression lock)', () => {
    expect(SOURCE).toMatch(
      /tx\.workOrder\.updateMany\(\{\s*where:\s*\{\s*id,\s*accountId,\s*state:\s*from,\s*deletedAt:\s*null\s*\}/,
    );
    expect(SOURCE).toMatch(/flip\.count === 0/);
  });

  it('delete() is confined to the stock-free states in ONE conditional write', () => {
    expect(SOURCE).toMatch(
      /workOrder\.updateMany\(\{\s*where:\s*\{\s*id,\s*accountId,\s*state:\s*\{\s*in:\s*\['draft',\s*'cancelled'\]\s*\},\s*deletedAt:\s*null\s*\}/,
    );
    expect(SOURCE).toMatch(/res\.count === 0/);
  });

  it('a completed order is refused BEFORE the write, with its own message', () => {
    // Without this branch the atomic guard would still hold, but the clerk
    // would read «faqat draft/cancelled» and never learn that CANCEL is the
    // action that reverses the warehouse.
    expect(SOURCE).toMatch(/wo\.state === 'completed'/);
  });
});

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

/**
 * Coverage lock for the STOCK family — the thing Faza 5 named as the ROOT CAUSE
 * of `STK-01` and then could not add: loss survived with an unguarded
 * transition for two months purely because nothing asserted that every
 * stock-mutating service is inside this scan. The money family got such a lock
 * (above); the stock family had none.
 *
 * A hardcoded-vs-hardcoded list would only catch shrinkage, so this one is
 * derived from the FILESYSTEM: every `*.service.ts` that calls
 * `stock.applyDeltas` (the single choke-point through which Stock rows move)
 * must be classified — either pinned by this file, or listed as known,
 * documented debt. A NEW stock-mutating service is neither, so it fails here
 * the day it lands.
 */
describe('STOCK TOCTOU class-lock coverage is complete (Faza Q3)', () => {
  /** Services whose transition/delete claims are pinned in THIS file. */
  const PINNED = [
    'enter',
    'loss',
    'move',
    'processing',
    'production',
    'purchase-return',
    'sales-return',
    'supply',
    'work-order',
  ];

  /**
   * Stock-mutating services deliberately NOT pinned yet — open debt, each with
   * a reason. Removing one from here means it must move into PINNED.
   *   - demand            — claim added in dd33fac5, own regression suite
   *   - inventory         — recount doc, no draft/posted delete path
   *   - retail-sale       — POS FSM (Faza Q1 hardened post + shift claim)
   *   - product-cell-move — warehouse cell transfer, not a document FSM
   *   - product-cut       — cut/repack helper, not a document FSM
   *   - store-address     — F7 sanash-joylashtirish (cell_place juftligi,
   *                         Serializable tx + lockBalances, hujjat FSM emas —
   *                         product-cell-move.place bilan bir sinf)
   */
  const KNOWN_UNPINNED = [
    'demand',
    'inventory',
    'product-cell-move',
    'product-cut',
    'retail-sale',
    'store-address',
  ];

  it('every service that moves Stock is either pinned here or listed as known debt', () => {
    // Keyed on the SERVICE file, not the module dir: `product/` alone holds two
    // stock-moving services (cell-move, cut) that must be classified apart.
    const modulesDir = join(__dirname, '..');
    const found = new Set<string>();
    for (const moduleName of readdirSync(modulesDir)) {
      const dir = join(modulesDir, moduleName);
      if (!statSync(dir).isDirectory()) continue;
      for (const file of readdirSync(dir)) {
        if (!file.endsWith('.service.ts')) continue;
        const src = readFileSync(join(dir, file), 'utf8');
        if (/\bstock\.applyDeltas\(/.test(src)) found.add(file.replace('.service.ts', ''));
      }
    }

    const classified = new Set([...PINNED, ...KNOWN_UNPINNED]);
    const unclassified = [...found].filter((m) => !classified.has(m)).sort();
    expect(
      unclassified,
      'a new stock-mutating service appeared: pin its post/delete claims above (or add it to KNOWN_UNPINNED with a reason)',
    ).toEqual([]);
  });

  it('the pinned list matches the services actually scanned in this file', () => {
    const scanned = [...SERVICES.map((s) => s.name), 'loss', 'processing', 'work-order'].sort();
    expect(PINNED.slice().sort()).toEqual(scanned);
  });
});
