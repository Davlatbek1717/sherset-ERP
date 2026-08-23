import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { uploadStagedImages } from '@/lib/staged-image-upload';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const { api } = await import('@/lib/api-client');

/**
 * Tovar yaratilgach staged rasmlarni yuklash — yiqilish JIM QOLMAYDI.
 *
 * 🔴 Bug-class (2026-08-23 auditi): `/products/new` ham, `ProductCreateModal`
 * ham har rasmni bo'sh `catch {}` ichida yuklardi. `POST /products/:id/images`
 * esa `product.create` dan BOSHQA ruxsat talab qiladi — `attachment.create`
 * (`image.controller.ts`), va u ruxsat matritsasida alohida «Cross-cutting»
 * bo'limida turadi, ya'ni rol tuzuvchi uni oson o'tkazib yuboradi. Natijada
 * tovar yaratilardi, N/N rasm 403 bilan indamay yo'qolardi — hech qanday
 * xabar yo'q (modal holatida foydalanuvchi tovar kartasini ham ko'rmaydi).
 *
 * Yechim shakli: yuklash yagona yordamchiga ko'chirildi, u YIQILGANLAR SONINI
 * qaytaradi (create'ni yiqitmaydi — tovar allaqachon mavjud), chaqiruvchi esa
 * shu songa qarab ogohlantirish ko'rsatadi.
 *
 * Bu fayl qulflaydi: (1) yordamchining sanash/yutmaslik xulqi;
 * (2) ikkala yaratish yo'li ham o'z siklini emas, SHU yordamchini ishlatishi.
 * Ogohlantirishning ekranda ko'rinishi bu yerda ISBOTLANMAYDI — u chaqiruvchi
 * komponentda (toast) va manba-qo'riq bilan tekshiriladi.
 */

const IMAGES = [
  { name: 'a.png', mime: 'image/png', dataUrl: 'data:image/png;base64,AAA' },
  { name: 'b.png', mime: 'image/png', dataUrl: 'data:image/png;base64,BBB' },
];

beforeEach(() => vi.clearAllMocks());

describe('uploadStagedImages', () => {
  it("hammasi yuklansa failed = 0 va har rasm uchun bitta so'rov ketadi", async () => {
    vi.mocked(api.post).mockResolvedValue({} as never);
    const res = await uploadStagedImages('p-1', IMAGES);
    expect(res.failed).toBe(0);
    expect(vi.mocked(api.post)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.post).mock.calls[0]?.[0]).toBe('/products/p-1/images');
  });

  it('bir rasm yiqilsa — TASHLAMAYDI, lekin sanaydi', async () => {
    vi.mocked(api.post)
      .mockRejectedValueOnce(new Error('403 Forbidden'))
      .mockResolvedValueOnce({} as never);
    const res = await uploadStagedImages('p-1', IMAGES);
    expect(res.failed).toBe(1);
  });

  it("ruxsat yo'q bo'lsa hammasi yiqiladi va soni to'liq qaytadi", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('403 Forbidden'));
    const res = await uploadStagedImages('p-1', IMAGES);
    expect(res.failed).toBe(2);
  });

  it("rasm bo'lmasa so'rov umuman ketmaydi", async () => {
    const res = await uploadStagedImages('p-1', []);
    expect(res.failed).toBe(0);
    expect(vi.mocked(api.post)).not.toHaveBeenCalled();
  });
});

describe("yaratish yo'llari — o'z siklini emas, yordamchini ishlatadi", () => {
  const CREATORS = [
    'src/app/(app)/products/new/page.tsx',
    'src/components/products/product-create-modal.tsx',
  ];

  it('ikkala fayl ham uploadStagedImages ni chaqiradi', () => {
    for (const p of CREATORS) {
      const src = readFileSync(join(__dirname, '..', '..', p), 'utf8');
      expect(src).toContain('uploadStagedImages');
    }
  });

  it("ikkala faylda ham stagedImages ustidan bo'sh-catch sikli qolmagan", () => {
    for (const p of CREATORS) {
      const src = readFileSync(join(__dirname, '..', '..', p), 'utf8');
      expect(src).not.toMatch(/for\s*\(const\s+img\s+of\s+pf\.stagedImages\)/);
    }
  });
});
