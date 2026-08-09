import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { transitionWithClaim } from './transition-with-claim.js';

/**
 * Unit-lock for the atomic state-claim primitive (Faza 1, M-01/DUP-01).
 *
 * The claim is the ONLY thing standing between two concurrent «Провести»
 * requests and a doubly-applied money delta, so its two behaviours are pinned
 * here in isolation: it must issue a conditional `updateMany` whose WHERE
 * carries the tenant + the expected state set, and it must reject (409) when
 * that conditional matched nothing.
 */

/** Minimal in-memory delegate that honours the WHERE we care about. */
function makeDelegate(row: {
  id: string;
  accountId: string;
  state: string;
  deletedAt?: Date | null;
}) {
  const updateMany = vi.fn(
    async (args: {
      where: { id: string; accountId: string; state: { in: string[] }; deletedAt: null };
      data: { state: string };
    }) => {
      const w = args.where;
      const alive = w.deletedAt !== null || (row.deletedAt ?? null) === null;
      const hit =
        row.id === w.id && row.accountId === w.accountId && w.state.in.includes(row.state) && alive;
      if (!hit) return { count: 0 };
      row.state = args.data.state;
      return { count: 1 };
    },
  );
  return { delegate: { updateMany }, updateMany };
}

describe('transitionWithClaim', () => {
  it('flips the state when the row is in one of fromStates', async () => {
    const row = { id: 'doc-1', accountId: 'acc-1', state: 'draft' };
    const { delegate } = makeDelegate(row);

    await transitionWithClaim(delegate, {
      id: 'doc-1',
      accountId: 'acc-1',
      fromStates: ['draft'],
      toState: 'posted',
    });

    expect(row.state).toBe('posted');
  });

  it('issues a conditional updateMany scoped by id + accountId + state + deletedAt', async () => {
    const row = { id: 'doc-1', accountId: 'acc-1', state: 'posted' };
    const { delegate, updateMany } = makeDelegate(row);

    await transitionWithClaim(delegate, {
      id: 'doc-1',
      accountId: 'acc-1',
      fromStates: ['posted'],
      toState: 'draft',
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'doc-1', accountId: 'acc-1', state: { in: ['posted'] }, deletedAt: null },
      data: { state: 'draft' },
    });
  });

  it('refuses to transition a soft-deleted row (Faza Q3 — delete racing post)', async () => {
    // The pre-read (`findById … deletedAt: null`) saw a live draft; a rival
    // delete() committed before the claim ran. Without `deletedAt: null` in the
    // WHERE the doc would end up posted AND deleted — an orphaned side effect.
    const row = { id: 'doc-1', accountId: 'acc-1', state: 'draft', deletedAt: new Date() };
    const { delegate } = makeDelegate(row);

    await expect(
      transitionWithClaim(delegate, {
        id: 'doc-1',
        accountId: 'acc-1',
        fromStates: ['draft'],
        toState: 'posted',
      }),
    ).rejects.toThrow(ConflictException);
    expect(row.state).toBe('draft');
  });

  it('throws ConflictException when the row is not in fromStates (count === 0)', async () => {
    const row = { id: 'doc-1', accountId: 'acc-1', state: 'posted' };
    const { delegate } = makeDelegate(row);

    await expect(
      transitionWithClaim(delegate, {
        id: 'doc-1',
        accountId: 'acc-1',
        fromStates: ['draft'],
        toState: 'posted',
      }),
    ).rejects.toThrow(ConflictException);
    // losing claim must not mutate anything
    expect(row.state).toBe('posted');
  });

  it('throws ConflictException for a foreign tenant even when the state matches', async () => {
    const row = { id: 'doc-1', accountId: 'acc-1', state: 'draft' };
    const { delegate } = makeDelegate(row);

    await expect(
      transitionWithClaim(delegate, {
        id: 'doc-1',
        accountId: 'other-acc',
        fromStates: ['draft'],
        toState: 'posted',
      }),
    ).rejects.toThrow(ConflictException);
    expect(row.state).toBe('draft');
  });

  it('accepts multiple fromStates (cancel: draft OR posted → cancelled)', async () => {
    const row = { id: 'doc-1', accountId: 'acc-1', state: 'posted' };
    const { delegate } = makeDelegate(row);

    await transitionWithClaim(delegate, {
      id: 'doc-1',
      accountId: 'acc-1',
      fromStates: ['draft', 'posted'],
      toState: 'cancelled',
    });

    expect(row.state).toBe('cancelled');
  });

  it('carries the caller message into the 409 so the UI can show a domain string', async () => {
    const row = { id: 'doc-1', accountId: 'acc-1', state: 'cancelled' };
    const { delegate } = makeDelegate(row);

    await expect(
      transitionWithClaim(delegate, {
        id: 'doc-1',
        accountId: 'acc-1',
        fromStates: ['draft'],
        toState: 'posted',
        message: "To'lov allaqachon o'tkazilgan",
      }),
    ).rejects.toThrow("To'lov allaqachon o'tkazilgan");
  });
});
