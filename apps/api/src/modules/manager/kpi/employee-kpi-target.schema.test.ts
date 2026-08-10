import { describe, expect, it } from 'vitest';
import {
  CreateEmployeeKpiTargetSchema,
  ListAllKpiTargetsQuerySchema,
  MarkKpiTargetDoneSchema,
  UpdateEmployeeKpiTargetSchema,
} from './employee-kpi-target.schema.js';

/**
 * HTTP shartnomasi (KPI-02).
 *
 * `unit`/`currency` DTO'da ATAYLAB YO'Q — ular katalogdan olinadi. Agar
 * klient ularni yubora olsa, `money` qatoriga `currency: null` yozib DB
 * CHECK'iga urilardi yoki «5 dona UZS da» kabi qator paydo bo'lardi
 * ([[manager-kpi-unit-vocabularies]]).
 *
 * `targetValue` — **MATN**, `number` EMAS: JSON `number` katta summani
 * jimgina buzadi (`adjustValue` da o'rnatilgan naqsh).
 */

describe('CreateEmployeeKpiTargetSchema', () => {
  it('minimal qator: faqat metrika + davr (maqsad va og`irliksiz)', () => {
    const v = CreateEmployeeKpiTargetSchema.parse({ metricKey: 'cash_revenue', period: 'daily' });
    expect(v).toMatchObject({ metricKey: 'cash_revenue', period: 'daily' });
    expect(v.targetValue ?? null).toBeNull();
    expect(v.weight ?? null).toBeNull();
  });

  it('noma`lum davrni rad etadi', () => {
    expect(() =>
      CreateEmployeeKpiTargetSchema.parse({ metricKey: 'cash_revenue', period: 'yearly' }),
    ).toThrow();
  });

  it('`unit` va `currency` DTO`dan CHIQARIB tashlanadi (katalog g`olib)', () => {
    const v = CreateEmployeeKpiTargetSchema.parse({
      metricKey: 'cash_revenue',
      period: 'daily',
      unit: 'count',
      currency: 'USD',
    });
    expect(v).not.toHaveProperty('unit');
    expect(v).not.toHaveProperty('currency');
  });

  it('maqsad MATN — manfiy va harfli qiymat rad etiladi', () => {
    expect(() =>
      CreateEmployeeKpiTargetSchema.parse({
        metricKey: 'cash_revenue',
        period: 'daily',
        targetValue: '-5',
      }),
    ).toThrow();
    expect(() =>
      CreateEmployeeKpiTargetSchema.parse({
        metricKey: 'cash_revenue',
        period: 'daily',
        targetValue: '5 000',
      }),
    ).toThrow();
  });

  it('kasrli pul maqsadi qabul qilinadi (1234.56 so`m)', () => {
    expect(
      CreateEmployeeKpiTargetSchema.parse({
        metricKey: 'cash_revenue',
        period: 'daily',
        targetValue: '1234.56',
      }).targetValue,
    ).toBe('1234.56');
  });

  it('og`irlik 0…100 oralig`ida; tashqarisi rad etiladi', () => {
    expect(
      CreateEmployeeKpiTargetSchema.parse({
        metricKey: 'cash_revenue',
        period: 'daily',
        weight: 100,
      }).weight,
    ).toBe(100);
    expect(() =>
      CreateEmployeeKpiTargetSchema.parse({
        metricKey: 'cash_revenue',
        period: 'daily',
        weight: 101,
      }),
    ).toThrow();
  });

  it('🔴 og`irlik `null` — 0 ga aylanmaydi (ballashdan tashqarida)', () => {
    expect(
      CreateEmployeeKpiTargetSchema.parse({
        metricKey: 'cash_revenue',
        period: 'daily',
        weight: null,
      }).weight,
    ).toBeNull();
  });
});

describe('UpdateEmployeeKpiTargetSchema', () => {
  it('bo`sh patch ham yaroqli (hech narsa o`zgarmaydi)', () => {
    expect(UpdateEmployeeKpiTargetSchema.parse({})).toEqual({});
  });

  it('`metricKey` tahrirlanmaydi — DTO`dan chiqariladi', () => {
    // Kalit o'zgarsa qatorning tarixi (kunlik faktlar) uzilib qolardi.
    expect(UpdateEmployeeKpiTargetSchema.parse({ metricKey: 'boshqa' })).not.toHaveProperty(
      'metricKey',
    );
  });

  it('maqsadni `null` ga qaytarish mumkin (raqamsiz todo)', () => {
    expect(UpdateEmployeeKpiTargetSchema.parse({ targetValue: null }).targetValue).toBeNull();
  });
});

describe('MarkKpiTargetDoneSchema', () => {
  it('sukut bo`yicha `done: true`', () => {
    expect(MarkKpiTargetDoneSchema.parse({}).done).toBe(true);
  });

  it('bekor qilish uchun `done: false`', () => {
    expect(MarkKpiTargetDoneSchema.parse({ done: false }).done).toBe(false);
  });
});

describe('ListAllKpiTargetsQuerySchema', () => {
  it('bo`sh so`rov yaroqli', () => {
    expect(ListAllKpiTargetsQuerySchema.parse({})).toEqual({});
  });

  it('noma`lum davrni rad etadi', () => {
    expect(() => ListAllKpiTargetsQuerySchema.parse({ period: 'yearly' })).toThrow();
  });
});
