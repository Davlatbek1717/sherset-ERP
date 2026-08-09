import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import ru from '../messages/ru.json';
import uz from '../messages/uz.json';

/**
 * MK03 — menejer «Jonli holat» va «Javobgarlik» ekranlari (4M TZ §6.1, §6.4).
 *
 * NEGA MANBA-SKAN (menejer-acceptance-screen.test.ts bilan bir naql):
 * ikkala ekranning butun so'z boyligi BE'dagi YOPIQ ro'yxatlardan keladi —
 * `LIVE_KIND` · `ATTENTION` · `LIVE_TITLE` (`live-status.ts`) va `DUTY`
 * (`accountability.ts`). Ular FE'da `t(`title_${row.titleKey}`)` kabi DINAMIK
 * kalit bilan chaqiriladi, ya'ni odatiy i18n key-existence gate'i ularni
 * KO'RMAYDI: BE'ga yangi qator turi qo'shilsa ekranda xom `title_yangi_tur`
 * chiqib turardi va hech bir test shikoyat qilmasdi.
 *
 * Ikkinchi qulf — TZ ning «yolg'on ishonch bermaslik» talablari:
 *   · nol qatorlar ko'rsatilmaydi va FE ularni O'ZI ham to'qib chiqarmaydi;
 *   · jihoz bloki YO'Q (reyestr mavjud emas — «0 ta jihoz» yolg'on bo'lardi);
 *   · bo'sh javob «hammasi joyida» EMAS, «ma'lumot yo'q» deb ko'rsatiladi;
 *   · BE tartibi (diqqat talab qilgan qator birinchi) FE'da qayta saralanmaydi;
 *   · ekran matni BE'ning tayyor o'zbekcha `title`/`detail`/`label` qatoridan
 *     EMAS, tarjima kalitidan chiziladi (aks holda ru interfeysda o'zbekcha).
 */

const WEB_SRC = join(__dirname, '..');
const API_LIVE = join(
  WEB_SRC,
  '..',
  '..',
  '..',
  'apps',
  'api',
  'src',
  'modules',
  'manager',
  'live',
);

const liveSrc = readFileSync(join(API_LIVE, 'live-status.ts'), 'utf8');
const dutySrc = readFileSync(join(API_LIVE, 'accountability.ts'), 'utf8');
const serviceSrc = readFileSync(join(API_LIVE, 'live-status.service.ts'), 'utf8');

const LIVE_PAGE = join(WEB_SRC, 'app', '(app)', 'menejer', 'jonli', 'page.tsx');
const DUTIES_PAGE = join(WEB_SRC, 'app', '(app)', 'menejer', 'javobgarlik', 'page.tsx');
const livePageSrc = readFileSync(LIVE_PAGE, 'utf8');
const dutiesPageSrc = readFileSync(DUTIES_PAGE, 'utf8');

/**
 * Izohlarni olib tashlaydi. «Nima YO'Q» qoidalari CHIZILADIGAN kod ustidan
 * tekshiriladi: jihoz nega yo'qligini tushuntirgan izoh — aynan saqlanishi
 * kerak bo'lgan narsa, uni qoida buzilishi deb hisoblash noto'g'ri bo'lardi.
 */
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, (_m, p1) => p1);
}

const liveCode = stripComments(livePageSrc);
const dutiesCode = stripComments(dutiesPageSrc);

/** `export const X = { a: 'v', ... } as const` bloklaridan qiymatlarni oladi. */
function constMapValues(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export const ${name}\\s*=\\s*\\{([\\s\\S]*?)\\n\\} as const`));
  if (!m?.[1]) throw new Error(`${name} topilmadi — BE fayli o'zgargan bo'lsa testni yangilang`);
  return [...m[1].matchAll(/:\s*'([a-z_]+)'/g)].map((x) => x[1] ?? '').filter(Boolean);
}

const LIVE_KINDS = constMapValues(liveSrc, 'LIVE_KIND');
const ATTENTIONS = constMapValues(liveSrc, 'ATTENTION');
const TITLE_KEYS = constMapValues(liveSrc, 'LIVE_TITLE');
const DUTY_KINDS = constMapValues(dutySrc, 'DUTY');

const LOCALES: Array<[string, Record<string, unknown>]> = [
  ['ru', ru as unknown as Record<string, unknown>],
  ['uz', uz as unknown as Record<string, unknown>],
];

function ns(bundle: Record<string, unknown>, name: string): Record<string, string> {
  const pages = bundle.pages as Record<string, Record<string, string>> | undefined;
  return pages?.[name] ?? {};
}

describe('manba: BE yopiq ro`yxatlari o`qildi (test bo`sh emas)', () => {
  it('LIVE_KIND / ATTENTION / LIVE_TITLE / DUTY topildi', () => {
    expect(LIVE_KINDS).toEqual(['shift', 'attendance', 'trip', 'picking']);
    expect(ATTENTIONS).toEqual(['alert', 'info', 'ok']);
    expect(TITLE_KEYS.length).toBeGreaterThanOrEqual(8);
    // Aniq son EMAS: `DUTY` o'sib boradi (MK05 jihoz, MK08 qabul qilinmagan
    // smena). Muhimi — ro'yxat bo'sh emas va har turi tarjima qilinadi
    // (quyidagi `duty_*` tekshiruvi shuni qulflaydi).
    expect(DUTY_KINDS.length).toBeGreaterThanOrEqual(4);
    expect(DUTY_KINDS).toContain('equipment_out');
  });
});

describe('dinamik i18n kalitlari — ru va uz da BOR', () => {
  for (const [locale, bundle] of LOCALES) {
    const live = ns(bundle, 'menejerLive');
    const duties = ns(bundle, 'menejerDuties');

    it(`${locale}: har qator turi uchun kind_* yorlig'i`, () => {
      const missing = LIVE_KINDS.filter((k) => !live[`kind_${k}`]);
      expect(missing, `yo'q: ${missing.join(', ')}`).toEqual([]);
    });

    it(`${locale}: har diqqat darajasi uchun attention_* yorlig'i`, () => {
      const missing = ATTENTIONS.filter((a) => !live[`attention_${a}`]);
      expect(missing, `yo'q: ${missing.join(', ')}`).toEqual([]);
    });

    it(`${locale}: har BE sarlavha kaliti uchun title_* tarjimasi`, () => {
      const missing = TITLE_KEYS.filter((k) => !live[`title_${k}`]);
      expect(missing, `yo'q: ${missing.join(', ')}`).toEqual([]);
    });

    it(`${locale}: har majburiyat turi uchun duty_* yorlig'i`, () => {
      const missing = DUTY_KINDS.filter((k) => !duties[`duty_${k}`]);
      expect(missing, `yo'q: ${missing.join(', ')}`).toEqual([]);
    });

    it(`${locale}: subnav yozuvlari (jonli holat · javobgarlik)`, () => {
      const subnav = (bundle.subnav as Record<string, Record<string, string>> | undefined)?.menejer;
      expect(subnav?.live).toBeTruthy();
      expect(subnav?.accountability).toBeTruthy();
    });
  }

  it('ru va uz kalit to`plamlari BIR XIL (bir tomonlama tarjima bo`lmasin)', () => {
    for (const name of ['menejerLive', 'menejerDuties']) {
      const r = Object.keys(ns(ru as unknown as Record<string, unknown>, name)).sort();
      const u = Object.keys(ns(uz as unknown as Record<string, unknown>, name)).sort();
      expect(r, `${name}: ru≠uz`).toEqual(u);
      expect(r.length).toBeGreaterThan(5);
    }
  });
});

describe('ekran matni BE ning tayyor o`zbekcha qatoridan chizilmaydi', () => {
  // BE `title`/`detail`/`label` ni o'zbekcha TAYYOR qator qilib qaytaradi
  // (log kabi UI-bo'lmagan iste'molchilar uchun). FE ularni o'qisa, ru
  // interfeysda o'zbekcha matn turardi va i18n gate'i buni ko'rmasdi —
  // u faqat FE fayllarini skanlaydi.
  it('jonli holat: qator tipida `title`/`detail` maydonlari YO`Q', () => {
    expect(livePageSrc).not.toMatch(/^\s*title\s*:/m);
    expect(livePageSrc).not.toMatch(/^\s*detail\s*:/m);
    expect(livePageSrc).toContain('titleKey');
    expect(livePageSrc).toContain('titleParams');
  });

  it('javobgarlik: majburiyat tipida `label` maydoni YO`Q, `kind` bor', () => {
    expect(dutiesPageSrc).not.toMatch(/^\s*label\s*:/m);
    expect(dutiesPageSrc).toContain('kind');
  });

  it('ikkala ekranda kirill harfi yo`q (hardcoded ru matn)', () => {
    expect(liveCode).not.toMatch(/[А-Яа-яЁё]/);
    expect(dutiesCode).not.toMatch(/[А-Яа-яЁё]/);
  });
});

describe('TZ §6.1 — jonli holat ekrani', () => {
  it('chegaralar SERVERDAN keladi, FE da takrorlanmaydi', () => {
    // Chegara ikki joyda yashasa jimgina bir-biridan uzoqlashadi:
    // ekran «15 daqiqadan ortiq» deb yozib turadi, BE esa 20 da belgilaydi.
    expect(serviceSrc).toContain('thresholds');
    expect(livePageSrc).toContain('shiftLongHours');
    expect(livePageSrc).toContain('lateAlertMinutes');
    expect(livePageSrc).toContain('pickingStuckMinutes');
  });

  it('BE tartibi saqlanadi — FE qayta SARALAMAYDI', () => {
    // «Diqqat talab qiladigani tepada» qoidasi `buildLiveBoard` da (26 test).
    // FE `.sort()` qilsa o'sha qoida jimgina yo'qolardi.
    expect(livePageSrc).not.toMatch(/\.sort\(/);
  });

  it('bo`sh javob «hammasi joyida» EMAS — «ma`lumot yo`q»', () => {
    expect(livePageSrc).toContain('EmptyState');
    expect(livePageSrc).toContain('empty_title');
    // Bo'shlik nima demasligini aytadigan izoh — TZ: ekran «hammasi joyida»
    // demaydi.
    expect(livePageSrc).toContain('empty_hint');
  });

  it('davomiylik `since` dan hisoblanadi va BE bayrog`iga bo`ysunadi', () => {
    expect(livePageSrc).toContain('showDuration');
    expect(livePageSrc).toContain('since');
  });

  it('holat→rang lokal jadval EMAS (UI Convention 6)', () => {
    expect(livePageSrc).toContain('liveAttentionTone');
    expect(livePageSrc).toMatch(/from '@\/lib\/domain-status-tone'/);
  });
});

describe('TZ §6.4 — javobgarlik taxtasi', () => {
  it('NOL qatorlar FE da ham to`qib chiqarilmaydi', () => {
    // BE nol majburiyatni tashlaydi (`employeeDuties`). FE `?? 0` bilan
    // yo'q qiymatni nolga aylantirса, «Ochiq smena: 0» qaytib kelardi.
    expect(dutiesPageSrc).not.toMatch(/(duties|count|totalCount)\s*\?\?\s*0\b/);
    expect(dutiesPageSrc).toContain('duties');
  });

  it('JIHOZ bloki BOR — reyestr paydo bo`ldi (MK05)', () => {
    // MK03'da bu qulf teskari edi («equipment so'zi UMUMAN bo'lmasin»):
    // reyestrsiz «0 ta jihoz» menejerni yo'q ma'lumotga ishontirardi.
    // MK05 reyestrni qo'shdi, ya'ni son endi O'LCHANGAN — qulf AYNAN shu
    // sababdan ag'darildi (jimgina o'chirilmadi).
    expect(DUTY_KINDS).toContain('equipment_out');
    expect(dutiesCode).toContain('equipment_out');
  });

  it('ro`yxat to`liq emasligi ekranda OCHIQ yozilgan', () => {
    // Qarz ko'rinib tursin: menejer bu ro'yxatni «hammasi shu» deb o'qimasin.
    expect(dutiesPageSrc).toContain('scope_note');
  });

  it('pul summasi `formatMoney` bilan, bigint string dan', () => {
    expect(dutiesPageSrc).toContain('formatMoney');
    expect(dutiesPageSrc).toContain('totalCashMinor');
  });

  it('pulsiz majburiyatda summa «—», 0 EMAS (NULL ≠ 0)', () => {
    expect(dutiesPageSrc).toContain('amountMinor');
    expect(dutiesPageSrc).not.toMatch(/amountMinor\s*\?\?\s*0\b/);
  });

  it('BE tartibi saqlanadi — FE qayta SARALAMAYDI', () => {
    expect(dutiesPageSrc).not.toMatch(/\.sort\(/);
  });

  it('holat→rang lokal jadval EMAS (UI Convention 6)', () => {
    expect(dutiesPageSrc).toContain('dutyKindTone');
    expect(dutiesPageSrc).toMatch(/from '@\/lib\/domain-status-tone'/);
  });
});
