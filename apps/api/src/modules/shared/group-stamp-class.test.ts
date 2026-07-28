import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Class-lock for the H4 record-scope create-stamp (RFC `_H4-OWN-GROUP-SCOPE-RFC.md`).
 *
 * Every document/scoped-catalog service in the cohort must, at CREATE time,
 * resolve the creating employee's department group and stamp it onto the new
 * row's `groupId` (via the shared `resolveCreatorGroupId` helper). Read-only-
 * safe: no enforcement yet, so this only populates the column the future
 * OWN_GROUP `scopedWhere` check reads.
 *
 * Non-vacuous: before the stamp none of these services imported the helper or
 * set groupId at create (the column was always NULL).
 *
 * P1     = sales/purchase cohort (`ae1ce994`)
 * P1-cont= money + stock cohort (`1d49b5bc`) + contract (`b105bca4`)
 * batch-3= production / processing / retail / facture / payroll / loyalty /
 *          service-desk + scoped catalog (product / counterparty / project /
 *          folders / processing config). This file.
 */

const IMPORT = /import\s*\{\s*resolveCreatorGroupId\s*\}\s*from\s*'\.\.\/shared\/group-stamp\.js'/;
// actor is `userId` / `ownerId` / `cashierId` / `session.cashierId` — any identifier.
const RESOLVE =
  /const\s+creatorGroupId\s*=\s*await\s+resolveCreatorGroupId\(\s*this\.prisma\.client\s*,\s*accountId\s*,\s*[\w.]+\s*\)/;
const STAMP = /groupId:\s*creatorGroupId\b/;
// counterparty already exposes the «Доступ» group picker → default to the
// creator's group only when the user left it empty.
//
// MASTER-TODO #25: internal-order does the SAME thing but names its payload
// `data` rather than `parsed`, so the `parsed`-only pattern reported the stamp
// as missing when it is present (and in the stronger, user-choice-respecting
// form). Accept either receiver — what matters is «explicit group wins, creator
// group is the fallback», not the local variable name.
const COALESCE_STAMP = /groupId:\s*(?:parsed|data)\.groupId\s*\?\?\s*creatorGroupId\b/;
// product's create lives in product.repository.ts; the service coalesces the
// creator group into `parsed.groupId` (its «Отдел» field) as a NULL-only fallback
// before delegating, so the user-picked product group is never overwritten.
const PRODUCT_FALLBACK_STAMP = /parsed\.groupId\s*=\s*creatorGroupId\b/;

interface Spec {
  name: string;
  /** path relative to modules/ when it is not `${name}/${name}.service.ts` */
  file?: string;
  /** stamp matcher override (counterparty coalesces with the user-picked group) */
  stamp?: RegExp;
}

const SERVICES: Spec[] = [
  // P1 — sales/purchase cohort
  { name: 'demand' },
  { name: 'supply' },
  { name: 'customer-order' },
  { name: 'invoice-out' },
  { name: 'invoice-in' },
  { name: 'sales-return' },
  { name: 'purchase-return' },
  { name: 'purchase-order' },
  // P1-cont — money + stock cohort
  { name: 'cash-in' },
  { name: 'cash-out' },
  { name: 'payment-in' },
  { name: 'payment-out' },
  { name: 'prepayment' },
  { name: 'prepayment-return' },
  { name: 'counterparty-adjustment' },
  // Uses the coalesce form (`data.groupId ?? creatorGroupId`) — MASTER-TODO #25.
  { name: 'internal-order', stamp: COALESCE_STAMP },
  { name: 'move' },
  { name: 'enter' },
  { name: 'loss' },
  { name: 'inventory' },
  { name: 'contract' },
  // batch-3 — production / processing / retail / facture / payroll / service-desk
  { name: 'production' },
  { name: 'processing' },
  { name: 'processing-order' },
  { name: 'payroll' },
  { name: 'price-list' },
  { name: 'facture-out' },
  { name: 'facture-in' },
  { name: 'loyalty' },
  { name: 'service-request', file: 'service-desk/service-request.service.ts' },
  { name: 'retail-sale' },
  { name: 'cashier-session' },
  // batch-3 — scoped catalog
  { name: 'product', stamp: PRODUCT_FALLBACK_STAMP },
  { name: 'counterparty', stamp: COALESCE_STAMP },
  { name: 'project' },
  { name: 'product-folder' },
  { name: 'processing-process' },
  { name: 'processing-stage' },
];

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

for (const svc of SERVICES) {
  const rel = svc.file ?? `${svc.name}/${svc.name}.service.ts`;
  const SOURCE = stripComments(readFileSync(join(__dirname, '..', rel), 'utf8'));

  describe(`${svc.name} stamps the creator group at create (H4 class-lock)`, () => {
    it('imports the shared resolveCreatorGroupId helper', () => {
      expect(SOURCE).toMatch(IMPORT);
    });

    it('resolves the creator group from the actor before create', () => {
      expect(SOURCE).toMatch(RESOLVE);
    });

    it('stamps groupId onto the create data', () => {
      expect(SOURCE).toMatch(svc.stamp ?? STAMP);
    });
  });
}
