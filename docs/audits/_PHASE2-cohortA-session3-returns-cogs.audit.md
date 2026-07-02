# Phase-2 — Cohort A Session-3 (Hujjat-detail demo-bo'sh 6) + Returns-COGS HIGH fix

**Sana:** 2026-06-10c (Session-3, lokal Opus, ultracode)
**Cohort A yakuni:** Session-2 (seed-bor 7) + **Session-3 (demo-bo'sh 6)** → Cohort A to'liq → **Phase-2 7/7 (100%)**.
**Metod:** «ikki yarim» — A-battery (6-agent API-adversarial fan-out, `wf_e174dcc1-a60`) → har confirmed delta operator
ground-truth → B-battery browser (Playwright MCP, serial) → fix issiq kontekstda → guard → commit.

Sahifalar: payments-out · invoices-in · invoices-out · sales-returns · purchase-returns · purchase-orders.
**A-battery: 6/6 standart battery PASS** (create→GET-include→null-clear edit→FSM+History i18n→money-math→cleanup,
har biriga 4-6 adversarial extra). **B-battery: 6/6 browser TOZA.**

---

## 🔴 FLAGSHIP — Returns COGS HIGH (sales-return + purchase-return), data-integrity

**Bug-class:** Loss COGS=0 (`3add5a13`, Session-1) ning to'g'ridan-to'g'ri singlisi; Phase-1 ikkala sahifani ham
«toza» degan. Ikkala return `post()`'i stock harakatini **SOTUV / HUJJAT narxida** (`priceAfterDisc`) baholardi,
goods'ning **tannarxida (carrying cost) EMAS** → posted return `Stock.costBalanceMinor`'ni drift qildi:

- **sales-return** (goods RE-ENTER): qiymatni **margin** (sotuv − tannarx) × qty ga shishirdi → har qaytarishda
  ombor weighted-average yuqoriga sudraladi.
- **purchase-return** (goods LEAVE): qiymatni hujjat narxida olib tashladi (narx ≠ tannarx) → `costBalanceMinor`'ni
  buzadi, hatto manfiyga ham olib borishi mumkin.

**Runtime-proof (before vs after, jonli API + DB):** enter 10 @ 50000 (avg 50000) →
- **SR** qty2 @ sotuv 80000 → `costBalanceMinor` **600000** (weighted-avg, +100000), 660000 (narx-asosli) EMAS;
  avg **o'zgarmadi** (50000) — margin drift YO'Q.
- **PR** qty2 @ doc 15000 → `costBalanceMinor` **400000** (weighted-avg, −100000), 470000 EMAS.
- Ikkala **unpost** ham aniq baseline'ga (500000) qaytdi (cost zero-sum). Cleanup → pre-chain stock.

**Fix (Loss konvensiyasini mirror — `3add5a13`):**
- `post()` cost basis'ni qulflangan Stock balance'ning **weighted-average** birlik narxidan oladi
  (`costBalanceMinor ÷ qty-on-hand` via `computePerUnitCost`, demand/fifo-consumer'dan — Loss bilan bir xil helper).
- Yangi `*ReturnPosition.costMinor` ustuni (migration `20260610100000_add_return_cost_minor`, additive nullable) —
  post-time'da per-unit cost **muzlatiladi**; `unpost()`/`cancel()` o'sha muzlatilgan `p.costMinor`'ni teskari
  qiladi → **post↔unpost cost zero-sum**.
- sales-return `post()`'ga `lockBalances` o'qish qo'shildi (oldin o'qimasdi — goods re-enter, sufficiency-check
  shart emas, faqat cost basis uchun balans).
- **Migration xavfsizligi tasdiqlandi:** DB'da **0 ta posted return position** bor (3088 SR + 271 PR «posted» =
  position'siz header-only seed artefaktlari → post/unpost bo'sh massivda ishlaydi, stock effekti yo'q) → eski
  posted hujjatlar buzilmaydi, backfill kerak emas. Draft'lar `costMinor=NULL` (to'g'ri — cost post'gacha noma'lum).
- **Cheklov (hujjatlangan, Loss bilan bir xil):** item sotib bo'lingan bo'lsa (qty-on-hand 0) avg noma'lum → 0
  basis; product `buyPrice` fallback = alohida grounding-gated enhancement.

**Guard:** `apps/api/src/modules/sales-return/returns-cogs.test.ts` (+10, ikkala service, post/unpost/cancel,
non-vacuous — eski `priceAfterDisc`→cost pattern qaytib kelmasligini tekshiradi). `loss-cogs.test.ts` izohi
yangilandi (eski «purchase-return NOT in this class» da'vosi noto'g'ri edi → endi ikkalasi ham tuzatilgan).

---

## 🟡 MED — Invoice «Оплачено» raw-minor display (invoices-in + invoices-out)

`[id]/page.tsx` «Оплачено» (payedSumMinor) maydoni **xom minor** (tiyin) ko'rsatardi (`paidBig.toString()`), qo'shni
«Остаток» esa `formatMoney(remainingMinor)` ishlatardi. Qisman-to'langan fakturada to'langan summa **100× oshirilgan**
va formatlanmagan chiqardi (Session-2c Summa-input topilmasining display singlisi; payedSum=0 demo'da niqoblangan —
«0» va «0,00» bir xil ko'rinadi). **Fix:** `formatMoney(paidBig)` (qo'shni balance maydoni bilan simmetrik).
**Browser-tasdiqlandi:** invoices-out «Оплачено» endi «0,00 сум» (formatlangan), Остаток «6 172,64 сум»; invoices-in
«0,00 сум» / «7 914,96 сум». **Guard:** `invoices-paid-display.test.ts` (+6, ikkala sahifa, non-vacuous —
`paidBig.toString()` qaytib kelmaydi).

---

## 🟢 B-battery browser — 6/6 toza (vizual yarim)

| Sahifa | Render | Holat-badge | Pul format | Maxsus |
|---|---|---|---|---|
| sales-returns | ✓ «Xaridordan qaytarish № ВП-2026-00048» | Qoralama | Jami 5 431,96 сум | «Kontragent» label · MoneyInput som (1000/499.99) |
| purchase-returns | ✓ «Ta'minlovchiga qaytarish № ВТ-2026-00042» | Qoralama | Jami 21 280,00 сум | «Kontragent» · MoneyInput 10000 · «Qabul» linkage — |
| invoices-out | ✓ «Xaridorga hisobvaraq № СЧ-2026-00045» | — | **Оплачено 0,00 сум (FIX)** · Остаток 6 172,64 сум | |
| invoices-in | ✓ «Ta'minlovchi hisobvarag'i № СФ-2026-00039» | Qoralama | **Оплачено 0,00 сум (FIX)** · Остаток 7 914,96 сум | |
| payments-out | ✓ «Chiqim to'lov № ПР-2026-00043» | — | **«Summa» MoneyInput 75000 som** (sumMinor 7500000) | Session-2c MoneyInput jonli, 100× hazard yo'q |
| purchase-orders | ✓ «Ta'minlovchi buyurtmasi № ЗК-2026-00042» | Qoralama | totals 8 691,28 / 1 100,10 / 9 791,38 | USD valyuta · MoneyInput 2000.01/876.54 |

Console: faqat zararsiz artefaktlar (favicon 404 + `/auth/refresh` 401 MCP cookie). Crash/real-error YO'Q.

---

## 📋 DEFERRED — confirmed bug-class'lar, grounding-gated yoki product-decision (BLIND-FIX QILINMADI)

A-battery quyidagilarni dalil bilan topdi; har biri ataylab tuzatilmadi (§4/§6 grounding intizomi):

1. **🟡 `name`/`applicable` /new'da jim tashlanadi (5 sahifa: invoices-in/out · sales-returns · purchase-returns ·
   purchase-orders).** /new forma `number={docNumber}` (tahrirlanadigan raqam) + ishlaydigan «Проведено»
   `applicable` toggle ko'rsatadi, lekin `Create*Schema` ikkalasini ham qabul qilmaydi → Zod jim tashlaydi. User
   maxsus raqam yozsa e'tiborga olinmaydi; «Проведено» yoqib saqlasa hujjat **draft** bo'lib yaratiladi
   (silent-intent-loss). **Grounding-gated:** honor-vs-remove = product decision (custom-number uniqueness +
   atomic-numbering `d8c41c5d` bilan; create-and-post = side-effektli feature). moysklad create-form xulqi capture
   kerak. **Tasdiqlangan (browser):** invoices-out/new'da toggle + raqam maydoni haqiqatan ko'rinadi.
2. **🟡 purchase-orders rate-snapshot stale.** Detail PATCH `currency` yuboradi lekin `rateValue` HECH QACHON
   (detail formada rate input yo'q) → draft UZS→USD almashtirsa `rateValue=100000000` (1.0) qoladi → base-currency
   konversiya ~12 650× xato. **Grounding-gated:** fix = currency o'zgarganda rate'ni exchange-rates'dan qayta hisoblash
   (detail formaga rate surface yoki service-side derive) — alohida fokuslangan ish.
3. **🟡 payments-out `moment:null` → epoch 1970.** `z.coerce.date().optional()` `null`'ni `new Date(null)`=epoch ga
   coerce qiladi (rad etmaydi). Hozir FE'dan yetib bo'lmaydi (detail save `moment` yubormaydi), lekin app-wide
   clear-field `|| null` konvensiyasi (`8db6b62c`) uchun **latent landmine**. **Bug-CLASS:** `z.coerce.date()` 36
   schema'da 89× uchraydi. Fokuslangan shared-helper sweep (null'ni rad etuvchi nullable-date).
4. **🟢 qty=0 position qabul qilinadi (5 positions schema).** `^\d+(\.\d{1,6})?$` regex «0»'ni qabul qiladi, o'z
   xato xabari «positive decimal» deydi. FE bloklaydi, raw-API'dan 0-sum hujjat yaratib post qilsa bo'ladi. =
   Session-1'da hujjatlangan butun-loyiha ~13-schema klassi (LOW, alohida regex/refine sweep).
5. **🟢 purchase-return draft supply'ni `supplyId` sifatida qabul qiladi** (`ensureSupply` faqat mavjudlikni
   tekshiradi, from-supply esa posted talab qiladi) — raw-API client qabul qilinmagan goods'ga return bog'lashi
   mumkin. LOW, alohida.
6. **🟢 formatMoney non-UZS suffix.** purchase-orders USD doc money cell'lari «сум» suffiksi bilan (qiymatlar to'g'ri,
   faqat suffiks) — 08o/RS4-display grounding-gated DS klassi (formatMoney `/100` + hardcoded suffiks).

**Foydalanuvchiga so'rov:** #1 (name/applicable) va #2 (rate-snapshot) money/intent-critical MED — moysklad
create-form + non-UZS retail/PO capture'larini bersangiz alohida fokuslangan sessiyada yopamiz.

---

## Gate (TO'LIQ yashil)

- api typecheck 0 · web typecheck 0 · biome 0
- **api Vitest 2828** (+10 returns-cogs, was 2818, 0 regress)
- **web Vitest 1557** (+6 invoices-paid-display, was 1551, 0 regress)
- ds Vitest 127 (tegilmadi)
- Migration `20260610100000_add_return_cost_minor` qo'llandi (dev DB) + client regen
- Hygiene: 6 ZZ-QA-S3 browser draft o'chirildi, 9-modul leftover-sweep TOZA, balanslar neytral (draftlar unposted +
  COGS-proof zanjiri tozalandi); throwaway scriptlar o'chirildi

**Status:** Cohort A to'liq → **Phase-2 = 7/7 cohort (100%)**. Bu **«production-ready» EMAS** (global CLAUDE.md
4-fazali model: Phase-3 staging / Phase-4 rollout boshlanmagan). Grounding-gated 6+ item ochiq (capture kutilmoqda).
