import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * «Добавить из справочника» — KATALOGNI ochadi, bo'sh qator qo'shmaydi.
 *
 * 🔴 Bug-class (2026-08-23 auditi): 11 ta `/new` sahifasi `onAddFromCatalog` ni
 * to'g'ridan `addPosition` / `addEmptyPosition` / `emptyRow()` ga ulagan edi —
 * tugma katalogni ochish o'rniga BO'SH qator qo'shardi. Barcha `[id]` (tahrir)
 * sahifalari esa haqiqiy `CatalogPicker` ochadi, ya'ni bitta tugma ikki xil
 * ishlardi. `internal-orders/new` dagi izoh buni ochiq qayd etgan:
 * «was: appended an empty row; user 2026-07-14 bug report» — foydalanuvchi
 * shikoyat qilgan, tuzatish esa faqat o'sha bitta sahifada qo'llanilgan.
 *
 * Ikkinchi oqibat: `PositionInlineAdd` dagi «Ещё N товаров» tugmasi ham shu
 * callback'ni chaqiradi — qolgan mosliklarni ko'rish o'rniga bo'sh qator.
 *
 * Qulflanadi: hech bir sahifa `onAddFromCatalog` ga qator-qo'shuvchi
 * funksiyani TO'G'RIDAN ulamaydi (u modal ochishi kerak).
 */

const APP_DIR = join(__dirname, '..', 'app');
/** `onAddFromCatalog={addPosition}` yoki `={() => set(...emptyRow())}` kabi. */
const BANNED = /onAddFromCatalog=\{(?:addPosition|addEmptyPosition|[^}]*emptyRow\(\))[^}]*\}/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('«Добавить из справочника» — katalogni ochadi', () => {
  it("hech bir sahifa bo'sh qator qo'shuvchini ulamaydi", () => {
    const offenders = walk(APP_DIR)
      .filter((f) => BANNED.test(readFileSync(f, 'utf8')))
      .map((f) => f.replace(/\\/g, '/').replace(/^.*\/src\//, 'src/'));
    expect(offenders).toEqual([]);
  });

  it("skaner sun'iy buzg'unchini tutadi (vakuum emas)", () => {
    expect(BANNED.test('<X onAddFromCatalog={addPosition} />')).toBe(true);
    expect(BANNED.test('<X onAddFromCatalog={() => set((ps) => [...ps, emptyRow()])} />')).toBe(
      true,
    );
    expect(BANNED.test('<X onAddFromCatalog={() => setCatalogAddOpen(true)} />')).toBe(false);
  });
});
