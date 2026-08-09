import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import ru from '../messages/ru.json';
import uz from '../messages/uz.json';

/**
 * Menejer — kunlik KPI qabul ekrani (TZ 4M.2 §3.5) drift-lock.
 *
 * NEGA MANBA-SKAN: ekranning yorliqlari BE'dagi YOPIQ ro'yxatlardan
 * (`daily-kpi-fsm.ts` — holatlar, amallar, amal-bo'yicha sabab kodlari) kelib
 * chiqadi va `t(`state_${x}`)` kabi DINAMIK kalitlar bilan chaqiriladi.
 * Dinamik kalitni odatiy i18n key-existence gate'i KO'RMAYDI: BE'ga yangi
 * sabab kodi qo'shilsa, ekranda foydalanuvchiga xom `reason_yangi_kod` chiqib
 * turadi va hech bir test shikoyat qilmaydi. Shuning uchun bu yerda BE fayli
 * o'qilib, har element uchun ru+uz tarjimasi BOR-YO'QLIGI tekshiriladi.
 *
 * Qulflanadigan ikkinchi narsa — TZ §3.5 ning MAJBURIY xususiyatlari:
 * klaviatura (↓/↑/A/R/E), drill-down va «NULL ≠ 0» ko'rsatilishi.
 */

const FSM = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'apps',
  'api',
  'src',
  'modules',
  'manager',
  'kpi',
  'daily-kpi-fsm.ts',
);
const PAGE = join(__dirname, '..', 'app', '(app)', 'menejer', 'page.tsx');

const fsmSrc = readFileSync(FSM, 'utf8');
const pageSrc = readFileSync(PAGE, 'utf8');

/** `const X = { key: 'value', ... }` bloklaridan qiymatlarni oladi. */
function constMapValues(name: string): string[] {
  const m = fsmSrc.match(new RegExp(`export const ${name}\\s*=\\s*\\{([\\s\\S]*?)\\n\\} as const`));
  if (!m?.[1]) throw new Error(`${name} topilmadi — BE fayli o'zgargan bo'lsa testni yangilang`);
  return [...m[1].matchAll(/:\s*'([a-z_]+)'/g)].map((x) => x[1] ?? '').filter(Boolean);
}

const STATES = constMapValues('DAILY_KPI_STATE');
const ACTIONS = constMapValues('DAILY_KPI_ACTION');

/**
 * `REASON_CODES` — amal → kodlar ro'yxati; bizga barcha kodlar kerak.
 *
 * Regex QATOR BOSHIDAGI qiymatga bog'langan (`'kod',`), chunki umumiy
 * `'([a-z_]+)'` naqshi o'zbekcha izohlardagi apostroflarni ham tutadi:
 * `to'g'ri` ichidan `'g'` «sabab kodi» bo'lib chiqib qolgan edi.
 */
const REASON_CODES = (() => {
  const m = fsmSrc.match(/export const REASON_CODES = \{([\s\S]*?)\n\} as const satisfies/);
  if (!m?.[1]) throw new Error('REASON_CODES topilmadi');
  const found = [...m[1].matchAll(/^\s*'([a-z_]+)',/gm)].map((x) => x[1] ?? '').filter(Boolean);
  return [...new Set(found)];
})();

const LOCALES: Array<[string, Record<string, unknown>]> = [
  ['ru', ru as unknown as Record<string, unknown>],
  ['uz', uz as unknown as Record<string, unknown>],
];

function menejerKeys(bundle: Record<string, unknown>): Record<string, string> {
  const pages = bundle.pages as Record<string, Record<string, string>> | undefined;
  return pages?.menejer ?? {};
}

describe('manba: BE yopiq ro`yxatlari o`qildi (test bo`sh emas)', () => {
  it('holat / amal / sabab ro`yxatlari topildi', () => {
    // 7 holat, 9 amal (adjust ham), 20+ sabab kodi — merge natijasi.
    expect(STATES.length).toBeGreaterThanOrEqual(7);
    expect(ACTIONS.length).toBeGreaterThanOrEqual(9);
    expect(REASON_CODES.length).toBeGreaterThanOrEqual(15);
  });
});

describe('dinamik i18n kalitlari — ru va uz da BOR', () => {
  for (const [locale, bundle] of LOCALES) {
    const keys = menejerKeys(bundle);

    it(`${locale}: har FSM holati uchun state_* yorlig'i`, () => {
      const missing = STATES.filter((s) => !keys[`state_${s}`]);
      expect(missing, `yo'q: ${missing.join(', ')}`).toEqual([]);
    });

    it(`${locale}: har FSM amali uchun action_* yorlig'i`, () => {
      const missing = ACTIONS.filter((a) => !keys[`action_${a}`]);
      expect(missing, `yo'q: ${missing.join(', ')}`).toEqual([]);
    });

    it(`${locale}: har sabab kodi uchun reason_* yorlig'i`, () => {
      const missing = REASON_CODES.filter((c) => !keys[`reason_${c}`]);
      expect(missing, `yo'q: ${missing.join(', ')}`).toEqual([]);
    });
  }

  it('ru va uz kalit to`plamlari BIR XIL (bir tomonlama tarjima bo`lmasin)', () => {
    const r = Object.keys(menejerKeys(ru as unknown as Record<string, unknown>)).sort();
    const u = Object.keys(menejerKeys(uz as unknown as Record<string, unknown>)).sort();
    expect(r).toEqual(u);
  });
});

describe('TZ §3.5 majburiy xususiyatlari ekranda ulangan', () => {
  it('klaviatura: ↓/↑ o`tish, A qabul, R rad, E tuzatish', () => {
    // `\s*` — bog'lash ko'p qatorli bo'lishi mumkin (`enabled` opsiyasi bilan).
    expect(pageSrc).toMatch(/useHotkey\(\s*'arrowdown'/);
    expect(pageSrc).toMatch(/useHotkey\(\s*'arrowup'/);
    expect(pageSrc).toMatch(/useHotkey\(\s*'a'/);
    expect(pageSrc).toMatch(/useHotkey\(\s*'r'/);
    expect(pageSrc).toMatch(/useHotkey\(\s*'e'/);
  });

  it('DRILL-DOWN ulangan — «bu raqam qayerdan chiqdi»', () => {
    // TZ: busiz menejer raqamga ishonmaydi va qabul rasmiyatchilikka aylanadi.
    expect(pageSrc).toContain('drilldown');
    expect(pageSrc).toMatch(/setDrillMetric/);
  });

  it('og`ish va soatiga ish yuki ko`rsatiladi', () => {
    expect(pageSrc).toContain('deviationPercent');
    expect(pageSrc).toContain('revenuePerHourMinor');
  });

  it('hodisa jurnali ko`rsatiladi (nizoda yozma iz)', () => {
    expect(pageSrc).toMatch(/events/);
  });

  it('tugmalar FSM `allowedActions` dan chiziladi, FE o`z shartini yozmaydi', () => {
    expect(pageSrc).toContain('allowedActions');
  });
});

/**
 * MK14 REGRESSION-LOCK (2026-08-09, real brauzer QA).
 *
 * Uchta bug shu yerda qulflanadi. Uchalasi ham typecheck / biome / i18n
 * gate'laridan JIM o'tgan edi va faqat brauzerda ko'rindi.
 */
describe('MK14 brauzer-QA da topilgan uchta xato', () => {
  const KPI_METRICS = join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'apps',
    'api',
    'src',
    'modules',
    'manager',
    'kpi',
    'kpi-metrics.ts',
  );
  const metricsSrc = readFileSync(KPI_METRICS, 'utf8');

  /** Backend katalogidagi barcha birliklar (`money` / `count` / `minutes`). */
  const backendUnits = new Set(
    [...metricsSrc.matchAll(/unit:\s*'([a-z_]+)'/g)].map((m) => m[1] as string),
  );

  /** FE `MONEY_UNITS` to'plamining a'zolari. */
  const frontendMoneyUnits = (() => {
    const block = pageSrc.match(/const MONEY_UNITS = new Set\(\[([\s\S]*?)\]\)/)?.[1];
    if (!block) throw new Error('menejer/page.tsx ichida MONEY_UNITS topilmadi');
    return [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as string);
  })();

  it('1a. BE birlik lug`ati `money` ni ishlatadi (test bo`sh emas)', () => {
    expect(backendUnits.has('money')).toBe(true);
  });

  it('1b. MONEY_UNITS BE lug`atidan (o`lik qiymat yo`q) va `money` ni o`z ichiga oladi', () => {
    // Edi: `new Set(['minor'])` — `'minor'` `manager_rule_configs.thresholdUnit`
    // lug'atidan, ya'ni butunlay boshqa o'q. Natijada HECH BIR pul ko'rsatkichi
    // `formatMoney` ga tushmasdi: 118 100,00 so'm ekranda «11 810 000» ko'rinardi.
    expect(frontendMoneyUnits.length).toBeGreaterThan(0);
    for (const u of frontendMoneyUnits) {
      expect(backendUnits.has(u), `MONEY_UNITS dagi «${u}» BE lug'atida yo'q`).toBe(true);
    }
    expect(frontendMoneyUnits).toContain('money');
  });

  it('2. ko`rsatkich nomi locale`ga qarab tanlanadi, `labelUz` qotirilgan emas', () => {
    // Edi: RU rejimda butun ekran ruscha bo'lib, ko'rsatkichlar jadvali
    // o'zbekcha qolardi. Qardosh ekranlar allaqachon to'g'ri qiladi.
    expect(pageSrc).toMatch(/function metricLabel\([\s\S]*?labelRu/);
    expect(
      pageSrc.includes('{m.labelUz}'),
      'JSX ichida `{m.labelUz}` qoldi — RU rejimda o`zbekcha nom chiqadi',
    ).toBe(false);
  });

  it('3. dialog ochiq bo`lganda tezkor tugmalar O`CHADI', () => {
    // Edi: «Rad etish» dialogi ochiq turib sabab `<select>`ida «a» bosilsa
    // kun JIMGINA QABUL QILINARDI (jurnalda `accept stale -> accepted`), ya'ni
    // menejer rad etmoqchi bo'lgan kun muzlatilgan holatga o'tardi.
    expect(pageSrc).toMatch(
      /const modalOpen = rejectOpen \|\| adjustOpen \|\| drillMetric != null/,
    );
    const bindings = [...pageSrc.matchAll(/useHotkey\(\s*'(?:a|r|e|arrowup|arrowdown)'/g)];
    expect(bindings.length).toBe(5);
    expect([...pageSrc.matchAll(/enabled:\s*!modalOpen/g)].length).toBe(5);
  });
});

describe('holat→rang lokal jadval EMAS', () => {
  it('`dailyKpiStateTone` umumiy helper ishlatiladi', () => {
    // 2026-06-10 drift-lock sabog'i: har sahifa o'z rang-jadvalini saqlaganda
    // ikki holat jimgina bir-biridan uzoqlashgan edi.
    expect(pageSrc).toContain('dailyKpiStateTone');
    expect(pageSrc).toMatch(/from '@\/lib\/domain-status-tone'/);
    expect(pageSrc).not.toMatch(/\bconst \w*STATE_TONE\w*\s*[:=]/);
  });
});

describe('NULL ≠ 0 shartnomasi ekranda', () => {
  it('o`lchanmagan fakt NOL deb ko`rsatilmaydi', () => {
    // `?? 0` fakt yo'lida bo'lsa — o'lchanmagan kun eng yomon xodimga
    // aylanardi (1.1/1.2 sabog'i).
    expect(pageSrc).not.toMatch(/(autoValue|adjustValue|baselineValue)\s*\?\?\s*0\b/);
  });

  it('chala ma`lumot bayrog`i ko`rsatiladi', () => {
    expect(pageSrc).toContain('dataComplete');
    expect(pageSrc).toContain('partial');
  });
});
