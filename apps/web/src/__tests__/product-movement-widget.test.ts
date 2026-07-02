import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * B5 products/[id] «История» tab guard (2026-06-13).
 *
 * The audit-feed История was replaced with the captured moysklad 2-table layout
 * (Закупки + Продажи), fed by GET /reports/product-movement. Locks:
 *  1. the BE route + Zod query exist;
 *  2. the FE renders both tables with the 7 grounded columns in order, qty/1000,
 *     and a currency-suppressed Цена (the separate Валюта column carries the code);
 *  3. the old audit-feed (HistoryTimeline/useDocumentHistory) is GONE from the tab;
 *  4. the 11 new i18n keys exist in ru + uz.
 */

const WEB = (...p: string[]) => join(__dirname, '..', ...p);
const API = (...p: string[]) => join(__dirname, '..', '..', '..', 'api', 'src', 'modules', ...p);

const widget = readFileSync(WEB('components', 'product-detail-widget.tsx'), 'utf8');
const controller = readFileSync(API('report', 'report.controller.ts'), 'utf8');
const schema = readFileSync(API('report', 'report.schema.ts'), 'utf8');
const ru = JSON.parse(readFileSync(WEB('messages', 'ru.json'), 'utf8'));
const uz = JSON.parse(readFileSync(WEB('messages', 'uz.json'), 'utf8'));

describe('B5 История — product-movement backend wiring', () => {
  it('report controller exposes GET product-movement with the report permission', () => {
    expect(controller).toMatch(/@Get\('product-movement'\)/);
    expect(controller).toMatch(
      /@RequirePermission\(\{\s*entity:\s*'report',\s*action:\s*'view'\s*\}\)/,
    );
    expect(controller).toMatch(/productMovement\(user\.accountId/);
  });
  it('report schema validates the productId query', () => {
    expect(schema).toMatch(/ProductMovementQuerySchema/);
    expect(schema).toMatch(/productId:\s*uuid/);
  });
});

describe('B5 История — FE 2-table layout (Закупки + Продажи)', () => {
  it('fetches /reports/product-movement and renders both lists', () => {
    expect(widget).toMatch(/\/reports\/product-movement\?productId=/);
    expect(widget).toMatch(/t\('hist_purchases'\)/);
    expect(widget).toMatch(/t\('hist_sales'\)/);
  });
  it('renders the 7 grounded columns + qty/1000 + currency-suppressed price', () => {
    for (const k of [
      'hist_col_number',
      'hist_col_type',
      'hist_col_date',
      'hist_col_counterparty',
      'hist_col_qty',
      'hist_col_price',
      'hist_col_currency',
    ]) {
      expect(widget).toContain(`t('${k}')`);
    }
    expect(widget).toMatch(/Number\(row\.quantityMilli\)\s*\/\s*1000/);
    expect(widget).toMatch(
      /formatMoney\(BigInt\(row\.priceMinor\),\s*row\.currency,\s*\{\s*displayAs:\s*'none'\s*\}\)/,
    );
  });
  it('the old audit-feed (HistoryTimeline / useDocumentHistory) is removed', () => {
    expect(widget).not.toMatch(/HistoryTimeline/);
    expect(widget).not.toMatch(/useDocumentHistory/);
    expect(widget).not.toMatch(/useAuditLabels/);
  });
});

describe('B5 История — i18n parity', () => {
  const keys = [
    'hist_purchases',
    'hist_sales',
    'hist_col_number',
    'hist_col_type',
    'hist_col_date',
    'hist_col_counterparty',
    'hist_col_qty',
    'hist_col_price',
    'hist_col_currency',
    'hist_purchases_empty',
    'hist_sales_empty',
  ];
  for (const k of keys) {
    it(`${k} exists in ru + uz`, () => {
      expect(ru.product_detail_widget[k]).toBeTruthy();
      expect(uz.product_detail_widget[k]).toBeTruthy();
    });
  }
});
