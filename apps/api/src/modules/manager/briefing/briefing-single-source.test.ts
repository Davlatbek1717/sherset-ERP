import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EVENING_BLOCK_KEYS, MORNING_BLOCK_KEYS } from './day-briefing.js';

/**
 * MK19 — «BARCHA RAQAMLAR MAVJUD SERVISLARDAN» qo'riqchisi (rejadagi 3-test).
 *
 * Brifingning butun qiymati bitta va'daga tayanadi: **bu ekrandagi raqam
 * boshqa ekrandagi raqam bilan bir xil**. Uni buzish uchun yovuz niyat kerak
 * emas — «shu yerda bitta `prisma.demand.aggregate` qilib qo'ya qolay» degan
 * bir satr yetadi. Undan keyin bugungi tushum brifingda bir xil, dashboardda
 * boshqa xil bo'ladi va qaysi biri to'g'riligini hech kim bilmaydi.
 *
 * Na typecheck, na unit testlar buni tutadi (ikkala yo'l ham «ishlaydi»),
 * shuning uchun manba-skan (`money-map-single-source.test.ts` naqshi).
 */

const BRIEFING_DIR = path.join(process.cwd(), 'src', 'modules', 'manager', 'briefing');

/** Izohlar skanerdan olib tashlanadi — repo konventsiyasi. */
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function sources(): Array<{ file: string; src: string }> {
  return fs
    .readdirSync(BRIEFING_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.test.ts'))
    .map((e) => ({
      file: e.name,
      src: stripComments(fs.readFileSync(path.join(BRIEFING_DIR, e.name), 'utf8')),
    }));
}

const service = () => sources().find((s) => s.file === 'day-briefing.service.ts')?.src ?? '';

describe('MK19 — brifing o‘z hisobini yozmaydi', () => {
  it('skanerlanadigan fayl bor (skan bo‘shliqqa qarab yashil bo‘lib qolmasin)', () => {
    expect(
      sources()
        .map((s) => s.file)
        .sort(),
    ).toEqual([
      'day-briefing.service.ts',
      'day-briefing.ts',
      'manager-briefing.controller.ts',
      'manager-briefing.schema.ts',
    ]);
  });

  it('hujjat/qoldiq Prisma modellariga TO‘G‘RIDAN-TO‘G‘RI tegmaydi', () => {
    // Ruxsat etilgan YAGONA ikki model — Telegram sozlamasi va outbox: ular
    // raqam MANBASI emas, yuborish kanalining o'zi.
    const used = [...service().matchAll(/prisma\.client\.(\w+)/g)].map((m) => m[1]);
    expect([...new Set(used)].sort()).toEqual(['telegramConfig', 'telegramOutbox']);
  });

  it('`$queryRaw` ishlatmaydi', () => {
    for (const { file, src } of sources()) {
      expect(/\$queryRaw|\$executeRaw/.test(src), `${file} xom SQL yozyapti`).toBe(false);
    }
  });

  it('sof modul PRISMA/NEST/soatga tegmaydi', () => {
    const pure = sources().find((s) => s.file === 'day-briefing.ts')?.src ?? '';
    expect(pure).not.toMatch(/prisma|@nestjs|Date\.now\(\)|new Date\(\)/);
  });

  it('o‘z valyuta konvertatsiyasini yozmaydi', () => {
    // `rateValue` ×10^8 ni qo'lda ko'paytirish = Faza 17 shartnomasini chetlab
    // o'tish. Tushum `ReportService` da allaqachon bazaga keltirilgan.
    for (const { file, src } of sources()) {
      expect(/rateValue|multiplicity|100_000_000n|consolidateToBase/.test(src), `${file}`).toBe(
        false,
      );
    }
  });

  it('o‘z sifat bayrog‘i satrlarini yozmaydi — faqat `data-quality` moduli', () => {
    for (const { file, src } of sources()) {
      expect(/'(complete|partial|uncollected)'/.test(src), `${file}`).toBe(false);
    }
  });

  it('har blok kaliti servisda o‘qiladi (o‘qilmagan blok qolmasin)', () => {
    // Blok javobga tushmasa ekranda jimgina yo'qolardi va bo'sh joy
    // «muammo yo'q» bo'lib o'qilardi.
    for (const key of [...MORNING_BLOCK_KEYS, ...EVENING_BLOCK_KEYS]) {
      expect(service().includes(`'${key}'`), `'${key}' bloki servisda yo'q`).toBe(true);
    }
  });

  it('MAVJUD servislarning aynan o‘sha metodlari chaqiriladi', () => {
    for (const call of [
      'this.sla.board',
      'this.acceptance.queue',
      'this.inventory.stockSignals',
      'this.reports.salesReport',
      'this.shifts.queue',
      'this.queue.list',
      'this.telegram.send',
    ]) {
      expect(service().includes(call), `${call} chaqirilmayapti`).toBe(true);
    }
  });

  it('yangi jo‘natgich qurilmagan — Telegram HTTP klienti chaqirilmaydi', () => {
    // Yetkazish/qayta urinish/claim mavjud outbox worker'ida (Faza 28).
    for (const { file, src } of sources()) {
      expect(/api\.telegram\.org|tgSendMessage|fetch\(/.test(src), `${file}`).toBe(false);
    }
  });
});
