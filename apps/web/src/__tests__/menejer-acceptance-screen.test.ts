import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import ru from '../messages/ru.json';
import uz from '../messages/uz.json';

/**
 * Menejer — kunlik KPI qabul ekrani (TZ 4M.2 §3.5) drift-lock.
 *
 * NEGA MANBA-SKAN: ekranning yorliqlari BE'dagi yopiq ro'yxatlardan
 * (`daily-kpi.fsm.ts` — holatlar, amallar, sabab kodlari) kelib chiqadi va
 * `t(`state_${x}`)` kabi DINAMIK kalitlar bilan chaqiriladi. Dinamik kalitni
 * odatiy i18n key-existence gate'i KO'RMAYDI: BE'ga yangi sabab kodi
 * qo'shilsa, ekranda foydalanuvchiga xom `reason_yangi_kod` chiqib turadi va
 * hech bir test shikoyat qilmaydi. Shuning uchun bu yerda BE fayli o'qilib,
 * har element uchun ru+uz tarjimasi BOR-YO'QLIGI tekshiriladi.
 *
 * Qulflanadigan ikkinchi narsa — TZ §3.5 ning MAJBURIY xususiyatlari:
 * klaviatura (↓/↑/A/R/E) va «NULL ≠ 0» ko'rsatilishi.
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
  'daily-kpi.fsm.ts',
);
const PAGE = join(__dirname, '..', 'app', '(app)', 'menejer', 'page.tsx');

const fsmSrc = readFileSync(FSM, 'utf8');
const pageSrc = readFileSync(PAGE, 'utf8');

/** Regex guruhidan barcha `'kalit'` qiymatlarini oladi. */
function slugs(body: string, pattern: RegExp): string[] {
  return [...body.matchAll(pattern)].map((x) => x[1] ?? '').filter(Boolean);
}

/** `export const NAME = [ 'a', 'b' ] as const;` dan qiymatlarni oladi. */
function constArray(name: string): string[] {
  const m = fsmSrc.match(
    new RegExp(`export const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\]\\s*as const`),
  );
  if (!m?.[1]) throw new Error(`${name} topilmadi — BE fayli o'zgargan bo'lsa testni yangilang`);
  return slugs(m[1], /'([a-z_]+)'/g);
}

const STATES = constArray('DAILY_KPI_STATES');
const REASON_CODES = constArray('KPI_REASON_CODES');
/** FSM amallari — `DAILY_KPI_TRANSITIONS` obyektining kalitlari. */
const ACTIONS = (() => {
  const m = fsmSrc.match(/DAILY_KPI_TRANSITIONS[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!m?.[1]) throw new Error('DAILY_KPI_TRANSITIONS topilmadi');
  return slugs(m[1], /^ {2}([a-z_]+):\s*\{/gm);
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
    expect(STATES.length).toBeGreaterThanOrEqual(6);
    expect(ACTIONS.length).toBeGreaterThanOrEqual(8);
    expect(REASON_CODES.length).toBeGreaterThanOrEqual(8);
  });
});

describe('dinamik i18n kalitlari — ru va uz da BOR', () => {
  for (const [locale, bundle] of LOCALES) {
    const keys = menejerKeys(bundle);

    it(`${locale}: har FSM holati uchun state_* yorlig'i`, () => {
      const missing = STATES.filter((s) => !keys[`state_${s}`]);
      expect(missing, `yo'q: ${missing.join(', ')}`).toEqual([]);
    });

    it(`${locale}: har FSM amali uchun jurnal yorlig'i`, () => {
      // Jurnalda holat o'zgartirmaydigan `adjust` ham chiqadi.
      const all = [...ACTIONS, 'adjust'];
      const missing = all.filter((a) => !keys[`action_log_${a}`]);
      expect(missing, `yo'q: ${missing.join(', ')}`).toEqual([]);
    });

    it(`${locale}: har sabab kodi uchun yorliq`, () => {
      const missing = REASON_CODES.filter((c) => !keys[`reason_${c}`]);
      expect(missing, `yo'q: ${missing.join(', ')}`).toEqual([]);
    });

    it(`${locale}: aktyor turlari va ballga kirmaslik sabablari`, () => {
      const required = [
        'actor_system',
        'actor_manager',
        'actor_owner',
        'actor_employee',
        'skip_unmeasured',
        'skip_no_target',
        'skip_no_weight',
        'skip_neutral',
        'skip_unknown_metric',
        'unit_money',
        'unit_count',
        'unit_percent',
        'unit_minutes',
      ];
      const missing = required.filter((k) => !keys[k]);
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
    expect(pageSrc).toContain("'ArrowDown'");
    expect(pageSrc).toContain("'ArrowUp'");
    // Katta va kichik harf — Caps Lock bilan ham ishlashi kerak.
    expect(pageSrc).toMatch(/case 'a':\s*\n\s*case 'A':/);
    expect(pageSrc).toMatch(/case 'r':\s*\n\s*case 'R':/);
    expect(pageSrc).toMatch(/case 'e':\s*\n\s*case 'E':/);
    expect(pageSrc).toContain("addEventListener('keydown'");
  });

  it('matn kiritilayotganda qisqartmalar O`CHADI', () => {
    // Aks holda izoh yozayotganda «a» harfi kunni qabul qilib yuborardi.
    expect(pageSrc).toMatch(/tag === 'INPUT'/);
    expect(pageSrc).toMatch(/tag === 'TEXTAREA'/);
  });

  it('og`ish va soatiga ish yuki ustunlari bor', () => {
    expect(pageSrc).toContain('deviationPercent');
    expect(pageSrc).toContain('perHour');
  });

  it('hodisa jurnali ko`rsatiladi (nizoda yozma iz)', () => {
    expect(pageSrc).toContain('journal_title');
    expect(pageSrc).toContain('day.events.map');
  });
});

describe('NULL ≠ 0 va muzlatish shartnomalari ekranda', () => {
  it('o`lchanmagan fakt NOL deb ko`rsatilmaydi', () => {
    // `?? 0` yoki `|| 0` fakt/ball yo'lida bo'lsa — o'lchanmagan kun eng
    // yomon xodimga aylanardi (1.1/1.2 sabog'i).
    expect(pageSrc).toContain('unmeasured_dash');
    expect(pageSrc).not.toMatch(/(autoValue|adjustValue|\bscore)\s*\?\?\s*0\b/);
  });

  it('ballsiz kun «0%» emas, «ball yo`q» deb ko`rsatiladi', () => {
    expect(pageSrc).toMatch(/score == null \? t\('score_none'\)/);
  });

  it('qabul qilingan kun uchun MUZLATILGAN ball ko`rsatiladi', () => {
    // Jonli qayta hisoblangan ball ko'rsatilsa, ekran bilan to'langan oylik
    // bir-biriga zid bo'lib qolardi.
    expect(pageSrc).toContain('scoreFrozen');
    expect(pageSrc).toMatch(/accepted && day\.scoreFrozen != null/);
  });

  it('qamrov (weightScored/weightTotal) yashirilmaydi', () => {
    expect(pageSrc).toContain('weightScored');
    expect(pageSrc).toContain('weightTotal');
  });

  it('qabul qilingan kunda tuzatish tugmasi o`chirilgan (muzlatish)', () => {
    expect(pageSrc).toMatch(/const accepted = day\.state === 'accepted'/);
    expect(pageSrc).toMatch(/disabled=\{disabled\}/);
  });
});
