import { computePositionTotal } from '@moysklad/money';
import { describe, expect, it } from 'vitest';
import { type AgreementRow, distributeAgreementDelta } from './position-agreement';

function row(partial: Partial<AgreementRow> & { id: string }): AgreementRow {
  return {
    quantity: '1',
    priceMinor: '0',
    discount: '0',
    vat: '0',
    vatEnabled: false,
    ...partial,
  };
}

function total(rows: AgreementRow[], vatIncluded = false): bigint {
  let sum = 0n;
  for (const r of rows) {
    sum += computePositionTotal(
      {
        quantity: r.quantity,
        priceMinor: r.priceMinor,
        discount: r.discount,
        vat: r.vatEnabled && r.vat ? Number(r.vat) : null,
      },
      r.vatEnabled,
      vatIncluded,
    ).totalMinor;
  }
  return sum;
}

function applied(rows: AgreementRow[], delta: bigint, vatIncluded = false): AgreementRow[] {
  const patch = distributeAgreementDelta(rows, delta, vatIncluded);
  return rows.map((r) => (patch.has(r.id) ? { ...r, priceMinor: patch.get(r.id) ?? '0' } : r));
}

describe('distributeAgreementDelta («Kelishuv» proportional spread)', () => {
  it('adds the delta proportionally and the new total hits old+delta exactly (integer qty)', () => {
    // 100 000 som + 50 000 som lines (in tiyin), +5 000 som agreement.
    const rows = [
      row({ id: 'a', priceMinor: '10000000', quantity: '1' }),
      row({ id: 'b', priceMinor: '2500000', quantity: '2' }),
    ];
    const before = total(rows); // 15 000 000 tiyin
    const after = applied(rows, 500000n);
    expect(total(after)).toBe(before + 500000n);
  });

  it('subtracts with the same proportionality', () => {
    const rows = [
      row({ id: 'a', priceMinor: '10000000' }),
      row({ id: 'b', priceMinor: '5000000' }),
    ];
    const before = total(rows);
    const after = applied(rows, -300000n);
    expect(total(after)).toBe(before - 300000n);
    // The larger row absorbs roughly 2/3 of the subtraction.
    expect(BigInt(after[0]?.priceMinor ?? '0')).toBeLessThan(10000000n);
    expect(BigInt(after[1]?.priceMinor ?? '0')).toBeLessThan(5000000n);
  });

  it('fractional qty rows stay within a few tiyin of the target (documented drift)', () => {
    const rows = [
      row({ id: 'a', priceMinor: '333333', quantity: '3' }),
      row({ id: 'b', priceMinor: '100000', quantity: '7' }),
    ];
    const before = total(rows);
    const after = applied(rows, 100001n); // awkward prime-ish delta
    const drift = total(after) - (before + 100001n);
    expect(drift <= 10n && drift >= -10n).toBe(true);
  });

  it('clamps prices at 0 when subtracting more than a row can carry', () => {
    const rows = [row({ id: 'a', priceMinor: '1000' }), row({ id: 'b', priceMinor: '100000' })];
    const after = applied(rows, -200000n);
    for (const r of after) expect(BigInt(r.priceMinor) >= 0n).toBe(true);
  });

  it('splits equally when every line total is zero', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b' })];
    const after = applied(rows, 200n);
    expect(total(after)).toBe(200n);
    expect(after[0]?.priceMinor).toBe(after[1]?.priceMinor);
  });

  it('skips qty-0 rows and returns an empty patch for a zero delta', () => {
    const rows = [row({ id: 'a', quantity: '0', priceMinor: '5000' })];
    expect(distributeAgreementDelta(rows, 1000n, false).size).toBe(0);
    expect(distributeAgreementDelta([row({ id: 'b', priceMinor: '5000' })], 0n, false).size).toBe(
      0,
    );
  });

  // ── Review 2026-07-17 regressions (adversarial workflow findings) ──

  it('coarse largest row: residual lands on the FINEST-step row, total exact (review #1)', () => {
    // Largest row is qty-100000 (100 000-tiyin steps); row b (qty 1) must absorb
    // the remainder. The old largest-row residual pass missed by 230,76 som.
    const rows = [
      row({ id: 'a', priceMinor: '10', quantity: '100000' }), // gross 1 000 000
      row({ id: 'b', priceMinor: '300000', quantity: '1' }), // gross 300 000
    ];
    const before = total(rows);
    const after = applied(rows, -100000n);
    expect(total(after)).toBe(before - 100000n);
  });

  it('all-coarse rows: lands on the closest representable total (review #1 scenario 2)', () => {
    // qty-1000000 row moves in 10 000-som steps; the qty-1 row absorbs what it
    // can (clamps at 0), the rest is genuinely unreachable — assert we get the
    // best representable outcome, not a silent half-application.
    const rows = [
      row({ id: 'a', priceMinor: '1', quantity: '1000000' }), // gross 1 000 000
      row({ id: 'b', priceMinor: '500000', quantity: '1' }), // gross 500 000
    ];
    const before = total(rows);
    const after = applied(rows, -750000n);
    const achieved = before - total(after);
    // b fully clamps (−500 000); a's step is 1 000 000 so the leftover 250 000
    // rounds to zero steps — closest representable is −500 000.
    expect(achieved).toBe(500000n);
  });

  it('ru decimal-comma quantities participate (review #3)', () => {
    const rows = [
      row({ id: 'a', priceMinor: '100000', quantity: '1,5' }),
      row({ id: 'b', priceMinor: '100000', quantity: '2' }),
    ];
    const patch = distributeAgreementDelta(rows, 50000n, false);
    expect(patch.size).toBeGreaterThan(0);
  });

  it('micro-quantity below money 6-dp resolution is not a carrier (review #4)', () => {
    const rows = [
      row({ id: 'tiny', priceMinor: '100000', quantity: '0.0000001' }),
      row({ id: 'b', priceMinor: '100000', quantity: '1' }),
    ];
    const patch = distributeAgreementDelta(rows, 10000n, false);
    expect(patch.has('tiny')).toBe(false);
    expect(patch.has('b')).toBe(true);
  });

  it('subtract beyond the document total clamps to the total (review #2)', () => {
    const rows = [row({ id: 'a', priceMinor: '1000' }), row({ id: 'b', priceMinor: '4000' })];
    const after = applied(rows, -900000n); // way beyond the 5 000-tiyin total
    expect(total(after)).toBe(0n); // exactly −total, not garbage
  });

  it('respects discount + VAT-on-top factors (total still lands on target)', () => {
    const rows = [
      row({ id: 'a', priceMinor: '10000000', discount: '10', vat: '12', vatEnabled: true }),
      row({ id: 'b', priceMinor: '5000000', vat: '12', vatEnabled: true }),
    ];
    const before = total(rows, false);
    const after = applied(rows, 500000n, false);
    const drift = total(after, false) - (before + 500000n);
    expect(drift <= 10n && drift >= -10n).toBe(true);
  });
});
