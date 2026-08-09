import { describe, expect, it } from 'vitest';
import {
  DECISION_SOURCE,
  type DecisionEventInput,
  buildDecisionJournal,
} from './decision-journal.js';

/**
 * MK21 — «Qaror jurnali» sof qatlamining testlari (4M TZ §8.1/8).
 *
 * Ekran YANGI JADVAL ochmaydi: u to'rtta MAVJUD append-only hodisa jurnalini
 * bitta ko'rinishga qo'shadi. Shuning uchun bu yerdagi testlar «yozish»ni
 * emas, **qo'shish/filtrlash/bekor qilinganini ko'rsatish** qoidalarini
 * qulflaydi.
 */

const T0 = new Date('2026-08-01T08:00:00.000Z');
const min = (n: number) => new Date(T0.getTime() + n * 60_000);

function ev(over: Partial<DecisionEventInput> & { eventId: string }): DecisionEventInput {
  return {
    source: DECISION_SOURCE.dailyKpi,
    occurredAt: min(0),
    action: 'accept',
    fromState: 'pending',
    toState: 'accepted',
    actorType: 'manager',
    actorId: 'mgr-1',
    actorName: 'Aziz',
    subjectId: 'day-1',
    subjectLabel: 'Sardor · 2026-08-01',
    subjectEmployeeId: 'emp-1',
    reasonCode: null,
    comment: null,
    money: [],
    ...over,
  };
}

const WIDE = { limit: 100 };

describe('MK21 — qaror jurnali: qo`shish va tartib', () => {
  it('to`rt manbani bitta ro`yxatga qo`shadi, eng yangisi tepada', () => {
    const out = buildDecisionJournal(
      [
        ev({ eventId: 'a', occurredAt: min(1) }),
        ev({ eventId: 'b', source: DECISION_SOURCE.workItem, occurredAt: min(3) }),
        ev({ eventId: 'c', source: DECISION_SOURCE.shift, occurredAt: min(2) }),
        ev({ eventId: 'd', source: DECISION_SOURCE.supply, occurredAt: min(4) }),
      ],
      WIDE,
    );

    expect(out.rows.map((r) => r.eventId)).toEqual(['d', 'b', 'c', 'a']);
    expect(out.rows.map((r) => r.key)).toEqual([
      'supply:d',
      'work_item:b',
      'shift:c',
      'daily_kpi:a',
    ]);
  });

  it('bir xil vaqtdagi hodisalar DETERMINISTIK tartibda (manba, keyin id)', () => {
    const same = min(5);
    const out = buildDecisionJournal(
      [
        ev({ eventId: 'z', source: DECISION_SOURCE.workItem, occurredAt: same }),
        ev({ eventId: 'y', source: DECISION_SOURCE.workItem, occurredAt: same }),
        ev({ eventId: 'x', source: DECISION_SOURCE.dailyKpi, occurredAt: same }),
      ],
      WIDE,
    );

    expect(out.rows.map((r) => r.key)).toEqual(['daily_kpi:x', 'work_item:y', 'work_item:z']);
  });
});

describe('MK21 — tizim hodisalari yashirilmaydi, SANALADI', () => {
  const events = [
    ev({ eventId: 'human', occurredAt: min(1) }),
    ev({
      eventId: 'sys',
      occurredAt: min(2),
      action: 'mark_stale',
      actorType: 'system',
      actorId: null,
      actorName: null,
    }),
  ];

  it('sukut bo`yicha faqat ODAM qarorlari, tizim soni ochiq aytiladi', () => {
    const out = buildDecisionJournal(events, WIDE);
    expect(out.rows.map((r) => r.eventId)).toEqual(['human']);
    // Yashirilgan qator JIMGINA yo'qolmaydi — ekranda soni ko'rinadi.
    expect(out.hiddenSystemCount).toBe(1);
  });

  it('`includeSystem` bilan tizim hodisalari ham chiqadi', () => {
    const out = buildDecisionJournal(events, { ...WIDE, includeSystem: true });
    expect(out.rows.map((r) => r.eventId)).toEqual(['sys', 'human']);
    expect(out.hiddenSystemCount).toBe(0);
  });
});

describe('MK21 — BEKOR QILINGAN yozuv ko`rinib qoladi (reja testi 2)', () => {
  const accept = ev({ eventId: 'acc', occurredAt: min(1) });
  const reopen = ev({
    eventId: 'rop',
    occurredAt: min(2),
    action: 'reopen',
    fromState: 'accepted',
    toState: 'pending',
  });

  it('bekor qilingan qaror O`CHMAYDI — belgi bilan qoladi', () => {
    const out = buildDecisionJournal([accept, reopen], WIDE);

    const row = out.rows.find((r) => r.eventId === 'acc');
    expect(row).toBeDefined();
    expect(row?.voided).toBe(true);
    expect(row?.voidedByKey).toBe('daily_kpi:rop');
    expect(out.summary.voidedCount).toBe(1);
  });

  it('bekor qiluvchi hodisa OYNADAN TASHQARIDA bo`lsa ham belgi qo`yiladi', () => {
    // Qaror 1-avgustda, qayta ochilishi 5-avgustda; ekran oynasi 1–2 avgust.
    const late = ev({
      eventId: 'rop-late',
      occurredAt: new Date('2026-08-05T10:00:00.000Z'),
      action: 'reopen',
      fromState: 'accepted',
      toState: 'pending',
    });

    const out = buildDecisionJournal([accept, late], {
      ...WIDE,
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-02T00:00:00.000Z'),
    });

    expect(out.rows.map((r) => r.eventId)).toEqual(['acc']);
    expect(out.rows[0]?.voided).toBe(true);
  });

  it('FILTR bekor qiluvchi hodisani kessa ham belgi saqlanadi', () => {
    const out = buildDecisionJournal([accept, reopen], { ...WIDE, action: 'accept' });
    expect(out.rows.map((r) => r.eventId)).toEqual(['acc']);
    expect(out.rows[0]?.voided).toBe(true);
  });

  it('bekor qiluvchi hodisaning O`ZI bekor qilingan deb belgilanmaydi', () => {
    const out = buildDecisionJournal([accept, reopen], WIDE);
    expect(out.rows.find((r) => r.eventId === 'rop')?.voided).toBe(false);
  });

  it('`adjust` — qayta ochish uni bekor QILMAYDI (tuzatma kuchida qoladi)', () => {
    const adjust = ev({
      eventId: 'adj',
      occurredAt: min(1),
      action: 'adjust',
      fromState: 'pending',
      toState: 'pending',
    });
    const out = buildDecisionJournal([adjust, reopen], WIDE);
    expect(out.rows.find((r) => r.eventId === 'adj')?.voided).toBe(false);
  });

  it('BOSHQA sub`ektning qayta ochilishi begona qarorni bekor qilmaydi', () => {
    const other = ev({
      eventId: 'rop-other',
      occurredAt: min(2),
      subjectId: 'day-2',
      action: 'reopen',
      fromState: 'accepted',
      toState: 'pending',
    });
    const out = buildDecisionJournal([accept, other], WIDE);
    expect(out.rows.find((r) => r.eventId === 'acc')?.voided).toBe(false);
  });

  it('qabul topshirig`ida (supply) teskari amal yo`q — bekor qilish belgisi qo`yilmaydi', () => {
    const supplyOk = ev({
      eventId: 's1',
      source: DECISION_SOURCE.supply,
      occurredAt: min(1),
      action: 'admin_ok',
      fromState: 'omborchi_ok',
      toState: 'admin_ok',
      subjectId: 'sup-1',
    });
    const supplyReject = ev({
      eventId: 's2',
      source: DECISION_SOURCE.supply,
      occurredAt: min(2),
      action: 'reject',
      fromState: 'admin_ok',
      toState: 'rejected',
      subjectId: 'sup-1',
    });
    const out = buildDecisionJournal([supplyOk, supplyReject], WIDE);
    expect(out.rows.every((r) => r.voided === false)).toBe(true);
  });
});

describe('MK21 — filtrlar', () => {
  const events = [
    ev({ eventId: 'k1', occurredAt: min(1), actorId: 'mgr-1', reasonCode: 'justified' }),
    ev({
      eventId: 'w1',
      source: DECISION_SOURCE.workItem,
      occurredAt: min(2),
      action: 'dismiss',
      actorId: 'mgr-2',
      actorName: 'Bek',
      reasonCode: 'false_positive',
      subjectId: 'item-1',
      subjectEmployeeId: 'emp-2',
    }),
  ];

  it('manba bo`yicha', () => {
    const out = buildDecisionJournal(events, { ...WIDE, sources: [DECISION_SOURCE.workItem] });
    expect(out.rows.map((r) => r.eventId)).toEqual(['w1']);
  });

  it('qaror qabul qilgan xodim bo`yicha', () => {
    const out = buildDecisionJournal(events, { ...WIDE, actorId: 'mgr-2' });
    expect(out.rows.map((r) => r.eventId)).toEqual(['w1']);
  });

  it('sabab kodi bo`yicha', () => {
    const out = buildDecisionJournal(events, { ...WIDE, reasonCode: 'justified' });
    expect(out.rows.map((r) => r.eventId)).toEqual(['k1']);
  });

  it('qaror TEGISHLI bo`lgan xodim bo`yicha (sub`ekt)', () => {
    const out = buildDecisionJournal(events, { ...WIDE, subjectEmployeeId: 'emp-2' });
    expect(out.rows.map((r) => r.eventId)).toEqual(['w1']);
  });

  it('davr oralig`i YARIM-OCHIQ: [from, to)', () => {
    const out = buildDecisionJournal(events, {
      ...WIDE,
      from: min(1),
      to: min(2),
    });
    // min(1) kiradi, min(2) — kirmaydi.
    expect(out.rows.map((r) => r.eventId)).toEqual(['k1']);
  });
});

describe('MK21 — kesish HALOL, jamlar ekran bilan mos', () => {
  const many = Array.from({ length: 5 }, (_, i) =>
    ev({ eventId: `e${i}`, occurredAt: min(i + 1), action: i % 2 === 0 ? 'accept' : 'reject' }),
  );

  it('kesilganda `truncated` va to`liq son ochiq aytiladi', () => {
    const out = buildDecisionJournal(many, { limit: 2 });
    expect(out.rows).toHaveLength(2);
    expect(out.truncated).toBe(true);
    expect(out.totalCount).toBe(5);
  });

  it('JAMLAR kesilgandan KEYINGI qatorlar bo`yicha — ekrandagi raqam bilan mos', () => {
    const out = buildDecisionJournal(many, { limit: 2 });
    const summed = out.summary.byAction.reduce((s, a) => s + a.count, 0);
    expect(summed).toBe(out.rows.length);
    expect(out.summary.bySource.reduce((s, a) => s + a.count, 0)).toBe(out.rows.length);
  });
});

describe('MK21 — «natijasi» ustuni', () => {
  it('hodisadan chiqqan PUL yozuvi qatorda ko`rinadi', () => {
    const out = buildDecisionJournal(
      [ev({ eventId: 'acc', money: [{ kind: 'bonus', amountMinor: 50_000n }] })],
      WIDE,
    );
    expect(out.rows[0]?.money).toEqual([{ kind: 'bonus', amountMinor: 50_000n }]);
  });

  it('teskari (manfiy) yozuv qayta ochish qatorida ko`rinadi — pul jimgina yo`qolmaydi', () => {
    const out = buildDecisionJournal(
      [
        ev({
          eventId: 'acc',
          occurredAt: min(1),
          money: [{ kind: 'bonus', amountMinor: 50_000n }],
        }),
        ev({
          eventId: 'rop',
          occurredAt: min(2),
          action: 'reopen',
          fromState: 'accepted',
          toState: 'pending',
          money: [{ kind: 'bonus', amountMinor: -50_000n }],
        }),
      ],
      WIDE,
    );
    expect(out.rows.find((r) => r.eventId === 'rop')?.money).toEqual([
      { kind: 'bonus', amountMinor: -50_000n },
    ]);
  });
});

describe('MK21 — tanlagich variantlari (facets) o`zini o`zi qulflamaydi', () => {
  const events = [
    ev({ eventId: 'a', occurredAt: min(1), actorId: 'mgr-1', actorName: 'Aziz' }),
    ev({
      eventId: 'b',
      occurredAt: min(2),
      actorId: 'mgr-2',
      actorName: 'Bek',
      action: 'reject',
      reasonCode: 'discipline',
    }),
  ];

  it('aktyor tanlangandan KEYIN ham ikkala aktyor ro`yxatda qoladi', () => {
    const out = buildDecisionJournal(events, { ...WIDE, actorId: 'mgr-1' });
    expect(out.rows.map((r) => r.eventId)).toEqual(['a']);
    expect(out.facets.actors.map((a) => a.actorId).sort()).toEqual(['mgr-1', 'mgr-2']);
    expect(out.facets.actions.map((a) => a.action)).toEqual(['accept', 'reject']);
    expect(out.facets.reasons.map((r) => r.reasonCode)).toEqual(['discipline']);
  });

  it('davr va manba filtri esa variantlarni TORAYTIRADI (oyna — asos)', () => {
    const out = buildDecisionJournal(events, { ...WIDE, from: min(2) });
    expect(out.facets.actors.map((a) => a.actorId)).toEqual(['mgr-2']);
  });

  it('tizim hodisalari ko`rsatilmasa, variantlarda ham chiqmaydi', () => {
    const out = buildDecisionJournal(
      [
        ...events,
        ev({
          eventId: 's',
          occurredAt: min(3),
          actorType: 'system',
          actorId: null,
          actorName: null,
        }),
      ],
      WIDE,
    );
    expect(out.facets.actors.some((a) => a.actorId === null)).toBe(false);
  });
});

describe('MK21 — halollik: nomsiz aktyor «Tizim» ga aylanmaydi', () => {
  it('o`chgan xodim `actorId` bilan qoladi, `actorName` null', () => {
    const out = buildDecisionJournal(
      [ev({ eventId: 'x', actorId: 'gone-1', actorName: null })],
      WIDE,
    );
    const row = out.rows[0];
    expect(row?.actorId).toBe('gone-1');
    expect(row?.actorName).toBeNull();
    // Aktyor turi «system» EMAS — bu odam qarori, ismi topilmagani boshqa gap.
    expect(row?.actorType).toBe('manager');
  });
});
