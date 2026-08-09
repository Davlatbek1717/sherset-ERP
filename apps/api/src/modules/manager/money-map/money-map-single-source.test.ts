import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MONEY_MAP_BLOCK_KEYS } from './money-map.js';

/**
 * MK15 — «IKKINCHI FORMULA YO'Q» qo'riqchisi (4M TZ §8.1/1, test 1).
 *
 * Panelning butun qiymati bitta va'daga tayanadi: **bu ekrandagi raqam boshqa
 * ekrandagi raqam bilan bir xil**. Uni buzish uchun yovuz niyat kerak emas —
 * «shu yerda bitta `prisma.cashDesk.aggregate` qilib qo'ya qolay» degan bir
 * satr yetadi. Undan keyin kassa qoldig'i pul manzarasida bir xil, kassa
 * ro'yxatida boshqa xil bo'ladi va qaysi biri to'g'riligini hech kim bilmaydi.
 *
 * Na typecheck, na unit testlar buni tutadi (ikkala yo'l ham «ishlaydi»),
 * shuning uchun manba-skan. Aynan shu bug-klass repoda allaqachon bo'lgan:
 * bitta ratio'ning to'rtta implementatsiyasi (`no-adhoc-percent.test.ts`).
 */

const MONEY_MAP_DIR = path.join(process.cwd(), 'src', 'modules', 'manager', 'money-map');

/** Izohlar skanerdan olib tashlanadi — repo konventsiyasi. */
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function sources(): Array<{ file: string; src: string }> {
  return fs
    .readdirSync(MONEY_MAP_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.test.ts'))
    .map((e) => ({
      file: e.name,
      src: stripComments(fs.readFileSync(path.join(MONEY_MAP_DIR, e.name), 'utf8')),
    }));
}

describe('MK15 — pul manzarasi o‘z formulasini yozmaydi', () => {
  it('skanerlanadigan fayl bor (skan bo‘shliqqa qarab yashil bo‘lib qolmasin)', () => {
    const files = sources()
      .map((s) => s.file)
      .sort();
    expect(files).toEqual(['money-map.controller.ts', 'money-map.service.ts', 'money-map.ts']);
  });

  it('Prisma modellariga TO‘G‘RIDAN-TO‘G‘RI tegmaydi', () => {
    // Har blokning raqami o'z servisidan keladi. To'g'ridan-to'g'ri model
    // o'qish = o'sha raqamning ikkinchi ta'rifi (boshqa filtr, boshqa
    // arxiv/tenant qoidasi) — panel jimgina boshqa javob berardi.
    const banned =
      /prisma\.client\.(cashDesk|organizationAccount|counterpartyBalance|counterpartyBalanceEntry|driverCashHandover|purchaseOrder|purchaseOrderPosition|moneyOperation|debt)\b/;
    for (const { file, src } of sources()) {
      expect(banned.test(src), `${file} Prisma modelini to'g'ridan-to'g'ri o'qiyapti`).toBe(false);
    }
  });

  it('`$queryRaw` ishlatmaydi', () => {
    for (const { file, src } of sources()) {
      expect(/\$queryRaw|\$executeRaw/.test(src), `${file} xom SQL yozyapti`).toBe(false);
    }
  });

  it('o‘z valyuta konvertatsiyasini yozmaydi — faqat `consolidateToBase`', () => {
    // `rateValue` ×10^8 ni qo'lda ko'paytirish/bo'lish = Faza 17 shartnomasini
    // chetlab o'tish (identity-kurs qo'riqchisi va «kursi yo'q pul jamiga
    // qo'shilmaydi» qoidasi shu helper ichida).
    for (const { file, src } of sources()) {
      expect(/rateValue|multiplicity|100_000_000n|toBaseMinor/.test(src), `${file}`).toBe(false);
    }
  });

  it('o‘z sifat bayrog‘i satrlarini yozmaydi — faqat `data-quality` moduli', () => {
    for (const { file, src } of sources()) {
      expect(/'(complete|partial|uncollected)'/.test(src), `${file}`).toBe(false);
    }
  });

  it('har blok kaliti servis chaqiruvi bilan bog‘langan (o‘qilmagan blok qolmasin)', () => {
    const service = sources().find((s) => s.file === 'money-map.service.ts')?.src ?? '';
    // Oltita blokning hammasi javobga tushishi kerak; biri unutilsa ekranda
    // jimgina yo'qolardi (bo'sh joy «pul yo'q» bo'lib o'qiladi).
    for (const key of MONEY_MAP_BLOCK_KEYS) {
      expect(service.includes(`'${key}'`), `'${key}' bloki servisda yo'q`).toBe(true);
    }
  });

  it('MAVJUD servislarning aynan o‘sha metodlari chaqiriladi', () => {
    const service = sources().find((s) => s.file === 'money-map.service.ts')?.src ?? '';
    for (const call of [
      'this.money.sourceBalances',
      'this.counterpartyBalances.counterpartyBalanceReport',
      'this.driverCash.outstandingByCurrency',
      'this.inTransit.getInTransitValueByCurrency',
    ]) {
      expect(service.includes(call), `${call} chaqirilmayapti`).toBe(true);
    }
  });
});
