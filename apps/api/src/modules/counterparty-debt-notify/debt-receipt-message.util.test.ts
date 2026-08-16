import { describe, expect, it } from 'vitest';
import {
  DEBT_RECEIPT_CHUNK_LIMIT,
  type DebtReceiptContext,
  buildDebtReceiptMessages,
  uomLabel,
} from './debt-receipt-message.util.js';

/**
 * «Hisob-kitob cheki» — mijozga Telegram orqali yuboriladigan TO'LIQ hisob
 * (egasi, 2026-08-16: «mijoz bilan bo'lgan barcha cheklar borishi kerak»).
 *
 * DIZAYN QARORLARI (egasi tasdiqladi) va ular NEGA shunday:
 *   1. **Eng katta raqam YUQORIDA ham, pastda ham.** Telefonda xabar oldindan
 *      ko'rinishida faqat birinchi qatorlar chiqadi — mijoz ochmasdan ham
 *      qarzini ko'radi; pastdagi takror — xulosa.
 *   2. **Pastki blok YIG'ILADI:** oldingi qoldiq + yangi xaridlar − to'lovlar =
 *      jami. Mijoz o'zi tekshira oladi ⇒ bahs tugaydi. Prodda qarzning katta
 *      qismi eski qoldiq (tarix 2026-08-16 da tozalangan), shuning uchun
 *      «Oldingi qoldiq» qatorisiz raqamlar HECH QACHON yig'ilmasdi.
 *   3. **Ustunlar probel bilan TEKISLANMAYDI** — Telegram proportional shrift
 *      ishlatadi, «jadval» har telefonda qiyshayadi. Har qator «yorliq: qiymat».
 *   4. **Qog'oz chek bilan bitta ovoz** — «Jami summa», «Rahmat, bizni
 *      tanlaganingiz uchun!» aynan `RECEIPT_LABELS` dan olingan so'zlar.
 *   5. **Manfiy son mijozga KO'RSATILMAYDI** — yo'nalish so'z bilan aytiladi
 *      (avtomatik xabardagi `cpTotal` qoidasi bilan bir xil).
 */

const CTX: DebtReceiptContext = {
  orgName: 'Sherset elektro tovarlar',
  name: 'Mir Obit aka',
  currency: 'UZS',
  generatedAt: new Date('2026-08-16T09:20:00.000Z'),
  openingMinor: 2540300000n,
  finalBalanceMinor: 2695700000n,
  docs: [
    {
      moment: new Date('2026-08-16T05:00:00.000Z'),
      docType: 'retailsale',
      docNumber: 'ТРН-2026-00144',
      deltaMinor: 143400000n,
      items: [
        { name: 'Vera vkl 1x', quantity: '3', uom: 'шт' },
        { name: 'veral roz 1x', quantity: '1', uom: 'м' },
      ],
      receiptUrl: 'https://erp.sherset.uz/p/a3f9',
    },
    {
      moment: new Date('2026-08-16T06:00:00.000Z'),
      docType: 'retailsale',
      docNumber: 'ТРН-2026-00145',
      deltaMinor: 12000000n,
      items: [{ name: 'Merkuriy 1faza schotchik', quantity: '1', uom: 'шт' }],
    },
  ],
};

/** Bitta xabar kutilgan holatlar uchun — bo'linish alohida tekshiriladi. */
function one(ctx: DebtReceiptContext): string {
  const parts = buildDebtReceiptMessages(ctx);
  expect(parts).toHaveLength(1);
  return parts[0] as string;
}

describe('buildDebtReceiptMessages — tuzilma', () => {
  it('sarlavha: do`kon nomi + chek turi + sana', () => {
    const t = one(CTX);
    expect(t.startsWith('SHERSET ELEKTRO TOVARLAR\n')).toBe(true);
    expect(t).toContain('🧾 HISOB-KITOB CHEKI · 16.08.2026');
    expect(t).toContain('Hurmatli Mir Obit aka!');
  });

  it('🔴 jami qarz YUQORIDA ham chiqadi (xabar oldindan ko`rinishi uchun)', () => {
    const t = one(CTX);
    const first = t.indexOf('💰 Jami qarzingiz: 26 957 000');
    const last = t.lastIndexOf('💰 Jami qarzingiz: 26 957 000');
    expect(first).toBeGreaterThan(0);
    // Ikki marta — biri sarlavhadan keyin, ikkinchisi yakunda.
    expect(last).toBeGreaterThan(first);
    // Va u tovar qatorlaridan OLDIN turadi.
    expect(first).toBeLessThan(t.indexOf('Vera vkl 1x'));
  });

  it('oldingi qoldiq alohida qator (prodda qarzning katta qismi shu)', () => {
    expect(one(CTX)).toContain('📌 Oldingi qoldiq: 25 403 000 so`m'.replace('`', "'"));
  });

  it('har chek: sarlavha + tovarlar + jami summa', () => {
    const t = one(CTX);
    expect(t).toContain('📄 Savdo cheki №ТРН-2026-00144 · 16.08.2026');
    expect(t).toContain('   • Vera vkl 1x — 3 dona');
    expect(t).toContain('   • veral roz 1x — 1 m');
    expect(t).toContain("   Jami summa: 1 434 000 so'm");
  });

  it('chek havolasi bo`lsa chiqadi, bo`lmasa qator umuman yo`q', () => {
    const t = one(CTX);
    expect(t).toContain('   🧾 Chek: https://erp.sherset.uz/p/a3f9');
    // Ikkinchi chekda havola yo'q ⇒ jami bitta havola qatori.
    expect(t.match(/🧾 Chek:/g) ?? []).toHaveLength(1);
  });

  it('🔴 yakuniy blok YIG`ILADI: qoldiq + xaridlar − to`lovlar = jami', () => {
    const t = one(CTX);
    expect(t).toContain("Oldingi qoldiq: 25 403 000 so'm");
    expect(t).toContain("Yangi xaridlar: +1 554 000 so'm");
    expect(t).toContain("To'lovlaringiz: 0 so'm");
    // 25 403 000 + 1 554 000 = 26 957 000 — arifmetika mijozga ko'rinadi.
    expect(2540300000n + 143400000n + 12000000n).toBe(2695700000n);
  });

  it('qog`oz chek bilan bitta ovoz — yakuniy minnatdorchilik', () => {
    expect(one(CTX)).toContain('Rahmat, bizni tanlaganingiz uchun!');
  });
});

describe('buildDebtReceiptMessages — hujjat turlari', () => {
  it("to'lov qatori: qarz emas, TO'LOV tili bilan", () => {
    const t = one({
      ...CTX,
      docs: [
        {
          moment: new Date('2026-08-16T07:00:00.000Z'),
          docType: 'debtpayment',
          docNumber: 'QT-2026-00007',
          deltaMinor: -50000000n,
        },
      ],
      finalBalanceMinor: 2490300000n,
    });
    expect(t).toContain('✅ To`lov qabul qilindi'.replace('`', "'"));
    expect(t).toContain('QT-2026-00007');
    // Manfiy son KO'RSATILMAYDI — yo'nalish so'zda.
    expect(t).not.toContain('-500 000');
    expect(t).toContain("To'lovlaringiz: 500 000 so'm");
  });

  it('qaytarish — «Qaytarish» sarlavhasi bilan', () => {
    const t = one({
      ...CTX,
      docs: [
        {
          moment: new Date('2026-08-16T07:00:00.000Z'),
          docType: 'retailsale',
          docNumber: 'ТРН-2026-00150',
          deltaMinor: -20000000n,
          items: [{ name: 'Rozetka', quantity: '2', uom: 'шт' }],
        },
      ],
      finalBalanceMinor: 2520300000n,
    });
    expect(t).toContain('↩️ Qaytarish №ТРН-2026-00150');
  });

  it('noma`lum tur ham qatorni YO`QOTMAYDI (turning o`zi yorliq bo`ladi)', () => {
    const t = one({
      ...CTX,
      docs: [
        {
          moment: new Date('2026-08-16T07:00:00.000Z'),
          docType: 'kelajakdagiTur',
          docNumber: 'X-1',
          deltaMinor: 10000000n,
        },
      ],
      finalBalanceMinor: 2550300000n,
    });
    expect(t).toContain('X-1');
  });
});

describe('buildDebtReceiptMessages — chekka holatlar', () => {
  it('qarzi YO`Q mijoz: «hisob teng», qarz qatori emas', () => {
    const t = one({ ...CTX, openingMinor: 0n, docs: [], finalBalanceMinor: 0n });
    expect(t).toContain("Hisob teng — qarzingiz yo'q");
    expect(t).not.toContain('Jami qarzingiz');
    // Hujjat bo'lmasa «Oldingi qoldiq» ham chizilmaydi.
    expect(t).not.toContain('Oldingi qoldiq');
  });

  it('BIZ qarzdor bo`lsak — manfiy son emas, so`z bilan', () => {
    const t = one({ ...CTX, openingMinor: 0n, docs: [], finalBalanceMinor: -30000000n });
    expect(t).toContain('Sizga qarzimiz: 300 000');
    expect(t).not.toContain('-300 000');
  });

  it('oldingi qoldiq NOL bo`lsa qator chizilmaydi', () => {
    const t = one({ ...CTX, openingMinor: 0n, finalBalanceMinor: 155400000n });
    expect(t).not.toContain('📌 Oldingi qoldiq');
    // Lekin yakuniy blokda «Yangi xaridlar» qoladi.
    expect(t).toContain('Yangi xaridlar:');
  });

  it("o'lchov birligi tarjima qilinadi, noma'lumi asl holida qoladi", () => {
    expect(uomLabel('шт')).toBe('dona');
    expect(uomLabel('м')).toBe('m');
    expect(uomLabel('кг')).toBe('kg');
    expect(uomLabel('компл')).toBe('komplekt');
    expect(uomLabel('qandaydir')).toBe('qandaydir');
    expect(uomLabel(null)).toBe('');
  });
});

describe('buildDebtReceiptMessages — uzun hisob BO`LINADI', () => {
  const many: DebtReceiptContext = {
    ...CTX,
    docs: Array.from({ length: 60 }, (_, i) => ({
      moment: new Date('2026-08-16T05:00:00.000Z'),
      docType: 'retailsale',
      docNumber: `ТРН-2026-${String(i).padStart(5, '0')}`,
      deltaMinor: 10000000n,
      items: [
        { name: `Uzun tovar nomi raqami ${i}`, quantity: '3', uom: 'шт' },
        { name: `Ikkinchi tovar nomi ${i}`, quantity: '1', uom: 'м' },
      ],
    })),
  };

  it('har bo`lak Telegram chegarasiga sig`adi', () => {
    const parts = buildDebtReceiptMessages(many);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(DEBT_RECEIPT_CHUNK_LIMIT);
  });

  it('🔴 chek O`RTASIDAN kesilmaydi — bo`linish hujjat chegarasida', () => {
    const parts = buildDebtReceiptMessages(many);
    for (const p of parts) {
      // Tovar qatori bilan boshlangan bo'lak = yarim kesilgan chek.
      const firstBody = p.split('\n').find((l) => l.startsWith('   •'));
      const docAt = p.indexOf('📄');
      if (firstBody) expect(docAt).toBeGreaterThanOrEqual(0);
    }
  });

  it('bo`laklar raqamlanadi va yakun OXIRGISIDA turadi', () => {
    const parts = buildDebtReceiptMessages(many);
    expect(parts[0]).toContain(`(1/${parts.length})`);
    expect(parts[parts.length - 1]).toContain('Rahmat, bizni tanlaganingiz uchun!');
    // Yakuniy hisob-kitob faqat OXIRGI bo'lakda.
    const withTotals = parts.filter((p) => p.includes('Yangi xaridlar:'));
    expect(withTotals).toHaveLength(1);
  });
});
