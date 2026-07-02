# Real Exhaustive Analysis (2026-05-31)

## 1. Domain-level coverage

| Domain | List pages | Detail pages | Phase-2 dropdown audit | Real status |
|---|---|---|---|---|
| **Sales** (customer-orders, demands, invoices-out, sales-returns) | 4 | 4 | 3/4 (75%) — sales-returns YO'Q | IN PROGRESS — sales-returns FSM-bearing lekin dedicated dropdown YO'Q (pattern asymmetry) |
| **Purchase** (purchase-orders, supplies, purchase-returns, invoices-in) | 4 | 4 | 3/4 (75%) — purchase-returns YO'Q + purchase-orders INLINE (page.tsx ichida) | IN PROGRESS — purchase-returns FSM-bearing, dedicated dropdown YO'Q; purchase-orders refactor zarur |
| **Warehouse** (moves, losses, enters, inventories) | 4 | 4 | 4/4 (100%) DEDICATED | TUGADI surface darajasida; detail audit 0%, modal audit 0% |
| **Money** (cash-in/out, payments-in/out, invoices-in/out, prepayments, prepayment-returns, counterparty-adjustments) | 9 | 9 | 6/9 (67%) — SHARED money helper; 3 ta YO'Q (prepayments, prepayment-returns, counterparty-adjustments) | IN PROGRESS — 6 shared, 3 module Phase-2 hali boshlanmagan |
| **Production** (production/work-orders, processing-orders, processings, productions) | 4 (1 sub-route) | 4 | 0/4 (0%) | HALI BOSHLANMAGAN — work-orders FSM-bearing, dedicated dropdown YO'Q; sub-route status ambiguous |
| **HR** (hr/employees, payrolls, calls, tasks, opportunities, contact-persons) | 6 | 4 | 1/6 (17%) — faqat hr/employees (`_components/` ostida — `progress.json` script ko'rmaydi) | "TUGADI" deb claim qilingan, lekin 5/6 sahifa Phase-2 YO'Q; backend hr-root/hr-events/hr-settings/hr-notification-template = 0 test |
| **Retail** (retail/sales, retail/sessions, retail (index)) | 3 (all sub-routes) | 2 SKELETON | 0/3 (0%) | HALI BOSHLANMAGAN — Phase-2 ham, detail audit ham 0% |
| **Catalog** (counterparties, products, services, bundles, variants, contact-persons, projects) | 7 | 4 PARTIAL | 5/7 (71%) — variants+contact-persons sub-tab (atayin yo'q) | IN PROGRESS — surface yopilgan, detail PARTIAL (header faqat) |
| **Settings** (~22 sub-routes) | 22 | 12 PARTIAL + 3 SKELETON | 3/22 (14%) — currencies, uoms, projects | HALI BOSHLANMAGAN — tax-rates "next" target, 19 ta system catalog Phase-2 YO'Q |

**Domain rollup**: 22/57 top-level routes (39%) — yagona to'liq yopilgan domen = **warehouse**. HR "TUGADI" deb e'lon qilingan, lekin 5/6 sahifa Phase-2 darajasida tegmagan.

---

## 2. Surface-level coverage (frontend pages)

### List pages (57 top-level)

| Kategoriya | Count | Routes |
|---|---|---|
| DEDICATED | 11 (+1 hr/employees `_components` = 12) | counterparties, customer-orders, demands, enters, inventories, losses, moves, supplies, settings/currencies, settings/projects, settings/uoms, hr/employees* |
| SHARED (assortment) | 3 | bundles, products, services |
| SHARED (money helper) | 6 | cash-in, cash-out, invoices-in, invoices-out, payments-in, payments-out |
| INLINE | 1 | purchase-orders |
| NONE | 36 | discounts, prepayments, prepayment-returns, counterparty-adjustments, sales-returns, purchase-returns, internal-orders, price-lists, processing-orders, processings, productions, calls, tasks, opportunities, payrolls, factures-in, factures-out, consignments, commission-reports, service-requests, tracking-codes, bank-import, contact-persons, variants, settings/{tax-rates, expense-items, regions, publications, label-templates, organizations, stores, price-types, bank-accounts, cash-desks, custom-entities, mxik, webhooks, attributes, audit-log, email, print-templates, exchange-rates, task-types, users}, plus ~10 hub/index sahifalar |

**Halol jami**: 22/57 = **39%** (sub-routes hisobsiz). Yoki MEMORY 56-target asosida: 21-22/56 = 38-39%.

### Detail pages (66 jami)

| Kategoriya | Count | Misol |
|---|---|---|
| FULL (3+ DetailHeader/Toolbar/ContentTabs/TotalsSidebar) | 25 | barcha asosiy money/order/document detail'lari |
| PARTIAL (1-2 component yoki EditForm) | 26 | catalog detail'lari, settings detail'lari |
| SKELETON (none of above) | 15 | hr/employees/[id], retail/sales/[id], ecommerce/orders/[id], analitika sub-detail'lar |

**Detail audit %**: **0/66 = 0%**. `docs/audits/` katalogi MAVJUD EMAS. Zero `.audit.md` fayllar. Surface 38% bo'lsa-da, audit deliverable 0.

### Modals (22 distinct + 8 design-system primitives)

| Kategoriya | Count | Audit % |
|---|---|---|
| Design-system primitives | 8 (Modal, Drawer, ConfirmDialog, UnsavedChangesGuard, JsonViewer, CatalogPicker, MassEditModal, Wizard, FilterDrawer) | 0% moysklad audit |
| App-level form modals | 14 (TaskCreateModal, SendEmailDialog, PaymentDialog, EmployeeModal, SetPasswordModal, CheckInModal, EditAttendanceModal, TemplateModal, AnswerModal, ReviewModal, WebhookDialog, AttributeMetadataDialog, RoleFormModal, AddAccountModal) | 0% moysklad audit |
| Wizards | 3 production (Wizard primitive ishlatadigan) | 0% |
| Drawers | 3 (HelpDrawer, CommandPalette, FilterDrawer) | 0% |

**Modal audit**: **0/22+** dedicated test file YO'Q hech bir modal uchun. 4 primitive (CatalogPicker = 124 fayl, FilterDrawer = 46 fayl, UnsavedChangesGuard, JsonViewer) hatto from-ui testsiz. PaymentDialog raw Radix Dialog ishlatadi — Modal primitive'ni chetlab o'tadi (style drift).

**`UnsavedChangesGuard` = 0 usage** apps/web ichida — dead-on-arrival primitive.

---

## 3. Backend coverage (API)

### Module + endpoint counts

| Metric | Count |
|---|---|
| Top-level module dirs | 102 |
| Controller files | 131 |
| Service files | 167 |
| Test files | 204 |
| Unique controller base paths | 122 |
| Total endpoints | 957 (467 GET, 294 POST, 96 PATCH, 77 DELETE, 23 PUT) |

### Bulk endpoint inventory

| Endpoint | Count |
|---|---|
| bulk-delete | 51 |
| bulk-archive | 24 |
| bulk-restore | 22 |
| bulk-transition | 17 |
| mass-edit | 23 |
| bulk-print | 24 |
| {id}/clone | 27 |
| **Total destructive endpoints** | **124** |

Backend bulk coverage **frontend Phase-2'dan ANCHADAN OLDINDA**: 23 mass-edit endpoint mavjud (memory 16 deydi — stale-LOW, NOT inflated). Bulk-print 17/27 FSM modulda yo'q (asosan cash/payment hujjatlari).

### Modules with ZERO tests (13 module)

`audit-log`, `cash-desk`, `contract`, `country`, `help`, `integrations`, `korzina`, `moysklad-compat`, `organization-account`, `permissions`, `saved-filter`, `state`, `telegram`

**Eng yuqori xavf**: `permissions` (cross-cutting authorization) va `audit-log` (forensic trail) testsiz.

### Orphan controller prefixes (frontend chaqirmaydi)

- **Atayin orphan (inbound webhook/integration)**: bank-api, click, payme, webhookstock, telegram-webhook, api/remap/1.2
- **UI yo'q (capability shipsiz)**: loyalty, marketplace, onec, payment-gateways, sms, marking, edo (10 endpoint, web 0 call)
- **Empty `@Controller()` decorator (discoverability past)**: attachment, commission-report

### Sub-modules without controller (internal helpers)

`hr/hr-{auth,events,scheduler,settings,shared,telegram-bridge,websocket}`, `retail-sale/fiscal`

---

## 4. Reference data quality (moysklad)

### Captured modules

**22/56 (39%)** modullar `metadata.json` bilan. 34 catalog/document sahifa hali capture'siz.

### Interactive coverage

| Slot | Coverage |
|---|---|
| 03-edit-dropdown | 20/22 (91%) — variants+contact-persons splash, atayin yo'q |
| 05-print-dropdown | 17/22 (77%) — currencies/projects/uoms/contact-persons/variants legitimate yo'q |
| 06-column-gear | **2/22 (9%)** — script bug, 20 module'da timeout |
| 08-selection-1 | **1/22 (5%)** — Playwright selector timeout, faqat customer-orders ishladi |
| **Interactive slots jami** | **36/66 (54.5%)** |

### Systematic capture failures

- **08-selection-1**: 21/22 modul (95% fail) → row tanlash holatidagi toolbar parity YO'Q
- **06-column-gear**: 20/22 modul (91% fail) → moysklad column tarkibi nomalum
- **10/11/12-empty/pagination/mobile**: 6 money/invoice modul (cash-in/out, invoices-in/out, payments-in/out) — bitta capture script regression
- **Mass-edit modal (state 13)**: faqat currencies + uoms (2/22) capture qilingan — Phase-3 work

### Reference corpus drift

- Eski `visual-captures/` (April 2026, 1450 PNG) **22 route paywall homepage'ga redirect** — store, organization, role, product, counterparty kabi muhim modullar uchun ground truth `_capture-quality.json` (2026-04-27) bo'yicha **87% signal-to-noise**, lekin paywall-corrupted segment ishlatib bo'lmaydi
- `_capture-quality.md/json` faqat eski corpus'ni qamraydi — yangi `states/` strukturasi uchun halol sifat metrikasi YO'Q
- contact-persons + variants `states/` dirida 12 PNG bor lekin 0 domDump — splash sahifalar, kelajakdagi agent ground truth deb tushunish xavfi

---

## 5. Test coverage (real depth)

### API test breakdown (204 fayl)

| Kategoriya | Count | % |
|---|---|---|
| **SCHEMA-only (Zod)** | **97** | **47.5%** |
| UNIT-service (mocked repo) | 57 | 27.9% |
| UNIT-utility (pure functions) | 47 | 23.0% |
| **INTEGRATION (real DB/Prisma)** | **0** | **0%** |
| Controller (supertest) | 0 | 0% |
| Nest createTestingModule | 0 | 0% |

**To'g'ri test piramidasi teskari**: schema-og'ir, integration-bo'sh. Race condition, RLS, FK cascade, unique constraint yurish-turishi test layer'da **mutlaqo tasdiqlanmagan**.

### Web tests (87 fayl)

- ~25 dropdown smoke (item mavjudligini tekshiradi, **click→side-effect ko'pincha tekshirilmaydi**)
- ~25 *-from-ui.test.tsx (shadcn primitive shallow render)
- ~36 moderate-depth (DetailHeader/Toolbar/ContentTabs, document-toolbar-menus)

**Counterparty Copy→fake `/clone` 404 bug class** aynan shu sababdan o'tib ketdi — hech bir test click path'ni exercise qilmagan.

### E2E (5 Playwright spec)

- `product-crud.spec.ts` — **YAGONA real transactional vertical slice** (list→create→archive→restore→delete)
- `visual-regression.spec.ts`, `detail-content-tabs.spec.ts`, `audit-capture-*.spec.ts` — capture/regression
- **Boshqa modullarning hech biri end-to-end browser layer'da tekshirilmagan**

### Live smoke

| Endpoint | Live smoke coverage |
|---|---|
| mass-edit | 13/23 actually exercised = 57% (10 skip — seed empty) |
| bulk-delete (51) | **0%** |
| bulk-archive (24) | **0%** |
| bulk-restore (22) | **0%** |
| bulk-transition (17) | **0%** |
| **Total destructive endpoints** | **13/147 = 8.8%** |

**Adversarial pack** (empty patch, invalid UUID, missing UUID) `smoke-mass-edit.sh --all` ichida **faqat BIR MARTA** birinchi non-empty module'da ishlaydi. 22 boshqa module bir xil payload shape qabul qilsa-da, hech qachon adversarial assertion ko'rmaydi.

### Zero-test modules (21 jami API + web)

API tomonda 13 module + HR submodules (`hr-events`, `hr-notification-template`, `hr-settings`) + integrations subdirs.

### Yo'qoq kategoriyalar

- **Concurrency/race tests**: 0
- **Property-based fuzz**: 0 (fast-check yo'q)
- **Real DB integration**: 0

---

## 6. Drift signals (claims vs reality)

### Inflation pattern #1 — Phase-2 sahifa coverage

| Source | Claim | Reality |
|---|---|---|
| NEXT.md prose ("26/56") | 26 sahifa | Har sessiyani +1 hisoblaydigan inflated counter |
| `progress.json` | 16/56 = 29% | Skript double-counts `assortment` (route emas) va money helper'ni umuman hisoblamaydi |
| **Halol recount** | **22/57 = 39%** | 11 dedicated + 3 shared assortment + 6 shared money + 1 inline + 1 hr/employees (`_components`) |

**Drift miqdori**: NEXT.md vs progress.json o'rtasida 10 sahifa (38% nisbiy farq). Drift-fix sessiyasi NEXT.md oxirida buni tan oladi.

### Inflation pattern #2 — Detail page audit

NEXT.md line 31: "Detail audit: 0/36" → NEXT.md line 264 (xuddi shu fayl): "Detail audit: 0/56" → progress.json: actual=62, target=36 → **live filesystem: 66**. To'rt xil raqam, hech qaysisi to'g'ri.

Halol: **0/66 = 0%** ham audit fayli yo'q, ham `docs/audits/` katalogi mavjud emas.

### Inflation pattern #3 — Mass-edit smoke

`smoke-mass-edit.sh` log "13/13 GREEN + 3/3 adversarial GREEN" deydi → realda 124 boshqa destructive endpoint 0% smoke, adversarial pack faqat bir marta ishlaydi. **Halol bulk-op smoke = 8.8%**, e'lon 57%.

### Inflation pattern #4 — "TUGADI" claims

| Claim | Reality |
|---|---|
| "HR MODULE TUGADI (P0→P6)" | 5/6 HR sahifa Phase-2 YO'Q; hr-root, hr-events, hr-settings, hr-notification-template = 0 test; 7 HR modal 0 test fayl |
| "char-for-char parity" (sessiyalar) | Reference data interactive coverage 54.5%, 08-selection-1 95% fail — parity claim incomplete ground truth ustida turibdi |
| "Live smoke 28/28 (projects)" | Real, lekin 1 modul; framework darajasida bulk-delete/archive/restore 0% smoke |

### Inflation pattern #5 — Husky qoplaydi

MEMORY "Husky restored — gates commits" → Husky `lint-staged` + `commitlint` ishlatadi, **vitest yoki playwright EMAS**. Pre-commit puxta sifatni dahsmaydi.

### Honest tan olishlar (drift-fix sessiyasi)

NEXT.md oxiri ochiq aytadi: "26/56 inflyatsiya... halol recount: 12 dedicated + 3 shared = ~16". Bu yaxshi — lekin **modal/detail/integration/concurrent test bo'shliqlari hech qachon tan olinmagan**.

---

## 7. Honest overall percentage

### Per-dimension

| Dimension | Claim | Honest % | Izoh |
|---|---|---|---|
| List pages Phase-2 dropdown | 29-46% | **39%** (22/57) | Drift-corrected route count |
| Detail page audit | 0% | **0%** (0/66) | Audit deliverable mutlaqo yo'q |
| Modal audit | 0% | **0%** (0/22+) | Sessiyalar audit qilinmagan |
| Modal test coverage | "covered" | **8%** | Faqat primitive wrapper smoke, concrete modal'da 0 dedicated test |
| Backend bulk endpoints shipped | 100% bulk-delete | **95%** | 124 destructive endpoint mavjud; convention drift (@Put vs @Patch) |
| Backend test coverage | "204 tests" | **35%** real depth | 47.5% schema-only, 0% integration; 21 module 0 test |
| Reference data (moysklad capture) | "char-for-char parity" | **62%** corpus; **54.5%** interactive | 21/22 module 08-selection-1 fail; 34 module umuman capture'siz |
| Live smoke (destructive endpoints) | "13/13 + adversarial" | **8.8%** (13/147) | Adversarial pack bir martagina ishlaydi |
| E2E coverage | 5 spec | **2%** module surfacedan | Faqat product-crud real vertical slice |

### Weighted overall

Vaznlar: List 15% + Detail 20% + Modal 15% + Backend 15% + Tests 15% + Reference 10% + E2E/smoke 10%

= 0.15×39 + 0.20×0 + 0.15×4 (modal audit+test o'rtacha) + 0.15×95 + 0.15×35 + 0.10×58 + 0.10×6
= 5.85 + 0 + 0.6 + 14.25 + 5.25 + 5.8 + 0.6
= **~32% honest overall**

**User-facing "20-25%" intuition juda yaqin to'g'riga**. Surface (list dropdown) 39% qilingani uchun "tuyilgan progress" yuqori, lekin detail 0%, modal 0%, integration test 0% — bu uchta dimension katta vaznli va to'liq bo'sh.

### Detail page surface = 0% reality check

66 detail sahifa kodda mavjud, 25/66 FULL component shape'ga ega — lekin **birortasi moysklad bilan taqqoslangan audit'dan o'tmagan**. Bu eng katta yashirin qarz: code shipped, audit not started.

---

## 8. Real remaining work

### A — Yopilmagan Phase-2 list dropdown'lar (35 route)

**ROI YUQORI** — naqsh isbotlangan, 1-2 soat/route.

| Sub-project | Routes | Approx effort |
|---|---|---|
| A1 — Sales/Purchase asymmetry | sales-returns, purchase-returns | 2 sessiya |
| A2 — purchase-orders INLINE → DEDICATED refactor | purchase-orders | 1 sessiya |
| A3 — Money trio | prepayments, prepayment-returns, counterparty-adjustments | 2 sessiya |
| A4 — Production sub-routes | work-orders, processing-orders, processings, productions | 3 sessiya |
| A5 — Settings catalogs | tax-rates (next), expense-items, regions, publications, label-templates, organizations, stores, price-types, bank-accounts, cash-desks, custom-entities, mxik, webhooks, attributes, audit-log, email, print-templates, exchange-rates, task-types, users | 10-12 sessiya |
| A6 — HR rest | payrolls, calls, tasks, opportunities + contact-persons (sub-tab decision) | 3 sessiya |
| A7 — Misc | discounts, internal-orders, price-lists, factures-in/out, consignments, commission-reports, service-requests, tracking-codes, bank-import | 5 sessiya |

**Jami**: ~26 sessiya Phase-2 to'liq 100% yopish uchun.

### B — Detail page audit (0 → ~47)

**ROI O'RTA** — methodology yo'q (template, capture script, comparison harness yo'qoq).

| Sub-project | Effort |
|---|---|
| B0 — Detail audit harness (template + capture script + scoring) | 1-2 sessiya |
| B1 — 25 FULL detail audit (customer-orders, demands, supplies, va h.k.) | 6-8 sessiya |
| B2 — 26 PARTIAL detail upgrade + audit | 8-10 sessiya |
| B3 — 15 SKELETON detail (hr/employees, retail/sales) — DetailHeader/Toolbar/ContentTabs shape qo'shish | 5-6 sessiya |

**Jami**: ~22 sessiya. **Eng katta yashirin qarz.**

### C — Modal audit (0 → 22)

**ROI O'RTA-YUQORI** — har modal moysklad'da capture qilinishi kerak (interactive pattern); 4 primitive test'siz.

| Sub-project | Effort |
|---|---|
| C0 — Modal capture harness (Playwright modal-state capture) | 1 sessiya |
| C1 — CatalogPicker audit (124 fayl ishlatadi) | 2 sessiya |
| C2 — MassEditModal full audit (22 modul mass-edit holatlari) | 3 sessiya |
| C3 — 14 form modal capture + audit | 7 sessiya |
| C4 — PaymentDialog Modal primitive'ga migrate | 1 sessiya |
| C5 — UnsavedChangesGuard wire to all edit forms (0 → ~30 forms) | 2 sessiya |

**Jami**: ~16 sessiya.

### D — Test depth (35% → 70%+)

**ROI ENG YUQORI** — adversarial QA qoidasi talab qiladi, hozir mutlaqo bo'sh.

| Sub-project | Effort |
|---|---|
| D0 — PgTestContainer + Test.createTestingModule infrastructure | 2 sessiya |
| D1 — Real-DB integration test bulk-delete/archive/restore (51+24+22 = 97 endpoint) | 5-6 sessiya |
| D2 — Concurrency tests (FOR UPDATE, lost-update, race condition) — money/stock/payment | 3 sessiya |
| D3 — `permissions` + `audit-log` module test (cross-cutting) | 2 sessiya |
| D4 — 13 zero-test module'ga minimal smoke | 4 sessiya |
| D5 — `smoke-mass-edit.sh` adversarial pack per-module (1 martadan 23 martaga) | 1 sessiya |
| D6 — Bulk-print live smoke (24 endpoint) | 2 sessiya |
| D7 — E2E vertical slice product-crud naqshini 10 muhim modulga ko'paytirish | 5 sessiya |

**Jami**: ~24 sessiya. **Adversarial QA qoidasini bajarish uchun zaruriy.**

### E — Reference data corpus

**ROI PAST-O'RTA** — capture script bug'lar hal qilinmasa, future Phase-2 ham incomplete ground truth ustida ishlaydi.

| Sub-project | Effort |
|---|---|
| E0 — Capture script fix: 08-selection-1 (Playwright selector), 06-column-gear (gear open) | 1 sessiya |
| E1 — 21 mavjud module retry (selection+gear states) | 2 sessiya |
| E2 — 34 yangi modul capture (settings/* va boshqalar) | 6 sessiya |
| E3 — Mass-edit modal capture (20 qolgan modul) | 3 sessiya |
| E4 — `_capture-quality.json` v2 (states/ structure uchun) | 1 sessiya |

**Jami**: ~13 sessiya.

### Recommended order (ROI rank)

1. **D0–D2** (real integration + concurrency test) — adversarial QA qoidasi blocker; money/stock bug ehtimoli yuqori
2. **E0–E1** (capture script fix + retry) — barcha future audit ground truth'ga muhtoj
3. **A1–A4** (Phase-2 yopilmagan FSM/money — 11 sahifa) — naqsh tayyor, tezkor surface progress
4. **C0+C2** (Modal capture harness + MassEditModal audit) — eng ko'p ishlatiladigan modal
5. **B0+B1** (Detail audit harness + 25 FULL detail) — yashirin qarzni kamaytirish
6. **A5** (Settings catalogs) — surface comprehensive bo'lishi
7. **A6+A7** (HR + misc) — qolgan surface
8. **B2+B3** (PARTIAL+SKELETON detail upgrade) — uzoq lekin kerakli
9. **C3–C5** (qolgan modal'lar) — sifat polish
10. **D6+D7** (bulk-print smoke + e2e expansion) — defence-in-depth
11. **E2+E3** (yangi modul capture) — yangi sub-project'lar boshlanganda

### Halol jami qolgan ish

**~101 sessiya** (A:26 + B:22 + C:16 + D:24 + E:13). Hozirgi progress ~32% bo'lsa, qolgani ~68% — ko'rsatkichlar to'g'ri keladi.

### Eng muhim 3 ta halol xulosa

1. **"39% surface" ≠ "39% production-ready"** — backend bulk endpoint'lar 95% deployed, lekin **8.8% live-smoke'dan o'tgan, 0% real-DB integration test'dan o'tgan**. CLAUDE.md "IKKINCHI ASOSIY QOIDA" bo'yicha bu modullar **"happy path ishlaydi"** holatida, "production-ready" emas.
2. **Detail page audit 0%** eng katta strategik qarz. 66 sahifa code-complete, 0 sahifa moysklad-audit-complete. Audit harness ham mavjud emas (template list-page-oriented).
3. **"HR module TUGADI"** claim'i halol emas — backend submodules 0 test, 7 HR modal 0 test, 5/6 HR sahifa Phase-2 yo'q. Re-classify kerak: "HR feature-complete, audit boshlanmagan."