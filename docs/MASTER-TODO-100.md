# MASTER-TODO — 100% gacha to'liq ro'yxat

> **Yozilgan:** 2026-07-27 · **Branch:** `climart-adoption` · **HEAD:** `79b1ff7`
> **Manba:** taxmin EMAS — shu kuni jonli o'lchov (typecheck · 2 to'liq Vitest suite · biome · git · fayl-hisob).
> **Maqsad:** shu fayldagi **157 band** bajarilsa loyiha **100%** bo'ladi (ta'rif §0).
> *(116 → 136 → 150 → 157: uch completeness-tekshiruvdan o'tgan — revizion tarixga qarang.)*
>
> **Ishlatish qoidasi:** har `davom et` sessiyasi shu fayldan **keyingi ochiq bandni** oladi (blok tartibida),
> bajaradi, `[ ]` → `[x]` qiladi va «Bajarildi» ustuniga commit-hash + sana yozadi. `NEXT.md` — sessiya hand-off'i;
> bu fayl — **to'liq scope reestri**. Ikkalasi sinxron turadi.

---

## §0. «100%» ta'rifi (halol chegara)

Loyihaning 4-fazali modeli (`docs/audits/_PHASE2-100-PLAN.md` §0) bo'yicha 100% =

| Faza | Nima | Hozir |
|---|---|---|
| **Phase-1** | Har sahifa strukturaviy to'g'ri (maydon/label/xulq/wiring moysklad bilan mos) | 🟠 `main`'da 63/69; bu branch'da qayta tekshirilmagan |
| **Phase-2** | Runtime correctness — real brauzer + adversarial QA (pul/konkurensiya/edge) | 🔴 bu branch'da 0 |
| **Phase-3** | Vizual pixel-1:1 (o'lcham/rang/shrift/joylashuv) + staging | 🔴 ~5% (1 sahifa) |
| **Phase-4** | Production — monitoring/backup/CI/gradual rollout | 🔴 boshlanmagan |
| **Gate** | typecheck 0 · biome 0 · Vitest 0 fail · e2e yashil | 🔴 133 fail · 601 biome error |

**«Tugadi» deyish sharti** (`CLAUDE.md` §1): har band uchun dalil (test/commit/browser-smoke) ko'rsatilishi shart.
Dalilsiz «done» TAQIQLANGAN.

---

## §0.1. Boshlang'ich holat — o'lchangan raqamlar (2026-07-27)

| O'lcham | Qiymat |
|---|---|
| Kod (TS/TSX, generated'siz) | ~429 000 qator (api 165k · web 244k · packages 20k) |
| Prisma model / migratsiya | 208 / 167 (schema 9 604 qator) |
| Backend modul / controller / endpoint | 115 / 154 / 1 214 |
| Frontend sahifa | 325 (69 `[id]` · 60 `/new` · 78 settings) |
| Test fayl / test | 475 / 6 512 |
| **typecheck** | ✅ **0 xato** (9/9 paket) |
| **API Vitest** | 🔴 **4012 pass / 62 fail** (15 fayl) |
| **Web Vitest** | 🔴 **2364 pass / 71 fail** (29 fayl) |
| **biome check .** | 🔴 **601 error / 1853 warning** |
| i18n kalit | ru 7 641 · uz 7 642 (1 farq) |
| E2E spec | 7 (325 sahifaga) |
| moysklad capture korpusi | 🔴 **0 fayl** (`docs/moysklad-reference/` bo'sh) |

**Umumiy tayyorlik: ~55%** *(tekshiruv №3 dan keyin tuzatildi — hisobotlar kutubxonasi 16/200+ hisobga olindi)*

---

## §0.1b. Ijro jurnali

| Sana | Commit | Bandlar | Natija |
|---|---|---|---|
| 2026-07-28 | `a430879` | **117a · 117b** | Zaiflik **78 → 30** (prod 74 → **22**). Direct bump + 12 tranzitiv override, hammasi bir major ichida |
| 2026-07-28 | `925f512` | **144** | 4 xato-chegarasi + 21 guard test. Oq-ekran bug-class'i yopildi |
| 2026-07-28 | `c60f1fe` | **138 · 139 · 142 · 30** | «KEEP» to'plamidan yo'qolgan 3 sahifa + nav + BE `dayOffset` tiklandi; tiklash paytida **yangi 500-bug** topilib yamaldi (`?dayOffset=1e15` → RangeError) + 8 guard test; ru↔uz **7646 = 7646** |

**Regressiya nazorati:** har commit'dan keyin ikkala to'liq suite yugurtirildi. api **62 fail** va web **71 fail** — ish boshidagi baseline bilan **aynan bir xil** (web'da `+21` yangi o'tgan = qo'shilgan guard). typecheck **9/9** har safar.

---

## §0.2. Bloklar xaritasi

| Blok | Bandlar | Sessiya | Bog'liqlik |
|---|---|---|---|
| [0 — Qarzlarni yopish](#blok-0--qarzlarni-yopish-majburiy-birinchi) | 1–34 | 8–10 | — |
| [1 — Adoption tugatish](#blok-1--adoptionni-haqiqatda-tugatish) | 35–40 | 10–14 | Blok 0 · Sizdan A |
| [2 — Phase-2 runtime QA](#blok-2--phase-2-runtime-qa-bu-branch-uchun-noldan) | 41–50 | 12–16 | Blok 1 |
| [3 — Funksional bo'shliqlar](#blok-3--funksional-boshliqlar) | 51–74 | 25–30 | Blok 0 |
| [4 — HR to'liq](#blok-4--hr-toliq-spec-2-out) | 75–82 | 10–12 | — |
| [5 — yangibolim](#blok-5--yangibolim-moysklad--telegram-tizimi) | 83–89 | 8–10 | Sizdan E |
| [6 — Vizual pixel 1:1](#blok-6--vizual-pixel-11) | 90–98 | 60–75 | Sizdan A |
| [7 — Test qamrovi](#blok-7--test-qamrovi) | 99–104 | 10–12 | Blok 0 |
| [8 — Production-ready](#blok-8--production-ready-phase-34) | 105–116 | 12–15 | Blok 2 |
| [9 — Platforma gigienasi + xavfsizlik](#blok-9--platforma-gigienasi-xavfsizlik-yoqolgan-funksiya) | 117–136 | 12–16 | — |
| [10 — Yo'qolgan route + xato-bardoshlilik](#blok-10--yoqolgan-routelar-xato-bardoshlilik-doc-drift) | 137–150 | 10–14 | — |
| [11 — Loyihaning o'z rejasidan qolgan scope](#blok-11--loyihaning-oz-rejasidan-qolgan-scope) | 151–157 | 65–90 | — |
| **JAMI** | **157 band** | **~242–315 sessiya** | |

**Boshlash tartibi (qat'iy):** ~~`117a/b → 144 → 138 → 139`~~ ✅ **BAJARILDI 2026-07-28** →
**keyingi: `1` (org-account money-critical) → `19` → `20` → `2` → `3`** → `117c`/`154` (Nest+Fastify major) →
`118`/`137` (drop qarori) → qolgan Blok 0 → `35` (capture — sizga bog'liq) → Blok 1 → Blok 2 →
parallel Blok 3/4 va Blok 6 → Blok 7/8/9/10.

---

# BLOK 0 — QARZLARNI YOPISH (MAJBURIY BIRINCHI)

> **Nega birinchi:** 133 test qizil bo'lgani uchun regressiya-himoya qatlami **o'chgan**. Bu blok tugamaguncha
> yozilgan har qanday yangi kod himoyasiz — buzilsa hech kim aytmaydi (testlar allaqachon qizil).
>
> **Sabab-tahlil:** bu faillar tasodifiy emas — climart forkini qabul qilishda Sherset'ning **parity-lock**
> testlari sinib qolgan. Ular climart sahifalari Sherset audit qilgan sahifalar EMASligini ko'rsatadi.

## Qism 0.1 — Web 71 fail (29 fayl)

| # | ☐ | Ish | Dalil (test nomi / fayl) | Og'irlik | Bajarildi |
|---|---|---|---|---|---|
| 1 | [ ] | **`org-account` scope 6 sahifada yo'qolgan** — `organizationId` `/organization-accounts` fetch'iga thread qilinmagan | `org-account-scope.test.ts` × 6: `invoices-in/[id]` · `invoices-out/[id]` · `purchase-orders/[id]` · `purchase-returns/[id]` · `sales-returns/[id]` · `supplies/[id]` | 🔴 **MONEY-CRITICAL** — pul boshqa yuridik shaxsga ketishi mumkin | |
| 2 | [ ] | **FE→BE method/path mos emas** — jimgina 404/405 | `api-contract.test.ts:174` «has no FE→BE method/path mismatch» | 🔴 Saqlash bosiladi, hech narsa bo'lmaydi | |
| 3 | [ ] | **invoices «Оплачено»/«Остаток» xom minor** | `invoices-paid-display.test.ts` × 4 (in + out, `formatMoney(paidBig)`) | 🔴 Summa 100× noto'g'ri | |
| 4 | [ ] | commission-reports sortBy BE enum'da yo'q | `sort-key-parity.test.ts` × 3: `sumMinor` · `rewardSumMinor` · `payedSumMinor` | 🟠 Ustun bosilsa 400 | |
| 5 | [ ] | `products/[id]` ≥3 `<MoneyInput>` yo'q | `money-input-rollout.test.ts` × 3 | 🟠 tiyin/som chalkashligi | |
| 6 | [ ] | demands «Прибыль» COGS gate yo'q (draft'da to'liq daromad) | `document-profit-totals.test.ts` | 🟠 | |
| 7 | [ ] | demands «Не оплачено» badge yo'q (`payedSumMinor`) | `demands-payment-chip.test.ts` | 🟡 | |
| 8 | [ ] | Filter-field parity — 5 fail | `payments-in-filter-fields` (org-account scoped picker) · `payments-out-filter-fields` × 2 · `cash-out-filter-fields` («Статья расходов» yozish yo'li) · `invoices-in-filter-fields` (CatalogPicker modal) | 🟡 | |
| 9 | [ ] | Xom audit slug ru+uz'da sizadi | `use-audit-labels.test.tsx` × 2 | 🟡 History'da `transition:posted` | |
| 10 | [ ] | Status-tone drift — `hr/page.tsx` `hrMessageStatusTone` ishlatmaydi + invoices-in/out `INVOICE_STATE_TONE` override uzatmaydi | `domain-status-tone.test.ts` × 2 · `document-state-tone.test.ts` × 2 | 🟡 | |
| 11 | [ ] | Convention 5 buzilgan — DetailToolbar+DetailHeader juftligi · `products/[id]` kompozitni saqlamagan | `header-conventions.test.ts` × 2 | 🟡 | |
| 12 | [ ] | Registrdan tashqari xom `select/textarea/checkbox/input` | `raw-element-conventions.test.ts` | 🟡 | |
| 13 | [ ] | 5× bulk-actions-dropdown «qator tanlanmaganda disabled» | `assortment` · `projects` · `currencies` · `demands` · `uoms` | 🟡 | |
| 14 | [ ] | DS komponent regressiyalari — 5 fail | `Textarea` px-3 py-2 + 12px (×2) · `PeriodPicker` dd.MM.yyyy · `InlineFilterPanel` Найти disabled · `Pagination` «0-0» total=0 | 🟡 | |
| 15 | [ ] | `CreateRelatedDropdown` → `/purchase-orders/new?available=1` | `create-related-dropdown.test.tsx` | 🟡 | |
| 16 | [ ] | counterparty/[id] Показатели — inline forma bo'lishi kerak, modal emas | `counterparty-activity-widget.test.ts` | 🟡 | |
| 17 | [ ] | `navigation-from-ui` 1 · `i18n-no-hardcoded` (`labels/print/page.tsx`) 1 | 2 fail (i18n biri 2026-07-23 dan turibdi) | 🟡 | |
| 18 | [ ] | 🟠 **`label-grounding` 25 fail — `docs/moysklad-reference/` BO'SH** | 0 fayl tracked; `progress.json.moysklad_reference.captured_modules = 0`. Yiqilgan: 02/03-module invoicein·invoiceout·purchaseorder·supply·salesreturn·purchasereturn·customerorder · 06-module move·enter·loss·inventory·internalorder·stock-report · 07-module cashin·cashout·paymentout · 08-module retailshift · 10-module processing·processingplan·processingprocess·productiontask · 04-module uom · 00-module project · internalorder(detail) · counterparties(detail) | **#35 ga bog'liq** | |

## Qism 0.2 — API 62 fail (15 fayl)

| # | ☐ | Ish | Dalil | Og'irlik | Bajarildi |
|---|---|---|---|---|---|
| 19 | [ ] | **`debt` · `debtpayment` · `debtcardpayment` · `debtreport` entity'lari 3 joyda yo'q** | `permissions-seed-sync.test.ts` × 3 → `packages/db/prisma/seed.ts` (**yagona jonli seeder**) · `permissions.service.ts seedSystemRoles` · `apps/api/src/scripts/topup-role-permissions.ts` | 🔴 Yangi DB'da Qarz bo'limi ruxsatsiz qoladi | |
| 20 | [ ] | **`scopeFromTemplate` funksiyasi yo'q/eksport qilinmagan** | `hr-permission.guard.test.ts` 11 fail (butun fayl) + `debt-permissions.test.ts` 13 fail (butun fayl) + override mexanikasi 2 = **26 test** | 🔴 HR va Qarz RBAC umuman tekshirilmagan | |
| 21 | [ ] | facture test-mock service'dan orqada | `facture-out.service.test.ts` 7 + `facture-in.service.test.ts` 6 → `prisma.client.factureOut/factureIn.findMany is not a function` (schema'da model BOR, mock'da `findMany` yo'q) | 🟠 generateFrom* zanjiri tekshirilmagan | |
| 22 | [ ] | prepayment oilasi — `rows is not iterable` | `prepayment.service.test.ts` 4 + `prepayment-return.service.test.ts` 6 (balans · cap · currency-lock · audit-log) | 🟠 pul-kritik yo'l | |
| 23 | [ ] | PaymentOut clone FK yo'qotadi | `payment-out.service.test.ts` × 3 — `purchaseOrderId` / `invoiceInId` saqlanmayapti | 🟠 nusxalashda ma'lumot yo'qolishi | |
| 24 | [ ] | Product 4 fail | VAT null + `useParentVat` · create audit log · «Доступ» ownerId + cross-tenant FK guard · filter-parity schema | 🟠 | |
| 25 | [ ] | 4 ta **class-lock** sinik | `enter` TOCTOU atomic-claim · `internal-order` groupId stamp (H4) · `PositionTable` 3-dp truncation (`scaleMinorByQty`) · `commission-report` `tashkentRangeBounds` | 🟠 Har biri butun bug-klassni qulflaydi | |
| 26 | [ ] | Hujjat-raqam generator fleet 11 < 31 | `document-number-rollout.test.ts` | 🟡 atomik raqamlash qamrovi | |

## Qism 0.3 — Gate'lar

| # | ☐ | Ish | Dalil | Bajarildi |
|---|---|---|---|---|
| 27 | [ ] | `biome check .` **601 error → 0** | Ko'p qismi `apps/api/scripts/*` (verify-mass-edit-tenant-smoke · verify-payroll-kpi-smoke · migrate-cost-to-base · verify-cost-migration) | |
| 28 | [ ] | Biome siyosatini qat'iylashtirish | `useButtonType` 21 err · `noDelete` 3 err · `noUselessSwitchCase` 1 · `noUnusedVariables` 1 · `noArrayIndexKey` 1 · `noNonNullAssertion` 287 warn · `noConsoleLog` 34 warn — har biriga «fix» yoki «ignore + sabab» qarori yozilsin | |
| 29 | [ ] | **Pre-push hook'ga Vitest qo'shish** | Hozir faqat `turbo run typecheck` bloklaydi → shuning uchun 133 fail sezilmay o'sdi (`.husky/pre-push`) | |
| 30 | [x] | ✅ i18n ru↔uz parity — **7644 = 7644** | ⚠️ **Bu shunchaki hisob farqi emas, REAL BUG edi:** `pages.debts.pay_account` faqat `uz.json`da bor edi, lekin `components/debts/call-outcome-modal.tsx:287` uni ishlatadi → **RU foydalanuvchi xom kalit ko'rardi**. Qo'shildi: `"🏦 Расчётный счёт"` (qo'shni `pay_cash`/`pay_click` uslubida) | 2026-07-28 |

## Qism 0.4 — Hujjat drift

| # | ☐ | Ish | Dalil | Bajarildi |
|---|---|---|---|---|
| 31 | [ ] | `NEXT.md` **36 commit orqada** | Oxirgi yangilanish 2026-07-24 (`b47bfd9`). Yozilmagan: akt-sverka Excel (7 commit) · приёмка ustunlari (4) · yacheyka/oversell · debt-notify opt-in · supply→balans+Telegram | |
| 32 | [ ] | `docs/PARITY-STATUS.md` 2026-06-15, `main` haqida | Bu branch uchun qayta yozish | |
| 33 | [ ] | `docs/progress.json` bu branch realiyasini aks ettirmaydi | `captured_modules: 0` · `phase2: 7/7` (main tarixi) · `detail_pages.audited: 63` (main audit'lari) | |
| 34 | [ ] | `qabullar-amallar-royxati.txt` 162–166 «QO'SHILYAPTI» — aslida commit qilingan | `f82ca64` · `f062006` · `87df197` | |

**Blok 0 hajmi: ~8–10 sessiya**

---

# BLOK 1 — ADOPTION'NI HAQIQATDA TUGATISH

> Adoption «runtime-verified» deb belgilangan (login + 4 sahifa render), lekin **struktur parity qayta
> tekshirilmagan**. NEXT.md o'zi yozadi: «HAR Продажи FE fayli farq qiladi; VPS TO'LIQROQ (demands 1775>1445,
> sales-returns/new 1732>1151)». Ya'ni `main`'dagi 63 detail audit **bu sahifalarga tegishli emas**.

| # | ☐ | Ish | Izoh / dalil | Bajarildi |
|---|---|---|---|---|
| 35 | [ ] | 🔴 **`docs/moysklad-reference/` capture korpusini tiklash** — 22 modul (list + detail) | Hozir 0 fayl (`git ls-files` = 0; main'da atigi 2). **⛔ Foydalanuvchi kerak: moysklad.uz login.** Busiz #18 (25 test), §4 label-grounding intizomi va Blok 6 ning hammasi ishlamaydi | |
| 36 | [ ] | 6 audit qilinmagan detail sahifa | `contracts/[id]` · `debts/[id]` · `factures-in/[id]` · `factures-out/[id]` · `settings/employees/[id]` · `analitika/sozlamalar/rollar/[id]` → 63/69 dan 69/69 | |
| 37 | [ ] | **Phase-1 cohort-audit'ni climart sahifalari uchun qayta yugurtirish** | `scripts/wf-cohort-detail-audit.js` bilan A–L cohortlar. Eng katta band — climart FE fayllarining hammasi Sherset'nikidan farq qiladi | |
| 38 | [ ] | Qarz/SMS/Telegram ekotizimini ruxsat tizimiga to'liq ulash | `lib/access-sections.ts` + `lib/module-permissions.ts` + `PermissionEntity` (#19/#20 ning FE tomoni) | |
| 39 | [ ] | Lokal DB `climart_adopt`@5432 ni migration-tracked qilish | Hozir `db push` bilan sozlangan; `pg_trgm` YO'Q → 4 trgm GIN indeks o'tkazib yuborilgan (xotira: `climart-adopt-local-db-untracked.md`) | |
| 40 | [ ] | Ikki DB kelishuvi — `moysklad_dev`@5433 (Sherset test/QA) vs `climart_adopt`@5432 (adoption) | Yagona qilish yoki chegarani hujjatlash | |

**Blok 1 hajmi: ~10–14 sessiya**

---

# BLOK 2 — PHASE-2 RUNTIME QA (BU BRANCH UCHUN NOLDAN)

> Stack: `pnpm dev` (web :3100 · api :4000) + DB + Playwright MCP. Har cohort: A-battery (API-adversarial) +
> B-battery (real brauzer). Topilgan har bug **shu sessiyada** tuzatiladi (issiq kontekst) + guard test qo'shiladi.

| # | ☐ | Cohort | Sahifalar | Bajarildi |
|---|---|---|---|---|
| 41 | [ ] | **A — Hujjat-detail (13)** | customer-orders · demands · supplies · cash-in · cash-out · moves · payments-in · payments-out · invoices-in · invoices-out · sales-returns · purchase-returns · purchase-orders | |
| 42 | [ ] | **B — Katalog (8)** | counterparties · products · projects · stores · uoms · variants · bundles · services | |
| 43 | [ ] | **C — Ombor + internal (4)** | enters · losses · inventories · internal-orders | |
| 44 | [ ] | **D — Ishlab chiqarish (7)** | processings · processing-orders · productions · production/boms · processes · stages · work-orders | |
| 45 | [ ] | **E — Pul/qaytarish (3)** | prepayments · prepayment-returns · counterparty-adjustments | |
| 46 | [ ] | **F — Chakana (4)** | retail/sales · retail/sessions · retail/z-report · POS registr | |
| 47 | [ ] | **G — CRM (4)** | opportunities · pipelines · contact-persons · tasks | |
| 48 | [ ] | **H — Qarz ekotizimi (yangi, Sherset-kept)** | debts + 7 subroute · akt-sverka Excel (2 varaq) · debt-notify Telegram · SMS shablon | |
| 49 | [ ] | **I — HR davomat yadrosi (6 faza)** | `/hr` dashboard · schedules · departments/positions · employees · monitoring + `[id]` OSM xarita · davomat-notify. **Hech biri browser-QA qilinmagan** (hammasi «Phase-1, browser-smoke YO'Q») | |
| 50 | [ ] | **J — Приёмка to'liq (166 amal)** | Hozirgi fokus bo'limi — 161 mavjud + 5 yangi commit qilingan, hech biri runtime-tasdiqlanmagan | |

**Blok 2 hajmi: ~12–16 sessiya**

---

# BLOK 3 — FUNKSIONAL BO'SHLIQLAR

## Qism 3.1 — Stub sahifalar (6 ta haqiqiy stub)

| # | ☐ | Sahifa | Nima kerak | Qiymat | Bajarildi |
|---|---|---|---|---|---|
| 51 | [ ] | `settings/import` | Excel/CSV import — barcha entity uchun (hozir faqat counterparties + приёмка) | ⭐⭐⭐ | |
| 52 | [ ] | `settings/export` | Excel/CSV eksport — barcha ro'yxat | ⭐⭐⭐ | |
| 53 | [ ] | `settings/tokens` | API token CRUD (`ApiToken` model bor) | ⭐⭐ | |
| 54 | [ ] | `settings/business-processes` | Biznes-jarayon konstruktori | ⭐ | |
| 55 | [ ] | `settings/scenarios` | Сценарии — avtomatlashtirish qoidalari | ⭐ | |
| 56 | [ ] | `settings/delete-account` | Hisobni o'chirish oqimi | ⭐ | |

> Hozir hammasi `pages.settings_stub` + `<EmptyState>` «WIP».

## Qism 3.2 — List-toolbar parity (19/56 → 56/56)

| # | ☐ | Ish | Bajarildi |
|---|---|---|---|
| 57 | [ ] | **38 ro'yxat sahifasiga moysklad toolbar'i.** Hozir bor (19): assortment · counterparties · currencies · customer-orders · demands · enters · inventories · losses · moves · projects · purchase-returns · sales-returns · stores · supplies · uoms (+4 shared reuse).<br>**Yo'q (38):** bundles · calls · cash-in · cash-out · commission-reports · consignments · contact-persons · contracts · counterparty-adjustments · debts · discounts · factures-in · factures-out · internal-orders · invoices-in · invoices-out · loyalty-operations · opportunities · payments-in · payments-out · payrolls · pipelines · prepayment-returns · prepayments · price-lists · price-types · processing-orders · processings · product-folders · productions · products · purchase-orders · serial-numbers · service-requests · services · tasks · tracking-codes · variants | |

## Qism 3.3 — Grounding-gated (⛔ foydalanuvchi capture beradi)

| # | ☐ | Item | Nima kerak | Bajarildi |
|---|---|---|---|---|
| 58 | [ ] | DS `formatMoney` `/100` hardcode → non-2-decimal valyuta hech qayerda ko'rsatilmaydi (JPY kassa) | non-UZS retail kassa capture; DS-wide ish | |
| 59 | [ ] | internal-orders «Целевой склад»→«Склад»? · «План. дата приёмки»? | toza Внутренний-заказ edit-form capture (mavjudi buzuq: `<title>Корзина</title>`) | |
| 60 | [ ] | boms cost-split — «Оплата труда» / «Затраты на производство» | production modul capture (umuman yo'q) | |
| 61 | [ ] | retail drawer «От кого» / «Основание» maydonlari | BE kolonka + `retaildrawercashin` capture | |
| 62 | [ ] | z-report `cashReturnsMinor` / `cardReturnsMinor` ajratib ko'rsatish (fetch qilinadi, render qilinmaydi) | yopiq smena Z-отчёт capture | |
| 63 | [ ] | Приёмка 162–166 tasdiqlash — себест. единицы · себестоимость · Импорт · Маркировка · РНПТ | browser-QA (#50 bilan birga) | |

## Qism 3.4 — Feature-gap va DEFER backlog

| # | ☐ | Ish | Manba | Bajarildi |
|---|---|---|---|---|
| 64 | [ ] | `inventories` — «Дополнить из остатков» + «Дополнить из номенклатуры» | Cohort-B feature-gap; stock-balance integratsiya | |
| 65 | [ ] | **Multi-bin Phase 2** — yacheyka bo'yicha **miqdor** (hozir faqat manzil) | Stock/FIFO'ga tegadi; NEXT.md 2026-07-03 | |
| 66 | [ ] | **`resolveShift` GPS-consumer refactor** — `ping-ingest` · `autocheckout-cron` · `monthly-report` hali eski `EmployeeWorkSchedule` o'qiydi | HR Faza-3 DEFER; nomli jadvalli xodimlarda kech/smena noto'g'ri | |
| 67 | [ ] | Bildirishnoma markazi UI (`Notification` model bor, sahifa yo'q) | — | |
| 68 | [ ] | `opportunities` reopen-control · `tasks` formatDate shared-helper · `opportunities/board` fmtDate NaN-guard | Cohort G DEFER | |
| 69 | [ ] | `bank-account` bankLocation/correspondentAccount maydonlari + currency-change guard (BE) + tax-rate 409-conflict FE map | Cohort K DEFER | |
| 70 | [ ] | Xodim kartasi: permissions/salary subroutes · multi-branch multi-select · foto yuklash · ism/familiya split · mamlakat-kodi · bonus quick-modal · attendance-stats ikonka | Cohort I + HR spec §5.4 DEFER | |
| 71 | [ ] | **`qty=0` qabul qilish** — loyiha bo'ylab ~13 schema klassi (qaror + sweep) | Stock+internal DEFER; ⛔ mahsulot qarori kerak | |
| 72 | [ ] | `agentAccount↔agent` link BE guard · org-account currency↔doc currency match · demand clone revalidation | org-account DEFER | |
| 73 | [ ] | List-page «Сумма от/до» filterlarini MoneyInput'ga (~25 sahifa) | MoneyInput rollout qoldig'i | |
| 74 | [ ] | **Navigation graph audit — 0%** (hech qachon qilinmagan) | `docs/nav-map.html` bor, audit yo'q | |

**Blok 3 hajmi: ~25–30 sessiya**

---

# BLOK 4 — HR TO'LIQ (spec §2 «OUT»)

> Davomat-yadrosi MVP 6/6 tugagan (`docs/superpowers/specs/2026-07-24-hr-timepay-attendance-core-design.md`).
> Quyidagilar o'sha spec'ning «OUT» ro'yxati — har biri alohida spec/faza talab qiladi.

| # | ☐ | Faza | Izoh | Bajarildi |
|---|---|---|---|---|
| 75 | [ ] | **Jarimalar (tiered)** | Bosqichli jarima; hozir faqat `auto_late` config-gated | |
| 76 | [ ] | **Ish-haqi tarif + hisoblash dvigateli** | `HrSalaryConfig` model bor | |
| 77 | [ ] | **Ish-haqi to'lovlari jurnali** | | |
| 78 | [ ] | **Hisobotlar** — oylik statistika + Excel/PDF eksport | | |
| 79 | [ ] | **Qo'shimcha-ish arizalari** — approve/reject oqimi | | |
| 80 | [ ] | **Bayramlar** kalendari (davomat hisobiga ta'sir) | | |
| 81 | [ ] | **Kiosk / Terminal / PIN** rejimi | | |
| 82 | [ ] | **Punch-photo** — schema kolonka + PWA kamera | | |

**Blok 4 hajmi: ~10–12 sessiya**

---

# BLOK 5 — `yangibolim` (MoySklad ↔ Telegram tizimi)

> ⛔ **Avval qaror:** bu modul haqiqatan kerakmi yoki mavjud HR/Telegram bilan ustma-ust tushadimi?
> Manba tizim: `moy.biznesjon.uz` — FastAPI + React, 14 sahifa · 17 router · 14 xizmat · 13 model · 209 test · ~25k qator.
> Spec'lar tayyor: `yangibolim/spec/{00-MASTER,01-backend-core-domain,02-backend-integration-finance,03-frontend-operational,04-frontend-finance-config-shell}.md`

| # | ☐ | Ish | Bajarildi |
|---|---|---|---|
| 83 | [ ] | Backend core domain port (spec 01) — NestJS + Prisma'ga | |
| 84 | [ ] | Backend integration + finance port (spec 02) | |
| 85 | [ ] | Frontend operational port (spec 03) | |
| 86 | [ ] | Frontend finance/config/shell port (spec 04) | |
| 87 | [ ] | WebSocket real-time qatlami | |
| 88 | [ ] | APScheduler cron'larini NestJS scheduler'ga ko'chirish | |
| 89 | [ ] | «To'rt ko'z» vazifa tasdiqlash oqimi + avtomat bonus/jarima | |

**Blok 5 hajmi: ~8–10 sessiya**

---

# BLOK 6 — VIZUAL PIXEL 1:1

> **Loyihaning e'lon qilingan asosiy maqsadi** — «o'lcham/rang/shrift/joylashuv/filter/tugma/modal/xulq moysklad
> bilan farqsiz». Hozir **1 sahifa** tugagan (customer-order `/new`, ~90%). Bu blok qolgan ishning ~40%i.
> ⛔ Butunlay `#35` (capture korpusi) ga bog'liq.

| # | ☐ | Ish | Hajm | Bajarildi |
|---|---|---|---|---|
| 90 | [ ] | **Design-token bazasini moysklad'dan to'liq ekstraksiya** — rang · shrift · zichlik · border · radius · soya · z-index · spacing shkalasi | 1 poydevor sessiya | |
| 91 | [ ] | customer-order `/new` paketini **60 ta `/new` formaga** yoyish | ~15 sessiya | |
| 92 | [ ] | **69 detail sahifa** pixel-parity | ~18 sessiya | |
| 93 | [ ] | **70 list sahifa** pixel-parity (#57 toolbar bilan birga) | ~15 sessiya | |
| 94 | [ ] | **100+ modal** pixel-parity (hozir ~8 modul tekshirilgan) | ~8 sessiya | |
| 95 | [ ] | **78 settings sahifa** pixel-parity | ~10 sessiya | |
| 96 | [ ] | Print/PDF formalarini moysklad shabloniga | ~4 sessiya | |
| 97 | [ ] | Bosh sahifa + dashboard widget'lari | ~2 sessiya | |
| 98 | [ ] | Har sahifaga overlay-diff sertifikatsiya (sub-piksel) | doimiy | |

**Blok 6 hajmi: ~60–75 sessiya**

> **💡 Scope qarori (sizniki):** agar «pixel 1:1» o'rniga «funksional 1:1 + zamonaviy toza dizayn» qabul qilinsa,
> bu blok ~60–75 dan **~15–20 sessiyaga** tushadi va jami loyiha **~95–120 sessiya** bo'ladi.

---

# BLOK 7 — TEST QAMROVI

| # | ☐ | Ish | Hozir | Bajarildi |
|---|---|---|---|---|
| 99 | [ ] | E2E spec — har cohort uchun kamida 1 ta | 7 spec / 325 sahifa (~5%) | |
| 100 | [ ] | Visual-regression snapshot — har pixel-parity qilingan sahifaga | 1 spec | |
| 101 | [ ] | FE→BE contract test'ni to'liq qilish (#2 bilan) | 1 test, qizil | |
| 102 | [ ] | Load / performance test (1214 endpoint) | yo'q | |
| 103 | [ ] | Money-invariant property test'lari — COGS · balans · valyuta · tiyin | qisman | |
| 104 | [ ] | Optimistic-lock + concurrency jonli battery'ni CI'ga ulash | qo'lda script (`verify-optimistic-lock-smoke.mjs`) | |

**Blok 7 hajmi: ~10–12 sessiya**

---

# BLOK 8 — PRODUCTION-READY (Phase 3/4 — hech qachon boshlanmagan)

| # | ☐ | Ish | Izoh | Bajarildi |
|---|---|---|---|---|
| 105 | [ ] | **CI/CD** — GitHub Actions: typecheck + biome + Vitest + build har PR'da | Hozir hammasi qo'lda; faqat Husky pre-push typecheck | |
| 106 | [ ] | **Staging muhit** (Phase 3) — prod nusxasi bilan | | |
| 107 | [ ] | **Monitoring** — Sentry/error tracking + APM + uptime | | |
| 108 | [ ] | Strukturaviy log + agregatsiya | `observability.ts` bazaviy | |
| 109 | [ ] | **DB backup avtomatlashtirish** + restore mashqi | Hozir qo'lda `pg_dump` | |
| 110 | [ ] | Deploy skriptini mustahkamlash | Ma'lum gotcha: `git fetch`siz `reset --hard origin/main` eski keshlangan ref'ga tushadi | |
| 111 | [ ] | **Xavfsizlik auditi** — RLS · RBAC · JWT/refresh · rate-limit · secret rotatsiya · webhook signature | | |
| 112 | [ ] | **Ma'lumot migratsiya strategiyasi** — real MoySklad → Sherset | Production'da 4477 mahsulot bor, **0 kontragent** (⛔ sizdan ma'lumot kerak) | |
| 113 | [ ] | Yuklama testi + DB indeks optimizatsiyasi | 4 `pg_trgm` GIN indeks hali qo'llanmagan (#39) | |
| 114 | [ ] | **Runbook** — incident · rollback · migration · restore protsedurasi | | |
| 115 | [ ] | Foydalanuvchi hujjati + o'quv materiali | `TIZIM-QOLLANMA.md` faqat analitika bo'limini qoplaydi | |
| 116 | [ ] | Phase-4 gradual rollout — feature-flag + kanareyka | | |

**Blok 8 hajmi: ~12–15 sessiya**

---

# BLOK 9 — PLATFORMA GIGIENASI, XAVFSIZLIK, YO'QOLGAN FUNKSIYA

> **Bu blok 2026-07-27 completeness-tekshiruvida qo'shildi** — birinchi 116 bandli ro'yxatda bular yo'q edi.
> Sabab: ro'yxat ilova-funksiyasiga qaraган, platforma/infra/repo qatlami tekshirilmagan edi.

## Qism 9.1 — Xavfsizlik (🔴 eng shoshilinch band shu blokda)

| # | ☐ | Ish | Dalil | Og'irlik | Bajarildi |
|---|---|---|---|---|---|
| 117a | [x] | ✅ **Direct dependency bump'lar (major o'zgarmagan)** | `next` 15.1→15.5.21 (web+marketing: **Middleware/Proxy bypass** + DoS) · `next-intl` 4.9.1→4.9.2 · `ws` 8.18→8.21 · `postcss` 8.5.0→8.5.18 · `nodemailer` 8.0.6→8.0.9 · `turbo` 2.3.3→2.9.14. Natija **78 → 55** (prod 74 → 45) | 🔴 | 2026-07-28 |
| 117b | [x] | ✅ **Tranzitiv `pnpm.overrides`** | `brace-expansion@{1,2,5}` · `fast-uri@{2,3}` · `js-yaml@4` · `lodash@4` · `postcss@8` · `sharp@0` · `ws@8` · `@opentelemetry/core@2` · `@babel/core@7` — hammasi **bir xil major ichida** (API buzilmaydi). Natija **55 → 30** (prod 45 → **22**) | 🔴 | 2026-07-28 |
| 117c | [ ] | 🔴 **Qolgan 30 zaiflik — MAJOR upgrade talab qiladi** (= #154) | ⚠️ **Tasdiqlandi: CVE'lar REAL** — `apps/api/src/main.ts:32` `FastifyAdapter` ishlatadi, ya'ni middleware-bypass = **auth guard'ni chetlab o'tish**. Fastify 4 EOL → patch faqat **>=5.7.2** da. Kerak: `fastify` 4→5 · `@nestjs/*` 10→11 · `@fastify/middie` · `find-my-way` · `nodemailer` 8→9 · (dev) `happy-dom` 15→20 · `vitest` 2→3 · `vite` 5→6 · `esbuild` · `uuid` 8→11 · `file-type` 20→21 | 🔴 **Eng shoshilinch qolgan band** | |
| 118 | [ ] | 🔴 **QAROR: 6 bo'lim DROP qilingan — qaytariladimi?** | Bu branch'da YO'Q: `sotuv` · `omborchi` · `restock-tasks` · `replenishment` · `cell` · `sklad-keeper`. `main`'da bu **jonli production feature** edi: Приёмка post → omborchiga avtomat joylashtirish topshirig'i + QR-checklist + notification + printerli keeper (2 ta, 4477/4477 mahsulotda loc bor) | 🔴 Funksional regressiya yoki rasmiy bekor qilish | |
| 119 | [ ] | Webhook/integratsiya jonli sinovi | 1214 endpointdan qaysilari haqiqatan tashqi tizim bilan sinalgan: Payme · Click · EDO · Marking (Честный знак) · 1C · marketplace · bank API | 🟠 | |
| 120 | [ ] | `moysklad-sync` + `moysklad-compat` jonli MS API sinovi | Production'da import faqat fayl-eksportdan bo'lgan, **0 kontragent** kelgan | 🟠 | |

## Qism 9.2 — Buzuq/eskirgan infratuzilma

| # | ☐ | Ish | Dalil | Bajarildi |
|---|---|---|---|---|
| 121 | [ ] | **Buzuq skriptlar** — `pnpm codegen:prisma` / `pnpm codegen:zod` | `packages/codegen` **YO'Q** (`--filter @moysklad/codegen` hech narsaga tushmaydi) | |
| 122 | [ ] | **`CLAUDE.md` §5 loyiha xaritasi eskirgan** — 3 stale yozuv | `desktop/` YO'Q · `tools/print-agent` YO'Q · `packages/codegen` YO'Q (xaritada uchalasi ham bor deb yozilgan) | |
| 123 | [ ] | **Print agent yo'qolgan** (`tools/print-agent`) | `print-template` moduli + `lib/print-agent.ts` bor, **Windows agent (.ps1/.bat) yo'q** → VPS'da chop etish oqimi qanday yopiladi? | |
| 124 | [ ] | `apps/marketing` — alohida marketing sayti | Holati / deploy / kontent aniqlanmagan; typecheck'da qatnashadi | |
| 125 | [ ] | `packages/workflows` — FSM + data-model validatori CI'ga ulanmagan | `pnpm validate:all` mavjud, hech qayerda avtomat chaqirilmaydi | |
| 126 | [ ] | `docs/perf/db-tuning.sql` qo'llanganmi? `PERFORMANCE-REPORT.md` yangilanmagan | 4 `pg_trgm` GIN indeks ham hali yo'q (#39) | |

## Qism 9.3 — Repo gigienasi

| # | ☐ | Ish | Dalil | Bajarildi |
|---|---|---|---|---|
| 127 | [ ] | Repo axlatini tozalash / arxivlash | `moysklad_backup/` **26 MB** · `audit/` **8.3 MB** · `scratchpad/` · root'da `timepay1-3.mp4` + `*.xlsx` + `SAYT-PROMPT.txt` + `qabullar-amallar-royxati.txt` (ikkalasi untracked) | |
| 128 | [ ] | ~20 Python codemod skript graveyard | `tools/*.py` — apply-* · wire-* · fix-* · audit-* : tozalash yoki «bir-martalik» deb hujjatlash | |
| 129 | [ ] | `scripts/` graveyard | `cert-*.mjs` · `ground-*.mjs` · `verify-*` bir-martalik sertifikatsiya skriptlari | |
| 130 | [ ] | **ADR yozish** — adoption/climart qarori uchun | 6 ADR bor (`docs/adr/0001..0006`), climart-adoption strategiyasi hujjatlanmagan | |

## Qism 9.4 — To'ldirilmagan mahsulot qatlamlari

| # | ☐ | Ish | Dalil | Bajarildi |
|---|---|---|---|---|
| 131 | [ ] | **a11y tizimli audit** | `useButtonType` 21 biome error · `tools/audit-aria.py` + `aria-snapshot.spec.ts` bor, lekin tizimli o'tish yo'q | |
| 132 | [ ] | Onboarding + Help kontenti | `OnboardingProgress` + `HelpArticle` model bor · `getting-started` + `help/purchases` sahifa bor — **kontent to'ldirilganmi?** | |
| 133 | [ ] | Email shablonlari + `EmailConfig` jonli sinov | `EmailLog` model bor; jonli yuborish tasdiqlanmagan | |
| 134 | [ ] | **Multi-tenant qarori** — SaaS'mi yoki single-tenant? | `Account` model + RLS + `subscription` sahifa bor, lekin sahifa «self-hosted install has no billing» deb yozilgan. `ADR-0003 multi-tenancy` bilan solishtirilsin | |
| 135 | [ ] | Til qamrovi — faqat `ru` + `uz`. `en` kerakmi? | `apps/web/src/messages/` da 2 fayl | |
| 136 | [ ] | `korzina` (savat/trash) to'liqligi | Soft-delete → restore oqimi barcha entity'ni qoplaydimi | |

**Blok 9 hajmi: ~12–16 sessiya**

---

# BLOK 10 — YO'QOLGAN ROUTE'LAR, XATO-BARDOSHLILIK, DOC-DRIFT

> **Bu blok ikkinchi completeness-tekshiruvida qo'shildi (2026-07-27).** Sabab: Blok 9 ni qo'shganda 2 ta
> yo'qolgan feature'ni **tasodifan** topdim → shundan keyin `main` ↔ `climart-adoption` route-diff'ini **tizimli**
> chiqardim va **19 ta yo'qolgan route** aniqlandi (deklaratsiya qilingan 6 ta drop emas).

## Qism 10.1 — 🔴 Adoption'da YO'QOLGAN 19 route (tizimli diff natijasi)

`git ls-tree main` ↔ `find` diff: **main 310 route · branch 325 route · 19 yo'qolgan · 33 yangi**

### (a) Deklaratsiya qilingan drop (NEXT.md'da yozilgan — #118 qarori kutmoqda)

| # | ☐ | Route | Bajarildi |
|---|---|---|---|
| 137 | [ ] | `sotuv` · `omborchi` · `restock-tasks` + `[id]` · `replenishment` · `cell` + `[code]` — 7 route | |

### (b) 🔴 DEKLARATSIYA QILINMAGAN — tasodifan yo'qolgan (adoption bug)

| # | ☐ | Route | Nega muhim | Bajarildi |
|---|---|---|---|---|
| 138 | [x] | ✅ **`settings/sms` + `settings/sms/templates` TIKLANDI** | 2 sahifa + `lib/sms-segments.ts` util + **settings-sidebar'dagi 2 nav yozuvi** (ular ham yo'qolgan edi) + `pages.settings_sidebar.{sms,sms_templates}` kalitlari ru+uz. BE (17 fayl) allaqachon joyida edi, faqat kirish nuqtalari yo'q edi | 2026-07-28 |
| 139 | [x] | ✅ **`debts/calls/tomorrow` TIKLANDI** | Sahifa + `debts/page.tsx` tab havolasi + `pages.debts.{tab_calls_tomorrow,empty_calls_tomorrow}` ru+uz. **BE ham yamalgan** (#142 tasdig'i): `dayOffsetIso()` helper + `todayCalls(dayOffset)` + controller `?dayOffset=` — bular ham yo'qolgan edi. Pagination `showPageNumbers`/`onPage` proplari bu branch DS'ida yo'q → qo'shni `debts/page.tsx` uslubiga moslandi | 2026-07-28 |
| 139b | [ ] | 🟠 **Follow-up: `todayCalls` xulq-farqlari ATAYLAB ko'chirilmadi** | Main'da yana 2 farq bor va ular **mavjud `/debts/calls` xulqini o'zgartiradi** → QA'siz kiritilmadi: (1) `includeOverdue` default `true`→`false`; (2) «qo'ng'iroq QILINGANLAR ro'yxatdan chiqadi» filtri (`lastCallAt >= nextContactAt`, main'da 2026-07-27 talabi). Qaysi xulq to'g'ri — foydalanuvchi qarori | |
| 140 | [ ] | `settings/smena` + `/[id]` + `/new` · `settings/shift-schedules` | Smena/ish-grafigi sozlamalari (4 route) — HR davomat bilan bog'liq bo'lishi mumkin | |
| 141 | [ ] | `settings/sklad-keepers` · `stores/cell-labels` · `reports/warehouse-ops` · `scan/[id]` | Ombor operatsion qatlami (4 route) — #137 bilan bir oilada, lekin alohida qaror kerak | |
| 142 | [ ] | **Yo'qolgan route'lar uchun BE endpoint yetimmi?** — har biri uchun tekshirish: backend moduli qoldi, controller ochiqmi, xavfsizmi | | |

## Qism 10.2 — 🟠 33 yangi climart route — hech qachon audit qilinmagan

| # | ☐ | Ish | Ro'yxat | Bajarildi |
|---|---|---|---|---|
| 143 | [ ] | **33 climart route'ni Phase-1 audit'ga kiritish** (hozir hech biri `progress.json` `audited` ro'yxatida yo'q) | `bulk-edit` · `commission-reports/new` · `commission-reports/new-in` · `hr/departments` · `hr/monitoring` + `[employeeId]` · `hr/positions` + `[id]/employees` · `hr/schedules` · `hr/settings/notify` · `scan` · `settings/all` · `settings/business-processes` · `settings/commission-report-statuses` · `settings/company` · `settings/countries` · `settings/delete-account` · `settings/demand-statuses` · `settings/employees` + `[id]` + `new` · `settings/export` · `settings/import` · `settings/invoice-out-statuses` · `settings/purchase-return-statuses` · `settings/sales-channels` · `settings/sales-return-statuses` · `settings/scenarios` · `settings/supply-statuses` · `settings/tokens` · `specialoffers` · `stores/new` · `subscription` | |

## Qism 10.3 — 🔴 Xato-bardoshlilik (butun ilovada YO'Q)

| # | ☐ | Ish | Dalil | Og'irlik | Bajarildi |
|---|---|---|---|---|---|
| 144 | [x] | ✅ **Xato-chegaralari QO'SHILDI** | 4 yangi fayl: `(app)/error.tsx` (i18n, reset + «Bosh sahifa» + `error.digest`) · `(app)/not-found.tsx` · `app/not-found.tsx` · `app/global-error.tsx` (provider'siz — `NEXT_LOCALE` cookie'dan til, `GLOBAL_ERROR_STRINGS` mirror). **Guard:** `__tests__/error-boundaries.test.ts` **21 test** — mavjudlik + `data-test-id` + `'use client'` + `reset()` + html/body + «useTranslations ishlatilmasin» + **mirror↔ru/uz verbatim sync** + 7 kalit ru+uz'da bor. i18n kalitlari (`errors.crash_*`) allaqachon mavjud edi — faqat komponentlar yozilmagan ekan | 🔴 | 2026-07-28 |
| 145 | [ ] | 404 / 500 / offline sahifalari + Next.js `error` segment boundary'lari (kamida har top-level bo'limga) | | 🟠 | |
| 146 | [ ] | Client-side xato reporteri (#107 Sentry bilan bog'liq) — hozir crash jimgina yo'qoladi | | 🟠 | |

## Qism 10.4 — Sifat o'lchash va doc-drift

| # | ☐ | Ish | Dalil | Bajarildi |
|---|---|---|---|---|
| 147 | [ ] | **Test coverage o'lchash sozlanmagan** | `vitest.config.*` da `coverage` yo'q — 6 512 test bor, lekin **qancha kod qoplanganini hech kim bilmaydi** | |
| 148 | [ ] | **`RESUME.md` — uchinchi ziddiyatli entry-point hujjati** | 1 122 qator, **2026-04-20 «Sprint 3 COMPLETE» holatida muzlagan**: web port **3000** (aslida 3100), «Sprint 4.3» tugadi deydi. `NEXT.md` + `CLAUDE.md` + `RESUME.md` uchtasi bir-biriga zid → birlashtirish yoki arxivlash | |
| 149 | [ ] | **`progress.json` + `NEXT.md` `settings/print-templates` editor sahifasini mavjud deb hisoblaydi** — u **ikkala branch'da ham YO'Q** | «detail_pages 63/64» hisoblagichi shu «64-sahifa»ga tayanadi. Boshqa repodan (`d:/projects/moysklad`) kelgan stale da'vo | |
| 150 | [ ] | **`payment-gateway` (Payme + Click) — UI umuman yo'q** | Backend to'liq: `payme.protocol.ts` · `click.protocol.ts` · `PaymentGatewayConfig` + `PaymentGatewayTx` model + controller. Frontend'da **0 ta sahifa** | |

**Blok 10 hajmi: ~10–14 sessiya**

---

# BLOK 11 — LOYIHANING O'Z REJASIDAN QOLGAN SCOPE

> **Uchinchi completeness-tekshiruvda qo'shildi (2026-07-27).** Manba: `docs/MASTER-PLAN-1TO1.md` (468 qator,
> 2026-07-02 dan beri yangilanmagan) — loyihaning **asl 100% rejasi**. Undagi Sprint 18–33 dan bir nechtasi
> hech qachon tugallanmagan va oldingi 150 bandda **umuman aks etmagan**.

| # | ☐ | Ish | Dalil | Hajm | Bajarildi |
|---|---|---|---|---|---|
| 151 | [ ] | 🔴 **HISOBOTLAR KUTUBXONASI — 16 / 200+** | `MASTER-PLAN-1TO1.md` Sprint 18: «moysklad'da 200+ hisobot bor. Hozir 5 ta» → 8 ta qo'shilgan, hozir jami **16 sahifa**. 30+ kategoriya sanab o'tilgan: Sotuv (11) · Xarid (6) · Pul (7) · Ombor (7) · CRM (5) · Production (4) · Retail (5) · Moliyaviy (3)…<br>**Loyihaning o'z bahosi: «Jami 60–80 sprint kuni = 3–4 oy»** | 🔴 **Blok 6 dan keyingi eng katta scope** | |
| 152 | [ ] | **`moysklad-compat` router — 8 / 76 slug** | Sprint 25 maqsadi «76 slug»; hozir modulda **8 ta endpoint**. MS JSON API moslik qatlami → tashqi integratsiyalar shunga tayanadi | 🟠 | |
| 153 | [ ] | 🔴 **Seed qamrovi — 208 modeldan ~17 tasi** | `packages/db/prisma/seed.ts` faqat ~17 model yozadi. **Shuning uchun Phase-2 cohortlarida «demo-bo'sh» sahifalar bor** — QA qilish uchun avval qo'lda yozuv yaratish kerak bo'ladi. To'liq seed = QA tezligini bir necha barobar oshiradi | 🟠 QA bloklovchi | |
| 154 | [ ] | **Dependency major upgrade** — Prisma **5.22 → 6.x** · Nest **10 → 11** | #117 bilan bevosita bog'liq: HIGH CVE'larning aksari Fastify/Nest 10 zanjirida (`@fastify/middie` bypass, Nest Fastify URL-encoding/HEAD bypass). Next 15 + React 19 zamonaviy ✅ | 🟠 | |
| 155 | [ ] | **6 rejalashtirish hujjati muzlagan va bir-biriga zid** | `MASTER-PLAN-1TO1.md` · `MOYSKLAD-PARITY-ROADMAP.md` · `COVERAGE-TRACKER.md` · `USER-ACTIONS.md` · `DISCOVERY-PLAN-C.md` · `PROJECT-PLAN.md` — **hammasi 2026-07-02 da to'xtagan** (branch yaratilgan kun). MASTER-PLAN «~60% UI parity, 2026-04-29» deydi. → shu `MASTER-TODO-100.md` ga konsolidatsiya qilib, eskilarini arxivlash | 🟡 | |
| 156 | [ ] | Onboarding wizard to'liqligi (Sprint 23) | `OnboardingProgress` model + `getting-started` + `stock-training` sahifa bor; wizard oqimi yopilganmi — tekshirilmagan. *(Sprint 22 «Help drawer + tooltip + shortcut» ✅ BAJARILGAN: `help-drawer.tsx` · `help-button.tsx` · `command-palette.tsx` · `use-keyboard-nav.ts`)* | 🟡 | |
| 157 | [ ] | `pnpm-workspace.yaml` `tests/*` e'lon qiladi — papka **YO'Q** | Konfiguratsiya yolg'oni; tozalash yoki papkani yaratish | 🟢 | |

**Blok 11 hajmi: ~65–90 sessiya** *(shundan #151 yolg'iz ~55–75)*

> ### ✅ Tekshirildi va MUAMMO YO'Q (uchinchi pass'ning ijobiy natijalari)
> - **`.env` git'ga commit qilinmagan** — `.gitignore:32` da, tarixda ham yo'q. **Sir sizishi YO'Q** ✅
> - Husky 3 hook faol (`pre-commit` · `pre-push` · `commit-msg`) ✅
> - Turbo pipeline to'liq: `dev · serve · build · typecheck · lint · test · test:e2e · test:visual · db:migrate · db:seed` ✅
> - `.env.example` + `.env.local.example` + `deploy/.env.production.example` mavjud ✅
> - Next 15 + React 19 — zamonaviy ✅
> - Sprint 17 (7 ta foundation fix) · Sprint 19 (Production) · Sprint 20 (Service Desk) · Sprint 22 (Help/shortcut) — bajarilgan ✅

---

# ⛔ FOYDALANUVCHIDAN KERAK (blocker'lar)

| Kod | ☐ | Nima | Nimani bloklaydi |
|---|---|---|---|
| **A** | [ ] | **moysklad.uz akkauntiga kirish** (capture olish uchun) | #18 (25 test) · #35 · #58–62 · **butun Blok 6** |
| **B** | [ ] | Toza capture'lar: Внутренний-заказ edit-form · production modul · non-UZS retail kassa · yopiq smena Z-отчёт | #58 · #59 · #60 · #61 · #62 |
| **C** | [ ] | Mahsulot qarorlari: `qty=0` ruxsatmi? · multi-bin miqdor kerakmi? · Сценарии/Бизнес-процессы qay darajada? | #71 · #65 · #54 · #55 |
| **D** | [ ] | Real kontragent ma'lumoti (production'da 0 ta) | #112 |
| **E** | [ ] | `yangibolim` moduli kerakmi yoki HR bilan ustma-ust tushadimi? | **butun Blok 5** (8–10 sessiya) |
| **F** | [ ] | **Scope qarori:** pixel-1:1 majburiymi yoki «funksional 1:1 + toza dizayn» yetarlimi? | Blok 6 hajmini 60–75 → 15–20 sessiyaga tushiradi |
| **G** | [ ] | **Drop qarori:** `sotuv` · `omborchi` · `restock-tasks` · `replenishment` · `cell` · `sklad-keeper` qaytariladimi? (main'da jonli production feature edi) | #118 · #123 |
| **H** | [ ] | Multi-tenant SaaS'mi yoki single-tenant self-hosted? | #134 · `subscription` sahifa · ADR-0003 |
| **I** | [ ] | `en` tili kerakmi? | #135 |

---

# 📊 YAKUNIY HISOB

| Blok | Bandlar | Sessiya | Holat |
|---|---|---|---|
| 0 — Qarzlarni yopish | 1–34 (34) | 8–10 | 🔴 |
| 1 — Adoption tugatish | 35–40 (6) | 10–14 | 🔴 |
| 2 — Phase-2 runtime QA | 41–50 (10) | 12–16 | 🟠 |
| 3 — Funksional bo'shliqlar | 51–74 (24) | 25–30 | 🟡 |
| 4 — HR to'liq | 75–82 (8) | 10–12 | 🟡 |
| 5 — yangibolim | 83–89 (7) | 8–10 | ⚪ |
| 6 — Vizual pixel 1:1 | 90–98 (9) | 60–75 | 🔴 |
| 7 — Test qamrovi | 99–104 (6) | 10–12 | 🟠 |
| 8 — Production-ready | 105–116 (12) | 12–15 | 🔴 |
| 9 — Platforma gigienasi + xavfsizlik | 117–136 (20) | 12–16 | 🔴 |
| 10 — Yo'qolgan route + xato-bardoshlilik | 137–150 (14) | 10–14 | 🔴 |
| 11 — Loyihaning o'z rejasidan qolgan scope | 151–157 (7) | 65–90 | 🔴 |
| **JAMI** | **157 band** | **~242–315 sessiya** | **~55% tayyor** |

## Qatlamlar bo'yicha hozirgi holat

| Qatlam | Tayyor |
|---|---|
| Ma'lumot modeli + backend API | ~90% |
| Frontend sahifalar mavjudligi | ~93% |
| Funksional to'g'rilik (ERP sifatida ishlaydi) | ~85% |
| moysklad 1:1 struktura (Phase-1) | ~70% |
| Runtime QA (Phase-2) | ~30% |
| Vizual pixel-1:1 (Phase-3) | ~5% |
| List-toolbar parity | 34% |
| E2E qamrov | ~5% |
| Production-readiness (Phase-4) | ~45% |

**Ikki o'lchov:** «ishlaydigan ERP sifatida» → **~80%** · «moysklad bilan pixel 1:1» → **~55%** · umumiy **~65%**.

---

> **Sinxronlash qoidasi:** har sessiya yakunida (1) shu faylda band `[x]` + commit-hash · (2) `NEXT.md`ga
> hand-off entry · (3) `MEMORY.md`ga 1 qatorli pointer. Uchtasi mos kelmasa — drift, keyingi sessiya to'g'rilaydi.

---

## Revizion tarix

| Sana | O'zgarish |
|---|---|
| 2026-07-27 | Birinchi versiya — 116 band (Blok 0–8) |
| 2026-07-27 | **Completeness-tekshiruv №3** → **Blok 11 qo'shildi (151–157, 7 band)**. Manba: `docs/MASTER-PLAN-1TO1.md` — loyihaning asl 100% rejasi (2026-07-02 dan muzlagan). Topilgan: 🔴 **hisobotlar kutubxonasi 16/200+** (loyihaning o'z bahosi 60–80 sprint kuni) · `moysklad-compat` 8/76 slug · **seed 17/208 model** (QA bloklovchi) · Prisma 5→6 / Nest 10→11 upgrade · 6 muzlagan reja hujjati · onboarding wizard. **Tayyorlik bahosi 65% → 55%** ga tuzatildi (hisobotlar scope'i hisobga olinganda). Ijobiy: `.env` commit qilinmagan, sir sizishi yo'q. |
| 2026-07-27 | **Completeness-tekshiruv №2** → **Blok 10 qo'shildi (137–150, 14 band)**. `main` ↔ `climart-adoption` **tizimli route-diff**: 310 vs 325 route → **19 yo'qolgan** (6 deklaratsiya qilingan drop emas — `settings/sms`, `settings/sms/templates`, `debts/calls/tomorrow` = «KEEP» ekotizimidan tasodifan yo'qolgan) · **33 yangi climart route hech qachon audit qilinmagan** · **0 ta error boundary** (325 sahifaga) · coverage o'lchanmaydi · `RESUME.md` uchinchi ziddiyatli entry-point · `payment-gateway` UI'siz. |
| 2026-07-27 | **Completeness-tekshiruv №1** → **Blok 9 qo'shildi (117–136, 20 band)** + blocker G/H/I. Topilgan bo'shliqlar: 78 dependency zaifligi (3 CRITICAL) · 6 bo'lim DROP qilingani hujjatlanmagan · 3 buzuq/eskirgan infra yozuvi · repo gigienasi · a11y · onboarding/help kontenti · multi-tenant qarori. Sabab: birinchi ro'yxat faqat ilova-funksiyasiga qaragan, platforma/infra/repo qatlami tekshirilmagan edi. |
