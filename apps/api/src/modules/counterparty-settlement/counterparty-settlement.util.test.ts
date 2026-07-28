import { describe, expect, it } from 'vitest';
import {
  computeSettlement,
  currencyUnit,
  formatSettlementAmount,
  settlementTextForCounterparty,
  settlementTextForOwner,
} from './counterparty-settlement.util.js';

describe('computeSettlement — kim kimdan qancha qarzdor', () => {
  it("harakat yo'q → bo'sh, primary null", () => {
    const s = computeSettlement({ balances: [], debts: [] });
    expect(s.lines).toEqual([]);
    expect(s.primary).toBeNull();
  });

  it('musbat saldo = kontragent bizga qarzdor', () => {
    const s = computeSettlement({
      balances: [{ currency: 'UZS', balanceMinor: 4_500_000n }],
      debts: [],
    });
    expect(s.primary?.ledgerBalanceMinor).toBe(4_500_000n);
    expect(s.primary?.combinedMinor).toBe(4_500_000n);
  });

  it('manfiy saldo = BIZ qarzdormiz (Qabul/InvoiceIn holati)', () => {
    const s = computeSettlement({
      balances: [{ currency: 'UZS', balanceMinor: -12_000_000n }],
      debts: [],
    });
    expect(s.primary?.ledgerBalanceMinor).toBe(-12_000_000n);
    expect(settlementTextForOwner('Uz kabel', s.primary!.ledgerBalanceMinor, 'UZS')).toBe(
      "Biz «Uz kabel»ga 120 000 so'm qarzdormiz.",
    );
  });

  it("QRZ- reyestr qoldig'i alohida ustunda turadi, saldoga QO'SHIB YUBORILMAYDI", () => {
    const s = computeSettlement({
      balances: [{ currency: 'UZS', balanceMinor: 100_000n }],
      debts: [{ currency: 'UZS', totalMinor: 500_000n, paidMinor: 200_000n }],
    });
    expect(s.primary?.ledgerBalanceMinor).toBe(100_000n);
    expect(s.primary?.debtRegistryOutstandingMinor).toBe(300_000n);
    // combined ALOHIDA maydon — chaqiruvchi ongli ravishda tanlaydi.
    expect(s.primary?.combinedMinor).toBe(400_000n);
  });

  it("bir nechta QRZ- qarz — qoldiqlar yig'iladi, yopilgani hisobga olinmaydi", () => {
    const s = computeSettlement({
      balances: [],
      debts: [
        { currency: 'UZS', totalMinor: 1_000_000n, paidMinor: 0n },
        { currency: 'UZS', totalMinor: 700_000n, paidMinor: 250_000n },
        { currency: 'UZS', totalMinor: 300_000n, paidMinor: 300_000n }, // yopilgan
      ],
    });
    expect(s.primary?.debtRegistryOutstandingMinor).toBe(1_450_000n);
  });

  it("ortiqcha to'lov reyestr qoldig'ini MANFIYga tushirmaydi (0 ga qisiladi)", () => {
    // Ortiqcha to'lov bosh daftarda applyDelta(-paid) orqali allaqachon bor —
    // reyestrda ham manfiy chiqsa, ikki marta sanalardi.
    const s = computeSettlement({
      balances: [],
      debts: [{ currency: 'UZS', totalMinor: 100_000n, paidMinor: 180_000n }],
    });
    expect(s.primary?.debtRegistryOutstandingMinor).toBe(0n);
  });

  it("VALYUTALAR QO'SHILMAYDI — har biri o'z qatorida", () => {
    const s = computeSettlement({
      balances: [
        { currency: 'UZS', balanceMinor: 500_000n },
        { currency: 'USD', balanceMinor: -20_000n },
      ],
      debts: [{ currency: 'USD', totalMinor: 5_000n, paidMinor: 0n }],
    });
    expect(s.lines).toHaveLength(2);
    const uzs = s.lines.find((l) => l.currency === 'UZS');
    const usd = s.lines.find((l) => l.currency === 'USD');
    expect(uzs?.ledgerBalanceMinor).toBe(500_000n);
    expect(usd?.ledgerBalanceMinor).toBe(-20_000n);
    expect(usd?.debtRegistryOutstandingMinor).toBe(5_000n);
  });

  it('UZS har doim birinchi qator (barqaror tartib)', () => {
    const s = computeSettlement({
      balances: [
        { currency: 'EUR', balanceMinor: 1n },
        { currency: 'USD', balanceMinor: 1n },
        { currency: 'UZS', balanceMinor: 1n },
      ],
      debts: [],
    });
    expect(s.lines.map((l) => l.currency)).toEqual(['UZS', 'EUR', 'USD']);
  });

  it('valyuta kodi registri farq qilsa ham bitta qatorga birlashadi', () => {
    const s = computeSettlement({
      balances: [{ currency: 'uzs', balanceMinor: 100n }],
      debts: [{ currency: 'UZS', totalMinor: 50n, paidMinor: 0n }],
    });
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0].currency).toBe('UZS');
  });
});

describe('formatSettlementAmount', () => {
  it('minglarni ajratadi', () => {
    expect(formatSettlementAmount(123_456_700n)).toBe('1 234 567');
  });

  it("ishorani tashlaydi (matn yo'nalishni o'zi aytadi)", () => {
    expect(formatSettlementAmount(-4_500_000n)).toBe('45 000');
  });

  it("tiyin bo'lsa ko'rsatadi, bo'lmasa yo'q", () => {
    expect(formatSettlementAmount(100_050n)).toBe('1 000,50');
    expect(formatSettlementAmount(100_000n)).toBe('1 000');
  });

  it('nol', () => {
    expect(formatSettlementAmount(0n)).toBe('0');
  });

  it('float aniqligidan katta summa ham buzilmaydi (BigInt)', () => {
    // 2^53 tiyindan katta: Number bo'lsa aniqlik yo'qolardi.
    expect(formatSettlementAmount(9_007_199_254_740_993_00n)).toBe('9 007 199 254 740 993');
  });
});

describe('matnlar', () => {
  it('kontragentga — ular qarzdor', () => {
    expect(settlementTextForCounterparty(4_500_000n, 'UZS')).toBe("Sizda 45 000 so'm qarz bor.");
  });

  it('kontragentga — biz qarzdormiz', () => {
    expect(settlementTextForCounterparty(-4_500_000n, 'UZS')).toBe(
      "Sizga 45 000 so'm qarzimiz bor — tez orada to'lanadi.",
    );
  });

  it('kontragentga — teng', () => {
    expect(settlementTextForCounterparty(0n, 'UZS')).toBe("Hisob teng — qarz yo'q.");
  });

  it("egaga — ikki yo'nalish", () => {
    expect(settlementTextForOwner('Uz kabel', 100n, 'UZS')).toBe(
      "«Uz kabel» bizga 1 so'm qarzdor.",
    );
    expect(settlementTextForOwner('Uz kabel', -100n, 'UZS')).toBe(
      "Biz «Uz kabel»ga 1 so'm qarzdormiz.",
    );
    expect(settlementTextForOwner('Uz kabel', 0n, 'UZS')).toBe(
      "«Uz kabel» bilan hisob teng — qarz yo'q.",
    );
  });

  it("valyuta birligi UZS bo'lmasa kod bilan chiqadi", () => {
    expect(currencyUnit('UZS')).toBe("so'm");
    expect(currencyUnit('usd')).toBe('USD');
    expect(settlementTextForCounterparty(150_00n, 'USD')).toBe('Sizda 150 USD qarz bor.');
  });
});
