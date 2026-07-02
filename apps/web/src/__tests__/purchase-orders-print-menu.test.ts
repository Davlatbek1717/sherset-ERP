import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guard: the purchase-orders Печать dropdown carries the moysklad-parity
 * «Запросить форму» promo block, wired bilingually.
 *
 * Live ground-truth (online.moysklad.uz #purchaseorder, 2026-06-17): the
 * `print-popup-menu-bar` ends with a `print-custom-template-request-header`
 * («Запросить форму») + an explanatory subtitle + a «Как запросить» button.
 * Our static 4-item menu was missing it.
 *
 * The i18n message files are owned by a parallel session right now, so the
 * labels are LOCAL bilingual constants on this (non-i18n-gated) list page.
 * This guard locks that they stay bilingual (ru + uz, locale-driven) so a
 * later edit can't silently drop the uz branch or the block itself.
 */
const PO_PAGE = join(__dirname, '..', 'app', '(app)', 'purchase-orders', 'page.tsx');

describe('purchase-orders Печать «Запросить форму» block', () => {
  const src = readFileSync(PO_PAGE, 'utf8');

  it('wires the requestForm block into the printMenu', () => {
    expect(src).toContain('const printRequestForm');
    expect(src).toMatch(/requestForm:\s*printRequestForm/);
  });

  it('keeps the request-form labels bilingual (ru + uz), never ru-only', () => {
    expect(src).toContain('Запросить форму'); // ru — moysklad term
    expect(src).toContain("Forma so'rash"); // uz
    expect(src).toContain('Как запросить'); // ru button
    expect(src).toMatch(/locale === 'uz'/); // locale-driven selection
  });

  // Live-certified 2026-06-17: create template → /purchase-orders/print-forms
  // lists it → menu item renders → click prints via templateId (201 pdf).
  it('lists the account print-forms dynamically and prints via templateId', () => {
    expect(src).toContain("queryKey: ['purchase-order-print-forms']");
    expect(src).toContain('/purchase-orders/print-forms');
    expect(src).toMatch(/\(printForms \?\? \[\]\)\.map/); // dynamic items w/ empty fallback
    expect(src).toContain('const printSelected');
    expect(src).toMatch(/printSelected\(f\.id\)/); // per-template print
    expect(src).toMatch(/templateId \? \{ templateId \}/); // optional templateId in payload
  });
});
