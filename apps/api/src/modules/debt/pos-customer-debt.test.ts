import { describe, expect, it } from 'vitest';
import { splitDebtSources } from './pos-customer-debt.js';

/**
 * F9 — IKKI QARZ DAFTARI. Bu modul ularni **uchrashtirmaydi**, u ikkalasini
 * ochiq qilib ko'rsatadi (kassir yolg'on raqamni ko'rmasin).
 *
 * Manbalar (kod bilan o'lchangan, 2026-08-11):
 *   · `CounterpartyBalance` — POS qarzga sotuvi shu yerga yozadi
 *     (`retail-sale.service.ts` — `debtAmount > 0n && debtAgentId` sharti),
 *     qaytarish esa shu yerdan ayiradi (`-debtReturn`).
 *   · `Debt` reyestri — POS «Qarz to'lovi» FIFO'si FAQAT shu yerdan yopadi
 *     (`pos-debt-payment.service.ts#lockOpenDebts`).
 *
 * Ya'ni balansdagi qarzning bir qismi POS'da TO'LANMAYDI. Shu farq
 * (`unregisteredMinor`) — ekranga chiqadigan haqiqat, yashiriladigan emas.
 */
describe('F9 — qarz manbalari ajratmasi', () => {
  it("balans reyestrdan katta bo'lsa — farq «reyestrsiz qarz» sifatida chiqadi", () => {
    const s = splitDebtSources(
      [{ currency: 'UZS', balanceMinor: 100_000n }],
      40_000n,
      'UZS',
    );
    expect(s.balanceMinor).toBe(100_000n);
    expect(s.registryOutstandingMinor).toBe(40_000n);
    expect(s.unregisteredMinor).toBe(60_000n);
    expect(s.registryExceedsBalance).toBe(false);
  });

  it('ikki manba teng — farq nol, ogohlantirish yo`q', () => {
    const s = splitDebtSources([{ currency: 'UZS', balanceMinor: 40_000n }], 40_000n, 'UZS');
    expect(s.unregisteredMinor).toBe(0n);
    expect(s.registryExceedsBalance).toBe(false);
  });

  it('🔴 NULL ≠ 0 — balans qatori YO`Q bo`lsa «0» deb qaytarilmaydi', () => {
    // Qator yo'qligi «qarz yo'q» degani EMAS: balans yozuvchisi Faza 9 da
    // qo'shilgan, undan oldingi `Debt` qatorlari uchun qator umuman yo'q
    // (xotira: «Balans o'quvchilari jurnaldan» — backfill yugurtirilmagan).
    // Shuning uchun `null` = «o'lchanmagan», FE uni «—» deb chizadi.
    const s = splitDebtSources([], 40_000n, 'UZS');
    expect(s.balanceMinor).toBeNull();
    expect(s.unregisteredMinor).toBeNull();
    expect(s.registryOutstandingMinor).toBe(40_000n);
  });

  it('reyestr balansdan katta — bayroq ko`tariladi, manfiy farq chizilmaydi', () => {
    const s = splitDebtSources([{ currency: 'UZS', balanceMinor: 10_000n }], 40_000n, 'UZS');
    expect(s.unregisteredMinor).toBe(0n);
    expect(s.registryExceedsBalance).toBe(true);
  });

  it('boshqa valyutadagi qoldiq YO`QOLMAYDI — alohida ro`yxatda qaytadi', () => {
    // Kassa so'mda ishlaydi, lekin mijozda dollar qoldig'i bo'lishi mumkin.
    // Uni jimgina tashlab yuborish «qarzi yo'q» degan yolg'on bo'lardi.
    const s = splitDebtSources(
      [
        { currency: 'UZS', balanceMinor: 10_000n },
        { currency: 'USD', balanceMinor: 500n },
      ],
      0n,
      'UZS',
    );
    expect(s.balanceMinor).toBe(10_000n);
    expect(s.otherCurrencies).toEqual([{ currency: 'USD', balanceMinor: 500n }]);
  });

  it('nol qoldiqli boshqa valyuta ro`yxatga tushmaydi (shovqin emas)', () => {
    const s = splitDebtSources(
      [
        { currency: 'UZS', balanceMinor: 10_000n },
        { currency: 'USD', balanceMinor: 0n },
      ],
      0n,
      'UZS',
    );
    expect(s.otherCurrencies).toEqual([]);
  });

  it('manfiy balans (biz mijozga qarzdormiz) — reyestrsiz qarz emas', () => {
    const s = splitDebtSources([{ currency: 'UZS', balanceMinor: -5_000n }], 0n, 'UZS');
    expect(s.balanceMinor).toBe(-5_000n);
    expect(s.unregisteredMinor).toBe(0n);
    expect(s.registryExceedsBalance).toBe(false);
  });
});
