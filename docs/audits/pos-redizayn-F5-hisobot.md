# POS redizayn — F5 hisobot (Smena: yopiq sanoq + ochiq cheklar ro'yxati)

**Sana:** 2026-08-14 · **Faza:** F5 (reja: `docs/superpowers/plans/2026-08-14-kassa-pos-redizayn.md`)
**Holat:** **Phase-1: strukturaviy, runtime-tasdiqlanmagan** (lokal dev'da avtomatlashgan jonli
ko'z-tekshiruv BOR — 20/21 tekshiruv ✓, bittasi skript-artefakt deb izohlangan, konsol 0 xato;
qurilma/sensorli sinov YO'Q — F9).
**Commitlar:** `ba697907` (F3 skaner-testi flake-tuzatish, F5'dan oldin kerak bo'ldi) ·
`30b37a14` (F5.1 API endpoint) · `dce82eab` (F5.2 blind sanoq) · `cacba6eb` (F5.3
yakunlanmagan-ro'yxat) — har biri to'liq gate bilan.

## Nima qilindi

### F5.1 — API: `GET /cashier-sessions/:id/unresolved` (kichik server qo'shimchasi)

- Javob: `{ sales: [{ id, name, state, sumMinor }] }` — `sumMinor` BigInt, JSON'da satr
  (global `BigInt.toJSON`).
- **Tanlov-mezon `close()` bilan YAGONA yordamchida** (`findUnresolvedSales`): FSM'ning
  `allowedFrom('cancel')` ro'yxati (`draft|picking|ready`), `createdAt asc`. `close()`dagi
  inline so'rov shu yordamchiga ko'chirildi — nusxa YO'Q. Manba-qulf testi
  (`allowedFrom('cancel')` faylda aynan 1 marta + yordamchi ≥2 joydan chaqiriladi) mezon
  nusxalanishini taqiqlaydi.
- Sessiya topilmasa/begona akkaunt — 404. Yopiq sessiyada ro'yxat tabiiy bo'sh (mezon
  holatga qaramaydi — yopiq smenada pending chek qolmaydi, close o'zi to'sadi).
- **Kiosk-allowlist: alohida qoida QO'SHILMADI** (rejadan og'ish, sababli) — mavjud
  `/cashier-sessions` `['*']` prefiks-qoidasi yangi GET'ni allaqachon qamraydi; ortiqcha
  qator o'rniga `kiosk-policy.test.ts`ga qamrovni QULFLAYDIGAN test qo'shildi (qoida
  toraytirilsa test yiqiladi).
- Testlar: `unresolved-endpoint.test.ts` (8 test, test-avval — qizil ko'rilgan: 7/8 yiqilib
  keyin yashil). Server smena-qoidalari O'ZGARMAGAN: to'siq qoladi, avto-bekor yo'q,
  endpoint faqat o'qiydi.

### F5.2 — Web: yopiq (blind) sanoq (spec §5.4, Q7)

- Holat mashinasi `smena-mode.tsx` ICHIDA: `idle → counting → review → closing`.
  Sahifa (`page.tsx`) faqat qiymatlarni biladi (sanoq satrlari, `closePreview`, farq);
  ko'rsatish TARTIBI — komponentda.
- **`counting`:** faqat sanoq maydon(lar)i + katta numpad (64px tugmalar; so'mda `000`,
  dollar maydoni faolida `.`; 12-belgi chegara — `cart-line-edit-modal` naqshi). Kutilgan
  summa DOM'ga UMUMAN chizilmaydi; `closePreview` so'rovi avvalgidek yuradi (natija faqat
  JS xotirasida). USD maydoni mavjud shart bilan (`usdInPlay`) — maydonning BORLIGI faqat
  «dollar oqimi bo'lgan» faktini oshkor qiladi, summani emas.
- **`review`:** Sanadingiz · Kutilgan naqd · Farq (+ USD bloki sentda, K-2 minus-formati
  saqlangan). **Farq≠0 → izoh MAJBURIY** (yangi qoida; ilgari ixtiyoriy edi) — Tasdiqlash
  izoh yozilguncha bloklanadi, «Farq bor — izoh majburiy» yozuvi ko'rinadi.
- **Review'dan sanoqqa qaytish YO'Q** — faqat butun oqimni bekor qilish («Bekor qilish» →
  idle, sanoq/izoh TOZALANADI). «Davom etish» so'm sanog'i kiritilmaguncha bloklangan.
- `page.tsx`: `countedCash`/`countedCashUsd` prop'lari qo'shildi (review «Sanadingiz»
  qatori); boshqa hisob-mantiq joyida qoldi. Server `close()` XULQI o'zgarmagan —
  yuboriladigan payload avvalgidek.

### F5.3 — Web: yakunlanmagan cheklar STRUKTURALI ro'yxati (spec §5.4)

- «Smena» ekranida, yopish bo'limidan OLDIN, `unresolved > 0` bo'lsa amber blok:
  sarlavha (soni bilan) + ko'rsatma + har chek karta — **raqam (18px) · bosqich-yorlig'i ·
  summa**. Bosqich yorliqlari STATIK i18n kalitlari (Savatda / Yig'ilmoqda / Yig'ilgan;
  notanish holat xom nomi bilan — dinamik `t()` ATAYLAB yo'q, pos-i18n-guard chegarasi).
- Tugmalar: `ready` → **«To'lov»** (mavjud `loadReadyToCart` — chek savatga, to'lov oynasi
  ochiladi) va «Bekor qilish»; `picking`/`draft` → faqat «Bekor qilish» (server `post()`
  faqat ready'dan — yolg'on tugma yo'q). Bekor — mavjud `cancelSale(id, name, sumMinor)`
  (F4 imzosi, tasdiqda raqam+summa).
- **`draft` chek endi KO'RINADI** — ilgari hech qaysi rejimda yo'q edi («ko'rinmas
  bloklovchi» muammosi yopildi).
- Ro'yxat bo'sh bo'lmasa «Smenani yopish» UI'da bloklanadi + sabab yozuvi. Bu faqat
  UI-signal — haqiqiy to'siq SERVERDA qoladi (close 400 → toast, mavjud yo'l).
- So'rov: `['cashier-session-unresolved', session.id]`, faqat `mode === 'smena'` da,
  8s polling; bekor/to'lov muvaffaqiyati invalidate qiladi.
- Jihoz: `harness.tsx` `salesRoutes`ga default `/unresolved` (`{sales: []}`) marshruti
  (router unmatched'da otadi — smena-tab ochadigan har test uchun shart); shift-fixture
  kontragentiga `tags`/`companyType` qo'shildi (Rasmiyashtirish oynasi `tags.includes`
  o'qiydi — F5 «To'lov» yo'li o'sha oynani ochadi).

### Yo'l-yo'lakay: F3 skaner-testi flake-tuzatish (`ba697907`)

`sales-screen-cart` «notFound aynan 1 marta» asserti real soat bilan mashina tezligiga
bog'liq edi (band mashinada ikki prefiks-so'rov 800ms dedup-oynadan tashqarida kelib,
dizayn BO'YICHA ikkinchi bip chalinardi) — bu sessiyada gate'ni yiqitdi. Endi testda faqat
`Date` muzlatiladi (taymerlar real) — dedup shartnomasi deterministik. Xulq kodi TEGILMAGAN.

### i18n (ru+uz, `pages.sotuv`)

`close_continue` · `close_counted` · `close_note_required` · `unresolved_title` ·
`unresolved_hint` · `unresolved_stage_draft/picking/ready` · `unresolved_close_blocked`.
JSX'da hardcoded matn yo'q (tekshirildi).

## Testlar

- **API (yangi):** `unresolved-endpoint.test.ts` — 8 test (mezon, shakl, izolyatsiya, 404,
  tartib, manba-qulf), test-avval qizil ko'rilgan. `kiosk-policy.test.ts` +1 qator.
- **Web qayta yozilganlar (faqat Edit, niyat izohda):** `sales-screen-shift` «Smena yopish»
  describe'i → blind-oqim (8 test; eski «kutilgan oldindan ko'rinadi» niyati Q7 bilan bekor,
  sabab describe-izohida); `audit-fixlar` 5e3/K-2 testlari va `z-report-print-wiring`
  yangi oqimga moslashtirildi (niyatlari saqlangan).
- **Web yangi:** «Yakunlanmagan cheklar ro'yxati» describe'i — 6 test (3 bosqich kartasi,
  draft'da faqat bekor, To'lov yo'li, cancel-POST, yopish-blok, bo'sh holat), test-avval
  qizil ko'rilgan (5/6 yiqilib keyin yashil).
- **Halollik:** F5.2 blind-oqim testlari implementatsiyadan OLDIN yozildi, lekin qizil
  holatda ALOHIDA yugurtirilmadi (birinchi yugurtirish implementatsiyadan keyin bo'ldi) —
  qat'iy test-avval protokoli bu qadamda to'liq kuzatilmadi. Eski xulqqa qarshi yozilgan
  assertlar (masalan «counting'da Kutilgan yo'q») eski kodda aniq yiqilardi.

## Gate natijalari (har commit oldidan to'liq; oxirgisi F5.3 da)

- `pnpm typecheck` — 0 xato (10/10 task).
- `pnpm lint:product` — 0 error (1053 warning — siyosat bo'yicha ruxsat).
- `pnpm i18n:gate` — 19/19 yashil.
- `pnpm --filter @moysklad/web test` — **3925 passed / 26 skipped** (F4-baseline 3917 +
  2 shift-blind + 6 ro'yxat). MK32 characterization to'plami yashil.
- `pnpm --filter @moysklad/api test` — **8267 passed / 2 skipped** (F5.1 commitida to'liq).

## Ko'z-tekshiruv (F5.4 — lokal dev, izolyatsiyalangan headless chromium, 1366×768)

MCP-brauzer parallel sessiyada band edi (F3/F4 dagidek) — alohida skript, admin@demo.local,
web :3100 (shu worktree'dan ishlab turgan dev-server, hot-reload), api :4000 ni shu
worktree'dan o'zim ko'tardim (sessiya boshida O'CHIQ edi) va ish oxirida TO'XTATDIM.
**20/21 ✓, konsol 0 xato**, skrinshotlar ko'z bilan ko'rildi:

- Savdo → «Omborchiga yuborish» → picking chek yaratildi; Smena ekranida **«Yakunlanmagan
  cheklar (4)»** bloki (raqam · bosqich · summa), «Smenani yopish» BLOKLANGAN + sabab yozuvi. ✓
- Har karta «Bekor qilish» → tasdiqda raqam+summa («ТРН-2026-00008 … 36 000,00 сум») →
  4/4 bekor qilindi → ro'yxat bo'shadi → yopish OCHILDI. ✓
- Yopish → counting: katta numpad, kutilgan summa ekranda YO'Q; numpad `1·000·000` → maydonda
  1000000. ✓ → «Davom etish» → review: Sanadingiz 1 000 000,00 · Kutilgan naqd 5 000,00 ·
  Ortiqcha 995 000,00; sanoq maydoni YO'Q (qaytish yopiq); izohsiz Tasdiqlash BLOKLANGAN →
  izoh yozildi → smena YOPILDI (server qabul qildi: sess `9e089ec9`, closing 100000000 tiyin —
  API'dan tasdiqlandi). ✓
- Jonli HTTP: `GET /cashier-sessions/:id/unresolved` → 200 `{"sales":[]}` (haqiqiy guard-zanjir
  orqali). ✓
- **Yagona ✗ — skript-artefakt:** «counting'da 'Kutilgan naqd' matni body'da bor» tekshiruvi
  yiqildi, chunki skript `textContent`ni `<script>` teglari bilan o'qigan — matn Next.js/next-intl
  **tarjima-katalogi** (flight payload) ichida, ko'rinadigan DOM'da EMAS (probe: ko'rinadigan
  tugun 0 ta; vitest `queryByText` ham shuni tasdiqlaydi). Kassir uni ko'rmaydi.

**Dev-DB o'zgarishlari (ochiq yozilyapti):** eski 4-kunlik stale smena yopildi (farq akti
«F5 ko'z-tekshiruv» izohi bilan), 4 pending chek bekor qilindi (shu jumladan tekshiruv o'zi
yaratgan 1 picking chek), oxirida yangi smena ochib qo'yildi (opening 0) — POS ish holatida
qoldirildi. Bularning bari LOKAL `climart_adopt` bazasida; prod'ga tegilmagan.

## O'LCHANMAGAN (halollik)

- **Qurilmada** (sensorli monoblok, kassa .exe) sinov YO'Q — F9. Numpad barmoq bilan
  bosilmadi (faqat sichqoncha-klik).
- Kutilgan summaning JS-xotirada (network-javobda) borligi Q7 tahdid-modeliga kirmaydi
  deb qabul qilindi (kassir DevTools ochmaydi) — egasi boshqacha o'ylasa F9'da muhokama.
- USD'li smena JONLI sinalmadi (dev smenada dollar oqimi yo'q edi) — testlarda qulflangan.
- `review`da closePreview KELMAGAN (server javob bermagan) holat: kutilgan/farq chizilmaydi,
  izoh majburlanmaydi, yopish mumkin (mavjud shartnoma saqlangan — server baribir o'zi
  hisoblaydi). Bu yo'l jonli sinalmadi.
- To'lov yo'li ro'yxatdan faqat oynaning OCHILISHIGACHA sinaldi (testda); jonli to'lov
  bosilmadi (chek yopilmadi).
- 8s polling jonli 8s kuzatilmadi (invalidatsiya yo'li ko'rildi).

## Chala qolgan ishlar / keyingi agentlarga

1. **ATAYLAB:** oyna tugmalari — F6; ko'p-kassir — F7/F8; «Kassirni almashtirish» tugmasi
   (spec §5.4 oxirgi band) — F8 qo'shadi (F5 qamroviga kirmaydi, reja shunday).
2. `smena-mode.tsx` endi ~700 qator (blok + holat mashinasi) — F8 «Kassirni almashtirish»
   qo'shganda bo'lish shart emas, lekin o'sishni kuzating.
3. Numpad faqat smena-yopish sanog'ida; kirim/chiqim (drawer) maydonlari hali oddiy input —
   spec §5.4 «yashiq amallari — hozirgi funksional saqlanadi» degani uchun tegilmadi.
   Sensorli numpad kerak bo'lsa F9 qarori.
4. Eski `expected_cash*` ko'rsatish-yo'lidagi ba'zi kalitlar endi faqat review'da ishlatiladi;
   ishlatilmay qolgan kalit YO'Q (tekshirildi), F2/F3 dan qolgan o'lik kalitlar ro'yxati F9'da.
5. Kiosk-allowlist'da alohida `unresolved` qatori yo'q (yuqoridagi og'ish) — kimdir
   `/cashier-sessions` qoidasini toraytirsa `kiosk-policy.test.ts` yiqiladi, o'shanda aniq
   qator qo'shiladi.
6. `shiftRoutes` kontragent-fixture'i endi `tags`/`companyType` talab qiladi — yangi POS-test
   yozsangiz `salesRoutes` naqshiga qarang.

## Takliflar (YAGNI — bajarilmadi, faqat qayd)

- Yakunlanmagan-kartada «o'tgan vaqt» (navbat-kartadagi kabi) — kassirga eskilikni ko'rsatardi.
- Blind-sanoqda «ikki marta sanash» rejimi (ikki kiritma mos kelmasa ogohlantirish) — ba'zi
  POS'larda bor, spec'da yo'q.
