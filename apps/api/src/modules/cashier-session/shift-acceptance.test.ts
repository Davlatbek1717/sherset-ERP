import { describe, expect, it } from 'vitest';
import {
  ACCOUNTABLE_STATES,
  SHIFT_ACCEPTANCE_ACTION as ACT,
  SHIFT_ACTOR,
  SHIFT_QUEUE_STATES,
  SHIFT_ACCEPTANCE_STATE as ST,
  allowedShiftActions,
  awaitsCashier,
  evaluateShiftAcceptance as evaluate,
  isAcceptanceSettled,
  isAccountable,
  shiftReasonCodesFor,
} from './shift-acceptance.js';

/**
 * SMENA QABULI — sof FSM (MK08, 4M TZ §6).
 *
 * Kunlik KPI qabulining naqshi smena obyektiga ko'chirildi. Bu yerda BAZA ham,
 * Nest ham yo'q — qoida bazasiz sinaladi.
 */

const MGR = SHIFT_ACTOR.manager;

describe('smena qabuli — asosiy yo`l', () => {
  it('smena yopilganda tizim uni ko`rikka qo`yadi: open → pending', () => {
    expect(
      evaluate({ from: ST.open, action: ACT.openForReview, actor: SHIFT_ACTOR.system }),
    ).toMatchObject({ ok: true, to: ST.pending });
  });

  it('menejer qabul qiladi: pending → accepted', () => {
    expect(evaluate({ from: ST.pending, action: ACT.accept, actor: MGR })).toMatchObject({
      ok: true,
      to: ST.accepted,
      noop: false,
    });
  });

  it('yopilmagan smenani qabul qilib bo`lmaydi', () => {
    expect(evaluate({ from: ST.open, action: ACT.accept, actor: MGR })).toMatchObject({
      ok: false,
      failure: { code: 'illegal_transition', from: ST.open },
    });
  });

  it('kassir o`z smenasini O`ZI qabul qila olmaydi', () => {
    expect(
      evaluate({ from: ST.pending, action: ACT.accept, actor: SHIFT_ACTOR.cashier }),
    ).toMatchObject({
      ok: false,
      failure: { code: 'actor_not_allowed', actor: SHIFT_ACTOR.cashier },
    });
  });

  it('takror qabul = no-op (409 emas) — menejer ro`yxatni ketma-ket yopadi', () => {
    expect(evaluate({ from: ST.accepted, action: ACT.accept, actor: MGR })).toMatchObject({
      ok: true,
      to: ST.accepted,
      noop: true,
    });
  });
});

describe('smena qabuli — rad etish → tushuntirish halqasi (TZ §3.3)', () => {
  it('rad etish SABABSIZ o`tmaydi', () => {
    expect(evaluate({ from: ST.pending, action: ACT.reject, actor: MGR })).toMatchObject({
      ok: false,
      failure: { code: 'reason_required' },
    });
  });

  it('rad etish sabab bilan o`tadi', () => {
    expect(
      evaluate({
        from: ST.pending,
        action: ACT.reject,
        actor: MGR,
        reasonCode: 'variance_unexplained',
      }),
    ).toMatchObject({ ok: true, to: ST.rejected });
  });

  it('ro`yxatda yo`q sabab rad etiladi', () => {
    expect(
      evaluate({ from: ST.pending, action: ACT.reject, actor: MGR, reasonCode: 'chunki' }),
    ).toMatchObject({ ok: false, failure: { code: 'unknown_reason' } });
  });

  it('`other` sababda izoh MAJBURIY', () => {
    expect(
      evaluate({ from: ST.pending, action: ACT.reject, actor: MGR, reasonCode: 'other' }),
    ).toMatchObject({ ok: false, failure: { code: 'comment_required' } });
  });

  it('KASSIR tushuntirish beradi va smena navbatga QAYTADI: rejected → pending', () => {
    expect(
      evaluate({ from: ST.rejected, action: ACT.explain, actor: SHIFT_ACTOR.cashier }),
    ).toMatchObject({ ok: true, to: ST.pending, noop: false });
  });

  it('tushuntirish idempotent EMAS — har javob yangi hodisa', () => {
    // `pending` dan `explain` — halqa allaqachon yopilgan, takror o'tmaydi.
    expect(
      evaluate({ from: ST.pending, action: ACT.explain, actor: SHIFT_ACTOR.cashier }),
    ).toMatchObject({ ok: false, failure: { code: 'illegal_transition' } });
  });

  it('rad etilgan smena KASSIR javobini kutadi', () => {
    expect(awaitsCashier(ST.rejected)).toBe(true);
    expect(awaitsCashier(ST.pending)).toBe(false);
    expect(awaitsCashier(ST.accepted)).toBe(false);
  });
});

describe('smena qabuli — eskalatsiya va egasi', () => {
  it('javobsiz smena egaga chiqadi (sabab majburiy)', () => {
    expect(evaluate({ from: ST.rejected, action: ACT.escalate, actor: MGR })).toMatchObject({
      ok: false,
      failure: { code: 'reason_required' },
    });
    expect(
      evaluate({ from: ST.rejected, action: ACT.escalate, actor: MGR, reasonCode: 'no_response' }),
    ).toMatchObject({ ok: true, to: ST.escalated });
  });

  it('majburiy yopishni FAQAT egasi qiladi', () => {
    expect(
      evaluate({
        from: ST.escalated,
        action: ACT.forceAccept,
        actor: MGR,
        reasonCode: 'owner_decision',
      }),
    ).toMatchObject({ ok: false, failure: { code: 'actor_not_allowed' } });
    expect(
      evaluate({
        from: ST.escalated,
        action: ACT.forceAccept,
        actor: SHIFT_ACTOR.owner,
        reasonCode: 'owner_decision',
      }),
    ).toMatchObject({ ok: true, to: ST.forceAccepted });
  });
});

describe('smena qabuli — qayta ochish va eskirish', () => {
  it('qabul qilingan smenani qayta ochish SABAB talab qiladi', () => {
    expect(evaluate({ from: ST.accepted, action: ACT.reopen, actor: MGR })).toMatchObject({
      ok: false,
      failure: { code: 'reason_required' },
    });
    expect(
      evaluate({
        from: ST.accepted,
        action: ACT.reopen,
        actor: MGR,
        reasonCode: 'new_information',
      }),
    ).toMatchObject({ ok: true, to: ST.pending });
  });

  it('faqat YOPILGAN qabul eskiradi (chek keyin tahrirlansa)', () => {
    expect(
      evaluate({ from: ST.accepted, action: ACT.markStale, actor: SHIFT_ACTOR.system }),
    ).toMatchObject({ ok: true, to: ST.stale });
    // Navbatda turgan smenani «eskirdi» deb belgilash menejerga yolg'on signal.
    expect(
      evaluate({ from: ST.pending, action: ACT.markStale, actor: SHIFT_ACTOR.system }),
    ).toMatchObject({ ok: false, failure: { code: 'illegal_transition' } });
  });

  it('eskirgan smena qayta qabul qilinadi', () => {
    expect(evaluate({ from: ST.stale, action: ACT.accept, actor: MGR })).toMatchObject({
      ok: true,
      to: ST.accepted,
    });
  });
});

describe('smena qabuli — so`rovlar', () => {
  it('yopilgan qabul = accepted | force_accepted', () => {
    expect(isAcceptanceSettled(ST.accepted)).toBe(true);
    expect(isAcceptanceSettled(ST.forceAccepted)).toBe(true);
    expect(isAcceptanceSettled(ST.pending)).toBe(false);
    expect(isAcceptanceSettled(ST.stale)).toBe(false);
    expect(isAcceptanceSettled(ST.open)).toBe(false);
  });

  it('menejer navbati — hal qilinmagan to`rt holat', () => {
    expect([...SHIFT_QUEUE_STATES].sort()).toEqual(
      [ST.pending, ST.rejected, ST.stale, ST.escalated].sort(),
    );
    expect(SHIFT_QUEUE_STATES).not.toContain(ST.open);
  });

  it('javobgarlik: qabul qilinmagan smena kassir ustida QOLADI', () => {
    for (const s of SHIFT_QUEUE_STATES) expect(isAccountable(s)).toBe(true);
    expect(isAccountable(ST.accepted)).toBe(false);
    expect(isAccountable(ST.forceAccepted)).toBe(false);
    // Ochiq smena javobgarligi ALOHIDA majburiyat (`open_shift`) — bu yerda
    // ikki marta sanalmaydi.
    expect(isAccountable(ST.open)).toBe(false);
    expect([...ACCOUNTABLE_STATES].sort()).toEqual([...SHIFT_QUEUE_STATES].sort());
  });

  it('tugmalar ro`yxati holat va aktyorga bog`liq', () => {
    expect(allowedShiftActions(ST.pending, MGR).sort()).toEqual(
      [ACT.accept, ACT.reject, ACT.escalate].sort(),
    );
    expect(allowedShiftActions(ST.rejected, SHIFT_ACTOR.cashier)).toEqual([ACT.explain]);
    expect(allowedShiftActions(ST.pending, SHIFT_ACTOR.cashier)).toEqual([]);
  });

  it('sabab kodlari yopiq ro`yxat — kassa farqi tili', () => {
    expect(shiftReasonCodesFor(ACT.reject)).toContain('variance_unexplained');
    expect(shiftReasonCodesFor(ACT.reject)).toContain('zreport_mismatch');
    expect(shiftReasonCodesFor(ACT.reject)).toContain('other');
    expect(shiftReasonCodesFor(ACT.accept)).toEqual([]);
  });
});
