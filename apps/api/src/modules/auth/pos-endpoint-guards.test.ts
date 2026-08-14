import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Ruxsat-dekoratori O'Z QO'RIQCHISISIZ = jim ochiq endpoint.
 *
 * REAL HODISA (2026-08-10, shu faza): `@RequireHrPermission('employees','full')`
 * `AuthController.pairPosDevice` ga qo'yildi, lekin `HrPermissionGuard`
 * **global emas** — u har controllerda `@UseGuards(...)` bilan ulanadi.
 * Natijada dekorator bezakka aylandi va istalgan kirgan foydalanuvchi (hatto
 * kiosk kassiri) kassa qurilmasi juftlay olardi. typecheck yashil, barcha
 * testlar yashil, hech narsa shikoyat qilmadi.
 *
 * `@RequirePermission` uchun bunday xavf yo'q — `PermissionsGuard` `APP_GUARD`
 * (permissions.module.ts).
 */
const API_SRC = join(process.cwd(), 'src');

/**
 * Manba matnidan izohlarni olib tashlaydi.
 *
 * NEGA: bu testning birinchi varianti izoh ichidagi «RequireHrPermission»
 * so'zini haqiqiy dekorator deb hisoblab YOLG'ON qizardi. Kod haqidagi
 * da'voni izoh matni hal qilmasligi kerak.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

function read(rel: string): string {
  return stripComments(readFileSync(join(API_SRC, rel), 'utf8'));
}

const authController = read('modules/auth/auth.controller.ts');

/**
 * Endpoint dekorator bloki: `@Post('x')` qatoridan metod IMZOSIGA qadar.
 *
 * Chegara «birinchi `{`» BO'LA OLMAYDI — `@RequirePermission({...})` ning o'zi
 * qavs ochadi va blok o'sha yerda kesilib qolardi (birinchi urinishda shunday
 * bo'ldi). Shuning uchun chegara — dekorator bo'lmagan birinchi qator, ya'ni
 * metod imzosi.
 */
function routeBlock(src: string, route: string): string {
  const lines = src.split('\n');
  const start = lines.findIndex((l) => l.includes(route));
  if (start < 0) throw new Error(`route topilmadi: ${route}`);

  const out: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i] ?? '';
    out.push(line);
    const trimmed = line.trim();
    if (trimmed === '') continue;
    // Dekorator qatorlari `@` bilan boshlanadi yoki oldingi dekoratorning
    // davomi (yopilmagan qavs). Birinchi metod imzosi — blok oxiri.
    if (!trimmed.startsWith('@') && /\w+\s*\(/.test(trimmed)) break;
  }
  return out.join('\n');
}

describe('kassa endpointlari — ruxsat qo`riqchisi haqiqatan ulangan', () => {
  it('qurilma juftlash endpointi ruxsat talab qiladi', () => {
    expect(routeBlock(authController, "@Post('pos-device/pair')")).toMatch(/@RequirePermission\(/);
  });

  it('qurilma juftlash `employee` `update` ruxsatini talab qiladi', () => {
    const block = routeBlock(authController, "@Post('pos-device/pair')");
    expect(block).toContain("entity: 'employee'");
    expect(block).toContain("action: 'update'");
  });

  it('qurilma juftlash JWT ham talab qiladi', () => {
    expect(routeBlock(authController, "@Post('pos-device/pair')")).toContain('JwtAuthGuard');
  });

  it('auth.controller `@RequireHrPermission` dekoratorini ISHLATMAYDI', () => {
    // Guard bu controllerda ulanmagan ⇒ dekorator jim bezak bo'lardi.
    // To'g'ri yo'l: endpointni HR controllerga ko'chirish yoki
    // `HrPermissionGuard` ni `@UseGuards` ga qo'shish.
    expect(authController).not.toMatch(/@RequireHrPermission\(/);
  });

  /**
   * ADMIN boshqa xodimga PIN qo'yish (2026-08-11 qo'shildi).
   *
   * Bu endpoint kassa hisobiga KIRISH yo'lini ochadi — qurilma juftlash bilan
   * bir xil daraja. Qo'riqchisiz qolsa istalgan kirgan foydalanuvchi (jumladan
   * kiosk kassiri) boshqa kassirning PIN'ini almashtirib, uning nomidan sotuv
   * qila olardi.
   */
  for (const route of [
    "@Post('pos-pin/employee/:employeeId')",
    "@Get('pos-pin/employee/:employeeId')",
  ]) {
    it(`${route} — JWT + employee ruxsatini talab qiladi`, () => {
      const block = routeBlock(authController, route);
      expect(block).toContain('JwtAuthGuard');
      expect(block).toMatch(/@RequirePermission\(/);
      expect(block).toContain("entity: 'employee'");
    });
  }

  it('admin PIN qo`yishi `update` (o`qish esa `view`) talab qiladi', () => {
    expect(routeBlock(authController, "@Post('pos-pin/employee/:employeeId')")).toContain(
      "action: 'update'",
    );
    expect(routeBlock(authController, "@Get('pos-pin/employee/:employeeId')")).toContain(
      "action: 'view'",
    );
  });

  it('O`ZIGA PIN qo`yish endpointi admin ruxsatini TALAB QILMAYDI', () => {
    // `POST pos-pin` (employeeId'siz) — har kim o'ziga qo'yadi. Bu ikkisi
    // ALOHIDA yo'l: adminlik shartini o'ziga-qo'yishga ham yoyib yubormaslik
    // kerak, aks holda kassir o'z PIN'ini almashtira olmay qolardi.
    // `routeBlock` faqat PASTGA qaraydi, shuning uchun bu endpointning
    // yuqorisidagi `@UseGuards(JwtAuthGuard)` blokka tushmaydi — JWT ni
    // alohida, aniq langar bilan tekshiramiz.
    const block = routeBlock(authController, "@Post('pos-pin')");
    expect(block).not.toContain('@RequirePermission');
    expect(authController).toMatch(/@UseGuards\(JwtAuthGuard\)\s*\n\s*@Post\('pos-pin'\)/);
  });

  it('PIN-kirish endpointi ATAYLAB tokensiz va ruxsatsiz', () => {
    const block = routeBlock(authController, "@Post('pos-login')");
    expect(block).not.toContain('@RequirePermission');
    expect(block).not.toContain('JwtAuthGuard');
  });

  /**
   * F7 — kassir almashtirish (spec §8). Ikkala endpoint JWT talab qiladi
   * (kiosk sharti va boshqa tekshiruvlar servisda), lekin `@RequirePermission`
   * ATAYLAB yo'q: kiosk kassirining ruxsat matritsasida employee-huquqlari
   * yo'q va bo'lmasligi kerak — bu endpointlar aynan shu kassir uchun.
   */
  for (const route of ["@Get('pos-pin/candidates')", "@Post('pos-pin/switch')"]) {
    it(`${route} — JWT talab qiladi, admin-ruxsat talab qilmaydi`, () => {
      const block = routeBlock(authController, route);
      expect(block).toContain('JwtAuthGuard');
      expect(block).not.toContain('@RequirePermission');
    });
  }

  it('nazorat: routeBlock haqiqatan tor kesadi (butun faylni emas)', () => {
    // Mutant-tekshiruv: agar kesish ishlamasa, pos-login bloki
    // pos-device/pair dekoratorini ham ushlardi va yuqoridagi test yolg'on
    // yashil bo'lardi.
    expect(routeBlock(authController, "@Post('pos-login')")).not.toContain('pos-device/pair');
  });
});

describe('nazorat: HrPermissionGuard global EMAS', () => {
  it('app.module APP_GUARD ro`yxatida HrPermissionGuard yo`q', () => {
    // Shu fakt yuqoridagi qoidaning sababi. O'zgarsa — qoidani qayta ko'rib chiq.
    const appModule = read('app.module.ts');
    expect(appModule).not.toContain('useClass: HrPermissionGuard');
  });

  it('HrPermissionGuard ishlatgan HR controller uni @UseGuards ga qo`shgan', () => {
    const hr = read('modules/hr/hr-employee/hr-employee.controller.ts');
    expect(hr).toContain('@UseGuards(JwtAuthGuard, HrPermissionGuard)');
  });
});
