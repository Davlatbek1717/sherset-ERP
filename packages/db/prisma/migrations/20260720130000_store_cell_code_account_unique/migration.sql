-- YACHEYKA KODI — BUTUN AKKAUNT BO'YICHA YAGONA (2026-07-20 tuzatish).
--
-- MUAMMO (jonli topilgan): oldingi cheklov faqat OMBOR ICHIDA noyoblikni
-- ta'minlardi ([account_id, store_id, code]) — ammo Product.loc*/
-- ProductLocation manzili storeId'ga BOG'LANMAGAN, BUTUN AKKAUNT bo'yicha
-- yagona manzil (occupancyMap/getCellContents kod bo'yicha qidiradi, omborni
-- bilmaydi). Natijada IKKI TURLI ombor bir xil kodni ("04-01-01-01") ro'yxatga
-- olsa, ular bitta jismoniy manzilni "bo'lishardi" — bandlik/tarkib noto'g'ri
-- ko'rsatilardi (bir ombordagi tovar boshqa ombor yacheykasida "bor" bo'lib
-- chiqardi). Tuzatish: kod endi haqiqatan ham bitta haqiqat manbaiga mos —
-- butun akkaunt bo'yicha yagona.
--
-- Xavfsiz: deploy oldidan production'da tekshirilgan — hech qanday
-- akkauntda ikki xil omborda bir xil kod YO'Q edi (0 qator), shuning uchun
-- bu cheklov hech narsani buzmaydi.

DROP INDEX "store_cells_account_id_store_id_code_key";

CREATE UNIQUE INDEX "store_cells_account_id_code_key" ON "store_cells"("account_id", "code");
