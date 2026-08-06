import { describe, expect, it } from 'vitest';
import {
  ATTENTION,
  LIVE_KIND,
  type LiveRow,
  attendanceRow,
  buildLiveBoard,
  durationLabel,
  pickingRow,
  shiftRow,
  tripRow,
} from './live-status.js';

const NOW = new Date(2026, 7, 6, 18, 0);
const ago = (mins: number) => new Date(NOW.getTime() - mins * 60_000);

describe('durationLabel', () => {
  it('bir soatdan kam — daqiqada', () => {
    expect(durationLabel(ago(25), NOW)).toBe('25 daq');
  });

  it('butun soat — daqiqasiz', () => {
    expect(durationLabel(ago(120), NOW)).toBe('2 soat');
  });

  it('soat va daqiqa', () => {
    expect(durationLabel(ago(200), NOW)).toBe('3 soat 20 daq');
  });

  it('kelajakdagi vaqt manfiy bermaydi', () => {
    expect(durationLabel(new Date(NOW.getTime() + 60_000), NOW)).toBe('0 daq');
  });
});

describe('shiftRow — ochiq smena', () => {
  const base = { employeeId: 'e1', employeeName: 'Aliyev', cashDeskName: 'Kassa 1' };

  it('odatiy smena diqqat talab qilmaydi', () => {
    const r = shiftRow({ ...base, openedAt: ago(4 * 60) }, NOW);
    expect(r.attention).toBe(ATTENTION.ok);
    expect(r.title).toContain('Kassa 1');
  });

  it('12 soatdan uzoq smena — ALERT', () => {
    // Odatiy smena 8–10 soat; 12 dan oshgani deyarli har doim «yopishni
    // unutdi» degani va pul javobgarligi cho'zilgan.
    const r = shiftRow({ ...base, openedAt: ago(13 * 60) }, NOW);
    expect(r.attention).toBe(ATTENTION.alert);
  });

  it('aynan 12 soatda ALERT (chegara ichkarida)', () => {
    expect(shiftRow({ ...base, openedAt: ago(12 * 60) }, NOW).attention).toBe(ATTENTION.alert);
  });

  it('kassa nomi yo`q bo`lsa ham sarlavha to`liq', () => {
    const r = shiftRow({ ...base, cashDeskName: null, openedAt: ago(60) }, NOW);
    expect(r.title).toBe('Smena ochiq');
  });
});

describe('attendanceRow — kechikish', () => {
  const base = { employeeId: 'e1', employeeName: 'Aliyev', checkInTime: ago(30) };

  it('vaqtida kelgan — ok', () => {
    expect(attendanceRow({ ...base, lateMinutes: 0 }).attention).toBe(ATTENTION.ok);
  });

  it('kichik kechikish — info (shovqin qilmaydi)', () => {
    const r = attendanceRow({ ...base, lateMinutes: 5 });
    expect(r.attention).toBe(ATTENTION.info);
    expect(r.title).toContain('5 daq');
  });

  it('15 daqiqadan ortiq — ALERT', () => {
    expect(attendanceRow({ ...base, lateMinutes: 20 }).attention).toBe(ATTENTION.alert);
  });

  it('aynan 15 daqiqada ALERT', () => {
    expect(attendanceRow({ ...base, lateMinutes: 15 }).attention).toBe(ATTENTION.alert);
  });
});

describe('tripRow — haydovchi', () => {
  const base = {
    driverId: 'd1',
    driverName: 'Karimov',
    destAddress: 'Chilonzor 5',
    assignedAt: ago(30),
    startedAt: null,
  };

  it('yo`lda — info, normal ish', () => {
    const r = tripRow({ ...base, status: 'enroute', startedAt: ago(20) }, NOW);
    expect(r.attention).toBe(ATTENTION.info);
    expect(r.title).toBe("Yo'lda");
  });

  it('biriktirilgan-u BIR SOATDAN uzoq turgan — ALERT', () => {
    // Yo'lga chiqmagan haydovchi — buyurtma kutmoqda degani.
    const r = tripRow({ ...base, status: 'assigned', assignedAt: ago(90) }, NOW);
    expect(r.attention).toBe(ATTENTION.alert);
  });

  it('yangi biriktirilgan — hali alert emas', () => {
    const r = tripRow({ ...base, status: 'assigned', assignedAt: ago(10) }, NOW);
    expect(r.attention).toBe(ATTENTION.info);
  });

  it('manzil detalga qo`shiladi', () => {
    const r = tripRow({ ...base, status: 'enroute', startedAt: ago(20) }, NOW);
    expect(r.detail).toContain('Chilonzor 5');
    expect(r.detail).toContain('20 daq');
  });

  it('manzilsiz reysda detal faqat davomiylik', () => {
    const r = tripRow({ ...base, destAddress: null, status: 'enroute', startedAt: ago(5) }, NOW);
    expect(r.detail).toBe('5 daq');
  });
});

describe('pickingRow — omborchi', () => {
  const base = { employeeId: 'w1', employeeName: 'Omborchi', docName: 'ZAK-001' };

  it('yangi boshlangan yig`ish — info', () => {
    expect(pickingRow({ ...base, startedAt: ago(10) }, NOW).attention).toBe(ATTENTION.info);
  });

  it('45 daqiqadan uzoq — ALERT (qotib qolgan)', () => {
    // O'rtacha buyurtma 10–20 daqiqada yig'iladi; undan uzog'i odatda
    // «boshqa ishga o'tib ketgan» yoki «tovar topilmayapti».
    expect(pickingRow({ ...base, startedAt: ago(50) }, NOW).attention).toBe(ATTENTION.alert);
  });

  it('hujjat raqami sarlavhada', () => {
    expect(pickingRow({ ...base, startedAt: ago(5) }, NOW).title).toContain('ZAK-001');
  });
});

describe('buildLiveBoard — tartib va sanoq', () => {
  const rows: LiveRow[] = [
    {
      kind: LIVE_KIND.shift,
      employeeId: 'a',
      employeeName: 'A',
      title: 's',
      detail: null,
      attention: ATTENTION.ok,
      since: ago(60),
    },
    {
      kind: LIVE_KIND.trip,
      employeeId: 'b',
      employeeName: 'B',
      title: 't',
      detail: null,
      attention: ATTENTION.alert,
      since: ago(30),
    },
    {
      kind: LIVE_KIND.picking,
      employeeId: 'c',
      employeeName: 'C',
      title: 'p',
      detail: null,
      attention: ATTENTION.info,
      since: ago(90),
    },
    {
      kind: LIVE_KIND.trip,
      employeeId: 'd',
      employeeName: 'D',
      title: 't2',
      detail: null,
      attention: ATTENTION.alert,
      since: ago(200),
    },
  ];

  it('ALERT qatorlar TEPADA', () => {
    const b = buildLiveBoard(rows);
    expect(b.rows.slice(0, 2).every((r) => r.attention === ATTENTION.alert)).toBe(true);
  });

  it('bir xil darajada ESKIROG`I tepada', () => {
    // Uzoqroq turgani ko'proq e'tiborsiz qolgan.
    const b = buildLiveBoard(rows);
    expect(b.rows[0]?.employeeId).toBe('d');
    expect(b.rows[1]?.employeeId).toBe('b');
  });

  it('alert soni sanaladi', () => {
    expect(buildLiveBoard(rows).alertCount).toBe(2);
  });

  it('tur bo`yicha sanoq to`g`ri', () => {
    const c = buildLiveBoard(rows).counts;
    expect(c.trip).toBe(2);
    expect(c.shift).toBe(1);
    expect(c.picking).toBe(1);
    expect(c.attendance).toBe(0);
  });

  it('bo`sh taxta — nol', () => {
    const b = buildLiveBoard([]);
    expect(b.rows).toEqual([]);
    expect(b.alertCount).toBe(0);
    expect(b.counts.shift).toBe(0);
  });

  it('kirish massivi O`ZGARMAYDI (nusxa ustida saralanadi)', () => {
    const original = [...rows];
    buildLiveBoard(rows);
    expect(rows).toEqual(original);
  });
});
