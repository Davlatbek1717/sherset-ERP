# POS redizayn — F4 hisobot (Navbat kanban + ro'yxat ekranlari)

**Sana:** 2026-08-14 · **Faza:** F4 (reja: `docs/superpowers/plans/2026-08-14-kassa-pos-redizayn.md`)
**Holat:** **Phase-1: strukturaviy, runtime-tasdiqlanmagan** (lokal dev-brauzerda avtomatlashgan
ko'z-tekshiruv BOR — 9/9 jonli o'lchov, konsol 0 xato; qurilma/sensorli sinov YO'Q — F9).
**Commitlar:** `101ee667` (F4.1 navbat kanban) · `8ba6e461` (F4.2 cheklar) · `fc338e3f`
(F4.3 zakazlar) · `3af37078` (F4.4 customers-panel) — har biri to'liq gate bilan.

## Nima qilindi

### F4.1 — Navbat: ikki ustunli kanban (spec §5.2, Q3)

- `navbat-mode.tsx` qayta qurildi: F1 dagi `which: 'jarayonda'|'tayyor'` prop **KETDI** —
  komponent o'zi ikki ustunni chizadi: chap **«Yig'ilmoqda»** (picking, sariq), o'ng
  **«Tayyor»** (ready, yashil); har ustunda sarlavha + son-badge + o'z bo'sh-holati.
  `page.tsx` endi BITTA `<NavbatMode>` chizadi (eski ikki-nusxa render ketdi).
- **Karta** (`data-test-id="navbat-card"`): chek raqami 20px · summa 20px · mijoz ·
  **o'tgan vaqt** (yangi — umumiy 30s puls `useNowTick`, formatlar: hozirgina / N daq /
  H soat M daq / N kun) · pozitsiyalar soni. Tugmalar 56px (`--pos-touch-min`):
  «Bekor qilish» ikkalasida; **«To'lov» FAQAT tayyorda** (`loadReadyToCart` — mavjud yo'l);
  **«Tasdiqlash» (markReady) yig'ilmoqdada QOLDI** — egasi 2026-08-11 yo'li (omborchi
  belgilamasa chek osilib qolmasin); reja karta-tarkibida yo'q edi, lekin olib tashlash
  mavjud funksiyani regress qilardi — ATAYLAB saqlandi.
- **Bekor tasdig'i endi raqam BILAN summa** ko'rsatadi: `cancelSale(saleId, name, sumMinor)`
  (imzo kengaydi), `cancel_sale_confirm` kaliti `{sum}` parametr oldi. Tasdiq tugmasi
  **farqli nomlanadi** (`cancel_sale_confirm_label` = «Chekni bekor qilish») — ilgari
  dialogda IKKI bir xil «Bekor qilish» tugmasi bo'lardi (confirm ham, cancel ham).
- Sidebar `badges.navbat` = picking+ready jami — F2 shartnomasi O'ZGARMAGAN.
- Kartada `picker_collecting` chip ketdi (ustun sarlavhasi shu ma'noni beradi).

### F4.2 — Cheklar: to'liq-ekran ro'yxat + detal (spec §5.3)

- Detal ilgari ro'yxat **O'RNIGA** chizilardi; endi **yonma-yon**: chap 400px ustun
  (qidiruv 48px + qatorlar 64px, tanlangan qator ko'k belgi `data-selected`), o'ng —
  `ChekDetailPanel` yoki placeholder («Ro'yxatdan chekni tanlang»).
- Funksional 1:1: F6.C qidiruv, qaytarish, qayta chop — `ChekDetailPanel`ga TEGILMAGAN.
  `‹` tugmasi endi tanlovni tozalaydi (ro'yxat doim ko'rinadi).
- Qator shriftlari: summa 18px, meta 14px. Qator chek RAQAMINI ko'rsatmaydi (ilgari ham
  shunday edi) — mavjud testlar «CHEK-xxxxx faqat detalda» degan xulqqa qulflangan.

### F4.3 — Zakazlar: xuddi shu naqsh

- Chap 400px: holat-filtri chiplar 48px + qatorlar 64px (nom/summa 18px, meta 14px,
  tanlov belgisi); o'ng: `ZakazDetailPanel` yoki placeholder. Filtr/tasdiqlash/to'lash
  yo'llari TEGILMAGAN (server filtri, `transitions/confirmed`, `payOrderMut`).

### F4.4 — Customers-panel: faqat o'lcham-pass

- Mantiq/DOM-tuzilma/test-id lar o'zgarMAGAN. O'lchamlar: qidiruv 48px, natija/chek
  qatorlari 64px, amal tugmalari 56px, qarz raqami 32px, shriftlar 14–20px (px-qoida),
  kontent to'liq-ekranda o'qilishi uchun 640px markaziy ustun.

### i18n (ru+uz, `pages.sotuv`)

`navbat_col_picking/ready` · `navbat_elapsed_now/min/hm/day` · `cancel_sale_confirm`
(endi `{name}` + `{sum}`) · `cancel_sale_confirm_label` · `chek_detail_placeholder` ·
`orders_detail_placeholder`. Hardcoded matn yo'q (JSX tekshirildi).

## Testlar

- **Yangi:** `navbat-mode.test.tsx` (5 test, test-avval — qizil ko'rilgan): ikki ustun
  bir vaqtda + karta o'z ustunida; karta meta (summa/mijoz/o'tgan vaqt); To'lov faqat
  tayyorda + Tasdiqlash faqat yig'ilmoqdada; bekor tasdig'ida raqam+summa va POST
  `/retail-sales/:id/cancel`; bo'sh ustun holati.
- **Tegilmagan-yashil** (layout o'zgarishiga qaramay birorta ham qayta yozilMAdi):
  `sales-screen-payment` (14) · `sales-screen-usd` · `audit-fixlar` · `chek-detail-panel`
  (21) · `chek-jim-chop` · `chek-refund-debt` · `sales-screen-orders` (12) ·
  `sales-screen-order-payment` · `sales-screen-customers` (5).

## Gate natijalari (har commit oldidan to'liq; oxirgisi F4.4 da)

- `pnpm typecheck` — 0 xato (10/10 task).
- `pnpm lint:product` — 0 error (1045 warning — siyosat bo'yicha ruxsat).
- `pnpm i18n:gate` — 19/19 yashil.
- `pnpm --filter @moysklad/web test` — **3917 passed / 26 skipped** (F3-baseline 3912 + 5
  yangi navbat-testi). Mavjud chek/zakaz/to'lov suitelari o'zgarishsiz yashil.

## Ko'z-tekshiruv (F4.5 — lokal dev, izolyatsiyalangan headless chromium, 1366×768)

MCP-brauzer parallel sessiyada band edi — F3 dagidek alohida skript (admin@demo.local):
**9/9 jonli o'lchov ✓, konsol 0 xato**. O'lchovlar DOM'dan: kanban ustunlari yonma-yon
550px/550px, kartalar o'z ustunida (2 picking + 1 ready, badge 3) · karta raqami 20px,
tugmalar 56px · cheklar chap ustun 400px, qator 64px, detal ochiq holda ro'yxat ham
ko'rinadi (tanlov belgisi bilan) · zakazlar chiplar 48px×3 · mijozlar qidiruv 48px,
qator 64px. Skrinshotlar ko'z bilan ko'rildi: kanban (sariq/yashil ustunlar, To'lov
faqat tayyorda, o'tgan vaqt «4 kun»), cheklar ikki paneli.

## O'LCHANMAGAN (halollik)

- **Qurilmada** (sensorli monoblok, kassa .exe) sinov YO'Q — F9.
- **Bekor qilish / Tasdiqlash / To'lov jonli BOSILMADI** (server-yozuvni ataylab
  qilmadim) — dialog matni, cancel-POST, to'lov-oynasi xulqi testlarda qulflangan.
- O'tgan-vaqt pulsi (30s interval) jonli 30s kuzatilmadi — birinchi render qiymati ko'rildi.
- `/retail` sahifasiga tegilmadi (F4 fayllari u yerda ishlatilmaydi — tekshirildi:
  customers-panel/navbat/cheklar/zakazlar-mode importlari faqat `/sotuv`da).
- Brauzer (kiosk emas) ko'rinishida ERP yuqori-nav ko'rinadi — F4'dan OLDINGI holat.

## Chala qolgan ishlar / keyingi agentlarga

1. **ATAYLAB:** smena blind-sanoq + yakunlanmagan-cheklar ro'yxati — F5; oyna tugmalari — F6.
2. Ready-karta tugmasi yorlig'i mavjud `pay` kaliti («To'lov»/«Оплата») — reja matnida
   «TO'LASH» deb yozilgan edi; so'zni almashtirish 6 characterization-test chaqiruvini
   qayta yozishni talab qilardi, kosmetik farq deb SAQLANDI. Egasi «To'lash» so'zini
   xohlasa — F9 da testlar bilan birga almashtiriladi.
3. Endi ishlatilmaydigan kalitlar: `picker_collecting`, `picking_section_title` (F4
   tashladi) + F2/F3 dan qolganlar — zarar yo'q, F9 tozalashi mumkin.
4. Cheklar qatorida chek raqami yo'q (test-qulf, eski xulq) — kassirga kerak bo'lsa F9 da
   testni yangi niyat bilan qayta yozib qo'shiladi.
5. Detal-panellarning ICHKI tipografikasi (ChekDetailPanel/ZakazDetailPanel kontenti)
   eski o'lchamlarda — spec §5.3 asosan qatorlarga tegishli deb o'qildi; to'liq §4-pass
   kerak bo'lsa F9.
6. `cancelSale` imzosi endi 3 argumentli — F5 smena-ekrani yakunlanmagan-cheklar ro'yxati
   shu imzoni ishlatsin (sumMinor bor — `unresolved` endpoint javobida ham bo'lsin).
7. Yangi POS-fayl ochilmadi — qo'riqchi-ro'yxatlar o'zgarmagan (navbat-mode.tsx allaqachon
   POS_FILES da). Yangi fayl ochsangiz F1 qoidasi kuchda.

## Takliflar (YAGNI — bajarilmadi, faqat qayd)

- Kanban kartasida omborchi ismini ko'rsatish (kim yig'ayotgani) — serverda maydon bor-yo'qligi
  tekshirilmadi.
- O'tgan vaqt bo'yicha karta saralash/eskirganini qizartirish (SLA-signal) — spec'da yo'q.
