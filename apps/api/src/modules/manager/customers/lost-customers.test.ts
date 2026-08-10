import { describe, expect, it } from 'vitest';
import {
  type CustomerActivityInput,
  LOST_REASON_CODES,
  type LostCustomerOptions,
  buildLostCustomerList,
  isLostReasonCode,
  lostCustomerRow,
  summarizeLostCustomers,
} from './lost-customers.js';

/**
 * MK17 — «YO'QOLGAN MIJOZLAR SIGNALI» sof qoidalari (4M TZ §8.1/3).
 *
 * Rejadagi uch qabul testi shu faylda:
 *   (1) yangi mijoz «yo'qolgan» deb belgilanmaydi;
 *   (2) davr sozlamasi ta'sir qiladi;
 *   (3) 90-kun egalik taymeri bilan ziddiyat yo'q.
 *
 * Vaqt HAR DOIM argument — `Date.now()` bu faylda yo'q.
 */

const NOW = new Date('2026-08-10T09:00:00.000Z'); // Toshkentda 14:00

const OPTS: LostCustomerOptions = { lostDays: 60, ownershipReleaseDays: 90 };

function daysBefore(n: number): Date {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
}

function input(over: Partial<CustomerActivityInput> & { counterpartyId: string }) {
  const base: CustomerActivityInput = {
    counterpartyId: over.counterpartyId,
    name: `CP ${over.counterpartyId}`,
    phone: null,
    ownerId: null,
    ownerName: null,
    lastDemandAt: null,
    lastRetailAt: null,
    firstDemandAt: null,
    firstRetailAt: null,
    purchaseCount: 0,
    reason: null,
  };
  return { ...base, ...over };
}

describe('lostCustomerRow — kim «yo`qolgan», kim emas', () => {
  it('(1) HECH QACHON xarid qilmagan mijoz «yo`qolgan» EMAS', () => {
    // Yangi ochilgan mijoz ham, eski-yu hech narsa sotib olmagan mijoz ham
    // shu yerga tushadi: «yo'qolgan» = ILGARI sotib olgan, endi to'xtagan.
    const row = lostCustomerRow(input({ counterpartyId: 'cp-new' }), OPTS, NOW);
    expect(row.bucket).toBe('never_purchased');
    // NULL ≠ 0 — «0 kun faolliksiz» degan yolg'on ko'rsatkich chiqmaydi.
    expect(row.inactiveDays).toBeNull();
    expect(row.lastPurchaseAt).toBeNull();
  });

  it('(1-b) kecha sotib olgan mijoz faol', () => {
    const row = lostCustomerRow(
      input({ counterpartyId: 'cp-a', lastDemandAt: daysBefore(1), purchaseCount: 3 }),
      OPTS,
      NOW,
    );
    expect(row.bucket).toBe('active');
    expect(row.inactiveDays).toBe(1);
  });

  it('chegara AYNAN kunida «yo`qolgan» bo`ladi (>=, > emas)', () => {
    const edge = lostCustomerRow(
      input({ counterpartyId: 'cp-edge', lastDemandAt: daysBefore(60), purchaseCount: 1 }),
      OPTS,
      NOW,
    );
    expect(edge.inactiveDays).toBe(60);
    expect(edge.bucket).toBe('lost');

    const before = lostCustomerRow(
      input({ counterpartyId: 'cp-b', lastDemandAt: daysBefore(59), purchaseCount: 1 }),
      OPTS,
      NOW,
    );
    expect(before.bucket).toBe('active');
  });

  it('kunlar KALENDAR bo`yicha (Toshkent) sanaladi, ms/86400000 bilan emas', () => {
    // «Hozir» = 10-avgust 14:00 (Toshkent).
    //
    // (a) Xarid 9-avgust 01:00 (Toshkent) = 8-avgust 20:00 UTC.
    //     Xom ayirma 37 soat ⇒ `Math.round(1.54)` = **2**. Kalendar farqi = **1**.
    //     Shu holat aynan xom-ms hisobini tutadi.
    expect(
      lostCustomerRow(
        input({
          counterpartyId: 'cp-cal-a',
          lastDemandAt: new Date('2026-08-08T20:00:00.000Z'),
          purchaseCount: 1,
        }),
        OPTS,
        NOW,
      ).inactiveDays,
    ).toBe(1);

    // (b) Xarid 10-avgust 00:30 (Toshkent) = 9-avgust 19:30 UTC — BUGUN.
    //     UTC kalendari bo'yicha 1 kun chiqardi; Toshkent bo'yicha 0.
    expect(
      lostCustomerRow(
        input({
          counterpartyId: 'cp-cal-b',
          lastDemandAt: new Date('2026-08-09T19:30:00.000Z'),
          purchaseCount: 1,
        }),
        OPTS,
        NOW,
      ).inactiveDays,
    ).toBe(0);
  });

  it('(2) davr sozlamasi natijani o`zgartiradi', () => {
    const seed = input({
      counterpartyId: 'cp-p',
      lastDemandAt: daysBefore(45),
      purchaseCount: 2,
    });
    expect(lostCustomerRow(seed, { ...OPTS, lostDays: 60 }, NOW).bucket).toBe('active');
    expect(lostCustomerRow(seed, { ...OPTS, lostDays: 30 }, NOW).bucket).toBe('lost');
  });

  it('chakana savdo ham FAOLLIK — POS mijozi «yo`qolgan» bo`lib qolmaydi', () => {
    // Ulgurji jo'natma yo'q, lekin kassada xarid bor: eng yangi sana yutadi.
    const row = lostCustomerRow(
      input({
        counterpartyId: 'cp-pos',
        lastDemandAt: daysBefore(200),
        lastRetailAt: daysBefore(3),
        firstDemandAt: daysBefore(400),
        purchaseCount: 12,
      }),
      OPTS,
      NOW,
    );
    expect(row.bucket).toBe('active');
    expect(row.inactiveDays).toBe(3);
  });

  it('birinchi xarid ikki manbaning ERTAROG`i', () => {
    const row = lostCustomerRow(
      input({
        counterpartyId: 'cp-first',
        lastDemandAt: daysBefore(100),
        lastRetailAt: daysBefore(80),
        firstDemandAt: daysBefore(300),
        firstRetailAt: daysBefore(500),
        purchaseCount: 4,
      }),
      OPTS,
      NOW,
    );
    expect(row.firstPurchaseAt?.toISOString()).toBe(daysBefore(500).toISOString());
    expect(row.lastPurchaseAt?.toISOString()).toBe(daysBefore(80).toISOString());
  });
});

describe('sabab belgisi — yopiq ro`yxat, qo`lda qo`yiladi', () => {
  it('tanilgan kod o`qiladi, izoh va muallif ko`rinadi', () => {
    const row = lostCustomerRow(
      input({
        counterpartyId: 'cp-r',
        lastDemandAt: daysBefore(90),
        purchaseCount: 1,
        reason: {
          code: 'price',
          note: 'Raqobatchi arzonroq berdi',
          at: daysBefore(2),
          authorId: 'emp-1',
          authorName: 'Anna',
        },
      }),
      OPTS,
      NOW,
    );
    expect(row.reasonCode).toBe('price');
    expect(row.reasonNote).toBe('Raqobatchi arzonroq berdi');
    expect(row.reasonAuthorName).toBe('Anna');
  });

  it('TANILMAGAN kod jimgina «sabab yo`q» ga aylanmaydi — xom qiymat ko`rinadi', () => {
    const row = lostCustomerRow(
      input({
        counterpartyId: 'cp-x',
        lastDemandAt: daysBefore(90),
        purchaseCount: 1,
        reason: { code: 'qandaydir', note: null, at: daysBefore(1), authorId: null },
      }),
      OPTS,
      NOW,
    );
    // Kod ro'yxatda yo'q ⇒ `reasonCode` null, LEKIN xom qiymat yo'qolmaydi:
    // aks holda operator «sabab belgilanmagan» deb qayta belgilardi.
    expect(row.reasonCode).toBeNull();
    expect(row.reasonRaw).toBe('qandaydir');
  });

  it('yopiq ro`yxat qo`riqchisi', () => {
    for (const code of LOST_REASON_CODES) expect(isLostReasonCode(code)).toBe(true);
    for (const bad of ['', 'PRICE', 'narx', null, 42]) expect(isLostReasonCode(bad)).toBe(false);
  });
});

describe('(3) 90-kun egalik taymeri bilan ziddiyat', () => {
  it('yo`qolish davri egalik muddatidan QISQA bo`lsa ziddiyat yo`q', () => {
    const s = summarizeLostCustomers(
      buildLostCustomerList([], { lostDays: 60, ownershipReleaseDays: 90 }, NOW),
      { lostDays: 60, ownershipReleaseDays: 90 },
    );
    expect(s.ownershipConflict).toBe(false);
  });

  it('yo`qolish davri egalik muddatidan UZUN bo`lsa ziddiyat OCHIQ aytiladi', () => {
    // Bu holda har «yo'qolgan» mijoz allaqachon egasiz qolgan bo'lardi ⇒
    // «sotuvchi kesimi» strukturaviy ravishda bo'sh chiqadi. Jimgina bo'sh
    // jadval ko'rsatish — eng yomon variant.
    const opts = { lostDays: 120, ownershipReleaseDays: 90 };
    const s = summarizeLostCustomers(buildLostCustomerList([], opts, NOW), opts);
    expect(s.ownershipConflict).toBe(true);
  });

  it('egalik muddatidan oshgan mijoz kesimdan YO`QOLMAYDI, alohida sanaladi', () => {
    const rows = buildLostCustomerList(
      [
        input({
          counterpartyId: 'cp-old',
          ownerId: 'emp-1',
          ownerName: 'Anna',
          lastDemandAt: daysBefore(120), // 90 kundan oshgan
          purchaseCount: 5,
        }),
        input({
          counterpartyId: 'cp-mid',
          ownerId: 'emp-1',
          ownerName: 'Anna',
          lastDemandAt: daysBefore(70), // yo'qolgan, lekin hali egalikda
          purchaseCount: 5,
        }),
      ],
      OPTS,
      NOW,
    );
    const s = summarizeLostCustomers(rows, OPTS);
    expect(s.lostCount).toBe(2);
    // Ikkalasi ham Anna kesimida qoladi — F005 taymeri hali ishlamagan
    // bo'lishi mumkin, ya'ni `ownerId` hamon to'g'ri javob.
    expect(s.byOwner).toEqual([{ ownerId: 'emp-1', ownerName: 'Anna', lostCount: 2 }]);
    // …lekin taymer ishga tushsa nechtasi egasiz qolishi OCHIQ ko'rinadi.
    expect(s.releaseDueCount).toBe(1);
  });

  it('egalik taymeri O`CHIRILGAN bo`lsa (null) ziddiyat ham, `releaseDue` ham yo`q', () => {
    const opts = { lostDays: 200, ownershipReleaseDays: null };
    const rows = buildLostCustomerList(
      [
        input({
          counterpartyId: 'cp-off',
          ownerId: 'emp-1',
          ownerName: 'Anna',
          lastDemandAt: daysBefore(400),
          purchaseCount: 1,
        }),
      ],
      opts,
      NOW,
    );
    expect(rows[0]?.releaseDue).toBe(false);
    const s = summarizeLostCustomers(rows, opts);
    expect(s.ownershipConflict).toBe(false);
    expect(s.releaseDueCount).toBe(0);
  });

  it('egasiz mijozda `releaseDue` bo`lmaydi (bo`shatadigan egalik yo`q)', () => {
    const rows = buildLostCustomerList(
      [input({ counterpartyId: 'cp-free', lastDemandAt: daysBefore(200), purchaseCount: 1 })],
      OPTS,
      NOW,
    );
    expect(rows[0]?.releaseDue).toBe(false);
    expect(summarizeLostCustomers(rows, OPTS).releaseDueCount).toBe(0);
  });
});

describe('sotuvchi kesimi va sabab taqsimoti', () => {
  const rows = () =>
    buildLostCustomerList(
      [
        input({
          counterpartyId: 'cp-1',
          name: 'Beta',
          ownerId: 'emp-1',
          ownerName: 'Anna',
          lastDemandAt: daysBefore(100),
          purchaseCount: 2,
          reason: { code: 'price', note: null, at: daysBefore(1), authorId: null },
        }),
        input({
          counterpartyId: 'cp-2',
          name: 'Alfa',
          ownerId: 'emp-1',
          ownerName: 'Anna',
          lastDemandAt: daysBefore(100),
          purchaseCount: 1,
        }),
        input({
          counterpartyId: 'cp-3',
          name: 'Gamma',
          ownerId: 'emp-2',
          ownerName: 'Bek',
          lastDemandAt: daysBefore(65),
          purchaseCount: 1,
          reason: { code: 'competitor', note: null, at: daysBefore(1), authorId: null },
        }),
        // egasiz + yo'qolgan
        input({ counterpartyId: 'cp-4', name: 'Delta', lastDemandAt: daysBefore(70) }),
        // faol — kesimga TUSHMAYDI
        input({ counterpartyId: 'cp-5', name: 'Epsilon', lastDemandAt: daysBefore(2) }),
        // hech qachon xarid qilmagan
        input({ counterpartyId: 'cp-6', name: 'Zeta' }),
      ],
      OPTS,
      NOW,
    );

  it('kesim FAQAT yo`qolganlar bo`yicha, egasizlar alohida qator', () => {
    const s = summarizeLostCustomers(rows(), OPTS);
    expect(s.lostCount).toBe(4);
    expect(s.activeCount).toBe(1);
    expect(s.neverPurchasedCount).toBe(1);
    expect(s.byOwner).toEqual([
      { ownerId: 'emp-1', ownerName: 'Anna', lostCount: 2 },
      { ownerId: 'emp-2', ownerName: 'Bek', lostCount: 1 },
      // Egasiz «Anna/Bek» ga qo'shilmaydi — o'z qatorida ko'rinadi.
      { ownerId: null, ownerName: null, lostCount: 1 },
    ]);
  });

  it('sabab taqsimotida BELGILANMAGANLAR ochiq sanaladi', () => {
    const s = summarizeLostCustomers(rows(), OPTS);
    expect(s.unmarkedCount).toBe(2);
    expect(s.byReason).toEqual([
      { code: 'competitor', count: 1 },
      { code: 'price', count: 1 },
    ]);
  });

  it('tartib DETERMINIST: eng uzoq faolliksiz tepada, keyin nom, keyin id', () => {
    const ordered = rows().map((r) => r.counterpartyId);
    expect(ordered).toEqual([
      'cp-2', // 100 kun, «Alfa»
      'cp-1', // 100 kun, «Beta»
      'cp-4', // 70 kun
      'cp-3', // 65 kun
      'cp-5', // 2 kun
      'cp-6', // hech qachon — oxirida (NULL oxirga)
    ]);
  });

  it('bir xil kirish, boshqa tartib — natija AYNAN bir xil', () => {
    const a = rows().map((r) => r.counterpartyId);
    const b = buildLostCustomerList(
      [...rows()].reverse().map((r) =>
        input({
          counterpartyId: r.counterpartyId,
          name: r.name,
          ownerId: r.ownerId,
          ownerName: r.ownerName,
          lastDemandAt: r.lastPurchaseAt,
          purchaseCount: r.purchaseCount,
        }),
      ),
      OPTS,
      NOW,
    ).map((r) => r.counterpartyId);
    expect(b).toEqual(a);
  });
});
