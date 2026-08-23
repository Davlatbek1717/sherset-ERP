import { api } from '@/lib/api-client';

/** A picture picked in the product form but not yet sent to the server. */
export interface StagedImage {
  name: string;
  mime: string;
  dataUrl: string;
}

/**
 * Tovar yaratilgandan keyin staged rasmlarni yuklaydi.
 *
 * Yuklash create'ni YIQITMAYDI — tovar allaqachon mavjud, va bitta rasm
 * yiqilgani uchun butun yaratishni xato deb ko'rsatish yolg'on bo'lardi.
 * Lekin yiqilish JIM ham qolmasligi kerak: `POST /products/:id/images`
 * `attachment.create` ruxsatini talab qiladi — tovar yaratish ruxsatidan
 * BOSHQA katakcha — shuning uchun «tovar yaratildi, rasmlar 403 bilan
 * yo'qoldi» holati juda real. Shu sabab yordamchi yiqilganlar SONINI
 * qaytaradi va chaqiruvchi shu songa qarab ogohlantiradi.
 */
export async function uploadStagedImages(
  productId: string,
  images: readonly StagedImage[],
): Promise<{ failed: number }> {
  let failed = 0;
  for (const img of images) {
    try {
      await api.post(`/products/${productId}/images`, {
        filename: img.name,
        mime: img.mime,
        dataBase64: img.dataUrl,
      });
    } catch {
      failed++;
    }
  }
  return { failed };
}
