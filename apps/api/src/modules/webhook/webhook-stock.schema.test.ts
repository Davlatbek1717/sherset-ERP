import { describe, expect, it } from 'vitest';
import {
  CreateWebhookStockSchema,
  ReportTypeSchema,
  StockTypeSchema,
  UpdateWebhookStockSchema,
  WebhookStockFilterSchema,
} from './webhook-stock.schema.js';

describe('StockTypeSchema', () => {
  it.each(['STOCK', 'RESERVE', 'IN_TRANSIT'])('accepts %s', (s) => {
    expect(StockTypeSchema.safeParse(s).success).toBe(true);
  });

  it('rejects unknown stock type', () => {
    expect(StockTypeSchema.safeParse('AVAILABLE').success).toBe(false);
  });
});

describe('ReportTypeSchema', () => {
  it.each(['BY_PRODUCT', 'BY_STORE', 'COMBINED'])('accepts %s', (r) => {
    expect(ReportTypeSchema.safeParse(r).success).toBe(true);
  });

  it('rejects unknown report type', () => {
    expect(ReportTypeSchema.safeParse('BY_BRAND').success).toBe(false);
  });
});

describe('CreateWebhookStockSchema', () => {
  const base = {
    stockType: 'STOCK' as const,
    reportType: 'BY_PRODUCT' as const,
    reportUrl: 'https://example.com/stock-hook',
  };

  it('accepts a valid payload', () => {
    const r = CreateWebhookStockSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.enabled).toBe(true);
  });

  it('rejects invalid url (ftp://)', () => {
    expect(CreateWebhookStockSchema.safeParse({ ...base, reportUrl: 'ftp://x.com' }).success).toBe(
      false,
    );
  });

  it('rejects unknown stockType', () => {
    expect(CreateWebhookStockSchema.safeParse({ ...base, stockType: 'BACKORDER' }).success).toBe(
      false,
    );
  });
});

describe('UpdateWebhookStockSchema', () => {
  it('accepts partial update (only enabled)', () => {
    const r = UpdateWebhookStockSchema.safeParse({ enabled: false });
    expect(r.success).toBe(true);
  });
});

describe('WebhookStockFilterSchema', () => {
  it('coerces limit string to number', () => {
    const r = WebhookStockFilterSchema.safeParse({ limit: '20' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(20);
  });

  it('uses default limit when omitted', () => {
    const r = WebhookStockFilterSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(100);
  });
});
