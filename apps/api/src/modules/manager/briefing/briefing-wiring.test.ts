import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MK19 — DI SIMLARI qo'riqchisi (`money-map-wiring.test.ts` naqshi).
 *
 * `DayBriefingService` OLTITA servisni in'yeksiya qiladi, ulardan uchtasi
 * BEGONA moduldan (`ReportService`, `ShiftAcceptanceService`,
 * `TelegramService`). Hech bir unit test DI grafini qurmaydi (servislar `new`
 * bilan yaratiladi), typecheck uchun esa `@Inject(X) private x: X` mutlaqo
 * to'g'ri — ya'ni `imports` ga modulni yozishni unutish FAQAT runtime'da,
 * «API umuman ko'tarilmaydi» ko'rinishida chiqadi (prod 502 klassi).
 *
 * `app-boot.test.ts` dagi in'yeksiya-premisasi qo'riqchisi bu yerda YORDAM
 * BERMAYDI: u servis bilan BIR PAPKAdagi `*.module.ts` ni qidiradi,
 * `manager/briefing/` esa ichki papka — moduli bir pog'ona yuqorida.
 *
 * Ikki tomon ham tekshiriladi: (1) iste'molchi modul kerakli modulni import
 * qiladi, (2) o'sha modul servisni HAQIQATAN eksport qiladi — eksportsiz
 * import ham runtime'da yiqiladi.
 */

const MODULES = path.join(process.cwd(), 'src', 'modules');
const read = (rel: string) => fs.readFileSync(path.join(MODULES, rel), 'utf8');

/** Servis → uni beradigan modul fayli. */
const WIRING = [
  { service: 'ReportService', module: 'ReportModule', file: 'report/report.module.ts' },
  {
    service: 'ShiftAcceptanceService',
    module: 'CashierSessionModule',
    file: 'cashier-session/cashier-session.module.ts',
  },
  { service: 'TelegramService', module: 'TelegramModule', file: 'telegram/telegram.module.ts' },
] as const;

/** `@Module({ … })` dekoratoridagi bitta massivning ichi. */
function moduleArray(
  src: string,
  key: 'imports' | 'exports' | 'providers' | 'controllers',
): string {
  const at = src.indexOf(`${key}: [`);
  if (at < 0) return '';
  const start = at + `${key}: [`.length;
  const end = src.indexOf(']', start);
  return src.slice(start, end);
}

describe('MK19 — DayBriefingService ning DI simlari', () => {
  const managerModule = read('manager/manager.module.ts');

  it.each(WIRING)('$module — ManagerModule uni import qiladi', ({ module }) => {
    expect(moduleArray(managerModule, 'imports')).toContain(module);
  });

  it.each(WIRING)('$module — $service ni EKSPORT qiladi', ({ service, file }) => {
    expect(moduleArray(read(file), 'exports')).toContain(service);
  });

  it('ManagerModule `DayBriefingService` ni provider sifatida beradi', () => {
    expect(moduleArray(managerModule, 'providers')).toContain('DayBriefingService');
  });

  it('ManagerModule `ManagerBriefingController` ni ro‘yxatdan o‘tkazadi', () => {
    expect(moduleArray(managerModule, 'controllers')).toContain('ManagerBriefingController');
  });

  it('menejer ichidagi uchta servis AYNI modulning provayderlari', () => {
    // `ManagerSlaService` / `DailyKpiAcceptanceService` / `ManagerInventoryService` /
    // `ManagerQueueService` — hammasi shu modulda. Biri olib tashlansa brifing
    // runtime'da yiqilardi, chunki ular ham `@Inject` bilan olinadi.
    for (const s of [
      'ManagerSlaService',
      'DailyKpiAcceptanceService',
      'ManagerInventoryService',
      'ManagerQueueService',
    ]) {
      expect(moduleArray(managerModule, 'providers')).toContain(s);
    }
  });

  it('qo‘riqchi vakuum emas — simlar ro‘yxati bo‘sh qolmagan', () => {
    expect(WIRING.length).toBe(3);
    expect(moduleArray(managerModule, 'imports').length).toBeGreaterThan(0);
  });
});
