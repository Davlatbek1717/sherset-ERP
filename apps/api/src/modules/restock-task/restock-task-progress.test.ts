import { describe, expect, it } from 'vitest';
import {
  collectedQty,
  hasShortage,
  isLineClosed,
  planShortage,
  resolveTaskStatus,
  sortLinesByRoute,
} from './restock-task-progress.js';

/**
 * G6 — TSD ish ekranlarining SOF qarorlari.
 *
 * Eng muhim qulf shu faylda: qator IKKI yo'l bilan yopiladi (tasdiq va
 * YETISHMOVCHILIK). Ikkinchisi bo'lmasa topshiriq abadiy ochiq qolardi, chek
 * esa kontrol navbatiga tushmasdi (G2 sharti) va kassa yopilmagan chek bilan
 * qotib qolardi — 2026-08-24 hodisasining boshqa shakli.
 */

describe('isLineClosed / resolveTaskStatus', () => {
  it('tasdiqlangan qator YOPIQ', () => {
    expect(isLineClosed({ confirmedAt: new Date() })).toBe(true);
  });

  it('yetishmovchilik belgilangan qator ham YOPIQ (G6 ning o`zagi)', () => {
    expect(isLineClosed({ confirmedAt: null, shortageQty: '3' })).toBe(true);
  });

  it('tegilmagan qator OCHIQ', () => {
    expect(isLineClosed({ confirmedAt: null, shortageQty: null })).toBe(false);
  });

  it('hasShortage — belgi bor, lekin nol bo`lsa yetishmovchilik EMAS', () => {
    expect(hasShortage({ confirmedAt: null, shortageQty: '0' })).toBe(false);
    expect(hasShortage({ confirmedAt: null, shortageQty: '0.5' })).toBe(true);
    expect(hasShortage({ confirmedAt: null, shortageQty: null })).toBe(false);
  });

  it('hamma qator yopilsa `done` — yetishmovchilik ARALASH bo`lsa ham', () => {
    expect(
      resolveTaskStatus([
        { confirmedAt: new Date(), shortageQty: null },
        { confirmedAt: null, shortageQty: '2' },
      ]),
    ).toBe('done');
  });

  it('bittasi yopiq bo`lsa `in_progress`, hech biri yopiq bo`lmasa `pending`', () => {
    expect(
      resolveTaskStatus([
        { confirmedAt: new Date(), shortageQty: null },
        { confirmedAt: null, shortageQty: null },
      ]),
    ).toBe('in_progress');
    expect(resolveTaskStatus([{ confirmedAt: null, shortageQty: null }])).toBe('pending');
  });

  it('qatorsiz topshiriq `pending` (bo`sh ro`yxat «hammasi yopiq» EMAS)', () => {
    // `every` bo'sh ro'yxatda `true` qaytaradi — bu yerda u topshiriqni
    // jimgina «done» qilib qo'yardi.
    expect(resolveTaskStatus([])).toBe('pending');
  });
});

describe('planShortage — MUTLAQ semantika', () => {
  const line = { quantity: '10', confirmedAt: null, shortageQty: null };

  it('oddiy belgilash', () => {
    const p = planShortage(line, '4');
    expect(p.refusals).toEqual([]);
    expect(p.shortageQty).toBe('4');
    expect(p.noop).toBe(false);
  });

  it('AYNI qiymat qayta yuborilsa — noop (oflayn navbat takrori zararsiz)', () => {
    const p = planShortage({ ...line, shortageQty: '4' }, '4');
    expect(p.refusals).toEqual([]);
    expect(p.noop).toBe(true);
  });

  it('0 — belgini OLIB TASHLASH (`null`), «0 yetishmovchilik» emas', () => {
    const p = planShortage({ ...line, shortageQty: '4' }, '0');
    expect(p.shortageQty).toBeNull();
    expect(p.noop).toBe(false);
  });

  it('belgisiz qatorga 0 — noop', () => {
    expect(planShortage(line, '0').noop).toBe(true);
  });

  it('talabdan KO`P yetishmovchilik rad etiladi', () => {
    const p = planShortage(line, '10.000001');
    expect(p.refusals).toHaveLength(1);
    expect(p.shortageQty).toBeNull();
  });

  it('talabga TENG yetishmovchilik mumkin («umuman topolmadim»)', () => {
    expect(planShortage(line, '10').shortageQty).toBe('10');
  });

  it('tasdiqlangan qatorga yetishmovchilik yozilmaydi', () => {
    const p = planShortage({ quantity: '10', confirmedAt: new Date(), shortageQty: null }, '2');
    expect(p.refusals[0]).toContain('tasdiqlangan');
  });

  it('tasdiqlangan qatorda 0 (belgini tozalash) rad ETILMAYDI', () => {
    const p = planShortage({ quantity: '10', confirmedAt: new Date(), shortageQty: null }, '0');
    expect(p.refusals).toEqual([]);
  });

  it('noto`g`ri son rad etiladi (manfiy, harf, bo`sh)', () => {
    for (const bad of ['-1', 'ko`p', '', '1,5']) {
      expect(planShortage(line, bad).refusals).toHaveLength(1);
    }
  });
});

describe('collectedQty', () => {
  it('belgisiz qator — to`liq miqdor', () => {
    expect(collectedQty({ quantity: '10' })).toBe('10');
  });
  it('qisman yetishmovchilik — farq', () => {
    expect(collectedQty({ quantity: '10', shortageQty: '2.5' })).toBe('7.5');
  });
  it('to`liq yetishmovchilik — 0', () => {
    expect(collectedQty({ quantity: '10', shortageQty: '10' })).toBe('0');
  });
});

describe('sortLinesByRoute — yacheyka marshruti', () => {
  it('yacheyka kodi bo`yicha o`sish tartibida', () => {
    const out = sortLinesByRoute([
      { binLocation: '01-02-03-05', position: 0 },
      { binLocation: '01-01-01-01', position: 1 },
      { binLocation: '01-02-01-01', position: 2 },
    ]);
    expect(out.map((l) => l.binLocation)).toEqual(['01-01-01-01', '01-02-01-01', '01-02-03-05']);
  });

  it('yacheykasizlar OXIRIDA (marshrutga tushmaydi, qidirish kerak)', () => {
    const out = sortLinesByRoute([
      { binLocation: null, position: 0 },
      { binLocation: '02-01-01-01', position: 1 },
      { binLocation: '', position: 2 },
    ]);
    expect(out.map((l) => l.position)).toEqual([1, 0, 2]);
  });

  it('teng manzilda chekdagi asl tartib saqlanadi (barqaror)', () => {
    const out = sortLinesByRoute([
      { binLocation: '01-01-01-01', position: 5 },
      { binLocation: '01-01-01-01', position: 2 },
    ]);
    expect(out.map((l) => l.position)).toEqual([2, 5]);
  });

  it('OMBOR raqami (1-segment) birinchi kalit — omborlar aralashmaydi', () => {
    const out = sortLinesByRoute([
      { binLocation: '02-01-01-01', position: 0 },
      { binLocation: '01-09-09-09', position: 1 },
    ]);
    expect(out.map((l) => l.binLocation)).toEqual(['01-09-09-09', '02-01-01-01']);
  });

  it('kirish ro`yxati O`ZGARTIRILMAYDI (sof funksiya)', () => {
    const input = [
      { binLocation: '02-01-01-01', position: 0 },
      { binLocation: '01-01-01-01', position: 1 },
    ];
    sortLinesByRoute(input);
    expect(input[0]?.binLocation).toBe('02-01-01-01');
  });
});
