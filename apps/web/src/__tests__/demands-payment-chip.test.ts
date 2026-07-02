import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * demands/[id] «Не оплачено» payment-chip lock (1:1 plan §2.3).
 *
 * The demand detail header was missing the payment-status chip moysklad shows,
 * even though the BE carries `payedSumMinor` (populated by the PaymentIn
 * cascade). The chip mirrors the invoices-out sibling (Badge tone="warning"
 * when not fully paid). Lock the wiring so it can't silently drop.
 */
const REPO = join(__dirname, '..', '..', '..', '..');
const src = readFileSync(join(REPO, 'apps/web/src/app/(app)/demands/[id]/page.tsx'), 'utf8');

describe('demands/[id] payment chip (1:1 §2.3)', () => {
  it('surfaces the «Не оплачено» badge computed from payedSumMinor', () => {
    expect(src).toMatch(/payedSumMinor: string/); // on the detail type
    expect(src).toMatch(/const paidBig = BigInt\(data\.payedSumMinor/);
    expect(src).toMatch(/const isPaid = sumBig > 0n && paidBig >= sumBig/);
    expect(src).toMatch(/detail-header-unpaid/);
    expect(src).toMatch(/pillsSlot=\{pillsSlot\}/);
  });
});
