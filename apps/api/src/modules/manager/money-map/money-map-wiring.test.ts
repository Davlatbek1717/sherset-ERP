import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MK15 — DI SIMLARI qo'riqchisi.
 *
 * `MoneyMapService` to'rtta BEGONA modul servisini in'yeksiya qiladi. Hech bir
 * unit test DI grafini qurmaydi (servislar `new` bilan yaratiladi), typecheck
 * uchun esa `@Inject(X) private x: X` mutlaqo to'g'ri — ya'ni `imports` ga
 * modulni yozishni unutish FAQAT runtime'da, «API umuman ko'tarilmaydi»
 * ko'rinishida chiqadi (prod 502 klassi).
 *
 * `app-boot.test.ts` dagi in'yeksiya-premisasi qo'riqchisi bu yerda YORDAM
 * BERMAYDI: u servis bilan BIR PAPKAdagi `*.module.ts` ni qidiradi, `manager/
 * money-map/` esa ichki papka — moduli bir pog'ona yuqorida
 * (`manager/manager.module.ts`). Shu sababdan aynan shu simlar uchun alohida,
 * aniq qo'riqchi.
 *
 * Ikki tomon ham tekshiriladi: (1) iste'molchi modul kerakli modulni import
 * qiladi, (2) o'sha modul servisni HAQIQATAN eksport qiladi — eksportsiz
 * import ham runtime'da yiqiladi.
 */

const MODULES = path.join(process.cwd(), 'src', 'modules');
const read = (rel: string) => fs.readFileSync(path.join(MODULES, rel), 'utf8');

/** Servis → uni beradigan modul fayli. */
const WIRING = [
  { service: 'MoneyService', module: 'MoneyModule', file: 'money/money.module.ts' },
  {
    service: 'CounterpartyBalanceService',
    module: 'ReportModule',
    file: 'report/report.module.ts',
  },
  {
    service: 'DriverCashService',
    module: 'DriverTrackingModule',
    file: 'hr/driver-tracking/driver-tracking.module.ts',
  },
  { service: 'StockInTransitService', module: 'StockModule', file: 'stock/stock.module.ts' },
] as const;

/** `@Module({ … })` dekoratoridagi bitta massivning ichi. */
function moduleArray(src: string, key: 'imports' | 'exports' | 'providers'): string {
  const at = src.indexOf(`${key}: [`);
  if (at < 0) return '';
  const start = at + `${key}: [`.length;
  const end = src.indexOf(']', start);
  return src.slice(start, end);
}

describe('MK15 — MoneyMapService ning DI simlari', () => {
  const managerModule = read('manager/manager.module.ts');

  it.each(WIRING)('$module — ManagerModule uni import qiladi', ({ module }) => {
    expect(moduleArray(managerModule, 'imports')).toContain(module);
  });

  it.each(WIRING)('$module — $service ni EKSPORT qiladi', ({ service, file }) => {
    expect(moduleArray(read(file), 'exports')).toContain(service);
  });

  it('ManagerModule `MoneyMapService` ni provider sifatida beradi', () => {
    expect(moduleArray(managerModule, 'providers')).toContain('MoneyMapService');
  });

  it('ManagerModule `MoneyMapController` ni ro‘yxatdan o‘tkazadi', () => {
    expect(moduleArray(managerModule, 'controllers')).toContain('MoneyMapController');
  });

  it('servis AYNAN `report/` dagi CounterpartyBalanceService ni oladi', () => {
    // Repoda shu nomli IKKI klass bor: `report/counterparty-balance.service.ts`
    // (hisobot — `counterpartyBalanceReport` metodi bor) va
    // `counterparty-balance/counterparty-balance.service.ts` (yozuvchi qatlam).
    // Nest tokeni klass havolasi bo'lgani uchun noto'g'risini import qilish
    // typecheck'da ham, DI'da ham «to'g'ri» ko'rinadi-yu, metod topilmasdi.
    const svc = read('manager/money-map/money-map.service.ts');
    expect(svc).toContain("from '../../report/counterparty-balance.service.js'");
  });

  it('qo‘riqchi vakuum emas — simlar ro‘yxati bo‘sh qolmagan', () => {
    expect(WIRING.length).toBe(4);
    expect(moduleArray(managerModule, 'imports').length).toBeGreaterThan(0);
  });
});
