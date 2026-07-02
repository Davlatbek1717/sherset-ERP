import { describe, expect, it } from 'vitest';
import {
  CHANNEL_KINDS,
  CreateSalesChannelSchema,
  SalesChannelFilterSchema,
  UpdateSalesChannelSchema,
} from './sales-channel.schema.js';

const UUID = '00000000-0000-0000-0000-000000000001';

describe('CHANNEL_KINDS', () => {
  it('includes all 6 expected kinds', () => {
    expect(CHANNEL_KINDS).toContain('telegram');
    expect(CHANNEL_KINDS).toContain('instagram');
    expect(CHANNEL_KINDS).toContain('website');
    expect(CHANNEL_KINDS).toContain('marketplace_uzum');
    expect(CHANNEL_KINDS).toContain('marketplace_olcha');
    expect(CHANNEL_KINDS).toContain('custom');
    expect(CHANNEL_KINDS).toHaveLength(6);
  });
});

describe('CreateSalesChannelSchema', () => {
  it('parses a minimal valid channel', () => {
    const result = CreateSalesChannelSchema.parse({ name: "Mening do'konim", kind: 'telegram' });
    expect(result.name).toBe("Mening do'konim");
    expect(result.kind).toBe('telegram');
    expect(result.externalRef).toBeUndefined();
  });

  it('accepts all valid kinds', () => {
    for (const kind of CHANNEL_KINDS) {
      expect(() => CreateSalesChannelSchema.parse({ name: 'X', kind })).not.toThrow();
    }
  });

  it('rejects unknown kind', () => {
    expect(() => CreateSalesChannelSchema.parse({ name: 'X', kind: 'whatsapp' })).toThrow();
  });

  it('requires non-empty name', () => {
    expect(() => CreateSalesChannelSchema.parse({ name: '', kind: 'custom' })).toThrow();
  });

  it('coerces empty string externalRef to null', () => {
    const result = CreateSalesChannelSchema.parse({ name: 'X', kind: 'custom', externalRef: '' });
    expect(result.externalRef).toBeNull();
  });

  it('keeps non-empty externalRef', () => {
    const result = CreateSalesChannelSchema.parse({
      name: 'X',
      kind: 'telegram',
      externalRef: '@mybot',
    });
    expect(result.externalRef).toBe('@mybot');
  });

  it('accepts «Внешний код» (externalCode), distinct from externalRef', () => {
    const result = CreateSalesChannelSchema.parse({
      name: 'X',
      kind: 'telegram',
      externalCode: 'SC-EXT-1',
    });
    expect(result.externalCode).toBe('SC-EXT-1');
  });

  it('coerces empty string externalCode to null', () => {
    const result = CreateSalesChannelSchema.parse({
      name: 'X',
      kind: 'custom',
      externalCode: '',
    });
    expect(result.externalCode).toBeNull();
  });

  it('accepts settings as an object', () => {
    const result = CreateSalesChannelSchema.parse({
      name: 'X',
      kind: 'website',
      settings: { webhookUrl: 'https://example.com' },
    });
    expect(result.settings).toEqual({ webhookUrl: 'https://example.com' });
  });
});

describe('UpdateSalesChannelSchema', () => {
  it('allows partial update — all fields optional', () => {
    const result = UpdateSalesChannelSchema.parse({ name: 'New name', version: 1 });
    expect(result.name).toBe('New name');
    expect(result.kind).toBeUndefined();
    expect(result.archived).toBeUndefined();
  });

  it('accepts archived: true for archiving', () => {
    const result = UpdateSalesChannelSchema.parse({ archived: true, version: 1 });
    expect(result.archived).toBe(true);
  });

  it('rejects name as empty string', () => {
    expect(() => UpdateSalesChannelSchema.parse({ name: '' })).toThrow();
  });
});

describe('SalesChannelFilterSchema', () => {
  it('defaults limit to 50', () => {
    const result = SalesChannelFilterSchema.parse({});
    expect(result.limit).toBe(50);
  });

  it('parses archived as boolean string', () => {
    expect(SalesChannelFilterSchema.parse({ archived: 'true' }).archived).toBe(true);
    expect(SalesChannelFilterSchema.parse({ archived: 'false' }).archived).toBe(false);
  });

  it('accepts cursor as uuid', () => {
    const result = SalesChannelFilterSchema.parse({ cursor: UUID });
    expect(result.cursor).toBe(UUID);
  });

  it('rejects invalid cursor', () => {
    expect(() => SalesChannelFilterSchema.parse({ cursor: 'not-a-uuid' })).toThrow();
  });

  it('rejects unknown kind', () => {
    expect(() => SalesChannelFilterSchema.parse({ kind: 'fax' })).toThrow();
  });
});

/**
 * Optimistic-lock contract (moysklad parity, lost-update guard).
 *
 * Every sales-channel edit save must carry the `version` the form loaded so the
 * repository can reject a stale write with 409. The token is REQUIRED on Update
 * (so a forgetful caller can't silently bypass the lock) and ABSENT from Create
 * (a brand-new row has no prior version to conflict with).
 */
describe('UpdateSalesChannelSchema optimistic-lock version token', () => {
  it('requires version on update (a save without it is rejected, not silently unguarded)', () => {
    expect(UpdateSalesChannelSchema.safeParse({ name: 'X' }).success).toBe(false);
    expect(UpdateSalesChannelSchema.safeParse({ name: 'X', version: 1 }).success).toBe(true);
  });

  it('rejects a non-integer / negative version', () => {
    expect(UpdateSalesChannelSchema.safeParse({ name: 'X', version: 1.5 }).success).toBe(false);
    expect(UpdateSalesChannelSchema.safeParse({ name: 'X', version: -1 }).success).toBe(false);
    expect(UpdateSalesChannelSchema.safeParse({ name: 'X', version: '1' }).success).toBe(false);
  });

  it('CREATE schema does not require version (new rows have no prior version)', () => {
    expect(CreateSalesChannelSchema.safeParse({ name: 'X', kind: 'custom' }).success).toBe(true);
  });
});
