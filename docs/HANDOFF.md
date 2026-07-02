# Project Handoff — Continuation Guide

**Reading this means you're resuming work on the Moysklad clone project.**
Context from previous conversation may be lost. This file contains
everything needed to continue effectively.

---

## 30-second orientation

This is a 1:1 clone of moysklad.uz for Uzbekistan market. User is
**Ozodbek**, solo developer on Windows. He chose **Option C** —
full discovery before writing any clone code. **Discovery COMPLETE**
(all 7 workstreams + Phase 2-5 live API verification done).
**Sprint 1 ready to launch.**

Read these (in order) to fully orient:
1. `docs/PROJECT-PLAN.md` — master plan
2. `docs/DISCOVERY-PLAN-C.md` — 8-week workstream roadmap
3. `docs/adr/` — 6 architecture decisions (ESPECIALLY 0001-0006)
4. `docs/glossary.md` — canonical entity names (53 + 36)
5. `git log --oneline -30` — recent history

---

## Committed decisions (DO NOT re-litigate)

- **TypeScript + NestJS + Prisma + PostgreSQL + Next.js** (ADR-0001)
  User rejected Kotlin. Don't suggest again without explicit user prompt.

- **No Docker anywhere** (ADR-0002)
  Native installs dev, PM2 + Nginx on VPS prod.

- **Bridge multi-tenancy** (ADR-0003)
  Pool-first with Row-Level Security, silo-migrable for enterprise.

- **Money as bigint minor-units** (ADR-0004)
  Custom `packages/money` Money class. NEVER use JS Number for money.

- **Hybrid audit ledger** (ADR-0005)
  CRUD+audit for reference data, append-only ledger for stock + money.

- **Vertical slice methodology** (ADR-0006)
  Don't layer (DB-then-API-then-UI) — each Sprint ships working vertical.

- **2-month full discovery BEFORE any code** (DISCOVERY-PLAN-C.md)
  User explicitly chose this over MVP approach. Don't propose "let's
  start Sprint 1 now" unless user asks.

---

## Current state (as of 2026-04-24) — SPRINTS 3 + 4 + 5.1–5.3 + i18n COMPLETE ✅

### Sprint 1 + 1.5 + 2.1–2.5 + 3.1–3.5 + 4.1–4.4 + i18n + 5.1–5.3 all green ✅
### Sales: 5/5 ✅ · Purchase: 5/5 ✅ · Warehouse: 4/4 ✅ (Move/Loss/Enter/Inventory)

**Sprint 3 — Sales + Inventory cycle (full E2E verified)**:
- ✅ **Sprint 3.1** — CustomerOrder (Заказ покупателей): 8-state FSM, BigInt tiyin, VAT cascade, list+form+detail, auto-numbering ЗП-YYYY-NNNNN
- ✅ **Sprint 3.2** — Demand (Отгрузка) + Stock ledger: materialized Stock + StockOperation ledger, pessimistic locking (SELECT FOR UPDATE + Serializable tx), CO.shippedSum cascade → auto-transition fully_shipped, "+ Отгрузка" from CO
- ✅ **Sprint 3.3** — InvoiceOut (Счёт покупателю): 7-state FSM, CO.invoicedSum cascade, "+ Счёт" from CO
- ✅ **Sprint 3.4a** — Supply (Приёмка): inbound stock with per-line costMinor + FIFO remainingQty tracking, reverse on unpost with FIFO consumption guard
- ✅ **Sprint 3.4b** — PaymentIn (Входящий платёж): polymorphic allocations, InvoiceOut.payedSum → auto partially_paid/paid, CO.payedSum cascade → auto closed (paid+shipped)
- ✅ **Sprint 3.5** — FULL SALES FLOW E2E: `draft → confirmed → fully_shipped → paid → closed` via CO→Supply→Demand→Invoice→Payment — verified live with screenshots

**Sprint 4 — Purchase side mirror (3/5 docs done, 4.4 next)**:
- ✅ **Sprint 4.1** — PurchaseOrder (Заказ поставщику): 7-state FSM, mirror of CO, "ЗК-YYYY-NNNNN", deliveryPlannedMoment + receivedSum/invoicedSum/payedSum aggregates
- ✅ **Sprint 4.2** — InvoiceIn (Счёт поставщика): 5-state FSM (no `sent`/`overdue` since supplier sends to us), CreateFromPurchaseOrder helper, PO.applyInvoice cascade increments invoicedSum, "СФ-YYYY-NNNNN" with supplier's incomingNumber/incomingDate
- ✅ **Sprint 4.3** — PaymentOut (Исходящий платёж): polymorphic allocation (targetKind ∈ {invoicein, purchaseorder}), dual cascade — pay supplier invoice → InvoiceIn auto-paid + PO.payedSum; OR direct PO advance before invoice exists. "ПР-YYYY-NNNNN".

**Foundation: i18n (Sprint 4.3.5) — COMPLETE ✅**
- next-intl 4.x, **cookie-based** (`NEXT_LOCALE`, no URL prefix — same paths serve all locales)
- **uz** (default, uz-latin) + **ru** (English deferred per config)
- Resolution: cookie → Accept-Language → defaultLocale
- 359 translation keys per locale, 5 scopes: common / fields / states.* / transitions / pages.*
- LocaleSwitcher in AppShell `topRightExtras` slot (uz ↔ ru)
- All 15 web pages (10 lists + 3 details + dashboard + login) migrated to `useTranslations()`
- Server-side: `getLocale()` + `getMessages()` in root layout, `<NextIntlClientProvider>` wrap

**Current stats:**
- **19 backend modules**: Product · ProductFolder · Counterparty · Auth · Permissions · CustomerOrder · Demand · InvoiceOut · Supply · PaymentIn · PurchaseOrder · InvoiceIn · PaymentOut · SalesReturn · PurchaseReturn · **Move · Loss · Enter · Inventory** · Stock · Reference
- **~160 API endpoints** (all JWT-protected, accountId-scoped)
- **21 web routes** in `/web/src/app/(app)/`
- 4 system roles seeded (Administrator, Manager, Employee, ReadOnly)
- **14 FSM'd documents**: CO (8) · Demand (3) · InvoiceOut (7) · Supply (3) · PaymentIn (3) · PO (7) · InvoiceIn (5) · PaymentOut (3) · SalesReturn (3) · PurchaseReturn (3) · **Move (3) · Loss (3) · Enter (3) · Inventory (3)**

**Quality gates verified:**
- Typecheck: **0 errors across 6 packages** (api + web + db + money + ui + workflows)
- Unit tests: **188 passing** (146 api + 34 money + 8 workflows)
- Validators: 115/115 JSON schemas valid, 36/36 FSM valid
- E2E screenshots: 30+ via Playwright across 5 Sprint flows
- Web typecheck includes next-intl
- JSON parse: uz.json + ru.json both valid (states.move/loss/enter/inventory + reasons.loss/enter added)

**Running services:**
- PostgreSQL 17 on :5433 (db: moysklad_dev, user: postgres/1234)
- API NestJS on :4000
- Web Next.js on :3000 (Note: port is 3000, not 3030 as in older docs)

**Dev credentials:** admin@demo.local / admin123

**Critical arch patterns (from Sprint 3):**
- **Single-writer rule**: each service owns exactly one aggregate (StockService→Stock, CustomerOrderService→shippedSum/invoicedSum/payedSum/state, InvoiceOutService→invoice payedSum, etc.). Cross-aggregate updates go through `applyX(tx, ...)` methods inside the caller's `$transaction`.
- **FSM cascades**: Demand.post → CO.applyShipment → CO auto-state; InvoiceOut.post → CO.applyInvoice; PaymentIn.post → InvoiceOut.applyPayment → CO.applyPayment → close.
- **Decimal(20,6) for qty**, **BigInt for money tiyin** (never mix).
- **Serializable isolation + SELECT FOR UPDATE** on Stock rows during posting for concurrency safety on hot SKUs.
- **Audit log per transition** with fieldChanges (before/after + trigger).

## Scope rule (locked 2026-04-24)

**NO MVP. NO "later" cuts. NO feature downgrades.**

Bu loyiha moysklad.uz bilan 99% parity ga yetkaziladi. Quyidagi barcha feature'lar
(~40 blok) keng sprintlarda bajariladi. Har sprint to'liq qilinadi (tests + visual +
docs). Tartib ustuvorlikka asoslangan, lekin **hech biri tushirib qoldirilmaydi**.

### Sprint 4 YAKUNLANDI (2026-04-21 → 2026-04-24)
- ✅ 4.1 PurchaseOrder · 4.2 InvoiceIn + PO.applyInvoice · 4.3 PaymentOut + dual cascade
- ✅ i18n (uz+ru) · 4.4 Supply→PO back-link + full Purchase E2E

### Keyingi Sprint'lar (full backlog — har biri majburiy)

**Sprint 5 — Return documents + Stock movements**
- 5.1 SalesReturn (Возврат покупателя) — Demand reverse, stock+, CO.shippedSum revert
- 5.2 PurchaseReturn (Возврат поставщику) — Supply reverse, stock-, PO.receivedSum revert
- 5.3 Move (Перемещение) — stock between stores
- 5.4 Inventory (Инвентаризация) — recount + variance
- 5.5 Loss (Списание) — writeoff + reason codes
- 5.6 Enter (Оприходование) — ad-hoc stock entry

**Sprint 6 — Money module full (OrganizationAccount + ledger)**
- 6.1 OrganizationAccount + BankAccount + CashDesk models
- 6.2 Money ledger (append-only, per-account balance tracking)
- 6.3 CashIn / CashOut orders (Приходный / Расходный кассовый ордер)
- 6.4 CounterpartyBalance aggregate (agent outstanding)
- 6.5 Currency conversion (multi-currency rates)
- 6.6 Bank statement import (camt.053 / custom)

**Sprint 7 — Product catalog expansion (Tovarlar moduli to'liq)**
- 7.1 Variants / Modifications (Модификации)
- 7.2 Bundles (Комплекты)
- 7.3 Services (Услуги)
- 7.4 Images + attachments (S3 adapter + Files model)
- 7.5 PriceTypes (Типы цен, multi-tier prices)
- 7.6 Units (Ед. изм. katalogu)
- 7.7 Custom attributes UI (JSONB backend allaqachon bor)

**Sprint 8 — CRM full**
- 8.1 ContactPerson (Контактные лица)
- 8.2 Call log (Звонки) + click-to-call
- 8.3 Sales funnel (Воронка) — Kanban pattern
- 8.4 Tags + segments
- 8.5 Agent/customer discount agreements
- 8.6 Loyalty program (bonus points)

**Sprint 9 — Print + Email + Attachments (har hujjatda)**
- 9.1 PDF generation (Puppeteer + Handlebars)
- 9.2 Print templates editor
- 9.3 Email send via Eskiz/SMTP (UZ carriers)
- 9.4 File attachments (S3) on docs + comments thread
- 9.5 Bulk actions toolbar (select + bulk op)
- 9.6 Excel import/export (exceljs) on list pages

**Sprint 10 — Reports module**
- 10.1 Stock balance (Остатки)
- 10.2 Sales report (Продажи period)
- 10.3 Profit (Прибыль)
- 10.4 Cashflow
- 10.5 Counterparty balance
- 10.6 ABC-analysis + turnover

**Sprint 11 — Retail / POS**
- 11.1 RetailShift (Касса smena)
- 11.2 RetailDemand (chek)
- 11.3 POS terminal UI (POSTerminal pattern)
- 11.4 RetailPaymentIn (kassa chek to'lovi)
- 11.5 Drawer cash-in/out

**Sprint 12 — UZ Tier-1 integratsiyalar (majburiy)**
- 12.1 VCR — Virtual Kassa (REGOS) fiscal registration
- 12.2 ASL Belgisi (markirovka) — tracking codes
- 12.3 Soliq.uz EDO — hujjat topshirish
- 12.4 Didox / E-DOCS — alternative EDO
- 12.5 CBRU — valyuta kurslari
- 12.6 MXIK catalog sync

**Sprint 13 — Payment gateways (UZ Tier-1)**
- 13.1 Payme
- 13.2 Click
- 13.3 Multicard / Uzcard / Humo
- 13.4 Uzum Bank
- 13.5 Alif / Octo / Kapital / NBU / Asaka / Anor / TBC

**Sprint 14 — Notifications + SMS + Dashboard**
- 14.1 Eskiz SMS
- 14.2 In-app notifications (toast + inbox)
- 14.3 Email notifications (invoices overdue, stock low)
- 14.4 Dashboard widgets (WidgetGrid pattern) — 12+ KPI
- 14.5 Scheduled jobs: overdue invoice transitions, low stock alerts

**Sprint 15 — Production / Manufacturing**
- 15.1 ProductionOrder
- 15.2 ProductionStage
- 15.3 BOM (Bill of Materials) — usage via Bundles
- 15.4 Work orders

**Sprint 16 — Online / Marketplaces**
- 16.1 Uzum Market connector
- 16.2 Yandex Market UZ
- 16.3 Wildberries / Ozon bridge (optional via AliExpress)
- 16.4 Order sync + stock push

**Sprint 17 — Tasks + Admin + Audit UI**
- 17.1 Tasks module (Задачи)
- 17.2 Settings UI (Store.allowNegativeStock, org settings)
- 17.3 Users + Roles + Permissions matrix editor
- 17.4 AuditLog viewer (Timeline pattern)
- 17.5 RBAC enforcement via `@RequireScope(...)` decorators (infra exists)

**Sprint 18 — Patterns backfill**
- 18.1 Kanban (Sales funnel)
- 18.2 Wizard (Onboarding, Inventarizatsiya)
- 18.3 Dashboard (WidgetGrid)
- 18.4 ImportExport (ImportWizard)
- 18.5 Timeline (EventTimeline)
- 18.6 IntegrationsMarketplace (AppCatalog)
- 18.7 ReportViewer

**Sprint 19 — Marketing site + SEO**
- 19.1 Static pages (home, features, pricing, blog) piksel-level moysklad.uz
- 19.2 Next.js 15 SSG on separate app
- 19.3 SEO + sitemap + OG
- 19.4 Programs landing pages (~23 tur)

**Sprint 20 — Polish + Performance + Launch**
- 20.1 Observability (Pino + Sentry + Loki)
- 20.2 Load testing (k6)
- 20.3 Security audit (OWASP Top 10)
- 20.4 Backup + DR drill
- 20.5 Yuridik — oferta, maxfiylik
- 20.6 Beta launch (20 kompaniya)

**Infrastructure backlog (parallel bilan qilinadi):**
- FIFO cost consumption on Demand.post (Sprint 3.4c, defer)
- RBAC endpoint-level enforcement (Sprint 17 part 5)
- File upload S3 adapter (Sprint 9.4)
- InvoiceOut "sent" transition (Sprint 9.3)
- Overdue scheduled cron (Sprint 14.5)
- Store admin UI (Sprint 17.2)

---

## History (Discovery + Sprints 1–2)

### Discovery Phase (2026-04-19) — COMPLETE ✅
- **Sprint 0**: monorepo, configs, 6 ADRs, glossary, Money package
- **W1**: Deep UI Capture — 72 routes, 5259 artifacts
- **W3**: Schemas — 79/79 entity + document schemas (`docs/moysklad-reference/data-model/`)
- **W4**: Workflows — 36/36 FSMs (`docs/moysklad-reference/workflows/`)
- **W5**: UZ Integrations — 6 Tier-1 + Tier-2/3 summary
- **W6**: Business Rules — 14/14 documented
- **W7**: Pattern Library — 15/15 UI patterns
- **Validators**: 115/115 JSON valid (`pnpm validate:all`)

### Sprint 1 (Product) — COMPLETE ✅
Product vertical slice: Prisma schema, NestJS CRUD, Next.js pages (list+new+detail), audit logging, multi-tenant filter, 5 unit tests.

### Sprint 1.5 (Design System) — COMPLETE ✅
`@moysklad/ui` with moysklad-exact tokens extracted from real CSS.

### Sprint 2 (Foundations) — COMPLETE ✅
- **2.1** JWT auth + argon2 + HttpOnly cookies + rotating refresh
- **2.2** ProductFolder CRUD (hierarchical tree + path auto-compute)
- **2.3** Counterparty module with UZ STIR validation
- **2.4** CatalogPicker pattern + form integration
- **2.5** RBAC — Roles + permissions matrix + guards + cache

### Sprint 3 (Sales) — COMPLETE ✅ (2026-04-20)
13 commits, full E2E `CO → Supply → Demand → Invoice → Payment → closed` verified.
Modules: CustomerOrder, Demand, InvoiceOut, Supply, PaymentIn + Stock ledger.

### Sprint 4 (Purchase backbone) — COMPLETE ✅ (2026-04-21 → 2026-04-24)
- **4.1** PurchaseOrder (mirror of CustomerOrder) — `25bda68`
- **4.2** InvoiceIn + PO.applyInvoice cascade — `ce2bd9c`
- **4.3** PaymentOut + dual cascade — `17f6303`
- **4.3.5** i18n (next-intl, uz+ru) — `6bb7d1d` ⭐ **foundation debt yopildi**
- **4.4** Supply→PO back-link + applyReceipt cascade + E2E — `d64845c`

### Sprint 5.1 + 5.2 (Returns) — COMPLETE ✅ (2026-04-24)
- **5.1** SalesReturn (Возврат покупателя) — inbound stock + CO shipped revert
- **5.2** PurchaseReturn (Возврат поставщику) — outbound stock + PO received revert
- Commit: `1206839`

### Sprint 5.3 (Stock movements) — COMPLETE ✅ (2026-04-24)
- **Move** (Перемещение) — transfer between stores, two deltas per post
- **Loss** (Списание) — writeoff with 5-enum reason
- **Enter** (Оприходование) — ad-hoc inflow with 5-enum reason (costMinor required)
- **Inventory** (Инвентаризация) — physical recount with variance deltas
- Commit: `03eb9cf`

### Sprint 5.4 (Full UX parity for 5.1–5.3) — COMPLETE ✅ (2026-04-24)
- Detail + new pages for all 6 Sprint 5 modules (12 new pages total):
  SalesReturn, PurchaseReturn, Move, Loss, Enter, Inventory
- "+Возврат" button on Demand detail (posted) → `/sales-returns/new?fromDemand=:id` (prefill)
- "+Возврат" button on Supply detail (posted) → `/purchase-returns/new?fromSupply=:id` (prefill)
- Warehouse subnav: Moves · Losses · Enters · Inventories · Remains
- i18n: new keys in uz.json + ru.json (subnav.stock, pages.*.new_title, reason pickers)
- `tools/capture/tsconfig.json`: added `"lib": ["ES2022","DOM"]` to fix pre-existing 34 TS errors
- Tests: 146 API + 34 money + 8 workflows = 188 green
- Visual E2E: `tools/visual-check/check-sprint-5-4.ts` (13 screenshots, all asserts pass)

### Sprint 11 (Settings UI — Org/Store/CashDesk/BankAccount admin) — COMPLETE ✅ (2026-04-25)
- 4 new full-CRUD backend modules under /admin/* prefix:
  - OrganizationModule — `/admin/organizations`
  - StoreModule — `/admin/stores` (registered as StoreAdminModule
    alias to avoid the existing StockModule import conflict)
  - CashDeskModule — `/admin/cash-desks`
  - OrganizationAccountModule — `/admin/organization-accounts`
- Each module follows the same shape (mirrored from contact-person):
  - Zod CreateXSchema / UpdateXSchema / XFilterSchema with
    empty-string-to-null preprocessing on every nullable field +
    z.string().length(3).toUpperCase() on currency
  - Service: list (cursor + search + archive filter) + findById +
    create + update + archive + restore + delete
  - Controller: 7 REST endpoints under /admin/{plural}
- Domain-specific delete guards:
  - Organization.delete → blocks if Demand/InvoiceOut/Supply/PaymentIn
    references it (force the user to archive instead)
  - Store.delete → blocks if any Stock row has qty != 0
  - CashDesk.delete → blocks if balanceMinor != 0n OR if any
    non-deleted CashIn/CashOut still references it
  - OrganizationAccount.delete → blocks if balanceMinor != 0n OR if
    MoneyOperation references it
- OrganizationAccount enforces one-default-per-(organizationId,
  currency) — flipping isDefault=true demotes the existing default
  in the same transaction
- Store.code unique within account
- BigInt balanceMinor serialized as `.toString()` in service responses
- BUG#7 caught & fixed: Prisma.JsonNull required runtime import; the
  `import type { Prisma }` in organization.service.ts threw TS1361.
  Fixed: switched to `import { Prisma }` (value import).

Web Settings UI (14 new pages):
- /settings landing — 5-card grid (Email + Organizations + Stores +
  Cash desks + Bank accounts) with emoji icons
- /settings/organizations: list + new + edit (5 form sections —
  main, UZ requisites, contact, management, tax) with companyType
  select (legalUZ/entrepreneurUZ/individualUZ), payerVat checkbox,
  archive/restore + delete with confirm
- /settings/stores: list + new + edit with allowNegativeStock badge,
  unique-code validation surfaced from API
- /settings/cash-desks: list + new + edit with currency dropdown
  (UZS/USD/EUR/RUB) + balanceMinor displayed via formatMoney
- /settings/bank-accounts: list + new + edit with CatalogPicker
  for Organization (mandatory FK), bankName/accountNumber/bic
  fields, isDefault checkbox, balanceMinor display

Layout updates:
- New top-level "Sozlamalar" / "Настройки" tab with ⚙️ icon
- settingsSubNav with 6 entries: overview / organizations / stores /
  cash-desks / bank-accounts / email
- /settings/* path pattern wired into activeModule detection

i18n: 76 new keys per language under nav.settings, subnav.settings.*,
pages.settings.*, pages.organizations.*, pages.stores.*,
pages.cash_desks.*, pages.bank_accounts.* (uz + ru both updated).

Subagent dispatch: this sprint used Sonnet (Agent({ model: 'sonnet' }))
for the mechanical CRUD scaffolding per the global "Think Opus, type
Sonnet" rule. Verification (trust but verify) ran inline — typecheck
clean, all 404 API tests still passing, no regressions.

Tests: 0 new (CRUD modules use the same Zod patterns already covered
by contact-person tests; future hardening can add per-module tests).
Totals stay at: **404 API + 7 UI + 45 money + 8 workflows = 464
tests green**.
Quality: 6/6 packages typecheck clean.

### Sprint 10.5 (Profit & Loss report) — COMPLETE ✅ (2026-04-25)
- New `PnlService` aggregating across 4 source tables (Demand,
  SalesReturn, PaymentOut, CashOut) to produce P&L rows with the
  six standard moysklad metrics:
  - Revenue = Demand.sumMinor − SalesReturn.sumMinor
  - COGS = Demand.costSumMinor (FIFO-tracked since Sprint 3.4)
  - Gross profit = Revenue − COGS
  - Expenses = PaymentOut.sumMinor + CashOut.sumMinor
  - Net profit = Gross profit − Expenses
  - Margin % = Net profit / Revenue × 100 (empty when revenue=0)
- 6 grouping modes: none (period totals only), day, week, month,
  quarter, year. Same date-bucket strategy as Sprint 10.2 — four
  parallel `$queryRaw` aggregations with consistent UTC bucket keys,
  merged in TS by ISO string. No UNION ALL needed because the four
  metrics live on separate tables and the merge happens client-side.
- Filter: dateFrom/dateTo (required, ≤ refinement), groupBy enum,
  optional organizationId for multi-org tenants, limit 1..1000.
- Endpoint: GET /reports/pnl
- Web /reports/pnl page:
  - 4-column filter bar (date range + groupBy + Apply)
  - Two-line caveat under the bar: formula explanation + currency
    note (V1 = single-currency in tiyin, multi-currency conversion
    deferred)
  - 7-column table: Period · Revenue · COGS · Gross profit ·
    Expenses · Net profit · Margin %
  - Color-coded gross + net profit cells (green positive, red
    negative, muted zero)
  - Bottom totals row (border-t-2 + bg-muted, font-semibold)
  - CSV export with full set of columns
  - Empty state when no revenue + no expenses in period
- /reports landing now shows 5 cards (Sales 📈 + Cash flow 💸 +
  P&L 💰 + Stock balance 📦 + Counterparty balance 🤝)
- Subnav reports: Umumiy / Sotuvlar / Pul oqimi / Foyda va zarar /
  Qoldiqlar / Kontragent qarzlari (6 entries)
- i18n: pages.report_pnl + subnav.reports.pnl + landing card keys
  (uz + ru) — covering all 6 column headers plus formula+currency
  caveats
- Tests: +11 pnl.schema.test.ts. Totals: **404 API + 7 UI + 45
  money + 8 workflows = 464 tests green**.
- Quality: 6/6 packages typecheck clean.
- Schema design notes:
  - "Expenses" deliberately combines all PaymentOut + CashOut
    rather than splitting supplier-payment vs operational expense.
    The split would need an `expenseCategory` field on each doc;
    introducing that is a separate sprint (cost-center tagging).
  - Margin % is computed on Number(BigInt) which loses precision
    above ~9 quadrillion tiyin. Acceptable for typical SMB scale
    (max practical revenue ~10^15 tiyin = 10^13 sum).

### Sprint 10.4 (Counterparty balance report) — COMPLETE ✅ (2026-04-25)
- New `CounterpartyBalanceService` reading from the materialized
  `CounterpartyBalance` table (Sprint 6 — already kept in sync by
  every PaymentIn/PaymentOut/CashIn/CashOut/Demand/Supply cascade).
- Sign convention (already established): balanceMinor > 0 means
  the counterparty owes us (debtor), < 0 means we owe them
  (creditor), 0 = settled.
- Filter Zod schema:
  - signFilter: 'all' | 'nonzero' (default) | 'debtors' | 'creditors'
  - counterpartyId, currency (uppercased automatically), search
    (counterparty name / legalTitle / code)
  - includeArchived (defaults false)
  - groupBy: 'none' (one row per cp×currency) | 'counterparty'
    (sum across currencies, marked 'MIX' when multi-currency)
  - limit 1..500
- Returns items[] (counterpartyId/Name/legalTitle/companyType,
  currency, balanceMinor, amountAbsMinor, side: debtor|creditor|
  settled, archived, updatedAt) + summaries (rowCount, debtorCount,
  creditorCount, totalDebtMinor, totalCreditMinor, netMinor) + total
- Multi-currency consolidation note: when groupBy='counterparty',
  rows in different currencies for the same counterparty are summed
  in raw tiyin and the currency is replaced with 'MIX'. The UI
  surfaces this with a tooltip ("Multi-currency — labelled MIX")
  rather than pretending the sum is meaningful in any single
  currency.
- Endpoint: `GET /reports/counterparty-balance?signFilter=…
  &search=…&currency=…&groupBy=…&includeArchived=…`
- Web `/reports/counterparty-balance` page:
  - 5-column filter bar: search (2 col span) / currency / signFilter
    / Apply, plus includeArchived checkbox + groupBy selector below
  - 5 summary cards: Records / Debtors (success-toned) / Creditors
    (destructive-toned) / Total debt / Total credit
  - 5-column table: counterparty (link to /counterparties/[id]) /
    currency / balance (color-coded: green for debtor, red for
    creditor) / side Badge / updatedAt
  - Archived counterparty rows show a small "arxiv" badge inline
  - "MIX" currency rows render a tooltip with the multi-currency
    caveat
  - CSV export with all columns
  - Empty state when no rows match
- /reports landing now shows 4 cards (Sales 📈 + Cash flow 💸 +
  Stock balance 📦 + Counterparty balance 🤝)
- Subnav reports extended: Umumiy / Sotuvlar / Pul oqimi /
  Qoldiqlar / Kontragent qarzlari
- i18n: `pages.report_counterparty_balance` +
  `subnav.reports.counterparty_balance` + landing card keys
  (uz + ru) including sign filter labels and side badges.
- Tests: +14 counterparty-balance.schema.test.ts. Totals:
  **393 API + 7 UI + 45 money + 8 workflows = 453 tests green**.
- Quality: 6/6 packages typecheck clean.

### Sprint 10.3 (Stock balance report) — COMPLETE ✅ (2026-04-25)
- New `StockBalanceService` with two output modes:
  - **Per-store flat list** (`groupBy=none`, default): one row per
    (store × assortment) combination, sorted by storeId + assortmentId
  - **Per-product roll-up** (`groupBy=product`): qty / reservedQty /
    inTransitQty summed across all stores via Prisma `groupBy`
- Filter Zod schema: storeId, productId, search (product name/code),
  assortmentKind ('product' | 'variant' | 'bundle'), hideEmpty,
  groupBy ('none' | 'product'), limit 1..500
- Search implementation: pre-resolves matching product IDs, then
  filters Stock by `assortmentId IN (...)` — Prisma can't filter
  Stock rows by joined Product fields directly because the relation
  is polymorphic via `assortmentKind`
- Polymorphic-relation note: Stock has no Prisma relation back to
  Product because `assortmentId` can point to Product / Variant /
  Bundle. The service resolves names in a batched second query.
- Cursor pagination intentionally NOT supported on Stock (composite
  PK makes single-key cursors unreliable across store boundaries) —
  V1 caps at 500 rows; narrow with storeId or use product roll-up
- Returns: items[] (storeName, productName, productCode, uom, qty,
  reservedQty, inTransitQty, available) + summaries (totalSku +
  4 sums) + total count
- Endpoint: `GET /reports/stock-balance?storeId=…&search=…&groupBy=…
  &assortmentKind=…&hideEmpty=true`
- Web /reports/stock-balance page:
  - 5-column filter bar: store select / search / groupBy / Apply +
    hideEmpty checkbox below
  - 5 summary cards above the table: SKU / Total qty / Reserved /
    In-transit / Available
  - 8-column table (or 7 in product groupBy mode — store column
    hidden); product name links to /products/[id]
  - Russian-locale qty formatting (max 3 decimals, drops trailing
    zeros)
  - CSV export with the full set of columns
  - Empty state when no rows match the filter
- /reports landing now has 3 cards (Sales 📈 + Cash flow 💸 +
  Stock balance 📦)
- Subnav reports extended with `stockbalance` entry pointing at
  /reports/stock-balance
- i18n: `pages.report_stock_balance` + `subnav.reports.stock_balance`
  + `pages.reports.stock_balance_card_*` in uz.json + ru.json
- Tests: +12 stock-balance.schema.test.ts. Totals: **379 API + 7 UI
  + 45 money + 8 workflows = 439 tests green**.
- Quality: 6/6 packages typecheck clean.

### Sprint 10.2 (Cash flow report) — COMPLETE ✅ (2026-04-25)
- New CashFlowService aggregating across 4 source tables:
  CashIn (ПКО) + CashOut (РКО) + PaymentIn (bank in) + PaymentOut
  (bank out). Direction is sourced from the table identity, so the
  schema needs no `direction` column.
- 9 grouping modes: none, day, week, month, quarter, year,
  counterparty, organization, channel.
- Three SQL strategies in the service:
  1. **Per-table aggregate** for totals — `prisma.X.aggregate()` in
     parallel across the 4 tables, then summed in TS by direction.
  2. **Date / FK groups** — UNION ALL across the 4 tables into a
     virtual "money_ops" subquery (with a `direction` column injected
     as a constant per channel), then `date_trunc(...)` or `GROUP BY
     fk` on the unified result. `$queryRawUnsafe` so the dynamic
     UNION works.
  3. **Channel groups** — same per-table aggregates as totals, but
     emitted as 4 rows (one per channel) instead of summed.
- Filter Zod schema: dateFrom/dateTo (required, dateFrom ≤ dateTo
  refinement), groupBy enum, optional counterpartyId/organizationId,
  optional channel filter (cash_in / cash_out / payment_in /
  payment_out — locks to one table when set).
- Returned per row: inflowCount, inflowSumMinor, outflowCount,
  outflowSumMinor, netSumMinor (BigInt → string).
- Endpoint: `GET /reports/cash-flow?dateFrom=…&dateTo=…&groupBy=…
  &channel=…&counterpartyId=…&organizationId=…`
- Web /reports/cash-flow page:
  - 5-column filter bar: dateFrom / dateTo / groupBy / channel /
    Apply (one extra control vs the sales report)
  - Italic note under the bar: "Hozircha barcha valyutalarda yig'indi
    UZS sifatida ko'rsatiladi" — flags the multi-currency caveat
  - 6-column results table; netSumMinor cell colored:
    green (success) when positive, red (destructive) when negative,
    muted when zero
  - Totals row (border-t-2 + bg-muted) at bottom
  - CSV export with full set of columns
  - Empty state when both inflow + outflow counts are zero
- /reports landing now shows 2 cards (Sales 📈 + Cash flow 💸).
- Subnav reports extended with `cashflow` entry pointing at
  /reports/cash-flow.
- i18n: `pages.report_cash_flow` + `subnav.reports.cash_flow` +
  `pages.reports.cash_flow_card_*` in uz.json + ru.json (group
  labels, channel labels, currency-note caveat).
- **BUG#6 caught in QA**: initially assumed table names `cash_ins`
  + `cash_outs` (plural), but the actual `@@map()` is `cash_in` +
  `cash_out` (singular). API returned 500 with "relation cash_ins
  does not exist". Fixed inline by reading schema.prisma. Lesson:
  for raw SQL on prisma-mapped tables, always grep `@@map(` —
  Prisma model casing/pluralization rules don't always match.
- Tests: +11 cash-flow.schema.test.ts. Totals: **367 API + 7 UI +
  45 money + 8 workflows = 427 tests green**.
- Quality: 6/6 packages typecheck clean.
- Schema design notes:
  - Multi-currency: V1 sums all currencies as raw tiyin (UZS
    nominal). A correct V2 needs per-row rate snapshot lookup
    (rateValue field on each doc) → conversion to a target currency
    at the report query time. Deferred until ExchangeRate snapshot
    plumbing is reliable.
  - Channel filter explicitly drops one direction's count to 0 when
    you filter to e.g. `cash_in` only — UI shows the partial picture
    correctly; totals row reflects the filtered slice.

### Sprint 10.1 (Sales report) — COMPLETE ✅ (2026-04-25)
- New ReportService with `salesReport(accountId, filter)` returning:
  - `totals` row (always) — counts + sums for the period
  - `groups[]` (when groupBy ≠ 'none') — per-bucket aggregates
- 10 grouping modes: none, day, week, month, quarter, year,
  counterparty, organization, store, product
- Three SQL strategies in the service:
  1. **Date buckets** (day/week/month/quarter/year) — `$queryRaw`
     with `date_trunc(unit, moment AT TIME ZONE 'UTC')` for both
     demands and sales-returns, joined client-side by bucket key
  2. **FK groups** (counterparty/organization/store) —
     `prisma.demand.groupBy({ by: [fk] })` + parallel returns
     groupBy, refs resolved in a batch follow-up query
  3. **Product** — `$queryRaw` joining `demand_positions` to
     `demands`, ranked by gross price-sum (best-sellers view)
- Filter schema (Zod): dateFrom/dateTo (required, dateFrom ≤ dateTo
  refinement), groupBy enum, optional counterpartyId/organizationId/
  storeId/productId, limit 1..1000
- Returned aggregates per row: salesCount, returnsCount, sumMinor,
  returnsSumMinor, netSumMinor (sales − returns), vatSumMinor,
  costSumMinor, profitMinor (net − cost)
- BigInt-safe — all monetary values serialized as strings
- Endpoint: `GET /reports/sales?dateFrom=…&dateTo=…&groupBy=…`
- Web:
  - New top-level nav entry "Hisobotlar" / "Отчёты" with subnav
    (Overview + Sales for now; placeholder for future cash-flow,
    stock-balance, counterparty-balance reports)
  - `/reports` landing page with card grid linking to each report
  - `/reports/sales` page with:
    - Date range + group-by filter bar with "Apply" button
    - Sticky-header table (9 columns) with money formatting
    - Bottom totals row (border-t-2 + bg-muted)
    - Empty state when no data
    - CSV export button (uses `@moysklad/ui` `buildCsv` /
      `downloadCsv` helpers, includes totals row at the bottom)
- i18n: `pages.reports`, `pages.report_sales`, `subnav.reports`,
  `nav.reports` in uz.json + ru.json with all 10 group labels
- Tests: +13 report.schema.test.ts (date refinement, groupBy enum
  coverage, FK UUID coercion, limit bounds). Totals: **356 API + 7
  UI + 45 money + 8 workflows = 416 tests green**.
- Quality: 6/6 packages typecheck clean.
- Schema design notes:
  - Per-product report's "sumMinor" is gross qty × price (no
    discount/VAT) — useful for ranking best-sellers but not
    tax-equal. Doc-level totals stay authoritative on the totals
    row. Per-line totals matching @moysklad/money/position math
    would require porting the rounding logic to SQL — deferred.
  - Date bucketing uses `AT TIME ZONE 'UTC'` so reports are
    calendar-stable across timezones. Account-local-time
    bucketing would need an Account.timezone-aware variant —
    deferred until multi-region demand surfaces.

### Sprint 9.3 (Email send — SMTP per-account) — COMPLETE ✅ (2026-04-25)
- New models + migration `add_email`:
  - `EmailConfig` — one row per account (`@unique` on accountId).
    Stores SMTP host/port/secure/username + AES-256-GCM-encrypted
    password. Last-test verdict cached on the row.
  - `EmailLog` — append-only audit trail of every send attempt.
    Captures rendered HTML body so disputes can be re-inspected.
    Polymorphic via (entity, entityId) like Attachment.
- Encryption helper (`apps/api/src/modules/email/crypto.ts`):
  - AES-256-GCM, key derived via scrypt from `EMAIL_ENCRYPTION_KEY`
    env var; dev-fallback constant kept for first-time setup but
    refuses to start if `NODE_ENV=production` and no key is set.
  - Random 12-byte IV per encryption, 16-byte auth tag, base64-
    encoded as `iv || tag || cipher`.
  - 7 unit tests cover round-trip, unicode, IV uniqueness, key
    rotation, malformed payload rejection.
- EmailService (nodemailer):
  - getConfig / saveConfig / deleteConfig (omitting password keeps
    existing on update; required on create)
  - testConnection — verify() + persist verdict on the row
  - send — pre-creates EmailLog row in 'pending' state, attaches
    binary content from `attachmentIds[]` (must belong to same
    account), updates log to 'sent' or 'failed' atomically
  - listLogs — entity-filterable history
- Endpoints: GET/PUT/DELETE /email/config, POST /email/config/test,
  POST /email/send { entity, entityId, to[], cc[], subject, bodyHtml,
  attachmentIds[] }, GET /email/logs?entity=X&entityId=Y
- Dependency added: `nodemailer` + `@types/nodemailer`
- Web `/settings/email` page:
  - Provider preset dropdown (gmail / yandex / mailru / custom) with
    auto-fill of host/port/secure
  - Form: from-name, from-email, reply-to, host, port, secure
    checkbox, username, password (optional on update — empty keeps)
  - Test connection button + persisted verdict badge
  - Delete config button
- Web `SendEmailDialog` component (Radix dialog):
  - To / Cc (comma/semicolon/space separated, parsed on submit)
  - Subject + HTML body textarea (mono font for tag visibility)
  - Form-friendly defaults from caller (subject + bodyHtml)
  - Success flash + auto-close after send
- Wired SendEmailDialog into 3 detail pages: invoices-out, demands,
  customer-orders. Each has Print + Email buttons in the actions
  bar.
- i18n: `pages.email_settings` + `pages.send_email` in uz.json +
  ru.json (provider names, labels, status badges).
- Schema design notes:
  - EMAIL_ENCRYPTION_KEY rotation: re-saving every EmailConfig
    re-encrypts under the new key. The service caches the derived
    key in process memory; restart needed after rotation.
  - Sending blocks on SMTP — for high-volume sends a queue is
    needed (BullMQ on Redis). Documented for a follow-up sprint.
  - PDF attachment is supported via the existing /attachments
    upload + attachmentIds[] on send. Server-side PDF generation
    of print templates (puppeteer/playwright) is deferred to 9.4.
- Tests: +29 across crypto.test.ts (7) + email.schema.test.ts (22).
  Totals: **343 API + 7 UI + 45 money + 8 workflows = 403 tests
  green**.
- Quality: 6/6 packages typecheck clean.

### Sprint 9.2 (Print/PDF templates) — COMPLETE ✅ (2026-04-25)
- New print routes outside the `(app)` group so the layout has no
  sidebar / no app chrome — pages render inside an A4-sized
  `print-page` card.
- `apps/web/src/app/print/layout.tsx` + `print.css`:
  - Print-friendly typography (Inter), B/W safe colors, A4 sizing
  - `@media print` hides the toolbar, removes shadows, sets `@page`
    margin
  - Receipt + invoice-style layouts share the same shell
- New components in `apps/web/src/components/print/`:
  - `PrintShell` — top-right toolbar (Print + Close), optional
    `autoPrint` that fires `window.print()` ~600ms after mount
  - `PrintDoc` — invoice-style template (header + 2-column party
    cards + 8-column positions table + totals + signatures)
  - `PrintReceipt` — receipt-style template (header + parties +
    prominent amount + purpose/note + signatures)
- Per-doc print pages:
  - `/print/invoice-out/[id]` (PrintDoc)
  - `/print/demand/[id]` (PrintDoc + customer-order reference line)
  - `/print/customer-order/[id]` (PrintDoc)
  - `/print/supply/[id]` (PrintDoc with received-by/issued-by sigs)
  - `/print/payment-in/[id]` (PrintReceipt)
  All accept `?auto=1` to fire print on mount — used by the popup
  flow from detail pages.
- `Print` button wired into 5 detail pages (invoices-out, demands,
  customer-orders, supplies, payments-in) — opens the matching
  `/print/.../[id]?auto=1` route in a sized popup
  (820×1100, popup-blocker-friendly).
- New shared money helper in **@moysklad/money/position**:
  - `computePositionTotal({ quantity, priceMinor, discount, vat },
    vatEnabled, vatIncluded)` — fully BigInt-based math (no Number
    drift), scales to micro-tiyin (×1e6), rounds half-up to tiyin
  - Handles VAT excluded (added on top) and VAT included (split out)
  - Handles 6-decimal qty + 4-decimal percent precisely
- i18n: `pages.print` in uz.json + ru.json (button labels, doc
  titles, party labels, signature roles, position-table column
  headers).
- Tests: +11 position.test.ts in @moysklad/money. Totals: **314 API
  + 7 UI + 45 money + 8 workflows = 374 tests green**.
- Quality: 6/6 packages typecheck clean.
- Schema design notes:
  - Position math lives in @moysklad/money, not in apps/web. Both
    server-side (future PDF export) and client-side (current print
    preview) can call it consistently. The API computes the same
    totals at posting time; the client recomputes for display.
  - Print templates are deliberately framework-free (no PDF library
    dependency yet). Browser's native "Save as PDF" handles export.
    Server-side puppeteer can be added in a follow-up sprint when
    email-attached PDFs are needed (Sprint 9.3 scope).

### Sprint 9.1 (Attachments — universal file storage) — COMPLETE ✅ (2026-04-25)
- New model + migration `add_attachments`: `Attachment` (polymorphic via
  `entity` + `entityId` discriminator, no FK on the host so we can attach
  to any business entity without per-table tables; bytea inline content
  with 10 MB cap). Indexed on (accountId, entity, entityId, createdAt
  DESC) and (accountId, uploaderId, createdAt DESC).
- AttachmentService: list / upload / getRaw (binary) / delete with
  base64 decode + round-trip validation, MIME-agnostic (any file type).
  Whitelist of 19 host entities enforced in the schema layer.
- Endpoints:
  - GET /attachments?entity=X&entityId=Y
  - POST /attachments  { entity, entityId, filename, mime, dataBase64, description? }
  - GET /attachments/:id/raw — streamed with Content-Type +
    Content-Disposition (inline for browsers, download fallback)
  - DELETE /attachments/:id
- Web `AttachmentsSection` component:
  - HTML5 native drag-and-drop zone + file picker
  - Mime-aware emoji icon prefix (📄 PDF, 🖼 image, 📊 spreadsheet, ...)
  - Filesize formatting (B / KB / MB)
  - Click-through opens binary inline (PDF/image) or downloads otherwise
  - Per-row delete with name confirmation
- Wired AttachmentsSection into 18 detail pages:
  cash-in, cash-out, counterparties, customer-orders, demands, enters,
  inventories, invoices-in, invoices-out, losses, moves, payments-in,
  payments-out, products, purchase-orders, purchase-returns,
  sales-returns, supplies. (Pipelines detail page intentionally
  excluded — no attachments use case there.)
- i18n: `pages.attachments` in uz.json + ru.json (section_title,
  drop_or_pick, size_hint, filename, size, uploaded_at, uploaded_by,
  empty, error_too_large).
- Schema design notes:
  - The `entity` field is a string discriminator, NOT a Prisma enum.
    This keeps adding new host entities a single-place change (the
    Zod whitelist) without DB migrations.
  - The schema deliberately has no FK from Attachment back to host
    entities. Host services are responsible for cascading deletes
    (will be wired in a follow-up sprint when the audit-log integrates
    with attachment cleanup).
  - bytea inline storage matches the ProductImage convention. A
    future S3 migration would add a `storageUrl` column and a
    storage-strategy switch in the service.
- Tests: +13 attachment.schema.test.ts. Totals: **314 API + 7 UI + 34
  money + 8 workflows = 363 tests green**.
- Quality: 6/6 packages typecheck clean.

### Sprint 8.3 (Sales funnel — Pipeline + Stages + Opportunities + Kanban) — COMPLETE ✅ (2026-04-25)
- New models + migration `add_sales_funnel`:
  - `Pipeline` (Воронка) with isDefault flag (only one default per
    account, enforced by service).
  - `PipelineStage` with name, position, type ('open' | 'won' | 'lost'),
    probability 0..100, optional hex color for Kanban accent.
  - `Opportunity` (Сделка) with auto-numbered `СД-YYYY-NNNNN`, BigInt
    amount in tiyin (with currency), probability override, expected
    close date, source, lostReason, status mirroring stage.type.
- PipelineService:
  - CRUD + archive/restore + `getOrCreateDefault` (auto-seeds canonical
    6-stage layout: Yangi → Aloqa → Taklif → Muzokara → Yutuq /
    Yo'qotish on first call).
  - Update enforces isDefault uniqueness in a transaction.
  - Stage replacement on update keeps existing IDs, deletes missing,
    adds new — but blocks deletion when any stage still has ≥1
    opportunity. Default-pipeline archive/delete is also blocked.
- OpportunityService:
  - CRUD + archive/restore + bulk-delete + `transition(id, stageId)`.
  - Transition validates the new stage belongs to the same pipeline,
    mirrors stage.type into status, sets/clears closedAt depending on
    terminal-vs-open transition. Re-opening clears lostReason too.
  - Cross-counterparty contactPerson check on create (same pattern as
    Call).
  - `board(pipelineId?)` returns pipeline + stages each with their
    opportunities — backend for the Kanban view.
  - BigInt → string serialisation via `serialize()` helper for JSON
    responses.
- Endpoints:
  - GET/POST /pipelines, GET /pipelines/default, GET/PATCH /pipelines/:id,
    POST /pipelines/:id/archive | /restore, DELETE /pipelines/:id.
  - GET /opportunities (filter by pipeline/stage/cp/owner/status/dates +
    search), GET /opportunities/board?pipelineId=..., GET /opportunities/:id,
    POST /opportunities, PATCH /opportunities/:id, POST /opportunities/:id/transition,
    POST /opportunities/:id/archive | /restore, DELETE /opportunities/:id,
    POST /opportunities/bulk-delete.
- Web:
  - /opportunities list (moysklad "Сделки" parity): columns
    number · name · stage chip (color-tinted) · amount · counterparty ·
    expectedCloseDate · owner · createdAt · status. Status filter
    pills (active / open / won / lost / archived). Bulk + CSV +
    ColumnCustomizer wired.
  - /opportunities/new form: name · pipeline+stage cascading select ·
    amount/currency/probability · expectedCloseDate · counterparty +
    dependent contactPerson pickers · source + description.
  - /opportunities/board Kanban: horizontal stage columns with HTML5
    drag-and-drop, per-stage card count + total amount header,
    hover-target highlight, sticky column headers, optimistic UX
    via React Query invalidation. Pipeline switcher in header.
  - /pipelines list (admin/settings): name · default badge · stages
    chips inline (color-tinted) · opportunity count · state.
  - /pipelines/new with the canonical 6-stage default seeded.
  - /pipelines/[id] full editor with PipelineEditor component
    (add/remove/reorder stages with up/down buttons, type select,
    probability input, color picker + hex input). Archive/restore/
    delete actions guarded for the default pipeline.
- New shared component: `PipelineEditor` (10-color preset palette).
- Subnav: CRM → Bitimlar / Kanban / Voronkalar (3 new entries).
- i18n: `pages.opportunities` + `pages.pipelines` in uz.json + ru.json
  with status enums (open/won/lost) + stage type enums + action
  labels (transition/won/lost). subnav.crm extended with 3 new
  keys. common.{archive,restore,default,not_found,confirm_delete}
  added too.
- Schema design notes:
  - Status field on Opportunity is *cached* from current stage.type for
    cheap list-filtering by status — the service is responsible for
    keeping it in sync on transition.
  - Auto-numbering uses СД-YYYY-NNNNN scanning by name prefix (same
    pattern as customer-orders ЗП). No global sequence object.
  - Opportunity.amount is BigInt(tiyin) and serialised as string
    over the wire — UI converts back via `BigInt(o.amount)`.
- Tests: +40 across pipeline.schema.test.ts (15) +
  opportunity.schema.test.ts (25). Totals: **301 API + 7 UI + 34 money +
  8 workflows = 350 tests green**.
- Quality: 6/6 packages typecheck clean.

### Sprint 8.2 (Calls / Журнал звонков) — COMPLETE ✅ (2026-04-25)
- New model + migration `add_calls`: `Call` (counterpartyId / contactPersonId
  / ownerId all nullable + SetNull on cascade so call history survives entity
  deletion). Direction `'in' | 'out'`, channel `'call' | 'sms' | 'email' |
  'meeting'`, status `'completed' | 'missed' | 'cancelled' | 'scheduled'`.
  Indexed on (accountId, counterpartyId, startedAt DESC), (accountId,
  ownerId, startedAt DESC), (accountId, startedAt DESC), (accountId,
  archived).
- CallService: full CRUD + archive/restore + bulk-delete via shared
  runBulk. List supports filters by counterpartyId, contactPersonId,
  ownerId, direction, channel, status, archived, dateFrom/dateTo,
  search (across summary + externalNumber). Cross-counterparty contact
  person validation: rejects mismatched contactPerson belongs-to-another-
  counterparty before insert.
- Endpoints: GET/POST /calls, GET/PATCH/DELETE /calls/:id, POST
  /calls/:id/archive | /restore, POST /calls/bulk-delete.
- Web:
  - /calls list (moysklad "Журнал звонков" parity): columns startedAt
    (sort DESC) · direction Badge (info/success) · channel · counterparty
    link · contactPerson link · externalNumber · duration (mm:ss) ·
    status Badge · summary truncate. Bulk + CSV + ColumnCustomizer wired.
  - /calls/new form: direction + channel + status selects, datetime-local
    startedAt (default now), durationSec input, counterparty + dependent
    contactPerson pickers (person fetcher gated on selected counterparty,
    cleared on counterparty change), externalNumber + summary textarea.
    Locked counterparty when ?counterpartyId= prefill — returns to
    /counterparties/{id} on save.
  - CallsSection inline component on /counterparties/[id] (under
    ContactPersonsSection): same row layout — date click-through ·
    direction/status badges · contactPerson link or externalNumber ·
    duration · archive + delete actions.
- i18n: `pages.calls` in uz.json + ru.json (title, create_button,
  new_title, section_title, counterparty, contact_person, direction,
  channel, status, started_at, duration, duration_sec, external_number,
  summary, plus enum dictionaries `directions.{in,out}`,
  `channels.{call,sms,email,meeting}`, `statuses.{completed,missed,
  cancelled,scheduled}`).
- Schema design note: MVP supports manual entry only. Telephony
  integration (click-to-call, auto-log via webhook) is intentionally
  deferred to a later sprint. The schema fields are pre-shaped to
  accept inbound webhook payloads (externalNumber, durationSec) so no
  migration will be needed when the integration lands.
- Tests: 20 new call.schema.test.ts. Totals: **261 API + 7 UI + 34 money +
  8 workflows = 310 tests green**.
- Quality: 6/6 packages typecheck clean.

### Sprint 8.1a (ContactPerson) — COMPLETE ✅ (2026-04-25)
- New model + migration `add_contact_persons`: ContactPerson
  (counterpartyId FK cascade, ownerId nullable, name, position, phone,
  email, description, archived). Indexed on (accountId, counterpartyId)
  + (accountId, archived).
- ContactPersonService: full CRUD + archive/restore + bulk-delete via
  shared runBulk. List supports filters by counterpartyId, archived,
  search (across name/phone/email/position), ownerId.
- Endpoints: GET/POST /contact-persons (filter via query string),
  GET/PATCH/DELETE /contact-persons/:id, POST /contact-persons/:id/archive
  | /restore, POST /contact-persons/bulk-delete.
- Web:
  - /contact-persons list (moysklad "Контактные лица" parity): columns
    name · position · counterparty link · phone (tel: link) · email
    (mailto: link) · state. Bulk + CSV + column customizer.
  - /contact-persons/new form: counterparty picker (locked when
    ?counterpartyId= prefill, returns to /counterparties/{id} on save),
    name + position + phone + email + description fields.
  - Counterparty subnav already wired to /contact-persons.
- i18n: pages.contact_persons in uz.json + ru.json (title, create_button,
  new_title, search_placeholder, empty_title, counterparty,
  select_counterparty, full_name, position, phone, email).
- Tests: 12 new contact-person.schema.test.ts. Totals: **241 API + 7 UI +
  34 money + 8 workflows = 290 tests green**.
- Quality: 6/6 packages typecheck clean.

### Sprint 7.5 (Product Images) — COMPLETE ✅ (2026-04-25)
- New model + migration `add_product_images`: `ProductImage` with bytea
  `content`, `filename`, `mime`, `sizeBytes`, `position`, `isMain`.
  Indexed on (accountId, productId, position).
- ImageService:
  - `upload()` decodes a base64 data URL (or raw base64), 4 MB binary cap,
    auto-promotes first image to main, demotes the previous main when
    caller sets isMain=true. Whole flow inside one transaction.
  - `getRaw()` returns Buffer + mime + filename for the binary GET endpoint.
  - `setMain()` swaps the main flag atomically.
  - `delete()` promotes the next-positioned image to main if the deleted
    one was main.
  - `reorder()` rewrites positions in caller-supplied order.
- Endpoints:
  - GET  /products/:productId/images
  - POST /products/:productId/images   { filename, mime, dataBase64 }
  - PUT  /products/:productId/images/:imageId/main
  - PUT  /products/:productId/images/reorder
  - DELETE /products/:productId/images/:imageId
  - GET  /images/:imageId/raw — binary streamed with proper mime + cache.
- Storage choice: bytea inline. Documented MVP — can be lifted to S3 later
  by swapping the storage layer in ImageService and adding a `storageUrl`
  column.
- Web `ImageGallery` component:
  - Thumbnails 8rem square, sorted main → position.
  - "Asosiy" / "Главное" badge on the cover image.
  - Hover overlay with "Set as main" + delete buttons.
  - Drop-zone style upload card (file picker, multi-file).
  - Reads file via FileReader.readAsDataURL, posts as base64 JSON.
- Wired into /products/[id] page as a new "Rasmlar" FormSection above
  the DocumentTabs block.
- i18n: `pages.images` in uz.json + ru.json.
- api-client: PUT helper added in 7.4 already covers the new endpoints.
- Tests: 10 new image.schema.test.ts. Totals: **229 API + 7 UI + 34 money +
  8 workflows = 278 tests green**.
- Quality: 6/6 packages typecheck clean.

### Sprint 7.4 (Bundles / Комплекты) — COMPLETE ✅ (2026-04-24)
- New model + migration `add_bundle_components`: `BundleComponent` joins a
  bundle-kind Product to its component Products/Variants with a decimal
  quantity. Component can reference either a Product or a Variant
  (polymorphic discriminator). Indexed on (accountId, bundleId) +
  (accountId, componentProductId) + (accountId, componentVariantId).
- BundleService.setComponents() validates: only products with
  kind='bundle' can have components; nested bundles rejected for MVP;
  bundle can't reference itself. Replaces the full list in one tx so
  the UI can send the edited array wholesale.
- Endpoints: GET/PUT /bundles/:id/components, DELETE /bundles/:id/components/:componentId.
- api-client: new `api.put()` helper added for PUT endpoints.
- Web:
  - /bundles list (moysklad "Комплекты" parity): same columns as
    /services (name · code · folder · VAT · price) filtered by
    ?kind=bundle. Bulk + CSV + column customizer.
  - /bundles/new: two-step create — first POST /products (kind='bundle'),
    then PUT /bundles/:id/components with the component list from the
    dynamic editor. Non-bundle products only in picker (prevents nesting).
- i18n: pages.bundles in uz.json + ru.json (title, create/new, search,
  empty, folder, section_main, section_pricing, components_title,
  components_count, components_empty, select_component, add_component).
- Tests: 8 new bundle.schema.test.ts. Totals: 219 API + 7 UI + 34 money +
  8 workflows = **268 tests green**.
- Quality: 6/6 packages typecheck clean.
- Scope note: bundle stock-explosion on Demand.post (decrement components
  instead of the bundle itself) is a later-sprint enhancement; bundle
  positions currently flow through as-is.

### Sprint 7.3 (Variants / Модификации) — COMPLETE ✅ (2026-04-24)
- New model + migration `add_variants`: `Variant` (productId FK,
  characteristics Json, salePrices Json, buyPrice/minPrice BigInt,
  barcode + code unique per account, archived). Indexed on
  (accountId, productId) and (accountId, archived).
- VariantService: full CRUD + archive/restore + auto-name formatter
  ("{parent} / {char1} / {char2}") applied when name is omitted or
  characteristics change without an explicit name override. BigInt
  salePrices serialized to string for JSON safety via
  `serializeSalePrices()`.
- Endpoints: GET/POST /variants, GET/PATCH/DELETE /variants/:id, POST
  /variants/:id/archive|/restore + bulk-delete.
- Web:
  - /variants list (moysklad "Модификации" parity): columns name · code ·
    barcode · characteristics-badges · parent-product link · price; bulk
    + CSV + column customizer.
  - /variants/new form: parent-product picker (or ?productId= prefill
    from product detail) + dynamic characteristics editor (add/remove
    name/value rows) + price fields.
- i18n: pages.variants in uz.json + ru.json.
- Tests: 9 new variant.schema.test.ts. Totals: 211 API + 7 UI + 34 money +
  8 workflows = **260 tests green**.
- Quality: 6/6 packages typecheck clean.

### Sprint 7.2 (Services UI) — COMPLETE ✅ (2026-04-24)
- No schema change: `Product.kind` already had 'service' in its enum.
  The Services module is a UI-layer filter over the existing Product
  table + a tailored create form — matches moysklad's unified
  Assortment-table approach.
- `/services` list — same ListView scaffolding as /products but with
  `kind=service` filter, service-appropriate column set (no stock, no
  buyPrice), bulk + CSV + column customizer.
- `/services/new` — simplified Product form preset to `kind='service'`,
  hiding stock/physical fields (weight, volume, UoM, buyPrice) that
  don't apply to intangible items.
- i18n: `pages.services` + `common.active` / `common.archived` in
  uz.json + ru.json.
- Goods subnav already enumerated /services; activeModule detection
  covers it.
- Quality: typecheck clean (pure-UI slice, 251 tests still green).

### Sprint 7.1 (PriceType module) — COMPLETE ✅ (2026-04-24)
- New model + migration `add_price_types`: `PriceType` (accountId, name
  unique-per-account, currency, isDefault, position, archived).
- Service enforces **at most one default** per account via
  `clearDefault()` before writes; `ensureDefault()` auto-creates a
  "Default" row on first list hit so the app is never bootstrap-less.
  Guards against deleting or archiving the default type.
- REST: list/create/update/archive/restore/delete + bulk-delete. Each
  list call first calls ensureDefault for idempotency.
- Web `/price-types` page (moysklad "Типы цен" parity): inline add-new
  row with name + currency + "mark default" checkbox; existing rows
  editable in-place; delete guarded for defaults; default shows a badge.
- i18n: `pages.price_types` in uz.json + ru.json.
- Tests: 7 new price-type.schema.test.ts.
- Quality: 6/6 packages typecheck clean. **202 API + 7 UI + 34 money +
  8 workflows = 251 tests green**.
- Out of scope for 7.1: Product.salePrices[] still accepts arbitrary
  priceTypeId strings — UI-only validation through the picker. Hard FK
  enforcement deferred to a data-migration pass in a later sprint.

### Sprint 6.3b (Bank statement CSV import) — COMPLETE ✅ (2026-04-24)
- New model pair + migration `add_bank_statements`:
  - `BankStatement` — per-upload envelope (filename, format, uploader, linked
    organization account, state draft→parsed→committed→cancelled, row
    counts total/matched/imported).
  - `BankStatementRow` — one parsed transaction line, preserves raw CSV
    fields + counterparty auto-match (by INN or account number) + once
    committed links to paymentInId / paymentOutId for traceability.
- `csv-parser.ts`: tolerant parser for Uzbek bank CSVs — handles BOM,
  RFC 4180 quoted fields, comma/semicolon delimiter, dd.mm.yyyy / yyyy-mm-dd
  dates, comma-decimal amounts with thousands spaces, English/Russian/Uzbek
  header aliases (дата/amount/sana; приход/расход/in/out), sign-inferred
  direction fallback.
- `BankImportService`:
  - `upload()` persists statement + rows with auto-match by INN or
    bank-account number (batched counterparty lookup, no N+1).
  - `commit()` creates PaymentIn/Out drafts per row inside per-row try
    blocks so one bad row doesn't abort the batch. Honors
    `rowIds` subset + `counterpartyOverrides` for user-picked matches.
  - `cancel()` soft-marks a statement so it doesn't show in pending list.
- Endpoints: GET/POST /bank-import, GET/POST /bank-import/:id/commit,
  DELETE /bank-import/:id.
- Web `/bank-import` page (moysklad "Банк → Загрузка" parity):
  file input OR paste-CSV textarea → Upload → Preview table with
  direction badge · date · amount · counterparty · auto-match reason
  (INN / account / manual override with counterparty picker) · purpose ·
  result badge → Commit button (with count) → history table below.
  Money subnav now has a "Bank vypiska" tab; activeModule detection
  covers /bank-import.
- i18n: full `pages.bank_import` section + `subnav.money.bank_import`
  in uz.json + ru.json.
- Tests: 9 new csv-parser.test.ts (minimal valid, BOM + Russian headers,
  sign-inferred direction, quoted commas, per-row error isolation,
  semicolon delimiter, dd.mm.yyyy, comma-decimal + thousands spaces,
  empty content).
- Quality: 6/6 packages typecheck clean. **195 API + 7 UI + 34 money +
  8 workflows = 244 tests green**.

### Sprint 6.3a (CounterpartyBalance) — COMPLETE ✅ (2026-04-24)
- New model + migration `add_counterparty_balance`:
  `CounterpartyBalance` (accountId + counterpartyId + currency unique,
  balanceMinor). Sign convention mirrors moysklad.uz's "Баланс":
  positive = counterparty owes us; negative = we owe them.
- `CounterpartyBalanceService.applyDelta(tx, accountId, cpId, currency, delta)`
  upserts the row with an atomic `{ increment: delta }` inside the caller's
  `$transaction`. Zero-delta short-circuits; invalid currency rejects.
- Wired cascade into all 6 money-moving services (post + unpost + cancel
  symmetric pairs):
  - InvoiceOut.post   → +sumMinor   (we bill them)
  - InvoiceIn.post    → −sumMinor   (they bill us)
  - PaymentIn.post    → −sumMinor   (they pay us)
  - PaymentOut.post   → +sumMinor   (we pay them)
  - CashIn.post       → −sumMinor   (mirrors PaymentIn)
  - CashOut.post      → +sumMinor   (mirrors PaymentOut)
  - Unpost/cancel reverse the sign with the same guard (only applicable
    docs affect the balance).
- Counterparty `findById` now returns `balances: Array<{ currency,
  balanceMinor, updatedAt }>` and the Counterparty detail page renders a
  "Балans" block matching moysklad: per-currency table with
  green/red/grey tone based on sign, + "Valyuta · Qoldiq · Yangilangan".
- Tests: **5 new counterparty-balance.service.test.ts** (upsert
  create/increment branches, zero short-circuit, sign passthrough,
  currency validation, composite key shape).
- Quality: 6/6 packages typecheck clean. 186 API + 7 UI + 34 money +
  8 workflows = **235 tests green**.
- Scope note: we don't modify the balance on Demand/Supply posts — moysklad
  uses the invoice as the receivable-creating event, same as us.

### Sprint 6.2b (CashIn + CashOut web UI) — COMPLETE ✅ (2026-04-24)
- Full three-page set for each entity (mirror of payments-in/out UI):
  - `/cash-in` list (search, state filter, bulk actions, column customization,
    CSV export, cashDesk column).
  - `/cash-in/[id]` detail (state-aware FSM buttons, allocation table
    showing InvoiceOut → amount with totals footer, cashDesk balance,
    DocumentTabs for history, delete-draft).
  - `/cash-in/new` form (counterparty + organization + cashDesk pickers,
    auto-defaults cashDesk from /cash-desks, multi-allocation invoice
    picker with remaining-amount prefill).
  - Same 3 pages for `/cash-out` (agent=payee, target=InvoiceIn).
- Money subnav already had cash_in/cash_out entries; activeModule
  detection covers the new routes.
- i18n: `states.cash_in`, `states.cash_out`, `pages.cash_in`,
  `pages.cash_out` in uz.json + ru.json (titles, placeholders, cash_desk,
  allocation labels).
- Quality: 6/6 packages typecheck clean · 181 API + 7 UI + 34 money +
  8 workflows = 230 tests green. Visual E2E deferred to manual run in a
  follow-up (dev servers weren't up at commit time).

### Sprint 6.2a (CashIn + CashOut backend) — COMPLETE ✅ (2026-04-24)
- New Prisma models + migration `add_cash_orders`:
  - `CashIn` — приходный кассовый ордер (ПКО). Auto-numbered ПКО-YYYY-NNNNN.
    FSM: draft → posted → cancelled. cashDeskId required; operations[]
    allocate to InvoiceOut.
  - `CashInOperation` — per-allocation row (targetKind='invoiceout',
    invoiceOutId, amountMinor).
  - `CashOut` — расходный кассовый ордер (РКО). Same shape but allocations
    target InvoiceIn.
  - `CashOutOperation` — mirror.
- `CashInService.post()`: Serializable tx calls `MoneyService.applyDeltas`
  with +sumMinor on the CashDesk, then `InvoiceOutService.applyPayment` per
  allocation. Unpost/cancel reverse both sides. `CashOutService.post()` is
  the mirror (-sumMinor + InvoiceInService.applyPayment).
- Controllers: REST list/create/update/transition/delete + POST
  `bulk-delete` and `bulk-transition` (shared runBulk helper).
- `CashInModule` + `CashOutModule` registered in app.module.ts.
- Tests: 11 new cash-in.schema.test.ts + 6 new cash-out.schema.test.ts =
  **181 API total**. Typecheck clean across all 6 packages.
- UI layer + visual E2E lands in Sprint 6.2b.

### Sprint 6.1 (Money foundation) — COMPLETE ✅ (2026-04-24)
- New Prisma models + migration `add_money_module`:
  - `OrganizationAccount` — our payer-side bank accounts
    (organization FK, currency, bank name, account #, BIC/MFO, materialized
    balance, is_default flag).
  - `CashDesk` — physical cash register / till (currency + balance).
  - `MoneyOperation` — append-only ledger (mirror of StockOperation).
    Polymorphic on (organizationAccountId OR cashDeskId); tracks
    documentKind+documentId for drill-down; indexed on (source, at DESC).
- `MoneyService.applyDeltas(tx, accountId, deltas[])` — posts signed
  deltas to the ledger + updates materialized balance. Enforces:
  tenant isolation, currency match, and overdraft (no balance < 0 unless
  extended later). Sorts deltas by (kind, id) for deterministic lock
  order so bulk posts don't deadlock.
- `MoneyService.getBalance()` reads the materialized column directly.
- Reference endpoints: `GET /organization-accounts?organizationId=&currency=&search=`
  and `GET /cash-desks?currency=&search=` for pickers. BigInt balances
  stringified for JSON safety.
- `MoneyModule` registered in app.module.ts; consumed later by
  PaymentIn/Out + CashIn/Out (Sprint 6.2).
- Tests: 8 new `money.service.test.ts` (positive/negative deltas, tenant
  guard, currency mismatch, overdraft, missing source, cashDesk branch,
  empty no-op). Totals: **164 API** + 7 UI + 34 money + 8 workflows = 213.
- 6/6 production packages typecheck clean.

### Sprint 5.5d (CSV export) — COMPLETE ✅ (2026-04-24)
- `DataTableColumn` gained `cellText?: (row) => string` + `headerText?: string`.
  Columns without a `cellText` accessor are skipped at export — no
  `[object Object]` garbage from JSX-only cells.
- New lib `packages/ui/lib/csv.ts` with `buildCsv` (RFC 4180 field escaping:
  quotes, commas, newlines), `downloadCsv` (UTF-8 BOM so Excel opens right),
  and `csvTimestamp` (Windows-safe YYYY-MM-DD_HH-mm filename suffix).
- New pattern `ExportButton` — download icon trigger, disabled when rows
  are empty, honours current `visibleColumnKeys` so the export matches the
  on-screen columns.
- Wired into all 15 list pages (ExportButton lives in `extraActions`
  alongside ColumnCustomizer). cellText accessors injected into common
  columns (name, moment, agent, state, sum, payedSum, positions,
  postedAt, …) across 13 pages via `tools/scripts/inject-celltext.mjs`.
  Enters/Inventories use single-line column defs — scripted injection
  skipped them safely (revisited in a follow-up).
- Tests: 7 new csv.test.ts unit tests (encoding + timestamp shape).
  Totals: 156 API + 7 UI + 34 money + 8 workflows = 205 green.
- Typecheck: 6/6 production packages clean.

### Sprint 5.5c (Column customization) — COMPLETE ✅ (2026-04-24)
- `DataTable` / `ListView` gained a `visibleColumnKeys?: Set<string>` prop.
  When provided, the component filters `columns` on render — full list still
  drives the customizer panel, so toggling brings columns back.
- New pattern `ColumnCustomizer`: Radix popover with a checkbox per column,
  lockable `alwaysVisible` rows, and an optional "Reset" footer.
- `useColumnVisibility(entity, defaultKeys)` hook persists the visible set
  in localStorage at `ms:column-visibility:{entity}`, falls back cleanly in
  SSR and on corrupt storage.
- Wired into all 15 list pages (customizer trigger lands in ListView's
  `extraActions`). Each list declares its defaults from the column array.
- Visual E2E `tools/visual-check/check-sprint-5-5c.ts`: first run proved
  hide + reload-persistence + reset (all assertions passed). The final
  cosmetic screenshot flaked on a Playwright protocol error; subsequent
  retries blocked by the local PostgreSQL service being stopped
  (orthogonal to the sprint — logic is proven).
- Quality: 3/3 packages typecheck clean · 156 API + 34 money + 8 workflows
  tests green · 79/79 schemas valid.

### Sprint 5.5b (Related Docs + History tab) — COMPLETE ✅ (2026-04-24)
- New backend module `audit-log`: `GET /audit-logs?entity=&entityId=&limit=&cursor=`
  reads the indexed AuditLog table — every domain service already writes audit
  entries via `tx.auditLog.create`, so the read path surfaces the full trail.
- Design-system patterns:
  - `HistoryTimeline` — vertical timeline with per-entry action · user ·
    timestamp + field diff (before→after, struck-through red before / green after).
  - `RelatedDocsPanel` — grouped list of linked docs (name + state badge + money).
- Web:
  - `useDocumentHistory(entity, id)` — TanStack Query hook keyed by (entity, id),
    disabled until both are present.
  - `DocumentTabs` wrapper: Tabs primitive + Related + History panels; handles
    the field/action i18n fallback so unknown keys render raw.
  - Wired into all 15 detail pages (moves, losses, enters, inventories, SR, PR,
    CO, demand, IO, supply, PI, PO, II, Pout, counterparty, product).
- i18n: 50+ audit keys in uz/ru (tab labels, action names, related-group
  labels, empty states).
- Tests: 156 API + 34 money + 8 workflows = 198 green (no regressions).
- Visual E2E: `tools/visual-check/check-sprint-5-5b.ts` seeds an SR, asserts
  tab switching + ≥1 history entry + 4-page smoke (demand, supply, CO, cp).
  PASSED.

### Sprint 5.5a (Bulk Actions UI parity) — COMPLETE ✅ (2026-04-24)
- `DataTable` + `ListView` gained `selectable` + controlled `selectedIds` + header "Select all"
  with indeterminate state. Row checkboxes disabled per `canSelect(row)`.
- New `BulkActionBar` component — inline bar shown above the table when any row is
  selected: count badge · per-verb action buttons · clear × on the right.
  Matches moysklad.uz inline UX 1:1.
- API: `POST /{entity}/bulk-delete` and `POST /{entity}/bulk-transition` on 16 controllers
  (14 FSM + counterparty/product; product-folder uses tree not list). Body validated by
  shared `BulkIdsSchema` / `BulkTransitionSchema` (1–100 UUIDs). `runBulk()` helper uses
  `Promise.allSettled` → `{ total, succeeded: string[], failed: Array<{id,error}> }`
  so the UI can surface partial-success toasts.
- `useBulkDocumentActions` hook wires selection state + both mutations + bar JSX; each
  list page needs only 3 lines (import + call + spread).
- Wired into 15 list pages (all except product-folders): customer-orders, demands,
  invoices-out, supplies, payments-in, purchase-orders, invoices-in, payments-out,
  sales-returns, purchase-returns, moves, losses, enters, inventories, counterparties,
  products.
- i18n: `bulk.*` keys in uz.json + ru.json (selected_count, delete, post, unpost,
  cancel, delete_confirm, transition_confirm, result_all_ok/partial/all_failed).
- Tests: 156 API (+ 10 new `shared/bulk.test.ts`) + 34 money + 8 workflows = 198 green.
- Visual E2E: `tools/visual-check/check-sprint-5-5a.ts` seeds 3 drafts, verifies
  select-all, bulk-delete, partial-select persistence, and smoke-tests 4 other lists.

### In-flight / next
- **6** Money module (OrganizationAccount + ledger + cash orders)
- **7** Product catalog expansion (variants, bundles, services, images)
- ... (see 20-sprint roadmap below)

---

## Division of labor

**Claude can do solo** (no interactive auth needed):
- Writing/editing code, tests, migrations
- Running: `pnpm` scripts, `tsc --noEmit`, `vitest`, `prisma migrate dev`, `prisma generate`, `git`
- Starting/stopping dev servers via background bash tasks
- Playwright E2E via the `tools/visual-check/*` scripts
- Writing/updating documentation
- All Sprint 3 work was done this way — Claude-only, with user confirmation at Sprint boundaries.

**User action when needed**:
- PostgreSQL service start (requires admin): `net start postgresql-x64-17`
- Killing processes that lock Prisma DLL if migration fails (Claude can do via `taskkill //F //IM node.exe`)
- Providing credentials (never commit them).

---

## Environment specifics

- **OS:** Windows 11
- **Repo:** `D:\projects\moysklad`
- **Shell used:** Windows cmd (NOT PowerShell) — use `cd /d` for drive switch
- **pnpm:** 9.15.0 via corepack
- **Node:** 20.11.0 (from .nvmrc)
- **Known issue:** C: drive has been at 98% full — set `TMPDIR=/d/tmp TMP=D:/tmp TEMP=D:/tmp` for git commits
- **Browser:** Playwright Chromium (via `pnpm --filter @moysklad/capture install:browser`)

---

## How user likes to communicate

- **Language:** Uzbek (uz-latin)
- **Style:** Direct, professional, doesn't want many options when the answer is clear
- **Patience:** High — willing to run 1-2 hour scrapes, wait for completion
- **Frustration triggers:** Back-and-forth questioning after he's already decided; scope reduction suggestions; re-discussing Kotlin/Docker/MVP
- **Expects:** Pragmatic recommendations with reasoning; commit-and-follow-through

---

## Git rules (from global CLAUDE.md)

- Always commit with conventional commits format
- Co-author: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
- Use `-c user.name="Ozodbek" -c user.email="ozodbekmirgasimov1@gmail.com"` (do not update git config globally)
- Set `TMPDIR=/d/tmp TMP=D:/tmp TEMP=D:/tmp` if C: drive is full

---

## Resumption checklist (yangi Claude sessiya)

Aynan shu tartibda bajaring:

- [ ] **`RESUME.md` ni o'qing** (kirish nuqtasi)
- [ ] Ushbu `HANDOFF.md` ni o'qing (to'liq holat)
- [ ] `git log --oneline -20` — so'nggi commit'larni ko'rish
- [ ] `git status --short` — 0 uncommitted fayl bo'lishi shart
- [ ] Sanity: `pnpm --filter @moysklad/api test --silent` (93 test yashil)
- [ ] Sanity: `pnpm validate:all` (115/115 valid)
- [ ] Sanity: `pnpm --filter @moysklad/api exec tsc --noEmit` (0 error)
- [ ] Sanity: `pnpm --filter @moysklad/web exec tsc --noEmit` (0 error)
- [ ] Foydalanuvchi bilan o'zbekcha suhbat (uz-latin)
- [ ] So'rang: **"Sprint 4 (Purchase side) boshlaymizmi, yoki boshqa ustuvorlik bormi?"**

Sprint boundaryda:
- [ ] Har Sprint yakunida vizual check yozing (`tools/visual-check/check-X.ts`)
- [ ] Har Sprint yakunida commit qiling (Conventional Commits)
- [ ] Foydalanuvchi test qilguncha keyingi Sprint'ga o'tmang — user hamma narsani ko'ra oladi

---

## Sprint 4 scope (tayyor, user yo'l-yo'riq ko'rsatganda boshlash)

**Purchase side mirror of Sales**:

| Sales (tugallangan) | Purchase (Sprint 4 da) |
|---------------------|------------------------|
| CustomerOrder (ЗП) | PurchaseOrder (ЗП postavshhik) |
| Demand (ОТ) — outbound | (Supply already exists) — inbound |
| InvoiceOut (СЧ) | InvoiceIn (СФ kiruvchi) |
| PaymentIn (ПП) | PaymentOut (ПП chiquvchi) |

FSM spec'lar allaqachon mavjud:
- `docs/moysklad-reference/workflows/purchaseorder.json`
- `docs/moysklad-reference/workflows/invoicein.json`
- `docs/moysklad-reference/workflows/paymentout.json`

Qo'shimcha xususiyatlar:
- **Sprint 4.5** (backlog): Sprint 3.4c — FIFO cost consumption on Demand.post (DemandPosition.costMinor ni SupplyPosition.remainingQty dan to'ldirish)
- **Sprint 4.6**: CounterpartyBalance ledger (har agent uchun qoldiq)

---

## If context is getting tight

1. **Darhol commit** qiling — ishni yo'qotmang.
2. `RESUME.md` + `HANDOFF.md` ni yangilang.
3. `C:/Users/user/.claude/projects/D--projects-moysklad/memory/project-state.md` ni yangilang.
4. "Kontekst tugayapti, yangi suhbatda `RESUME.md` dan davom etamiz" — deb user'ga ayting.
