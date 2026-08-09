import { describe, expect, it } from 'vitest';
import {
  type AcceptanceTransition,
  commentRequired,
  createAcceptanceFsm,
} from './acceptance-fsm.js';

/**
 * Qabul-FSM DVIGATELI — sof qoidalar (obyektsiz, bazasiz).
 *
 * Dvigatel `daily-kpi-fsm.ts` dan ajratib olindi (MK08): smena qabuli aynan
 * shu naqshni takrorlaydi va nusxa-ko'chirish bir kunda bir shoxni yo'qotardi
 * (repoda shu klass bo'lgan: `api-client.download()` da 401-retry shoxi
 * nusxada tushib qolgan edi). Qoida bitta joyda — jadval har obyektda o'ziniki.
 */

type S = 'a' | 'b' | 'c';
type A = 'go' | 'back' | 'stamp';
type Who = 'system' | 'manager';

const TRANSITIONS: readonly AcceptanceTransition<S, A, Who>[] = [
  {
    action: 'go',
    from: ['a'],
    to: 'b',
    actors: ['manager'],
    reasonRequired: false,
    idempotent: true,
  },
  {
    action: 'back',
    from: ['b'],
    to: 'a',
    actors: ['manager'],
    reasonRequired: true,
    idempotent: false,
  },
  {
    action: 'stamp',
    from: ['b'],
    to: 'c',
    actors: ['system'],
    reasonRequired: false,
    idempotent: true,
  },
];

const fsm = createAcceptanceFsm<S, A, Who>({
  transitions: TRANSITIONS,
  reasonCodes: { back: ['bad_data', 'other'] },
});

describe('qabul-FSM dvigateli — o`tishlar', () => {
  it('ruxsat etilgan o`tish o`tadi', () => {
    const r = fsm.evaluate({ from: 'a', action: 'go', actor: 'manager' });
    expect(r).toMatchObject({ ok: true, to: 'b', noop: false });
  });

  it('noma`lum amal — `unknown_action`', () => {
    const r = fsm.evaluate({ from: 'a', action: 'fly' as A, actor: 'manager' });
    expect(r).toMatchObject({ ok: false, failure: { code: 'unknown_action', action: 'fly' } });
  });

  it('noto`g`ri holatdan — `illegal_transition`', () => {
    const r = fsm.evaluate({ from: 'c', action: 'go', actor: 'manager' });
    expect(r).toMatchObject({ ok: false, failure: { code: 'illegal_transition', from: 'c' } });
  });

  it('begona aktyor — `actor_not_allowed`', () => {
    const r = fsm.evaluate({ from: 'a', action: 'go', actor: 'system' });
    expect(r).toMatchObject({ ok: false, failure: { code: 'actor_not_allowed', actor: 'system' } });
  });
});

describe('qabul-FSM dvigateli — idempotentlik', () => {
  it('maqsad holatida takror chaqiruv = no-op (xato EMAS)', () => {
    const r = fsm.evaluate({ from: 'b', action: 'go', actor: 'manager' });
    expect(r).toMatchObject({ ok: true, to: 'b', noop: true });
  });

  it('idempotent EMAS o`tish takrorda ham xato beradi', () => {
    // `back` maqsadi `a`; `a` dan `back` — `from` ro'yxatida yo'q.
    const r = fsm.evaluate({ from: 'a', action: 'back', actor: 'manager', reasonCode: 'bad_data' });
    expect(r).toMatchObject({ ok: false, failure: { code: 'illegal_transition' } });
  });

  it('no-op yo`lida ham aktyor tekshiriladi — «takror» teshigi yo`q', () => {
    const r = fsm.evaluate({ from: 'b', action: 'go', actor: 'system' });
    expect(r).toMatchObject({ ok: false, failure: { code: 'actor_not_allowed' } });
  });
});

describe('qabul-FSM dvigateli — sabab kodlari', () => {
  it('sabab majburiy bo`lsa, sababsiz o`tmaydi', () => {
    const r = fsm.evaluate({ from: 'b', action: 'back', actor: 'manager' });
    expect(r).toMatchObject({ ok: false, failure: { code: 'reason_required', action: 'back' } });
  });

  it('ro`yxatda yo`q sabab — `unknown_reason`', () => {
    const r = fsm.evaluate({ from: 'b', action: 'back', actor: 'manager', reasonCode: 'nope' });
    expect(r).toMatchObject({ ok: false, failure: { code: 'unknown_reason', reasonCode: 'nope' } });
  });

  it('`other` da izoh MAJBURIY', () => {
    const r = fsm.evaluate({ from: 'b', action: 'back', actor: 'manager', reasonCode: 'other' });
    expect(r).toMatchObject({ ok: false, failure: { code: 'comment_required' } });

    const ok = fsm.evaluate({
      from: 'b',
      action: 'back',
      actor: 'manager',
      reasonCode: 'other',
      comment: 'sabab',
    });
    expect(ok).toMatchObject({ ok: true, to: 'a' });
  });

  it('bo`sh joyli izoh — izoh EMAS', () => {
    const r = fsm.evaluate({
      from: 'b',
      action: 'back',
      actor: 'manager',
      reasonCode: 'other',
      comment: '   ',
    });
    expect(r).toMatchObject({ ok: false, failure: { code: 'comment_required' } });
  });

  it('kodlar ro`yxati yo`q amal ixtiyoriy sababni qabul qiladi', () => {
    const r = fsm.evaluate({ from: 'a', action: 'go', actor: 'manager', reasonCode: 'har-narsa' });
    expect(r).toMatchObject({ ok: true, to: 'b' });
  });

  it('`commentRequired` faqat `other` uchun rost', () => {
    expect(commentRequired('other')).toBe(true);
    expect(commentRequired('bad_data')).toBe(false);
    expect(commentRequired(null)).toBe(false);
  });
});

describe('qabul-FSM dvigateli — so`rovlar', () => {
  it('`allowedActions` shu holat + aktyor uchun tugmalarni beradi', () => {
    expect(fsm.allowedActions('b', 'manager')).toEqual(['back']);
    expect(fsm.allowedActions('b', 'system')).toEqual(['stamp']);
    expect(fsm.allowedActions('c', 'manager')).toEqual([]);
  });

  it('`reasonCodesFor` ro`yxatsiz amalda bo`sh massiv', () => {
    expect(fsm.reasonCodesFor('back')).toEqual(['bad_data', 'other']);
    expect(fsm.reasonCodesFor('go')).toEqual([]);
  });

  it('`checkReason` alohida ishlatilsa ham bir xil qoida (holat o`zgarmaydigan amallar uchun)', () => {
    expect(fsm.checkReason('back', null, null, { reasonRequired: true })).toMatchObject({
      code: 'reason_required',
    });
    expect(fsm.checkReason('back', 'bad_data', null, { reasonRequired: true })).toBeNull();
  });
});
