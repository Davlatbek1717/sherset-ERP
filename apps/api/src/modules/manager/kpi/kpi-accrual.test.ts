import { describe, expect, it } from 'vitest';
import {
  type AccrualRuleInput,
  KPI_ACCRUAL_CONDITION_TYPE,
  KPI_ACCRUAL_REVERSAL_SOURCE,
  KPI_ACCRUAL_SOURCE,
  planAccrual,
  planReversalRows,
} from './kpi-accrual.js';

/**
 * Kunlik qabul → bonus/jarima (QAROR-B1, 4M TZ §4/2-band).
 *
 * Sof modul: pul qarori DB'siz sinaladi (`kpi-correction.ts` naqshi).
 */

function rule(over: Partial<AccrualRuleInput> = {}): AccrualRuleInput {
  return {
    id: 'r-1',
    name: 'Reja bajarildi',
    kind: 'bonus',
    amountMinor: 50_000_00n,
    condition: { type: KPI_ACCRUAL_CONDITION_TYPE, minPercent: 100, maxPercent: null },
    ...over,
  };
}

describe('planAccrual — qachon pul YOZILMAYDI', () => {
  it('qoida umuman yo`q — opt-in: hech narsa yozilmaydi', () => {
    const d = planAccrual({ scorePercent: 130, rules: [] });
    expect(d.accrue).toBe(false);
    expect(d.accrue === false && d.skipReason).toBe('no_rules');
  });

  it('ball NULL (kun ballanmagan) — 0% deb jarima YOZILMAYDI', () => {
    // NULL ≠ 0. Profil/maqsad yo'q kun «0% ⇒ jarima» bo'lib ketsa, tizim
    // o'lchamagani uchun odam pul yo'qotardi.
    const d = planAccrual({ scorePercent: null, rules: [rule({ kind: 'fine' })] });
    expect(d.accrue).toBe(false);
    expect(d.accrue === false && d.skipReason).toBe('no_score');
  });

  it('mos oraliq yo`q — «neytral» zona pulsiz o`tadi', () => {
    const d = planAccrual({ scorePercent: 85, rules: [rule()] });
    expect(d.accrue).toBe(false);
    expect(d.accrue === false && d.skipReason).toBe('no_matching_band');
  });

  it('ikki qoida bir vaqtda mos — TAVAKKAL summa yozilmaydi', () => {
    const d = planAccrual({
      scorePercent: 120,
      rules: [
        rule({ id: 'a', condition: { type: KPI_ACCRUAL_CONDITION_TYPE, minPercent: 100 } }),
        rule({
          id: 'b',
          condition: { type: KPI_ACCRUAL_CONDITION_TYPE, minPercent: 110, maxPercent: 200 },
        }),
      ],
    });
    expect(d.accrue).toBe(false);
    expect(d.accrue === false && d.skipReason).toBe('ambiguous_bands');
    expect(d.accrue === false && d.ruleIds).toEqual(['a', 'b']);
  });

  it('boshqa turdagi `condition` (checkbox) — kanal YOQILMAGAN, buzuq emas', () => {
    // Qo'lda qo'llanadigan qoidalar (`{type:'checkbox'}`) shu kanalga
    // umuman tegishli emas — ular borligi «sozlangan» degani emas.
    const d = planAccrual({
      scorePercent: 120,
      rules: [rule({ condition: { type: 'checkbox' } })],
    });
    expect(d.accrue).toBe(false);
    expect(d.accrue === false && d.skipReason).toBe('no_rules');
  });

  it('buzuq qoida (noma`lum kind · summa ≤ 0 · min yo`q) — JIMGINA o`tmaydi', () => {
    // Egasi kanalni sozlamoqchi bo'lgan-u xato qilgan. Buni «kanal
    // yoqilmagan» deb ko'rsatish — jimgina yo'qotish: hech kim tuzatmaydi.
    const broken: AccrualRuleInput[] = [
      rule({ id: 'x1', kind: 'penalty' }),
      rule({ id: 'x2', amountMinor: 0n }),
      rule({ id: 'x3', amountMinor: -5n }),
      rule({ id: 'x4', condition: { type: KPI_ACCRUAL_CONDITION_TYPE } }),
      rule({ id: 'x5', condition: { type: KPI_ACCRUAL_CONDITION_TYPE, minPercent: 'ko`p' } }),
      rule({
        id: 'x6',
        // teskari oraliq — mumkin emas
        condition: { type: KPI_ACCRUAL_CONDITION_TYPE, minPercent: 100, maxPercent: 70 },
      }),
    ];
    const d = planAccrual({ scorePercent: 120, rules: broken });
    expect(d.accrue).toBe(false);
    expect(d.accrue === false && d.skipReason).toBe('invalid_rules');
    // Qaysi qoidalar — logga chiqadi, egasi tuzata olsin.
    expect(d.accrue === false && d.ruleIds).toEqual(['x1', 'x2', 'x3', 'x4', 'x5', 'x6']);
  });

  it('bitta qoida buzuq, ikkinchisi to`g`ri — to`g`risi ishlayveradi', () => {
    const d = planAccrual({
      scorePercent: 120,
      rules: [rule({ id: 'buzuq', condition: { type: KPI_ACCRUAL_CONDITION_TYPE } }), rule()],
    });
    expect(d.accrue && d.ruleId).toBe('r-1');
  });
});

describe('planAccrual — oraliq chegaralari `[min, max)`', () => {
  const bands: AccrualRuleInput[] = [
    rule({
      id: 'fine',
      name: 'Reja bajarilmadi',
      kind: 'fine',
      amountMinor: 20_000_00n,
      condition: { type: KPI_ACCRUAL_CONDITION_TYPE, minPercent: 0, maxPercent: 70 },
    }),
    rule({
      id: 'bonus',
      name: 'Reja bajarildi',
      kind: 'bonus',
      amountMinor: 50_000_00n,
      condition: { type: KPI_ACCRUAL_CONDITION_TYPE, minPercent: 100, maxPercent: null },
    }),
  ];

  it('100.0 → bonus (yuqori chegara YOPIQ emas, quyi chegara YOPIQ)', () => {
    const d = planAccrual({ scorePercent: 100, rules: bands });
    expect(d.accrue && d.kind).toBe('bonus');
    expect(d.accrue && d.amountMinor).toBe(50_000_00n);
    expect(d.accrue && d.ruleId).toBe('bonus');
  });

  it('69.9 → jarima, 70.0 → hech narsa (chegara aynan `max` da uziladi)', () => {
    expect(planAccrual({ scorePercent: 69.9, rules: bands }).accrue).toBe(true);
    const d = planAccrual({ scorePercent: 70, rules: bands });
    expect(d.accrue).toBe(false);
    expect(d.accrue === false && d.skipReason).toBe('no_matching_band');
  });

  it('0 ball → jarima (0 ham oraliqqa kiradi, «yozilmadi» emas)', () => {
    const d = planAccrual({ scorePercent: 0, rules: bands });
    expect(d.accrue && d.kind).toBe('fine');
    expect(d.accrue && d.amountMinor).toBe(20_000_00n);
  });

  it('juda yuqori ball (SCORE_CAP dan oshgan) — yuqori oraliq ochiq', () => {
    expect(planAccrual({ scorePercent: 150, rules: bands }).accrue).toBe(true);
  });

  it('qoida nomi izohga o`tadi — jurnalda «nega» ko`rinadi', () => {
    const d = planAccrual({ scorePercent: 120, rules: bands });
    expect(d.accrue && d.ruleName).toBe('Reja bajarildi');
  });
});

describe('planReversalRows — bekor qilinganda ZERO-SUM', () => {
  it('bitta bonus → uni nolga keltiruvchi manfiy qator', () => {
    const rows = planReversalRows([{ kind: 'bonus', amountMinor: 50_000_00n }]);
    expect(rows).toEqual([{ kind: 'bonus', amountMinor: -50_000_00n }]);
  });

  it('allaqachon bekor qilingan (sof qoldiq 0) — ikkinchi qator YOZILMAYDI', () => {
    // Idempotentlik: bekor qilish ikki marta chaqirilsa pul «tiklanib» ketmaydi.
    const rows = planReversalRows([
      { kind: 'bonus', amountMinor: 50_000_00n },
      { kind: 'bonus', amountMinor: -50_000_00n },
    ]);
    expect(rows).toEqual([]);
  });

  it('bonus ham, jarima ham bo`lsa — har tur o`z qatori bilan nolga keladi', () => {
    const rows = planReversalRows([
      { kind: 'bonus', amountMinor: 50_000_00n },
      { kind: 'fine', amountMinor: 20_000_00n },
    ]);
    expect(rows).toEqual([
      { kind: 'bonus', amountMinor: -50_000_00n },
      { kind: 'fine', amountMinor: -20_000_00n },
    ]);
  });

  it('bir necha sikl (qabul → bekor → qabul) — faqat qoldiq teskarilanadi', () => {
    const rows = planReversalRows([
      { kind: 'bonus', amountMinor: 50_000_00n },
      { kind: 'bonus', amountMinor: -50_000_00n },
      { kind: 'bonus', amountMinor: 30_000_00n },
    ]);
    expect(rows).toEqual([{ kind: 'bonus', amountMinor: -30_000_00n }]);
  });

  it('yozuv yo`q — hech narsa', () => {
    expect(planReversalRows([])).toEqual([]);
  });
});

describe('manba (`source`) qiymatlari', () => {
  it('qabul va bekor ALOHIDA source bilan yoziladi', () => {
    // Hisobotlar «bu pul qayerdan» savoliga shu ikki qiymatdan javob beradi;
    // `manual`/`rule` yozuvlari bilan aralashib ketmaydi.
    expect(KPI_ACCRUAL_SOURCE).toBe('kpi_accept');
    expect(KPI_ACCRUAL_REVERSAL_SOURCE).toBe('kpi_accept_reversal');
    // VarChar(30) chegarasi — migratsiyasiz sig'ishi shart.
    expect(KPI_ACCRUAL_REVERSAL_SOURCE.length).toBeLessThanOrEqual(30);
  });
});
