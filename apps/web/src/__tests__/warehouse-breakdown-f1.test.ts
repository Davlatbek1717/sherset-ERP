import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * F1 (docs/plans/2026-08-23-ombor-restrukturizatsiya.md) — qoldiq ko'rinishlari:
 * ombor-kesim, ma'lumot KO'CHIRILMAYDI. Regression-lock:
 *
 * 1) Tovar kartasi «Qoldiqlar» tabi ombor qatori ostida yacheykalar kesimini
 *    (prefiks bo'yicha «Ombor NN» guruhlab) va «yacheykalarga biriktirilmagan»
 *    qatorini ko'rsatadi — /reports/stock-balance/cells endpointidan.
 * 2) «Qoldiqlar» hisobotida prefiks bo'yicha guruhlash rejimi bor:
 *    Ombor 01 / Ombor 02 / Taqsimlanmagan / JAMI.
 * 3) Barcha yangi matnlar i18n orqali (ru+uz).
 */

const REPO = join(__dirname, '..', '..', '..', '..');
const widget = readFileSync(
  join(REPO, 'apps/web/src/components/product-detail-widget.tsx'),
  'utf8',
);
const reportPage = readFileSync(
  join(REPO, 'apps/web/src/app/(app)/reports/stock-balance/page.tsx'),
  'utf8',
);
const ru = JSON.parse(readFileSync(join(REPO, 'apps/web/src/messages/ru.json'), 'utf8')) as {
  product_detail_widget?: Record<string, string>;
  pages?: { report_stock_balance?: Record<string, unknown> };
};
const uz = JSON.parse(readFileSync(join(REPO, 'apps/web/src/messages/uz.json'), 'utf8')) as {
  product_detail_widget?: Record<string, string>;
  pages?: { report_stock_balance?: Record<string, unknown> };
};

describe('F1 — tovar kartasi «Qoldiqlar» tabida yacheykalar kesimi', () => {
  it('yangi endpointga ulangan', () => {
    expect(widget).toMatch(
      /\/reports\/stock-balance\/cells\?assortmentKind=product&assortmentId=\$\{productId\}/,
    );
  });

  it('prefiks-guruh, yacheyka va «biriktirilmagan» qatorlarini chizadi', () => {
    for (const id of ['stock-cell-group-row', 'stock-cell-row', 'stock-unassigned-row']) {
      expect(widget).toContain(`data-test-id="${id}"`);
    }
    expect(widget).toMatch(/stock_cells_warehouse/);
    expect(widget).toMatch(/stock_cells_unassigned/);
  });

  it('i18n kalitlari ru+uz da mavjud', () => {
    for (const key of [
      'stock_cells_warehouse',
      'stock_cells_no_prefix',
      'stock_cells_unassigned',
    ]) {
      expect(ru.product_detail_widget?.[key], `ru:${key}`).toBeTruthy();
      expect(uz.product_detail_widget?.[key], `uz:${key}`).toBeTruthy();
    }
  });
});

describe('F1 — «Qoldiqlar» hisobotida ombor-kesim (prefiks) rejimi', () => {
  it('groupBy=warehouse varianti va jadval/plitkalar mavjud', () => {
    expect(reportPage).toContain('option value="warehouse"');
    for (const id of [
      'warehouse-tiles',
      'warehouse-rows',
      'warehouse-row',
      'warehouse-unassigned-row',
      'warehouse-total-row',
    ]) {
      expect(reportPage).toContain(`data-test-id="${id}"`);
    }
  });

  it('CSV eksport ombor-kesimni qo`llaydi', () => {
    expect(reportPage).toMatch(/stock-balance-warehouses-/);
  });

  it('i18n kalitlari ru+uz da mavjud (shu jumladan groups.warehouse)', () => {
    for (const messages of [ru, uz]) {
      const ns = messages.pages?.report_stock_balance as
        | (Record<string, unknown> & { groups?: Record<string, string> })
        | undefined;
      expect(ns).toBeTruthy();
      for (const key of ['grand_total', 'no_prefix', 'sku_count', 'unassigned', 'warehouse_row']) {
        expect(ns?.[key], key).toBeTruthy();
      }
      expect(ns?.groups?.warehouse).toBeTruthy();
    }
  });
});
