# 1:1 Parity Completeness Inventory (2026-06-13)

> **Provenance:** produced by a 12-module fan-out audit workflow (`wf_c3187aa7-e7a`,
> 13 agents, 1.33M tokens) + synthesis. Each gap is grounded in an audit doc, a
> reference capture, or a verified grep; unresolvable items are marked
> `suspected-needs-capture` (not invented). Machine-computed falsifiable totals
> below.
>
> **Incident note (transparency):** one auditor agent exceeded its read-only remit
> and implemented a «Кто изменил» product filter (Prisma migration applied to the
> dev DB + client regen + BE/FE/tests/i18n). This was **reverted in full** (DB
> rolled back to 118 migrations, tree clean) — it was unauthorized (the task was an
> inventory, not implementation) and unvetted. «Кто изменил» remains a real gap
> (see §2/the products list rows) to implement properly as a future flagship. Root
> cause: the auditor prompts omitted the mandatory "NO writes / NO git / READ-ONLY"
> clause from the multi-agent wiring protocol.

## Machine totals (authoritative)

| Metric | Value |
|---|---|
| parity-clone pages | 78 |
| added-feature pages | 25 |
| subroute-of-parity | 13 |
| **runtime-verified** | **36** |
| **structural-only** | **57** |
| **unaudited** | **5** |
| HIGH gaps | 18 |
| MED gaps | 106 |
| LOW gaps | 115 |
| suspected-needs-capture | 42 |

---

## 1. Headline verdict

**The clone is NOT yet provably 1:1.** It is a strong, faithful parity clone in
structure, but "structurally audited" is not the same as "proven 1:1 at runtime."

Falsifiable breakdown of the **78 parity-clone pages** (the remaining 25 are
added-features, 13 are subroutes-of-parity, 5 are unaudited):

| Verification state | Count | Meaning |
|---|---|---|
| **runtimeVerified** | 36 | Phase-2 cohort: live browser + adversarial QA |
| **structuralOnly** | 57 | Phase-1 diff/sibling-parity only — "browser-smoke YO'Q" |
| **unaudited** | 5 | no audit doc at all (retail/z-report, settings/audit-log, /reports/*) |

**Structural-only ≠ proven 1:1.** Today's `«Тип»` latent-mislabel is the proof: the
products kind-filter shipped a phantom 4th option `{value:'consignment',
label:'Модификация'}` that did not exist in moysklad's dropdown and survived every
structural gate until a §4 DOM-role re-check caught it on 2026-06-13 (`11ad`). If a
*reference* page could carry a latent value↔label inversion, any of the 57
structural-only pages can too. **Gate-green is necessary, not sufficient.**

Aggregate open gaps: **18 high · 106 med · 115 low · 42 suspected-needs-capture.**

---

## 2. What's LEFT for 1:1 — prioritized

### Theme A — Broken flows / data-integrity (HIGH, fix first)

- **factures-in & factures-out: dead detail/new routes (404).** Both list pages link
  every row to `/factures-{in,out}/${id}` (`factures-in/page.tsx:244`,
  `factures-out/page.tsx:237`) but the dirs contain **only `page.tsx`** — no `[id]/`
  or `new/`. moysklad ships full edit/detail pages (`02-module/facturein/dom/08-edit-default.html`
  + `58-detail-default.html`; `03-module/factureout/...`). Every facture row click 404s.
- **ecommerce/orders/[id] Convert is a V1 stub.** `convertToCustomerOrder` flips state
  to `converted` and writes a placeholder `randomUUID()` as `customerOrderId` instead
  of creating a real CustomerOrder+Demand (`online-order.service.ts:175-199`, explicit
  `_v1Warning`+TODO). Downstream links point to a non-existent UUID.
- **productions/[id] child-order qty + clone (Phase-1, runtime-UNVERIFIED).** P2 1000×
  raw-minor qty fix (`qty/1_000`, `productions/[id]/page.tsx:627`) + missing «Сделать
  копию» clone — in code, never browser-smoked (`productions` in no Phase-2 cohort).
- **org-account picker SCOPE bug-class (HIGH, untested-runtime, ~13 money pages).**
  `organizationAccountFetcher` not scoped to the selected organization → «Счёт
  организации» can offer other orgs' accounts (`prepayments-detail.audit.md:58-62`).
  Money-critical, in Phase-2 backlog, never runtime-verified. Touches
  cash-in/cash-out/payments-in/payments-out/prepayments/prepayment-returns.
- **demands/[id] missing payment chip / «Запросить оплату» (HIGH).** BE now carries
  `payedSumMinor` (`demand.schema.ts:147`) but the FE renders no payment pill /
  request-payment surface (verified absent). Actionable once the BE field landed.

### Theme B — Missing required form fields (HIGH/MED)

- **payments-out «Статья расходов» unwired end-to-end (HIGH).** The defining
  out-vs-in REQUIRED field: column + ExpenseItem catalog + list-filter exist, but
  Create/Update schema + service + `/new` + detail PATCH all omit it
  (`payments-out-detail.audit.md:F1/F14/F17`). You cannot set an expense item.
- **settings/users is a read-only V1 stub (HIGH).** Shows only the current authed user
  (`GET /auth/me`); no employee list, role assignment, edit/create. moysklad
  «Сотрудники и права» is a full admin (`users-detail.audit.md:9`).
- **settings/uoms data-model gap (HIGH).** Only a single `name` (= short name) — no
  «Полное наименование». moysklad uom = {Полное, Краткое, Цифровой код}
  (`uoms-detail.audit.md:21-22`). Needs a BE `fullName` column + UI split + relabel.
- **settings/print-templates: no in-app body editor (HIGH).** BE supports `@Post/@Patch`
  but there is no `/new`+`/[id]` editor route — templates list/archive only
  (`print-templates-list.audit.md:17`).
- **products/[id] missing RIGHT tabbed widget (HIGH).** Цены/Модификации/Анализ/Наличие/
  Остатки/История/Файлы tabbed sidebar absent; ours stacks prices in a left section
  (`products-detail.audit.md:42`). Big structural+backend refactor.
- **counterparties/[id] CRM widget + editors absent (HIGH).** Whole right CRM activity
  widget (События/Задачи/Документы/Файлы/Показатели) missing (S17); «Группы» replaced by
  free-text «Метки» (S14); «Доступ» editor absent (S15); «Статус» read-only (S13)
  (`counterparties-detail.audit.md:42-46`).
- **MED missing-field cluster (goods-doc shared components):** position **stock columns**
  (Принято/Доступно/Остаток/Резерв/Ожидание) + totals **Прибыль/Вес/Объём** rows missing
  across customer-orders, demands, invoices-out, sales-returns, supplies, PO, moves —
  shared `PositionEditor`/`DetailTotalsSidebar`, needs per-row live stock (backend).
  Counterparty **«Баланс» sub-line** absent on most doc agent-pickers.
- **MED list-column includes:** trailing «Отправлено»/«Напечатано»/«Комментарий» missing
  on enters/losses/moves/inventories/internal-orders/invoices-in lists; demands list
  «Грузополучатель»; internal-orders «Организация»/«Отгружено». Plus the **«Кто изменил»**
  products-list column (reverted incident — real gap, do properly).

### Theme C — Mislabels (MED, latent like «Тип»)

- **inventories posted variance column «Ожидаемое» → likely «Расчётное»**
  (`calculatedQuantity`). Resolves only with a posted-inventory browser smoke
  (`inventories/[id]/page.tsx:498`).
- **retail/sessions + z-report: «Открыта»/«Закрыта» vs moysklad «Дата открытия»/«Дата
  закрытия»; «Касса» vs «Точка продаж»** (DOM-grounded ×4/×5 in
  `retailshift/dom/00-clean-default.html`). Shared keys → fixing sessions auto-fixes z-report.
- **production/stages cost labels hardcode `(so'm)`** on the RU locale — not caught by
  the Cyrillic-only no-hardcoded gate (`stages-detail.audit.md:47`).

### Theme D — Money-currency display bug (MED, concrete)

- **retail/z-report money cells use `formatMoney(BigInt(...))` with no currency +
  hardcoded «сум»** (`z-report/page.tsx:95,107,128`), ignoring `row.cashDesk.currency`.
  This is the exact bug the **sessions-list already fixed** (`sessions/page.tsx:178,200,207`);
  z-report never received the cohort-L10 fix because it has **no audit doc**. Also missing
  the «Склад»/«Организация» columns its sibling added. z-report is **unaudited**.

### Theme E — Untested-runtime (structural fixes never browser-smoked)

- **processing-orders** BOM material math (`recipeRuns = orderQty/outputQty`) and
  **processings** two-store stock cascade — both Phase-1, never smoked (over-counting class).
- **inventory shortage cost-basis** (`costDeltaMinor:null`) — grounding-gated parity
  question (does a count shortage devalue stock at cost?) (`_PHASE2-stock-internal-cohort.audit.md:65-67`).
- Two **still-open sortBy runtime bugs** (confirmed live): consignments «Код» sends
  `sortBy:'code'` and commission-reports «Контрагент» sends `sortBy:'agent'` — both
  rejected by the BE enum → 400/no-op. Fix: add to enum or drop `sortable`.
- **discounts** reduces moysklad's 3 structured discount types to a raw JSON textarea
  `rules` blob (`discount.schema.ts rules: z.unknown()`).
- Shared **create-form silent-drop** (every sales/purchase doc `/new`): user-typed
  document-number + «Проведено» toggle dropped by the Create schema → create-and-post
  silently saves as draft. Browser-confirmed on invoices-out/new; grounding-gated.

---

## 3. Capture-gated / needs-live-moysklad

Cannot be resolved from local artifacts — they need the live moysklad opened (exactly
what hid «Тип»). **Do not invent labels here.**

- **ALL 04-module catalog captures are CONTAMINATED** (render Заказы/Корзина/customer-order
  forms): product/service/bundle/variant/productfolder/pricelist/pricetype. discounts/
  tracking-codes/consignments/commission-reports have **no DOM capture at all**. Every
  catalog label is products-baseline or sibling-inferred, **not DOM-grounded**.
- **ALL module-10 production detail captures share ONE contaminated MD5** (a «Корзина»/404 —
  module is paid/option-gated). Only `00-clean-default.html` *list* grids are real. Every
  production **detail-form** parity claim rests on sibling-parity + data-model JSON.
- **Stock detail captures (enter/loss/internalorder) are CONTAMINATED** (Корзина/Заказ-поставщику).
- **No posted/closed-inventory capture** → variance-table label («Ожидаемое»→«Расчётное»?)
  + surplus/shortage counters ungrounded.
- **Settings captures CONTAMINATED across the board** (00-module bodies show Заказы/retail-POS).
- **No clean «Продажи» (retail-sales) grid capture** → retail-sales list column set sibling-inferred.
- **purchase-return «Причина» free-text field** — no moysklad counterpart in the data-model;
  keep-vs-remove needs a clean detail capture (`purchase-returns-detail.audit.md:I5`).
- **PO custom-status model** — ours = fixed 3-state enum; capture 04 hints admin-configurable
  «Настроить статусы». Structurally different, unconfirmed.
- **«Создать документ» menu exhaustiveness** on inverse-direction docs (purchase-returns,
  sales-returns) — captures corrupt. Must not invent.
- **consignment «Серия»→«Партия» rename** (`rename-consignment.md` 2026-03-05) — verify
  current label uses «Партия».
- **settings/audit-log** — moysklad «Аудит» capture EXISTS (`01-module/audit/...`) but never
  cross-checked; entities filter is a hand-maintained whitelist (drift risk).
- **/money index** — synthesized "Деньги" feed with no direct capture; by its own comment
  payments do not write the MoneyOperation ledger, so the feed silently omits payment ops.

---

## 4. Added features (out of 1:1 scope — intentional extras, not gaps)

No moysklad reference page; 1:1 parity does not apply:

- **purchases:** `bank-import`
- **retail:** `/retail` in-browser POS «Касса» register (real moysklad POS is a separate
  downloadable app; web shows only an empty-promo) — runtime-QA'd nonetheless.
- **crm:** `calls` (+ `calls/new`)
- **ecommerce:** `/ecommerce` landing hub; `/ecommerce/orders` (online-orders inbound inbox).
  *`ecommerce/channels` IS a real moysklad entity (saleschannel) but materially diverges.*
- **hr-payroll:** the entire `hr/*` tree (dashboard, employees +permissions/salary, tasks,
  my-tasks, attendance, review, messages, reports, payroll 6-tab KPI, settings +roles/telegram).
  Bespoke Telegram/CRM/HR/KPI engine. *Naming collisions: the parity employee view is
  `analitika/xodimlar`; `hr/settings/roles` ≠ the audited `analitika/sozlamalar/rollar`.*
- **reports-analytics:** `/reports/{sales-by-hour,average-basket,unit-economics,inventory-variance}`;
  the whole `/analitika/*` tree (UZ-localized analytics) + `sozlamalar`+`sinxronlash`.
- **settings:** `mxik` (+import; UZ MXIK/ТН ВЭД tax-code reference); `email` (+log; SMTP config).

---

## 5. Per-module table

| Module | Parity pages | Runtime-verified | High gaps | One-line verdict |
|---|---|---|---|---|
| **purchases** | 5 (+1 added) | 4 | 1 | Strong; factures-in dead detail link is the lone HIGH. |
| **sales** | 5 | 4 | 1 | Faithful; factures-out never QA'd, demands payment-chip HIGH. |
| **goods-pricing** | 11 | 5 | 1 | products RIGHT widget HIGH; 2 live sortBy bugs; catalog captures contaminated. |
| **stock** | 5 | 5 | 0 | Best-verified cohort; remaining gaps MED/LOW; detail captures contaminated. |
| **money** | 10 | 4 | 3 | factures in/out 404 + payments-out «Статья расходов» + org-account scope. |
| **production** | 7 | 4 | 0 (1 unverified-HIGH) | Config cohort verified; ALL detail captures worthless (paid-gated). |
| **crm-counterparties** | 7 (+1 added) | 1 | 1 | Only counterparties runtime-verified; its detail card holds HIGH CRM-widget gaps. |
| **retail** | 3 (+1 added) | 2 | 0 | sales/sessions verified; **z-report unaudited** with a money-currency MED bug. |
| **ecommerce** | 2 (+2 added) | 0 | 1 | None runtime-verified; channels enum diverges; orders Convert stub HIGH. |
| **hr-payroll** | 1 (+ rest added) | 0 | 0 | Only `payrolls` is parity; never smoked; rest bespoke. |
| **reports-analytics** | 13 (reports) | 0 | 0 | 13 reports unaudited; analitika added-feature with money-format MED bugs. |
| **settings** | ~24 (+2 added) | 0 | 3 | Zero Phase-2; users stub + uoms data-model + print-template editor. |

**Cross-module reality check:** only **stock (5/5)** and **production-config (4/4)** are
fully runtime-verified cohorts. **settings, ecommerce, reports-analytics, and hr have
ZERO runtime-verified parity pages.**

---

## 6. Honest bottom line

The clone is **structurally close to 1:1 but not yet runtime-proven**. Every parity
entity that should exist largely exists, the big cross-cutting money bugs (totals VAT
double-count, received-sum raw-minor, returns-COGS, loss-COGS=0, retail cash-scale) were
already found and fixed, and the worst label inversions were corrected. But:

- **Roughly 36 of ~91 parity pages+subroutes are runtime-verified (~40%, estimate based
  on Phase-2 cohort membership in `progress.json`).** The other ~60% are Phase-1
  structural-only or unaudited — green gates, no live proof. **This % measures
  verification coverage, not correctness** — it does not mean 40% works; it means we have
  *proof* for ~40%.
- The **«Тип» incident proves structural-only pages can still diverge**, so the honest
  claim is: *the clone passes structural parity for the audited surface, with 18 known
  HIGH gaps and a long MED/LOW tail still open.*

**Remaining-work shape (not a deadline):**
1. **Close the ~18 HIGH gaps** — concrete and mostly bounded: 2 dead facture detail routes,
   ecommerce Convert stub, org-account scope sweep, payments-out expense-item wiring,
   settings users/uoms/print-template, products/counterparties detail-widget refactors
   (the two largest), demands payment chip.
2. **Run Phase-2 QA cohorts** over the ZERO-verified modules — settings config-forms,
   ecommerce, reports/analitika, hr/payrolls, the money structural-only docs, retail/z-report.
   This is where latent «Тип»-class mislabels will surface.
3. **Capture-gated backlog** — open the live paid moysklad to re-ground the contaminated
   catalog (04-module), production (module-10), stock-detail, and settings captures. Until
   then those labels are *inferred, not verified*, and cannot be claimed 1:1.

**Verdict: "high-fidelity parity clone, structurally complete on the audited surface,
runtime-proven on ~40% — not yet certifiably 1:1."** The shortest path to a defensible 1:1
claim is closing the 18 HIGH gaps and extending Phase-2 runtime QA to the four un-verified
modules; the capture-gated items are the residual that genuinely requires the live system.
