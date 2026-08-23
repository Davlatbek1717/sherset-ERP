import { renderWithProviders, screen } from '@/test-utils';
import { ProductPickModal } from '@moysklad/ui';
import { describe, expect, it, vi } from 'vitest';

/**
 * «Выбор товара» oynasi — «Цена» maydoni TOVARNING HAQIQIY narxi bilan ochiladi.
 *
 * 🔴 Nega bu test bor (2026-08-23 auditi): maydon har ochilishda `'1'` ga
 * qaytarilardi va `save()` uni `pickPriceToMinor('1', 'UZS')` = `'100'` tiyin
 * = **1 so'm** qilib yuborardi. Tovarning haqiqiy narxi yuqorida faqat
 * read-only ko'rsatilardi. `PositionInlineAdd` da `pickModal` berilgan bo'lsa
 * tanlash DOIM shu oyna orqali yakunlanadi, ya'ni sahifalardagi
 * `entry?.priceMinor ?? raw?.buyPrice` zaxirasi hech qachon ishlamaydi —
 * demak 21 hujjat sahifasida «tovar → Enter → Enter» qatorni 1 so'mga tushirardi.
 * `/enters/new` da bu qiymat partiyaning `costMinor` iga aylanadi (tan narx 1 so'm).
 *
 * Egasining qarori (2026-08-23): sukut = tovarning haqiqiy narxi. Sahifa
 * `originalPriceMinor` ga hujjat turiga mos narxni uzatadi (xarid hujjatlarida
 * tan narx, sotuv hujjatlarida sotuv narxi), shuning uchun bitta qoida yetarli.
 *
 * Qulflanadigan shartnomalar:
 *   1. oyna ochilganda «Цена» = `originalPriceMinor` (major ko'rinishda);
 *   2. hech narsa terilmasa `onSave` AYNAN o'sha minor qiymatni qaytaradi;
 *   3. narxi yo'q tovarda (`originalPriceMinor` berilmagan) maydon bo'sh — 1 EMAS.
 */

const labels = {
  stock: 'Остаток',
  price: 'Цена',
  quantity: 'Количество',
  salePrice: 'Цена',
  priceThisSale: 'Только в этой продаже',
  pricePermanent: 'Постоянная цена',
  save: 'Сохранить',
  cancel: 'Отменить',
};

function renderModal(originalPriceMinor: string | undefined, onSave = vi.fn()) {
  renderWithProviders(
    <ProductPickModal
      open
      onOpenChange={() => {}}
      productName="Кабель ВВГ 3х2.5"
      available={12}
      uomLabel="шт"
      originalPriceMinor={originalPriceMinor}
      currency="UZS"
      labels={labels}
      onSave={onSave}
    />,
  );
  return onSave;
}

describe('ProductPickModal — «Цена» sukut qiymati', () => {
  it('tovarning haqiqiy narxi bilan ochiladi, «1» bilan emas', () => {
    renderModal('4500000'); // 45 000,00 so'm
    const price = screen.getByTestId('product-pick-price') as HTMLInputElement;
    expect(price.value).toBe('45000');
  });

  it("hech narsa terilmasa aynan o'sha narxni saqlaydi (1 so'm EMAS)", () => {
    const onSave = renderModal('4500000');
    screen.getByTestId('product-pick-save').click();
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: '1', priceMinor: '4500000' }),
    );
  });

  it("narxi yo'q tovarda maydon bo'sh qoladi", () => {
    renderModal(undefined);
    const price = screen.getByTestId('product-pick-price') as HTMLInputElement;
    expect(price.value).toBe('');
  });
});
