# Demand `/new` — QISM 1A (vizual mos) audit

> **Sub-project:** «Отгрузки» to'liq 1:1 · **QISM 1A** (yaratish sahifasi — vizual mos).
> **Status:** ✅ **1A vizual-VERIFIED** (browser-cert `:3100` uz-locale vs moysklad `demand-03-new.png`).
> Manba: `docs/audits/demands-live-2026-07-23/` (`_new-visual-delta.md` delta ro'yxati).
> Reja: `docs/superpowers/plans/2026-07-23-demand-new-1to1.md` · ROADMAP `…-ROADMAP.md`.
> Fayl: `apps/web/src/app/(app)/demands/new/page.tsx` (yagona o'zgargan fayl).

## Nima qilindi (1A checklist — hammasi ✅)

Demand `/new` moysklad'ning **customer-order/new** namunasiga keltirildi (o'sha sahifa allaqachon
to'liq 3-ustunli grid + Статус popup + «Не оплачено» pill'ni qo'llaydi):

1. **3-ustunli ixcham meta-grid** (tab'lar USTIDA, doim ko'rinadi) — eski `DocumentMetaPanel`/
   `DocumentMetaRow` (2-ustun keng) o'rniga qo'lda yig'ilgan grid (`grid-cols-[auto_190_auto_190]`
   + o'ng ustun `[auto_280]`), customer-order metaPanel bilan bir xil:
   - **Chap:** Организация (+`Перечисление`/hisob subRow) · Контрагент · Проект · Валюта документа
   - **O'rta:** Склад · Договор · Канал продаж
   - **O'ng (keng):** Адрес доставки · Комментарий
2. **Адрес доставки + Комментарий → o'ng-tepа ustunga** (`Textarea`, moysklad kabi). Izoh endi
   ham meta-o'ngда, ham pastда (bitta `description` state'ga bog'langan — moysklad ikki-Комментарий
   ko'rinishi).
3. **«Не оплачено» to'lov-pill** header'да (`paymentLabel={tDetailHeader('not_paid')}`) +
   **«Статус» rangli-kvadrat popup** hisob-custom-state'lardan (`/states?entityType=demand`); demand'да
   seed-state yo'q → kulrang «Статус» (moysklad-parity). Status dekorativ (create-schema `statusId`
   qabul qilmaydi → yuborilmaydi).
4. **«Другие поля» → tepа inline-havola** (metaPanel'dan keyin, tab'lar oldida) — eski pastdagi katta
   panel o'rniga. Ичida: план-sanalar (Rejadagi jo'natish / to'lov — moysklad top-formasида yo'q edi →
   bu yerga ko'chirildi) · shipping 10 maydon · накладные расходы · внешний код.
5. **Pozitsiya sarlavha i18n RU-leak TUZATILDI** — har kolonkaga aniq `label` (tCols/tPos) berildi
   (avval PositionTable RU `DEFAULT_LABELS`ga tushib uz-locale'да ruscha chiqarardi). Ortiqcha
   kolonkalar olib tashlandi (`# index`, `image`, `Уп.`/goodPack, `Сумма НДС`/vatAmount) — endi:
   Наименование · Кол-во · Цена · НДС · Скидка · Сумма.
6. **«Цена включает НДС» default = CHECKED** (`vatIncluded` useState(false)→(true)) — capture
   `demand-03-new` default'ига mos (ikkala НДС checkbox belgili).

## Gate (commit-nuqta)
- **typecheck:** web = 0 ✅
- **biome:** `demands/new/page.tsx` = 0 ✅
- **i18n key-existence (ru+uz):** ishlatilgan barcha kalitlar mavjud ✅ (i18n-key-existence.test PASS)
- **demand testlar:** `components/demands/*` + `demands-payment-chip` = 111 PASS, regress YO'Q ✅
- **⚠️ pre-existing (MENING o'zgarishimga aloqasiz):** `i18n-no-hardcoded` — `labels/print/page.tsx`
  (HEAD'да commit qilingan, men tegmaganman; report'да demand/new'дан 0 qator) · `label-grounding`
  ENOENT — `docs/moysklad-reference/*` capture fayllari bu mashinada yo'q (gitignored PII, migratsiya
  chegarasi). Ikkalasi ham demand'га bog'liq emas.

## Browser-cert (Playwright MCP, uz-locale, `admin@demo.local`)
`:3100/demands/new` full-page screenshot moysklad `demand-03-new.png` yoniga qo'yildi → **core layout
ko'rinadigan farqsiz** (header pill+status, 3-ustun grid, o'ng address/izoh, tepа «Другие поля», uz
pozitsiya sarlavhalari, VAT-default belgili). Artefaktlar: `docs/audits/demands-live-2026-07-23/
our-new-1A-full.png` (gitignored).

## Qolgan deltalar (1A EMAS — reja bo'yicha keyingi qismlarga)
- **Pozitsiya kolonka: Остаток + Себест. единицы** (jonli qoldiq + cost/unit) → **QISM 1B** (pozitsiya
  state'ni buyPrice/stock bilan kengaytirish).
- **Прибыль qatori** (totals'да, hozir «Кол-во: 0») → **QISM 1B** (C3; create-COGS state).
- **Ячейка (bin) kolonka** → **QISM 1B** (`{key:'cell'}`).
- **Маркировка kolonka** → **QISM 4** (DS'da yangi ustun-turi, cross-page).
- **«Грузоотправитель» blok-sarlavha** shipping maydonlar ustida → **QISM 1B** (custom-attrs bilan).
- **«Перечисление» subfield aniq semantikasi** (moysklad'да to'lov-turi labeli; bizda hisob-picker) —
  grounding-gated, aniqlanadi.
- **Totals labellari uz-locale'да ruscha** («Промежуточный итог»/«НДС»/…) — bu **shared
  DocumentTotalsPanel** xulqi (customer-order'да ham bir xil), 1A kiritmagan; alohida DS i18n ishi.

**HALOL yorliq:** QISM 1A = **vizual-verified**. «100% 1:1» YO'Q — u faqat QISM 5 (Phase-2 QA) tugagach.
