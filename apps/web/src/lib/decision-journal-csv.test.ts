import { buildCsv } from '@moysklad/ui';
import { describe, expect, it } from 'vitest';
import {
  type DecisionJournalRow,
  decisionCsvColumns,
  flattenCell,
  moneyText,
} from './decision-journal-csv';

/**
 * 🔴 MK21 rejasining 3-testi — «filtr/eksport EKRAN RAQAMIGA MOS».
 *
 * Eksport ekrandagi qatorlar massividan quriladi (ikkinchi so'rov emas), ya'ni
 * mos kelmaslik faqat ikki joyda bo'lishi mumkin: (a) ustun quruvchi qatorni
 * tashlab ketsa, (b) katak ichidagi qator uzilishi faylda qo'shimcha SATR
 * yasab, «nechta qator eksport bo'ldi» degan savolga ikki xil javob bersa.
 * Ikkalasi ham shu yerda qulflangan.
 */

/** Sarlavhalar va kod nomlari o'rniga kalitning o'zi — test tarjimadan mustaqil. */
const t = (k: string) => k;
const when = (iso: string) => iso;

function row(over: Partial<DecisionJournalRow> & { key: string }): DecisionJournalRow {
  return {
    source: 'daily_kpi',
    eventId: over.key,
    occurredAt: '2026-08-01T08:00:00.000Z',
    action: 'accept',
    fromState: 'pending',
    toState: 'accepted',
    actorType: 'manager',
    actorId: 'mgr-1',
    actorName: 'Aziz',
    subjectId: 'day-1',
    subjectLabel: '2026-08-01',
    subjectEmployeeId: 'emp-1',
    subjectEmployeeName: 'Sardor',
    reasonCode: null,
    comment: null,
    money: [],
    voided: false,
    voidedByKey: null,
    ...over,
  };
}

function dataLines(csv: string): string[] {
  return csv.split('\r\n').slice(1);
}

describe('MK21 — eksport EKRAN bilan bir xil qatorlarni beradi', () => {
  it('fayldagi ma`lumot qatorlari soni = ekrandagi qatorlar soni', () => {
    const rows = Array.from({ length: 7 }, (_, i) => row({ key: `k${i}` }));
    const csv = buildCsv(decisionCsvColumns(t, when), rows);

    expect(dataLines(csv)).toHaveLength(rows.length);
  });

  it('KO`P QATORLI izoh faylda qo`shimcha satr yasamaydi', () => {
    const rows = [row({ key: 'a', comment: 'birinchi qator\nikkinchi qator' }), row({ key: 'b' })];
    const csv = buildCsv(decisionCsvColumns(t, when), rows);

    expect(dataLines(csv)).toHaveLength(2);
    expect(csv).toContain('birinchi qator / ikkinchi qator');
  });

  it('har qatorda sarlavha bilan bir xil katak soni bor', () => {
    const cols = decisionCsvColumns(t, when);
    const csv = buildCsv(cols, [row({ key: 'a', comment: 'vergul, ichida', reasonCode: 'other' })]);
    const [header, ...rest] = csv.split('\r\n');

    // Vergulli katak qo'shtirnoqqa olinadi, shuning uchun oddiy `split(',')`
    // emas — RFC 4180 ni hisobga oluvchi sanoq.
    expect(countCells(header as string)).toBe(cols.length);
    for (const line of rest) expect(countCells(line)).toBe(cols.length);
  });
});

describe('MK21 — eksport HECH NARSANI yashirmaydi', () => {
  it('bekor qilingan qaror faylda belgisi bilan chiqadi', () => {
    const rows = [row({ key: 'a', voided: true, voidedByKey: 'daily_kpi:rop' })];
    const csv = buildCsv(decisionCsvColumns(t, when), rows);

    expect(dataLines(csv)).toHaveLength(1);
    expect(csv).toContain('voided_yes');
  });

  it('ismi topilmagan aktyor ID bilan chiqadi, bo`sh emas', () => {
    const csv = buildCsv(decisionCsvColumns(t, when), [
      row({ key: 'a', actorName: null, actorId: 'gone-1' }),
    ]);
    expect(csv).toContain('gone-1');
  });

  it('teskari (manfiy) pul yozuvi ko`rinadi', () => {
    const csv = buildCsv(decisionCsvColumns(t, when), [
      row({ key: 'a', money: [{ kind: 'bonus', amountMinor: '-50000' }] }),
    ]);
    expect(csv).toContain('bonus -50000');
  });
});

describe('MK21 — yordamchi funksiyalar', () => {
  it('`flattenCell` null va bo`sh joyni xavfsiz qaytaradi', () => {
    expect(flattenCell(null)).toBe('');
    expect(flattenCell('  a\r\nb  ')).toBe('a / b');
  });

  it('`moneyText` bir necha yozuvni birlashtiradi', () => {
    expect(
      moneyText([
        { kind: 'bonus', amountMinor: '50000' },
        { kind: 'fine', amountMinor: '-10000' },
      ]),
    ).toBe('bonus +50000 · fine -10000');
  });
});

/** RFC 4180 ni hisobga oluvchi katak sanog'i. */
function countCells(line: string): number {
  let cells = 1;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') i++;
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cells++;
    }
  }
  return cells;
}
