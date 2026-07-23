import { describe, expect, it } from 'vitest';
import {
  COMPANY_SETTINGS_DEFAULTS,
  UpdateCompanySettingsSchema,
} from './company-settings.schema.js';

describe('UpdateCompanySettingsSchema (moysklad Настройки компании)', () => {
  it('accepts the full page payload', () => {
    const parsed = UpdateCompanySettingsSchema.parse({
      globalOperationNumbering: true,
      emailReplyMode: 'COMPANY',
      checkShippingStock: true,
      checkMinPrice: false,
      useRecycleBin: true,
      useConsignments: false,
      showPositionAttributes: true,
      accountCountry: 'uz',
    });
    expect(parsed.globalOperationNumbering).toBe(true);
    expect(parsed.accountCountry).toBe('UZ'); // uppercased
  });

  it('requires every page field (PUT writes full state, no partial merge)', () => {
    expect(UpdateCompanySettingsSchema.safeParse({ checkShippingStock: true }).success).toBe(false);
  });

  it('rejects an unknown reply mode and a bad country code', () => {
    const base = { ...COMPANY_SETTINGS_DEFAULTS };
    expect(UpdateCompanySettingsSchema.safeParse({ ...base, emailReplyMode: 'BOTH' }).success).toBe(
      false,
    );
    expect(UpdateCompanySettingsSchema.safeParse({ ...base, accountCountry: 'UZB' }).success).toBe(
      false,
    );
    expect(UpdateCompanySettingsSchema.safeParse({ ...base, accountCountry: '12' }).success).toBe(
      false,
    );
  });

  it('moysklad-parity virtual defaults: Запретить отгрузку OFF, корзина ON, доп. поля ON', () => {
    expect(COMPANY_SETTINGS_DEFAULTS.checkShippingStock).toBe(false);
    expect(COMPANY_SETTINGS_DEFAULTS.useRecycleBin).toBe(true);
    expect(COMPANY_SETTINGS_DEFAULTS.showPositionAttributes).toBe(true);
    expect(COMPANY_SETTINGS_DEFAULTS.globalOperationNumbering).toBe(false);
  });
});
