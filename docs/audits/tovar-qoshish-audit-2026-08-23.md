# «Tovar qo'shish» audit — 2026-08-23

> **HOLAT (shu sessiyada tuzatildi).** Quyidagi topilmalarning KATTA QISMI
> tuzatildi — har biri avval RED ko'rilgan test bilan. Tuzatilganlar:
> A1 · A2 · A3 · A4 · A5 · A6 · A7 · A8 · A9 (kod ustidan yozilishi,
> «Неснижаемый остаток» rejimi, sync hisoblagichi) · B1 · B2 · B3 · B4 ·
> B5 (narx qavati, vergulli miqdor, qator almashtirish, «Расценить» kursi,
> narx qaytarib yozishda valyuta, demands «Ещё N», moves miqdori).
>
> **QOLGANI (ataylab, sabab bilan)** — hujjat oxiridagi «Qolgan ishlar» ga qara.

**Qamrov:** ikki oqim — (A) katalogga YANGI TOVAR yaratish, (B) hujjatga TOVAR QATORI qo'shish.
**Usul:** 3 parallel READ-ONLY auditor (web-create / api-create / hujjat-pozitsiya) + operator tomonidan
har bir og'ir da'voning kod bilan qayta tasdig'i. Quyidagi tavsiflar TOPILGAN paytdagi holatni yozadi
(«hozir shunday» emas) — nima tuzatilgani yuqoridagi HOLAT bloki va oxirgi «Qolgan ishlar» da.
**Status yorlig'i:** Phase-1 (strukturaviy + kod-o'qish), **browser-smoke YO'Q**.

Tasdiqlangan gate: api tovar+variant 145/145 · document-number 10/10 · web create-permission-gate 3/3 ·
i18n ru/uz 9552↔9552 (bo'shliq 0).

---

## A. Katalogga yangi tovar qo'shish

### A1. Tuzatish yarim qolgan: tez-qo'shish modali qo'riqlanmagan (YUQORI)
`apps/web/src/components/products/product-create-modal.tsx:57-60` — `allocate-code` xatosi hamon
`.catch(() => {})` bilan yutiladi, faylda `usePermissions` YO'Q. `d7937657` faqat
`products/new/page.tsx` ni tuzatgan (git stat bilan tasdiqlandi — modal fayli commitda yo'q).
Modal `supplies/new:1904`, `demands/new:1656`, `demands/[id]:2365` dan ochiladi.
**Ssenariy:** `product.create` yo'q foydalanuvchi modalni ochadi → «Код» jim bo'sh → butun forma
to'ldiriladi → 403 faqat «Сохранить» da. Bu — sahifada tuzatilgan bugning aynan o'zi.
Modalning umuman test qoplamasi yo'q (grep: 0 ta test fayli).

### A2. Rasmlar jimgina yo'qoladi — boshqa ruxsat + bo'sh catch (YUQORI)
`products/new/page.tsx:98` va `product-create-modal.tsx:89` — har rasm bo'sh `catch {}` da.
`POST /products/:id/images` esa `attachment.create` talab qiladi
(`apps/api/src/modules/image/image.controller.ts:36`), tovar yaratish esa `product.create`.
Ruxsat matritsasida `attachment` alohida «Cross-cutting» bo'limida — rol tuzuvchi oson o'tkazib yuboradi.
**Ssenariy:** tovar yaratiladi, N/N rasm 403 bilan jim tashlanadi, hech qanday xabar yo'q.

### A3. USD sotuv narxi hech qayerda konvertatsiya qilinmaydi (YUQORI, pul xavfi)
Kirish: `product-price-editor.tsx:179-192` — har narx qatorida valyuta tanlagichi bor.
O'qish: `apps/web/src/lib/sale-price.ts:30-41` — `resolveDefaultSalePrice` `currencyCode` ni umuman
o'qimaydi (ichki `SalePricesLike` tipida bu maydon YO'Q). Server ham buni ochiq tan oladi:
`product.schema.ts:120-124` «stored amount is as-entered in this currency; downstream cost math
assumes base». **Ssenariy:** «Розничная = 10 (доллар)» tovar POS'da 10 so'mga sotiladi (~12 000× arzon).

### A4. Yaratildi-yu hujjatga tushmadi → katalogda dublikat tovar (YUQORI mexanizm)
`supplies/new:1936`, `demands/new:1685`, `demands/[id]:2400` — `onCreated` ichidagi
`GET /products/:id` bo'sh `catch` da. Modal `onCreated` ni await'siz chaqirib darhol yopiladi.
**Ssenariy:** GET yiqilsa (tarmoq yoki `product.view` cheklovi) — modal yopiq, toast yo'q, qator yo'q.
Foydalanuvchi «yaratilmadi» deb qayta uradi → katalogda haqiqiy dublikat.

### A5. Band kod xatosi inglizcha ko'rsatiladi (O'RTA)
`product.service.ts:465-471` P2002 ni global filtrdan OLDIN tutib
`Duplicate value on unique field: account_id, code` deb tashlaydi; banner uni xomligicha chiqaradi
(`products/new/page.tsx:233`). Bu — 22.08 prod hodisasida ko'ringan aynan o'sha matn. Global filtr
o'zbekcha xabar beradi, lekin unga navbat kelmaydi.

### A6. Skaner Enter'i yarim to'ldirilgan formani saqlaydi (O'RTA)
`product-create-modal.tsx:118` (form) + `:148-154` (`type="submit"`). Ism `initialName` dan
oldindan to'ldirilgan ⇒ validatsiya o'tadi. Shtrix-kod qatoriga skaner o'qishi (oxirida Enter)
→ tovar darhol yaratiladi, narx/gruppa kiritilmagan holda. `/products/new` da bu yo'q.
(Double-click dublikat esa qo'riqlangan: `disabled={createMut.isPending}`.)

### A7. Ro'yxat keshi invalidatsiya qilinmaydi (PAST-O'RTA)
`hooks/use-api-mutation.ts:80` faqat `['audit-logs']` ni invalidatsiya qiladi; global
`staleTime: 30_000` + `refetchOnWindowFocus: false` (`lib/query-client.tsx:11`).
**Ssenariy:** yangi tovardan keyin 30 s ichida /products ga qaytilsa — ro'yxatda yo'q, «saqlanmadi» taassuroti.

### A8. Faqat FE'dan tashqari mijozlar uchun: xom 500 va manfiy narx (O'RTA/PAST)
`product.schema.ts:9-12` — `BigInt(String(v))` transformi `SyntaxError` tashlaydi (empirik tasdiqlandi:
`"1.5"`, `1.5`, `"12 000"`, `"abc"`). Ikkala global filtr faqat `ZodError` va
`PrismaClientKnownRequestError` ni tutadi (`@Catch` tasdiqlandi) ⇒ 400 emas, **500**.
Web forma `^\d*$` regex bilan bloklaydi (`use-product-form.ts:76`), demak brauzerdan yetmaydi.
Shu tabaqada: `buyPrice`/`minPrice` da `nonnegative()` YO'Q (`weightG`/`volumeML` da bor) —
manfiy tan narx API orqali saqlanadi va narx polini o'chiradi.

### A9. Boshqa mayda topilmalar
- `products/new/page.tsx:41,104-126` — `openTabRef` validatsiya yiqilganda tozalanmaydi: keyingi
  oddiy «Сохранить» kutilmaganda «Создание модификаций» ni ochadi.
- `products/new/page.tsx:200` — `auxDirty` na Save-enable'ga, na «Закрыть» ogohlantirishiga ulanmagan
  (edit sahifasida ulangan: `[id]/page.tsx:230`). Faqat narx/shtrix-kod/rasm kiritilgan holat jim yo'qoladi.
- `use-product-form.ts:242,602` — ✏ «Курс валюты» dialogi `markAuxDirty()` qiladi, lekin `buildPayload` da
  yo'q: dirty-yolg'on + bezak nazorat.
- `products/new/page.tsx:66-67`, `product-create-modal.tsx:58-59` — kechikkan `allocate-code` javobi
  foydalanuvchi terib qo'ygan «Код» ni shartsiz ustidan yozadi.
- `product-form-left-cards.tsx:696-704` + `use-product-form.ts:444` — «Неснижаемый остаток» rejimi
  almashtirilsa ham kiritilgan summa baribir yuboriladi.
- `product.schema.ts:56` — `salePrices[].priceTypeId` mavjudligi/akkaunt-scope'i tekshirilmaydi.
- `product.service.ts:247-248` — audit yozuvi create bilan bitta tranzaksiyada emas.
- `apps/api/src/scripts/sync-from-moysklad.ts:313` — ommaviy yozuvdan keyin kod hisoblagichini
  SURMAYDI (tuzatish faqat `ops-import-products.ts` ga qo'shilgan). Probe tufayli o'zini tuzatadi,
  lekin shu skriptdagi `.catch` faqat `name` to'qnashuvini qayta uradi — **kod** to'qnashsa tovar
  jimgina `stats.failed` ga tushadi.

### A-oqimda TOZA chiqqani
Kod-allokatsiya poygasi (atomik increment + `lt: max` qo'riqli resync + product/variant probe);
Zod strip (FE ning 30 maydoni sxemada bor); NULL/0 shartnomasi; tovar+packs bitta nested create;
account scoping; `/products` va `/allocate-code` ruxsat mosligi; i18n; bundle/xizmat `Product.kind`
bilan bir jadvalda ⇒ kod fazosi to'liq qamralgan; moysklad-compat da tovar yozish endpointi yo'q.

---

## B. Hujjatga tovar qatori qo'shish

### B1. Tanlov oynasi narxni «1» qilib ochadi ⇒ 1 so'mlik qator (YUQORI, pul xavfi)
`packages/design-system/src/document-editor/ProductPickModal.tsx:99-100,113-123,135-142` —
`qty` ham, `priceMajor` ham `'1'`, har ochilishda qayta o'rnatiladi; `save()` →
`pickPriceToMinor('1', 'UZS')` = `'100'` tiyin = **1 so'm**. Yuqorida tovarning HAQIQIY narxi
read-only ko'rsatiladi (`:182-188`), lekin sukut qiymatga olinmaydi.
`PositionInlineAdd.tsx:369-379` — `pickModal` berilgan sahifada `pick()` DOIM modalni ochadi ⇒
`entry` har doim mavjud ⇒ sahifalardagi `priceMinor: entry?.priceMinor ?? raw?.buyPrice ?? '0'`
zaxirasi **o'lik kod**. pickModal yoqilgan 21 sahifa tasdiqlandi (grep).
**Ssenariy:** `/enters/new` → tovar → Enter → Enter → qator 1 so'm → `costMinor` = 1 so'm
(`supply.service.ts:1376` shaklidagi zanjir) → POS narx poli 1 so'm, hisobotda ~100% marja.
*Eslatma:* sukut «1» ataylab qo'yilgan (`ProductPickModal.pick-price.test.ts` uni qulflagan) —
niyat bahsli, oqibat real.

### B2. Приёмка qatori chakana narx bilan to'ladi, keyin u tan narxga yoziladi (YUQORI, pul xavfi)
Bitta faylda ikki qarama-qarshi shartnoma: `supplies/new/page.tsx:555-557` — «picked product
defaults its price to its **retail sale price** … not the buy price» (owner 2026-07-27);
`:564-565` — «on a receipt the line price is the **BUY price** → `Product.buyPrice`».
`saveProductPrices()` (`:566-581`) har qator narxini `PATCH /products/:id {buyPrice}` bilan yozadi
(xatolarni bo'sh catch yutadi). Pick yo'li `:1300-1308` haqiqatan retail narxni oladi.
Supplies/demands **pickModal ishlatmaydi** (grep bilan tasdiqlandi) ⇒ bu yerda B1 emas, B2 amal qiladi.
**Ssenariy:** qabulda «Сохранить цены» bosilsa tovarning tan narxi o'z chakana narxi bilan almashadi;
post paytida partiyaning `costMinor` i ham shu narxdan olinadi ⇒ marja 0, narx poli chakana narxga ko'tariladi.
Qo'shimcha: shu sahifaning qator-almashtirish yo'li (`:1855`) `raw?.buyPrice` beradi — bir sahifada uch xil narx.

### B3. Enter eskirgan taklifni qo'shadi — noto'g'ri tovar (YUQORI)
`PositionInlineAdd.tsx:386` — `target = chosen ?? (suggestions.length === 1 ? suggestions[0] : undefined)`,
bu yerda `suggestions` — OLDINGI tugagan qidiruv natijasi (debounce 200 ms, `:277-294`).
**Ssenariy:** «kab» → 1 natija ro'yxatda qoladi → shtrix-kod skanerlanadi va skaner Enter yuboradi
(200 ms hali o'tmagan) → `Kabel X` JIM qo'shiladi. Topilmasa ham Enter jim yutiladi (toast/ovoz yo'q).
Aynan shu bug POS'da tuzatilgan: `sotuv/page.tsx:811-836` (`searchSettled` + `pendingEnterRef`,
izohi: «noto'g'ri tovarni … savatga qo'shib yuborardi») — umumiy hujjat komponentida tuzatilmagan.

### B4. «Добавить из справочника» 11 sahifada bo'sh qator qo'shadi (YUQORI, tasdiqlangan naqsh)
Grep natijasi aniq bo'lindi: barcha `[id]` (tahrir) sahifalari haqiqiy katalog modalini ochadi;
`/new` sahifalarining 11 tasi `addPosition`/`emptyRow` ga ulangan — supplies, demands, enters, losses,
invoices-in, invoices-out, purchase-orders, purchase-returns, sales-returns, commission-reports (×2).
Tuzatilgan uchtasi: customer-orders/new, internal-orders/new, moves/new.
`internal-orders/new:765-766` izohi buni ochiq yozadi: «was: appended an empty row; **user 2026-07-14
bug report**» — ya'ni foydalanuvchi shikoyat qilgan xato bitta sahifada tuzatilib qolganlarida qolgan.
Ikkinchi oqibat: `PositionInlineAdd.tsx:555-566` dagi «Ещё N товаров» tugmasi ham shu callback'ni
chaqiradi ⇒ qolgan mosliklarni ko'rish o'rniga bo'sh qator qo'shiladi.

### B5. Qolgan topilmalar (auditor o'qigan, operator qayta tekshirmagan)
- `product.repository.ts:468-506` — qatordagi «Остаток»/«Доступно» `storeId` filtrsiz, ya'ni BUTUN
  akkaunt bo'yicha yig'indi (+`inTransit` ham ichida). 5 sahifa shu raqamni ko'rsatadi;
  `customer-orders/new` da qizil «oversell» ogohlantirishi shu noto'g'ri sondan hisoblanadi.
  Hozir prod bitta omborli (`prod-single-store-ombor2`) ⇒ latent; ikkinchi ombor ochilishi bilan tiriladi.
  To'g'ri naqsh mavjud: `demands/new:418-425`, `moves/new:270-277` `GET /stocks?storeId=…` ishlatadi.
- `customer-orders/new:1416,1449,1950` va `sales-returns/new:1257,1680` — `resolveDefaultSalePriceOrZero`
  `defaultPriceTypeId` siz chaqirilgan ⇒ `list[0]` olinadi; massiv tartibi kafolatsiz ⇒ optom narx tushishi
  mumkin. `invoices-out` va POS to'g'ri chaqiradi.
- `packages/money/src/position.ts:108-116` + `PositionTable.tsx:391-410` — vergulli miqdor («1,5»)
  `BigInt` da yiqilib `catch` orqali **0n** bo'ladi: «Сумма» 0, «Итого» qatorni hisobga olmaydi,
  saqlashda server xom `quantity must be a positive decimal` beradi. FE qo'riqchisi ham o'tkazadi
  (`Number("1,5")` = NaN, `NaN <= 0` = false).
- `supplies/new:1848-1858` — qatordagi tovarni almashtirish eski tovarning `cellId`/`stock`/`salePrices`
  ini qoldiradi ⇒ post paytida yangi tovar eski tovarning yacheykasiga yozilishi mumkin.
  Boshqa 3 sahifa 10-12 maydonni yangilaydi.
- `supply.schema.ts:34`, `enter.schema.ts:24,26` — regex `^\d+…` `"0"` ni o'tkazadi (xato matni «positive»
  deydi); `enters/[id]`, `losses/[id]`, `moves/[id]`, `internal-orders/[id]` da FE qo'riqchisi ham yo'q.
- Pozitsiya `assortmentId` si tenant bo'yicha faqat `customer-order.service.ts` da tekshiriladi;
  qolgan hujjatlarda yo'q (`schema.prisma:6005` FK akkaunt bilan cheklanmagan).
- Bir tovarni ikki marta qo'shish qatorni birlashtirmaydi; dublikat ogohlantirishi 7 sahifada yo'q
  (POS `sotuv/page.tsx:766-771` birlashtiradi).
- `PositionTable.tsx:867,874` — qattiq yozilgan ruscha `Удалить (N)` / `Добавить позицию`;
  `:442` va `PositionInlineAdd.tsx:182,215-216` — o'zbekcha sukut matnlar. i18n KALITLARI to'liq
  sinxron, muammo — komponentdagi literal matnlar.
- `demands/new:997-1006` — `onSearch` yalang'och massiv qaytaradi ⇒ «Ещё N товаров» hech qachon chiqmaydi.
- `moves/[id]/page.tsx:338` — `quantity: Number(p.quantity)` (boshqa hamma sahifa SATR uzatadi).
- `moves/new:218-221` — sukut omborni `defaultDocStore()` orqali olmaydi (qolgan 14 sahifa oladi).

### B-oqimda TOZA chiqqani
Radix `modal={true}` / OSK: `ProductPickModal` qobiqda ochilmaydi (qobiq faqat POS ko'rinishini beradi),
POS dialoglarining hammasi `modal={false}`. Debounce ikkala joyda bor. i18n kalitlari 1:1.
Kasrli miqdor sxemada `Decimal(20,6)` gacha to'g'ri (faqat vergul buziladi — B5).

---

## Tasdiqlanmagan qolgan savol
Tuzatish (`d7937657`) prodga deploy qilinganmi — bu sessiyada **tekshirib bo'lmadi** (tarmoq yo'q:
`github.com` hal bo'lmadi). Lokal `origin/climart-adoption` refi eskirgan, shuning uchun
«push qilinmagan» ro'yxati dalil emas (`stale-remote-ref-fakes-unpushed-work`).

---

## Qolgan ishlar (2026-08-23 sessiyasi oxiri)

Quyidagilar ATAYLAB tuzatilmadi — har birining sababi bor.

### Test-muhiti to'sqinlik qilgani uchun (kod o'zgarishi tayyor emas)
- **`openTabRef` validatsiya yiqilganda tozalanmaydi** (`products/new/page.tsx`).
  «+ Модификация» bosilib validatsiya rad etilsa, keyingi oddiy «Сохранить»
  kutilmaganda modifikatsiya oynasini ochadi. Xulqni tekshirish uchun formani
  test muhitida SUBMIT qildirish kerak — bu sessiyada uddasidan chiqilmadi
  (`fireEvent.submit` ham, `act` bilan o'ralgani ham RHF `handleSubmit`
  callback'iga yetmadi; forma o'zi sog'lom — izolyatsiyada `trigger()` VALID).
  Testsiz tuzatish esa TDD intizomini buzardi.
- **`auxDirty` create sahifasida Save/«Закрыть» ogohlantirishiga ulanmagan**
  (edit sahifasida ulangan). Faqat narx/shtrix-kod/rasm kiritilgan holat
  ogohlantirishsiz yopiladi. Xuddi shu submit-muammosi.

### Mahsulot qarori kerak
- **✏ «Курс валюты документа» dialogi** yig'adi-yu hech qayerga yozmaydi va
  `markAuxDirty()` chaqirib «o'zgardi» deb ko'rsatadi. Dialog docstring'i uni
  moysklad-parity deb hujjatlagan; nima qilish (saqlash / olib tashlash)
  egasining qaroriga bog'liq.

### Server tomonida qolganlar
- **`salePrices[].priceTypeId` akkaunt bo'yicha tekshirilmaydi** — begona
  akkaunt id'si yoki ixtiyoriy satr JSON'ga yozilaveradi (UI uni ko'rsatmaydi,
  ya'ni narx «yo'qoladi»). To'g'ri joyi — `assertFksInAccount` yonida.
- **Audit yozuvi create bilan bitta tranzaksiyada emas** — audit insert yiqilsa
  tovar mavjud-u izsiz qoladi (ehtimoli past).
- **`supply.schema` / `enter.schema` regexi `"0"` ni o'tkazadi** (xato matni
  «positive» deydi); `enters/[id]`, `losses/[id]`, `moves/[id]`,
  `internal-orders/[id]` da FE qo'riqchisi ham yo'q.
- **Pozitsiya `assortmentId` si tenant bo'yicha faqat `customer-order` da
  tekshiriladi.**

### Kutish rejimidagilar (bugun zarar bermaydi)
- **Qatordagi «Остаток»/«Доступно» ombor kesimisiz** (`product.repository.ts`
  `storeId` filtrisiz). Prod hozir BITTA omborli
  (`prod-single-store-ombor2`), shuning uchun latent; ikkinchi ombor
  ochilishi bilan tiriladi. To'g'ri naqsh mavjud: `demands/new`, `moves/new`
  `GET /stocks?storeId=…` ishlatadi.
- **Bir tovarni ikki marta qo'shish qatorni birlashtirmaydi**; dublikat
  ogohlantirishi 7 sahifada yo'q (POS birlashtiradi).
- **`PositionTable` da qattiq yozilgan matnlar** (`Удалить (N)`,
  `Добавить позицию`, o'zbekcha sukut qiymatlar) — i18n kalitlari to'liq
  sinxron, muammo komponentdagi literal matnlarda.
- **`moves/new` sukut omborni `defaultDocStore()` orqali olmaydi** (qolgan 14
  sahifa oladi) — bu yerda xavf teskari: sukut umuman qo'yilmaydi.

### Tasdiqlanmagan
- Tuzatishlar prodga deploy qilinganmi — bu sessiyada tarmoq yo'q edi
  (`github.com` hal bo'lmadi), shuning uchun tekshirilmadi.
