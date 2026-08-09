import { describe, expect, it } from 'vitest';
import {
  ATTENTION,
  LIVE_KIND,
  LIVE_TITLE,
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
  /** Tartib sinovi uchun mazmunsiz qator — faqat `attention`/`since` muhim. */
  const stub = (
    kind: LiveRow['kind'],
    employeeId: string,
    attention: LiveRow['attention'],
    since: Date,
  ): LiveRow => ({
    kind,
    employeeId,
    employeeName: employeeId.toUpperCase(),
    title: employeeId,
    titleKey: LIVE_TITLE.shiftOpen,
    titleParams: {},
    detail: null,
    place: null,
    showDuration: false,
    attention,
    since,
  });

  const rows: LiveRow[] = [
    stub(LIVE_KIND.shift, 'a', ATTENTION.ok, ago(60)),
    stub(LIVE_KIND.trip, 'b', ATTENTION.alert, ago(30)),
    stub(LIVE_KIND.picking, 'c', ATTENTION.info, ago(90)),
    stub(LIVE_KIND.trip, 'd', ATTENTION.alert, ago(200)),
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

/**
 * MK03 — ekran matni SERVERDA yopilmaydi.
 *
 * `title`/`detail` o'zbekcha tayyor qator qaytaradi. Agar FE shuni chizsa,
 * ru interfeysда o'zbekcha matn turardi va **hech bir gate buni ko'rmasdi**
 * (i18n gate faqat FE fayllarini skanlaydi, BE stringlarini emas). Shuning
 * uchun har qator tarjima uchun STRUKTURA ham qaytaradi: kalit + parametrlar.
 */
describe('MK03: tarjima uchun strukturaviy maydonlar', () => {
  it('smena — kassa nomi PARAMETR, sarlavhaga yopishtirilmaydi', () => {
    const r = shiftRow(
      { employeeId: 'e1', employeeName: 'A', cashDeskName: 'Kassa 1', openedAt: ago(60) },
      NOW,
    );
    expect(r.titleKey).toBe(LIVE_TITLE.shiftOpenDesk);
    expect(r.titleParams).toEqual({ desk: 'Kassa 1' });
    expect(r.showDuration).toBe(true);
  });

  it('kassasiz smena — boshqa kalit (parametrsiz jumla)', () => {
    const r = shiftRow(
      { employeeId: 'e1', employeeName: 'A', cashDeskName: null, openedAt: ago(60) },
      NOW,
    );
    expect(r.titleKey).toBe(LIVE_TITLE.shiftOpen);
    expect(r.titleParams).toEqual({});
  });

  it('kechikish — daqiqa PARAMETR', () => {
    const r = attendanceRow({
      employeeId: 'e1',
      employeeName: 'A',
      checkInTime: ago(30),
      lateMinutes: 7,
    });
    expect(r.titleKey).toBe(LIVE_TITLE.attendanceLate);
    expect(r.titleParams).toEqual({ minutes: 7 });
    // Davomat qatorida davomiylik ko'rsatilmaydi — «keldi» bir martalik hodisa.
    expect(r.showDuration).toBe(false);
  });

  it('vaqtida kelgan — alohida kalit', () => {
    const r = attendanceRow({
      employeeId: 'e1',
      employeeName: 'A',
      checkInTime: ago(30),
      lateMinutes: 0,
    });
    expect(r.titleKey).toBe(LIVE_TITLE.attendanceOnTime);
    expect(r.titleParams).toEqual({});
  });

  it('reys — holat kalitga, manzil `place` ga (matnga qo`shilmaydi)', () => {
    const base = {
      driverId: 'd1',
      driverName: 'K',
      destAddress: 'Chilonzor 5',
      assignedAt: ago(30),
      startedAt: ago(20),
    };
    expect(tripRow({ ...base, status: 'enroute' }, NOW).titleKey).toBe(LIVE_TITLE.tripEnroute);
    expect(tripRow({ ...base, status: 'arrived' }, NOW).titleKey).toBe(LIVE_TITLE.tripArrived);
    const assigned = tripRow({ ...base, status: 'assigned' }, NOW);
    expect(assigned.titleKey).toBe(LIVE_TITLE.tripAssigned);
    expect(assigned.place).toBe('Chilonzor 5');
    expect(assigned.showDuration).toBe(true);
  });

  it('manzilsiz reysda `place` NULL (bo`sh satr emas)', () => {
    const r = tripRow(
      {
        driverId: 'd1',
        driverName: 'K',
        destAddress: null,
        status: 'enroute',
        assignedAt: ago(30),
        startedAt: ago(5),
      },
      NOW,
    );
    expect(r.place).toBeNull();
  });

  it('yig`ish — hujjat raqami PARAMETR', () => {
    const r = pickingRow(
      { employeeId: 'w1', employeeName: 'O', docName: 'ZAK-001', startedAt: ago(5) },
      NOW,
    );
    expect(r.titleKey).toBe(LIVE_TITLE.picking);
    expect(r.titleParams).toEqual({ doc: 'ZAK-001' });
    expect(r.showDuration).toBe(true);
  });

  it('HAR kalit `LIVE_TITLE` ro`yxatidan — erkin string emas', () => {
    // FE tarjima jadvali shu ro'yxatga qulflanadi (web drift-lock testi);
    // ro'yxatdan tashqari kalit ekranda xom `live_title.xxx` bo'lib chiqardi.
    const known = new Set<string>(Object.values(LIVE_TITLE));
    const produced = [
      shiftRow({ employeeId: 'e', employeeName: null, cashDeskName: 'K', openedAt: ago(1) }, NOW),
      shiftRow({ employeeId: 'e', employeeName: null, cashDeskName: null, openedAt: ago(1) }, NOW),
      attendanceRow({ employeeId: 'e', employeeName: null, checkInTime: ago(1), lateMinutes: 0 }),
      attendanceRow({ employeeId: 'e', employeeName: null, checkInTime: ago(1), lateMinutes: 9 }),
      tripRow(
        {
          driverId: 'd',
          driverName: null,
          status: 'assigned',
          destAddress: null,
          assignedAt: ago(1),
          startedAt: null,
        },
        NOW,
      ),
      pickingRow({ employeeId: null, employeeName: null, docName: 'X', startedAt: ago(1) }, NOW),
    ];
    for (const r of produced) expect(known.has(r.titleKey)).toBe(true);
  });
});
