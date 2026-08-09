import { describe, expect, it } from 'vitest';
import type { StockSignalRow } from '../inventory/stock-signals.js';
import {
  type CashierAuditRow,
  type DebtRow,
  type ExpectedWorkday,
  type InventoryVarianceRow,
  type LateAttendanceRow,
  type PickingTaskRow,
  buildAbsentCandidates,
  buildBelowCostCandidates,
  buildBelowWholesaleCandidates,
  buildBigDebtCandidates,
  buildBigDiscountCandidates,
  buildInventoryVarianceCandidates,
  buildLateCandidates,
  buildOverdueDebtCandidates,
  buildPickingSlaCandidates,
  buildShiftOutOfScheduleCandidates,
  buildStockSignalCandidates,
} from './rule-candidates.js';
import { type MANAGER_RULES, type ResolvedRule, resolveRules } from './work-item-rules.js';

/**
 * MK07 / 4M TZ §5.2 — HAR QOIDA UCHUN yoqadigan va yoqmaydigan stsenariy.
 *
 * Reja shuni talab qiladi: «har qoida uchun kamida bitta yoqadigan va bitta
 * yoqmaydigan». Yoqmaydigan stsenariy MUHIMROQ — u qoidaning CHEGARASI
 * borligini isbotlaydi. Chegarasiz qoida navbatni ko'madi va menejer uni
 * o'qishni to'xtatadi (bu esa nazoratning o'limi).
 *
 * `rule` har testda `resolveRules([])` dan olinadi — ya'ni testlar registr
 * qiymatlari bilan yuradi, o'zi yozgan raqam bilan emas.
 */

const NOW = new Date('2026-08-09T10:00:00Z');
const PERIOD = '2026-08';

function ruleOf(type: keyof typeof MANAGER_RULES): ResolvedRule {
  const rule = resolveRules([]).get(type);
  if (!rule) throw new Error(`registrda yo'q: ${type}`);
  return rule;
}

/** Sozlangan chegara bilan (registr qiymatini almashtiradi). */
function ruleWith(type: keyof typeof MANAGER_RULES, threshold: number): ResolvedRule {
  return { ...ruleOf(type), threshold };
}

// ── Zararga sotuv / chegirma — manba `CashierAuditEvent` ────────────────────

const auditRow = (over: Partial<CashierAuditRow> = {}): CashierAuditRow => ({
  id: 'ev-1',
  employeeId: 'emp-1',
  sessionId: 'ses-1',
  type: 'SOLD_BELOW_COST',
  docId: 'sale-1',
  payload: { productId: 'p-1', productName: 'Kabel', quantity: '2', lossMinor: '150000' },
  createdAt: new Date('2026-08-08T09:00:00Z'),
  ...over,
});

describe('BELOW_COST — tan narxdan past sotuv', () => {
  it('YOQADI: zarar chegaradan katta', () => {
    const out = buildBelowCostCandidates([auditRow()], ruleOf('BELOW_COST'));
    expect(out).toHaveLength(1);
    expect(out[0]?.ruleType).toBe('BELOW_COST');
    expect(out[0]?.amountMinor).toBe(150_000n);
    expect(out[0]?.subjectEmployeeId).toBe('emp-1');
    expect(out[0]?.docType).toBe('retailsale');
    expect(out[0]?.dedupKey).toBe('below_cost:ev-1');
  });

  it('YOQMAYDI: zarar sozlangan chegaradan kichik', () => {
    const out = buildBelowCostCandidates([auditRow()], ruleWith('BELOW_COST', 200_000));
    expect(out).toEqual([]);
  });

  it('boshqa turdagi hodisa BELOW_COST ga aylanmaydi', () => {
    const out = buildBelowCostCandidates([auditRow({ type: 'REFUND' })], ruleOf('BELOW_COST'));
    expect(out).toEqual([]);
  });

  it('zarar yozilmagan hodisa JIM TASHLANMAYDI — `amountMinor: null` bilan chiqadi', () => {
    // O'lchanmagan ≠ nol. Chegara qo'llanmaydi: taqqoslashga raqam yo'q.
    const out = buildBelowCostCandidates(
      [auditRow({ payload: { productId: 'p-1' } })],
      ruleWith('BELOW_COST', 999_999_999),
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.amountMinor).toBeNull();
  });
});

describe('BIG_DISCOUNT — katta chegirma', () => {
  const discount = (percent: number) =>
    auditRow({
      id: 'ev-d',
      type: 'PRICE_CHANGED',
      payload: {
        productId: 'p-1',
        basePriceMinor: '1000000',
        diffMinor: '-250000',
        discountPercent: percent,
      },
    });

  it('YOQADI: chegirma 25% > 10% (TZ chegarasi)', () => {
    const out = buildBigDiscountCandidates([discount(25)], ruleOf('BIG_DISCOUNT'));
    expect(out).toHaveLength(1);
    expect(out[0]?.ruleType).toBe('BIG_DISCOUNT');
    // «Qancha» — chegirma summasi, tiyin (musbat).
    expect(out[0]?.amountMinor).toBe(250_000n);
    expect(out[0]?.context.discountPercent).toBe(25);
  });

  it('YOQMAYDI: chegirma 5% chegaradan past', () => {
    expect(buildBigDiscountCandidates([discount(5)], ruleOf('BIG_DISCOUNT'))).toEqual([]);
  });

  it('narx OSHIRILGAN bo`lsa chegirma emas (manfiy foiz)', () => {
    // `PRICE_CHANGED` ikki tomonga ham yoziladi; oshirish chegirma qoidasi emas.
    expect(buildBigDiscountCandidates([discount(-30)], ruleOf('BIG_DISCOUNT'))).toEqual([]);
  });
});

describe('BELOW_WHOLESALE — optom poldan past', () => {
  const row = auditRow({
    id: 'ev-w',
    type: 'SOLD_BELOW_WHOLESALE',
    payload: { productId: 'p-1', wholesaleMinor: '900000', belowByMinor: '120000' },
  });

  it('YOQADI: poldan pastlik chegaradan katta', () => {
    const out = buildBelowWholesaleCandidates([row], ruleOf('BELOW_WHOLESALE'));
    expect(out).toHaveLength(1);
    expect(out[0]?.amountMinor).toBe(120_000n);
    expect(out[0]?.dedupKey).toBe('below_wholesale:ev-w');
  });

  it('YOQMAYDI: sozlangan chegaradan kichik', () => {
    expect(buildBelowWholesaleCandidates([row], ruleWith('BELOW_WHOLESALE', 500_000))).toEqual([]);
  });
});

describe('SHIFT_OUT_OF_SCHEDULE — jadvaldan tashqari smena', () => {
  const row = auditRow({
    id: 'ev-s',
    type: 'SHIFT_OUT_OF_SCHEDULE',
    docId: 'ses-9',
    payload: { smenaName: 'Kechki', reason: 'Buyurtma yetkazish' },
  });

  it('YOQADI: hodisa bor — element yaratiladi, sabab kontekstda', () => {
    const out = buildShiftOutOfScheduleCandidates([row], ruleOf('SHIFT_OUT_OF_SCHEDULE'));
    expect(out).toHaveLength(1);
    expect(out[0]?.docType).toBe('cashiersession');
    expect(out[0]?.docId).toBe('ses-9');
    expect(out[0]?.context.reason).toBe('Buyurtma yetkazish');
    // Vaqt o'lchovi — pul emas.
    expect(out[0]?.amountMinor).toBeNull();
  });

  it('YOQMAYDI: qoida o`chirilgan', () => {
    const off = { ...ruleOf('SHIFT_OUT_OF_SCHEDULE'), enabled: false };
    expect(buildShiftOutOfScheduleCandidates([row], off)).toEqual([]);
  });
});

// ── Qarz ───────────────────────────────────────────────────────────────────

const debtRow = (over: Partial<DebtRow> = {}): DebtRow => ({
  id: 'debt-1',
  name: 'QRZ-2026-00007',
  counterpartyId: 'cp-1',
  counterpartyName: 'Alisher',
  totalMinor: 600_000_000n,
  paidMinor: 0n,
  currency: 'UZS',
  status: 'unpaid',
  createdAt: new Date('2026-08-01T00:00:00Z'),
  ownerId: 'emp-7',
  issuedById: 'emp-9',
  ...over,
});

describe('BIG_DEBT — katta qarz', () => {
  it('YOQADI: qoldiq 6 mln > 5 mln (TZ chegarasi)', () => {
    const out = buildBigDebtCandidates([debtRow()], ruleOf('BIG_DEBT'), PERIOD);
    expect(out).toHaveLength(1);
    expect(out[0]?.amountMinor).toBe(600_000_000n);
    expect(out[0]?.subjectEmployeeId).toBe('emp-7');
    expect(out[0]?.docType).toBe('debt');
    // HOLAT qoidasi — kalitda OY bor (har oy bir marta qayta ko'tariladi).
    expect(out[0]?.dedupKey).toBe('big_debt:debt-1:2026-08');
  });

  it('YOQMAYDI: to`lovdan keyingi QOLDIQ chegaradan past', () => {
    // Jami hamon 6 mln, lekin 5.9 mln to'langan — qarz emas.
    const out = buildBigDebtCandidates(
      [debtRow({ paidMinor: 590_000_000n })],
      ruleOf('BIG_DEBT'),
      PERIOD,
    );
    expect(out).toEqual([]);
  });

  it('yopilgan qarz navbatga tushmaydi', () => {
    const out = buildBigDebtCandidates([debtRow({ status: 'paid' })], ruleOf('BIG_DEBT'), PERIOD);
    expect(out).toEqual([]);
  });

  it('mas`ul yo`q bo`lsa qarzni BERGAN kassirga bog`lanadi', () => {
    const out = buildBigDebtCandidates([debtRow({ ownerId: null })], ruleOf('BIG_DEBT'), PERIOD);
    expect(out[0]?.subjectEmployeeId).toBe('emp-9');
  });
});

describe('OVERDUE_DEBT — muddati o`tgan qarz', () => {
  const old = debtRow({ id: 'debt-2', createdAt: new Date('2026-06-01T00:00:00Z') });

  it('YOQADI: 69 kun > 30 kun', () => {
    const out = buildOverdueDebtCandidates([old], ruleOf('OVERDUE_DEBT'), NOW, PERIOD);
    expect(out).toHaveLength(1);
    expect(out[0]?.context.overdueDays).toBe(69);
    expect(out[0]?.dedupKey).toBe('overdue_debt:debt-2:2026-08');
  });

  it('YOQMAYDI: 8 kunlik qarz hali muddatida', () => {
    const fresh = debtRow({ createdAt: new Date('2026-08-01T00:00:00Z') });
    expect(buildOverdueDebtCandidates([fresh], ruleOf('OVERDUE_DEBT'), NOW, PERIOD)).toEqual([]);
  });

  it('to`liq to`langan eski qarz muddati o`tgan hisoblanmaydi', () => {
    const paid = { ...old, paidMinor: old.totalMinor, status: 'paid' };
    expect(buildOverdueDebtCandidates([paid], ruleOf('OVERDUE_DEBT'), NOW, PERIOD)).toEqual([]);
  });
});

// ── Smena va davomat ───────────────────────────────────────────────────────

const lateRow = (over: Partial<LateAttendanceRow> = {}): LateAttendanceRow => ({
  id: 'att-1',
  employeeId: 'emp-3',
  employeeName: 'Dilnoza',
  checkInTime: new Date('2026-08-08T04:20:00Z'),
  lateMinutes: 20,
  ...over,
});

describe('LATE — kechikish', () => {
  it('YOQADI: 20 daqiqa kechikish (chegara 0 = har kechikish)', () => {
    const out = buildLateCandidates([lateRow()], ruleOf('LATE'));
    expect(out).toHaveLength(1);
    expect(out[0]?.context.lateMinutes).toBe(20);
    expect(out[0]?.docType).toBe('hrattendance');
    expect(out[0]?.dedupKey).toBe('late:att-1');
    expect(out[0]?.amountMinor).toBeNull();
  });

  it('YOQMAYDI: vaqtida kelgan (0 daqiqa)', () => {
    expect(buildLateCandidates([lateRow({ lateMinutes: 0 })], ruleOf('LATE'))).toEqual([]);
  });

  it('YOQMAYDI: sozlangan 30 daqiqalik chegaradan past', () => {
    expect(buildLateCandidates([lateRow()], ruleWith('LATE', 30))).toEqual([]);
  });
});

const expected = (over: Partial<ExpectedWorkday> = {}): ExpectedWorkday => ({
  employeeId: 'emp-4',
  employeeName: 'Bekzod',
  localDate: '2026-08-07',
  isWorkday: true,
  dayStart: new Date('2026-08-06T19:00:00Z'),
  ...over,
});

describe('ABSENT — ish kunida kelmagan', () => {
  it('YOQADI: ish kuni, davomat belgisi yo`q', () => {
    const out = buildAbsentCandidates([expected()], new Set(), ruleOf('ABSENT'));
    expect(out).toHaveLength(1);
    expect(out[0]?.dedupKey).toBe('absent:emp-4:2026-08-07');
    expect(out[0]?.subjectEmployeeId).toBe('emp-4');
    expect(out[0]?.docId).toBeNull();
  });

  it('YOQMAYDI: o`sha kuni davomat belgisi bor', () => {
    const out = buildAbsentCandidates(
      [expected()],
      new Set(['emp-4:2026-08-07']),
      ruleOf('ABSENT'),
    );
    expect(out).toEqual([]);
  });

  it('YOQMAYDI: dam olish kuni (jadval bo`yicha ish kuni emas)', () => {
    const out = buildAbsentCandidates(
      [expected({ isWorkday: false })],
      new Set(),
      ruleOf('ABSENT'),
    );
    expect(out).toEqual([]);
  });
});

// ── Ombor ──────────────────────────────────────────────────────────────────

const signal = (over: Partial<StockSignalRow> = {}): StockSignalRow => ({
  kind: 'stockout_risk',
  storeId: 'st-1',
  storeName: 'Asosiy',
  assortmentKind: 'product',
  assortmentId: 'p-5',
  name: 'Rozetka',
  qty: '3.000000',
  signalQty: '11.000000',
  amountMinor: 4_400_000n,
  measured: true,
  unmeasuredReason: null,
  dailySaleQty: '1.000000',
  coverDays: 3,
  daysIdle: null,
  ...over,
});

describe('LOW_STOCK — tugash xavfi', () => {
  it('YOQADI: `stockout_risk` signali navbat elementiga aylanadi', () => {
    const out = buildStockSignalCandidates(
      [signal()],
      ruleOf('LOW_STOCK'),
      'LOW_STOCK',
      PERIOD,
      NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.amountMinor).toBe(4_400_000n);
    expect(out[0]?.docType).toBe('product');
    expect(out[0]?.dedupKey).toBe('low_stock:st-1:product:p-5:2026-08');
  });

  it('YOQMAYDI: `dead_money` signali LOW_STOCK ga aylanmaydi', () => {
    const dead = signal({ kind: 'dead_money', daysIdle: 200 });
    expect(
      buildStockSignalCandidates([dead], ruleOf('LOW_STOCK'), 'LOW_STOCK', PERIOD, NOW),
    ).toEqual([]);
  });

  it('o`lchanmagan pul `null` bo`lib qoladi (0 EMAS)', () => {
    const noCost = signal({ amountMinor: null, measured: false, unmeasuredReason: 'no_cost' });
    const out = buildStockSignalCandidates([noCost], ruleOf('LOW_STOCK'), 'LOW_STOCK', PERIOD, NOW);
    expect(out[0]?.amountMinor).toBeNull();
    expect(out[0]?.context.unmeasuredReason).toBe('no_cost');
  });
});

describe('DEAD_STOCK — qotib qolgan pul', () => {
  const dead = signal({ kind: 'dead_money', daysIdle: 200, signalQty: '40.000000' });

  it('YOQADI: 200 kun sotuvsiz zaxira', () => {
    const out = buildStockSignalCandidates([dead], ruleOf('DEAD_STOCK'), 'DEAD_STOCK', PERIOD, NOW);
    expect(out).toHaveLength(1);
    expect(out[0]?.context.daysIdle).toBe(200);
  });

  it('YOQMAYDI: tarixi umuman yo`q tovar «o`lik» deb ayblanmaydi', () => {
    // `no_history` — bu ma'lumot sifati savoli (MK09 paneli), qoida buzilishi
    // emas. Uni bu yerga qo'shsak, hech qachon sotilmagan har tovar menejer
    // navbatiga tushib, navbatni ko'mardi.
    const noHistory = signal({
      kind: 'dead_money',
      amountMinor: null,
      measured: false,
      unmeasuredReason: 'no_history',
      daysIdle: null,
    });
    expect(
      buildStockSignalCandidates([noHistory], ruleOf('DEAD_STOCK'), 'DEAD_STOCK', PERIOD, NOW),
    ).toEqual([]);
  });
});

const task = (over: Partial<PickingTaskRow> = {}): PickingTaskRow => ({
  id: 'task-1',
  sourceName: 'Buyurtma №12',
  assigneeId: 'emp-8',
  assigneeName: 'Omborchi',
  status: 'pending',
  skladNo: 2,
  createdAt: new Date('2026-08-09T02:00:00Z'), // 8 soat oldin
  ...over,
});

describe('PICKING_SLA — yig`ish topshirig`i qotib qoldi', () => {
  it('YOQADI: 8 soat > 4 soat chegara', () => {
    const out = buildPickingSlaCandidates([task()], ruleOf('PICKING_SLA'), NOW);
    expect(out).toHaveLength(1);
    expect(out[0]?.context.ageHours).toBe(8);
    expect(out[0]?.subjectEmployeeId).toBe('emp-8');
    expect(out[0]?.docType).toBe('restocktask');
    expect(out[0]?.dedupKey).toBe('picking_sla:task-1');
  });

  it('YOQMAYDI: 1 soatlik yangi topshiriq', () => {
    const fresh = task({ createdAt: new Date('2026-08-09T09:00:00Z') });
    expect(buildPickingSlaCandidates([fresh], ruleOf('PICKING_SLA'), NOW)).toEqual([]);
  });

  it('YOQMAYDI: topshiriq bajarilgan yoki bekor qilingan', () => {
    const done = task({ status: 'done' });
    const cancelled = task({ id: 'task-2', status: 'cancelled' });
    expect(buildPickingSlaCandidates([done, cancelled], ruleOf('PICKING_SLA'), NOW)).toEqual([]);
  });
});

const inventory = (over: Partial<InventoryVarianceRow> = {}): InventoryVarianceRow => ({
  id: 'inv-1',
  name: 'ИН-2026-00003',
  storeId: 'st-1',
  storeName: 'Asosiy',
  ownerId: 'emp-2',
  occurredAt: new Date('2026-08-08T12:00:00Z'),
  positions: [
    { varianceQty: '-3.000000', costMinor: 500_000n },
    { varianceQty: '0.000000', costMinor: 100_000n },
  ],
  ...over,
});

describe('INVENTORY_VARIANCE — inventarizatsiya farqi', () => {
  it('YOQADI: 3 dona kamomad × 5 000 so`m = 15 000 so`m', () => {
    const out = buildInventoryVarianceCandidates([inventory()], ruleOf('INVENTORY_VARIANCE'));
    expect(out).toHaveLength(1);
    expect(out[0]?.amountMinor).toBe(1_500_000n);
    expect(out[0]?.docType).toBe('inventory');
    expect(out[0]?.dedupKey).toBe('inventory_variance:inv-1');
  });

  it('YOQMAYDI: hamma pozitsiya farqsiz (aynan mos keldi)', () => {
    const clean = inventory({
      positions: [{ varianceQty: '0.000000', costMinor: 500_000n }],
    });
    expect(buildInventoryVarianceCandidates([clean], ruleOf('INVENTORY_VARIANCE'))).toEqual([]);
  });

  it('YOQMAYDI: farq puli sozlangan chegaradan kichik', () => {
    const rule = ruleWith('INVENTORY_VARIANCE', 2_000_000);
    expect(buildInventoryVarianceCandidates([inventory()], rule)).toEqual([]);
  });

  it('tan narxsiz farq JIM TASHLANMAYDI — `amountMinor: null` bilan chiqadi', () => {
    const noCost = inventory({
      positions: [{ varianceQty: '-3.000000', costMinor: null }],
    });
    const out = buildInventoryVarianceCandidates([noCost], ruleWith('INVENTORY_VARIANCE', 9_999));
    expect(out).toHaveLength(1);
    expect(out[0]?.amountMinor).toBeNull();
    expect(out[0]?.context.unmeasuredPositions).toBe(1);
  });
});

// ── Umumiy shartnoma ───────────────────────────────────────────────────────

describe('umumiy: o`chirilgan qoida HECH QACHON element yaratmaydi', () => {
  it('12 quruvchining hammasi `enabled: false` da bo`sh qaytaradi', () => {
    const off = (type: keyof typeof MANAGER_RULES): ResolvedRule => ({
      ...ruleOf(type),
      enabled: false,
    });

    expect(buildBelowCostCandidates([auditRow()], off('BELOW_COST'))).toEqual([]);
    expect(
      buildBigDiscountCandidates(
        [auditRow({ type: 'PRICE_CHANGED', payload: { discountPercent: 90 } })],
        off('BIG_DISCOUNT'),
      ),
    ).toEqual([]);
    expect(
      buildBelowWholesaleCandidates(
        [auditRow({ type: 'SOLD_BELOW_WHOLESALE', payload: { belowByMinor: '1' } })],
        off('BELOW_WHOLESALE'),
      ),
    ).toEqual([]);
    expect(
      buildShiftOutOfScheduleCandidates(
        [auditRow({ type: 'SHIFT_OUT_OF_SCHEDULE' })],
        off('SHIFT_OUT_OF_SCHEDULE'),
      ),
    ).toEqual([]);
    expect(buildBigDebtCandidates([debtRow()], off('BIG_DEBT'), PERIOD)).toEqual([]);
    expect(
      buildOverdueDebtCandidates(
        [debtRow({ createdAt: new Date('2026-01-01T00:00:00Z') })],
        off('OVERDUE_DEBT'),
        NOW,
        PERIOD,
      ),
    ).toEqual([]);
    expect(buildLateCandidates([lateRow()], off('LATE'))).toEqual([]);
    expect(buildAbsentCandidates([expected()], new Set(), off('ABSENT'))).toEqual([]);
    expect(
      buildStockSignalCandidates([signal()], off('LOW_STOCK'), 'LOW_STOCK', PERIOD, NOW),
    ).toEqual([]);
    expect(
      buildStockSignalCandidates(
        [signal({ kind: 'dead_money', daysIdle: 200 })],
        off('DEAD_STOCK'),
        'DEAD_STOCK',
        PERIOD,
        NOW,
      ),
    ).toEqual([]);
    expect(buildPickingSlaCandidates([task()], off('PICKING_SLA'), NOW)).toEqual([]);
    expect(buildInventoryVarianceCandidates([inventory()], off('INVENTORY_VARIANCE'))).toEqual([]);
  });

  it('har quruvchi O`Z `ruleType` ini qo`yadi (nusxa-xato qulfi)', () => {
    // Nusxa ko'chirishda `ruleType` almashtirilmasa, element noto'g'ri
    // filtrga tushib, menejer «qoida ishlamayapti» deb o'ylardi.
    const pairs: Array<[string, string]> = [
      [
        buildBelowCostCandidates([auditRow()], ruleOf('BELOW_COST'))[0]?.ruleType ?? '',
        'BELOW_COST',
      ],
      [
        buildBigDiscountCandidates(
          [auditRow({ type: 'PRICE_CHANGED', payload: { discountPercent: 90, diffMinor: '-5' } })],
          ruleOf('BIG_DISCOUNT'),
        )[0]?.ruleType ?? '',
        'BIG_DISCOUNT',
      ],
      [
        buildBelowWholesaleCandidates(
          [auditRow({ type: 'SOLD_BELOW_WHOLESALE', payload: { belowByMinor: '5' } })],
          ruleOf('BELOW_WHOLESALE'),
        )[0]?.ruleType ?? '',
        'BELOW_WHOLESALE',
      ],
      [
        buildShiftOutOfScheduleCandidates(
          [auditRow({ type: 'SHIFT_OUT_OF_SCHEDULE' })],
          ruleOf('SHIFT_OUT_OF_SCHEDULE'),
        )[0]?.ruleType ?? '',
        'SHIFT_OUT_OF_SCHEDULE',
      ],
      [
        buildBigDebtCandidates([debtRow()], ruleOf('BIG_DEBT'), PERIOD)[0]?.ruleType ?? '',
        'BIG_DEBT',
      ],
      [
        buildOverdueDebtCandidates(
          [debtRow({ createdAt: new Date('2026-01-01T00:00:00Z') })],
          ruleOf('OVERDUE_DEBT'),
          NOW,
          PERIOD,
        )[0]?.ruleType ?? '',
        'OVERDUE_DEBT',
      ],
      [buildLateCandidates([lateRow()], ruleOf('LATE'))[0]?.ruleType ?? '', 'LATE'],
      [
        buildAbsentCandidates([expected()], new Set(), ruleOf('ABSENT'))[0]?.ruleType ?? '',
        'ABSENT',
      ],
      [
        buildStockSignalCandidates([signal()], ruleOf('LOW_STOCK'), 'LOW_STOCK', PERIOD, NOW)[0]
          ?.ruleType ?? '',
        'LOW_STOCK',
      ],
      [
        buildStockSignalCandidates(
          [signal({ kind: 'dead_money', daysIdle: 200 })],
          ruleOf('DEAD_STOCK'),
          'DEAD_STOCK',
          PERIOD,
          NOW,
        )[0]?.ruleType ?? '',
        'DEAD_STOCK',
      ],
      [
        buildPickingSlaCandidates([task()], ruleOf('PICKING_SLA'), NOW)[0]?.ruleType ?? '',
        'PICKING_SLA',
      ],
      [
        buildInventoryVarianceCandidates([inventory()], ruleOf('INVENTORY_VARIANCE'))[0]
          ?.ruleType ?? '',
        'INVENTORY_VARIANCE',
      ],
    ];

    expect(pairs).toHaveLength(12);
    for (const [actual, wanted] of pairs) expect(actual).toBe(wanted);
  });
});
