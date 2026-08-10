import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Admin tomonidan kassirga PIN berish endpointlari.
 *
 * NEGA WIRING-TEST: `PosPinService` metodlarining o'zi
 * `pos-pin.service.test.ts` da qoplangan. Bu yerdagi xavf boshqa —
 * endpoint MAVJUDLIGI va TO'G'RI RUXSAT bilan ulanishi. Yetishmasa yoki
 * zaifroq ruxsat qo'yilsa typecheck yashil qoladi, hech narsa yiqilmaydi
 * (xotira: «DocumentEditor prop-drop», «yetim modul = o'lik funksiya»).
 *
 * Ruxsat `set-password` bilan AYNAN bir xil (`employees` `full`): PIN kassaga
 * kirish kaliti, undan zaifroq ruxsat parolni chetlab o'tish yo'li bo'lardi.
 */
const CONTROLLER = join(process.cwd(), 'src/modules/hr/hr-employee/hr-employee.controller.ts');
const MODULE = join(process.cwd(), 'src/modules/hr/hr-employee/hr-employee.module.ts');

const src = readFileSync(CONTROLLER, 'utf8');
const moduleSrc = readFileSync(MODULE, 'utf8');

/** Route dekoratori + imzosi (izohlarsiz, dekorator bo'lmagan qatorgacha). */
function routeBlock(route: string): string {
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const lines = clean.split('\n');
  const start = lines.findIndex((l) => l.includes(route));
  if (start < 0) throw new Error(`route topilmadi: ${route}`);
  const out: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i] ?? '';
    out.push(line);
    const trimmed = line.trim();
    if (trimmed === '') continue;
    if (!trimmed.startsWith('@') && /\w+\s*\(/.test(trimmed)) break;
  }
  return out.join('\n');
}

describe('admin POS PIN endpointlari', () => {
  it.each([
    ["@Get(':id/pos-pin')", 'holatni o`qish'],
    ["@Post(':id/pos-pin')", 'PIN berish'],
    ["@Delete(':id/pos-pin')", 'PIN o`chirish'],
  ])('%s mavjud (%s)', (route) => {
    expect(src).toContain(route);
  });

  it.each(["@Get(':id/pos-pin')", "@Post(':id/pos-pin')", "@Delete(':id/pos-pin')"])(
    '%s — `employees` `full` ruxsatini talab qiladi',
    (route) => {
      expect(routeBlock(route)).toContain("@RequireHrPermission('employees', 'full')");
    },
  );

  it('sinf darajasida HrPermissionGuard ulangan (dekorator bezak emas)', () => {
    expect(src).toContain('@UseGuards(JwtAuthGuard, HrPermissionGuard)');
  });

  it('set-password bilan bir xil ruxsat darajasi', () => {
    expect(routeBlock("@Post(':id/set-password')")).toContain(
      "@RequireHrPermission('employees', 'full')",
    );
  });

  it('modul AuthModule ni OSHKORA import qiladi (PosPinService shundan keladi)', () => {
    expect(moduleSrc).toContain('AuthModule');
  });

  it('nazorat: routeBlock tor kesadi', () => {
    expect(routeBlock("@Get(':id/pos-pin')")).not.toContain("@Delete(':id/pos-pin')");
  });
});
