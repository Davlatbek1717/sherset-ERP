import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SALE_DEBT_TERM_DAYS,
  SALE_DEBT_TERM_DAYS_MAX,
  SALE_DEBT_TERM_DAYS_MIN,
} from '../debt/sale-debt-registry.js';
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
      // Q4 — Sherset qo'shimchasi; PUT to'liq sahifa holatini yozadi.
      saleDebtTermDays: 14,
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

/**
 * Q4 (2026-08-25) — SHERSET qo'shimchasi: kassa qarzining muddati.
 * Reja: `docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md` §Q4 vazifa 4.
 */
describe('Q4 — saleDebtTermDays (kassa qarzi muddati)', () => {
  const base = { ...COMPANY_SETTINGS_DEFAULTS };

  it('default — Q1 ning kod-defaulti (14), QAYTA yozilmaydi', () => {
    // Ikki nusxa ikki haqiqat bo'lardi: sof modul o'zgarsa ekran serverdan
    // boshqa son ko'rsatardi.
    expect(COMPANY_SETTINGS_DEFAULTS.saleDebtTermDays).toBe(DEFAULT_SALE_DEBT_TERM_DAYS);
    expect(COMPANY_SETTINGS_DEFAULTS.saleDebtTermDays).toBe(14);
  });

  it('🔴 `0` YAROQLI — «o`sha kuniyoq muddati keladi»', () => {
    const parsed = UpdateCompanySettingsSchema.parse({ ...base, saleDebtTermDays: 0 });
    expect(parsed.saleDebtTermDays).toBe(0);
  });

  it('chegara qiymatlari o`tadi (0…365)', () => {
    expect(
      UpdateCompanySettingsSchema.parse({ ...base, saleDebtTermDays: SALE_DEBT_TERM_DAYS_MIN })
        .saleDebtTermDays,
    ).toBe(SALE_DEBT_TERM_DAYS_MIN);
    expect(
      UpdateCompanySettingsSchema.parse({ ...base, saleDebtTermDays: SALE_DEBT_TERM_DAYS_MAX })
        .saleDebtTermDays,
    ).toBe(SALE_DEBT_TERM_DAYS_MAX);
  });

  it('manfiy / kasr / chegaradan tashqari qiymat RAD ETILADI', () => {
    for (const bad of [-1, 2.5, SALE_DEBT_TERM_DAYS_MAX + 1, Number.NaN]) {
      expect(
        UpdateCompanySettingsSchema.safeParse({ ...base, saleDebtTermDays: bad }).success,
      ).toBe(false);
    }
  });

  it('maydon MAJBURIY — PUT to`liq sahifa holatini yozadi (qisman merge yo`q)', () => {
    const { saleDebtTermDays, ...withoutTerm } = base;
    expect(UpdateCompanySettingsSchema.safeParse(withoutTerm).success).toBe(false);
  });

  it('ekrandan kelgan satr son sifatida qabul qilinadi (`coerce`)', () => {
    // `<input type="number">` ba'zan satr uzatadi — 400 bilan yiqilmasin.
    const parsed = UpdateCompanySettingsSchema.parse({ ...base, saleDebtTermDays: '21' });
    expect(parsed.saleDebtTermDays).toBe(21);
  });
});
