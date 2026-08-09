import { describe, expect, it } from 'vitest';
import type { PriceChangeReview } from '../inventory/price-change-control.js';
import {
  type CashVarianceRow,
  MANAGER_RULES,
  type ManagerRuleType,
  RULE_MODE,
  type RuleConfigRow,
  THRESHOLD_UNIT,
  WORK_ITEM_SEVERITY,
  buildCashVarianceCandidates,
  buildPriceChangeCandidates,
  resolveRules,
} from './work-item-rules.js';

/**
 * MK06 — qoida registri va sozlama birlashtirish (4M TZ §5.2).
 *
 * Bu yerdagi eng muhim ikki qulf:
 *   1. 🔴 **Navbat BLOKLAMAYDI** — har qoida `blocks: false` (§5.1). Test
 *      registry bo'ylab yuradi, ya'ni MK07 da qo'shiladigan 12 qoida ham
 *      shu qulfdan o'tishga majbur.
 *   2. **O'chirilgan qoida element YARATMAYDI** — rejaning 3-testi.
 */

const ACC_RULE = (over: Partial<RuleConfigRow> = {}): RuleConfigRow => ({
  ruleType: 'PRICE_CHANGE',
  enabled: true,
  thresholdValue: null,
  thresholdUnit: null,
  mode: RULE_MODE.notify,
  severity: WORK_ITEM_SEVERITY.warning,
  ...over,
});

// ── Registry qulflari ───────────────────────────────────────────────────────

describe('qoida registri', () => {
  it('🔴 HAR qoida `blocks: false` — navbat hech qachon to`smaydi', () => {
    const rules = Object.values(MANAGER_RULES);
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule.blocks).toBe(false);
    }
  });

  it('registry kaliti qoidaning `ruleType` i bilan mos (nusxa-xato qulfi)', () => {
    for (const [key, rule] of Object.entries(MANAGER_RULES)) {
      expect(rule.ruleType).toBe(key);
    }
  });

  it('chegarasi bor qoidada birlik ham bor (raqam birliksiz ma`nosiz)', () => {
    for (const rule of Object.values(MANAGER_RULES)) {
      if (rule.defaultThreshold !== null) {
        expect(rule.thresholdUnit).not.toBeNull();
      }
    }
  });

  it('MK06 namunaviy qoidalari mavjud: PRICE_CHANGE va CASH_VARIANCE', () => {
    expect(MANAGER_RULES.PRICE_CHANGE).toBeDefined();
    expect(MANAGER_RULES.CASH_VARIANCE).toBeDefined();
  });
});

// ── Sozlama birlashtirish ───────────────────────────────────────────────────

describe('resolveRules — sozlama registr ustiga qo`yiladi', () => {
  it('sozlama yo`q bo`lsa registr qiymatlari ishlatiladi', () => {
    const resolved = resolveRules([]);
    const price = resolved.get('PRICE_CHANGE');
    expect(price?.enabled).toBe(true);
    expect(price?.threshold).toBe(MANAGER_RULES.PRICE_CHANGE.defaultThreshold);
    expect(price?.thresholdUnit).toBe(MANAGER_RULES.PRICE_CHANGE.thresholdUnit);
  });

  it('chegara sozlamadan olinadi (Decimal satri ham o`qiladi)', () => {
    const resolved = resolveRules([
      ACC_RULE({ thresholdValue: '35.5000', thresholdUnit: THRESHOLD_UNIT.percent }),
    ]);
    expect(resolved.get('PRICE_CHANGE')?.threshold).toBe(35.5);
  });

  it('🔴 birligi MOS KELMAGAN chegara RAD etiladi — registr qiymati qoladi', () => {
    // «20% » ni «20 tiyin» deb o'qish jimgina yolg'on bo'lardi: chegara
    // amalda nolga tushib, butun narx tarixi navbatga quyilardi.
    const resolved = resolveRules([
      ACC_RULE({ thresholdValue: '20', thresholdUnit: THRESHOLD_UNIT.minor }),
    ]);
    const price = resolved.get('PRICE_CHANGE');
    expect(price?.threshold).toBe(MANAGER_RULES.PRICE_CHANGE.defaultThreshold);
    expect(price?.thresholdRejected).toBe(true);
  });

  it('o`chirilgan qoida `enabled: false` bo`lib qaytadi', () => {
    const resolved = resolveRules([ACC_RULE({ enabled: false })]);
    expect(resolved.get('PRICE_CHANGE')?.enabled).toBe(false);
  });

  it('notanish `ruleType` sozlamasi JIM tashlanadi (qoida o`chirilgan bo`lishi mumkin)', () => {
    const resolved = resolveRules([ACC_RULE({ ruleType: 'RULE_FROM_THE_FUTURE' })]);
    expect(resolved.has('RULE_FROM_THE_FUTURE' as ManagerRuleType)).toBe(false);
    expect(resolved.get('PRICE_CHANGE')?.enabled).toBe(true);
  });

  it('🔴 `mode: block` bazaga tushib qolsa ham `notify` ga tushiriladi', () => {
    // Bazada CHECK cheklovi bor, lekin qatlamlar mustaqil himoyalanadi.
    const resolved = resolveRules([ACC_RULE({ mode: 'block' })]);
    expect(resolved.get('PRICE_CHANGE')?.mode).toBe(RULE_MODE.notify);
    expect(resolved.get('PRICE_CHANGE')?.blocks).toBe(false);
  });

  it('notanish `severity` registr qiymatiga tushadi', () => {
    const resolved = resolveRules([ACC_RULE({ severity: 'apocalyptic' })]);
    expect(resolved.get('PRICE_CHANGE')?.severity).toBe(MANAGER_RULES.PRICE_CHANGE.defaultSeverity);
  });
});

// ── Namunaviy qoida 1: narx o'zgarishi ──────────────────────────────────────

const priceReview = (over: Partial<PriceChangeReview> = {}): PriceChangeReview =>
  ({
    auditId: 'aud-1',
    productId: 'prod-1',
    productName: 'Kabel',
    field: 'buyPrice',
    priceTypeId: null,
    beforeMinor: 100_000n,
    afterMinor: 150_000n,
    deltaMinor: 50_000n,
    deltaPercent: 50,
    unmeasuredReason: null,
    currencyCode: 'UZS',
    changedById: 'emp-1',
    changedByName: 'Ali',
    at: new Date('2026-08-08T10:00:00Z'),
    exceedsThreshold: true,
    blocks: false,
    workItem: {
      dedupKey: 'price_change:aud-1:buyPrice:-',
      ruleType: 'PRICE_CHANGE',
      subjectEmployeeId: 'emp-1',
      docType: 'product',
      docId: 'prod-1',
      amountMinor: 50_000n,
      at: new Date('2026-08-08T10:00:00Z'),
      context: {
        field: 'buyPrice',
        priceTypeId: null,
        beforeMinor: 100_000n,
        afterMinor: 150_000n,
        deltaPercent: 50,
        thresholdPercent: 20,
      },
    },
    ...over,
  }) as PriceChangeReview;

describe('namunaviy qoida — PRICE_CHANGE', () => {
  const rule = () => {
    const r = resolveRules([]).get('PRICE_CHANGE');
    if (!r) throw new Error('PRICE_CHANGE registrda yo`q');
    return r;
  };

  it('chegaradan oshgan o`zgarish nomzod beradi', () => {
    const out = buildPriceChangeCandidates([priceReview()], rule());
    expect(out).toHaveLength(1);
    expect(out[0]?.ruleType).toBe('PRICE_CHANGE');
    expect(out[0]?.dedupKey).toBe('price_change:aud-1:buyPrice:-');
    expect(out[0]?.subjectEmployeeId).toBe('emp-1');
    expect(out[0]?.amountMinor).toBe(50_000n);
    // «Qachon» = HODISA vaqti, sync vaqti emas.
    expect(out[0]?.occurredAt.toISOString()).toBe('2026-08-08T10:00:00.000Z');
  });

  it('🔴 O`CHIRILGAN qoida element yaratmaydi (reja testi №3)', () => {
    const disabled = resolveRules([ACC_RULE({ enabled: false })]).get('PRICE_CHANGE');
    if (!disabled) throw new Error('qoida yo`q');
    expect(buildPriceChangeCandidates([priceReview()], disabled)).toEqual([]);
  });

  it('chegaradan oshmagan o`zgarish nomzod bermaydi', () => {
    const out = buildPriceChangeCandidates(
      [priceReview({ exceedsThreshold: false, workItem: null })],
      rule(),
    );
    expect(out).toEqual([]);
  });

  it('o`lchanmagan foiz (baza yo`q) navbatga tushmaydi — taxminiy ayblov yo`q', () => {
    const out = buildPriceChangeCandidates(
      [
        priceReview({
          deltaPercent: null,
          deltaMinor: null,
          beforeMinor: null,
          unmeasuredReason: 'no_baseline',
          exceedsThreshold: false,
          workItem: null,
        }),
      ],
      rule(),
    );
    expect(out).toEqual([]);
  });
});

// ── Namunaviy qoida 2: kassa farqi ──────────────────────────────────────────

const variance = (over: Partial<CashVarianceRow> = {}): CashVarianceRow => ({
  id: 'var-1',
  sessionId: 'sess-1',
  cashierId: 'emp-9',
  currency: 'UZS',
  varianceMinor: -250_000n,
  kind: 'shortage',
  createdAt: new Date('2026-08-08T18:00:00Z'),
  acknowledgedAt: null,
  ...over,
});

describe('namunaviy qoida — CASH_VARIANCE', () => {
  const rule = (rows: RuleConfigRow[] = []) => {
    const r = resolveRules(rows).get('CASH_VARIANCE');
    if (!r) throw new Error('CASH_VARIANCE registrda yo`q');
    return r;
  };

  it('nolga teng bo`lmagan farq nomzod beradi', () => {
    const out = buildCashVarianceCandidates([variance()], rule());
    expect(out).toHaveLength(1);
    expect(out[0]?.dedupKey).toBe('cash_variance:var-1');
    expect(out[0]?.subjectEmployeeId).toBe('emp-9');
    expect(out[0]?.amountMinor).toBe(-250_000n);
    expect(out[0]?.currency).toBe('UZS');
    expect(out[0]?.docType).toBe('cashiersession');
    expect(out[0]?.docId).toBe('sess-1');
  });

  it('nol farq navbatga tushmaydi (akt bor, muammo yo`q)', () => {
    expect(buildCashVarianceCandidates([variance({ varianceMinor: 0n })], rule())).toEqual([]);
  });

  it('MENEJER ALLAQACHON tan olgan akt navbatga tushmaydi', () => {
    const out = buildCashVarianceCandidates(
      [variance({ acknowledgedAt: new Date('2026-08-09T09:00:00Z') })],
      rule(),
    );
    expect(out).toEqual([]);
  });

  it('chegara ko`tarilsa kichik farq tushmaydi, kattasi tushadi', () => {
    const configured = rule([
      ACC_RULE({
        ruleType: 'CASH_VARIANCE',
        thresholdValue: '300000',
        thresholdUnit: THRESHOLD_UNIT.minor,
      }),
    ]);
    expect(buildCashVarianceCandidates([variance()], configured)).toEqual([]);
    const big = buildCashVarianceCandidates([variance({ varianceMinor: -400_000n })], configured);
    expect(big).toHaveLength(1);
  });

  it('ORTIQCHA pul ham navbatga tushadi (mutlaq qiymat bo`yicha)', () => {
    const out = buildCashVarianceCandidates(
      [variance({ varianceMinor: 250_000n, kind: 'surplus' })],
      rule(),
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.amountMinor).toBe(250_000n);
    expect(out[0]?.context.kind).toBe('surplus');
  });

  it('🔴 O`CHIRILGAN qoida element yaratmaydi', () => {
    const disabled = rule([ACC_RULE({ ruleType: 'CASH_VARIANCE', enabled: false })]);
    expect(buildCashVarianceCandidates([variance()], disabled)).toEqual([]);
  });
});
