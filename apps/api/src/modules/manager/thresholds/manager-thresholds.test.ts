import { describe, expect, it } from 'vitest';
import type { RuleConfigRow } from '../queue/work-item-rules.js';
import {
  MANAGER_THRESHOLD,
  MANAGER_THRESHOLDS,
  type ManagerThresholdKey,
  effectiveThreshold,
  resolveManagerThresholds,
} from './manager-thresholds.js';

/**
 * MK13 / QAROR-B2 — «o'ylab topilgan raqam» kodda muzlab qolmasin.
 *
 * Shu registr ikki qiymatni birlashtiradi: `KPI_SCORE_CAP` (kompozit ball
 * chegarasi) va `BUDGET_WARN_PERCENT` (MK12 ogohlantirish chegarasi) — reja
 * MK12 DEFER-3 da «bir xil naqsh, ikki marta emas» deb aynan shuni talab
 * qilgan.
 *
 * ⚠️ Eng muhim shartnoma: **noto'g'ri sozlama JIMGINA qo'llanmaydi**. Foizni
 * boshqa birlikda talqin qilish shu repoda allaqachon yuz bergan bug-klass
 * (`per-unit-snapshot` hodisasi) — shuning uchun birlik mos kelmasa qiymatga
 * TEGILMAYDI va `rejectReason` ochiq qaytadi.
 */

function row(over: Partial<RuleConfigRow> & { ruleType: string }): RuleConfigRow {
  return {
    enabled: true,
    thresholdValue: null,
    thresholdUnit: 'percent',
    mode: 'notify',
    severity: 'warning',
    ...over,
  };
}

function resolved(rows: RuleConfigRow[], key: ManagerThresholdKey) {
  const r = resolveManagerThresholds(rows).get(key);
  if (!r) throw new Error(`registrda yo'q: ${key}`);
  return r;
}

describe('resolveManagerThresholds — registr va sukut qiymatlar', () => {
  it('sozlama yo`q bo`lsa registr sukuti amal qiladi', () => {
    const cap = resolved([], MANAGER_THRESHOLD.kpiScoreCap);
    expect(cap.value).toBe(150); // QAROR-B2
    expect(cap.configured).toBe(false);
    expect(cap.enabled).toBe(true);
    expect(cap.rejectReason).toBeNull();

    const warn = resolved([], MANAGER_THRESHOLD.budgetWarnPercent);
    expect(warn.value).toBe(90); // MK12 DEFAULT_WARN_PERCENT
  });

  it('registrdagi har chegara tanilgan birlikda va oralig`i mantiqiy', () => {
    for (const def of Object.values(MANAGER_THRESHOLDS)) {
      // `manager_rule_configs.threshold_unit` da ruxsat etilgan lug'at.
      expect(['percent', 'days']).toContain(def.unit);
      expect(def.min).toBeLessThanOrEqual(def.defaultValue);
      expect(def.defaultValue).toBeLessThanOrEqual(def.max);
    }
  });

  it('MK17 kun-chegaralari registrda: yo`qolish davri va egalik bo`shash muddati', () => {
    const lost = resolved([], MANAGER_THRESHOLD.lostCustomerDays);
    expect(lost.unit).toBe('days');
    expect(lost.value).toBe(60);

    // F005 ning «90-kun» taymeri ham SHU registrda — F005 qurilganda kodga
    // 90 raqamini qaytadan yozmasligi uchun ([[sla-thresholds-in-rule-config-table]]).
    const release = resolved([], MANAGER_THRESHOLD.ownershipReleaseDays);
    expect(release.unit).toBe('days');
    expect(release.value).toBe(90);
  });

  it('kun-chegarasiga `percent` qatori berilsa qiymat TALQIN QILINMAYDI', () => {
    const lost = resolved(
      [row({ ruleType: 'LOST_CUSTOMER_DAYS', thresholdValue: '30', thresholdUnit: 'percent' })],
      MANAGER_THRESHOLD.lostCustomerDays,
    );
    expect(lost.value).toBe(60); // sukut
    expect(lost.rejectReason).toBe('unit_mismatch');
  });

  it('kun-chegarasi sozlanadi (MK17 «davr sozlanadi» talabi)', () => {
    const lost = resolved(
      [row({ ruleType: 'LOST_CUSTOMER_DAYS', thresholdValue: '120', thresholdUnit: 'days' })],
      MANAGER_THRESHOLD.lostCustomerDays,
    );
    expect(lost.value).toBe(120);
    expect(lost.configured).toBe(true);
  });

  it('sozlangan qiymat registr sukutini almashtiradi', () => {
    const cap = resolved(
      [row({ ruleType: 'KPI_SCORE_CAP', thresholdValue: '200' })],
      MANAGER_THRESHOLD.kpiScoreCap,
    );
    expect(cap.value).toBe(200);
    expect(cap.configured).toBe(true);
    expect(cap.rejectReason).toBeNull();
  });

  it('Prisma Decimal satri ham, raqam ham qabul qilinadi', () => {
    expect(
      resolved(
        [row({ ruleType: 'KPI_SCORE_CAP', thresholdValue: '120.00' })],
        MANAGER_THRESHOLD.kpiScoreCap,
      ).value,
    ).toBe(120);
    expect(
      resolved(
        [row({ ruleType: 'KPI_SCORE_CAP', thresholdValue: 120 })],
        MANAGER_THRESHOLD.kpiScoreCap,
      ).value,
    ).toBe(120);
  });
});

describe('resolveManagerThresholds — noto`g`ri sozlama JIMGINA qo`llanmaydi', () => {
  it('birlik `percent` bo`lmasa qiymatga tegilmaydi (birlik-talqin bug-klassi)', () => {
    const cap = resolved(
      [row({ ruleType: 'KPI_SCORE_CAP', thresholdValue: '200', thresholdUnit: 'minor' })],
      MANAGER_THRESHOLD.kpiScoreCap,
    );
    expect(cap.value).toBe(150); // sukutga qaytdi
    expect(cap.rejectReason).toBe('unit_mismatch');
    expect(cap.configuredValue).toBe(200); // nima rad etilgani ko'rinadi
  });

  it('oraliqdan tashqari qiymat rad etiladi', () => {
    const low = resolved(
      [row({ ruleType: 'KPI_SCORE_CAP', thresholdValue: '80' })],
      MANAGER_THRESHOLD.kpiScoreCap,
    );
    expect(low.value).toBe(150);
    expect(low.rejectReason).toBe('out_of_range');

    const high = resolved(
      [row({ ruleType: 'BUDGET_WARN_PERCENT', thresholdValue: '150' })],
      MANAGER_THRESHOLD.budgetWarnPercent,
    );
    expect(high.value).toBe(90);
    expect(high.rejectReason).toBe('out_of_range');
  });

  it('raqam bo`lmagan/bo`sh qiymat rad etiladi', () => {
    for (const v of [null, '', 'abc', Number.NaN]) {
      const cap = resolved(
        [row({ ruleType: 'KPI_SCORE_CAP', thresholdValue: v as never })],
        MANAGER_THRESHOLD.kpiScoreCap,
      );
      expect(cap.value, String(v)).toBe(150);
      expect(cap.rejectReason, String(v)).toBe('not_a_number');
    }
  });

  it('begona `ruleType` (MK06 navbat / MK10 SLA qatorlari) e`tiborsiz qoldiriladi', () => {
    // Bir jadvalda yashaydilar — chegara registri ularni O'QIMAYDI.
    const cap = resolved(
      [
        row({ ruleType: 'SLA_ORDER_PICKING', thresholdValue: '4', thresholdUnit: 'hours' }),
        row({ ruleType: 'DISCOUNT_OVER_LIMIT', thresholdValue: '15' }),
      ],
      MANAGER_THRESHOLD.kpiScoreCap,
    );
    expect(cap.value).toBe(150);
    expect(cap.configured).toBe(false);
  });
});

describe('effectiveThreshold — o`chirilgan chegara = chegara YO`Q', () => {
  it('`enabled:false` da chegara qo`llanmaydi (null), sukutga QAYTMAYDI', () => {
    const cap = resolved(
      [row({ ruleType: 'KPI_SCORE_CAP', enabled: false, thresholdValue: '150' })],
      MANAGER_THRESHOLD.kpiScoreCap,
    );
    expect(cap.enabled).toBe(false);
    // 🔴 Bu «chegarasiz» degani — 150 emas. Egasi B2 da shu variantni ham
    // so'ragan edi; sxema o'zgarishisiz shu bayroq bilan beriladi.
    expect(effectiveThreshold(cap)).toBeNull();
  });

  it('yoqilgan chegara raqam qaytaradi', () => {
    expect(effectiveThreshold(resolved([], MANAGER_THRESHOLD.kpiScoreCap))).toBe(150);
  });
});
