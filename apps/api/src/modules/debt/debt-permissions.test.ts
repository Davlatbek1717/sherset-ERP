import { describe, expect, it } from 'vitest';
import {
  type PermissionAction,
  type PermissionEntity,
  SYSTEM_ROLE_TEMPLATES,
  scopeFromTemplate,
} from '../permissions/permissions.types.js';

/**
 * TZ §6 — «Cheklovlar va ruxsatlar» jadvalining MASHINA QULFI.
 *
 * TZ ning eng muhim xavfsizlik talabi: operator bilan kassir bir-birining
 * vazifasini BAJARA OLMASLIGI kerak («toki xodimlar bir-birining vazifasiga
 * tegishli bo'lmagan amalni bajarmasin»). Bu ekranda yashirish emas —
 * serverdagi RBAC bilan bloklanadi.
 *
 * Agar kimdir kelajakda rol shablonini o'zgartirsa va operatorga kassa
 * to'lovini ochib qo'ysa — shu test qizil bo'ladi.
 */

const OPERATOR = SYSTEM_ROLE_TEMPLATES.QarzOperatori;
const KASSIR = SYSTEM_ROLE_TEMPLATES.QarzKassiri;

/** TZ §6 jadvali: [entity, action, operator kutilgan, kassir kutilgan] */
const MATRIX: Array<[PermissionEntity, PermissionAction, boolean, boolean]> = [
  // Qarzdorlar ro'yxatini ko'rish — ikkalasi ham (✓ / ✓)
  ['debt', 'view', true, true],
  // Yangi qarz yaratish — operator ✗, kassir ✓
  ['debt', 'create', false, true],
  // Izoh / keyingi qo'ng'iroq vaqtini kiritish — ikkalasi ham (✓ / ✓)
  ['debt', 'update', true, true],
  // Naqd/terminal to'lov qabul qilish (kassada) — operator ✗, kassir ✓
  ['debtpayment', 'create', false, true],
  // Karta orqali (screenshot) to'lovni kiritish — operator ✓, kassir ✗
  ['debtcardpayment', 'create', true, false],
  // Kassirlar bo'yicha kunlik hisobotni ko'rish — operator ✓, kassir ✗
  ['debtreport', 'view', true, false],
];

const allowed = (
  tpl: typeof OPERATOR | typeof KASSIR,
  entity: PermissionEntity,
  action: PermissionAction,
): boolean => scopeFromTemplate(tpl, entity, action) !== 'NO';

describe('TZ §6 — qarz undirish ruxsat matritsasi', () => {
  for (const [entity, action, opExpected, kaExpected] of MATRIX) {
    it(`${entity}.${action} — operator: ${opExpected ? '✓' : '✗'} · kassir: ${kaExpected ? '✓' : '✗'}`, () => {
      expect(allowed(OPERATOR, entity, action)).toBe(opExpected);
      expect(allowed(KASSIR, entity, action)).toBe(kaExpected);
    });
  }

  // Bu ikki test — TZ ning yuragi. Ular buzilsa, rollar aralashib ketgan.
  it('OPERATOR kassa to‘lovini kirita OLMAYDI (§3.6 kassir vazifasi)', () => {
    expect(scopeFromTemplate(OPERATOR, 'debtpayment', 'create')).toBe('NO');
  });

  it('KASSIR screenshot to‘lovini kirita OLMAYDI (§3.7 operator vazifasi)', () => {
    expect(scopeFromTemplate(KASSIR, 'debtcardpayment', 'create')).toBe('NO');
  });

  it('KASSIR yangi qarz bera oladi, OPERATOR — yo‘q (§3.3)', () => {
    expect(scopeFromTemplate(KASSIR, 'debt', 'create')).not.toBe('NO');
    expect(scopeFromTemplate(OPERATOR, 'debt', 'create')).toBe('NO');
  });

  it('ikkala rol ham qarzni O‘CHIRA olmaydi (tarix saqlanadi)', () => {
    expect(scopeFromTemplate(OPERATOR, 'debt', 'delete')).toBe('NO');
    expect(scopeFromTemplate(KASSIR, 'debt', 'delete')).toBe('NO');
  });
});

describe('Administrator — §2: «Barcha bo‘limlarni ko‘radi, to‘liq huquq»', () => {
  const ADMIN = SYSTEM_ROLE_TEMPLATES.Administrator;

  it('barcha qarz amallariga ruxsati bor', () => {
    for (const [entity, action] of MATRIX) {
      expect(scopeFromTemplate(ADMIN, entity, action)).toBe('ALL');
    }
  });
});

describe('scopeFromTemplate — override mexanikasi', () => {
  it('override defaults ustidan yutadi', () => {
    // Operator defaults: create = NO. Override: debtcardpayment.create = ALL.
    expect(OPERATOR.defaults.create).toBe('NO');
    expect(scopeFromTemplate(OPERATOR, 'debtcardpayment', 'create')).toBe('ALL');
  });

  it('override yo‘q entity defaults‘ni oladi', () => {
    // Qarz rollari boshqa modullarda faqat ko'radi.
    expect(scopeFromTemplate(OPERATOR, 'product', 'view')).toBe('ALL');
    expect(scopeFromTemplate(OPERATOR, 'product', 'create')).toBe('NO');
    expect(scopeFromTemplate(KASSIR, 'customerorder', 'create')).toBe('NO');
  });
});
