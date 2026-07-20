import { describe, expect, it } from 'vitest';
import { fmtSom, mdSafe, reminderMessage } from './debt-telegram.util.js';

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

  it('eslatma: qoldiq summa bor', () => {
    const m = reminderMessage({ name: 'Feruz', remainingMinor: 30_000_000n });
    expect(m).toContain('300 000');
  });

  // ODDIY MATN (2026-07-20): xabarlar HTML ishlatmaydi (MTProto userbot
  // parse_mode'ni qo'llamaydi), shuning uchun mijoz nomi ESCAPE qilinmaydi —
  // qanday kiritilgan bo'lsa, shundayligicha ko'rinadi.
  it('mijoz nomi HTML escape qilinmasdan, aynan qanday kiritilgan bo‘lsa shunday ko‘rinadi', () => {
    const m = reminderMessage({ name: "O'ktam & Co", remainingMinor: 100n });
    expect(m).toContain("O'ktam & Co");
  });

  it('eslatmada bir xil 📞💳👨‍💻 aloqa bloki bor', () => {
    const m = reminderMessage({ name: 'Feruz', remainingMinor: 100n });
    for (const line of ['📞 *Savollar uchun:*', '💳 *Karta raqam:*', '👨‍💻 *Karta egasi:*']) {
      expect(m).toContain(line);
    }
    expect(m).toContain('SHERSET jamoasi!');
  });

  // 2026-07-20b/c: foydalanuvchi aniq spetsifikatsiya berdi — summa
  // RAQAMINING o'zi HAM *qalin*, HAM __tagliq__ ("so'm" so'zisiz), aloqa-blok
  // label'lari *qalin*, LEKIN karta raqami va boshqa qiymatlar oddiy (qalin
  // EMAS). HTML <b>/<u> ISHLAMAYDI (MTProto userbot parse_mode'ni
  // qo'llamaydi), shuning uchun GramJS'ning MarkdownV2Parser dialekti
  // ishlatiladi (mtproto-worker.service.ts `sourceEventType` `debt.` bo'lsa
  // shu dialektni tanlaydi) — bu dialektda qalinlik BITTA `*x*` (ikkita
  // EMAS), tagliq `__x__`, ikkalasi birga `*__x__*` (real GramJS parser bilan
  // tekshirilgan — ikkala entity ham to'g'ri hosil bo'ladi).
  describe('summa raqami *qalin* HAM __tagliq__ ("so\'m"siz), aloqa-blok label\'lari *qalin*, qiymatlar oddiy', () => {
    it('eslatma: qoldiq summa raqami *qalin*+__tagliq__, "so\'m" oddiy', () => {
      const m = reminderMessage({ name: 'Feruz', remainingMinor: 30_000_000n });
      expect(m).toContain("*__300 000__* so'm");
    });

    it("aloqa-blok label'lari *qalin*, karta raqami oddiy (qalin emas)", () => {
      const m = reminderMessage({ name: 'Feruz', remainingMinor: 100n });
      expect(m).toContain('*Savollar uchun:*');
      expect(m).toContain('*Karta raqam:*');
      expect(m).toContain('*Karta egasi:*');
      // Karta raqami qiymati o'zi qalin belgilanmagan bo'lishi kerak.
      expect(m).not.toContain('*9860 1201 2532 1642*');
      expect(m).toContain('9860 1201 2532 1642');
    });
  });

  // XAVFSIZLIK (2026-07-20, 2026-07-20b yangilandi): mijoz nomida Markdown
  // belgilovchisi bo'lsa, u tasodifan qalin/tagliq/kursiv'ni ochib, undan
  // keyingi BUTUN xabar formatini buzmasligi kerak (masalan "*Hacker* ...
  // *1 so'm*" — ismdagi ochilgan "*" summadagi yopilish "*" bilan noto'g'ri
  // qo'shilib, orasidagi hammasi bitta katta qalin blok bo'lib qolardi).
  describe('mdSafe — mijoz nomidagi Markdown belgilovchilarini zararsizlantiradi', () => {
    it('qo‘shni maxsus belgilar orasiga ko‘rinmas belgi qo‘yadi', () => {
      const safe = mdSafe('**Hacker**');
      expect(safe).not.toContain('**');
      expect(safe.replace(/[​]/g, '')).toBe('**Hacker**');
    });

    it('oddiy ism (maxsus belgisiz) o‘zgarishsiz qoladi', () => {
      expect(mdSafe('Feruz aka')).toBe('Feruz aka');
    });

    it('kursiv (-) va spoyler (|) belgilari ham zararsizlantiriladi', () => {
      const safe = mdSafe('Anvar-Botir|X');
      expect(safe.replace(/[​]/g, '')).toBe('Anvar-Botir|X');
      expect(safe).not.toBe('Anvar-Botir|X'); // ZWS qo'shilgan bo'lishi kerak
    });

    it('xabarda mijoz ismidagi "*" summaning qalin/tagliq belgisi bilan qo‘shilib ketmaydi', () => {
      const m = reminderMessage({ name: '*Hacker*', remainingMinor: 100n });
      // Ism → summa oralig'ida "yopilmagan" bitta katta qalin blok YO'Q —
      // to'g'ri holatda faqat summa raqamining o'zi ("*__1__*") qalin+tagliq
      // bo'lishi kerak, ism bilan summa orasidagi butun matn emas.
      expect(m).not.toMatch(/\*Hacker\*[\s\S]*__1__/);
      expect(m).toContain('*__1__*');
    });

    it('berilgan contact ishlatiladi', () => {
      const msg = reminderMessage({
        name: 'Akmal',
        remainingMinor: 125_000_000n,
        contact: { phone: '+998911112233', card: '1111', cardOwner: 'Yangi Egasi' },
      });
      expect(msg).toContain('+998911112233');
      expect(msg).toContain('Yangi Egasi');
    });

    it("contact yo'q: default konstanta", () => {
      const msg = reminderMessage({ name: 'Akmal', remainingMinor: 125_000_000n });
      expect(msg).toContain('+998915748800');
    });
  });
});
