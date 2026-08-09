import { describe, expect, it } from 'vitest';
import type { RuleConfigRow } from '../queue/work-item-rules.js';
import {
  SLA_STAGE,
  SLA_STAGES,
  STAGE_OPEN_STATES,
  type StuckSubject,
  buildStuckBoard,
  isStageOpen,
  resolveSlaStages,
  slaRuleType,
} from './stuck-sla.js';

/**
 * MK10 / 4M TZ §8 — «NIMA QOTIB QOLGAN» + SLA paneli, sof qoidalar.
 *
 * Uch majburiy shartnoma (reja «Testlar (TDD)»):
 *   1. SLA ICHIDAGI ob'ekt ro'yxatga TUSHMAYDI;
 *   2. chegara SOZLAMASI ta'sir qiladi (kodda qattiq yozilmagan);
 *   3. YOPILGAN ob'ekt ro'yxatdan chiqadi.
 *
 * Uchinchisi shu yerda ma'noli bo'lishi uchun «ochiq holat» ta'rifi ham sof
 * modulda turadi (`STAGE_OPEN_STATES`): servis `where` bandini AYNAN shundan
 * quradi, ya'ni yopilgan ob'ekt umuman o'qilmaydi. Aks holda test tavtologiya
 * bo'lardi — «kirishga bermadim, chiqishda yo'q».
 */

const NOW = new Date('2026-08-09T12:00:00Z');

/** `now` dan `hours` soat OLDIN. */
function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * 3_600_000);
}

function subject(over: Partial<StuckSubject> = {}): StuckSubject {
  return {
    stage: SLA_STAGE.orderPicking,
    refId: 'doc-1',
    docType: 'customerorder',
    docName: 'ZK-2026-00001',
    stateKey: 'new',
    employeeId: null,
    employeeName: null,
    since: hoursAgo(1),
    amountMinor: null,
    currency: null,
    ...over,
  };
}

function cfg(over: Partial<RuleConfigRow> & { ruleType: string }): RuleConfigRow {
  return {
    enabled: true,
    thresholdValue: null,
    thresholdUnit: null,
    mode: 'notify',
    severity: 'warning',
    ...over,
  };
}

// ── Registr ─────────────────────────────────────────────────────────────────

describe('bosqich registri', () => {
  it('rejadagi BESH bosqichni qoplaydi', () => {
    expect(Object.keys(SLA_STAGES).sort()).toEqual(
      [
        'CLAIM_RESPONSE',
        'DOC_APPROVAL',
        'ORDER_PICKING',
        'SHIFT_CLOSE',
        'SUPPLY_ACCEPTANCE',
      ].sort(),
    );
  });

  it('har bosqichning chegarasi SOAT birligida va musbat', () => {
    for (const def of Object.values(SLA_STAGES)) {
      expect(def.thresholdUnit).toBe('hours');
      expect(def.defaultThresholdHours).toBeGreaterThan(0);
    }
  });

  it('sozlama kaliti `SLA_` prefiksi bilan — navbat qoidalari bilan urishmaydi', () => {
    expect(slaRuleType(SLA_STAGE.shiftClose)).toBe('SLA_SHIFT_CLOSE');
    for (const def of Object.values(SLA_STAGES)) {
      expect(def.ruleType.startsWith('SLA_')).toBe(true);
      // `manager_rule_configs.rule_type` — VarChar(40).
      expect(def.ruleType.length).toBeLessThanOrEqual(40);
    }
  });

  it("🔴 SLA paneli ham BLOKLAMAYDI (§5.1) — har ta'rifda `blocks: false`", () => {
    for (const def of Object.values(SLA_STAGES)) {
      expect(def.blocks).toBe(false);
    }
  });
});

// ── 3-shartnoma: yopilgan ob'ekt ────────────────────────────────────────────

describe('🔴 YOPILGAN ob`ekt ro`yxatdan chiqadi', () => {
  it('har bosqichda ochiq holatlar ro`yxati bo`sh emas', () => {
    for (const stage of Object.values(SLA_STAGE)) {
      expect(STAGE_OPEN_STATES[stage].length).toBeGreaterThan(0);
    }
  });

  it('yopilgan/hal qilingan holatlar OCHIQ deb sanalmaydi', () => {
    expect(isStageOpen(SLA_STAGE.claimResponse, 'new')).toBe(true);
    expect(isStageOpen(SLA_STAGE.claimResponse, 'resolved')).toBe(false);
    expect(isStageOpen(SLA_STAGE.claimResponse, 'closed')).toBe(false);
    expect(isStageOpen(SLA_STAGE.claimResponse, 'cancelled')).toBe(false);

    expect(isStageOpen(SLA_STAGE.orderPicking, 'picking')).toBe(true);
    expect(isStageOpen(SLA_STAGE.orderPicking, 'picked')).toBe(false);

    expect(isStageOpen(SLA_STAGE.shiftClose, 'open')).toBe(true);
    expect(isStageOpen(SLA_STAGE.shiftClose, 'closed')).toBe(false);

    expect(isStageOpen(SLA_STAGE.supplyAcceptance, 'awaiting_admin')).toBe(true);
    expect(isStageOpen(SLA_STAGE.supplyAcceptance, 'completed')).toBe(false);
    expect(isStageOpen(SLA_STAGE.supplyAcceptance, 'none')).toBe(false);

    expect(isStageOpen(SLA_STAGE.docApproval, 'draft')).toBe(true);
    expect(isStageOpen(SLA_STAGE.docApproval, 'posted')).toBe(false);
  });
});

// ── Sozlama birlashtirish ───────────────────────────────────────────────────

describe('chegara sozlamasi', () => {
  it('sozlama yo`q — registr qiymati amal qiladi', () => {
    const r = resolveSlaStages([]);
    const stage = r.get(SLA_STAGE.orderPicking);
    expect(stage?.thresholdHours).toBe(SLA_STAGES.ORDER_PICKING.defaultThresholdHours);
    expect(stage?.enabled).toBe(true);
    expect(stage?.thresholdRejected).toBe(false);
  });

  it('`hours` birligidagi sozlama qabul qilinadi', () => {
    const r = resolveSlaStages([
      cfg({ ruleType: 'SLA_ORDER_PICKING', thresholdValue: '2', thresholdUnit: 'hours' }),
    ]);
    expect(r.get(SLA_STAGE.orderPicking)?.thresholdHours).toBe(2);
    expect(r.get(SLA_STAGE.orderPicking)?.thresholdRejected).toBe(false);
  });

  it('`days` birligi soatga AYNIQ o`giriladi (24×)', () => {
    const r = resolveSlaStages([
      cfg({ ruleType: 'SLA_SUPPLY_ACCEPTANCE', thresholdValue: '3', thresholdUnit: 'days' }),
    ]);
    expect(r.get(SLA_STAGE.supplyAcceptance)?.thresholdHours).toBe(72);
  });

  it('vaqt BO`LMAGAN birlik RAD etiladi — registr qiymati qoladi va bayroq ko`rinadi', () => {
    const r = resolveSlaStages([
      cfg({ ruleType: 'SLA_CLAIM_RESPONSE', thresholdValue: '20', thresholdUnit: 'percent' }),
    ]);
    const stage = r.get(SLA_STAGE.claimResponse);
    expect(stage?.thresholdHours).toBe(SLA_STAGES.CLAIM_RESPONSE.defaultThresholdHours);
    expect(stage?.thresholdRejected).toBe(true);
  });

  it('birliksiz raqam ham RAD etiladi (birlik chegaradan ajralmaydi)', () => {
    const r = resolveSlaStages([
      cfg({ ruleType: 'SLA_CLAIM_RESPONSE', thresholdValue: '5', thresholdUnit: null }),
    ]);
    expect(r.get(SLA_STAGE.claimResponse)?.thresholdRejected).toBe(true);
  });

  it('notanish `ruleType` (navbat qoidasi) JIM tashlanadi', () => {
    const r = resolveSlaStages([
      cfg({ ruleType: 'PRICE_CHANGE', thresholdValue: '10', thresholdUnit: 'percent' }),
    ]);
    expect(r.size).toBe(Object.keys(SLA_STAGES).length);
    expect(r.get(SLA_STAGE.orderPicking)?.thresholdRejected).toBe(false);
  });
});

// ── 1-shartnoma: SLA ichidagi ob'ekt ────────────────────────────────────────

describe('🔴 SLA ICHIDAGI ob`ekt ro`yxatga tushmaydi', () => {
  const resolved = resolveSlaStages([
    cfg({ ruleType: 'SLA_ORDER_PICKING', thresholdValue: '4', thresholdUnit: 'hours' }),
  ]);

  it('chegaradan yosh ob`ekt qatorlarda yo`q, lekin JAMIDA sanaladi', () => {
    const board = buildStuckBoard([subject({ since: hoursAgo(3) })], resolved, NOW);
    expect(board.rows).toHaveLength(0);
    expect(board.overdueCount).toBe(0);
    const summary = board.stages.find((s) => s.stage === SLA_STAGE.orderPicking);
    // «Ochiq ish bor, lekin muddat ichida» — bu 0 emas, shuning uchun jami
    // alohida ko'rsatiladi.
    expect(summary?.total).toBe(1);
    expect(summary?.overdue).toBe(0);
  });

  it('chegaraga TENG yosh hali qotib qolgan emas (qat`iy `>`)', () => {
    const board = buildStuckBoard([subject({ since: hoursAgo(4) })], resolved, NOW);
    expect(board.rows).toHaveLength(0);
  });

  it('chegaradan oshgan ob`ekt qatorga tushadi va oshib ketgan vaqti hisoblanadi', () => {
    const board = buildStuckBoard([subject({ since: hoursAgo(6.5) })], resolved, NOW);
    expect(board.rows).toHaveLength(1);
    expect(board.rows[0]?.ageHours).toBeCloseTo(6.5, 6);
    expect(board.rows[0]?.thresholdHours).toBe(4);
    expect(board.rows[0]?.overdueHours).toBeCloseTo(2.5, 6);
    expect(board.overdueCount).toBe(1);
  });

  it('kelajakdagi sana manfiy yosh bermaydi va qatorga tushmaydi', () => {
    const board = buildStuckBoard(
      [subject({ since: new Date(NOW.getTime() + 3_600_000) })],
      resolved,
      NOW,
    );
    expect(board.rows).toHaveLength(0);
  });
});

// ── 2-shartnoma: sozlama ta'sir qiladi ─────────────────────────────────────

describe('🔴 chegara SOZLAMASI ta`sir qiladi (kodda qattiq emas)', () => {
  const stuck = [subject({ since: hoursAgo(3) })];

  it('registr chegarasida (4 soat) ro`yxat bo`sh — sozlama 2 soatga tushirilsa to`ladi', () => {
    const asDefault = buildStuckBoard(stuck, resolveSlaStages([]), NOW);
    expect(asDefault.rows).toHaveLength(0);

    const tightened = buildStuckBoard(
      stuck,
      resolveSlaStages([
        cfg({ ruleType: 'SLA_ORDER_PICKING', thresholdValue: '2', thresholdUnit: 'hours' }),
      ]),
      NOW,
    );
    expect(tightened.rows).toHaveLength(1);
    expect(tightened.rows[0]?.thresholdHours).toBe(2);
  });

  it('chegarani ko`tarish qatorni ro`yxatdan chiqaradi', () => {
    const relaxed = buildStuckBoard(
      [subject({ since: hoursAgo(10) })],
      resolveSlaStages([
        cfg({ ruleType: 'SLA_ORDER_PICKING', thresholdValue: '2', thresholdUnit: 'days' }),
      ]),
      NOW,
    );
    expect(relaxed.rows).toHaveLength(0);
  });

  it('jiddiylik sozlamadan keladi', () => {
    const board = buildStuckBoard(
      [subject({ since: hoursAgo(10) })],
      resolveSlaStages([
        cfg({
          ruleType: 'SLA_ORDER_PICKING',
          thresholdValue: '1',
          thresholdUnit: 'hours',
          severity: 'critical',
        }),
      ]),
      NOW,
    );
    expect(board.rows[0]?.severity).toBe('critical');
  });

  it('o`chirilgan bosqich qator BERMAYDI, lekin taxtada ko`rinib turadi', () => {
    const board = buildStuckBoard(
      [subject({ since: hoursAgo(100) })],
      resolveSlaStages([cfg({ ruleType: 'SLA_ORDER_PICKING', enabled: false })]),
      NOW,
    );
    expect(board.rows).toHaveLength(0);
    const summary = board.stages.find((s) => s.stage === SLA_STAGE.orderPicking);
    expect(summary?.enabled).toBe(false);
    // 🔴 Jim yo'qolmaydi: menejer «o'chirib qo'yilgan» ekanini ko'radi.
    expect(summary?.total).toBe(1);
    expect(summary?.overdue).toBe(0);
  });
});

// ── Taxta ───────────────────────────────────────────────────────────────────

describe('taxta tartibi va xulosasi', () => {
  const resolved = resolveSlaStages([]);

  it('eng ko`p oshib ketgani TEPADA (bosqichlar aralash bo`lsa ham)', () => {
    const board = buildStuckBoard(
      [
        subject({ refId: 'a', since: hoursAgo(6) }), // ORDER_PICKING (4h) → +2
        subject({
          refId: 'b',
          stage: SLA_STAGE.shiftClose,
          stateKey: 'open',
          since: hoursAgo(40), // SHIFT_CLOSE (12h) → +28
        }),
        subject({ refId: 'c', since: hoursAgo(9) }), // → +5
      ],
      resolved,
      NOW,
    );
    expect(board.rows.map((r) => r.refId)).toEqual(['b', 'c', 'a']);
  });

  it('bosqich xulosasida eng yomon oshish qayd etiladi', () => {
    const board = buildStuckBoard(
      [subject({ refId: 'a', since: hoursAgo(6) }), subject({ refId: 'c', since: hoursAgo(9) })],
      resolved,
      NOW,
    );
    const summary = board.stages.find((s) => s.stage === SLA_STAGE.orderPicking);
    expect(summary?.overdue).toBe(2);
    expect(summary?.worstOverdueHours).toBeCloseTo(5, 6);
  });

  it('qotib qolgani yo`q bosqichda eng yomon oshish `null` (0 EMAS)', () => {
    const board = buildStuckBoard([], resolved, NOW);
    for (const s of board.stages) {
      expect(s.overdue).toBe(0);
      // 0 soat «bir soniya kechikdi» degan ma'noni berardi — o'lchanmagan
      // narsa `null` bo'lib qoladi (NULL ≠ 0, MK09 sabog'i).
      expect(s.worstOverdueHours).toBeNull();
    }
  });

  it('taxtada BARCHA bosqich ko`rinadi — bo`shi ham', () => {
    const board = buildStuckBoard([], resolved, NOW);
    expect(board.stages).toHaveLength(Object.keys(SLA_STAGES).length);
  });

  it('`limit` qatorlarni kesadi, lekin sanoqlar TO`LIQ qoladi', () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      subject({ refId: `r${i}`, since: hoursAgo(10 + i) }),
    );
    const board = buildStuckBoard(many, resolved, NOW, { limit: 2 });
    expect(board.rows).toHaveLength(2);
    expect(board.overdueCount).toBe(5);
    expect(board.truncated).toBe(true);
  });
});
