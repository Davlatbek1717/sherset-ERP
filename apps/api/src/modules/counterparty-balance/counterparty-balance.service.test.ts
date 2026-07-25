import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CounterpartyBalanceService } from './counterparty-balance.service.js';

function makeTx() {
  const upsertArgs: Array<{
    where: { counterpartyId_currency: { counterpartyId: string; currency: string } };
    create: { balanceMinor: bigint };
    update: { balanceMinor: { increment: bigint } };
  }> = [];
  const tx = {
    counterpartyBalance: {
      upsert: vi.fn().mockImplementation(async (args: (typeof upsertArgs)[number]) => {
        upsertArgs.push(args);
        return { balanceMinor: args.create.balanceMinor };
      }),
    },
  };
  return { tx, upsertArgs };
}

function svc() {
  const events = { emit: vi.fn() };
  return new CounterpartyBalanceService({} as never, events as never);
}

describe('CounterpartyBalanceService.applyDelta', () => {
  it('upserts on first write (create branch used on miss)', async () => {
    const { tx, upsertArgs } = makeTx();
    await svc().applyDelta(tx as never, 'acc-1', 'cp-1', 'UZS', 1_000_000n);
    expect(upsertArgs).toHaveLength(1);
    expect(upsertArgs[0]!.create.balanceMinor).toBe(1_000_000n);
    expect(upsertArgs[0]!.update.balanceMinor.increment).toBe(1_000_000n);
  });

  it('short-circuits on zero delta', async () => {
    const { tx } = makeTx();
    await svc().applyDelta(tx as never, 'acc-1', 'cp-1', 'UZS', 0n);
    expect(tx.counterpartyBalance.upsert).not.toHaveBeenCalled();
  });

  it('passes negative delta through (we-owe-them direction)', async () => {
    const { tx, upsertArgs } = makeTx();
    await svc().applyDelta(tx as never, 'a', 'c', 'UZS', -500_000n);
    expect(upsertArgs[0]!.update.balanceMinor.increment).toBe(-500_000n);
  });

  it('rejects non-3-letter currency codes', async () => {
    const { tx } = makeTx();
    await expect(svc().applyDelta(tx as never, 'a', 'c', 'USDT', 1n)).rejects.toThrow(
      BadRequestException,
    );
    expect(tx.counterpartyBalance.upsert).not.toHaveBeenCalled();
  });

  it('keys upsert on the composite (counterpartyId, currency)', async () => {
    const { tx, upsertArgs } = makeTx();
    await svc().applyDelta(tx as never, 'a', 'cp-42', 'USD', 100n);
    expect(upsertArgs[0]!.where).toEqual({
      counterpartyId_currency: { counterpartyId: 'cp-42', currency: 'USD' },
    });
  });
});
