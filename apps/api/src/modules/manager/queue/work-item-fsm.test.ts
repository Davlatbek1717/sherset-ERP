import { describe, expect, it } from 'vitest';
import {
  WORK_ITEM_ACTION as ACT,
  CLOSED_WORK_ITEM_STATUSES,
  RULE_REASON_CODES,
  WORK_ITEM_STATUS as ST,
  WORK_ITEM_ACTOR as WHO,
  WORK_ITEM_REASON_CODES,
  WORK_ITEM_TRANSITIONS,
  workItemFsm,
  workItemFsmFor,
} from './work-item-fsm.js';
import { MANAGER_RULES } from './work-item-rules.js';

/**
 * MK06 — navbat elementi ustidagi HARAKATLAR (4M TZ §5.4) va yopish qoidasi
 * (§5.3). FSM umumiy dvigatel ustida qurilgan (`shared/acceptance-fsm.ts`) —
 * nusxa ko'chirilmagan.
 *
 * Eng muhim qulf: **yopuvchi har amal sabab kodini TALAB QILADI**. Test
 * jadval bo'ylab yuradi, ya'ni MK07 yangi amal qo'shsa ham qoida ushlab
 * turiladi.
 */

describe('§5.4 — TZ dagi yettita harakat mavjud', () => {
  it('to`rt asosiy + uch kengaytma amali jadvalda bor', () => {
    for (const action of [
      ACT.acknowledge, // tasdiqlash
      ACT.requestExplanation, // tushuntirish so'rash
      ACT.recordFine, // jarima yozish
      ACT.startInvestigation, // tekshiruv boshlash
      ACT.assignTask, // vazifa berish
      ACT.writeWarning, // ogohlantirish yozish
      ACT.escalate, // egaga eskalatsiya
    ]) {
      expect(workItemFsm.transitionFor(action), action).toBeDefined();
    }
  });
});

describe('§5.3 — yopilgan element sababsiz qolmaydi', () => {
  it('🔴 YOPUVCHI har o`tish `reasonRequired: true` (jadval bo`ylab)', () => {
    const closing = WORK_ITEM_TRANSITIONS.filter((t) => CLOSED_WORK_ITEM_STATUSES.has(t.to));
    expect(closing.length).toBeGreaterThan(0);
    for (const t of closing) {
      expect(t.reasonRequired, `${t.action} → ${t.to}`).toBe(true);
    }
  });

  it('🔴 yopuvchi har amalda sabab kodlari RO`YXATI bor (ixtiyoriy matn emas)', () => {
    for (const t of WORK_ITEM_TRANSITIONS) {
      if (!CLOSED_WORK_ITEM_STATUSES.has(t.to)) continue;
      expect(workItemFsm.reasonCodesFor(t.action).length, t.action).toBeGreaterThan(0);
    }
  });

  it('sababsiz tasdiqlash RAD etiladi', () => {
    const r = workItemFsm.evaluate({ from: ST.open, action: ACT.acknowledge, actor: WHO.manager });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.code).toBe('reason_required');
  });

  it('notanish sabab kodi RAD etiladi', () => {
    const r = workItemFsm.evaluate({
      from: ST.open,
      action: ACT.acknowledge,
      actor: WHO.manager,
      reasonCode: 'chunki_shunday',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.code).toBe('unknown_reason');
  });

  it('`other` sababida izoh MAJBURIY — aks holda statistika o`ladi', () => {
    const r = workItemFsm.evaluate({
      from: ST.open,
      action: ACT.acknowledge,
      actor: WHO.manager,
      reasonCode: 'other',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.code).toBe('comment_required');
  });

  it('har ro`yxatda `other` qochish yo`li bor', () => {
    for (const codes of Object.values(WORK_ITEM_REASON_CODES)) {
      expect(codes).toContain('other');
    }
  });
});

describe('o`tishlar', () => {
  const ok = (from: string, action: string, reasonCode?: string) =>
    workItemFsm.evaluate({
      from: from as never,
      action: action as never,
      actor: WHO.manager,
      reasonCode,
    });

  it('tasdiqlash: open → resolved', () => {
    const r = ok(ST.open, ACT.acknowledge, 'justified');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.to).toBe(ST.resolved);
  });

  it('tushuntirish so`rash: open → in_review (holat ochiq qoladi)', () => {
    const r = ok(ST.open, ACT.requestExplanation);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.to).toBe(ST.inReview);
  });

  it('eskalatsiya: in_review → escalated', () => {
    const r = ok(ST.inReview, ACT.escalate, 'beyond_authority');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.to).toBe(ST.escalated);
  });

  it('yopilgan elementni qayta tasdiqlash — NO-OP (ikki marta bosish)', () => {
    const r = ok(ST.resolved, ACT.acknowledge, 'justified');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.noop).toBe(true);
  });

  it('🔴 tushuntirish so`rash idempotent EMAS — har safar yangi hodisa', () => {
    const r = ok(ST.inReview, ACT.requestExplanation);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.noop).toBe(false);
  });

  it('qayta ochish: resolved → open, sabab bilan', () => {
    const r = ok(ST.resolved, ACT.reopen, 'new_evidence');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.to).toBe(ST.open);
  });

  it('yopilgan elementga tushuntirish so`rash MUMKIN EMAS', () => {
    const r = ok(ST.dismissed, ACT.requestExplanation);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.code).toBe('illegal_transition');
  });

  it('notanish amal rad etiladi', () => {
    const r = ok(ST.open, 'delete_everything');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.code).toBe('unknown_action');
  });
});

describe('aktyorlar', () => {
  it('egaga eskalatsiyani EGANING o`zi qila olmaydi', () => {
    const r = workItemFsm.evaluate({
      from: ST.open,
      action: ACT.escalate,
      actor: WHO.owner,
      reasonCode: 'beyond_authority',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.code).toBe('actor_not_allowed');
  });

  it('ega elementni yopa oladi (menejer ustidan nazorat, §7)', () => {
    const r = workItemFsm.evaluate({
      from: ST.open,
      action: ACT.acknowledge,
      actor: WHO.owner,
      reasonCode: 'justified',
    });
    expect(r.ok).toBe(true);
  });

  it('ochiq elementda menejerga ko`rinadigan tugmalar ro`yxati bo`sh emas', () => {
    expect(workItemFsm.allowedActions(ST.open, WHO.manager).length).toBeGreaterThan(0);
  });
});

describe('🔴 navbat BLOKLAMAYDI — §5.1', () => {
  it('jadvalda hujjatni to`suvchi amal YO`Q', () => {
    const forbidden = WORK_ITEM_TRANSITIONS.filter((t) =>
      /block|reject_doc|forbid|deny/i.test(t.action),
    );
    expect(forbidden).toEqual([]);
  });

  it('holatlar ro`yxatida `blocked` YO`Q', () => {
    expect(Object.values(ST)).not.toContain('blocked');
  });
});

// ── MK07 / §5.3: sabab kodlari qoidaga bog'landi ───────────────────────────

describe('MK07 §5.3 — sabab kodlari qoida turiga bog`langan', () => {
  it('HAR qoida turining o`z sabab kodlari bor (statistika shundan chiqadi)', () => {
    // TZ §5.3 kutgan tahlil: «zararga sotuvlarning 30% — raqobatchi narxi,
    // 20% — muddati o'tayotgan tovar». Umumiy `justified` bunday javob
    // bermaydi: u nima UCHUN o'rinli ekanini yozmaydi.
    for (const ruleType of Object.keys(MANAGER_RULES)) {
      const codes = RULE_REASON_CODES[ruleType as keyof typeof MANAGER_RULES];
      expect(codes, `${ruleType} uchun sabab kodlari yo'q`).toBeDefined();
      expect(codes?.length ?? 0, ruleType).toBeGreaterThan(1);
    }
  });

  it('qoida kodlari `acknowledge` ga QO`SHILADI, umumiylari yo`qolmaydi', () => {
    const fsm = workItemFsmFor('BELOW_COST');
    const codes = fsm.reasonCodesFor(ACT.acknowledge);
    expect(codes).toContain('competitor_price'); // qoidaniki
    expect(codes).toContain('justified'); // umumiysi
    expect(codes).toContain('other'); // qochish yo'li
  });

  it('qoida kodi bilan yopish O`TADI', () => {
    const fsm = workItemFsmFor('BELOW_COST');
    const verdict = fsm.evaluate({
      from: ST.open,
      action: ACT.acknowledge,
      actor: WHO.manager,
      reasonCode: 'competitor_price',
    });
    expect(verdict.ok).toBe(true);
  });

  it('🔴 BOSHQA qoidaning kodi RAD etiladi (statistika aralashmaydi)', () => {
    // `sick_leave` — davomat sababi; tan narxdan past sotuvni u bilan yopish
    // hisobotni ma'nosiz qilardi.
    const verdict = workItemFsmFor('BELOW_COST').evaluate({
      from: ST.open,
      action: ACT.acknowledge,
      actor: WHO.manager,
      reasonCode: 'sick_leave',
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.failure.code).toBe('unknown_reason');
  });

  it('🔴 noma`lum sabab kodi RAD etiladi', () => {
    const verdict = workItemFsmFor('LATE').evaluate({
      from: ST.open,
      action: ACT.acknowledge,
      actor: WHO.manager,
      reasonCode: 'shunchaki',
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.failure.code).toBe('unknown_reason');
  });

  it('sabab qoidasi QARORGA emas, SABABGA tegishli — `dismiss` kengaymaydi', () => {
    // `dismiss` = «signal noto'g'ri edi», `record_fine` = «jazoladim». Bular
    // qarorning turi haqida; hodisa NEGA bo'lgani esa faqat `acknowledge` da
    // so'raladi. Aralashtirilsa, «raqobatchi narxi tufayli DUBLIKAT» kabi
    // ma'nosiz juftliklar paydo bo'lardi.
    const fsm = workItemFsmFor('BELOW_COST');
    expect(fsm.reasonCodesFor(ACT.dismiss)).not.toContain('competitor_price');
    expect(fsm.reasonCodesFor(ACT.dismiss)).toEqual(WORK_ITEM_REASON_CODES[ACT.dismiss]);
  });

  it('qoida turi noma`lum bo`lsa umumiy katalog ishlaydi (regressiyasiz)', () => {
    expect(workItemFsmFor(null).reasonCodesFor(ACT.acknowledge)).toEqual(
      WORK_ITEM_REASON_CODES[ACT.acknowledge],
    );
    expect(workItemFsmFor('RULE_FROM_THE_FUTURE').reasonCodesFor(ACT.acknowledge)).toEqual(
      WORK_ITEM_REASON_CODES[ACT.acknowledge],
    );
  });

  it('sabab kodlari o`zaro TAKRORLANMAYDI (bir kod = bir ma`no)', () => {
    // Bir kod ikki qoidada bo'lishi mumkin (`competitor_price`), lekin BITTA
    // qoida ichida takror bo'lmasligi kerak — aks holda tanlagichda ikki
    // marta ko'rinardi.
    for (const [ruleType, codes] of Object.entries(RULE_REASON_CODES)) {
      expect(new Set(codes).size, ruleType).toBe(codes.length);
    }
  });

  it('qoida kodi umumiy katalog bilan TO`QNASHMAYDI', () => {
    const generic = new Set(Object.values(WORK_ITEM_REASON_CODES).flat());
    for (const [ruleType, codes] of Object.entries(RULE_REASON_CODES)) {
      for (const code of codes) {
        expect(generic.has(code), `${ruleType}: «${code}» umumiy katalogda ham bor`).toBe(false);
      }
    }
  });
});
