import { describe, expect, it } from 'vitest';
import {
  debtClosedMessage,
  debtIssuedMessage,
  fmtSom,
  mdSafe,
  paymentMessage,
  paymentReversedMessage,
  reminderMessage,
} from './debt-telegram.util.js';

/**
 * Bu matnlarni MIJOZ o'qiydi. Xato ketsa — mijozga noto'g'ri summa boradi,
 * bu esa ishonchni buzadi. Shuning uchun har bir matn qulflanadi.
 */
describe('debt-telegram xabarlari', () => {
  describe('fmtSom', () => {
    it('tiyinni sm ga o‘giradi va uchlik bilan ajratadi', () => {
      expect(fmtSom(125_000_000n)).toBe('1 250 000');
      expect(fmtSom(100n)).toBe('1');
      expect(fmtSom(0n)).toBe('0');
      expect(fmtSom(773_778_282_300n)).toBe('7 737 782 823');
    });
  });

  it('qarz berildi: summa va muddat bor', () => {
    const m = debtIssuedMessage({
      name: 'Feruz aka',
      totalMinor: 125_000_000n,
      nextContactAt: new Date('2026-07-20T04:00:00.000Z'), // 09:00 Toshkent
    });
    expect(m).toContain('Feruz aka');
    expect(m).toContain('1 250 000');
    expect(m).toContain('20.07.2026');
    expect(m).toContain('09:00');
  });

  it('qarz berildi: muddat yo‘q bo‘lsa qator tushib qoladi', () => {
    const m = debtIssuedMessage({ name: 'X', totalMinor: 100n, nextContactAt: null });
    expect(m).not.toContain('muddati');
  });

  it('to‘lov: qabul qilingan summa VA qoldiq ko‘rsatiladi', () => {
    const m = paymentMessage({
      name: 'Feruz',
      amountMinor: 50_000_000n, // 500 000
      remainingMinor: 75_000_000n, // 750 000
    });
    expect(m).toContain('500 000');
    expect(m).toContain('750 000');
  });

  it('qarz yopildi: qoldiq ko‘rsatilmaydi, tabrik bor', () => {
    const m = debtClosedMessage({ name: 'Feruz', amountMinor: 50_000_000n });
    expect(m).toContain('500 000');
    expect(m).toContain("to'liq yopildi");
    expect(m).not.toContain('Qolgan qarz');
  });

  it('eslatma: qoldiq summa bor', () => {
    const m = reminderMessage({ name: 'Feruz', remainingMinor: 30_000_000n });
    expect(m).toContain('300 000');
  });

  // STORNO (2026-07-16): mijoz avval «qabul qilindi» xabarini olgan —
  // bekor qilinganini ham aniq summa va yangi qoldiq bilan bilishi kerak.
  it('to‘lov qaytarildi: bekor qilingan summa VA joriy qoldiq ko‘rsatiladi', () => {
    const m = paymentReversedMessage({
      name: 'Feruz',
      amountMinor: 50_000_000n, // 500 000
      remainingMinor: 125_000_000n, // 1 250 000
    });
    expect(m).toContain('500 000');
    expect(m).toContain('1 250 000');
    expect(m).toContain('bekor qilindi');
  });

  // ODDIY MATN (2026-07-20): xabarlar HTML ishlatmaydi (MTProto userbot
  // parse_mode'ni qo'llamaydi), shuning uchun mijoz nomi ESCAPE qilinmaydi —
  // qanday kiritilgan bo'lsa, shundayligicha ko'rinadi.
  it('mijoz nomi HTML escape qilinmasdan, aynan qanday kiritilgan bo‘lsa shunday ko‘rinadi', () => {
    const m = paymentMessage({
      name: "O'ktam & Co",
      amountMinor: 100n,
      remainingMinor: 100n,
    });
    expect(m).toContain("O'ktam & Co");
  });

  // 2026-07-20: barcha mijoz-xabarlari BIR XIL 📞💳👨‍💻 aloqa blokini
  // ishlatishi kerak — foydalanuvchi debtIssuedMessage bu blokdan mahrum
  // ekanini (reminderMessage bilan solishtirib) skrinshot bilan ko'rsatdi.
  describe('barcha xabarlarda bir xil 📞💳👨‍💻 aloqa bloki', () => {
    const CONTACT_LINES = ['📞 Savollar uchun:', '💳 Karta raqam:', '👨‍💻 Karta egasi:'];

    it('qarz berildi (debtIssuedMessage)', () => {
      const m = debtIssuedMessage({ name: 'Feruz', totalMinor: 100n, nextContactAt: null });
      for (const line of CONTACT_LINES) expect(m).toContain(line);
      expect(m).toContain('SHERSET jamoasi!');
    });

    it("to'lov qabul qilindi (paymentMessage)", () => {
      const m = paymentMessage({ name: 'Feruz', amountMinor: 100n, remainingMinor: 100n });
      for (const line of CONTACT_LINES) expect(m).toContain(line);
    });

    it("to'lov qaytarildi (paymentReversedMessage)", () => {
      const m = paymentReversedMessage({ name: 'Feruz', amountMinor: 100n, remainingMinor: 100n });
      for (const line of CONTACT_LINES) expect(m).toContain(line);
    });

    it('eslatma (reminderMessage)', () => {
      const m = reminderMessage({ name: 'Feruz', remainingMinor: 100n });
      for (const line of CONTACT_LINES) expect(m).toContain(line);
    });
  });

  // 2026-07-20: foydalanuvchi rasm bilan ko'rsatdi — muhim summalar **qalin**
  // bo'lishi kerak edi. HTML <b> ISHLAMAYDI (MTProto userbot parse_mode'ni
  // qo'llamaydi — aynan shu sababdan avvalgi xabarlar tegsiz chiqqan edi),
  // lekin GramJS TelegramClient DEFOLT ravishda o'z Markdown parserini
  // ishlatadi (telegram/extensions/markdown.js: '**' → MessageEntityBold),
  // shuning uchun **...** to'g'ri qalin bo'lib ko'rinadi.
  describe('muhim summalar **qalin** Markdown bilan belgilangan', () => {
    it('eslatma: qoldiq summa **qalin**', () => {
      const m = reminderMessage({ name: 'Feruz', remainingMinor: 30_000_000n });
      expect(m).toContain("**300 000 so'm**");
    });

    it('qarz berildi: summa VA karta raqami **qalin**', () => {
      const m = debtIssuedMessage({ name: 'Feruz', totalMinor: 100n, nextContactAt: null });
      expect(m).toContain("**1 so'm**");
      expect(m).toContain('**9860 1201 2532 1642**');
    });

    it("to'lov qabul qilindi: ikkala summa ham **qalin**", () => {
      const m = paymentMessage({ name: 'Feruz', amountMinor: 100n, remainingMinor: 200n });
      expect(m).toContain("**1 so'm**");
      expect(m).toContain("**2 so'm**");
    });
  });

  // XAVFSIZLIK (2026-07-20): mijoz nomida Markdown belgilovchisi (masalan
  // "**") bo'lsa, u tasodifan bold/italic'ni ochib, undan keyingi BUTUN
  // xabar formatini buzmasligi kerak (masalan "**Hacker** ... **1 so'm**"
  // — ismdagi ochilgan "**" summadagi yopilish "**" bilan noto'g'ri
  // qo'shilib, orasidagi hammasi bitta katta bold blok bo'lib qolardi).
  describe('mdSafe — mijoz nomidagi Markdown belgilovchilarini zararsizlantiradi', () => {
    it('qo‘shni maxsus belgilar orasiga ko‘rinmas belgi qo‘yadi', () => {
      const safe = mdSafe('**Hacker**');
      // Natijada "**" ketma-ketligi ENDI yo'q (orasida U+200B bor) —
      // GramJS parseri buni delimiter deb topa olmaydi.
      expect(safe).not.toContain('**');
      // Lekin ism hali ham o'qiladi (faqat ko'rinmas belgilar qo'shilgan).
      expect(safe.replace(/[​]/g, '')).toBe('**Hacker**');
    });

    it('oddiy ism (maxsus belgisiz) o‘zgarishsiz qoladi', () => {
      expect(mdSafe('Feruz aka')).toBe('Feruz aka');
    });

    it('xabarda mijoz ismidagi "**" summaning qalin belgisi bilan qo‘shilib ketmaydi', () => {
      const m = reminderMessage({ name: '**Hacker**', remainingMinor: 100n });
      // Ism → summa oralig'ida "yopilmagan" bitta katta bold blok YO'Q —
      // to'g'ri holatda faqat summaning o'zi ("**1 so'm**") qalin bo'lishi
      // kerak, ism bilan summa orasidagi butun matn emas.
      expect(m).not.toMatch(/\*\*Hacker\*\*[\s\S]*\*\*1 so'm\*\*/);
      expect(m).toContain("**1 so'm**");
    });
  });
});
