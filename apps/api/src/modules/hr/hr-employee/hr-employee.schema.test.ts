import { describe, expect, it } from 'vitest';
import {
  CreateHrEmployeeSchema,
  HrEmployeeFilterSchema,
  SetEmployeeImageSchema,
  SetPasswordSchema,
  UpdateHrEmployeeSchema,
} from './hr-employee.schema.js';

describe('HR Employee Zod schemas', () => {
  it('CreateHrEmployee requires name', () => {
    expect(() => CreateHrEmployeeSchema.parse({ name: '' })).toThrow();
  });

  it('telegramPhone accepts +998 format', () => {
    const parsed = CreateHrEmployeeSchema.parse({ name: 'X', telegramPhone: '+998901234567' });
    expect(parsed.telegramPhone).toBe('+998901234567');
  });

  it('telegramPhone rejects invalid format', () => {
    expect(() => CreateHrEmployeeSchema.parse({ name: 'X', telegramPhone: 'abc' })).toThrow();
  });

  it('hrRoles defaults to empty array', () => {
    const parsed = CreateHrEmployeeSchema.parse({ name: 'X' });
    expect(parsed.hrRoles).toEqual([]);
  });

  it('isChecker defaults to false', () => {
    const parsed = CreateHrEmployeeSchema.parse({ name: 'X' });
    expect(parsed.isChecker).toBe(false);
  });

  it('SetPassword rejects too-short password', () => {
    expect(() => SetPasswordSchema.parse({ username: 'ozod', password: '123' })).toThrow(/4 belgi/);
  });

  // Owner 2026-07-19 (second report): the login is FREE-FORM — «xodim o'zi
  // xohlagan loginni erkin kirita olishi kerak». Only the technical minimum
  // remains: non-empty after trim, ≤50 chars (the DB column is VarChar(50);
  // longer values would P2000 into a raw 500). Uniqueness is enforced by the
  // partial DB index + mapped to a field-level 409.
  it('SetPassword accepts free-form logins (moysklad-style @, cyrillic, dots, spaces inside)', () => {
    for (const goodLogin of [
      'omborchi01@climart_santex_group',
      'ivan.petrov@climart_santex_group',
      'омборчи',
      'boymurod aka',
      'x',
      'Логин-2024',
    ]) {
      expect(SetPasswordSchema.parse({ username: goodLogin, password: 'abcd' }).username).toBe(
        goodLogin,
      );
    }
  });

  it('SetPassword trims surrounding whitespace and rejects empty/too-long usernames', () => {
    expect(SetPasswordSchema.parse({ username: '  ozod  ', password: 'abcd' }).username).toBe(
      'ozod',
    );
    expect(() => SetPasswordSchema.parse({ username: '   ', password: 'abcd' })).toThrow();
    expect(() => SetPasswordSchema.parse({ username: 'a'.repeat(51), password: 'abcd' })).toThrow(
      /50/,
    );
  });

  it('Filter coerces page/limit to numbers', () => {
    const parsed = HrEmployeeFilterSchema.parse({ page: '2', limit: '20' });
    expect(parsed.page).toBe(2);
    expect(parsed.limit).toBe(20);
  });

  // Owner-reported 2026-07-17: `?archived=false` showed the ARCHIVED list —
  // z.coerce.boolean() runs Boolean('false') → true. Locked to a real parser.
  it('Filter: archived="false" means ACTIVE list (not Boolean coercion)', () => {
    expect(HrEmployeeFilterSchema.parse({ archived: 'false' }).archived).toBe(false);
    expect(HrEmployeeFilterSchema.parse({ archived: 'true' }).archived).toBe(true);
    expect(HrEmployeeFilterSchema.parse({}).archived).toBe(false);
    expect(HrEmployeeFilterSchema.parse({ archived: true }).archived).toBe(true);
  });

  it('Filter: isChecker="false" parses to false too', () => {
    expect(HrEmployeeFilterSchema.parse({ isChecker: 'false' }).isChecker).toBe(false);
  });
});

describe('moysklad employee-card fields (Настройки → Сотрудники, 2026-07-16)', () => {
  it('accepts the full card payload', () => {
    const parsed = CreateHrEmployeeSchema.parse({
      name: 'Бекзод Н',
      lastName: 'Бекзод',
      firstName: 'Н',
      middleName: '',
      position: 'Кассир',
      salaryMinor: '150000000',
      inn: '123456789',
      description: 'test',
      groupId: '8f7cb209-fd7b-41ef-8a80-05f40025cbe1',
      loginAllowed: false,
      allowedIps: ['192.168.1.10'],
      allowedNetworks: ['10.0.0.0/8'],
      notifications: { customer_orders: { enabled: true, web: true, phone: false } },
    });
    expect(parsed.lastName).toBe('Бекзод');
    expect(parsed.salaryMinor).toBe('150000000');
    expect(parsed.loginAllowed).toBe(false);
    expect(parsed.allowedNetworks).toEqual(['10.0.0.0/8']);
  });

  it('salaryMinor coerces numbers to the string wire format', () => {
    const parsed = CreateHrEmployeeSchema.parse({ name: 'X', salaryMinor: 5000 });
    expect(parsed.salaryMinor).toBe('5000');
  });

  it('salaryMinor rejects negatives and non-integers', () => {
    expect(CreateHrEmployeeSchema.safeParse({ name: 'X', salaryMinor: '-5' }).success).toBe(false);
    expect(CreateHrEmployeeSchema.safeParse({ name: 'X', salaryMinor: '1.5' }).success).toBe(false);
  });

  it('allowedIps rejects a CIDR entry (that belongs in allowedNetworks)', () => {
    expect(
      CreateHrEmployeeSchema.safeParse({ name: 'X', allowedIps: ['10.0.0.0/8'] }).success,
    ).toBe(false);
  });

  it('allowedNetworks rejects a bare IP (no /prefix)', () => {
    expect(
      CreateHrEmployeeSchema.safeParse({ name: 'X', allowedNetworks: ['10.0.0.1'] }).success,
    ).toBe(false);
  });

  it('update stays partial: card fields optional, version still required', () => {
    expect(UpdateHrEmployeeSchema.safeParse({ version: 2, loginAllowed: true }).success).toBe(true);
    expect(UpdateHrEmployeeSchema.safeParse({ loginAllowed: true }).success).toBe(false);
  });
});

describe('SetEmployeeImageSchema (карточка «Изображение», 2026-07-17)', () => {
  it('accepts a data-url payload', () => {
    const parsed = SetEmployeeImageSchema.parse({
      filename: 'photo.png',
      mime: 'image/png',
      dataBase64: 'data:image/png;base64,iVBORw0KGgo=',
    });
    expect(parsed.mime).toBe('image/png');
  });

  it('rejects non-image mime and oversized payloads', () => {
    expect(
      SetEmployeeImageSchema.safeParse({
        filename: 'x.pdf',
        mime: 'application/pdf',
        dataBase64: 'aaaa',
      }).success,
    ).toBe(false);
    expect(
      SetEmployeeImageSchema.safeParse({
        filename: 'big.png',
        mime: 'image/png',
        dataBase64: 'a'.repeat(6_000_001),
      }).success,
    ).toBe(false);
  });
});

describe('UpdateHrEmployeeSchema — optimistic-lock contract (2026-06-08i)', () => {
  // The Employee row is editable from THREE forms (/hr/employees, /analitika/staff,
  // /auth/me); the PUT must round-trip the loaded version or the lost-update guard
  // is silently bypassable. version is REQUIRED on update, absent on create.
  it('REQUIRES version — a field edit cannot bypass the lock', () => {
    expect(UpdateHrEmployeeSchema.safeParse({ name: 'X' }).success).toBe(false);
    expect(UpdateHrEmployeeSchema.safeParse({ department: 'Sales' }).success).toBe(false);
  });

  it('accepts a version + partial fields', () => {
    const r = UpdateHrEmployeeSchema.safeParse({ version: 4, name: 'X' });
    if (!r.success) throw r.error;
    expect(r.data.version).toBe(4);
    expect(r.data.name).toBe('X');
  });

  it('rejects a negative version', () => {
    expect(UpdateHrEmployeeSchema.safeParse({ version: -1, name: 'X' }).success).toBe(false);
  });

  it('Create has NO version field (version starts at 1 server-side)', () => {
    const parsed = CreateHrEmployeeSchema.parse({ name: 'X' });
    expect('version' in parsed).toBe(false);
  });
});

describe('telegramPhone — ajratgichli formatlar (2026-08-21)', () => {
  /**
   * 🔴 Nosozlik: sxemadagi qat'iy `^\+?[0-9]{9,15}$` regex'i BIRINCHI ishlardi,
   * servisdagi `normalizeTelegramPhone()` esa probel/tire/qavsni tozalash
   * uchun ATAYLAB yozilgan edi — lekin unga navbat hech qachon yetmasdi.
   * Natija: «+998 90 123 45 67» deb yozgan foydalanuvchi 400 olardi, garchi
   * tizimda o'sha formatni tushunadigan kod bor bo'lsa ham.
   * Endi sxema avval ajratgichlarni tozalaydi, keyin shaklni tekshiradi.
   */
  it('probel / tire / qavs bilan yozilgan raqamni qabul qiladi va tozalaydi', () => {
    for (const raw of ['+998 90 123 45 67', '90-123-45-67', '(90) 123 45 67']) {
      const parsed = CreateHrEmployeeSchema.parse({ name: 'X', telegramPhone: raw });
      expect(parsed.telegramPhone, raw).toMatch(/^\+?[0-9]{9,15}$/);
    }
  });

  it("harfli qiymat AVVALGIDEK rad etiladi (bo'shashib ketmadi)", () => {
    expect(() => CreateHrEmployeeSchema.parse({ name: 'X', telegramPhone: 'abc' })).toThrow();
    expect(() => CreateHrEmployeeSchema.parse({ name: 'X', telegramPhone: '12' })).toThrow();
  });
});
