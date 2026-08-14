# POS redizayn — F1 hisobot (monolitni bo'lish)

**Sana:** 2026-08-14 · **Faza:** F1 (reja: `docs/superpowers/plans/2026-08-14-kassa-pos-redizayn.md`)
**Holat:** **Phase-1: strukturaviy, runtime-tasdiqlanmagan** (lokal dev-brauzerda ko'z-tekshiruv BOR,
qurilma/sensorli sinov YO'Q — u F9 da).
**Commitlar:** `82222e29` (F1.2 smena) · `0801a2ed` (F1.3 cheklar/zakazlar) · `4d5479c4` (F1.4 navbat) ·
`392c0b40` (F1.5 sotuv) — har biri to'liq gate bilan.

## Nima qilindi

`apps/web/src/app/(app)/sotuv/page.tsx` (3370 qator) dan render-bloklar `_components/` ostidagi
rejim-komponentlarga ko'chirildi. **Xulq va vizual o'zgarish NOL** — JSX aynan ko'chirildi, holat,
so'rovlar va mutatsiyalarning HAMMASI sahifada qoldi (rejadagi interfeys-shartnoma bo'yicha props
orqali uzatiladi; barcha props majburiy — prop-drop klassi typecheck'da tutiladi).

### Yaratilgan fayllar

| Fayl | Qator | Tarkib |
|---|---|---|
| `_components/smena-mode.tsx` | 411 | Smena tab: sessiya-info, Z-hisobot, kirim/chiqim, mijoz kartasi/qarz/RKO tugmalari, yopish formasi; `formatUsd` shu yerga ko'chdi |
| `_components/cheklar-mode.tsx` | 527 | Cheklar ro'yxati (F6.C qidiruv bilan) + `ChekDetailPanel` (qayta chop, qaytarish — o'z so'rov/mutatsiyalari bilan birga ko'chdi, komponent chegarasi o'zgarmagan) |
| `_components/zakazlar-mode.tsx` | 302 | Zakazlar ro'yxati (holat-filtri chiplar) + `ZakazDetailPanel` + `POS_ORDER_STATES`/`OrderRow`/`OrderDetail` tiplari (export) |
| `_components/navbat-mode.tsx` | 152 | Jarayonda + Tayyor bloklari BITTA faylda (`which` prop) — F4 kanban birlashtirishiga zamin |
| `_components/sotuv-mode.tsx` | 712 | `SotuvSearchGrid` (chap panel: stale-alert, smena-strip, qidiruv, setka) + `SavatPanel` (savat tab: qatorlar, chegirma, ikki sotish tugmasi) |
| `_components/pos-types.ts` | 54 | Ulashiladigan UI-tiplar: `CartLine`, `SaleRow` (rejada yo'q edi — bir tip 3 fayldan o'qilgani uchun zarur bo'ldi) |
| `_components/use-print-outcome.ts` | 65 | `usePrintOutcome` hook'i (rejada yo'q edi — sahifa ham, `ChekDetailPanel` ham o'qiydi, ikki nusxa xavfli) |

`page.tsx`: 3370 → **1607 qator** — orkestr: holat + so'rov/mutatsiyalar + `OpenShiftForm` +
`usePrintZReport` + CFD-satr + tab-bar + mode-render + dialoglar (CashOut/CustomerCard/DebtPayment/
Rasmiyashtirish/CartLineEdit) + root. Rejadagi «~800–1200» mo'ljalidan biroz katta — sabab: barcha
so'rov/mutatsiya/callback'lar ATAYLAB sahifada qoldirildi (F1 sharti), tab-bar hali eski (F2 sidebar
bilan almashtiradi).

### Blok-xarita (1.1 — asl 3370-qatorli fayl bo'yicha)

| Asl qatorlar | Blok | Borgan joyi |
|---|---|---|
| 93–101 | `formatUsd` | smena-mode.tsx |
| 117–143 | `CartLine` tipi | pos-types.ts |
| 157–278 | `OpenShiftForm` | page.tsx da QOLDI (sessiyasiz holat) |
| 282–363 | ChekDetail tiplari + `usePrintOutcome` | cheklar-mode.tsx / use-print-outcome.ts |
| 365–728 | `ChekDetailPanel` | cheklar-mode.tsx |
| 730–911 | zakaz tiplari + `ZakazDetailPanel` | zakazlar-mode.tsx |
| 913–936 | `usePrintZReport` | page.tsx da QOLDI |
| 984–1849 | SalesScreen holat/so'rov/mutatsiyalar | page.tsx da QOLDI |
| 1852–1968 | chap panel (alert, strip, qidiruv, setka) | sotuv-mode.tsx (`SotuvSearchGrid`) |
| 1971–2096 | CFD-satr + tab-bar | page.tsx da QOLDI |
| 2099–2206 | jarayonda + tayyor | navbat-mode.tsx |
| 2209–2359 | zakazlar + cheklar tab'lari | zakazlar-mode.tsx / cheklar-mode.tsx |
| 2363–2382 | mijozlar (CustomersPanel wiring) | page.tsx da QOLDI (panel allaqachon komponent) |
| 2385–2709 | smena tab | smena-mode.tsx |
| 2712–3205 | savat tab | sotuv-mode.tsx (`SavatPanel`) |
| 3208–3299 | dialoglar | page.tsx da QOLDI |
| 3306–3371 | root (`SotuvPage`) | page.tsx da QOLDI |

### Qo'riqchi-test moslashuvlari (o'chirish YO'Q, faqat yo'l/ro'yxat — niyat saqlangan)

- `pos-i18n-guard.test.ts` — POS_FILES ro'yxatiga 6 yangi fayl qo'shildi (qamrov KENGAYDI).
- `i18n-no-hardcoded.test.ts` — POS_DONE_FILES ga yangi fayllar (ortga qaytmaslik qulfi kengaydi).
- `raw-element-conventions.test.ts` — `page.tsx` EXEMPT ro'yxatdan CHIQARILDI (endi raw input
  tutmaydi), mikro-maydonlar ketgan 3 mode-fayl kirdi (sabab o'sha-o'sha: zich kassa terisi).
- `pos-cart-profit.test.ts` — endi `page.tsx` + `sotuv-mode.tsx` ni BIRGA skanerlaydi (wiring
  ikkala tomonda ham qulflangan; `?? 0n` taqiqi ikkalasiga tegishli).
- `pos-refund-payout.test.ts` — skaner yo'li `cheklar-mode.tsx` ga ko'chirildi (qaytarish o'sha yerda).
- O'zgarMAGAN qo'riqchilar (tekshirildi): `pos-payment-contract` (post-chaqiruv sahifada),
  `pos-cash-out-wiring`, `pos-debt-payment-wiring` (dialog-wiring sahifada), `pos-shell-height`
  (root sahifada), `shared-api-contracts` (CurrentSession importi sahifada).

## Gate natijalari (har commit oldidan to'liq; oxirgisi — F1.5 da)

- `pnpm typecheck` — 0 xato (10/10 task).
- `pnpm lint:product` — 0 error (1053 warning — siyosat bo'yicha ruxsat, F1'gacha ham shu edi).
- `pnpm i18n:gate` — 19/19 yashil.
- `pnpm --filter @moysklad/web test` — **272 fayl, 3876 passed / 26 skipped** — F1'dan OLDINGI
  baseline bilan AYNAN bir xil son. **166/166 sotuv-test (shu jumladan MK32 characterization
  to'plami) BIRORTA testga tegmasdan yashil** — testlar faqat `SotuvPage` default-exportini
  render qiladi, ichki qayta-tuzilishni sezmadi.

## Ko'z-tekshiruv (1.6 — lokal dev, Playwright-brauzer)

`pnpm dev` stack (web :3100 shu worktree'dan, api :4000 shu sessiyada ko'tarildi, DB
`climart_adopt@5432`), admin@demo.local bilan, OCHIQ smena mavjud holatda:

- Savat: tovar bosildi → qator qo'shildi (±, soni, narx-tugma, summa), jami 50 000, badge «1»,
  «Tozalash» chiqdi, ikkala sotish tugmasi faollashdi. ✓
- Jarayonda: 2 chek, «Bekor qilish»/«Tasdiqlash» tugmalari. ✓ · Tayyor: 1 chek, «To'lov». ✓
- Zakazlar: filtr-chiplar + 3 zakaz; detal ochildi (pozitsiya, rezerv, «Tasdiqlash»). ✓
- Cheklar: qidiruv-maydon + 5 chek; detal ochildi (kassir/do'kon, chegirmali qator «−10%», jami). ✓
- Mijozlar: tab ochildi, xatosiz. · Smena: sessiya-info, Z-hisobot yo'llari, kirim/chiqim
  (drawer ochildi, tasdiqlash summasiz o'chiq — eski xulq), mijoz kartasi/qarz/RKO tugmalari,
  «Smenani yopish» bo'limi. ✓
- Brauzer konsolida **0 xato**.

## O'LCHANMAGAN (halollik)

- Qurilmada (sensorli monoblok, kassa .exe qobig'i) sinov YO'Q — F9.
- Chop yo'llari (chek/Z-hisobot/yig'ish varaqasi) runtime'da bosilmadi — faqat testlar.
- To'lov oqimi oxirigacha yurgizilmadi (chek yopish/qaytarish server-amali bajarilmadi) — mavjud
  xulq testlarda qulflangan, lekin bu sessiyada jonli o'tkazilmadi.
- Smena yopish serverga yuborilmadi (ochiq smena atayin buzilmadi).
- CFD (mijoz-ekran) oynasi ochilmadi.

## Chala qolgan ishlar / keyingi agentlarga ogohlantirishlar

1. **CHALA EMAS, ATAYLAB:** tab-bar, CFD-satr, `OpenShiftForm`, dialoglar, barcha so'rov/mutatsiya
   sahifada — F2 sidebar/header qurayotganda shularni almashtiradi/ko'chiradi.
2. `page.tsx` 1607 qator (mo'ljal 800–1200 edan katta) — F2 tab-bar'ni olib tashlaganda yana
   ~110 qator ketadi; qolgani so'rov/mutatsiya massasi, uni ko'chirish F1 taqiqi edi.
3. `pos-types.ts` va `use-print-outcome.ts` — rejada yo'q, lekin zarur ulashma fayllar. F2+
   agentlari yangi ulashma tip/hookni SHU fayllarga qo'shsin (yangi «umumiy» fayl ochmasin).
4. Yangi POS-fayl yaratsangiz: `pos-i18n-guard` POS_FILES, `i18n-no-hardcoded` POS_DONE_FILES,
   (raw input bo'lsa) `raw-element-conventions` EXEMPT ro'yxatlariga qo'shish MAJBURIY — aks holda
   yangi fayl qo'riqchidan tashqarida qoladi yoki gate yiqiladi.
5. `t(\`orders_filter_…\`)` dinamik kalitlari (2 dona, zakazlar-mode'da) — `pos-i18n-guard`
   dinamik-shift chegarasi ≤3; yangi dinamik kalit qo'shishdan oldin o'ylang.
6. `docs/progress.json` har commit'da pre-commit hook tomonidan avtomatik yangilanib commit'ga
   qo'shiladi (timestamp) — bu begona fayl EMAS, mexanizm shunday.
7. Lokal ko'z-tekshiruv uchun: web :3100 allaqachon shu worktree'dan ishlab turgan edi; api
   :4000 ni men ko'tarib, ish oxirida TO'XTATDIM (sessiya-boshi holatiga qaytarildi).

## Takliflar (YAGNI — bajarilmadi, faqat qayd)

- `SaleDetail`/`ChekDetailData` tiplari `@moysklad/contracts` ga ko'chirilsa provenance mustahkam
  bo'lardi (hozircha sahifa-lokal proyeksiya, F1 qamroviga kirmadi).
