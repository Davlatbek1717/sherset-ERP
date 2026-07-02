# Per-modal field audit — 2026-06-02

Workstream: **modal audit** (NEXT.md "Aniq keyingi vazifa"). Method: a 4-agent
discovery workflow (`scripts/wf-modal-audit-discover.js`) + Opus judging. This
doc is the audit record + the handoff for the dominant follow-up workstream it
surfaced. (Not named `*-detail.audit.md` / `*-list.audit.md` on purpose — it is
a modal audit, not a page audit, and must not enter `progress.json` page counts.)

## Scope audited

Document-flow + shared modals that the document UI mounts: `task-create-modal`,
`send-email-dialog`, `webhook-dialog`, design-system `MassEditModal` +
`CatalogPicker`/`CatalogPickerField`, plus the POS `payment-dialog`,
`attribute-metadata-dialog`, and the 7 HR modals (employee / set-password /
check-in / edit-attendance / template / answer / review).

## A. Done this session

### 1. CatalogPicker design-system Uzbek-default leak — FIXED (`70d01ce0`)
`packages/design-system/src/patterns/CatalogPicker.tsx` (CatalogPicker +
CatalogPickerField) shipped **10 hardcoded Uzbek strings** that leaked into the
RU UI — same design-system-default-leak bug-class as Modal / ConfirmDialog /
EditForm / PositionEditor. 6 were prop-defaults (createLabel / searchPlaceholder
/ emptyTitle / emptyDescription / field placeholder), **6 were no-prop literals
that ALWAYS leaked** regardless of the caller (loading text, close/clear/pick
aria-labels, footer clear + cancel).

Fix mirrors `ModalLabelsProvider`: new `CatalogPickerLabelsProvider` + context;
each string resolves explicit-prop → injected-context → Uzbek hard fallback;
wired at `apps/web/src/app/layout.tsx` from `getTranslations()` (reuses
`common.*` + new `catalog_picker.*` + new `common.clear`). The 6 no-prop
literals now read from the context. 7 new injection tests
(`catalogpicker-from-ui.test.tsx`). Also cleared 4 pre-existing a11y errors
(ul[role=listbox] → div + justified `useSemanticElements` ignores) so the
pre-husky file could be staged.

**Impact**: fixes the no-prop literals (loading/cancel/close/clear/pick) +
the default-relying call sites (task-create assignee picker, moysklad-doc-filter
pickers, counterparties price-type picker, products folder picker) EVERYWHERE.
Does **not** fix call sites that pass explicit Uzbek (see §C — the dominant gap).

### 2. Modal validation-message Uzbek leaks — FIXED (`fa4973af`)
- `send-email-dialog`: required-field guards built `${t('to')} majburiy` →
  RU users saw «Кому majburiy». Now `pages.send_email.field_required` ({field}).
  Also fixed 4 pre-existing `noLabelWithoutControl` a11y errors (htmlFor+id).
- `hr/tasks/template-modal`: `somToMinor()` threw 3 hardcoded Uzbek money-parse
  errors → now a localized messages object from `t()`
  (`pages.hrTasks.form_err_money_{negative,format,too_large}`).

### 3. task-create-modal «Тип задачи» = moysklad-PARITY (not a superset)
Verified via moysklad's official API docs: Task entity has a first-class `state`
field = «Тип задачи» (optional on create; only description + assignee required).
Our `task_create.*` namespace matches moysklad labels. Modal is clean. The only
unverifiable detail is the create-modal's exact visual field ORDER — no
«Создание задачи» modal was ever captured open (recommend a future live capture).

## B. Clean / out-of-scope

- **Fully clean (8)**: task-create-modal, webhook-dialog, MassEditModal
  (label-injected, no defaults), attribute-metadata-dialog (fixed last session),
  payment-dialog (POS), employee-modal, check-in-modal, answer-modal,
  review-modal.
- **Deferred (English dev-guards, not RU leaks)**: `set-password-modal:46`
  "No employee selected", `edit-attendance-modal:58,76` "No row" — English
  guards for impossible states; minor i18n hygiene, tracked not fixed.

## C. 🔴 DOMINANT FINDING — document forms are ~0% i18n'd (next workstream)

The picker call-site question ("why does the provider not fix the visible picker
labels?") uncovered a far larger gap: **the document `/new` (and `[id]`) forms
are essentially not internationalised at all.** They hardcode **Russian** field
labels AND **Uzbek** picker strings — so neither locale is correct (RU UI shows
Uzbek pickers; UZ UI shows Russian labels).

`useTranslations` calls per `/new` form (2026-06-02 survey):

> **Status column added 2026-06-02d** — the i18n-calls/hardcoded counts below are the
> ORIGINAL 2026-06-02 survey (pre-work baseline); the `status` column tracks completion.

| form | i18n calls (baseline) | hardcoded RU labels | hardcoded UZ pickers | status |
|---|---|---|---|---|
| cash-in | 0 | 11 | 14 | ✅ money-order (2026-06-02) |
| cash-out | 0 | 11 | 14 | ✅ money-order (2026-06-02) |
| payments-in | 0 | 13 | 14 | ✅ money-order (2026-06-02) |
| payments-out | 0 | 12 | 15 | ✅ money-order (2026-06-02) |
| prepayments | 1 | 12 | 15 | ✅ money (2026-06-02b) |
| counterparty-adjustments | 1 | 10 | 10 | ✅ money (2026-06-02b) |
| demands | 0 | 28 | 23 | ✅ sales (2026-06-02c) |
| invoices-out | 0 | 14 | 18 | ✅ sales (2026-06-02c) |
| supplies | 0 | 16 | 16 | ✅ purchase (2026-06-02d) |
| purchase-orders | 0 | 12 | 16 | ✅ purchase (2026-06-02d) |
| invoices-in | 0 | 15 | 18 | ✅ purchase (2026-06-02d) |
| moves | 2 | 10 | 8 | ✅ inventory (2026-06-02e) |
| losses | 2 | 8 | 8 | ✅ inventory (2026-06-02e) |
| enters | 3 | 10 | 8 | ✅ inventory (2026-06-02e) |
| inventories | 0 | 7 | 8 | ✅ inventory (2026-06-02e) |
| internal-orders | 0 | 1 | 8 | ✅ inventory (2026-06-02e) |
| customer-orders | 3 | 0 | 3 | ✅ cleanup #18 (2026-06-02i, `e169f3f`) |

(prepayment-returns, sales-returns, purchase-returns were not in the original survey
table but are done with their groups — money-b, sales-c, purchase-d respectively.)

≈ **16 `/new` forms × ~25 strings ≈ 400 hardcoded strings**, plus the matching
`[id]` edit forms. Each form is a **products-form-scale i18n effort** (cf.
products/[id] = 59-key namespace, `3a033c60`). This is the dominant RU↔UZ parity
gap in the app and overlaps with the Q2 detail-page audits.

### Picker string inventory (from discovery)
- `title="…tanlash"` = **143 occurrences**, ~42 distinct entities
- `placeholder="… tanlang"` = **72 occurrences**, ~30 distinct
- `createLabel="Yangi …"` = **36 occurrences** (30 «Yangi kontragent», 5 «Yangi
  loyiha», 1 «Yangi priyomka»)

### Key infrastructure already exists (reuse, don't duplicate)
`form.*_picker_title` (Выбор X) + `form.select_*` (Выберите X) already cover:
product, supplier, customer, counterparty, organization, store, purchase_order,
invoice, advance_po, project, contract, bank_account, agent_account.

**Missing entity keys to add** for the long tail: cash_desk (Касса),
sales_channel (Канал продаж), employee (Сотрудник), customer_order (Заказ
покупателя), facture (Счёт-фактура), price_type, label_template, and the
production-module set (recipe/BOM, technological_card, stage/Этап, and the
warehouse-ROLE variants: material / product / source / output / receiving
store). The production-module pickers need the most domain care.

### Recommended approach (per-form, products pattern)
1. Per form: create a `pages.<doc>_new` namespace (ru+uz), wire EVERY label /
   section / placeholder / Zod message (mirror products/[id] + products/new).
2. Pickers: title → `form.<entity>_picker_title`, placeholder →
   `form.select_<entity>`, create → entity-specific create key. Add the missing
   entity keys above.
3. RU = moysklad terms (the existing hardcoded RU labels are a strong starting
   reference — they're already correct for RU, just need to move into i18n + add
   the UZ side); UZ = natural Uzbek (the existing picker strings are the UZ
   source).
4. Batch by document group: **money** (✅ FULLY DONE 2026-06-02 — money-order
   subgroup `d7006ee8`+`c5a7f512`; remaining prepayments + prepayment-returns +
   counterparty-adjustments done 2026-06-02b, all `/new` + `[id]`) →
   **sales** (✅ FULLY DONE 2026-06-02c — customer-orders was partial; demands +
   invoices-out + sales-returns `/new` i18n'd, all `/new` + `[id]`) →
   **purchase** (✅ FULLY DONE 2026-06-02d — supplies, purchase-orders, invoices-in,
   purchase-returns, all `/new` + `[id]`; `[id]` twins were already clean) →
   **inventory** (✅ FULLY DONE 2026-06-02e — moves, losses, enters, inventories,
   internal-orders, all `/new`; `[id]` twins clean except internal-orders titlePrefix) →
   **production** (✅ FULLY DONE 2026-06-02f — processings, processing-orders,
   productions, work-orders, all `/new` + `[id]`). **→ whole document-form i18n
   conveyor COMPLETE.**
5. Verify each: grep 0 hardcoded RU/UZ in the form, key-existence ru+uz,
   typecheck, biome, full web suite; browser-smoke on dev :3100 where feasible.

### Done — money-order subgroup (2026-06-02)
cash-in/out + payments-in/out, all `/new` + `[id]` (8 files). Each `/new`
mirrored its **already-audited `[id]` sibling** (so `pages.<doc>_new` was NOT
needed — reused `pages.<doc>` + `fields.*` + `form.*` + `detail_*`). Leftover
Uzbek leaks in the `[id]` siblings (validation throws, allocation columns,
pickers) were fixed in the same pass — cash-out/[id] + payments-out/[id] were
the least i18n'd (added `pages.<doc>` + `detail_tabs` hooks; payments-out
unified its divergent `Schyot`/`Buyurtma` allocation strings with `/new` via the
shared `kind_invoicein`/`kind_purchaseorder`/`add_invoicein`/`add_advance` keys).
Counterparty label is `fields.agent` («Контрагент») on all four (was
«Покупатель»/«Поставщик»). Key counts: cash_in/cash_out +18 each, payments_in
+11, payments_out +14 (ru+uz). Gates per commit: web tc0 · biome 0 · web 1225
pass/1 skip · key-existence ru+uz verified · 0 hardcoded left. 3-lens adversarial
verify each pair. **DEFER (free-tier route-wall, unverifiable vs live moysklad)**:
kind labels «Счёт»/«Заказ (аванс)», `paid_documents` allocation-tab name for
payment docs, and the UZ «Zakaz» (vs natural «Buyurtma») terminology — the
latter is the codebase-wide convention (`form.select_advance_po` etc.), so a
naturalisation sweep would be a separate decision.

### Done — remaining money docs (2026-06-02b) → money group fully closed
prepayments, prepayment-returns, counterparty-adjustments, all `/new` + `[id]`
(6 files). Same mirror-the-`[id]`-sibling pattern. New keys: 3 `detail_titles`
(Предоплата / Возврат предоплаты / Корректировка взаиморасчётов) +
`pages.*` (ru+uz): `err_*` / `related_empty` / `select_agent_first` /
`select_source_first` / `autofill_from_source` / `remaining_refundable`, and
`prepayment_return` retail-split keys (`cash_sum`/`no_cash_sum`/`qr_sum`)
**deliberately unified with prepayment's** «Наличными»/«Безналом»/«QR-оплатой»
for sibling consistency. `/new` forms went from ~0% i18n → fully wired (labels →
`tFields.*`, pickers → field labels, createLabel → `form.create_new_counterparty`,
tabs → `detail_tabs.*`, disclosures → `form.*`, status → `states.*`, throws →
`pages.*.err_*`); `[id]` leftover leaks fixed (Внешний код, Наличные/Безналичные/QR,
«Forma yuklanmadi», «Yangi kontragent», «Qoldiq qaytarish»). **Adversarial 3-lens
verify caught a wrong-key defect** mechanical checks could not: all three `[id]`
`<DetailHeader>` used `titlePrefix={t('title')}` = the **plural list title**
(«Предоплаты № …») instead of the singular `detail_titles.*` — the key resolved,
just to the wrong value. Fixed to `tDetailTitles('<doc>')` (matches cash-in /
payments-in siblings). The sweep found the SAME bug latent in `price-lists/[id]`
(«Прайс-листы» plural) + `payrolls/[id]` (borderline) — out-of-scope, tracked as
NEXT.md backlog #13 (separate commit). Gates: web tc0 · biome 0 · web 1225 pass/1
skip · **key-existence 181/181 ru+uz** · grep 0 hardcoded. Browser-smoke skipped
(additive i18n). DEFER (free-tier route-wall): kind labels, paid-documents tab name.

### Done — sales group (2026-06-02c) → sales group fully closed
demands, invoices-out, sales-returns, all `/new` + `[id]`. Each `/new` was ~0% i18n
(demands/new + invoices-out/new: 0 `useTranslations`; sales-returns/new: 2, errors
namespace only) → mirrored its `[id]` sibling. Reused `fields.*` (agent/customer/store/
contract/project/sales_channel/payment_planned/consignor/consignee/carrier/cargo/etc),
`form.*` (validation throws, pickers, tasks/files chrome, rate controls), `detail_form.*`
(currency/external_code/overhead), `detail_tabs.*`, `detail_titles.*`, `states.*`. New
**shared** keys added once and reused across the group: `form.currency_{uzs,usd,eur,rub}`,
`form.rate_edit`, `form.create_new_project`, `form.other_fields`, `fields.gtd_cost`
(«Себестоимость ГТД»), `fields.country` («Страна»). New `pages.<doc>.*`:
`applicable_help` / `related_empty` / `select_store_first` / `add_position_first` (+
demands `delivery_date` / `stock_available`). Counterparty label respects each `[id]`
sibling: demands = `fields.agent` («Контрагент», matches its captured reference);
invoices-out + sales-returns = `fields.customer` («Покупатель», matches their `[id]`).
Status options aligned to each doc's real FSM (draft/posted/cancelled) — the decorative
`confirmed`/`shipped` options were dropped (status is not sent on create). Leftover `[id]`
leaks fixed in the same pass: **sales-returns/[id] hardcoded `gtdSumLabel: 'Себестоимость ГТД'`
→ `tFields('gtd_cost')`**. **Bug fixed**: sales-returns/new validation used
`errors.select_payee` («Выберите получателя») for the customer field → switched to
`form.select_customer` («Выберите покупателя»). Gates: web tc0 · biome 0 · web 1225 pass/1
skip · key-existence 181/181 ru+uz · grep 0 hardcoded. **3-lens adversarial verify**
(`scripts/wf-sales-group-i18n-verify.js`, 9 agents): 0 blockers; 3 sibling-consistency
fixes applied (account-picker dialog titles aligned to `[id]`'s `tFields`); 2
false-positives rejected with the moysklad reference screenshot (the demand «Создать
документ» create-menu is SINGULAR — «Входящий платеж»/«Приходный ордер» — so the existing
`tDetailTitles` was correct, not the suggested plural `create_related`). **DEFER** (free-tier
route-wall / structural, unverifiable vs live moysklad): the «Покупатель» vs «Контрагент»
choice for invoices-out/sales-returns (no live capture — demo account empty); the demand
`delivery_date` field (not shown in moysklad's demand main panel; `/new`-only, absent from
`[id]`) — structural reconciliation belongs to the demands detail audit. Browser-smoke
skipped (additive i18n).

### Done — purchase group (2026-06-02d) → purchase group fully closed
supplies, purchase-orders, invoices-in, purchase-returns, all `/new` + `[id]`. All four
`[id]` twins were already i18n-clean (grep-confirmed 0 hardcoded) — so the work was the
four `/new` forms only, each mirroring its audited `[id]` twin. `supplies/new` was wired by
the main loop as the verified gold reference (tc0 · biome · 0 hardcoded · useTranslations
0→8 hooks); the other three were wired by 3 parallel workflow agents
(`scripts/wf-purchase-group-i18n.js`) against that reference, then all four ran a 3-lens
adversarial verify (mislabel-vs-`[id]` / leftover-hardcoded / key-existence+parity).
**CRITICAL mirror fix**: every purchase `[id]` labels the counterparty «Поставщик» =
`tFields('supplier')`, but all four `/new` forms mislabelled it «Контрагент» → corrected to
`tFields('supplier')`. Reused existing `fields.*` / `form.*` / `detail_form.*` /
`detail_tabs.*` / `detail_titles.*` / `states.*`. New keys added once: per-page
`applicable_help` / `waiting_help` / `related_empty` / `select_store_first` /
`add_position_first` (×4 namespaces, ru+uz); shared `form.select_supplier_first`,
`form.select_supply`, `form.supply_picker_title`. Status options aligned to each doc's real
`[id]` FSM (supply/invoice_in/purchase_return = draft/posted/cancelled; purchase_order =
draft/confirmed/cancelled). purchase-returns/new reconciled its partial state (unused `_t` →
`t`; `tErrors('…')` validation throws → `tForm('…')` to match the group convention).
**Adversarial verify caught a real BLOCKER**: `uz.json detail_titles.supply` = «Yetkazib
berish» (= *delivery*) but RU is «Приёмка» (= *goods receipt*) — fixed to «Priyomka»
(a pre-existing mistranslation also live on supplies/[id] + every «Создать → Приёмка»
create-menu). Same pass harmonized the purchase-group UZ `detail_titles` off the divergent
«Yetkazuvchi» onto the dominant «Ta'minlovchi»/«Priyomka» terms (UZ-only; RU = parity
anchor, unchanged): purchase_order→«Ta'minlovchi buyurtmasi», invoice_in→«Ta'minlovchi
schyoti», purchase_return→«Ta'minlovchiga qaytarish». Gates: web tc0 · biome 0 · web 1225
pass/1 skip · key-existence (all keys across 4 forms resolve ru+uz) · grep 0 hardcoded.
Browser-smoke skipped (additive i18n). **DEFER** (out of scope, larger UZ sweep): the
«Provedeno» transliteration for the posting term (deliberate 30+ place convention — fixing
locally would worsen inconsistency); the `create_related`/nav «Yetkazib beruvchi» variant of
«supplier».

### Done — inventory group (2026-06-02e) → inventory group fully closed
moves, losses, enters, inventories, internal-orders, all `/new`. The four document-style `[id]`
twins were i18n-clean; only internal-orders/[id] had a hardcoded `titlePrefix="Ichki buyurtma"`
(backlog #14) → fixed to `tDetailTitles('internal_order')` (+ added the missing hook). moves/new
was wired by hand as the inventory gold reference (2-store `store_from`/`store_to` pattern);
inventories/new (custom surplus/shortage count table) and internal-orders/new (singular
`pages.internal_order` ns, `destination_store`/`delivery_planned`) were also hand-wired;
losses/new + enters/new were wired by 2 parallel workflow agents
(`scripts/wf-inventory-losses-enters-i18n.js`) against the moves reference. The inventory group
keeps the EXISTING `tErrors(...)` validation-throw convention and `tReasons(reasons.loss/enter)`
reason options (NOT churned to `tForm`). New keys: per-page `applicable_help`/`related_empty`
for moves/losses/enters; `surplus_qty`/`shortage_qty` + `applicable_help`/`related_empty` for
inventories; `related_empty`/`select_store_first`/`add_position_first` for internal_order; shared
`errors.position_quantity_non_negative` (inventory allows actual=0). 3-lens adversarial verify
(`scripts/wf-inventory-group-verify.js`, 15 agents) caught a **BLOCKER**: inventories/new
mislabelled its `description`-bound field `tFields('reason')` («Причина») — inventory has no
reason field; the [id] twin shows the comment field. **Fix converged the whole group's document
comment field on `tFields('description')` («Комментарий», the moysklad-canonical value already
used by moves/[id] + demands/[id])**: inventories/new reason→description (+dropped the unused
`reason_placeholder` key), and losses/[id] + enters/[id] + inventories/[id] + internal-orders/[id]
switched from `tCommon('description')` («Описание») → `tFields('description')`. Same pass fixed UZ
polish the lens surfaced: okina ʻ→' in 6 `detail_form.overhead_*` keys; `detail_titles.loss`
«Yo'qotish»→«Hisobdan chiqarish» (accurate write-off term, matches `pages.files.entities.Loss`);
English leak «Move hujjati»→«Ko'chirish hujjati» in `pages.internal_order`. Gates: web tc0 ·
biome 0 · web 1225 pass/1 skip · key-existence (all 5-form keys resolve ru+uz) · grep 0 hardcoded.
Browser-smoke skipped (additive i18n). **DEFER**: «Провedeno» convention (project-wide, 66
occurrences); the «Комментарий» vs «Описание» document-comment-label divergence in the OTHER
groups' `[id]` forms (purchase-orders/[id], invoices-in/[id] still use `tCommon('description')`) —
a cross-group sweep, backlog #15.

### Done — production group (2026-06-02f) → whole document-form conveyor closed
processings, processing-orders, productions, work-orders — **both `/new` AND `[id]`**
(unlike money/sales/purchase/inventory where `[id]` was already clean, the production
group needed both forms wired). 4 commits: `c5598a34` (processings), `6380f832`
(processing-orders), `92255228` (productions/[id]), `e64833ac` (work-orders). Each `/new`
mirrored its `[id]` twin's namespace (`pages.processing` / `pages.processing_order` /
`pages.productions` / `pages.work_orders`); productions/new was the pre-done reference
(`e352aae6`). New domain keys (per namespace): production_stage / hour_accounting / defect /
normo_hour / labour_cost_per_unit / normo_hours_per_unit / normo_hour_cost / BOM-table
headers (component/unit_qty/total_qty) / manual_hint / products_manual / materials_written_off /
output_received / posted_at (processing); fulfilment_progress / planned / fulfilled / remaining /
linked_processings (processing_order); doc_date (productions); materials_section / col_material /
col_norm / col_required / output_section / col_product / bom_loading (work_orders, whose `/new`
was 100% hardcoded with a 4-state FSM). Shared new: `fields.performer`, `form.select_employee` +
`employee_picker_title`. detail_titles.processing / processing_order / work_order added (closes
**backlog #14** — all production `[id]` titlePrefix). Document-comment field converged on
`tFields('description')`=«Комментарий» (inventory convention). **3-lens adversarial verify per
module caught REAL defects mechanical checks missed**: work-orders/new planned-qty meta-field
mislabelled `tFields('quantity')`=«Кол-во» (generic) instead of `t('planned_qty')`=«Плановое
количество» (BLOCKER, wrong concept); productions `col_orders` UZ «Buyruqlar» (=commands) →
«Buyurtmalar» (=orders); plus UZ English-leak fixes («BOM»→Texkarta, «Output»→Chiqish/Mahsulot,
«Stock»→ombor, «Cost»→tannarx) and picker-title / external_code consistency alignments between
each `/new` and its `[id]` twin. Gates per commit: web tc0 · biome 0 · web 1229 pass/1 skip ·
i18n key-existence ru+uz · no-hardcoded (all 4 routes registered) · grep 0 hardcoded.
Browser-smoke skipped (additive i18n). **DEFER**: «Provedeno» posted-state transliteration
(project-wide convention, ~66 places — separate decision, not changed in isolation).

> **NOTE on the §C discovery table above**: its `i18n calls` / `hardcoded` columns
> are the **pre-fix discovery snapshot** (2026-06-02 survey), NOT updated as forms
> are completed. Treat the "Done" subsections (not the table) as the completion
> source of truth. Money-group rows are fully done despite non-zero table counts.

**SABOQ (products session, reaffirmed)**: Opus owns the i18n wiring — wrong keys
render silently. Verify with `grep -c useTranslations` at form start + a
key-existence check. Do `/new` and its `[id]` mirror together (same hardcoded
set) to avoid divergence.
