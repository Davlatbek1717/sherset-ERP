import { imageRawUrl } from '@/lib/image-url';

/** Katalogdan tanlangan element — `CatalogPicker` / `PositionInlineAdd` shakli. */
export interface PickedProduct {
  id: string;
  primary: unknown;
  raw?: {
    code?: string | null;
    uom?: string | null;
    vat?: number | null;
    stock?: {
      onHand?: string | number | null;
      reserved?: string | number | null;
      available?: string | number | null;
      inTransit?: string | number | null;
    } | null;
    salePrices?: Array<{ priceTypeId: string; value: string; currencyCode?: string | null }> | null;
    productFolder?: { pathName?: string | null } | null;
    mainImageId?: string | null;
  } | null;
}

const asString = (v: string | number | null | undefined): string | undefined =>
  v == null ? undefined : String(v);

/**
 * Qator maydonlarining TOVARdan keladigan qismi — yagona manba.
 *
 * 🔴 Nega bu bor (2026-08-23 auditi): har sahifa bu ro'yxatni o'zicha yozgan
 * va ular BIR-BIRIGA MOS EMAS edi — `supplies/new` qatordagi tovarni
 * almashtirganda atigi 5 maydonni yangilardi, purchase-orders esa 12 tasini.
 * Natijada almashtirilgan qatorda eski tovarning qoldig'i, narx qavatlari va
 * YACHEYKASI qolib ketardi.
 */
export function productRowFields(item: PickedProduct) {
  const raw = item.raw ?? undefined;
  return {
    assortmentId: item.id,
    productLabel: String(item.primary),
    productCode: raw?.code ?? undefined,
    productUom: raw?.uom ?? null,
    vat: raw?.vat != null ? String(raw.vat) : '12',
    stock: asString(raw?.stock?.onHand),
    reserve: asString(raw?.stock?.reserved),
    available: asString(raw?.stock?.available),
    waiting: asString(raw?.stock?.inTransit),
    salePrices: raw?.salePrices ?? null,
    folderPath: raw?.productFolder?.pathName ?? undefined,
    imageUrl: raw?.mainImageId ? imageRawUrl(raw.mainImageId) : undefined,
  };
}

/**
 * Mavjud qatordagi tovarni ALMASHTIRISH uchun patch.
 *
 * Yacheyka ataylab tozalanadi: u eski tovar uchun tanlangan bo'ladi va jimgina
 * meros bo'lib qolsa, post paytida yangi tovar eski tovarning yacheykasiga
 * yozilardi (manzilli saqlashda — omborda boshqa joyga).
 */
export function replaceRowProductPatch(item: PickedProduct) {
  // `undefined` — repoda «qiymat yo'q» ning konvensiyasi (qator tiplarida
  // `cell?: string`); patch spread bo'lgani uchun kalit baribir ustidan
  // yoziladi, ya'ni eski yacheyka QOLMAYDI.
  return { ...productRowFields(item), cellId: undefined, cell: undefined };
}
