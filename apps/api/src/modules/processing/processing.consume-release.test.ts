import { describe, expect, it } from 'vitest';
import { computeConsumeReleases } from './processing.service.js';

/**
 * §2c / round-4 — adversarial coverage of release-on-consume math,
 * NO database (§97 / CLAUDE.md mandatory stock-QA).
 *
 *   release[p] = min( Σ consumed[p], outstandingNet[p] )   (>0 only)
 */
describe('computeConsumeReleases', () => {
  const O = (productId: string, qty: string) => ({ productId, qty });

  it('consumed < reserved ⇒ release exactly the consumed amount', () => {
    expect(computeConsumeReleases([O('p1', '10')], [O('p1', '4')])).toEqual([
      { productId: 'p1', qty: '4' },
    ]);
  });

  it('consumed > reserved ⇒ release CAPPED at outstanding reserved', () => {
    expect(computeConsumeReleases([O('p1', '3')], [O('p1', '10')])).toEqual([
      { productId: 'p1', qty: '3' },
    ]);
  });

  it('consumed == reserved ⇒ release all (reservation fully fulfilled)', () => {
    expect(computeConsumeReleases([O('p1', '5')], [O('p1', '5')])).toEqual([
      { productId: 'p1', qty: '5' },
    ]);
  });

  it('product consumed but NOT reserved ⇒ no release (no over-release)', () => {
    expect(computeConsumeReleases([O('p1', '5')], [O('p2', '5')])).toEqual([]);
  });

  it('product reserved but NOT consumed ⇒ stays held (no release)', () => {
    expect(computeConsumeReleases([O('p1', '5')], [O('p2', '2')])).toEqual([]);
  });

  it('independent per-product min', () => {
    const r = computeConsumeReleases([O('p1', '10'), O('p2', '2')], [O('p1', '3'), O('p2', '9')]);
    expect(r).toContainEqual({ productId: 'p1', qty: '3' }); // min(3,10)
    expect(r).toContainEqual({ productId: 'p2', qty: '2' }); // min(9,2)
    expect(r).toHaveLength(2);
  });

  it('duplicate consumed lines for one product are aggregated before min', () => {
    // Σ consumed p1 = 7; reserved 5 ⇒ release min(7,5)=5
    expect(computeConsumeReleases([O('p1', '5')], [O('p1', '4'), O('p1', '3')])).toEqual([
      { productId: 'p1', qty: '5' },
    ]);
  });

  it('reservation net ≤ 0 ⇒ skipped (already released / never reserved)', () => {
    expect(
      computeConsumeReleases([O('p1', '0'), O('p2', '-3')], [O('p1', '2'), O('p2', '2')]),
    ).toEqual([]);
  });

  it('decimal exactness (6 dp, no float drift)', () => {
    expect(computeConsumeReleases([O('p1', '1.000001')], [O('p1', '0.999999')])).toEqual([
      { productId: 'p1', qty: '0.999999' },
    ]);
  });

  it('empty inputs ⇒ [] (inert — zero-regression when no reservation)', () => {
    expect(computeConsumeReleases([], [O('p1', '5')])).toEqual([]);
    expect(computeConsumeReleases([O('p1', '5')], [])).toEqual([]);
  });
});
