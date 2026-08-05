import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * DRIFT-LOCK: naqd qarz to'lovi smena hisobiga ulanib turishi.
 *
 * `ShiftCashInputs.debtCashMinor` — IXTIYORIY maydon (eski chaqiruvchilar
 * buzilmasin uchun). Ya'ni servis uni uzatishni to'xtatsa **typecheck jim
 * o'tadi**, sof formula testlari ham yashil qoladi — faqat kassir har
 * smenada qarz summasiga ORTIQCHA chiqib turadi. Xuddi shu klass ilgari
 * `DocumentEditor` prop-drop bug'ida bo'lgan.
 *
 * Shuning uchun ulanishning o'zi manba bo'yicha qulflanadi.
 */
const SERVICE = readFileSync(join(import.meta.dirname, 'cashier-session.service.ts'), 'utf8');

describe('smena naqdi ↔ qarz to`lovi ulanishi', () => {
  it('servis debtCashMinor ni cashInputs ga uzatadi', () => {
    expect(SERVICE).toMatch(/debtCashMinor:\s*debtCashAgg\._sum\.amountMinor\s*\?\?\s*0n/);
  });

  it('faqat NAQD to`lov hisobga olinadi (terminal yashiqqa tushmaydi)', () => {
    const where = SERVICE.match(/debtPayment\.aggregate\(\{\s*where:\s*\{([^}]*)\}/);
    expect(where, 'debtPayment.aggregate topilmadi').not.toBeNull();
    expect(where?.[1]).toContain("method: 'cash'");
  });

  it('to`lov AYNAN shu smenaga bog`lanadi, kassaga emas', () => {
    // `cashDeskId` yetarli emas: bitta kassada kuniga bir necha smena bo'ladi.
    const where = SERVICE.match(/debtPayment\.aggregate\(\{\s*where:\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(where).toContain('retailShiftId: sessionId');
    expect(where).toContain('accountId');
  });

  it('bekor qilingan to`lov hisobga olinmaydi', () => {
    const where = SERVICE.match(/debtPayment\.aggregate\(\{\s*where:\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(where).toContain('reversedAt: null');
  });
});
