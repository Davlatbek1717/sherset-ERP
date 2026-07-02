# 1:1 Master Plan — to certifiable moysklad parity (2026-06-13)

> **The spine.** When every item here is ✅, the project is **certifiably 1:1** with
> moysklad.uz: every parity page faithful in structure + labels + behaviour, runtime-proven,
> DOM-grounded. Each `davom et` pulls the next item from this plan. Supersedes
> `_NEXT-PHASE-PLAN.md` (process) + `_PHASE2-100-PLAN.md` (cohort QA, now folded into Phase 4).
> Grounded in `_1TO1-PARITY-INVENTORY-2026-06-13.md` (78 parity pages · 18 HIGH · 106 MED ·
> 115 LOW · 42 capture-gated · 36 runtime-verified / 57 structural-only / 5 unaudited).

## Locked scope & decisions (user, 2026-06-13)

1. **Scope = the 78 parity-clone pages only.** The 25 added features (hr/* HR-Telegram-KPI
   engine, analitika/* UZ analytics, mxik, bank-import, calls, ecommerce hub) **STAY untouched** —
   Uzbek-market bonus, out of 1:1 scope. The plan does not strip or audit them.
2. **Capture re-harness is automated (Track 0).** The contaminated/missing reference captures
   (catalog 04, production 10, settings 00, stock-detail 06, retail-grid 08, + discounts/
   tracking-codes/consignments/commission/money-index/saleschannel/online-order) are re-captured
   by re-pointing `tools/capture` at the live paid moysklad with a **one-time user login**. This
   unblocks **DOM-grounded labels** for those modules — the hard ceiling on a true 1:1 claim.

## Definition of "1:1 done" — applies per section (module)

A module is **1:1 ✅** only when ALL four hold:
- **(a) Structure** — every moysklad field/column/tab/toolbar/menu present (HIGH+MED structural gaps closed).
- **(b) Behaviour** — every flow works correctly (broken-flow / data-integrity gaps closed; no silent-drop, no stub).
- **(c) Labels DOM-grounded** — every label verified against a CLEAN moysklad capture DOM-role (§4), not sibling-inferred. (Requires Track 0 captures.)
- **(d) Runtime-proven** — live browser + adversarial QA passed (Phase-2), gate green (tc/biome/i18n/test).

"Gate-green" alone is **necessary, not sufficient** — the «Тип» incident (a reference page carried a latent value↔label inversion through every structural gate for ~10 sessions) is why (c)+(d) are mandatory.

---

## Track 0 — Capture re-harness (PREREQUISITE, runs early + feeds every phase)

**Why first-ish:** ~6 modules' labels are currently inferred, not grounded. Without clean captures,
Phase 4's label-grounding (c) cannot certify those modules. Run this early so captures are in hand
when each module's QA arrives.

- **0.1** Re-point `tools/capture` harness at live paid moysklad; user logs in once; re-capture
  contaminated/missing modules → clean DOM dumps under `docs/moysklad-reference/visual-captures/`.
  - Risk (11e): paid account is data-empty + some modules option-gated → may need seeding test data
    first, or accept partial coverage for option-gated areas (document what couldn't be captured).
- **0.2** Per module, re-run `scripts/wf-label-grounding-audit.js` against the fresh captures →
  fix any mis-grounded labels (the «Тип» class). Update `label-grounding.test.ts` registry.
- **Done when:** every parity module has either a clean capture OR a documented "uncapturable
  (option-gated)" note; the label-grounding registry covers all re-captured modules.

---

## Phase 1 — Cross-cutting bug-CLASSES (highest leverage: one root fix → many pages)

These are not per-page; each is a class. Fix the root, sweep all sites, guard.

- **1.1 org-account picker SCOPE** [HIGH] — `organizationAccountFetcher` not scoped to the selected
  org → «Счёт организации» offers other orgs' accounts. 1 shared fix → **~13 money/doc pages**
  (cash-in/out, payments-in/out, prepayments, prepayment-returns, purchase-orders, customer-orders).
  Grounded: `prepayments-detail.audit.md:58-62`. **Money-critical.**
- **1.2 create-form silent-drop** [HIGH] — every sales/purchase `/new` drops user-typed
  document-number + «Проведено» toggle (Zod) → create-and-post silently saves a draft. Decide
  honor-vs-remove (grounding-gated → needs Track-0 create-form capture), then sweep all `/new`.
  Grounded: `_PHASE2-cohortA-session3-returns-cogs.audit.md DEFERRED #1`.
- **1.3 Money-doc History audit-feed** [MED, whole module] — every money entity
  (CashIn/CashOut/PaymentIn/PaymentOut/Prepayment/PrepaymentReturn/CounterpartyAdjustment) has an
  empty History tab (userId+auditLog not threaded). One backend pattern → all money History tabs live.
- **1.4 Print-template system** [MED, cohort-wide — large] — named print forms (Приходная
  накладная, ТОРГ-13, Ценник, Термоэтикетка, …) are missing across ALL docs (mis-scoped «Список
  заказов» placeholder). Build a per-doc print-template engine + the moysklad form set. Overlaps
  Phase 3's settings/print-templates editor.
- **1.5 Position stock columns + profit/weight/volume totals** [MED, every goods-doc] — shared
  `PositionEditor` (Принято/Доступно/Остаток/Резерв/Ожидание per row) + `DetailTotalsSidebar`
  (Прибыль/Вес/Объём). Needs per-row live stock (backend). Touches customer-orders/demands/
  invoices-out/sales-returns/supplies/PO/moves/purchase-returns.
- **1.6 sortBy enum rejection** [MED, quick] — audit EVERY `sortable` list column vs its BE
  `sortBy` enum; consignments «Код» + commission-reports «Контрагент» send rejected values → 400.
  Add to enum or drop `sortable`. Grounded: `consignment.schema.ts:33`, `commission-report.schema.ts:49`.

---

## Phase 2 — Bounded HIGH gaps (concrete, ~1 session each)

- **2.1 factures-in + factures-out detail/new routes** [HIGH, broken-flow 404] — build the
  `/factures-{in,out}/[id]` + `/new` edit pages (rows currently 404). Captures
  `02-module/facturein/dom/08-edit-default.html`, `03-module/factureout/...`.
- **2.2 payments-out «Статья расходов»** [HIGH] — wire the REQUIRED expense-item picker end-to-end
  (Create/Update schema + service + `/new` + detail PATCH); column+catalog+list-filter already exist.
  Grounded: `payments-out-detail.audit.md F1/F14/F17`.
- **2.3 demands/[id] payment chip + «Запросить оплату»** [HIGH] — BE `payedSumMinor` exists; add FE
  pill + request-payment surface. Grounded: `demands-detail.audit.md S7/I12`.
- **2.4 ecommerce/orders Convert → real CustomerOrder+Demand** [HIGH, data-integrity] — replace the
  V1 stub (`randomUUID()` placeholder) with a real conversion. Grounded: `online-order.service.ts:175-199`.
- **2.5 retail/z-report dedicated audit + fixes** [HIGH, unaudited] — Phase-1 list audit + currency
  fix (`formatMoney(BigInt(...))` no-currency «сум» → `row.cashDesk.currency`) + add «Склад»/
  «Организация» columns. Grounded: `z-report/page.tsx:95,107,128` vs fixed sibling `sessions/page.tsx`.
- **2.6 settings/uoms data-model** [HIGH] — add `fullName` («Полное наименование») column + UI split +
  relabel (currently single `name` only). Grounded: `uoms-detail.audit.md:21-22`.
- **2.7 productions/[id] runtime verification** [HIGH, QA-only] — browser-smoke the qty/1000 fix +
  «Сделать копию» clone (in code, never verified). Grounded: `productions-detail.audit.md:25,37`.

---

## Phase 3 — Big refactors (design-first, multi-session each)

Each starts with a `brainstorming` + `writing-plans` pass (these are structural+backend rebuilds).

- **3.1 products/[id] RIGHT tabbed widget** [HIGH, biggest] — Цены/Модификации/Анализ/Наличие/
  Остатки/История/Файлы sidebar + backend (variant/analytics/stock tabs). `products-detail.audit.md:42`.
- **3.2 counterparties/[id] CRM activity widget + editors** [HIGH] — right widget (События/Задачи/
  Документы/Файлы/Показатели) + «Группы» picker (S14) + «Доступ» editor (S15) + editable «Статус»
  (S13) + bank-account CRUD (S18); needs backend activity/tasks feed. `counterparties-detail.audit.md:42-46`.
- **3.3 settings/users full admin** [HIGH] — employee list + role assignment + create/edit (replace
  the auth/me read-only stub); backend `GET /admin/employees` + roles. `users-detail.audit.md:9`.
- **3.4 settings/print-templates in-app editor** [HIGH] — `/new`+`/[id]` body editor (BE @Post/@Patch
  exist). Pairs with 1.4. `print-templates-list.audit.md:17`.
- **3.5 discounts structured types** [MED] — replace the raw-JSON `rules` textarea with 3 typed
  editors (накопительная tiers / специальная цена / assortment). `discount.json:310-463`.
- **3.6 boms multi-output + cost-distribution** [MED] — multi-product + materials + cost/
  costDistributionType + processingProcess link (vs single-output V1). `processingplan.json:426-558`.

---

## Phase 4 — Module-by-module: MED cleanup + Phase-2 QA + DOM re-grounding

Go module by module over every **structural-only / unaudited** parity page (62 pages). For each
module: close remaining MED/LOW gaps → run live browser + adversarial QA → re-ground labels against
Track-0 captures → mark the module **1:1 ✅**. This closes the verification debt (the ~60% not yet
runtime-proven) AND the label-grounding debt together.

Module queue (ZERO-runtime-verified first — highest latent-bug risk):

| # | Module cohort | Parity pages | Notes |
|---|---|---|---|
| 4a | **settings-finance** | bank-accounts · cash-desks · expense-items · tax-rates · price-types · currencies · exchange-rates | 0 runtime-verified; captures contaminated (Track 0) |
| 4b | **settings-org/system** | organizations · regions · publications · custom-entities · label-templates · projects · stores · uoms · attributes · audit-log · webhooks · task-types | 0 verified; `users`/`uoms`/`print-templates` HIGH handled in P2/P3 |
| 4c | **ecommerce** | ecommerce/channels (+[id]/new) | enum + field divergence vs saleschannel; convert in P2 |
| 4d | **reports (parity)** | 13 `/reports/*` parity reports | unaudited; pnl/aging title i18n, profitability null-cost |
| 4e | **crm** | opportunities · pipelines · contact-persons · tasks (+ subroutes) | structural-only; opportunities reopen control |
| 4f | **money periphery** | prepayments · prepayment-returns · counterparty-adjustments · factures (post-P2) · /money index | structural-only; org-account (P1) + History (P1) feed in |
| 4g | **goods-pricing periphery** | product-folders · consignments · price-lists · price-types · discounts · commission-reports | structural-only; sortBy (P1), discounts (P3) feed in |
| 4h | **production doc-family** | processing-orders · processings · productions | structural-only; BOM-math + two-store cascade runtime-unverified |
| 4i | **payrolls** | payrolls (+[id]/new) | structural-only; BE deduction-sign check; no gold capture (Track 0) |

(Already runtime-verified — re-ground labels only after Track 0, no re-QA: stock, production-config,
sales-docs, money-cash/payments, katalog, retail/sales+sessions.)

---

## Phase 5 — Final certification

- **5.1** Every parity module ✅ on all four DoD criteria (a-d).
- **5.2** Add a `one_to_one` block to `progress.json` — per-module done-flags COMPUTED from proof-doc
  existence (falsifiable, like `phase2`). `pct = certified modules / total`.
- **5.3** Final honest statement: "certifiably 1:1 on the parity surface" — with the explicit list of
  any option-gated areas Track 0 could not capture (the residual caveat, named not hidden).

---

## Per-module 1:1 done-checklist (measurable)

| Module | HIGH left | Key MED left | "1:1 ✅ when" |
|---|---|---|---|
| purchases | factures detail (2.1) | print-templates, PO related-docs, position stock cols | factures built + P4 QA + captures |
| sales | demands chip (2.3) | position stock cols, create-form drop, factures-out | P2 + P4 QA + create-form decision |
| goods-pricing | products/[id] widget (3.1) | sortBy (1.6), discounts (3.5), History feeds | P3 + P1 + P4 QA + catalog captures |
| stock | — | move cost cols, inventory population, «Расчётное» label | P4 re-ground (already runtime-verified) + stock-detail captures |
| money | org-account (1.1), payments-out (2.2), factures (2.1) | History (1.3), allocation table, currency fields | P1+P2 + P4 QA + money-index capture |
| production | — (productions QA 2.7) | boms multi-output (3.6), print-templates | P3 + P4 QA + production captures (10-module) |
| crm-counterparties | counterparties widget (3.2) | opportunities reopen, position cols | P3 + P4 QA + CRM captures |
| retail | z-report (2.5) | session labels (Дата открытия/Точка продаж), drawer fields | P2 + P4 re-ground + retail-grid capture |
| ecommerce | convert (2.4) | enum/field divergence, History feed | P2 + P4 + saleschannel capture |
| settings | users (3.3), uoms (2.6), print-templates (3.4) | label re-ground across ~24 pages | P2+P3 + P4 QA + settings captures (00-module) |
| reports (parity) | — | 13 reports title i18n + null-cost + groupBy | P4 audit+QA (never audited) |
| payrolls | — | deduction-sign BE check, /new currency | P4 QA + payroll capture |

---

## Effort & sequencing (honest — not a deadline)

- **Track 0:** ~2-4 sessions (re-harness + per-module re-ground woven through P4).
- **Phase 1:** ~6-8 sessions (1.4 print-templates is large).
- **Phase 2:** ~7-9 sessions.
- **Phase 3:** ~12-18 sessions (six design+build refactors; 3.1/3.2/3.3 are the largest).
- **Phase 4:** ~22-30 sessions (62 pages × MED-cleanup + QA, batched by cohort ~8-10 pages).
- **Phase 5:** ~2-3 sessions.
- **Total: ~50-70 focused sessions** to certifiable 1:1, at the 1-flagship-per-session rhythm.
  Cross-cutting Phase 1 front-loads the highest leverage; Phase 4 is the long tail.

**Sequencing rule:** Phase 1 (leverage) → Phase 2 (bounded HIGH) → Phase 3 (refactors, design-gated)
→ Phase 4 (module QA, the bulk). Track 0 runs in parallel from the start; a module's Phase-4 cert
waits on its Track-0 capture. Each `davom et` = one item, committed, NEXT.md updated.

## How progress is tracked

- This file is the queue. Each item gets a status marker as it lands: `⬜ todo` → `🔄 in-progress`
  → `✅ done (commit)`. `davom et` reads the top open item (respecting phase order + dependencies).
- `progress.json.one_to_one` (added in 5.2) becomes the falsifiable machine counter.
- Every item keeps the honesty discipline: **Phase-1 structural** until browser-QA'd, then
  **1:1 ✅**; labels stay **sibling-inferred** until Track-0 DOM-grounded.

## Progress log (each `davom et` / campaign step appends)

- **§1.1 org-account scope** — ✅ already DONE (pre-existing). FE 15-page lock test
  (`org-account-scope.test.ts`) green + BE `assertOrgAccountMatchesOrg` hard-enforced on
  create+update across all money/doc services. Inventory's "HIGH" was «untested-runtime»;
  only a runtime smoke remains → folds into Phase-4 QA.
- **§1.6 sortBy enum** — ✅ DONE (`a212fd52`) + **RUNTIME-CERTIFIED** (live browser, Playwright
  on :3100). consignment `code` + commission `agent` added; commission `agent` → nested orderBy;
  guard `sort-key-parity.test.ts`. api tc0 · guard 8/8 · commission+consignment 17/17.
  **Phase-2 verified:** clicking the `/consignments` «Код» header fired
  `GET /api/v1/consignments?sortBy=code&sortDir=desc → 200 OK` (was a 400 enum-rejection pre-fix);
  zero console errors (only the pre-existing favicon 404).
- **🟢 Playwright runtime-QA pipeline CONFIRMED working** (2026-06-13, after user reconnect): web
  on `:3100`, session auth persists (no login redirect), navigate→snapshot→click→network-assert all
  functional. Unblocks the Phase-4 cert batch (z-report, demands chip, productions, etc.).
- **§2.5 z-report — RUNTIME-CERTIFIED** (live browser): `/retail/z-report` renders the **«Склад» +
  «Организация» columns** (Asosiy ombor / MCHJ Demo) and money cells «700 000,00» / «240 000,00»
  with **no hardcoded «сум» suffix** (currency-threaded, displayAs:none) — incl. a «QA JPY kassa»
  multi-currency till. The §2.5 fix is verified.
- **⚠️ dev jest-worker degradation scope CLARIFIED** (live): the degraded worker compiles LIGHT
  pages fine (z-report, lists certified) but **500s on HEAVY pages** — the 1000+-line demand detail
  (`/demands/[id]`) AND new routes (`factures-in/[id]`) both crash it. So **A5 demands chip, §1.5
  profit row, and A1 factures render-cert genuinely require a `pnpm dev` restart** (their host pages
  won't compile on the degraded worker). Logic for all three is static-green + guarded.
- **✅ RESOLVED — moysklad web dev surgically restarted** (2026-06-13; killed ONLY the port-3100
  tree, left api:4000 + the user's parallel @marhabo/@marketing dev servers untouched; fresh worker
  pool, Ready in 12.8s). **All landed fixes then CERTIFIED LIVE:**
  - **A5 demands chip ✅** — orange «Не оплачено» badge renders on the posted+unpaid demand 06847.
  - **§1.5 profit guard ✅** — on a `costSumMinor=0` demand the «Прибыль» row is correctly HIDDEN
    (no draft/zero-cost full-revenue leak), totals render «Промежуточный итог/НДС/Итого/Кол-во»; the
    row appears for cost>0 by the same Row-rendering the other rows prove.
  - **A1 factures-in ✅** — `/factures-in/[id]` renders the read-only detail (СФ-вх-00002 «Черновик»,
    Контрагент/Организация/Входящий №/дата/Сумма) — the 404 is gone.
  - (§1.6 + §2.5 were already certified pre-restart on light pages.)
- **«Кто изменил» (products modifiedById filter)** — ✅ DONE by the user's parallel session
  (`bd23e08c`/`01849a10`, 11ae, live smoke 6/6, doc `_PRODUCTS-MODIFIED-BY-FILTER-2026-06-13.md`).
  The last buildable field of the captured products Фильтр panel. NOT re-counted here.

### HIGH re-validation (2026-06-13, code-grounded — the inventory's "18 HIGH" was inflated)

The 1:1 inventory leaned on older `*.audit.md` DEFERRED sections; many were fixed in the
30 prior sessions. Grounding each HIGH against current code:

| HIGH gap | Real status (code-checked) |
|---|---|
| org-account scope (§1.1) | ✅ DONE — FE 15-page lock + BE `assertOrgAccountMatchesOrg` |
| payments-out «Статья расходов» (§2.2) | ✅ DONE — BE schema/service + `/new` + `[id]` picker all wired |
| settings/users admin (§3.3) | ✅ likely DONE — reuses `GET /hr/employees` + `/roles` (not auth/me stub) — QA-verify |
| settings/print-templates editor (§3.4) | ✅ likely DONE — `[id]`+`new` routes exist w/ editor logic (88 lines) — QA-verify |
| productions/[id] qty+clone (§A3) | 🟡 code present (`qty/1_000` + `cloneMut`) → runtime-QA only |
| factures-in/out detail routes (§2.1) | 🔴 OPEN — only `page.tsx`, rows 404 |
| ecommerce/orders Convert (§2.4) | 🔴 OPEN — v1 stub (`_v1Warning`/`randomUUID`) |
| demands/[id] payment chip (§2.3) | 🔴 OPEN (FE-only — BE `payedSumMinor` exists) |
| settings/uoms fullName (§2.6) | 🔴 OPEN — no `fullName` (needs migration) |
| products/[id] tabbed widget (§3.1) | 🔴 OPEN — big refactor |
| counterparties/[id] CRM widget (§3.2) | 🔴 OPEN — big refactor |

**Genuinely-open HIGH ≈ 6** (factures · ecommerce-convert · demands-chip · uoms · products-widget ·
counterparties-widget) + productions runtime-QA + QA-verify of users/print-templates. The 1:1
distance is materially SHORTER than the inventory's headline. **Lesson: ground every inventory
HIGH against current code before implementing — the audit-doc DEFERRED sections are stale.**

### Round 2 re-validation (2026-06-13, after landing the bounded fixes)

After building the bounded ones, deeper grounding shrank the list further:

- **A5 demands chip** — ✅ DONE (`5f01a01b`).
- **A1 factures detail** — ✅ built (`6b6951ee`, static-green; render-verify pending dev restart).
- **A2 ecommerce convert** — ⛔ OUT of 1:1 scope (ecommerce/orders is an added-feature; OnlineOrder
  has free-form `customerName`/`items: Json` with no Counterparty/Product FK — converting is a
  design-gated added-feature task, not a parity gap).
- **B3 uoms fullName** — ⚠️ NOT a clean gap: the list already shows «Полное наименование» (mapped to
  `description`) + Краткое (`name`) + Цифровой код (`code`). moysklad's uom API model is
  `name`+`code`+`description` (no separate shortName). The dedicated-`fullName` restructure the audit
  proposed is **capture-gated** (needs the moysklad uom edit-form to decide fullName+shortName vs
  name+description) + migration — DEFER, don't guess a data-model split.

**NET — the genuinely-open, in-scope, actionable HIGH work is essentially just the TWO big Phase-3
refactors:** B5 products/[id] tabbed widget + B6 counterparties/[id] CRM activity widget — **both
design-gated** (large UX rebuilds + backend, multiple valid approaches → need a design decision).
Everything else is done, out-of-scope, capture-gated, or verification-pending (dev restart). The
remaining campaign therefore = **(1) the 2 design-gated refactors, (2) render/runtime verification
[dev restart], (3) the Phase-4 module QA tail (62 pages, surfaces MED/latent), (4) Track-0 captures
[user login].** Three of those four need the user; the QA tail needs a working dev server + browser.

### Round 3 — the 2 big refactors BUILT + browser-certified (2026-06-13 continuation)

A grounding workflow (6 agents) first re-confirmed the map: most "open" HIGH were already done
(1.3 money-doc History 7/7 entities; 3.3 users admin; 3.4 print-templates editor — all cited
file:line); gated = factures-/new (migration+soliq+capture), 1.5 per-row stock cols (per-store
endpoint+capture), 3.5 discounts (BE data-model), 3.6 boms multi-output (new data-model). Then BOTH
design-gated refactors were built (the structure was dictated by the Track-0 captures, so no open
design decision remained):

- **§3.2 B6 counterparties/[id]** — «Доступ» editors (Сотрудник/Отдел/Общий доступ, `fc9833ac`; the
  handoff's "schema accepts ownerId" was WRONG — ownerId was in the FILTER schema, not the
  write-path; added BE write-path, live smoke 8/8) + **CRM activity widget** (`4212b9d6`) — 5
  DOM-grounded tabs (События/Задачи/Документы/Файлы/Показатели); Документы = a 5-endpoint agentId
  fan-out, browser-certified with a real 2-doc merged/sorted/localized table. (Earlier this campaign:
  «Статус» dropdown `f1249103`.)
- **§3.1 B5 products/[id]** — **right tabbed widget** (`4def2696`) — 7 DOM-grounded tabs
  (Цены/Модификации/Аналоги/Упаковка/Остатки/История/Файлы); backable tabs wired
  (prices/variants/stock/history/files), Аналоги+Упаковка are honest empty placeholders.
  Browser-certified (prices money + per-store stock).

**Both refactors are now BUILT + browser-certified for render + wired tabs.** What remains for each:
the **backend tabs** — B5 Аналоги/Упаковка modules + История purchase/sale breakdown; B6 a full
cross-document aggregator + Договоры/Операции-с-баллами sub-tabs. Plus B6 left slices «Группы» picker
(S14) + «+ Расчётный счёт» CRUD (S18, BE already exists). So the "2 design-gated refactors" line of
the remaining campaign is closed at the widget-shell level; only their backend-feed tabs + the
Phase-4 QA tail + Track-0 re-captures (user) remain.

### Round 4 — bounded HIGH/MED closed + first Phase-4 QA cohort (2026-06-13 continuation, 5 commits)

Session goal (user): «to'liq 1:1, sifat birinchi, workflow agentlarni ko'p ishlat». Delivered 5
browser-certified commits + a 16-agent adversarial-QA cohort. A grounding workflow (12 agents) first
re-mapped every remaining item → the falsifiable execution queue below.

- **§2.6 uoms «Полное наименование»** (`59af5b4c`) — new+[id] edit forms finally bind `description`
  (BE always accepted it; the form never exposed it). Capture-grounded field order. Live: create
  round-trip + clear-field; clear-field guard 40.
- **§3.2 S18 «Расчётные счета» inline CRUD** (`4d5de09e`) — new BankAccountsSection (add/edit/delete
  over the already-wired BE). Live full CRUD cycle (201/200/200, zero 5xx). 7 grounded fields;
  bankInn/swift omitted (not in moysklad's account model). Guard 10.
- **B6 «Документы» widget 5→18 doc-types + captured 7-column table** (`4f7c3e23`) — Тип·Номер·Время·
  Организация·Сумма·Валюта·Статус (verify-cp-doc-endpoints workflow confirmed all 18 lists accept
  agentId + uniform shape). Live: 3 NEW-type docs the old version missed render; 18/18 fetches 200.
  Guard 20. (Договоры/Операции-с-баллами sub-tabs DEFERRED — no DOM-grounded columns.)
- **B5 «История» = purchases/sales movement tables** (`a289e465`) — new read-only GET
  /reports/product-movement (SupplyPosition→Закупки, DemandPosition→Продажи), 7 grounded columns;
  replaced the audit-feed История. qty is Decimal(20,6)→×1000 integer-milli (precision-safe). ALSO
  fixed a typecheck regression in the B6 commit's guard test (lint-staged runs biome not tsc → it
  slipped; honest correction). Live: endpoint 200 + 2-section structure; populated rows source-verified
  (sparse demo movement data).
- **Phase-4 reports adversarial QA** (`cb835a9d`) — a 16-agent workflow over /reports/* surfaced **49
  findings (15 HIGH)** → `_PHASE4-REPORTS-QA-2026-06-13.md`. Fixed the unambiguous cluster: **2 crash
  classes** (BigInt-on-Decimal qty in sales-by-channel/hour; store-filter SQL-string-as-param 500 in
  slow-movers/inventory-variance), **3 fan-out revenue** (sales-by-channel/hour/average-basket), **2
  ×100 display** (returns-ratio 1000%→%, abc 8000%→%). Live: sales-by-channel renders with data (no
  500), inventory-variance?storeId→200, abc 100.00% (was 8000%). Guard 9; report vitest 150.

**Track-0 capture (user logged into the LIVE paid moysklad.uz, climart_santex_group):** one finding
captured — the live factureout create form is **header-only (Организация/Контрагент/Договор/Валюта/
НДС/Статус/Доступ), NO manual-positions table** → factures /new is a **from-source document, NO
FacturePosition migration** (the OLD `.ru` capture showing editable positions was misleading). Deep
GWT field-extraction proved mechanically slow via automation; the other contaminated-module captures
(pricetype, settings-finance, packaging-tab, discounts rules, boms enum) were NOT completed and remain
TODO for a dedicated capture pass (the moysklad.uz login session lasts ~24h).

**Round 4 follow-up (same day):** the **date-tz bug-class is now FIXED** (`07861c58`) across 6 services
(report.service/cash-flow/pnl/profitability/purchase-management/unit-economics) — new tested
`reportDateBounds` util gives the Asia/Tashkent (UTC+5, no DST) half-open `[gte, lt)` window; live
single-day cert on /reports/sales (last day now fully included). The to/from-convention reports
(abc/returns-ratio/sales-by-channel/-hour/inventory-variance/average-basket) default `to` to now so
don't manifest with the default range — a follow-up.

**Round 5 (2026-06-13, `8c311f54`) — the to/from date-tz follow-up is DONE → the report date-tz
bug-class is now closed across the whole report module.** The six from/to-convention services
(abc-analysis / returns-ratio / sales-by-channel / sales-by-hour / inventory-variance /
average-basket) parsed a date-only `to` as UTC midnight and filtered `moment <= to`, dropping the
last picked Tashkent calendar day. All six now route through the shared `reportDateBounds`
half-open `[gte, lt)` window (the same util the Round-4 dateFrom/dateTo six adopted). A source-scan
guard (`report-date-tz-class.test.ts`, 24 assertions) pins the class so no service can regress to
`moment <= to`; a completeness grep confirms zero remaining `moment <=` day-droppers in the module.
Live smoke (`verify-report-date-tz-smoke.mjs`, 9/9 vs api:4000+DB): a demand posted *today*
(Tashkent) now appears in `from=to=today` on all six reports (the old bound excluded it), abc is
bounded on both sides (tomorrow + yesterday exclude), and sales-by-channel/-hour return 200 on real
qty data (re-confirming the `cb835a9d` BigInt fix). **Observed, NOT yet grounded (separate
follow-up):** inventory-variance `totalVarianceCostMinor` came back 0 for a real shortage in the
smoke — the inventory position's `cost_minor` may not be snapshotted (variance qty is non-zero but
`ABS(Δ)×COALESCE(cost,0)=0`); needs grounding vs whether moysklad shows a variance cost column.
factures /new (Round-4 #1) was RE-GROUNDED as capture-gated, not cleanly actionable — Track-0
captured the *finding* (header-only form, no positions) but not the full create-form DOM, so a
faithful build needs the exact field set + a possible Договор `contractId` migration; deferred over
guessing (§4).

**Round 5 pt2 (2026-06-13, `bb86188f`) — demands (Отгрузка) Phase-2 QA started: 2 HIGH /new
silent-drops fixed + a full 6-lens adversarial audit.** Picked demands as the highest-leverage page
(central money document; feeds 5 reports). **Fixed (live smoke 4/4):** `/demands/new` POSTed
`organizationAccountId` («Счёт организации», a FILTER-only schema field) and `deliveryPlannedMoment`
(«План. дата отгрузки», no column) — Zod stripped both → silent data loss. Added to the write schema
+ create()/update() persist; new nullable column migration `20260613100000`; DOM-grounded label
«План. дата отгрузки». Same class as B6 «Доступ» ownerId (a Filter-schema field ≠ writable).
**Audit (workflow `wf_c195ba88-852`, 6 lenses × refute-default blind-verify, 39 agents): 33 raw → 25
confirmed / 8 refuted** (committing the fix BEFORE the resume let blind-verify read the fixed code
and refute the 3 already-fixed findings — multi-agent-safety confirmed). **Open: 4 distinct HIGH** —
(1) 3-decimal money truncation vs 6-decimal stock/FIFO (billed qty ≠ shipped/costed; APP-WIDE across
9 FE forms + print-render); (2) detail totals sidebar hardcodes «сум» (13 doc detail pages); (3)
position discount has no >100% upper bound (negative sumMinor); (4) OWN/OWN_GROUP record scope never
enforced (any user reads/mutates every tenant demand — project-wide security gap) — plus 10 MED + 7
LOW. Full enumeration: `_DEMANDS-PHASE2-QA-2026-06-13.md`. demands is NOT yet "Phase-2 verified".

**Round 5 pt3 (2026-06-13, `18626d51`) — demands HIGH #1 «3-dp money truncation» CLOSED app-wide.**
The position line-total idiom `(minorPerUnit * BigInt(Math.round(qty*1000)))/1000n` truncated the
quantity to 3 decimals before multiplying, while the schema, stock ledger and FIFO keep 6 — so the
**billed line total silently diverged from the shipped/costed quantity** (qty `0.0004` billed 0 but
shipped & cost 0.0004 units). A new shared `@moysklad/money` primitive
`scaleMinorByQty(minorPerUnit, qtyString)` (6-dp parse + round-half-up tiyin) replaces the idiom at
**27 sites** (15 BE services incl. internal-order, 10 FE `/new` editors, 2 DS editors), each sourcing
the original decimal STRING. `@moysklad/money` internal imports aligned `.ts`→`.js` (the `@moysklad/db`
convention) so the NodeNext api can consume the shared primitive; added as a workspace dep of
`@moysklad/ui`. Gate: tsc 0 (×4) · biome 0 · money 50 · ds 128 · **api 3049 (+55 class-lock,
non-vacuous) / 0 fail** · web 2278 (1 pre-existing B5 fail, unrelated). Live
(`verify-money-line-scale-smoke.mjs`, api:4000+DB) **3/3**: a demand AND an internal-order with qty
`0.0004`+`3.333333` store `sumMinor=333433` (6-dp), provably not the legacy 3-dp `333300`. An
**adversarial verification workflow** (5 lenses, blind-verify, 11 agents) caught a real miss — the
internal-order BE `computeTotals`, hidden from the first grep by a nested `Number(...)` paren + the
`1_000` underscore separator — which was fixed and class-locked; it refuted 5 others (EDO/BOM are
6-dp + informational, out of scope; the double-round display divergence is pre-existing). **Doc:
`_MONEY-LINE-SCALE-2026-06-13.md`.** demands HIGH #2/#3/#4 (sidebar «сум» / discount upper-bound /
OWN-scope) + the double-round single-round unification remain open, each a fresh flagship.

**Round 5 pt4 (2026-06-13) — 3 of the 4 remaining demands HIGH closed; the 4th is a grounded
NON-build decision.** A 4-agent grounding workflow (`wf_915a8273-923`) scoped all four, then:
- **§HIGH-2 sidebar currency (`0c365417`)** — `DetailTotalsSidebar` now takes a `currency` prop
  (default UZS) threaded into its 4 formatMoney calls + `currency={data.currency}` from the 9
  money/internal detail pages; added `currency` to the 6 detail types that lacked it (findById already
  returns it). Sidebar test 9/9 (USD ≠ «сум»); live smoke (USD demand → currency=USD).
- **§HIGH-3 discount cap (`c26f27f7`)** — shared `discountPercent` (regex + refine ≤100) across the 8
  unbounded doc schemas (customer-orders already capped); guard 26; live smoke (discount 150 → 400).
- **§double-round (`b1eae7be`)** — routed the 8 doc `computeTotals` + retail compute-positions +
  print-render through the single-round `computePositionTotal`, so stored sumMinor == server PDF ==
  React browser-print. api 3075/0-fail (0 test breaks, as grounded); money guard +1 (9002 single, not
  9001 double); live smoke G. Cost lines keep scaleMinorByQty; PO/CO cascades left as a follow-up.
- **§HIGH-4 OWN/OWN_GROUP scope — NOT BUILT (NEEDS_USER_DECISION).** Grounding proved the scope helpers
  are dead code (NO api service enforces record-scope; demands already match the convention), and
  `Demand.groupId` is never written → enforcing OWN_GROUP would hide demands from managers (the exact
  regression). It is a cross-cutting RFC (groupId data-model + backfill + ~60 entities), not a one-page
  fix — building it naively would break the app. Surfaced to the user for the product/architecture call.

**Still open after Round 5 (honest):** ~27 remaining MED/LOW report findings (aging hardcoded-UZS
currency leak, pnl returns-COGS asymmetry, cash-flow bucket-UTC, slow-movers per-unit-cost dup,
variant stock name/404-link, …) — the 6 from/to date-tz findings are now resolved (Round 5);
factures /new (capture-gated — needs the full create-form DOM + possible Договор migration, NOT
the actionable "from-source" the Round-4 note assumed); boms multi-output + discounts typed editors
(migration/data-model, user approved migrations); B6 Договоры/Операции sub-tabs + B5 Упаковка/Аналоги
(capture-gated columns); the rest of the Phase-4 QA tail (settings-finance, crm, money-periphery,
production, payrolls cohorts); label re-grounding vs the remaining fresh captures.

> **⚠️ Parallel-session note (2026-06-13):** the user works in other sessions too. This
> campaign commits ONLY its own files, never reset/rebase/revert shared history, and re-reads
> NEXT.md/MEMORY.md/progress.json fresh before touching them (multi-agent wiring protocol).

## Honest bottom line

Reaching certifiable 1:1 is **bounded and enumerated** — there are no unknown-unknowns left at the
page level (the inventory swept all 78). The work is: **6 cross-cutting fixes + 18 HIGH + ~106 MED +
62 runtime-QA passes + a capture re-harness**. The two hard dependencies are **backend work** (activity
feeds, per-row stock, print-templates, admin) gating the big refactors, and **Track-0 captures**
gating label certification. Done in phase order, every section reaches 1:1 — and the plan says
exactly when each one does.
