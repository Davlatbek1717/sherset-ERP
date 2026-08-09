import { describe, expect, it } from 'vitest';
import { DUTY, type DutyInput, buildAccountability, employeeDuties } from './accountability.js';

const EMPTY: DutyInput = {
  employeeId: 'e1',
  employeeName: 'Aliyev',
  openShiftCount: 0,
  openShiftCashMinor: 0n,
  pendingHandoverCount: 0,
  pendingHandoverMinor: 0n,
  pickingCount: 0,
  pendingKpiDays: 0,
  openEquipmentCount: 0,
  unacceptedShiftCount: 0,
};

describe('employeeDuties', () => {
  it('majburiyatsiz xodimda bo`sh ro`yxat', () => {
    const d = employeeDuties(EMPTY);
    expect(d.duties).toEqual([]);
    expect(d.totalCount).toBe(0);
    expect(d.totalCashMinor).toBe(0n);
  });

  it('NOL qatorlar tashlanadi', () => {
    // «Ochiq smena: 0» qatori ekranni to'ldirib, haqiqiy majburiyatni
    // ko'rinmas qilardi.
    const d = employeeDuties({ ...EMPTY, pickingCount: 2 });
    expect(d.duties).toHaveLength(1);
    expect(d.duties[0]?.kind).toBe(DUTY.pickingOpen);
  });

  it('ochiq smena naqd bilan ko`rsatiladi', () => {
    const d = employeeDuties({ ...EMPTY, openShiftCount: 1, openShiftCashMinor: 500_000n });
    expect(d.duties[0]?.kind).toBe(DUTY.openShift);
    expect(d.duties[0]?.amountMinor).toBe(500_000n);
  });

  it('haydovchi qo`lidagi naqd alohida qator', () => {
    const d = employeeDuties({
      ...EMPTY,
      pendingHandoverCount: 3,
      pendingHandoverMinor: 1_200_000n,
    });
    expect(d.duties[0]?.kind).toBe(DUTY.cashOnHand);
    expect(d.duties[0]?.count).toBe(3);
  });

  it('pul jami FAQAT pul majburiyatlaridan', () => {
    // Yig'ish va KPI kunlarini pulga qo'shish «kimda qancha pul»
    // raqamini buzardi.
    const d = employeeDuties({
      ...EMPTY,
      openShiftCount: 1,
      openShiftCashMinor: 500_000n,
      pendingHandoverCount: 1,
      pendingHandoverMinor: 300_000n,
      pickingCount: 5,
      pendingKpiDays: 10,
    });
    expect(d.totalCashMinor).toBe(800_000n);
    expect(d.totalCount).toBe(17);
  });

  it('qaytarilmagan JIHOZ alohida qator (MK05 reyestri)', () => {
    // MK03'da bu qator ATAYLAB yo'q edi: reyestr bo'lmagani uchun «0 ta
    // jihoz» yo'q ma'lumotga ishontirardi. Endi son O'LCHANGAN.
    const d = employeeDuties({ ...EMPTY, openEquipmentCount: 2 });
    expect(d.duties).toHaveLength(1);
    expect(d.duties[0]?.kind).toBe(DUTY.equipmentOut);
    expect(d.duties[0]?.count).toBe(2);
    // Jihozning puli yo'q — narxi reyestrda saqlanmaydi, «kimda qancha
    // pul» raqamiga taxminiy qiymat qo'shish uni buzardi.
    expect(d.duties[0]?.amountMinor).toBeNull();
  });

  it('jihozi yo`q xodimda jihoz qatori CHIQMAYDI', () => {
    const d = employeeDuties({ ...EMPTY, pickingCount: 1 });
    expect(d.duties.map((x) => x.kind)).not.toContain(DUTY.equipmentOut);
  });

  it('jihoz PUL jamiga qo`shilmaydi', () => {
    const d = employeeDuties({
      ...EMPTY,
      openShiftCount: 1,
      openShiftCashMinor: 500_000n,
      openEquipmentCount: 3,
    });
    expect(d.totalCashMinor).toBe(500_000n);
    expect(d.totalCount).toBe(4);
  });

  it('pulsiz majburiyatda amountMinor NULL (0 emas)', () => {
    const d = employeeDuties({ ...EMPTY, pendingKpiDays: 4 });
    expect(d.duties[0]?.amountMinor).toBeNull();
  });

  it('QABUL QILINMAGAN smena kassir ustida qoladi (MK08)', () => {
    // Smena yopildi ≠ smena hal bo'ldi: menejer ko'rmaguncha javobgarlik
    // kassirda. Busiz yopilgan-u ko'rilmagan smena taxtadan YO'QOLARDI.
    const d = employeeDuties({ ...EMPTY, unacceptedShiftCount: 2 });
    expect(d.duties).toHaveLength(1);
    expect(d.duties[0]?.kind).toBe(DUTY.shiftUnaccepted);
    expect(d.duties[0]?.count).toBe(2);
    // Summasi YO'Q: pul allaqachon topshirilgan, ochiq emas. Uni «kimda
    // qancha pul» raqamiga qo'shish naqdni ikki marta sanardi.
    expect(d.duties[0]?.amountMinor).toBeNull();
  });

  it('OCHIQ va QABUL QILINMAGAN smena — ikki AYRIM majburiyat', () => {
    // Ochiq smenada yashiqdagi pul javobgarligi; yopilgan-u qabul
    // qilinmaganda esa hujjat javobgarligi. Bir qatorga qo'shish menejerga
    // «yashiqda pul bor» degan yolg'on signal berardi.
    const d = employeeDuties({
      ...EMPTY,
      openShiftCount: 1,
      openShiftCashMinor: 500_000n,
      unacceptedShiftCount: 3,
    });
    expect(d.duties.map((x) => x.kind)).toEqual([DUTY.openShift, DUTY.shiftUnaccepted]);
    expect(d.totalCashMinor).toBe(500_000n);
    expect(d.totalCount).toBe(4);
  });

  it('2^53 dan katta summada aniq', () => {
    const big = 9_007_199_254_740_993n;
    const d = employeeDuties({
      ...EMPTY,
      openShiftCount: 1,
      openShiftCashMinor: big,
      pendingHandoverCount: 1,
      pendingHandoverMinor: 1n,
    });
    expect(d.totalCashMinor).toBe(big + 1n);
  });
});

describe('buildAccountability', () => {
  const mk = (id: string, cash: bigint, count: number) =>
    employeeDuties({
      ...EMPTY,
      employeeId: id,
      employeeName: id,
      openShiftCount: cash > 0n ? 1 : 0,
      openShiftCashMinor: cash,
      pickingCount: count,
    });

  it('majburiyatsiz xodim ro`yxatga TUSHMAYDI', () => {
    const b = buildAccountability([mk('bo`sh', 0n, 0), mk('bor', 100n, 0)]);
    expect(b.employees.map((e) => e.employeeId)).toEqual(['bor']);
  });

  it('PUL ko`p bo`lgan tepada', () => {
    // Yo'qolgan pulni qaytarib bo'lmaydi, yopilmagan yig'ishni ertaga
    // tugatsa bo'ladi.
    const b = buildAccountability([mk('kam', 100n, 0), mk('kop', 900n, 0)]);
    expect(b.employees[0]?.employeeId).toBe('kop');
  });

  it('pul teng bo`lsa majburiyat SONI bo`yicha', () => {
    const b = buildAccountability([mk('a', 100n, 1), mk('b', 100n, 5)]);
    expect(b.employees[0]?.employeeId).toBe('b');
  });

  it('pulsiz majburiyatlar YO`QOLMAYDI (oxirida qoladi)', () => {
    const b = buildAccountability([mk('pulli', 500n, 0), mk('pulsiz', 0n, 3)]);
    expect(b.employees).toHaveLength(2);
    expect(b.employees[1]?.employeeId).toBe('pulsiz');
  });

  it('korxona bo`yicha jami naqd', () => {
    const b = buildAccountability([mk('a', 500n, 0), mk('b', 300n, 0)]);
    expect(b.totalCashMinor).toBe(800n);
    expect(b.employeeCount).toBe(2);
  });

  it('bo`sh ro`yxatda nol', () => {
    const b = buildAccountability([]);
    expect(b.employees).toEqual([]);
    expect(b.totalCashMinor).toBe(0n);
  });

  it('kirish massivi O`ZGARMAYDI', () => {
    const rows = [mk('a', 100n, 0), mk('b', 900n, 0)];
    const copy = [...rows];
    buildAccountability(rows);
    expect(rows).toEqual(copy);
  });
});
