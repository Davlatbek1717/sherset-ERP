/**
 * `/new` va `/[id]` chop menyulari AJRALIB KETMASIN.
 *
 * Real hodisa (2026-08-01): omborchi varag'i 3 bo'limning SAQLANGAN hujjat
 * sahifasiga qo'shildi, deploy qilindi — egasi esa YANGI qabul sahifasini
 * ochib «hech nima o'zgarmadi» dedi. Haq edi: `/new` sahifalar butunlay
 * alohida, qo'lda yozilgan menyularga ega va ular avtomatik yangilanmaydi.
 *
 * Buni hech bir tip yoki lint tutmaydi — ikkala sahifa ham mustaqil to'g'ri
 * kompilyatsiya bo'ladi. Faqat shu test tutadi.
 *
 * Qamrov: varaq QAYSI bo'limda bo'lsa, uning ikkala sahifasida ham bo'lsin.
 * Yangi bo'limga varaq qo'shsangiz — ro'yxatga qo'shing va IKKALA sahifani
 * ham ulang.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** Omborchi varag'i bo'lishi SHART bo'lgan bo'limlar. */
const SECTIONS = [
  'demands',
  'supplies',
  'purchase-returns',
  'losses',
  'sales-returns',
  'customer-orders',
] as const;

const APP = path.join(process.cwd(), 'src', 'app', '(app)');

function read(rel: string): string | null {
  const p = path.join(APP, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

/**
 * Varaq shu sahifada FOYDALANUVCHIGA ko'rinadimi.
 *
 * Diqqat — bu yerda «usePickSheet bormi» deb tekshirish YETARLI EMAS: portal
 * render qilinib, menyu bandi qo'yilmasa tugma umuman chiqmaydi (aynan shu
 * holat 2026-08-01 da yuz berdi). Shuning uchun IKKALASI ham talab qilinadi:
 *   · menyu yorlig'i — foydalanuvchi bosadigan band;
 *   · portal render — bosilganda chiqadigan varaq.
 * (Bu tekshiruv mutatsiya bilan sinaldi: yorliqni olib tashlasangiz yiqiladi.)
 */
const MENU_LABEL = /tS(heet|piska)\(\s*'(spiska_form|putaway_form)'\s*\)/;
const PORTAL = /<ReceiptPrintPortal\b/;

function offersSheet(src: string): boolean {
  return MENU_LABEL.test(src) && PORTAL.test(src);
}

describe('omborchi varag`i — /new va /[id] parity', () => {
  it.each(SECTIONS)('%s: saqlangan hujjat sahifasida varaq bor', (slug) => {
    const src = read(`${slug}/[id]/page.tsx`);
    expect(src, `${slug}/[id]/page.tsx topilmadi`).toBeTruthy();
    expect(offersSheet(src as string)).toBe(true);
  });

  it.each(SECTIONS)('%s: YANGI hujjat sahifasida ham varaq bor', (slug) => {
    const src = read(`${slug}/new/page.tsx`);
    expect(src, `${slug}/new/page.tsx topilmadi`).toBeTruthy();
    expect(offersSheet(src as string)).toBe(true);
  });

  it('portal render qilgan har sahifa MENYU bandini ham qo`yadi', () => {
    // Teskari yo'nalish: portal bor-u, band yo'q → tugma ko'rinmaydi, kod esa
    // «bajarilgan»dek turadi. Bu ro'yxat SECTIONS bilan chegaralanmaydi —
    // butun (app) daraxti bo'ylab skanerlaydi, shuning uchun kelajakda
    // qo'shiladigan sahifa ham qamrovga tushadi.
    const orphans: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name === 'page.tsx') {
          const src = fs.readFileSync(full, 'utf8');
          if (PORTAL.test(src) && !MENU_LABEL.test(src)) {
            orphans.push(path.relative(APP, full).split(path.sep).join('/'));
          }
        }
      }
    };
    walk(APP);
    // Istisno: /pick-lists/[id]/print — u SAHIFANING O'ZI varaq (menyu emas).
    expect(orphans.filter((f) => !f.startsWith('pick-lists/'))).toEqual([]);
  });
});
