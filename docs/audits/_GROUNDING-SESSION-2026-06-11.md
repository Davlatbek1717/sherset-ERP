# Grounding mega-session — 2026-06-11 (session «11e»)

> Successor to `_INPUT-PAKET-2026-06-10.md`. Records what the first grounding
> session actually found (the planned premise changed), the capture-tooling
> changes that unblock the track, and the **per-item ground truth** extracted so
> the next increment can act without re-deriving it.

## TL;DR — the premise changed

The 2026-06-10d plan assumed a **populated** paid account so UI edit-form captures
would harvest field labels. Reality found this session:

1. **`.env.local` had a UTF-8 BOM** (`EF BB BF`) → Node `--env-file` mis-parsed the
   FIRST key, so `MOYSKLAD_URL` was `undefined` and every capture silently navigated
   to `undefined/app/#…`. **Fixed** (BOM stripped; `.env.local` is gitignored).
2. **The saved browser session was EXPIRED.** `ensureSession()` only auto-logs-in when
   the auth FILE is *missing* — it never detected a present-but-stale session, so the
   script silently screenshotted the **login page** ("no rows" / "no create form").
   **Fixed** with `launchAuthed()` auto-recovery (probe app-root → if login page, re-run
   `automatedLogin()` and relaunch once; bail with an actionable message on a 2nd login
   hit = captcha/2FA). Deleting the stale `.auth/moysklad.json` + the BOM fix → auto-login
   succeeded (no captcha).
3. **The paid tenant (`farrux@climart_sanfex_group`, = the CLIMART API tenant) is
   DATA-EMPTY** for production / internal-order / retail documents. The list pages render
   (empty grids), but `openFirstRow` finds nothing → **detail (edit-form) captures need an
   existing document**. The API *samples* are also empty for these (`_api-real`: only
   `purchaseorder` + catalog returned rows). So neither account holds production/retail docs.
4. **Per-module reachability of the EDIT form on this account (verified live 2026-06-11):**
   - `internalorder` → ✅ create form opens (the only one fully grounded this session).
   - `processingorder · processingplan · processing` → ⛔ **the «Производство» option is NOT
     active** (banner «Использование опции Производство недоступно…»): the lists render
     (columns grounded) but there is **no «+ create» button**. Edit-form label grounding for
     production needs a **14-day trial / subscription option** enabled first.
   - `retaildemand · retailshift` → ⛔ **POS-driven**: the list toolbar starts at «Фильтр»
     (no «+ create»); detail needs an existing POS row → blocked until the account has POS data.

### Unblock built this session

- **`openCreateForm()` create-form fallback** (capture detail mode): when the list is
  empty, click the «+ Создать» button to open a **blank** new-doc form — it renders every
  field label (the §4 DOM ground truth) and **creates nothing** (never saved). Metadata
  records `viaCreateForm: true` for honest provenance. Required a **re-navigate** before the
  fallback because `openFirstRow`'s generic fallback can click a stray cell/upgrade-banner on
  an empty list and navigate away.
- **6 modules added to `MODULES`** (keyed by moysklad slug, routes confirmed live):
  `internalorder · processingplan · processingorder · processing · retaildemand · retailshift`.
- **`createLabel` = the literal create-button TEXT** (the «+» is an icon, not text — the old
  «+ X» values never matched because nothing was ever clicked by them before openCreateForm).
  internalorder = «Заказ» (grounded from its list capture). The other 5 createLabels are
  grounded from their list captures this session (see below).

## Per-item ground truth (extracted this session)

Sources: **static** `docs/moysklad-reference/data-model/document-schemas/*.json` (official
dev.moysklad.ru field tables — authoritative for STRUCTURE) + **live create-form capture**
(authoritative for UI LABELS, per §4 DOM-role).

| Backlog item | moysklad ground truth | Our state | Action |
|---|---|---|---|
| **IO-3 store label** | UI field = **«Склад»** (create-form capture + screenshot; api-docs *description* is «Склад назначения», but the UI uses the short «Склад») | was «Целевой склад» | ✅ **FIXED** → «Склад» / uz «Ombor» |
| **IO-4 planned date** | UI field = **«План. дата приемки»** (no ё, as moysklad renders it; api-docs description «…поступления» would have been WRONG — §4 win) | was «Планируемая дата поставки» (поставки = ship-OUT, wrong for an inbound request) | ✅ **FIXED** → «План. дата приемки» / uz «Rejalashtirilgan qabul qilish sanasi» |
| **PO rate** | `rate:{currency,value}` is stored **on the document** (sample `rate.value:12350`) = **per-document snapshot** | our `PurchaseOrder.rateValue` is a stored column (snapshot; kept on clone) | ✅ **VERIFIED already correct** — no change |
| **WO docDate** | `processingorder.moment` = «Дата документа» (DateTime) **exists** — moysklad has an editable doc date | our productions/work-orders lack an editable doc-date column | ✅ **DONE 2026-06-11f** (`_WO-DOCDATE-2026-06-11.md`) — `WorkOrder.moment` column (backfill from `created_at`) + schema/service/FE `/new`(now sends it)+`/[id]`(displays)/i18n; fixed a silent-drop bug (the editable header date was bound but dropped on create); guard tightened to require `moment:`. **Runtime-verified** (live API 8/8 + browser RU+UZ). |
| **boms cost-split** | `processingplan.costDistributionType` Enum (BY_PRICE, BY_PROD…) + `cost` «Стоимость производства» **exist** | our boms has `standard_cost` but **no** `costDistributionType` | ⏳ **DEFER** (BE+FE feature: enum column + FE picker). Ground truth confirmed. |
| **qty=0** | doc-schema `quantity` is `Float`, no explicit positivity constraint in the field def → behaviour-level question, not resolvable from schema alone | ~13 schemas accept 0 | ⏳ **DEFER** — needs a behaviour test (try qty=0 via the live API) or a product decision; schema evidence is inconclusive. |

## What remains (next grounding increments)

- **Detail captures for the other 5 modules are BLOCKED by account state** (not tooling):
  - `processingorder/processingplan/processing` → **activate the «Производство» option** (14-day
    trial in the moysklad UI: «Активировать пробный период») — then `pnpm capture-moysklad
    <module> --detail` harvests their edit-form labels via the create-form fallback. This is the
    prerequisite for **UI-label** grounding of WO docDate / boms cost-split (their STRUCTURE is
    already grounded from api-docs).
  - `retaildemand/retailshift` → need an existing **POS sale/shift** in the account, then
    `--detail` opens that row. (List captures collected this session: route + columns.)
- **WO docDate** + **boms costDistributionType** — BE feature work (own focused sessions; ground
  truth above is enough to start; UI labels need the Production option for the FE picker labels).
- **Conv-4 filter-bar** — capture-grounded per-entity; the list captures collected this session
  (filter-panel state `02-filter-applied`) feed it.
- **5b behaviour states** (filter-open, modal flows, print-preview, POS receipt) + **re-grab the
  broken `visual-captures/06-module/{enter,loss}`** lists into the v2.2 structure.

## Honest status

Phase-1 structural + §4 DOM-grounded for the labels actually captured (internalorder). The
deferred items have **confirmed ground truth** but are not yet implemented. The capture pipeline
is now robust (BOM + expired-session + empty-list all handled) — future grounding does not repeat
this session's archaeology.
