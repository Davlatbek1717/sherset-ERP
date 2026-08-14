# POS redizayn — F3 hisobot (Sotuv rejimi: savat + setka + to'lov)

**Sana:** 2026-08-14 · **Faza:** F3 (reja: `docs/superpowers/plans/2026-08-14-kassa-pos-redizayn.md`)
**Holat:** **Phase-1: strukturaviy, runtime-tasdiqlanmagan** (lokal dev-brauzerda avtomatlashgan
ko'z-tekshiruv BOR — 13/13 tekshiruv, konsol 0 xato; qurilma/sensorli/tovushli sinov YO'Q — F9).
**Commitlar:** `df8700d4` (F3.1 savat qatori) · `cace9a54` (F3.2 o'lchamlar + strip) ·
`5f05b51f` (F3.3 skaner-javob) · `42a095c9` (F3.4 tez-summa) — har biri to'liq gate bilan.

## Nima qilindi

Sotuv rejimi sensorli monoblok uchun qayta qurildi (spec §5.1, §4, Q6).

### F3.1 — savat qatori: butun qator = bitta tahrir-trigger

- Qatordagi **−/+/✕ mikro-tugmalar (24px) OLIB TASHLANDI** (Q6). Butun qator endi bitta
  `<button data-test-id="sotuv-cart-line">` (min 64px, `--pos-row-h`) — bosilsa MAVJUD
  `cart-line-edit-modal` ochiladi (miqdor/narx/o'chirish yagona yo'li; qulflangan savatda
  `readOnly` ko'rish rejimi, sahifadagi mavjud prop).
- Qator tartibi: 1-qator nom (18px, font-pos) + qator jamisi (18px); 2-qator `miqdor × narx`
  (16px) + qolgan/tan/optom meta (14px, bayroqlar ostida); 3-qator tasmalar (narxsiz/ZARAR/
  optomdan-past/tushirildi) — **shartli** chiziladi.
- `sotuv-cart-line-edit` / `sotuv-cart-price-edit` / `sotuv-cart-qty` test-id'lari qator ichida
  **SPAN** bo'lib QOLDI — bosish qator-tugmaga ko'tariladi (bubbling), shu tufayli
  `audit-fixlar` / `sales-screen-price-floor` / `sales-screen-order-payment` testlari
  TEGILMASDAN yashil qoldi (niyatlari ham saqlangan: o'sha elementni bosish oynani ochadi).
- `page.tsx`: `updateQty` callback o'chdi (yagona ishlatuvchisi ± edi); `removeFromCart`
  qoladi (modal «O'chirish»i ishlatadi).

### F3.2 — o'lchamlar-pass (spec §4, px-qoida) + strip

- «Sotish» (asosiy to'lov yo'li) **72px**, «Omborchiga yuborish» **56px** (`--pos-touch-min`),
  yozuv 18px; jami summa **38px** qalin (eski `text-3xl` ildiz 12px da 22.5px chiqardi);
  setka kartalari `min-h 56px`, nom/narx 18px, qoldiq-meta 14px.
- `SotuvSearchGrid`dagi **eski smena-strip OLIB TASHLANDI** (F2 hisoboti №3 chala-ishi):
  kassir/yosh/savdo PosHeader chip'ida. `stale` ogohlantirish-Alert QOLDI (harakat-signal).
  `sales-screen-stale-shift` testlari yangi niyat bilan header-chipga ko'chirildi (Edit).

### F3.3 — skaner-javob (`lib/pos/scan-feedback.ts` — yangi)

- WebAudio, asset'siz: `ok()` = 1760Hz qisqa bip; `notFound()` = 220Hz ×2; hammasi 600ms
  ichida. `AudioContext` yo'q muhitda (happy-dom) **jim no-op** (crash TAQIQ — try/catch
  hamma joyda); kontekst yagona nusxada kesh (brauzer ~6 kontekst cheklovi); `suspended` da
  `resume()` (autoplay-siyosat).
- Ulanish: `addToCart` (sahifada — BARCHA qo'shish yo'llarining yagona kirish nuqtasi:
  Enter · setka · skaner) → `ok()` + qatorga 600ms yashil flash (`data-flash` +
  emerald ring; ZARAR/optom tasmalarining FONI bosilmaydi — faqat halqa). Qidiruv topilmasa →
  `notFound()` (dedup: so'rov-matn + 800ms oynasi — qidiruv debounce'siz, har tugma-bosish
  so'rov; aks holda qo'lda terganda har prefiks bip berardi).
- Testlar: 7 unit (`scan-feedback.test.ts`, **co-located** — `lib/pos` konvensiyasi; reja
  `__tests__/` degan edi, qo'shnilar co-located bo'lgani uchun ataylab chetlandim) + 2 ulanish
  (`sales-screen-cart`).

### F3.4 — to'lov oynasida tez-summa (`payment-dialog.tsx`)

- Eski `+1 000 … +50 000` **QO'SHISH** tugmalari bekor → «Aniq summa» (jami'ni qo'yadi,
  kartani tozalaydi — mavjud xulq, yangi yorliq) + `100 000 / 200 000 / 500 000` banknot
  nominallari — bosilganda naqd maydoniga qiymat **O'RNATILADI** (spec talabi: kassir
  adashmasin); faol maydon naqdga qaytadi. Tugmalar 48px (px'da).
- i18n: `payment_dialog.exact` → «Aniq summa» / «Точная сумма» (yagona ishlatuvchisi shu fayl).
- **Diqqat:** `PaymentDialog` `/retail` sahifasida ham ishlatiladi — xulq u yerda ham yangi.
- 5 yangi test (`components/pos/__tests__/payment-dialog.test.tsx` — yangi fayl).

## Gate natijalari (har commit oldidan to'liq; oxirgisi F3.4 da)

- `pnpm typecheck` — 0 xato (10/10 task).
- `pnpm lint:product` — 0 error (1046 warning — siyosat bo'yicha ruxsat).
- `pnpm i18n:gate` — 19/19 yashil.
- `pnpm --filter @moysklad/web test` — **3912 passed / 26 skipped** (F2-baseline 3898 + 14
  yangi: 7 scan-feedback + 2 ulanish + 5 payment-dialog). Sotuv-suite 166→168+ regresssiz;
  qayta yozilganlar faqat Edit bilan, eski niyat izohda.

## Ko'z-tekshiruv (F3.5 — lokal dev, izolyatsiyalangan Playwright, 1366×768)

MCP-brauzer parallel sessiya tomonidan band edi — alohida headless chromium skripti bilan
(admin@demo.local, ochiq smena): **13/13 tekshiruv ✓, konsol 0 xato**. O'lchovlar jonli:
setka kartasi 134px/nom 18px · savat qatori 67px, BUTTON, ichida 0 tugma · flash qo'shilганда
`data-flash=true`, 800ms dan keyin yo'q · jami 38px · Sotish 72px / Omborchiga 56px · qator
bosilganda modal ochildi · «Topilmadi» xabari chiqdi. Skrinshotlar bilan vizual ko'rildi:
header-chip smena-ma'lumotni ko'rsatadi (strip yo'q), stale-Alert turibdi, savat qatori
nom+jami/miqdor×narx tartibida.

## O'LCHANMAGAN (halollik)

- **Qurilmada** (sensorli monoblok, kassa .exe) sinov YO'Q — F9.
- **Tovush jonli eshitilmadi** (headless'da WebAudio chiqishi o'lchanmaydi) — testlar faqat
  chaqiruv-faktini va no-crash'ni qulflaydi. Qurilmada bip balandligi/uzunligi F9 da baholansin.
- **PaymentDialog jonli ochilmadi** — dev DB'da «tayyor» chek yo'q edi (server-yozuv qilmaslik
  uchun ataylab yaratmadim); tez-summa xulqi 5 unit-testda qulflangan, jonli faqat F9/QA da.
- To'lov/sotish server-amallari bajarilmadi (chek yaratilmadi); chop yo'llari bosilmadi.
- `/retail` sahifasidagi PaymentDialog ko'rinishi jonli tekshirilmadi (o'sha komponent).

## Chala qolgan ishlar / keyingi agentlarga

1. **ATAYLAB:** navbat/cheklar/zakazlar/mijozlar ichki ko'rinishi eski — F4; smena blind-sanoq — F5.
2. `pages.sotuv` da endi ishlatilmaydigan kalitlar qoldi (`shift_open`, `shift_open_age`,
   `shift_manage`, `cart_price`) — zarar yo'q, F9 tozalashi mumkin.
3. Savat qatori endi BUTTON ichida BUTTON bo'lolmaydi — qatorga yangi interaktiv element
   qo'shmoqchi bo'lsangiz (F4+), butun-qator-trigger shartnomasini buzmasdan span+bubbling
   ishlating yoki qatorni qayta o'ylang.
4. `scan-feedback` faqat Sotuv rejimiga ulangan; F4 navbat/cheklar ekranlariga kerak bo'lsa
   o'sha modulni ishlating (yangi audio-yo'l ochmang).
5. Yangi POS-fayl ochsangiz: `pos-i18n-guard` POS_FILES + `i18n-no-hardcoded` POS_DONE_FILES
   ro'yxatlari MAJBURIY (F1 ogohlantirishi kuchda; scan-feedback.ts JSX'siz — kirmagan).
6. O'lcham qoidasi kuchda: POS o'lchamlar faqat px (`--pos-row-h`, `--pos-touch-min`).

## Takliflar (YAGNI — bajarilmadi, faqat qayd)

- Tez-summa nominallarini CompanySettings'ga chiqarish (valyuta/inflyatsiya o'zgarsa kod emas
  sozlama o'zgarsin).
- `cart-line-edit-modal`ga «+1/−1» katta tugmalar (oynaning ichida) — kassir bir dona
  qo'shishni oynasiz ham (setkadan qayta bosish) qila oladi, shart emas.
