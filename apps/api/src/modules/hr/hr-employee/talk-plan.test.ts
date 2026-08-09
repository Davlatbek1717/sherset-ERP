import { describe, expect, it } from 'vitest';
import {
  type OutcomeRow,
  PLAN_KIND,
  PLAN_STATUS,
  type PlanRow,
  isPlanKind,
  planStatus,
  summarizePlans,
} from './talk-plan.js';

/**
 * MK23 — rejalashtirilgan 1:1 suhbat va o'qitish rejasi (4M §8.1/10).
 *
 * Bu testlar rejaning uch talabini qulflaydi va ustiga **chetlab o'tish
 * yo'llarini** yopadi: bekor qilingan natija bilan «o'tkazilgan» ko'rinish ·
 * boshqa rejaning natijasi bilan yopilish · muddatsiz bandni abadiy
 * ogohlantirishga aylantirish · oddiy jurnal yozuvini reja deb sanash.
 */

const DAY = 86_400_000;

/** `@db.Date` yorlig'i — UTC yarim tun (onboarding sanalari bilan bir xil). */
function label(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function plan(over: Partial<PlanRow> = {}): PlanRow {
  return {
    id: 'p1',
    kind: PLAN_KIND.talk,
    topic: 'Kechikishlar haqida',
    dueOn: label('2026-08-20'),
    createdAt: new Date('2026-08-10T06:00:00.000Z'),
    voidedAt: null,
    ...over,
  };
}

function outcome(over: Partial<OutcomeRow> = {}): OutcomeRow {
  return {
    parentId: 'p1',
    createdAt: new Date('2026-08-20T09:00:00.000Z'),
    voidedAt: null,
    ...over,
  };
}

/** 2026-08-13, Toshkentda tush payti. */
const NOW = new Date('2026-08-13T07:00:00.000Z');

describe('isPlanKind', () => {
  it('faqat reja turlarini tan oladi — oddiy jurnal yozuvi reja EMAS', () => {
    expect(isPlanKind(PLAN_KIND.talk)).toBe(true);
    expect(isPlanKind(PLAN_KIND.training)).toBe(true);
    // Mavjud jurnal turlari (`employee-note.ts`) reja emas.
    expect(isPlanKind('talk')).toBe(false);
    expect(isPlanKind('warning')).toBe(false);
    expect(isPlanKind('praise')).toBe(false);
    expect(isPlanKind('')).toBe(false);
  });
});

describe('planStatus', () => {
  it('muddatsiz band OCHIQ turadi, lekin muddati o`tgan deb belgilanmaydi', () => {
    // O'qitish rejasining muddati ko'pincha belgilanmaydi. Uni «o'tkazib
    // yuborilgan» deb ko'rsatish taxtani yolg'on qizilga to'ldirardi.
    const s = planStatus(plan({ kind: PLAN_KIND.training, dueOn: null }), [], NOW);
    expect(s.status).toBe(PLAN_STATUS.open);
    expect(s.daysLeft).toBeNull();
    expect(s.warn).toBe(false);
  });

  it('sana bo`yicha holat: open → due_soon → due → overdue', () => {
    expect(planStatus(plan({ dueOn: label('2026-09-30') }), [], NOW).status).toBe(PLAN_STATUS.open);
    expect(planStatus(plan({ dueOn: label('2026-08-18') }), [], NOW).status).toBe(
      PLAN_STATUS.dueSoon,
    );
    expect(planStatus(plan({ dueOn: label('2026-08-13') }), [], NOW).status).toBe(PLAN_STATUS.due);
    const late = planStatus(plan({ dueOn: label('2026-08-11') }), [], NOW);
    expect(late.status).toBe(PLAN_STATUS.overdue);
    expect(late.daysLeft).toBe(-2);
    expect(late.warn).toBe(true);
  });

  it('Toshkent kun yorlig`i: ish kuni oxirida BUGUNGI suhbat kechikkan bo`lib qolmaydi', () => {
    // ⚠️ Bu qulf xom instant arifmetikasini tutadi. Toshkentda 13-avgust
    // soat 17:30 — suhbat kuni HALI TUGAMAGAN, lekin `now` ni yorliqqa
    // keltirmasdan solishtirsak (due − now)/kun = −0.52 → round = −1, ya'ni
    // taxta ish kuni davom etayotib «o'tkazib yuborilgan» deb yozardi.
    const endOfWorkday = new Date('2026-08-13T12:30:00.000Z'); // = 13-avgust 17:30
    const today = planStatus(plan({ dueOn: label('2026-08-13') }), [], endOfWorkday);
    expect(today.status).toBe(PLAN_STATUS.due);
    expect(today.daysLeft).toBe(0);

    // Teskari yo'nalish: ERTANGI suhbat bugun «bugun» bo'lib ko'rinmaydi
    // (xom arifmetika 0 = `due` berardi).
    const dayBefore = new Date('2026-08-12T12:30:00.000Z'); // = 12-avgust 17:30
    const tomorrow = planStatus(plan({ dueOn: label('2026-08-13') }), [], dayBefore);
    expect(tomorrow.status).toBe(PLAN_STATUS.dueSoon);
    expect(tomorrow.daysLeft).toBe(1);

    // Yarim tundan keyin (Toshkent 00:30) kun allaqachon almashgan.
    const afterMidnight = new Date('2026-08-12T19:30:00.000Z'); // = 13-avgust 00:30
    expect(planStatus(plan({ dueOn: label('2026-08-13') }), [], afterMidnight).daysLeft).toBe(0);
  });

  it('natija jurnalga yozilgach BAJARILDI bo`ladi va ogohlantirish TO`XTAYDI', () => {
    const s = planStatus(plan({ dueOn: label('2026-08-01') }), [outcome()], NOW);
    expect(s.status).toBe(PLAN_STATUS.done);
    expect(s.warn).toBe(false);
    expect(s.closedAt).toEqual(new Date('2026-08-20T09:00:00.000Z'));
  });

  it('BEKOR QILINGAN natija rejani QAYTA OCHADI (o`tkazilmagan suhbat yashirilmaydi)', () => {
    // Eng muhim qulf: natijani xato yozib, keyin bekor qilish rejani
    // «bajarildi» holatida qoldirsa — o'tkazilmagan suhbat ko'rinmas bo'lardi.
    const s = planStatus(
      plan({ dueOn: label('2026-08-01') }),
      [outcome({ voidedAt: new Date('2026-08-21T09:00:00.000Z') })],
      NOW,
    );
    expect(s.status).toBe(PLAN_STATUS.overdue);
    expect(s.warn).toBe(true);
    expect(s.closedAt).toBeNull();
  });

  it('boshqa rejaning natijasi bu rejani YOPMAYDI', () => {
    const s = planStatus(plan({ dueOn: label('2026-08-01') }), [outcome({ parentId: 'p2' })], NOW);
    expect(s.status).toBe(PLAN_STATUS.overdue);
  });

  it('bekor qilingan reja ogohlantirmaydi (rejadan voz kechilgan)', () => {
    const s = planStatus(
      plan({ dueOn: label('2026-08-01'), voidedAt: new Date('2026-08-05T00:00:00.000Z') }),
      [],
      NOW,
    );
    expect(s.status).toBe(PLAN_STATUS.voided);
    expect(s.warn).toBe(false);
  });
});

describe('summarizePlans', () => {
  it('o`qitish bandi tugallanmasa OCHIQ turadi, natija yozilgach yopiladi', () => {
    const rows = [plan({ id: 't1', kind: PLAN_KIND.training, topic: '1C', dueOn: null })];
    expect(summarizePlans(rows, [], NOW).openTraining).toBe(1);
    expect(summarizePlans(rows, [outcome({ parentId: 't1' })], NOW).openTraining).toBe(0);
  });

  it('muddati o`tgan suhbat eslatma beradi (javobgarlik taxtasi uchun)', () => {
    const rows = [
      plan({ id: 'a', dueOn: label('2026-08-11') }),
      plan({ id: 'b', dueOn: label('2026-08-05') }),
      plan({ id: 'c', dueOn: label('2026-09-01') }),
    ];
    const s = summarizePlans(rows, [], NOW);
    expect(s.overdueTalks).toBe(2);
    expect(s.openTalks).toBe(1);
    // Eng QADIMGI o'tkazib yuborilgani — taxtada shu sana ko'rsatiladi.
    expect(s.oldestOverdueOn).toEqual(label('2026-08-05'));
    expect(s.warnCount).toBe(2);
    expect(s.hasOverdue).toBe(true);
  });

  it('oddiy jurnal yozuvlari (talk/warning/praise) reja deb SANALMAYDI', () => {
    // Karta jurnalining butun ro'yxati shu funksiyaga tushadi: reja bo'lmagan
    // yozuvlar muddatsiz «ochiq band» bo'lib qolsa, har ogohlantirish abadiy
    // bajarilmagan vazifaga aylanardi.
    const rows = [
      plan({ id: 'n1', kind: 'warning', dueOn: null }),
      plan({ id: 'n2', kind: 'talk', dueOn: null }),
      plan({ id: 'n3', kind: 'praise', dueOn: null }),
    ];
    const s = summarizePlans(rows, [], NOW);
    expect(s.openTalks).toBe(0);
    expect(s.openTraining).toBe(0);
    expect(s.items).toHaveLength(0);
  });

  it('nextTalkOn = eng yaqin KELAYOTGAN suhbat; o`tganlar hisobga olinmaydi', () => {
    const rows = [
      plan({ id: 'past', dueOn: label('2026-08-01') }),
      plan({ id: 'far', dueOn: label('2026-10-01') }),
      plan({ id: 'near', dueOn: label('2026-08-15') }),
    ];
    expect(summarizePlans(rows, [], NOW).nextTalkOn).toEqual(label('2026-08-15'));
  });

  it('items tartibi: kechikkan → muddati yaqin → ochiq → yopilgan', () => {
    const rows = [
      plan({ id: 'done', dueOn: label('2026-08-02') }),
      plan({ id: 'open', dueOn: label('2026-09-20') }),
      plan({ id: 'late', dueOn: label('2026-08-03') }),
      plan({ id: 'soon', dueOn: label('2026-08-14') }),
    ];
    const s = summarizePlans(rows, [outcome({ parentId: 'done' })], NOW);
    expect(s.items.map((i) => i.id)).toEqual(['late', 'soon', 'open', 'done']);
    // Bekor qilingan reja ro'yxatda ham, sanoqda ham yo'q.
    const withVoided = summarizePlans(
      [...rows, plan({ id: 'gone', voidedAt: new Date('2026-08-06T00:00:00.000Z') })],
      [],
      NOW,
    );
    expect(withVoided.items.some((i) => i.id === 'gone')).toBe(false);
  });

  it('bo`sh jurnal — hech qanday ogohlantirish yo`q', () => {
    const s = summarizePlans([], [], NOW);
    expect(s).toMatchObject({
      openTalks: 0,
      overdueTalks: 0,
      openTraining: 0,
      overdueTraining: 0,
      warnCount: 0,
      hasOverdue: false,
      nextTalkOn: null,
      oldestOverdueOn: null,
    });
  });

  it('muddati o`tgan o`qitish bandi ALOHIDA sanaladi (suhbat bilan aralashmaydi)', () => {
    const rows = [
      plan({ id: 'k1', kind: PLAN_KIND.training, dueOn: label('2026-08-04') }),
      plan({ id: 's1', dueOn: label('2026-08-04') }),
    ];
    const s = summarizePlans(rows, [], NOW);
    expect(s.overdueTraining).toBe(1);
    expect(s.overdueTalks).toBe(1);
    expect(s.warnCount).toBe(2);
  });

  it('DAY qadami: bir kun oldin qo`yilgan suhbat kechikkan hisoblanadi', () => {
    const yesterday = new Date(NOW.getTime() - DAY);
    const s = planStatus(plan({ dueOn: label('2026-08-12') }), [], NOW);
    expect(s.status).toBe(PLAN_STATUS.overdue);
    expect(planStatus(plan({ dueOn: label('2026-08-12') }), [], yesterday).status).toBe(
      PLAN_STATUS.due,
    );
  });
});
