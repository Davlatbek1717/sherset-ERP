/**
 * MK29 — 10 rol shabloni (TZ §3.4) qulfi.
 *
 * Snapshot'lar bu yerda «o'zgarmasin» degani EMAS — ular o'zgarishni
 * KO'RINADIGAN qiladi. Shablon matritsasi jimgina siljishi (yangi entity
 * `defaults` orqali ochilib ketishi, DENY qatlami tushib qolishi) — aynan
 * shu faylning maqsadi.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isKioskAllowed } from '../auth/kiosk-policy.js';
import {
  PERMISSION_ACTIONS,
  PERMISSION_ENTITIES,
  type PermissionAction,
  type PermissionEntity,
} from './permissions.types.js';
import {
  ROLE_TEMPLATES,
  ROLE_TEMPLATE_SLUGS,
  type RoleTemplateSlug,
  isRoleTemplateSlug,
  resolveTemplateMatrix,
  scopeFor,
  summarizeTemplate,
} from './role-templates.js';

/** TZ §3.4 ro'yxati — AYNAN shu 10 ta, shu tartibda. */
const TZ_SLUGS: RoleTemplateSlug[] = [
  'owner',
  'admin',
  'sales_manager',
  'warehouse_manager',
  'cashier',
  'seller',
  'storekeeper',
  'accountant',
  'supplier',
  'driver',
];

describe('MK29 — rol shabloni registri', () => {
  it('TZ §3.4 dagi 10 shablon bor va tartibi bir xil', () => {
    expect(ROLE_TEMPLATE_SLUGS).toEqual(TZ_SLUGS);
  });

  it('har shablonning slug maydoni kalitiga mos (nusxa-ko‘chirish xatosi qulfi)', () => {
    for (const slug of ROLE_TEMPLATE_SLUGS) {
      expect(ROLE_TEMPLATES[slug].slug, `${slug} kaliti bilan slug mos emas`).toBe(slug);
    }
  });

  it('seedName va description bo‘sh emas', () => {
    for (const slug of ROLE_TEMPLATE_SLUGS) {
      expect(ROLE_TEMPLATES[slug].seedName.length).toBeGreaterThan(2);
      expect(ROLE_TEMPLATES[slug].description.length).toBeGreaterThan(5);
    }
  });

  it('seedName lar takrorlanmaydi (Role.accountId+name unikal)', () => {
    const names = ROLE_TEMPLATE_SLUGS.map((s) => ROLE_TEMPLATES[s].seedName);
    expect(new Set(names).size).toBe(names.length);
  });

  it('isRoleTemplateSlug faqat haqiqiy slug‘ni qabul qiladi', () => {
    expect(isRoleTemplateSlug('cashier')).toBe(true);
    expect(isRoleTemplateSlug('Administrator')).toBe(false);
    expect(isRoleTemplateSlug('__proto__')).toBe(false);
    expect(isRoleTemplateSlug(null)).toBe(false);
  });
});

describe('MK29 — matritsa to‘liqligi', () => {
  it.each(TZ_SLUGS)('%s: matritsa BUTUN olamni qoplaydi (NO katakchalar bilan)', (slug) => {
    const matrix = resolveTemplateMatrix(slug);
    expect(matrix).toHaveLength(PERMISSION_ENTITIES.length * PERMISSION_ACTIONS.length);
    // Har (entity, action) juftligi AYNAN bir marta.
    const keys = new Set(matrix.map((c) => `${c.entity}.${c.action}`));
    expect(keys.size).toBe(matrix.length);
  });

  it('to‘liq almashtirish shartnomasi: matritsada NO katakchalar ham bor', () => {
    // Shablonni qo'llash rol matritsasini TO'LIQ qayta yozadi. Agar bu yerda
    // faqat musbat katakchalar bo'lsa, eski roldagi ortiqcha ruxsat o'chmay
    // qolardi va «shablon qo'llandi» amali ruxsatni faqat KENGAYTIRARDI.
    const cashier = resolveTemplateMatrix('cashier');
    expect(cashier.some((c) => c.scope === 'NO')).toBe(true);
  });
});

describe('MK29 — sezgir yuza (DENY qatlami)', () => {
  const NON_ADMIN = TZ_SLUGS.filter((s) => s !== 'owner' && s !== 'admin');

  it.each(NON_ADMIN)('%s: rol matritsasiga (role) HECH QANDAY ruxsat yo‘q', (slug) => {
    // `role:update` = MK26 G1 hujum yo'li (o'ziga rol yozib admin bo'lish).
    // `role:view` esa ruxsat modelini ochadi.
    for (const action of PERMISSION_ACTIONS) {
      expect(scopeFor(ROLE_TEMPLATES[slug], 'role', action), `${slug}.role.${action}`).toBe('NO');
    }
  });

  it.each(NON_ADMIN)('%s: xodimga YOZISH huquqi yo‘q', (slug) => {
    for (const action of ['create', 'update', 'delete'] as PermissionAction[]) {
      expect(scopeFor(ROLE_TEMPLATES[slug], 'employee', action), `${slug}.employee.${action}`).toBe(
        'NO',
      );
    }
  });

  it.each(NON_ADMIN)('%s: HR entity‘lariga ruxsat yo‘q (ish haqi/davomat)', (slug) => {
    const hrEntities = PERMISSION_ENTITIES.filter((e) => e.startsWith('hr'));
    expect(hrEntities.length).toBeGreaterThan(10);
    for (const entity of hrEntities) {
      for (const action of PERMISSION_ACTIONS) {
        expect(scopeFor(ROLE_TEMPLATES[slug], entity, action), `${slug}.${entity}.${action}`).toBe(
          'NO',
        );
      }
    }
  });

  it('ish haqi (payroll) faqat ega/admin/buxgalterga ochiq', () => {
    const allowed = new Set<RoleTemplateSlug>(['owner', 'admin', 'accountant']);
    for (const slug of TZ_SLUGS) {
      const canSee = scopeFor(ROLE_TEMPLATES[slug], 'payroll', 'view') !== 'NO';
      expect(canSee, `${slug} payroll ko'ra oladimi`).toBe(allowed.has(slug));
    }
  });

  it('audit jurnali faqat ega/admin/buxgalterga ochiq', () => {
    const allowed = new Set<RoleTemplateSlug>(['owner', 'admin', 'accountant']);
    for (const slug of TZ_SLUGS) {
      const canSee = scopeFor(ROLE_TEMPLATES[slug], 'auditlog', 'view') !== 'NO';
      expect(canSee, `${slug} auditlog ko'ra oladimi`).toBe(allowed.has(slug));
    }
  });

  it("vazifalar ajratilishi: ombor menejeri va ta'minotchi pul hujjatiga tegmaydi", () => {
    // Xaridni ham, to'lovni ham bir odam bajarishi — klassik firibgarlik yo'li.
    for (const slug of ['warehouse_manager', 'supplier'] as RoleTemplateSlug[]) {
      for (const entity of ['paymentout', 'cashout', 'bankimport'] as PermissionEntity[]) {
        for (const action of PERMISSION_ACTIONS) {
          expect(
            scopeFor(ROLE_TEMPLATES[slug], entity, action),
            `${slug}.${entity}.${action}`,
          ).toBe('NO');
        }
      }
    }
  });
});

// ─── Kassir ↔ kiosk mosligi (DoD talabi) ────────────────────────────────────

/**
 * Kassir shabloni tegadigan entity → kiosk marshruti.
 * Yo'llar `@Controller(...)` dan tekshirilgan (2026-08-10).
 */
const KIOSK_ROUTE_BY_ENTITY: Partial<Record<PermissionEntity, string>> = {
  retailsale: '/retail-sales',
  cashiersession: '/cashier-sessions',
  product: '/products',
  productfolder: '/product-folders',
  pricetype: '/price-types',
  counterparty: '/counterparties',
  debt: '/debts',
  debtpayment: '/debts',
  cashout: '/cash-out',
  expenseitem: '/expense-items',
  currency: '/currencies',
  exchangerate: '/exchange-rates',
  settings: '/company-settings',
  customerorder: '/customer-orders',
};

/**
 * Entity darajasidagi xarita yetmaydigan holatlar — `entity.action` bo'yicha
 * ANIQ yo'l.
 *
 * F7 sababi: kassirning `customerorder.approve` ruxsati kiosk'da FAQAT
 * `POST /customer-orders/:id/transitions/confirmed` orqali yashaydi. Bazaviy
 * `/customer-orders` ga POST — zakaz YARATISH, va u ataylab yopiq. Ya'ni
 * entity xaritasidagi bitta yo'l bilan tekshirish bu yerda YOLG'ON javob
 * berardi (ikkala tomonga ham).
 */
const KIOSK_ROUTE_OVERRIDE: Record<string, string> = {
  'customerorder.approve':
    '/customer-orders/8f7d1c22-0000-4000-8000-000000000001/transitions/confirmed',
  // F9 sababi: kassirning `counterparty.update` ruxsati kiosk'da FAQAT
  // `PATCH /counterparties/:id/pos-contact` (telefon + izoh) orqali yashaydi.
  // Umumiy `PATCH /counterparties/:id` — to'liq karta — ataylab yopiq.
  'counterparty.update': '/counterparties/8f7d1c22-0000-4000-8000-000000000002/pos-contact',
};

const METHOD_BY_ACTION: Record<PermissionAction, string> = {
  view: 'GET',
  create: 'POST',
  update: 'PUT',
  delete: 'DELETE',
  approve: 'POST',
  print: 'POST',
};

/**
 * `entity.action` uchun ANIQ metod — `METHOD_BY_ACTION` soddalashtirishi
 * yetmaganda. (`update` odatda `PUT` deb modellangan, POS tor yo'li esa
 * `PATCH`.)
 */
const KIOSK_METHOD_OVERRIDE: Record<string, string> = {
  'counterparty.update': 'PATCH',
};

describe('MK29 — kassir shabloni kiosk cheklovi bilan mos (TZ §3.1)', () => {
  it('kassir — yagona kiosk shabloni', () => {
    for (const slug of TZ_SLUGS) {
      expect(ROLE_TEMPLATES[slug].uiMode, slug).toBe(slug === 'cashier' ? 'kiosk' : 'full');
    }
  });

  it('kassirga berilgan HAR katakcha kiosk marshrutida ham ochiq', () => {
    // Bu testning butun ma'nosi: «qog'ozda ruxsat bor, amalda KioskGuard
    // bloklaydi» holati sozlovchini adashtiradi — u ruxsatni to'g'ri qo'ygan
    // deb o'ylaydi, kassir esa 403 oladi.
    const violations: string[] = [];
    for (const { entity, action, scope } of resolveTemplateMatrix('cashier')) {
      if (scope === 'NO') continue;
      const route = KIOSK_ROUTE_OVERRIDE[`${entity}.${action}`] ?? KIOSK_ROUTE_BY_ENTITY[entity];
      if (!route) {
        violations.push(`${entity}.${action} — kiosk marshruti xaritada yo'q`);
        continue;
      }
      const method = KIOSK_METHOD_OVERRIDE[`${entity}.${action}`] ?? METHOD_BY_ACTION[action];
      if (!isKioskAllowed(method, route)) {
        violations.push(`${entity}.${action} → ${method} ${route} kiosk'da yopiq`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('kassir kassirlar hisobotini (debtreport) KO‘RMAYDI — qarz TZ §3.9', () => {
    for (const action of PERMISSION_ACTIONS) {
      expect(scopeFor(ROLE_TEMPLATES.cashier, 'debtreport', action)).toBe('NO');
    }
  });

  it('kassir savdo/ombor hujjatlariga umuman tegmaydi', () => {
    for (const entity of ['demand', 'supply', 'move', 'report'] as PermissionEntity[]) {
      for (const action of PERMISSION_ACTIONS) {
        expect(scopeFor(ROLE_TEMPLATES.cashier, entity, action), `${entity}.${action}`).toBe('NO');
      }
    }
  });

  /**
   * F7 — zakaz kassirga ochilgan YAGONA savdo hujjati, va faqat ikki amal
   * bilan. Bu test `customerorder` ni yuqoridagi «umuman tegmaydi» ro'yxatidan
   * chiqarishning narxi: aks holda kelasi faza jimgina `create`/`update` ni
   * ham qo'shib qo'yardi va hech narsa qizarmasdi.
   */
  it('kassir zakazni FAQAT ko‘radi va tasdiqlaydi (F7)', () => {
    expect(scopeFor(ROLE_TEMPLATES.cashier, 'customerorder', 'view')).toBe('ALL');
    expect(scopeFor(ROLE_TEMPLATES.cashier, 'customerorder', 'approve')).toBe('ALL');
    for (const action of ['create', 'update', 'delete', 'print'] as PermissionAction[]) {
      expect(
        scopeFor(ROLE_TEMPLATES.cashier, 'customerorder', action),
        `customerorder.${action}`,
      ).toBe('NO');
    }
  });
});

describe('MK29 — i18n yorliqlari (ru + uz)', () => {
  // Registr `apps/api` da, tarjimalar `apps/web` da — import yo'q, shuning
  // uchun fayl o'qiladi (`permissions-seed-sync.test.ts` bilan bir xil usul).
  // Bu qulfsiz yangi shablon interfeysda `roleTemplates.foo` bo'lib
  // ko'rinardi: i18n gate esa buni tutmaydi — u FAQAT `app/(app)` da
  // ISHLATILGAN kalitlarni tekshiradi, hali ishlatilmagan shablonni emas.
  const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..');
  const load = (loc: string) =>
    JSON.parse(readFileSync(join(REPO_ROOT, `apps/web/src/messages/${loc}.json`), 'utf8')) as {
      pages?: { roleTemplates?: Record<string, string> };
    };

  it.each(['ru', 'uz'])('%s: har shablonda nom va tavsif bor', (loc) => {
    const dict = load(loc).pages?.roleTemplates;
    expect(dict, `${loc}.json → pages.roleTemplates yo'q`).toBeDefined();
    const missing: string[] = [];
    for (const slug of ROLE_TEMPLATE_SLUGS) {
      if (!dict?.[slug]) missing.push(slug);
      if (!dict?.[`${slug}_desc`]) missing.push(`${slug}_desc`);
    }
    expect(missing).toEqual([]);
  });

  it('ru va uz kalitlari bir xil to‘plam (bir tomonda unutilgan kalit yo‘q)', () => {
    const ru = Object.keys(load('ru').pages?.roleTemplates ?? {}).sort();
    const uz = Object.keys(load('uz').pages?.roleTemplates ?? {}).sort();
    expect(uz).toEqual(ru);
  });

  it('yorliqlar tarjima qilingan — ru matni kirill harflarida', () => {
    // Nusxa-ko'chirishda o'zbekcha matn ru faylida qolib ketishi mumkin.
    const ru = load('ru').pages?.roleTemplates ?? {};
    const notCyrillic = ROLE_TEMPLATE_SLUGS.filter((s) => !/[А-Яа-яЁё]/.test(ru[s] ?? ''));
    expect(notCyrillic).toEqual([]);
  });
});

// ─── Snapshot: 10 ta (DoD «10/10 shablon testlangan») ───────────────────────

describe('MK29 — shablon matritsasi snapshot (10/10)', () => {
  it.each(TZ_SLUGS)('%s matritsasi', (slug) => {
    expect(summarizeTemplate(slug)).toMatchSnapshot();
  });
});
