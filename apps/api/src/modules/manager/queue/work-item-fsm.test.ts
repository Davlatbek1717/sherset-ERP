import { describe, expect, it } from 'vitest';
import {
  WORK_ITEM_ACTION as ACT,
  CLOSED_WORK_ITEM_STATUSES,
  WORK_ITEM_STATUS as ST,
  WORK_ITEM_ACTOR as WHO,
  WORK_ITEM_REASON_CODES,
  WORK_ITEM_TRANSITIONS,
  workItemFsm,
} from './work-item-fsm.js';

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
