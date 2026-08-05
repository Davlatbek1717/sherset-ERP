import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Xarajat/inkassatsiya ulanish qulfi (kassa TZ §8.2 / §8.3 / §8.4).
 *
 * Bu yerda uch invariant manba bo'yicha qulflanadi — uchalasi ham buzilsa
 * typecheck jim o'tadi va sof modul testlari yashil qoladi:
 *
 * 1. **Kutilgan naqd `kind` bo'yicha FILTRLANMASLIGI kerak.** Xarajat ham,
 *    inkassatsiya ham, eski «Изъятие» ham bitta jadvalda. Kimdir
 *    `where: { kind: 'other' }` qo'shsa xarajatlar formuladan tushib
 *    qoladi va kassir har smenada o'sha summaga ortiqcha chiqadi — bu
 *    §100 bug'ining aynan takrori.
 * 2. **Kutilgan naqd bitta joyda hisoblanadi.** Nusxa paydo bo'lsa biri
 *    jimgina eskiradi.
 * 3. **Hujjat va audit izi bitta tranzaksiyada.** Tasdiqsiz erkinlikning
 *    (Q10) yagona muvozanati — iz. Izsiz xarajat = nazoratsiz pul.
 */
const SERVICE = readFileSync(join(import.meta.dirname, 'cashier-session.service.ts'), 'utf8');

/** `collectCashInputs` metodining tanasi (keyingi metod boshlanishigacha). */
function cashInputsBody(): string {
  const start = SERVICE.indexOf('private async collectCashInputs');
  expect(start, 'collectCashInputs topilmadi').toBeGreaterThan(-1);
  const end = SERVICE.indexOf('\n  async ', start);
  return SERVICE.slice(start, end === -1 ? SERVICE.length : end);
}

describe('xarajat/inkassatsiya ↔ smena naqdi ulanishi', () => {
  it('chiqim yig`indisi `kind` bo`yicha FILTRLANMAYDI', () => {
    const body = cashInputsBody();
    const outAgg = body.slice(body.indexOf('retailDrawerCashOut.aggregate'));
    expect(outAgg).toContain('retailShiftId: sessionId');
    // Aynan shu: kind bo'yicha filtr = xarajatlar formuladan tushishi.
    expect(outAgg.slice(0, 300)).not.toMatch(/kind\s*:/);
  });

  it('faqat `posted` va o`chirilmagan hujjatlar hisobga olinadi', () => {
    const body = cashInputsBody();
    const outAgg = body.slice(body.indexOf('retailDrawerCashOut.aggregate'), body.length);
    expect(outAgg).toContain("state: 'posted'");
    expect(outAgg).toContain('deletedAt: null');
  });

  it('kutilgan naqd BITTA joyda yig`iladi (nusxa yo`q)', () => {
    const matches = SERVICE.match(/retailDrawerCashOut\.aggregate/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it('smena yopish ham, xarajat ham SHU metodni chaqiradi', () => {
    const calls = SERVICE.match(/this\.collectCashInputs\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it('hujjat va audit izi BITTA tranzaksiyada yoziladi', () => {
    const start = SERVICE.indexOf('async posCashOut');
    const body = SERVICE.slice(start, SERVICE.indexOf('\n  /** Smenadagi pul chiqishi', start));
    const txAt = body.indexOf('$transaction');
    const docAt = body.indexOf('tx.retailDrawerCashOut.create');
    const auditAt = body.indexOf('tx.cashierAuditEvent.createMany');
    expect(txAt, '$transaction yo`q').toBeGreaterThan(-1);
    expect(docAt, 'hujjat tranzaksiyadan tashqarida').toBeGreaterThan(txAt);
    expect(auditAt, 'audit tranzaksiyadan tashqarida').toBeGreaterThan(txAt);
  });

  it('validatsiya SOF moduldan olinadi (servisda takrorlanmaydi)', () => {
    expect(SERVICE).toMatch(/validateCashOut\(\{/);
    // Qoida ikki joyda bo'lsa biri eskirardi.
    expect(SERVICE).not.toMatch(/kind === 'expense' && !.*expenseItemId/);
  });
});
