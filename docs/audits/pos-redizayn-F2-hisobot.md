# POS redizayn — F2 hisobot (qobiq: sidebar + header + tema)

**Sana:** 2026-08-14 · **Faza:** F2 (reja: `docs/superpowers/plans/2026-08-14-kassa-pos-redizayn.md`)
**Holat:** **Phase-1: strukturaviy, runtime-tasdiqlanmagan** (lokal dev-brauzerda ko'z-tekshiruv BOR —
1366×768 va 1920×1080; qurilma/sensorli sinov YO'Q — u F9 da).
**Commitlar:** `78399d7b` (F2.1 sidebar) · `39ee95e3` (F2.2 header) · `4f31368e` (F2.3 use-server-link) ·
`bedd03cd` (F2.4 integratsiya) · `e8c5df83` (F2.5 px-o'lchamlar + qobiq balandligi) — har biri to'liq gate bilan.

## Nima qilindi

`/sotuv` eski 600px-panel + 7-tab ko'rinishidan **sidebar + ko'k header + to'liq-ekran rejimlar**
qobig'iga o'tdi (spec §3, §4, Q2). Rejim-komponentlar ICHKI ko'rinishi ataylab eski (F3–F5 ishi) —
ular faqat to'liq-en konteynerga tushdi.

### Yaratilgan fayllar

| Fayl | Tarkib |
|---|---|
| `components/pos/pos-sidebar.tsx` | `PosSidebar` + **`PosMode` unioni e'loni** (F3–F5/F8 tayanadi). 6 bo'lim (Smena pastda ajratilgan), badge'lar (savat=ko'k, navbat=sariq; yig'iq holatda ikonka burchagida), 240↔72px, aktiv=oq fon+ko'k chap chiziq, `aria-label` doim (yig'iq holatda ham nom barqaror — MK32 testlari nom bo'yicha topadi) |
| `components/pos/pos-header.tsx` | `PosHeader({ session, shiftAge, connectionOk, children? })` — SHERSET **matn**-logotip (public/ da asset yo'q — tekshirildi), smena-chip (kassir · yosh · savdo; `stale` → sariq, `data-stale`), soat (30s interval, testda assertsiz), aloqa-indikator (`data-ok`; uzilganda qizil banner-yorliq), o'ng `children` sloti (F6 oyna-tugmalari) |
| `components/pos/use-server-link.ts` | `useServerLink()` — `QueryCache.subscribe`; **yangi so'rov yo'q**. Network-xato (statussiz Error) → `false`; HTTP-xato (`.status` bor — server javob berdi, 403/409) aloqa uzilishi EMAS |
| `app/(app)/sotuv/pos-theme.css` | `.pos-theme` tokenlari: `--pos-brand #1e5aa8` · `--pos-brand-dark` · `--pos-on-brand` · `--pos-touch-min 56px` · `--pos-row-h 64px` + sidebar palitrasi. Faqat `/sotuv` ildizida, `--ms-*` ga tegilmagan |
| Testlar | `pos-sidebar.test.tsx` (10) · `pos-header.test.tsx` (8) · `use-server-link.test.tsx` (4) — hammasi test-avval (qizil ko'rilgan) |

### `page.tsx` o'zgarishlari (F2.4)

- `tab` unioni → **`PosMode`**: `'savat'→'sotuv'`, `'jarayonda'/'tayyor'→'navbat'`; barcha
  `setTab` chaqiruvlar migratsiya qilindi (loadReadyToCart/payOrder → `'sotuv'`, CustomersPanel
  onOpenChek → `'cheklar'`, CustomerCardPanel onOpenOrder → `'zakazlar'`).
- Eski tab-bar (~110 qator) va CFD-satr O'CHDI; CFD tugmasi header `children` slotida
  (`pos-cfd-toggle`). Eski «SOTUV» h1-satri o'rnini header oldi. `page.tsx` 1608 → 1567 qator.
- Rejim-layout: `sotuv` = SotuvSearchGrid + 600px SavatPanel (savat endi doimiy panel, tab emas);
  `navbat` = ikkala eski blok yonma-yon (haqiqiy kanban F4 da); qolganlari to'liq-en konteyner.
- Sidebar holati: `localStorage['sherset.pos.sidebar']` (`collapsed|expanded`), saqlanmagan
  bo'lsa `innerWidth < 1280` avto-yig'adi. Header/sidebar **fixed EMAS** (klaviatura-evristika).
- `ShellVersionBadge` sahifaga ulandi (o'zini fixed burchakka chizadi, tugmasiz — evristikaga
  tegmaydi; brauzerda null).

### Jonli o'lchovda topilgan 2 real bug (F2.5, ko'z-tekshiruvsiz o'tib ketardi)

1. **Ildiz font-size 12px** (ERP zichligi) — rem-asosli `h-16`/`w-60` real **48/180px** chiqib
   spec §4 nishonlarini buzardi. Sidebar/header px-tokenlarga o'tdi (`h-[var(--pos-row-h)]`,
   `w-[240px]`, 64px header, 24/28px ikonka); sidebar-test yangi niyat bilan px-tokenni qulflaydi.
2. **`useFillViewport` birinchi mount'da o'lchamasdi** (loading-branch, ref hali yo'q) → qobiq
   `100dvh` fallback'da qolib ~99px oshar, **sidebar'ning «Smena» tugmasi fold ostida** yashirinardi.
   Sessiya kelgach `remeasure()` chaqiriladi (hook erta-return'dan yuqorida, React #310 qoidasi).
   Bu xato F2'dan OLDIN ham bo'lgan bo'lishi mumkin (o'sha hook, o'sha oqim) — endi yopildi.

### Qayta yozilgan MK32 testlari (faqat Edit; eski niyat izohda)

- `sales-screen-payment` (3 joy + helper) · `sales-screen-usd` (helper) · `audit-fixlar` (1 joy):
  «Tayyor» tab kliki → «Navbat» rejimi (spec Q3 birlashuvi).
- `sales-screen-cart`: savat-soni asserti tab-rozetkadan → sidebar «Sotuv» badge'iga.
- `sales-screen-orders`: tayyorlik-signali `/^Savat/` → `Sotuv`.
- `sales-screen-customers`: «Cheklar va Smena orasida» — sibling-matn o'rniga sidebar
  test-id TARTIB qulfi (yig'iq holatda matn yo'q; Smena alohida pastki blokda).
- `chek-detail-panel`: `refundQtyInputs` `getAll`→`queryAll` (Cheklar rejimida chap setka yo'q —
  0 textbox holati endi mavjud; «0 ta» assert ishlashi uchun).

### i18n (ru+uz, `pages.pos`)

`sidebar_*` (8 kalit) · `header_shift_age` · `header_sales` · `header_conn_ok/lost`.
`header_sales` uz «{n} ta savdo · {sum}» — «savdo» so'zi ATAYLAB: smena-mode'ning «{n} ta · …»
matni bilan `getByText(/3 ta ·/)` to'qnashuvini oldini oladi. `POS_ALLOWED`ga «SHERSET»
(brend nomi, tarjima qilinmaydi — sabab hujjatlangan). Qo'riqchi-reyestrlar: `pos-sidebar.tsx`,
`pos-header.tsx` → `POS_FILES` + `POS_DONE_FILES`.

## Gate natijalari (har commit oldidan to'liq; oxirgisi F2.5 da)

- `pnpm typecheck` — 0 xato (10/10 task).
- `pnpm lint:product` — 0 error (1047 warning — siyosat bo'yicha ruxsat).
- `pnpm i18n:gate` — 19/19 yashil.
- `pnpm --filter @moysklad/web test` — **3898 passed / 26 skipped** (F1-baseline 3876 + 22 yangi
  test: 10 sidebar + 8 header + 4 hook). Sotuv-suite regresssiz; qayta yozilganlar 1:1.

## Ko'z-tekshiruv (2.5 — lokal dev, Playwright, admin@demo.local, ochiq smena)

- 1366×768 va 1920×1080: header 64px · sidebar element 64px · sidebar 240↔72px (localStorage
  `collapsed` saqlandi; badge yig'iq holatda ham ko'rinadi) · overflow 0, «Smena» tugmasi ko'rinadi.
- Barcha 6 rejim ochildi: sotuv (setka+savat), navbat (ikki ustun: 2 yig'ilmoqda + 1 tayyor,
  badge 3), zakazlar, cheklar, mijozlar, smena (sessiya-info, kirim/chiqim, yopish bo'limi).
- Savatga tovar qo'shildi → qator + sidebar badge «1». Brauzer konsolida **0 xato**.

## O'LCHANMAGAN (halollik)

- Qurilmada (sensorli monoblok, kassa .exe qobig'i) sinov YO'Q — F9.
- To'lov/yopish server-amallari bajarilmadi (testlarda qulflangan, jonli yurgizilmadi).
- CFD oynasi ochilmadi (tugma headerda, bosilmadi); chop yo'llari bosilmadi.
- `stale`/aloqa-uzilish holatlari jonli ko'rilmadi (testlarda qulflangan).
- Tor ekranda avto-yig'ilish (`<1280px`) jonli tekshirilmadi (testda emas, kod-yo'l oddiy).

## Chala qolgan ishlar / keyingi agentlarga

1. **ATAYLAB:** rejim ichlari eski dizaynda — F3 (sotuv: ± olib tashlash, 72px TO'LASH),
   F4 (navbat kanban, cheklar/zakazlar to'liq-ekran layout), F5 (smena blind-sanoq).
2. `ShellVersionBadge` header o'ngiga singdirilmagan (o'zini fixed burchakka chizadi) — spec §3.1
   to'liq bajarilishi F6 bilan birga (header o'ng sloti o'sha fazada qayta quriladi).
3. Eski smena-strip `SotuvSearchGrid`da QOLDI (header-chip bilan ma'lumot dublikati) — F3
   sotuv-rejimini qayta qurganda olib tashlasin (spec §3.1: strip header'ga ko'chdi).
4. `t('title')`, `tab_*` kalitlari endi ishlatilmaydi (json'da qoldi — zarar yo'q); F9
   tozalashi mumkin.
5. Yangi POS-fayl ochsangiz: `pos-i18n-guard` POS_FILES + `i18n-no-hardcoded` POS_DONE_FILES
   ro'yxatlariga qo'shish MAJBURIY (F1 ogohlantirishi kuchda).
6. **O'lcham qoidasi:** ildiz font 12px — yangi POS o'lchamlarni px'da yozing (`--pos-row-h`,
   `--pos-touch-min` tokenlari bor), rem-asosli tailwind klass (h-16 va h.k.) 0.75× kichik chiqadi.
7. Sidebar `badges.navbat` = picking+ready jami — F4 kanban shu prop-shartnomani saqlasin.

## Takliflar (YAGNI — bajarilmadi, faqat qayd)

- `--pos-brand`ni DS token bilan bog'lash (hozircha faqat POS-lokal qiymat).
- Aloqa-indikator uchun `MutationCache`ni ham kuzatish (hozir faqat query'lar — POS'da polling
  bor, yetarli signal).
