import { describe, expect, it } from 'vitest';
import { computeStageEffectiveCost } from './processing.service.js';

/**
 * §117 / round-4 unit 3 — adversarial coverage of the moysklad
 * «Выполнение этапа производства» cost rule, NO database (§97 /
 * CLAUDE.md mandatory money/stock-QA). Money is BigInt tiyin; volume
 * & normo-hours are Decimal(≤6dp) strings, exact via micro-units.
 */
describe('computeStageEffectiveCost', () => {
  const base = {
    materialCostMinor: 0n,
    materialMarkupPercent: 0,
    enableHourAccounting: false,
    labourUnitCostMinor: 0n,
    standardHourCostMinor: 0n,
    standardHourUnit: '0',
    productionVolume: '1',
  };

  it('NO stage / all-zero ⇒ effective === material (byte-identical, zero-reg guarantee)', () => {
    const r = computeStageEffectiveCost({ ...base, materialCostMinor: 123_456n });
    expect(r.effectiveCostMinor).toBe(123_456n);
    expect(r.markupMinor).toBe(0n);
    expect(r.labourTotalMinor).toBe(0n);
  });

  it('material markup only: 100000 + 10% ⇒ +10000', () => {
    const r = computeStageEffectiveCost({
      ...base,
      materialCostMinor: 100_000n,
      materialMarkupPercent: 10,
    });
    expect(r.markupMinor).toBe(10_000n);
    expect(r.effectiveCostMinor).toBe(110_000n);
  });

  it('markup rounds half-up: 110 × 5% = 5.5 ⇒ 6', () => {
    const r = computeStageEffectiveCost({
      ...base,
      materialCostMinor: 110n,
      materialMarkupPercent: 5,
    });
    expect(r.markupMinor).toBe(6n);
  });

  it('fixed labour: 50000/unit × volume 3 ⇒ 150000', () => {
    const r = computeStageEffectiveCost({
      ...base,
      labourUnitCostMinor: 50_000n,
      productionVolume: '3',
    });
    expect(r.labourTotalMinor).toBe(150_000n);
    expect(r.effectiveCostMinor).toBe(150_000n);
  });

  it('hour accounting: standardHourCost 60000/hr × 2.5 hr/unit × volume 4 ⇒ 600000', () => {
    const r = computeStageEffectiveCost({
      ...base,
      enableHourAccounting: true,
      standardHourCostMinor: 60_000n,
      standardHourUnit: '2.5',
      productionVolume: '4',
    });
    expect(r.labourTotalMinor).toBe(600_000n);
  });

  it('hour accounting IGNORES fixed labourUnitCost (formula wins)', () => {
    const r = computeStageEffectiveCost({
      ...base,
      enableHourAccounting: true,
      standardHourCostMinor: 10_000n,
      standardHourUnit: '1',
      labourUnitCostMinor: 999_999n, // must be ignored
      productionVolume: '2',
    });
    expect(r.labourTotalMinor).toBe(20_000n);
  });

  it('all three combined sum exactly: material 100000 + 10% + labour 50000×2', () => {
    const r = computeStageEffectiveCost({
      ...base,
      materialCostMinor: 100_000n,
      materialMarkupPercent: 10,
      labourUnitCostMinor: 50_000n,
      productionVolume: '2',
    });
    expect(r.markupMinor).toBe(10_000n);
    expect(r.labourTotalMinor).toBe(100_000n);
    expect(r.effectiveCostMinor).toBe(210_000n);
  });

  it('fractional volume 2.5 (exact, no float drift)', () => {
    const r = computeStageEffectiveCost({
      ...base,
      labourUnitCostMinor: 100_000n,
      productionVolume: '2.5',
    });
    expect(r.labourTotalMinor).toBe(250_000n);
  });

  it('6-dp normo-hour exactness', () => {
    // 90000 tiyin/hr × 0.111111 hr/unit = 9999.99 → ½-up 10000; × vol 1
    const r = computeStageEffectiveCost({
      ...base,
      enableHourAccounting: true,
      standardHourCostMinor: 90_000n,
      standardHourUnit: '0.111111',
      productionVolume: '1',
    });
    expect(r.labourTotalMinor).toBe(10_000n);
  });

  it('zero volume ⇒ zero labour (no negative / no NaN)', () => {
    const r = computeStageEffectiveCost({
      ...base,
      materialCostMinor: 5_000n,
      labourUnitCostMinor: 99_999n,
      productionVolume: '0',
    });
    expect(r.labourTotalMinor).toBe(0n);
    expect(r.effectiveCostMinor).toBe(5_000n);
  });

  it('negative / garbage inputs clamp to 0 contribution (defensive)', () => {
    const r = computeStageEffectiveCost({
      ...base,
      materialCostMinor: -100n,
      materialMarkupPercent: -5,
      labourUnitCostMinor: -50n,
      productionVolume: 'NaN',
    });
    expect(r.markupMinor).toBe(0n);
    expect(r.labourTotalMinor).toBe(0n);
    expect(r.effectiveCostMinor).toBe(0n);
  });

  it('markup on 0 material ⇒ 0 (pure-labour op still produces effective)', () => {
    const r = computeStageEffectiveCost({
      ...base,
      materialCostMinor: 0n,
      materialMarkupPercent: 50,
      labourUnitCostMinor: 7_000n,
      productionVolume: '1',
    });
    expect(r.markupMinor).toBe(0n);
    expect(r.effectiveCostMinor).toBe(7_000n);
  });
});
