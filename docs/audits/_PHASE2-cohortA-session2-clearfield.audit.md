# Phase-2 Session-2 — Cohort A (Hujjat-detail, seed-bor 7) + clear-field bug-class sweep

**Date:** 2026-06-10c · **Method:** «ikki yarim» (A-battery API-adversarial fan-out → operator
ground-truth → B-battery browser) per `_PHASE2-100-PLAN.md` §2. **Status:** Phase-2 (runtime-verified)
for the 7 seed-bor pages, **with ONE open money-critical finding escalated to the user** (Summa-input
scale, §C). Stack live: web :3100 · api :4000 · db :5433 · Playwright MCP.

## A. A-battery — 7-agent API-adversarial fan-out (`wf_2eaf8411-7ee`)

One Opus agent per page (customer-orders · demands · supplies · cash-in · cash-out · moves · payments-in),
read-only code + live API probe on its own `ZZ-QA-S2` records, git/file-edit forbidden. Battery A1–A7
(login + FE-shaped payload derivation · create 201 · GET-render include check [POS-crash class] · null-clear
edit-save [08e class] · FSM post + audit-log action-label localization [08l/08m class] · money string/F20 ·
reverse+cleanup). **Result: 7/7 pages passed all battery items.** Two findings (one real bug-class, one
seed-data artifact); details below. Every confirmed/suspected delta operator-ground-truthed before action.

## B. B-battery — browser (Playwright MCP, serial), all 7 pages

| Page | Render | Money fmt | State / lock | History i18n | Labels | Verdict |
|---|---|---|---|---|---|---|
| customer-orders | ✓ | «500 000,00 сум» + VAT «53 571,42» | «To'lanmagan» | no slug leak | — | CLEAN |
| demands | ✓ | formatted, no raw-minor | «O'tkazilgan» | — | — | CLEAN |
| supplies | ✓ | «9 969 000,00 сум» | «O'tkazilgan» | — | «Контрагент» (not «Поставщик») ✓ | CLEAN |
| cash-in | ✓ | «500 000,00 / 5 000 000,00 сум» | «O'tkazilgan» | — | — | CLEAN* |
| cash-out | ✓ | «300 000,00 / 5 000 000,00 сум» | posted-lock Alert + all disabled | «Ommaviy tahrirlash» (localized) ✓ | — | CLEAN* |
| moves | ✓ | (seed has empty positions) | «O'tkazilgan» | — | both stores «Ombordan»/«Omborga» ✓ | CLEAN |
| payments-in | ✓ | «200 000,00 сум» | «O'tkazilgan» | — | — | CLEAN* |

`*` = the money-**header** docs also exhibit the §C Summa-input finding. Console errors on every page = only
the benign favicon-404 + the documented `/auth/refresh` 401 MCP artifact. moves L4 money-cell (r.currency)
could not be re-checked — the seed move (and all sampled doc seeds) have **empty positions** (a known seed
import artifact: header sum present, positions:[]). Not a code fault; flagged for a populated-doc re-check.

## Bug-class fixed — clear-field («|| undefined» → «|| null»)

**Class:** a detail save handler sending an optional field as `field || undefined`. Emptying the field →
`'' || undefined` → `undefined` → key OMITTED from the PATCH → the service's partial update
(`if (dto.x !== undefined) data.x = …`) SKIPS it → the old value silently survives (clear has no effect;
no error shown). Sibling of the counterparty phone-clear fix `f9ba78e1`. The fix is `|| null`: the service
writes null (clears the column) and skips undefined. Each field's Zod schema must accept null
(`.nullish()`); where it was `.optional()`-only, the schema was widened (column already nullable, no migration).

**Discovery:** A-battery flagged it on cash-out; a 10-agent verification fan-out (`wf_a6a1bd7a-0f5`) then
classified every other `|| undefined` site in the app with live-API evidence (BUG / NOT_A_BUG / RISKY).

### Fixed (10 detail pages) — all live-proven (create→PATCH null→GET=null; OLD undefined→value survived)

| Surface | Pages | Fields | Schema |
|---|---|---|---|
| Money docs (FE) | cash-in · cash-out · payments-in · payments-out | paymentPurpose · description (+ incomingNumber on payments-in) | already `.nullish()` |
| Settings (FE) | bank-accounts · price-types · organizations | bankName/accountNumber/bic · externalCode · legalTitle/legalAddress/email/phone/director/directorPosition/chiefAccountant/externalCode + `uzRequisites` else→null | already `.nullish()` |
| Production (FE+BE) | production/stages · boms · processes | code · externalCode · description | **widened** `.optional()`→`.nullish()` (processing-stage / bom / processing-process schema; column nullable, no migration) |

- **Browser E2E (gold-standard):** created a draft cash-out via API → opened the real form → cleared «Asos»
  (paymentPurpose) + «Izoh» (description) → clicked Saqlash → API `paymentPurpose=null, description=null`
  (v1→2). The FE handler now sends null end-to-end.
- **Guard:** `apps/web/src/__tests__/clear-field-payload.test.ts` (+38, non-vacuous: each `|| undefined`
  shape existed pre-fix). Asserts each fixed field uses `|| null` and the production schemas are `.nullish()`.

### NOT a bug (verified, intentionally left as-is) — would REGRESS if changed

- **counterparties** `uzRequisites.{mfo,okoned,account}` + **organizations** `uzRequisites.{inn,okoned,mfo}`
  sub-keys: schema `.optional()` **rejects null** (`|| null` → 400); the JSON column is replaced wholesale, so
  omitting a sub-key already clears it. Left `|| undefined` (correct). Live-proven both directions.
- **Position-level** gtdNumber/gtdSumMinor/countryId (supplies, sales-returns), priceMinor (internal-orders):
  positions are rewritten wholesale (deleteMany + createMany), so omitting a field already clears it.
- **retail/sessions** drawer `description || undefined`: a CREATE payload (nothing to clear). N/A.

## C. ~~OPEN~~ ✅ RESOLVED money-critical finding (fixed same-day in the follow-up session)

> **RESOLUTION (2026-06-10c part 2, commits `8313b69a` + `2ce81f2e`):** escalated to the user → user said
> «fix now, full app-wide» → reusable `<MoneyInput valueMinor/onChangeMinor>` (som display, tiyin storage)
> rolled out to PositionEditor + all money docs/prepayments/adjustments/payroll/products; browser-proven E2E
> both directions. See `_PHASE2-money-input-som.audit.md`. The text below is the original finding as written.

**Money-doc Summa input binds raw `sumMinor`.** On cash-in/cash-out/payments-in/payments-out the «Summa»
field is `<Input value={form.sumMinor} />` — it shows/accepts the **minor** value (e.g. a 300 000,00 сум
doc shows `30000000`; browser-confirmed: cash-in 50000000, cash-out 30000000, payments-in 20000000, and a
fresh draft of 50,00 сум showed `5000`). A user creating a doc and typing the major amount (e.g. `300000`
for 300 000 сум) would book a **100×-too-small** document (3 000,00 сум). Consistent across all 4 money-header
docs (positions docs are unaffected — they compute totals from positions, no manual sum input).

**Why not fixed here:** (1) money-critical — a wrong major↔minor conversion would 100×-regress live flows;
(2) **no detail-form capture exists** to ground the intended input format (only list-view PNGs in
`docs/moysklad-reference/cash-out/`), and §4/§6 forbid blind money-scale changes; (3) it spans the money-doc
family and touches create+edit+display (the DS `formatMoney /100` display half is the same grounding-gated
class deferred in 08o). **Needs:** a moysklad ПКО/РКО/payment detail-form capture + a careful MoneyInput
(major display, major→minor on change, currency-scale aware) in a focused session. **Severity: HIGH** (manual
money entry), but pre-existing and consistent (not introduced here).

## Other deferred (documented, not blind-fixed)

- Doc seeds with header sum but **empty positions** (customer-orders 02496/02494, demands, supplies, moves):
  a seed/import artifact (positions never persisted). FE reads `data.sumMinor` so totals display, but an
  edit-save recomputes totals from the empty positions → would zero the header sum. Not a live-code fault;
  flagged for the seed data, and means F20 reconciliation can't run on these specific seeds.
- moves L4 r.currency money-cell: needs a move WITH positions (all sampled seeds empty).

## Gate

api tc0 · web tc0 · biome0 (14 files) · **web Vitest 1499 (+38, was 1461)** · **api Vitest 2818 (0 regress)**.
Environment restored: all `ZZ-QA-*` records removed (production entities archived — they have no hard-delete;
config-only, zero balance impact), no scratch files, balances untouched (no posted docs left).
