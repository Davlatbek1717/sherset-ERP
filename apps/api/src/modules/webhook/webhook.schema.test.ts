import { describe, expect, it } from 'vitest';
import {
  CreateWebhookSchema,
  UpdateWebhookSchema,
  WebhookDeliveryFilterSchema,
  WebhookDeliveryStatusSchema,
  WebhookFilterSchema,
} from './webhook.schema.js';

describe('CreateWebhookSchema', () => {
  const base = {
    entityType: 'customerorder' as const,
    action: ['CREATE', 'UPDATE'] as const,
    url: 'https://example.com/hook',
  };

  it('accepts valid CREATE+UPDATE webhook', () => {
    const r = CreateWebhookSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.entityType).toBe('customerorder');
      expect(r.data.action).toEqual(['CREATE', 'UPDATE']);
      expect(r.data.enabled).toBe(true);
      expect(r.data.diffType).toBe('NONE');
    }
  });

  it('rejects empty action array', () => {
    const r = CreateWebhookSchema.safeParse({ ...base, action: [] });
    expect(r.success).toBe(false);
  });

  it('rejects invalid url (ftp://)', () => {
    const r = CreateWebhookSchema.safeParse({ ...base, url: 'ftp://example.com/hook' });
    expect(r.success).toBe(false);
  });

  it('rejects unknown entityType', () => {
    const r = CreateWebhookSchema.safeParse({ ...base, entityType: 'unknownentity' });
    expect(r.success).toBe(false);
  });

  it('rejects unknown action value', () => {
    const r = CreateWebhookSchema.safeParse({ ...base, action: ['CREATE', 'SUBSCRIBE'] });
    expect(r.success).toBe(false);
  });

  it('rejects too-short secretHash (less than 8 chars)', () => {
    const r = CreateWebhookSchema.safeParse({ ...base, secretHash: 'short' });
    expect(r.success).toBe(false);
  });

  it('accepts secretHash with exactly 8 chars', () => {
    const r = CreateWebhookSchema.safeParse({ ...base, secretHash: '12345678' });
    expect(r.success).toBe(true);
  });

  it('accepts nullish secretHash', () => {
    const r = CreateWebhookSchema.safeParse({ ...base, secretHash: null });
    expect(r.success).toBe(true);
  });

  it('accepts all DELETE-only webhook', () => {
    const r = CreateWebhookSchema.safeParse({ ...base, action: ['DELETE'] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.action).toEqual(['DELETE']);
  });
});

describe('UpdateWebhookSchema', () => {
  it('accepts partial update (only enabled=false)', () => {
    const r = UpdateWebhookSchema.safeParse({ enabled: false });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.enabled).toBe(false);
    }
  });

  it('accepts partial update (only url)', () => {
    const r = UpdateWebhookSchema.safeParse({ url: 'https://new.example.com/hook' });
    expect(r.success).toBe(true);
  });

  it('accepts empty object (no-op update)', () => {
    const r = UpdateWebhookSchema.safeParse({});
    expect(r.success).toBe(true);
  });
});

describe('WebhookFilterSchema', () => {
  it('coerces limit string "50" to number 50', () => {
    const r = WebhookFilterSchema.safeParse({ limit: '50' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(50);
  });

  it('enforces limit max 1000', () => {
    const r = WebhookFilterSchema.safeParse({ limit: 1001 });
    expect(r.success).toBe(false);
  });

  it('uses defaults when no params provided', () => {
    const r = WebhookFilterSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.limit).toBe(100);
      expect(r.data.sortBy).toBe('createdAt');
      expect(r.data.sortDir).toBe('desc');
    }
  });

  it('accepts valid entityType filter', () => {
    const r = WebhookFilterSchema.safeParse({ entityType: 'product' });
    expect(r.success).toBe(true);
  });

  it('rejects invalid entityType filter', () => {
    const r = WebhookFilterSchema.safeParse({ entityType: 'foobar' });
    expect(r.success).toBe(false);
  });
});

describe('WebhookDeliveryStatusSchema', () => {
  it.each(['pending', 'sending', 'sent', 'dead'])('accepts %s', (s) => {
    expect(WebhookDeliveryStatusSchema.safeParse(s).success).toBe(true);
  });

  it('rejects unknown status', () => {
    expect(WebhookDeliveryStatusSchema.safeParse('processing').success).toBe(false);
  });
});

describe('WebhookDeliveryFilterSchema', () => {
  it('uses defaults when no params provided', () => {
    const r = WebhookDeliveryFilterSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.limit).toBe(50);
      expect(r.data.status).toBeUndefined();
    }
  });

  it('coerces limit string to number', () => {
    const r = WebhookDeliveryFilterSchema.safeParse({ limit: '25' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(25);
  });

  it('enforces limit max 500', () => {
    expect(WebhookDeliveryFilterSchema.safeParse({ limit: 501 }).success).toBe(false);
  });

  it('accepts valid status filter', () => {
    const r = WebhookDeliveryFilterSchema.safeParse({ status: 'dead' });
    expect(r.success).toBe(true);
  });

  it('rejects invalid cursor (not uuid)', () => {
    expect(WebhookDeliveryFilterSchema.safeParse({ cursor: 'not-a-uuid' }).success).toBe(false);
  });
});
