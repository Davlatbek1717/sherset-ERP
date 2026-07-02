import { describe, expect, it } from 'vitest';
import {
  APP_CATALOG,
  APP_KEYS,
  AppKeySchema,
  InstallAppSchema,
  SaveConfigSchema,
} from './app-install.schema.js';

describe('APP_KEYS', () => {
  it('has exactly 6 keys', () => {
    expect(APP_KEYS).toHaveLength(6);
  });

  it('includes all expected keys', () => {
    expect(APP_KEYS).toContain('telegram_bot');
    expect(APP_KEYS).toContain('sms_eskiz');
    expect(APP_KEYS).toContain('webhook_export');
    expect(APP_KEYS).toContain('soliq_bot');
    expect(APP_KEYS).toContain('crm_amocrm');
    expect(APP_KEYS).toContain('analytics_metrika');
  });
});

describe('APP_CATALOG', () => {
  it('has exactly 6 entries matching APP_KEYS', () => {
    expect(APP_CATALOG).toHaveLength(6);
    const catalogKeys = APP_CATALOG.map((e) => e.appKey);
    for (const key of APP_KEYS) {
      expect(catalogKeys).toContain(key);
    }
  });

  it('every entry has iconEmoji, nameKey, descriptionKey', () => {
    for (const entry of APP_CATALOG) {
      expect(entry.iconEmoji).toBeTruthy();
      expect(entry.nameKey).toBeTruthy();
      expect(entry.descriptionKey).toBeTruthy();
    }
  });
});

describe('AppKeySchema', () => {
  it('accepts all valid keys', () => {
    for (const key of APP_KEYS) {
      expect(AppKeySchema.parse(key)).toBe(key);
    }
  });

  it('rejects unknown key', () => {
    expect(() => AppKeySchema.parse('whatsapp')).toThrow();
    expect(() => AppKeySchema.parse('')).toThrow();
    expect(() => AppKeySchema.parse('TELEGRAM_BOT')).toThrow();
  });
});

describe('InstallAppSchema', () => {
  it('parses a valid install request', () => {
    const r = InstallAppSchema.parse({ appKey: 'telegram_bot' });
    expect(r.appKey).toBe('telegram_bot');
    expect(r.config).toBeUndefined();
  });

  it('accepts optional config', () => {
    const r = InstallAppSchema.parse({ appKey: 'sms_eskiz', config: { apiKey: 'abc' } });
    expect(r.config).toEqual({ apiKey: 'abc' });
  });

  it('rejects invalid appKey', () => {
    expect(() => InstallAppSchema.parse({ appKey: 'unknown_app' })).toThrow();
  });

  it('rejects missing appKey', () => {
    expect(() => InstallAppSchema.parse({})).toThrow();
  });
});

describe('SaveConfigSchema', () => {
  it('parses an object config', () => {
    const r = SaveConfigSchema.parse({ config: { token: 'xyz', chatId: '12345' } });
    expect(r.config).toEqual({ token: 'xyz', chatId: '12345' });
  });

  it('accepts null config (clear config)', () => {
    const r = SaveConfigSchema.parse({ config: null });
    expect(r.config).toBeNull();
  });

  it('rejects missing config field', () => {
    expect(() => SaveConfigSchema.parse({})).toThrow();
  });
});
