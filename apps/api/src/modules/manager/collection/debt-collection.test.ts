import { describe, expect, it } from 'vitest';
import { SALE_DEBT_SOURCE_DOC_TYPE } from '../../debt/sale-debt-registry.js';
import {
  type CollectionDebtInput,
  buildCollectionList,
  buildCollectionRow,
  collectionSourceOf,
  filterCollectionRowsBySource,
  isRemindedOn,
  overdueDaysBetween,
  summarizeCollection,
  tashkentDayKey,
} from './debt-collection.js';

/**
 * MK16 — «Qarz undirish ish ro'yxati» sof qoidalari.
 *
 * Bu yerda Prisma YO'Q: qator qurish, muddat hisobi, tartib va idempotentlik
 * oynasi — hammasi sof funksiyalar. I/O `debt-collection.service.ts` da.
 */

const NOW = new Date('2026-08-09T09:00:00.000Z'); // Toshkentda 14:00, 2026-08-09

function input(over: Partial<CollectionDebtInput> = {}): CollectionDebtInput {
  return {
    id: 'd1',
    name: 'QRZ-2026-00001',
    counterpartyId: 'cp1',
    counterpartyName: 'Alisher',
    counterpartyPhone: '901234567',
    totalMinor: 1_000_00n,
    paidMinor: 0n,
    currency: 'UZS',
    status: 'unpaid',
    problem: false,
    nextContactAt: new Date('2026-08-04T09:00:00.000Z'),
    lastCallAt: null,
    lastCallOutcome: null,
    lastNoteAt: null,
    lastReminderAt: null,
    responsible: null,
    // Q4 — default: qo'lda ochilgan reyestr qatori (hujjat-manba bog'lami yo'q).
    sourceDocType: null,
    sourceDocId: null,
    sourceDocNumber: null,
    ...over,
  };
}

describe('tashkentDayKey', () => {
  it('UTC yarim tundan oldingi payt Toshkentda ERTASI kuniga tegishli', () => {
    // 2026-08-08T20:00Z = 2026-08-09 01:00 Toshkentda.
    expect(tashkentDayKey(new Date('2026-08-08T20:00:00.000Z'))).toBe('2026-08-09');
    // 2026-08-09T18:00Z = 2026-08-09 23:00 Toshkentda (hali o'sha kun).
    expect(tashkentDayKey(new Date('2026-08-09T18:00:00.000Z'))).toBe('2026-08-09');
    // 2026-08-09T19:00Z = 2026-08-10 00:00 Toshkentda.
    expect(tashkentDayKey(new Date('2026-08-09T19:00:00.000Z'))).toBe('2026-08-10');
  });
});

describe('overdueDaysBetween — KALENDAR kuni, ms/86400 EMAS', () => {
  it('kechagi muddat = 1 kun, bugungi = 0, ertangi = -1', () => {
    expect(overdueDaysBetween(new Date('2026-08-08T09:00:00.000Z'), NOW)).toBe(1);
    expect(overdueDaysBetween(new Date('2026-08-09T02:00:00.000Z'), NOW)).toBe(0);
    expect(overdueDaysBetween(new Date('2026-08-10T09:00:00.000Z'), NOW)).toBe(-1);
  });

  it('soat farqi kun farqini yemaydi (yorliq ≠ instant)', () => {
    // Muddat kecha 23:00 Toshkentda (18:00Z), «hozir» bugun 14:00 Toshkentda:
    // ms farqi 15 soat = 0.6 kun, lekin KALENDAR farqi 1 kun.
    expect(overdueDaysBetween(new Date('2026-08-08T18:00:00.000Z'), NOW)).toBe(1);
  });

  it("muddat belgilanmagan bo'lsa null — 0 EMAS (NULL ≠ 0)", () => {
    expect(overdueDaysBetween(null, NOW)).toBeNull();
  });
});

describe('buildCollectionRow', () => {
  it("to'liq to'langan qarz ro'yxatga TUSHMAYDI (null qaytadi)", () => {
    expect(buildCollectionRow(input({ status: 'paid', paidMinor: 1_000_00n }), NOW)).toBeNull();
  });

  it("qoldiq <= 0 bo'lsa status 'unpaid' bo'lsa ham tushmaydi", () => {
    expect(buildCollectionRow(input({ paidMinor: 1_000_00n }), NOW)).toBeNull();
    expect(buildCollectionRow(input({ paidMinor: 1_200_00n }), NOW)).toBeNull();
  });

  it("qisman to'lov qoldiqni kamaytiradi, qator qoladi", () => {
    const row = buildCollectionRow(input({ status: 'partial', paidMinor: 400_00n }), NOW);
    expect(row?.remainingMinor).toBe(600_00n);
  });

  it("muddati o'tgan kun va bucket hisoblanadi", () => {
    const row = buildCollectionRow(input(), NOW);
    expect(row?.overdueDays).toBe(5);
    expect(row?.bucket).toBe('overdue');
  });

  it("muddatsiz qarz 'no_due_date' — «bugun» deb ko'rsatilmaydi", () => {
    const row = buildCollectionRow(input({ nextContactAt: null }), NOW);
    expect(row?.overdueDays).toBeNull();
    expect(row?.bucket).toBe('no_due_date');
  });

  it("oxirgi aloqa = qo'ng'iroq/eslatma/izohning ENG YANGISI", () => {
    const row = buildCollectionRow(
      input({
        lastCallAt: new Date('2026-08-01T10:00:00.000Z'),
        lastNoteAt: new Date('2026-08-03T10:00:00.000Z'),
        lastReminderAt: new Date('2026-08-02T10:00:00.000Z'),
      }),
      NOW,
    );
    expect(row?.lastContactAt).toEqual(new Date('2026-08-03T10:00:00.000Z'));
    expect(row?.lastContactKind).toBe('note');
  });

  it("hech qachon aloqa bo'lmagan bo'lsa lastContactAt null (0 EMAS)", () => {
    const row = buildCollectionRow(input(), NOW);
    expect(row?.lastContactAt).toBeNull();
    expect(row?.lastContactKind).toBeNull();
  });

  it("telefoni yo'q qarzga eslatma yuborib bo'lmaydi — sabab OSHKORA", () => {
    const row = buildCollectionRow(input({ counterpartyPhone: null }), NOW);
    expect(row?.canRemind).toBe(false);
    expect(row?.remindBlockedReason).toBe('no_phone');
  });

  it('bugun eslatma ketgan qarz qayta eslatilmaydi (idempotentlik oynasi)', () => {
    const row = buildCollectionRow(
      input({ lastReminderAt: new Date('2026-08-09T04:00:00.000Z') }),
      NOW,
    );
    expect(row?.remindedToday).toBe(true);
    expect(row?.canRemind).toBe(false);
    expect(row?.remindBlockedReason).toBe('reminded_today');
  });

  it('kechagi eslatma bugungi eslatmani bloklamaydi', () => {
    const row = buildCollectionRow(
      input({ lastReminderAt: new Date('2026-08-08T04:00:00.000Z') }),
      NOW,
    );
    expect(row?.remindedToday).toBe(false);
    expect(row?.canRemind).toBe(true);
  });
});

describe('buildCollectionList — TARTIB DETERMINIST', () => {
  it("eng ko'p kechikkan birinchi; keyin valyuta, qoldiq, id", () => {
    const rows = buildCollectionList(
      [
        input({ id: 'b', nextContactAt: new Date('2026-08-07T09:00:00.000Z') }), // 2 kun
        input({ id: 'a', nextContactAt: new Date('2026-08-01T09:00:00.000Z') }), // 8 kun
        input({ id: 'c', nextContactAt: null }), // muddatsiz
        input({ id: 'd', nextContactAt: new Date('2026-08-09T02:00:00.000Z') }), // bugun
        input({ id: 'e', nextContactAt: new Date('2026-08-12T09:00:00.000Z') }), // -3
      ],
      NOW,
    );
    expect(rows.map((r) => r.debtId)).toEqual(['a', 'b', 'd', 'e', 'c']);
  });

  it("bir xil kechikishda: valyuta o'sish, qoldiq kamayish, id o'sish", () => {
    const due = new Date('2026-08-07T09:00:00.000Z');
    const rows = buildCollectionList(
      [
        input({ id: 'x2', nextContactAt: due, currency: 'UZS', totalMinor: 100n }),
        input({ id: 'x1', nextContactAt: due, currency: 'UZS', totalMinor: 100n }),
        input({ id: 'y', nextContactAt: due, currency: 'UZS', totalMinor: 900n }),
        input({ id: 'z', nextContactAt: due, currency: 'USD', totalMinor: 5n }),
      ],
      NOW,
    );
    expect(rows.map((r) => r.debtId)).toEqual(['z', 'y', 'x1', 'x2']);
  });

  it("kirish tartibi natijaga TA'SIR QILMAYDI (barqaror emas — to'liq determinist)", () => {
    const base = [
      input({ id: 'a', nextContactAt: new Date('2026-08-01T09:00:00.000Z') }),
      input({ id: 'b', nextContactAt: new Date('2026-08-07T09:00:00.000Z') }),
      input({ id: 'c', nextContactAt: null }),
    ];
    const forward = buildCollectionList(base, NOW).map((r) => r.debtId);
    const reversed = buildCollectionList([...base].reverse(), NOW).map((r) => r.debtId);
    expect(reversed).toEqual(forward);
  });

  it("to'langanlar ro'yxatdan chiqadi", () => {
    const rows = buildCollectionList(
      [input({ id: 'open' }), input({ id: 'closed', status: 'paid', paidMinor: 1_000_00n })],
      NOW,
    );
    expect(rows.map((r) => r.debtId)).toEqual(['open']);
  });
});

describe("summarizeCollection — valyutalar QO'SHILMAYDI", () => {
  it('har valyuta alohida jamlanadi', () => {
    const rows = buildCollectionList(
      [
        input({ id: 'a', currency: 'UZS', totalMinor: 100n }),
        input({ id: 'b', currency: 'UZS', totalMinor: 250n }),
        input({ id: 'c', currency: 'USD', totalMinor: 7n }),
      ],
      NOW,
    );
    expect(summarizeCollection(rows).byCurrency).toEqual([
      { currency: 'USD', remainingMinor: 7n, count: 1 },
      { currency: 'UZS', remainingMinor: 350n, count: 2 },
    ]);
  });

  it('bucket va muammoli sonlari alohida', () => {
    const rows = buildCollectionList(
      [
        input({ id: 'a', nextContactAt: new Date('2026-08-01T09:00:00.000Z'), problem: true }),
        input({ id: 'b', nextContactAt: new Date('2026-08-09T02:00:00.000Z') }),
        input({ id: 'c', nextContactAt: new Date('2026-08-20T09:00:00.000Z') }),
        input({ id: 'd', nextContactAt: null }),
      ],
      NOW,
    );
    const s = summarizeCollection(rows);
    expect(s.overdueCount).toBe(1);
    expect(s.dueTodayCount).toBe(1);
    expect(s.upcomingCount).toBe(1);
    expect(s.noDueDateCount).toBe(1);
    expect(s.problemCount).toBe(1);
  });
});

describe('isRemindedOn', () => {
  it('null hech qachon «eslatilgan» emas', () => {
    expect(isRemindedOn(null, NOW)).toBe(false);
  });

  it("kun chegarasi Toshkent bo'yicha, UTC bo'yicha emas", () => {
    // 2026-08-08T20:00Z = Toshkentda 2026-08-09 01:00 → NOW bilan bir kun.
    expect(isRemindedOn(new Date('2026-08-08T20:00:00.000Z'), NOW)).toBe(true);
    // 2026-08-08T18:00Z = Toshkentda 2026-08-08 23:00 → boshqa kun.
    expect(isRemindedOn(new Date('2026-08-08T18:00:00.000Z'), NOW)).toBe(false);
  });
});

/**
 * Q4 (2026-08-25) — MANBA: «bu qarz qayerdan keldi».
 *
 * Reja: `docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md` §Q4.
 * Xarita SOF va BITTA: server javobi, filtr, undirish ekrani va qarzdorlar
 * ro'yxati AYNAN shundan yuradi. Ikkinchi nusxa yozilsa ikki ekran bir kun
 * ayrilardi.
 */
describe('collectionSourceOf — Q4 manba xaritasi', () => {
  it("`'retailsale'` ⇒ kassa cheki", () => {
    expect(collectionSourceOf(SALE_DEBT_SOURCE_DOC_TYPE)).toBe('retailsale');
    expect(SALE_DEBT_SOURCE_DOC_TYPE).toBe('retailsale');
  });

  it('NULL / `undefined` ⇒ reyestr (qo`lda ochilgan yoki adopsiya qatori)', () => {
    expect(collectionSourceOf(null)).toBe('registry');
    expect(collectionSourceOf(undefined)).toBe('registry');
  });

  it('🔴 NOMA`LUM tur ⇒ `registry` (xom satr EKRANGA chiqmaydi)', () => {
    // Kelajakda yangi manba qo'shilsa (masalan `invoiceout`) ekran uni
    // «reyestr» deb ko'rsatadi — bu yolg'on emas (u rostdan reyestr qatori),
    // xom `docType` satrini chizish esa MK25 dagi xatoning takrori bo'lardi.
    expect(collectionSourceOf('invoiceout')).toBe('registry');
    expect(collectionSourceOf('')).toBe('registry');
  });
});

describe('buildCollectionRow — Q4 manba maydonlari qatorga ko`chadi', () => {
  it('kassa cheki qatori: `source`, `sourceDocId`, `sourceDocNumber`', () => {
    const row = buildCollectionRow(
      input({
        sourceDocType: 'retailsale',
        sourceDocId: 'sale-1',
        sourceDocNumber: 'CHK-2026-00042',
      }),
      NOW,
    );
    expect(row?.source).toBe('retailsale');
    expect(row?.sourceDocId).toBe('sale-1');
    expect(row?.sourceDocNumber).toBe('CHK-2026-00042');
  });

  it('qo`lda ochilgan qator: `registry` va ikkala manba maydoni `null`', () => {
    const row = buildCollectionRow(input(), NOW);
    expect(row?.source).toBe('registry');
    expect(row?.sourceDocId).toBeNull();
    expect(row?.sourceDocNumber).toBeNull();
  });

  it('chek TOPILMASA raqam `null` qoladi, belgi esa baribir «kassa cheki»', () => {
    // Hujjat o'chirilgan/ko'chirilgan holat: manba YOLG'ON aytmaydi, faqat
    // raqam yo'q. Ekran shunda xom id chizmaydi (Q4 web qoidasi).
    const row = buildCollectionRow(
      input({ sourceDocType: 'retailsale', sourceDocId: 'sale-1', sourceDocNumber: null }),
      NOW,
    );
    expect(row?.source).toBe('retailsale');
    expect(row?.sourceDocNumber).toBeNull();
  });
});

describe('filterCollectionRowsBySource — Q4 kesimi', () => {
  const rows = buildCollectionList(
    [
      input({ id: 'kassa', sourceDocType: 'retailsale', sourceDocId: 's1' }),
      input({ id: 'qolda' }),
      input({ id: 'boshqa', sourceDocType: 'invoiceout', sourceDocId: 's2' }),
    ],
    NOW,
  );

  it('filtr berilmasa (undefined) — HAMMA qator qoladi', () => {
    expect(filterCollectionRowsBySource(rows, undefined)).toHaveLength(3);
  });

  it('`retailsale` — faqat kassa cheki qatori', () => {
    const out = filterCollectionRowsBySource(rows, 'retailsale');
    expect(out.map((r) => r.debtId)).toEqual(['kassa']);
  });

  it('🔴 `registry` — NULL li qator ham, noma`lum turli qator ham QOLADI', () => {
    // Bu — SQL `source_doc_type <> \'retailsale\'` tuzog'ining sof qatlamdagi
    // qo'riqchisi: u NULL larni chiqarib tashlardi va qo'lda ochilgan barcha
    // `QRZ-` qarzlari jimgina yo'qolardi.
    const out = filterCollectionRowsBySource(rows, 'registry');
    expect(out.map((r) => r.debtId).sort()).toEqual(['boshqa', 'qolda']);
  });

  it('filtr qatorlarni O`ZGARTIRMAYDI (faqat tanlaydi)', () => {
    const out = filterCollectionRowsBySource(rows, 'retailsale');
    expect(out[0]).toBe(rows.find((r) => r.debtId === 'kassa'));
  });
});

describe('summarizeCollection — Q4 manba sanoqlari', () => {
  it('kassa va reyestr qatorlari ALOHIDA sanaladi, jami esa o`sha', () => {
    const rows = buildCollectionList(
      [
        input({ id: 'a', sourceDocType: 'retailsale', sourceDocId: 's1' }),
        input({ id: 'b', sourceDocType: 'retailsale', sourceDocId: 's2' }),
        input({ id: 'c' }),
      ],
      NOW,
    );
    const s = summarizeCollection(rows);
    expect(s.retailSaleCount).toBe(2);
    expect(s.registryCount).toBe(1);
    // Ikkala sanoq YIG'INDISI qatorlar soniga TENG — hech bir qator
    // ikki chelakka tushmaydi va hech biri chetda qolmaydi.
    expect(s.retailSaleCount + s.registryCount).toBe(rows.length);
  });

  it('bo`sh ro`yxatda ikkala sanoq ham 0', () => {
    const s = summarizeCollection([]);
    expect(s.retailSaleCount).toBe(0);
    expect(s.registryCount).toBe(0);
  });
});
