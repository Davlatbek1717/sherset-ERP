import { describe, expect, it } from 'vitest';
import { normalizePhone } from './eskiz.client.js';
import {
  ListSmsLogsSchema,
  SaveSmsConfigSchema,
  SendSmsSchema,
  SmsLogStatusSchema,
  SmsProviderSchema,
} from './sms.schema.js';

describe('SmsProviderSchema', () => {
  it.each(['eskiz', 'playmobile', 'custom'])('accepts %s', (p) => {
    expect(SmsProviderSchema.safeParse(p).success).toBe(true);
  });

  it('rejects unknown provider', () => {
    expect(SmsProviderSchema.safeParse('twilio').success).toBe(false);
  });
});

describe('SaveSmsConfigSchema', () => {
  it('accepts a minimal config (provider defaults to eskiz)', () => {
    const r = SaveSmsConfigSchema.safeParse({
      email: 'me@example.com',
      password: 'secret',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.provider).toBe('eskiz');
  });

  it('accepts senderId 4MB', () => {
    const r = SaveSmsConfigSchema.safeParse({
      email: 'me@example.com',
      password: 'x',
      senderId: '4MB',
    });
    expect(r.success).toBe(true);
  });

  it('rejects invalid email', () => {
    expect(SaveSmsConfigSchema.safeParse({ email: 'not-email', password: 'x' }).success).toBe(
      false,
    );
  });
});

describe('SendSmsSchema', () => {
  it('accepts a basic SMS', () => {
    const r = SendSmsSchema.safeParse({ toPhone: '+998901234567', body: 'Salom' });
    expect(r.success).toBe(true);
  });

  it('accepts non-+ phone', () => {
    expect(SendSmsSchema.safeParse({ toPhone: '998901234567', body: 'a' }).success).toBe(true);
  });

  it('rejects empty body', () => {
    expect(SendSmsSchema.safeParse({ toPhone: '+998901234567', body: '' }).success).toBe(false);
  });

  it('rejects body > 1600 chars', () => {
    expect(
      SendSmsSchema.safeParse({ toPhone: '+998901234567', body: 'a'.repeat(1601) }).success,
    ).toBe(false);
  });

  it('rejects phone with letters', () => {
    expect(SendSmsSchema.safeParse({ toPhone: '+998abc1234', body: 'x' }).success).toBe(false);
  });
});

describe('SmsLogStatusSchema', () => {
  it.each(['pending', 'sent', 'dead', 'failed'])('accepts %s', (s) => {
    expect(SmsLogStatusSchema.safeParse(s).success).toBe(true);
  });
});

describe('ListSmsLogsSchema', () => {
  it('uses default limit 50', () => {
    const r = ListSmsLogsSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(50);
  });

  it('rejects limit > 200', () => {
    expect(ListSmsLogsSchema.safeParse({ limit: 500 }).success).toBe(false);
  });
});

describe('normalizePhone', () => {
  it.each([
    ['+998901234567', '998901234567'],
    ['998-90-123-45-67', '998901234567'],
    ['+998 90 123 45 67', '998901234567'],
    ['998901234567', '998901234567'],
  ])('normalizes %s -> %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
});
