import { describe, expect, it } from 'vitest';
import { debtCashDeskDeltas } from './debt-cash-ledger.js';

/**
 * Faza 11 — `M-05`: a debt payment taken in cash must move the till.
 *
 * BEFORE THE FIX `pos-debt-payment.service.ts` wrote the DebtPayment row (with
 * `cashDeskId` on it!), recalculated the debt and moved the counterparty
 * balance — but never touched `MoneyService`. Real banknotes went into the
 * drawer while `CashDesk.balanceMinor` and the `/money` ledger stayed put, so
 * any till audit read a permanent surplus. (The SHIFT total was already
 * correct — `cashier-session` sums `debtPayment` rows directly — which is why
 * the audit downgraded this to MEDIUM. The cash-desk balance and the money
 * ledger were, and are, the actual gap.)
 *
 * This module is the SINGLE predicate shared by the write side (POS pay,
 * cashier payment) and the storno side (reversePayment, cancelCallNote). Two
 * copies would eventually disagree, and a disagreement here means either a
 * till credited but never debited back, or debited for money it never got.
 */

const DESK = 'cd-1';
const BASE = {
  method: 'cash',
  cashDeskId: DESK,
  currency: 'UZS',
  amountMinor: 50_000n,
  amountOriginalMinor: null,
};

describe('debtCashDeskDeltas — what counts as drawer cash', () => {
  it('cash + named desk ⇒ one credit on that desk', () => {
    const deltas = debtCashDeskDeltas(BASE, {
      sign: 1n,
      documentId: 'batch-1',
      deskCurrency: 'UZS',
      counterpartyId: 'cp-1',
    });

    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toMatchObject({
      sourceKind: 'cash_desk',
      sourceId: DESK,
      deltaMinor: 50_000n,
      currency: 'UZS',
      documentKind: 'debtpayment',
      documentId: 'batch-1',
      counterpartyId: 'cp-1',
    });
  });

  it('the storno sign is the exact mirror', () => {
    const [credit] = debtCashDeskDeltas(BASE, { sign: 1n, documentId: 'b', deskCurrency: 'UZS' });
    const [debit] = debtCashDeskDeltas(BASE, { sign: -1n, documentId: 'b', deskCurrency: 'UZS' });

    expect((credit?.deltaMinor ?? 0n) + (debit?.deltaMinor ?? 0n)).toBe(0n);
  });

  it('terminal payment ⇒ nothing (the money lands at the acquirer, not the drawer)', () => {
    expect(
      debtCashDeskDeltas(
        { ...BASE, method: 'terminal' },
        { sign: 1n, documentId: 'b', deskCurrency: 'UZS' },
      ),
    ).toEqual([]);
  });

  it('card screenshot ⇒ nothing', () => {
    expect(
      debtCashDeskDeltas(
        { ...BASE, method: 'card_screenshot' },
        { sign: 1n, documentId: 'b', deskCurrency: 'UZS' },
      ),
    ).toEqual([]);
  });

  it("card ⇒ nothing (2026-08-31 — kassadagi karta o'tkazmasi ham bankka boradi)", () => {
    expect(
      debtCashDeskDeltas(
        { ...BASE, method: 'card' },
        { sign: 1n, documentId: 'b', deskCurrency: 'UZS' },
      ),
    ).toEqual([]);
  });

  it('account ⇒ nothing (hisob raqam — bank o‘tkazmasi, tortmaga tushmaydi)', () => {
    expect(
      debtCashDeskDeltas(
        { ...BASE, method: 'account' },
        { sign: 1n, documentId: 'b', deskCurrency: 'UZS' },
      ),
    ).toEqual([]);
  });

  it('cash with NO desk ⇒ nothing (operator logged what the client claims to have paid)', () => {
    expect(
      debtCashDeskDeltas(
        { ...BASE, cashDeskId: null },
        { sign: 1n, documentId: 'b', deskCurrency: 'UZS' },
      ),
    ).toEqual([]);
  });

  it('zero amount ⇒ nothing (no empty ledger rows)', () => {
    expect(
      debtCashDeskDeltas(
        { ...BASE, amountMinor: 0n },
        { sign: 1n, documentId: 'b', deskCurrency: 'UZS' },
      ),
    ).toEqual([]);
  });

  it('foreign-currency cash uses the ORIGINAL banknotes, not the som equivalent', () => {
    // DebtPayment.amountMinor is always in the DEBT currency (schema doc);
    // `currency`/`amountOriginalMinor` hold what the client actually handed
    // over. Crediting a desk with the som equivalent under a 'USD' label would
    // be wrong twice over.
    //
    // This is the USD-DESK case (`deskCurrency: 'USD'`): the drawer itself is
    // kept in dollars, so the banknotes do belong in this ledger. A USD payment
    // into a UZS desk is a different rule — `debt-usd-desk-currency.test.ts`.
    const deltas = debtCashDeskDeltas(
      {
        method: 'cash',
        cashDeskId: DESK,
        currency: 'USD',
        amountMinor: 1_280_000n,
        amountOriginalMinor: 10_000n,
      },
      { sign: 1n, documentId: 'b', deskCurrency: 'USD' },
    );

    expect(deltas[0]).toMatchObject({ deltaMinor: 10_000n, currency: 'USD' });
  });

  it('never sets allowNegative — a till cannot pay out cash it does not hold', () => {
    const [d] = debtCashDeskDeltas(BASE, { sign: 1n, documentId: 'b', deskCurrency: 'UZS' });
    expect(d?.allowNegative).toBeUndefined();
  });
});
