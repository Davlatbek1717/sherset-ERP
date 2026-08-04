import { describe, expect, it } from 'vitest';
import {
  ACTOR,
  ADJUSTABLE_STATES,
  DAILY_KPI_ACTION,
  DAILY_KPI_STATE,
  DAILY_KPI_STATES,
  QUEUE_STATES,
  TRANSITIONS,
  allowedActions,
  commentRequired,
  countsTowardPayroll,
  evaluate,
  evaluateAdjust,
  isFrozen,
  reasonCodesFor,
} from './daily-kpi-fsm.js';

/**
 * Qabul qilish FSM'i.
 *
 * Bu testlar «kod ishlaydimi» degan savolga emas, «qoida buzilmadimi» degan
 * savolga javob beradi. Uchtasi ayniqsa muhim, chunki buzilsa PUL noto'g'ri
 * to'lanadi va buni hech qaysi gate ko'rmaydi:
 *   1. muzlagan kunga yozib bo'lmaydi;
 *   2. oylikka faqat qabul qilingan kun kiradi;
 *   3. sababsiz rad etish / tuzatish mumkin emas.
 */

const S = DAILY_KPI_STATE;
const A = DAILY_KPI_ACTION;

describe('muzlash — qabul qilingan kun', () => {
  it('accepted va force_accepted muzlagan, qolganlari yo`q', () => {
    expect(isFrozen(S.accepted)).toBe(true);
    expect(isFrozen(S.forceAccepted)).toBe(true);
    for (const s of [S.computed, S.pending, S.rejected, S.escalated, S.stale]) {
      expect(isFrozen(s), s).toBe(false);
    }
  });

  it('muzlagan kunga TUZATMA kiritib bo`lmaydi', () => {
    // Bu yopilmasa: oylikka ketgan raqam keyin jimgina o'zgarardi.
    for (const s of [S.accepted, S.forceAccepted]) {
      const r = evaluateAdjust({ from: s, reasonCode: 'data_error' });
      expect(r.ok, s).toBe(false);
      if (!r.ok) expect(r.failure.code).toBe('illegal_transition');
    }
  });

  it('muzlagan kunni o`zgartirish uchun avval qayta ochish kerak', () => {
    const reopen = evaluate({
      from: S.accepted,
      action: A.reopen,
      actor: ACTOR.manager,
      reasonCode: 'correction',
    });
    expect(reopen).toMatchObject({ ok: true, to: S.pending });
    expect(evaluateAdjust({ from: S.pending, reasonCode: 'data_error' }).ok).toBe(true);
  });

  it('qayta ochish SABABSIZ mumkin emas', () => {
    const r = evaluate({ from: S.accepted, action: A.reopen, actor: ACTOR.manager });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.code).toBe('reason_required');
  });
});

describe('oylik bloklash (M-Q8)', () => {
  it('faqat accepted va force_accepted oylikka kiradi', () => {
    // 4M.3 SHU funksiyani chaqiradi. Ro'yxat ikkinchi joyda takrorlansa,
    // ular vaqt o'tib bir-biridan uzoqlashadi va kimdir noto'g'ri pul oladi.
    const counted = DAILY_KPI_STATES.filter(countsTowardPayroll);
    expect(counted.sort()).toEqual([S.accepted, S.forceAccepted].sort());
  });

  it('qabul qilinmagan kun oylikka KIRMAYDI', () => {
    for (const s of [S.computed, S.pending, S.rejected, S.escalated, S.stale]) {
      expect(countsTowardPayroll(s), s).toBe(false);
    }
  });
});

describe('oqim — asosiy yo`l', () => {
  it('computed → pending → accepted', () => {
    expect(
      evaluate({ from: S.computed, action: A.openForReview, actor: ACTOR.system }),
    ).toMatchObject({ ok: true, to: S.pending });
    expect(evaluate({ from: S.pending, action: A.accept, actor: ACTOR.manager })).toMatchObject({
      ok: true,
      to: S.accepted,
    });
  });

  it('hisoblangan kunni TO`G`RIDAN-TO`G`RI qabul qilib bo`lmaydi', () => {
    // Bugungi kun hali o'zgarmoqda — uni qabul qilish yarim kunni yopish demak.
    const r = evaluate({ from: S.computed, action: A.accept, actor: ACTOR.manager });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.code).toBe('illegal_transition');
  });

  it('rad etish → tushuntirish → yana navbatga (halqa yopiq)', () => {
    expect(
      evaluate({
        from: S.pending,
        action: A.reject,
        actor: ACTOR.manager,
        reasonCode: 'variance_unexplained',
      }),
    ).toMatchObject({ ok: true, to: S.rejected });
    expect(evaluate({ from: S.rejected, action: A.explain, actor: ACTOR.employee })).toMatchObject({
      ok: true,
      to: S.pending,
    });
  });

  it('rad etish SABABSIZ mumkin emas', () => {
    const r = evaluate({ from: S.pending, action: A.reject, actor: ACTOR.manager });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.code).toBe('reason_required');
  });

  it('eskirgan kun qayta qabul qilinadi (§3.4)', () => {
    expect(evaluate({ from: S.accepted, action: A.markStale, actor: ACTOR.system })).toMatchObject({
      ok: true,
      to: S.stale,
    });
    expect(evaluate({ from: S.stale, action: A.accept, actor: ACTOR.manager })).toMatchObject({
      ok: true,
      to: S.accepted,
    });
  });

  it('MUZLAMAGAN kun eskirmaydi', () => {
    // `pending` kun shunchaki qayta hisoblanadi. Uni «eskirgan» deb belgilash
    // menejerga «bu allaqachon qabul qilingan edi» degan yolg'on signal berardi.
    for (const s of [S.pending, S.rejected, S.stale, S.computed]) {
      expect(evaluate({ from: s, action: A.markStale, actor: ACTOR.system }).ok, s).toBe(false);
    }
  });
});

describe('eskalatsiya — boshi berk ko`chadan chiqish (§1.2)', () => {
  it('javobsiz kun egaga chiqadi va egasi majburiy yopadi', () => {
    expect(
      evaluate({
        from: S.rejected,
        action: A.escalate,
        actor: ACTOR.system,
        reasonCode: 'no_response',
      }),
    ).toMatchObject({ ok: true, to: S.escalated });
    expect(
      evaluate({
        from: S.escalated,
        action: A.forceAccept,
        actor: ACTOR.owner,
        reasonCode: 'manager_absent',
      }),
    ).toMatchObject({ ok: true, to: S.forceAccepted });
  });

  it('menejer o`zi majburiy yopa OLMAYDI — bu egasining klapani', () => {
    const r = evaluate({
      from: S.escalated,
      action: A.forceAccept,
      actor: ACTOR.manager,
      reasonCode: 'manager_absent',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.code).toBe('actor_not_allowed');
  });

  it('xodim o`zining kunini qabul qila olmaydi', () => {
    const r = evaluate({ from: S.pending, action: A.accept, actor: ACTOR.employee });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.code).toBe('actor_not_allowed');
  });

  it('eskalatsiya bir tomonlama ko`cha emas — egasi qaytara oladi', () => {
    expect(
      evaluate({
        from: S.escalated,
        action: A.reopen,
        actor: ACTOR.owner,
        reasonCode: 'new_information',
      }),
    ).toMatchObject({ ok: true, to: S.pending });
  });
});

describe('sabab kodlari', () => {
  it('noma`lum sabab kodi rad etiladi', () => {
    // Erkin matn kelib qolsa, statistika bir sessiyada o'ladi.
    const r = evaluate({
      from: S.pending,
      action: A.reject,
      actor: ACTOR.manager,
      reasonCode: 'oyladim_shunday',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.code).toBe('unknown_reason');
  });

  it('«other» IZOHSIZ qabul qilinmaydi', () => {
    // Aks holda hamma «other» ni bosadi va sabab kodlari ma'nosini yo'qotadi.
    const r = evaluate({
      from: S.pending,
      action: A.reject,
      actor: ACTOR.manager,
      reasonCode: 'other',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.code).toBe('comment_required');

    expect(
      evaluate({
        from: S.pending,
        action: A.reject,
        actor: ACTOR.manager,
        reasonCode: 'other',
        comment: 'kassa apparati buzildi, qo`lda yozdik',
      }),
    ).toMatchObject({ ok: true });
  });

  it('bo`sh joydan iborat izoh izoh emas', () => {
    const r = evaluate({
      from: S.pending,
      action: A.reject,
      actor: ACTOR.manager,
      reasonCode: 'other',
      comment: '   ',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.code).toBe('comment_required');
  });

  it('commentRequired faqat «other» uchun', () => {
    expect(commentRequired('other')).toBe(true);
    expect(commentRequired('data_error')).toBe(false);
    expect(commentRequired(null)).toBe(false);
  });

  it('sabab talab qilinadigan har amalda kodlar ro`yxati bor', () => {
    // Sabab majburiy, lekin ro'yxat bo'sh bo'lsa — hech qanday kod o'tmaydi
    // yoki har qanday matn o'tadi. Ikkalasi ham noto'g'ri.
    for (const t of TRANSITIONS.filter((t) => t.reasonRequired)) {
      expect(reasonCodesFor(t.action).length, t.action).toBeGreaterThan(0);
    }
  });

  it('har ro`yxatda «other» qochish yo`li bor', () => {
    for (const t of TRANSITIONS.filter((t) => t.reasonRequired)) {
      expect(reasonCodesFor(t.action), t.action).toContain('other');
    }
  });

  it('tuzatma DOIM sabab talab qiladi', () => {
    const r = evaluateAdjust({ from: S.pending });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.code).toBe('reason_required');
  });
});

describe('jadval yaxlitligi', () => {
  it('har amal jadvalda BIR marta uchraydi', () => {
    const actions = TRANSITIONS.map((t) => t.action);
    expect(new Set(actions).size).toBe(actions.length);
  });

  it('har o`tish ma`lum holatlarga ishora qiladi', () => {
    for (const t of TRANSITIONS) {
      expect(DAILY_KPI_STATES, t.action).toContain(t.to);
      for (const f of t.from) expect(DAILY_KPI_STATES, `${t.action}:${f}`).toContain(f);
    }
  });

  it('har holatga kirish yo`li bor (o`lik holat yo`q)', () => {
    const reachable = new Set([S.computed, ...TRANSITIONS.map((t) => t.to)]);
    for (const s of DAILY_KPI_STATES) expect(reachable, s).toContain(s);
  });

  it('har holatdan chiqish yo`li bor (tuzoq holat yo`q)', () => {
    // `accepted` ham tuzoq emas: reopen va mark_stale chiqaradi.
    for (const s of DAILY_KPI_STATES) {
      const out = TRANSITIONS.filter((t) => t.from.includes(s));
      expect(out.length, s).toBeGreaterThan(0);
    }
  });

  it('navbat holatlari — qabul kutayotganlarning AYNAN o`zi', () => {
    const notFinal = DAILY_KPI_STATES.filter((s) => !isFrozen(s) && s !== S.computed);
    expect([...QUEUE_STATES].sort()).toEqual(notFinal.sort());
  });

  it('tuzatish mumkin bo`lgan holatlar muzlaganlarni O`Z ICHIGA OLMAYDI', () => {
    for (const s of ADJUSTABLE_STATES) expect(isFrozen(s), s).toBe(false);
  });

  it('unknown_action jim o`tmaydi', () => {
    const r = evaluate({
      from: S.pending,
      // biome-ignore lint/suspicious/noExplicitAny: ataylab noto'g'ri kirish
      action: 'delete_everything' as any,
      actor: ACTOR.manager,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.code).toBe('unknown_action');
  });
});

describe('allowedActions — ekran tugmalari', () => {
  it('menejer navbatdagi kunda qabul/rad/eskalatsiya ko`radi', () => {
    const acts = allowedActions(S.pending, ACTOR.manager);
    expect(acts).toContain(A.accept);
    expect(acts).toContain(A.reject);
    expect(acts).toContain(A.escalate);
    expect(acts).not.toContain(A.forceAccept);
  });

  it('xodim faqat tushuntirish bera oladi', () => {
    expect(allowedActions(S.rejected, ACTOR.employee)).toEqual([A.explain]);
    expect(allowedActions(S.pending, ACTOR.employee)).toEqual([]);
  });

  it('tizim amallari menejerga ko`rinmaydi', () => {
    expect(allowedActions(S.computed, ACTOR.manager)).toEqual([]);
    expect(allowedActions(S.accepted, ACTOR.manager)).toEqual([A.reopen]);
  });
});
