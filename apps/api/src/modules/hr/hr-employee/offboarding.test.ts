import { describe, expect, it } from 'vitest';
import {
  type AutoFacts,
  ITEM_KIND,
  OFFBOARDING_ITEM,
  OFFBOARDING_ITEMS,
  canMarkManually,
  evaluateItems,
  itemDef,
  offboardingProgress,
} from './offboarding.js';

/** Hammasi yopilgan holat — testlar shundan chetlanadi. */
const CLEAN: AutoFacts = {
  telegramChatId: null,
  openShiftCount: 0,
  pendingKpiDays: 0,
  roleCount: 0,
  openEquipmentCount: 0,
};

/**
 * MK05 dan keyin QO'LDA tasdiq talab qiladigan YAGONA band — kassa/naqd.
 * Jihoz `auto` ga o'tdi: reyestr paydo bo'ldi, ya'ni tizim biladi.
 */
const ALL_MANUAL = {
  [OFFBOARDING_ITEM.cashHandedOver]: { doneAt: new Date(2026, 7, 6), byId: 'm1' },
};

describe('ro`yxat tarkibi', () => {
  it('oltita band', () => {
    expect(OFFBOARDING_ITEMS).toHaveLength(6);
  });

  it('hammasi BLOKLOVCHI', () => {
    // «Ixtiyoriy band» ro'yxatning ma'nosini yo'qotardi: eng noqulayi
    // ixtiyoriy deb belgilanib, o'tkazib yuborilardi.
    expect(OFFBOARDING_ITEMS.every((i) => i.blocking)).toBe(true);
  });

  it('tizim biladigan bandlar AUTO', () => {
    // Telegram, smena, KPI kunlari, rollar — hammasini tizim ko'radi.
    // MK05 dan keyin JIHOZ ham shu ro'yxatda: reyestr paydo bo'ldi.
    for (const k of [
      OFFBOARDING_ITEM.telegramUnbound,
      OFFBOARDING_ITEM.shiftsClosed,
      OFFBOARDING_ITEM.kpiDaysClosed,
      OFFBOARDING_ITEM.rolesRevoked,
      OFFBOARDING_ITEM.equipmentReturned,
    ]) {
      expect(itemDef(k)?.kind).toBe(ITEM_KIND.auto);
    }
  });

  it('tizim KO`RMAYDIGAN narsa QO`LDA — faqat kassa/naqd', () => {
    // Yashiqdagi pulni tizim sanamaydi; jihozni esa MK05 dan keyin biladi.
    expect(itemDef(OFFBOARDING_ITEM.cashHandedOver)?.kind).toBe(ITEM_KIND.manual);
    expect(OFFBOARDING_ITEMS.filter((i) => i.kind === ITEM_KIND.manual)).toHaveLength(1);
  });

  it('noma`lum kalit → null', () => {
    expect(itemDef('yoq-bunday')).toBeNull();
  });
});

describe('canMarkManually — o`zini aldashga yo`l yo`q', () => {
  it('AUTO bandni qo`lda belgilab bo`lmaydi', () => {
    // Aks holda odam «Telegram uzildi» deb belgilardi, bog'lam esa turardi.
    expect(canMarkManually(OFFBOARDING_ITEM.telegramUnbound)).toBe(false);
    expect(canMarkManually(OFFBOARDING_ITEM.shiftsClosed)).toBe(false);
    expect(canMarkManually(OFFBOARDING_ITEM.kpiDaysClosed)).toBe(false);
    expect(canMarkManually(OFFBOARDING_ITEM.rolesRevoked)).toBe(false);
  });

  it('JIHOZ bandi endi qo`lda belgilanmaydi (MK05)', () => {
    // Ilgari qo'lda edi: reyestr yo'q edi, ya'ni tizim hech narsa bilmasdi.
    // Reyestr paydo bo'lgach, «topshirdim» deb belgilash — qaytarilmagan
    // telefonni ko'rinmas qilardi.
    expect(canMarkManually(OFFBOARDING_ITEM.equipmentReturned)).toBe(false);
  });

  it('QO`LDA bandni belgilash mumkin', () => {
    expect(canMarkManually(OFFBOARDING_ITEM.cashHandedOver)).toBe(true);
  });

  it('noma`lum kalit rad etiladi', () => {
    expect(canMarkManually('yoq-bunday')).toBe(false);
  });
});

describe('evaluateItems — auto bandlar HAR SAFAR qayta tekshiriladi', () => {
  it('Telegram ulangan bo`lsa band ochiq', () => {
    const items = evaluateItems({ ...CLEAN, telegramChatId: '12345' }, {});
    const t = items.find((i) => i.key === OFFBOARDING_ITEM.telegramUnbound);
    expect(t?.done).toBe(false);
    expect(t?.detail).toBe('ulangan');
  });

  it('ochiq smena soni ko`rsatiladi', () => {
    const items = evaluateItems({ ...CLEAN, openShiftCount: 2 }, {});
    const s = items.find((i) => i.key === OFFBOARDING_ITEM.shiftsClosed);
    expect(s?.done).toBe(false);
    expect(s?.detail).toContain('2');
  });

  it('qabul kutayotgan kunlar soni ko`rsatiladi', () => {
    const items = evaluateItems({ ...CLEAN, pendingKpiDays: 5 }, {});
    const k = items.find((i) => i.key === OFFBOARDING_ITEM.kpiDaysClosed);
    expect(k?.done).toBe(false);
    expect(k?.detail).toContain('5');
  });

  it('qaytarilmagan jihoz bo`lsa band ochiq va SONI ko`rsatiladi (MK05)', () => {
    const items = evaluateItems({ ...CLEAN, openEquipmentCount: 2 }, {});
    const e = items.find((i) => i.key === OFFBOARDING_ITEM.equipmentReturned);
    expect(e?.done).toBe(false);
    expect(e?.detail).toContain('2');
  });

  it('reyestrda jihozi yo`q xodimda band YOPIQ', () => {
    // Reyestr bo'sh bo'lsa ham javob halol: «bu odamda ochiq biriktirish
    // yo'q» — bu O'LCHANGAN fakt, taxmin emas.
    const items = evaluateItems(CLEAN, {});
    expect(items.find((i) => i.key === OFFBOARDING_ITEM.equipmentReturned)?.done).toBe(true);
  });

  it('jihoz bandi QO`LDA tasdiq bilan yopilmaydi', () => {
    // Eski (MK05 gacha yozilgan) qo'lda tasdiq JSON'da qolgan bo'lishi
    // mumkin — u endi hisobga OLINMAYDI, faqat fakt.
    const items = evaluateItems(
      { ...CLEAN, openEquipmentCount: 1 },
      { [OFFBOARDING_ITEM.equipmentReturned]: { doneAt: new Date(2026, 7, 6), byId: 'm1' } },
    );
    expect(items.find((i) => i.key === OFFBOARDING_ITEM.equipmentReturned)?.done).toBe(false);
  });

  it('rollar qolgan bo`lsa band ochiq', () => {
    const items = evaluateItems({ ...CLEAN, roleCount: 3 }, {});
    expect(items.find((i) => i.key === OFFBOARDING_ITEM.rolesRevoked)?.done).toBe(false);
  });

  it('toza holatda AUTO bandlar bajarilgan', () => {
    const items = evaluateItems(CLEAN, {});
    const autos = items.filter((i) => i.kind === ITEM_KIND.auto);
    expect(autos.every((i) => i.done)).toBe(true);
  });

  it('qo`lda band tasdiqsiz bajarilmagan', () => {
    const items = evaluateItems(CLEAN, {});
    expect(items.find((i) => i.key === OFFBOARDING_ITEM.cashHandedOver)?.done).toBe(false);
  });

  it('qo`lda band tasdiq sanasini saqlaydi', () => {
    const items = evaluateItems(CLEAN, ALL_MANUAL);
    const c = items.find((i) => i.key === OFFBOARDING_ITEM.cashHandedOver);
    expect(c?.done).toBe(true);
    expect(c?.doneAt).toEqual(new Date(2026, 7, 6));
  });
});

describe('offboardingProgress — arxivlash sharti', () => {
  it('hammasi yopilganda arxivlash MUMKIN', () => {
    const p = offboardingProgress(CLEAN, ALL_MANUAL);
    expect(p.canArchive).toBe(true);
    expect(p.doneCount).toBe(6);
    expect(p.blockers).toEqual([]);
  });

  it('bitta auto band ochiq bo`lsa arxivlash MUMKIN EMAS', () => {
    const p = offboardingProgress({ ...CLEAN, openShiftCount: 1 }, ALL_MANUAL);
    expect(p.canArchive).toBe(false);
    expect(p.blockers.map((b) => b.key)).toEqual([OFFBOARDING_ITEM.shiftsClosed]);
  });

  it('bitta qo`lda band ochiq bo`lsa ham MUMKIN EMAS', () => {
    const p = offboardingProgress(CLEAN, {});
    expect(p.canArchive).toBe(false);
    expect(p.blockers.map((b) => b.key)).toEqual([OFFBOARDING_ITEM.cashHandedOver]);
  });

  it('QAYTARILMAGAN JIHOZ bo`lsa ro`yxat yopilmaydi (MK05)', () => {
    const p = offboardingProgress({ ...CLEAN, openEquipmentCount: 1 }, ALL_MANUAL);
    expect(p.canArchive).toBe(false);
    expect(p.blockers.map((b) => b.key)).toEqual([OFFBOARDING_ITEM.equipmentReturned]);
  });

  it('bo`sh holatda hamma band bloklaydi', () => {
    const p = offboardingProgress(
      {
        telegramChatId: 'x',
        openShiftCount: 1,
        pendingKpiDays: 1,
        roleCount: 1,
        openEquipmentCount: 1,
      },
      {},
    );
    expect(p.canArchive).toBe(false);
    expect(p.blockers).toHaveLength(6);
    expect(p.doneCount).toBe(0);
  });

  it('blockers ro`yxati sababni ham olib yuradi', () => {
    // Xabarda «2 ta ochiq smena» deb aniq yozilishi kerak — «bajarilmagan»
    // degan quruq so'z odamni qidirishga majbur qilardi.
    const p = offboardingProgress({ ...CLEAN, openShiftCount: 2 }, ALL_MANUAL);
    expect(p.blockers[0]?.detail).toContain('2');
  });

  it('jami soni bandlar soniga teng', () => {
    expect(offboardingProgress(CLEAN, {}).total).toBe(OFFBOARDING_ITEMS.length);
  });
});
