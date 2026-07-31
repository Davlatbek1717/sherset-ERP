import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * DIZAYN-TIZIM i18n XRAPOVIGI (2026-07-30).
 *
 * `packages/design-system` da o'z i18n'i YO'Q — satrlar to'g'ridan-to'g'ri
 * komponentga yozilgan. Natijada o'zbek interfeysida ruscha matn chiqadi.
 * Prod'da (2026-07-31) topilgan misol: jo'natma jamlanma bloki butunlay
 * rus tilida edi — «Промежуточный итог / НДС / Итого / Прибыль / Кол-во».
 *
 * Mavjud `i18n-no-hardcoded` gate'i FAQAT `apps/web/src/app` ni skanlaydi,
 * shuning uchun bu butun bug-klassi ko'rinmas edi.
 *
 * Bir yo'la hammasini tuzatib bo'lmaydi (14 faylda 712 belgi), shuning uchun
 * XRAPOVIK: har fayl uchun hozirgi son qayd etilgan; OSHIRISH bloklanadi,
 * kamaytirish esa erkin. Fayl tuzatilgach byudjetini KAMAYTIRING —
 * `ratchet is tight` testi buni majburlaydi.
 *
 * Eslatma: ataylab qoldirilgan ruscha zaxira qiymatlar ham (masalan
 * `DocumentTotalsPanel` dagi `DEFAULT_LABELS`) shu songa kiradi — ular
 * ru lokalini buzmaslik uchun saqlanadi.
 */

const DS = join(__dirname, '..', '..', '..', '..', 'packages', 'design-system', 'src');

/** Izohlarni olib tashlab, kirill belgilarini sanaydi. */
function cyrillicCount(src: string): number {
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  return (noComments.match(/[А-Яа-яЁё]/g) ?? []).length;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name) && !e.name.includes('.test.')) out.push(p);
  }
  return out;
}

function scan(): Map<string, number> {
  const m = new Map<string, number>();
  for (const f of walk(DS)) {
    const n = cyrillicCount(readFileSync(f, 'utf8'));
    if (n > 0) m.set(f.replace(/\\/g, '/').split('/design-system/src/')[1] ?? f, n);
  }
  return m;
}

/** 2026-07-31 holati. Faqat KAMAYTIRING. */
const BUDGET: Record<string, number> = {
  'document-editor/PositionTable.tsx': 287,
  'document-editor/DocumentHeader.tsx': 90,
  'document-editor/DocumentTotalsPanel.tsx': 82,
  'lib/csv.ts': 54,
  'patterns/PositionEditor.tsx': 44,
  'patterns/MassEditModal.tsx': 43,
  'patterns/InlineFilterPanel.tsx': 24,
  'forms/PeriodPicker.tsx': 23,
  'primitives/DatePicker.tsx': 23,
  'patterns/ListView.tsx': 19,
  'patterns/HistoryTimeline.tsx': 13,
  'layout/PageHeader.tsx': 5,
  'lib/format.ts': 3,
  'navigation/Pagination.tsx': 2,
};

describe('design-system hardcoded-Cyrillic ratchet', () => {
  it('no file exceeds its recorded budget', () => {
    const found = scan();
    const over: string[] = [];
    for (const [file, n] of found) {
      const budget = BUDGET[file];
      if (budget === undefined) continue; // yangi fayl — keyingi test tutadi
      if (n > budget) over.push(`${file}: ${n} > ${budget}`);
    }
    expect(over, `Qattiq yozilgan rus matni KO'PAYDI:\n${over.join('\n')}`).toEqual([]);
  });

  it('no NEW file introduces hardcoded Cyrillic', () => {
    const fresh = [...scan().keys()].filter((f) => !(f in BUDGET));
    expect(
      fresh,
      `Yangi faylda qattiq yozilgan rus matni — komponentga label propi qo'shing:\n${fresh.join('\n')}`,
    ).toEqual([]);
  });

  it('the ratchet is tight — a fixed file must lower its budget', () => {
    // Byudjet haqiqiy sondan katta bo'lib qolsa, xrapovik bo'shashadi va
    // keyingi regressiya sezilmay o'tadi.
    const found = scan();
    const slack: string[] = [];
    for (const [file, budget] of Object.entries(BUDGET)) {
      const n = found.get(file) ?? 0;
      if (n < budget)
        slack.push(`${file}: haqiqiy ${n} < byudjet ${budget} — byudjetni ${n} ga tushiring`);
    }
    expect(slack, slack.join('\n')).toEqual([]);
  });

  it('the scanner is non-vacuous — it still sees the known Russian', () => {
    // Regex/yo'l buzilsa «0 muammo» degan yolg'on xotirjamlik bo'lmasin.
    const found = scan();
    expect(found.size).toBeGreaterThan(8);
    expect(found.get('document-editor/PositionTable.tsx') ?? 0).toBeGreaterThan(100);
  });
});
