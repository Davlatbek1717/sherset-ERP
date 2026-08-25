/**
 * K3 — bo'lak TARKIBINI matnga aylantirish (kabel/sim/shlang).
 *
 * Ikki ekran bir xil o'qilishi SHART: kassaning qator oynasi
 * (`components/pos/piece-offer-panel.tsx`) va tovar kartochkasining
 * «Qoldiqlar» tabi (`components/product-detail-widget.tsx`). Ikki joyda ikki
 * formatlash bo'lsa, kassir va katta omborchi bir xil omborni boshqa-boshqa
 * ko'rardi — K-rejaning butun maqsadi shu farqni yopish
 * (`docs/plans/2026-08-25-bolinadigan-tovar-bolak-hisobi.md`, 1-bo'lim).
 *
 * Formatlash faqat KO'RSATADI: butun rulonlar guruhlanadi (`250 × 3` —
 * ular bir-biridan farq qilmaydi), bo'laklar esa alohida raqam bo'lib
 * chiqadi (har biri individ, K-reja 3-bo'lim jadvali).
 */

export interface PieceCompositionView {
  wholeGroups: Array<{ length: string; count: number }>;
  pieces: Array<{ length: string }>;
}

/**
 * `{ wholeGroups: [{250, 3}], pieces: [200, 150] }` → `['250 × 3', '200', '150']`.
 * Ko'paytirish belgisi CHAQIRUVCHIDAN keladi (i18n `pages.pieces.times`) —
 * matn kodda qotib qolmasin.
 */
export function formatPieceComposition(c: PieceCompositionView, times: string): string[] {
  return [
    ...c.wholeGroups.map((g) => `${g.length} ${times} ${g.count}`),
    ...c.pieces.map((p) => p.length),
  ];
}
