import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 🔴 MK06 rejasining 4-testi — «NAVBAT HECH QANDAY AMALNI BLOKLAMAYDI»
 * (4M TZ §5.1: egasining falsafasi «erkinlik + keyingi nazorat»).
 *
 * Buni birlik-test bilan isbotlab bo'lmaydi: «bloklamaslik» — bu YO'Q
 * xususiyat, uni faqat ARXITEKTURA darajasida qulflash mumkin. Shuning uchun
 * test manba daraxtini skanerlaydi: agar biror hujjat/yozuv yo'li navbat
 * modulini import qilsa, ertaga o'sha yerda `if (workItems.length) throw`
 * paydo bo'lishi mumkin — va u ADASHIB emas, ATAYLAB yozilgan bo'lardi.
 *
 * Ruxsat etilgan yagona chaqiruvchi — `manager.module.ts` (DI ro'yxati).
 *
 * Qolgan ikki qatlam: bazada `CHECK (mode IN ('observe','notify'))`,
 * tipda `blocks: false` literal (`work-item-rules.ts`). Uch qatlam ataylab —
 * bitta qatlamdagi qulf refaktoringda jimgina yo'qoladi.
 */

const MODULES_DIR = join(import.meta.dirname, '..', '..');
const QUEUE_DIR = join(MODULES_DIR, 'manager', 'queue');

/** DI ro'yxati — modulga ulash import qilishning YAGONA qonuniy sababi. */
const ALLOWED = new Set([join('manager', 'manager.module.ts')]);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (full.endsWith('.ts')) {
      yield full;
    }
  }
}

describe('🔴 navbat hech narsani bloklamaydi (§5.1)', () => {
  it('`manager/queue` ni faqat `manager.module.ts` import qiladi', () => {
    const offenders: string[] = [];

    for (const file of walk(MODULES_DIR)) {
      if (file.startsWith(QUEUE_DIR + sep)) continue; // modul ichidagi importlar
      const rel = relative(MODULES_DIR, file);
      if (ALLOWED.has(rel)) continue;

      const source = readFileSync(file, 'utf8');
      if (/from\s+['"][^'"]*manager\/queue\//.test(source)) offenders.push(rel);
    }

    expect(offenders).toEqual([]);
  });

  it('navbat moduli hujjat servislarini chaqirmaydi (teskari yo`nalish ham yopiq)', () => {
    // Navbat o'zi hujjat yaratsa/o'zgartirsa, «faqat kuzatadi» da'vosi
    // yolg'on bo'lardi. U faqat O'QIYDI (audit jurnali, farq akti) va
    // FAQAT o'z jadvallariga yozadi.
    const writers: string[] = [];
    const forbidden =
      /\b(demand|customerOrder|invoiceOut|retailSale|supply|paymentIn|paymentOut|cashIn|cashOut|stock|product)\.(create|update|delete|createMany|updateMany|deleteMany|upsert)\b/;

    for (const file of walk(QUEUE_DIR)) {
      if (file.endsWith('.test.ts')) continue;
      if (forbidden.test(readFileSync(file, 'utf8'))) writers.push(relative(QUEUE_DIR, file));
    }

    expect(writers).toEqual([]);
  });
});
