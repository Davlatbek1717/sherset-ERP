import { describe, expect, it, vi } from 'vitest';
import { PosContactSchema } from './counterparty.schema.js';
import { CounterpartyService } from './counterparty.service.js';

/**
 * F9 — kassada mijozning TELEFON/IZOHini tuzatish.
 *
 * 🔴 NEGA ALOHIDA YO'L, mavjud `PATCH /counterparties/:id` EMAS: kiosk
 * chegarasi yo'l darajasida ishlaydi (`KIOSK_ALLOWED`). Umumiy PATCH ni
 * ochish kassirga nom, narx turi, egasi, teglar, `uzRequisites` va boshqa
 * hamma maydonni ochib yuborardi — ekranda tugma bo'lmasa ham, to'g'ridan-
 * to'g'ri URL bilan (TZ §3.1 aynan shundan ogohlantiradi).
 *
 * Shuning uchun bu yerda ikki qatlam:
 *   1. `PosContactSchema` — OQ RO'YXAT (whitelist). Begona kalit qabul
 *      qilinmaydi, jimgina tashlanmaydi ham.
 *   2. `updatePosContact` — parse natijasidan YANGI obyekt quradi va
 *      `update()` ga faqat shuni uzatadi (xom `raw` uzatilmaydi).
 */
describe('F9 — PosContactSchema (oq ro`yxat)', () => {
  it('telefon va izohni qabul qiladi', () => {
    const r = PosContactSchema.parse({ version: 3, phone: '+998901234567', description: 'usta' });
    expect(r).toEqual({ version: 3, phone: '+998901234567', description: 'usta' });
  });

  it('`version` MAJBURIY — optimistik qulf chetlab o`tilmaydi', () => {
    expect(() => PosContactSchema.parse({ phone: '901' })).toThrow();
  });

  it('🔴 begona maydon RAD etiladi (jimgina tashlanmaydi)', () => {
    // Zod default `strip` bo'lganda `name` jimgina yo'qolardi va shartnoma
    // «nima o'tdi?» degan savolga javob bermasdi. `.strict()` — ochiq xato.
    expect(() => PosContactSchema.parse({ version: 1, name: 'Boshqa nom' })).toThrow();
    expect(() => PosContactSchema.parse({ version: 1, priceTypeId: 'x' })).toThrow();
    expect(() => PosContactSchema.parse({ version: 1, tags: ['vip'] })).toThrow();
  });

  it('telefonni bo`shatish mumkin (null), lekin uzunligi ustun chegarasida', () => {
    expect(PosContactSchema.parse({ version: 1, phone: null }).phone).toBeNull();
    // `phone` — VarChar(20); undan uzun qiymat DB xatosiga tushardi.
    expect(() => PosContactSchema.parse({ version: 1, phone: '1'.repeat(21) })).toThrow();
  });
});

describe('F9 — updatePosContact() faqat oq ro`yxatni uzatadi', () => {
  it('`update()` ga AYNAN {version, phone, description} boradi', async () => {
    const svc = new CounterpartyService({ client: {} } as never);
    const update = vi.spyOn(svc, 'update').mockResolvedValue({ id: 'cp-1' } as never);

    await svc.updatePosContact('acc-1', 'user-1', 'cp-1', {
      version: 2,
      phone: '901234567',
      description: 'eshik oldida',
    });

    expect(update).toHaveBeenCalledWith('acc-1', 'user-1', 'cp-1', {
      version: 2,
      phone: '901234567',
      description: 'eshik oldida',
    });
  });

  it('berilmagan maydon uzatilmaydi (mavjud izoh o`chib ketmasin)', async () => {
    const svc = new CounterpartyService({ client: {} } as never);
    const update = vi.spyOn(svc, 'update').mockResolvedValue({ id: 'cp-1' } as never);

    await svc.updatePosContact('acc-1', 'user-1', 'cp-1', { version: 2, phone: '901234567' });

    expect(update).toHaveBeenCalledWith('acc-1', 'user-1', 'cp-1', {
      version: 2,
      phone: '901234567',
    });
  });
});
