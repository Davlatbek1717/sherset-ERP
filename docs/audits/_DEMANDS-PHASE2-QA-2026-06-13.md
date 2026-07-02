# Demands (Отгрузка) — Phase-2 adversarial QA (2026-06-13)

## 🟢 2026-06-14 — 4 backlog flagships closed (user: «4 ta ish, professional»)

Grounded 6 candidates (`wf_207873ba-7d1`), built the 4 cleanest, deferred the 2 that need a decision/architecture.

- **✅ list date-tz CLASS sweep — `87c2e886`.** 31 list/findAll services migrated off the UTC end-of-day
  idiom (`lte: new Date(\`${to}T23:59:59.999Z\`)` on `@db.Timestamptz`) to shared `tashkentRangeBounds`
  (deterministic codemod, 60 from/to blocks). EXCLUDED `consignment.expiryDate` (`@db.Date` — its inclusive
  `lte` is correct). Guard `report/list-date-tz-class.test.ts` (+64). Live `verify-list-date-tz-smoke` 5/5
  (boundary doc at Tashkent D+1 02:00 excluded from `momentTo=D`, included in `momentFrom=D+1`).
- **✅ double-round cascade PO.receivedSum / CO.shippedSum — `0d798630`.** 5 cascade producers (CO applyShipment,
  Supply post/unpost/cancel, PurchaseReturn) now single-round via `computePositionTotal` (was scaleMinorByQty
  + integer-divide discount + VAT = triple-round). A fully-received PO / fully-shipped CO now has
  receivedSum/shippedSum == header sumMinor exactly. (Completion state is qty-based → this was display-only,
  no state regression.) Guard `supply/cascade-single-round.test.ts` (+4). Live 4/4 (3×3334 disc10 → 9002, legacy 9001).
- **✅ post/unpost/cancel/delete TOCTOU — `dd33fac5`.** Each transition atomically CLAIMS its state change
  (conditional `updateMany WHERE state=<expected>`, taking the row write-lock) as the first tx op → exactly one
  wins, losers get count 0 (ConflictException) or P2034 (now mapped to 409 in PrismaExceptionFilter, was raw 500).
  Closes double FIFO-consume/stock-deduct on parallel post + double refund on parallel unpost. delete() folds its
  state check into one conditional updateMany. Guard `demand/demand-toctou.test.ts` (+5). Live concurrent
  `verify-demand-toctou-smoke` 9/9 ×3 (6 parallel posts → 1 success + 5 clean 4xx + 0 5xx, stock deducted ONCE).
  ⚠️ **Demand-only** — supply/returns share the pattern (class follow-up, below). Narrower stale-positions window
  documented as residual.
- **✅ detail-display #4/#5 — `34062e92`.** findById now returns organizationAccount + both planned dates;
  migration `20260614000000` + schema/service for `paymentPlannedMoment` («План. дата оплаты», mirrors InvoiceOut).
  FE (implementer agent, diff verified): demands/[id] shows/edits org-account + delivery + payment dates;
  demands/new sends paymentPlannedMoment. Guard `web/demand-detail-fields.test.ts` (+6). Live API round-trip
  `verify-demand-detail-fields-smoke` 5/5. **Browser-RENDER = Phase-2 pending** (API data-path certed, render not smoked).

**➡️ Remaining demands backlog (each a fresh flagship — NOT closed):**
- ⏸️ **COGS=0 on uncovered stock** (MED, money valuation) — grounding says ACTIONABLE-by-mirroring-loss-COGS BUT
  "a 5-min product-owner nod is prudent" (FIFO-demand vs loss weighted-avg differ for negative-stock units). NEEDS a
  valuation decision before building — do NOT rush money to a count (pt4 lesson).
- ⛔ **BE error Latin-uz** (GATED architecture) — confirmed ZERO server-side i18n; 1320 throw sites across 123 files.
  Needs an error-code strategy (A/B/C in grounding); fixing demands alone is inconsistent. + createFromCustomerOrder
  UUID leak (`:248`) is a small orthogonal win.
- ⛔ **H4 OWN/OWN_GROUP scope** (HIGH security) — user chose «build» in pt4, but a naive build BREAKS the app
  (`scopedWhere` dead code, `Demand.groupId` always NULL). It's a cross-cutting RFC (groupId data-model + backfill
  + ~60 entities). SPEC-first, dedicated multi-session effort — see NEXT.md.
- ⏸️ **TOCTOU class-wide** — apply the atomic-claim pattern to Supply/SalesReturn/PurchaseReturn/etc. transitions
  (same shape as demand `dd33fac5`).
- 🟡 LOW (open): positions «Уп.»/«Кол-во» (capture-gated) · «Проведено» toggle on /new · overheadMajor float ·
  edit-save large-qty exponential stringify · transitions all gated by one `approve` perm.

---


> Workflow `demands-phase2-qa` (run `wf_c195ba88-852`): 6 adversarial lenses over the demands
> FE (list/[id]/new) + BE (demand.service/schema/controller, fifo-consumer, demand-overhead) +
> moysklad capture, each finding blind-verified (refute-default). **Run 1**: 5 of 6 lenses hit a
> transient server rate-limit; only **capture-parity** completed (7 raw → 6 confirmed, 1 refuted).
> **Run 2** (resume, `w85quw24h`): re-runs the 5 rate-limited lenses against the now-committed code.

## ✅ FIXED — committed `bb86188f` (live smoke 4/4)

Two confirmed HIGH **silent-drops** on `/demands/new` (user data lost with no error):

1. **organizationAccountId** («Счёт организации») — the picker POSTed it, but it was only in
   `DemandFilterSchema`, not `CreateDemandSchema` → Zod stripped it, never persisted. Column already
   existed. Fix: added to write schema (+ `agentAccountId`), persisted in `create()`, connect/disconnect
   in `update()`. No migration.
2. **deliveryPlannedMoment** («План. дата отгрузки») — POSTed but no column/schema field → discarded.
   Fix: migration `20260613100000_demand_delivery_planned_moment` (nullable, mirrors InternalOrder/
   CustomerOrder) + schema + persist.
3. **label** «Дата отгрузки» → «План. дата отгрузки» (ru) / «Rejadagi jo'natish sanasi» (uz) — DOM-grounded
   field-role label in `dom/08-edit-default.html` (`<td class="label first"><div class="gwt-Label">…`).

Guard `demand-account-planned-fields.test.ts` (+6, non-vacuous). Gate: api tsc 0 · biome 0 · api Vitest
2994 / 0 fail. Smoke: create persists both (GET == input), update changes date + clears account
(disconnect); pre-fix GET returned null for both regardless of input.

## ⏸️ DEFERRED (capture-parity, MED/LOW — next session)

- **#4 MED** — «Счёт организации» + «План. дата отгрузки» absent from the **detail** page
  (`[id]/page.tsx` DocumentMetaPanel) and its save payload: after the fix they persist on create/edit
  via `/new`, but the read-only detail view can't show/edit them. Mirror invoices-out/supplies detail
  which expose organizationAccountId. (Write-path is now done; this is the display/hydration half.)
- **#5 MED** — «План. дата оплаты» (`paymentPlannedMoment`) missing entirely (DOM-grounded twice in
  `dom/08-edit-default.html`, field-role). No column/schema/UI. Mirror **InvoiceOut/InvoiceIn**
  (which carry `payment_planned_moment` — NOT CustomerOrder; the finding's mirror attribution was
  corrected by blind-verify). Needs migration + schema + create/update + a date field on /new + detail.
- **#6 LOW** — positions table renders an extra «Уп.» (goodPack) column moysklad's demand positions
  header lacks, and omits «Кол-во» (quantityInPacks). Shared template across customer-orders/
  invoices-out/sales-returns `/new` (POSITION_COLUMNS) — needs a broader decision + a data-bearing
  capture before changing the default visible set.

## ✓ REFUTED (blind-verify, correctly)

- list «Сумма» hardcodes `'UZS'` while «Оплачено» passes `row.currency` — **not a bug**: both use
  `formatMoney(x, …, {displayAs:'none'})`, and in the `displayAs:'none'` branch `formatMoney` never
  reads the currency arg (grouping is hardcoded `ru-RU`, fraction is `%100n`), so output is identical
  byte-for-byte. Dead-argument style nit only, zero user-visible effect.

## Run 2 (resume `w85quw24h`, 5 deep lenses) — 33 raw → 25 confirmed / 8 refuted

> Multi-agent-safety win: because the silent-drop fix was committed (`bb86188f`) BEFORE the resume,
> the re-run's blind-verify read the FIXED code and correctly **refuted** the 3 already-fixed
> capture-parity findings (deliveryPlannedMoment / label / organizationAccountId) — they no longer
> reproduce. The remaining confirmed findings are valid against `bb86188f`.

### 🔴 HIGH (open — top next-session priorities; each a WIDE class, deserves fresh context)

1. **✅ FIXED `18626d51` (Round 5 pt3, app-wide — `_MONEY-LINE-SCALE-2026-06-13.md`).** Shared
   `@moysklad/money` `scaleMinorByQty` (6-dp, round-half-up) replaced the idiom at 27 sites incl. the
   adversarial-workflow-caught internal-order BE; class-lock + live smoke 3/3 (sumMinor 333433 not 333300).
   ~~3-decimal money truncation vs 6-decimal stock/FIFO~~ — `demand.service.ts:1248-1255`
   `computeTotals` does `(priceMinor * BigInt(Math.round(qty*1000)))/1000n` (3 dp) while the schema
   accepts `quantity` at 6 dp and the stock ledger (`toMicro`) + FIFO (`parseDecimalScaled`, SCALE
   1e6) use 6 dp. So the BILLED line total diverges from the physically-shipped/costed qty: e.g.
   qty `0.0004` bills **0** but ships/cost 0.0004 units; qty `100.0005` over-bills 5 сум. Float
   `Number(qty)` math too. **Fix:** `(priceMinor * parseDecimalScaled(String(qty))) / 1_000_000n`
   (roundHalfUp). **WIDE CLASS** — same `Math.round(qty*1000)/1000n` in `demands/new/page.tsx:71`,
   `PositionTable.tsx:230`, `PositionEditor.tsx`, `print-render.util.ts:80`, and 9 sibling FE doc
   forms (customer-orders, invoices-out/in, supplies, sales/purchase-returns, purchase-orders,
   internal-orders, enters). Found independently by 3 lenses. → its own app-wide flagship.
2. **✅ FIXED `0c365417` (Round 5 pt4).** `DetailTotalsSidebar` got a `currency` prop (default UZS)
   threaded into the 4 formatMoney calls + passed `currency={data.currency}` from the 9 money/internal
   detail pages; `currency` added to the 6 detail types that lacked it (findById already returns it).
   sidebar test 9/9 (USD ≠ «сум»); live smoke F (USD demand detail returns currency=USD).
   ~~Detail totals sidebar hardcodes «сум»~~ — `detail-totals-sidebar.tsx`.
3. **✅ FIXED `c26f27f7` (Round 5 pt4).** Shared `discountPercent` (regex + refine ≤100) caps the
   discount across the 8 unbounded doc schemas (customer-orders already had `.max(100)`). Confirmed
   discount IS a percentage (`(100-disc)/100`). Guard 26 (accept 0..100, reject 150/100.01/-5 + 8-module
   lock); live smoke E (discount 150 → HTTP 400). ~~Position discount has no upper bound~~.
3b. **🟡 ✅ double-round single-round unification `b1eae7be` (Round 5 pt4).** Routed the 8 doc
   computeTotals + retail compute-positions + print-render through `computePositionTotal` (single-round)
   so stored sumMinor == server PDF == React browser-print. api 3075/0-fail (0 test breaks); live smoke
   G ('3'×3334 disc 10 → 9002, was legacy 9001). PO-receivedSum / CO-shippedSum cascades left as-is.
4. **⛔ NEEDS USER DECISION — do NOT enforce naively (grounded `wf_915a8273-923`).** The scope helpers
   (`canAccessRecord`/`scopedWhere`) are **DEAD CODE — NO api service enforces record-scope**, so
   demands ALREADY match the project convention (tenant-wide). `Demand.groupId` is **never written
   (always NULL)** → enforcing `OWN_GROUP` would HIDE demands from managers viewing a subordinate's
   shipment (the exact regression). Doing it right = a cross-cutting RFC (groupId data-model + backfill
   migration + ~60 entities + thread employeeId everywhere). **Building it now would break the app.**
   — original analysis: `demand.service.ts:70-131,285-450,
   452-485,490-509`. Employee role defaults are view=OWN_GROUP, update=OWN, approve=OWN
   (`permissions.types.ts:197-207`), but the demand service never calls `canAccessRecord` /
   `scopedWhere` — any user with role-level demand access reads/mutates/posts/deletes EVERY tenant
   demand. **Project-wide gap** (sibling doc services likely identical). Fix: enforce row-scope in
   findById/update/transition/delete + merge `scopedWhere` into list `where`. **Verify the scope
   model is INTENDED for documents before enforcing** (could break legitimate cross-user access).

### 🟠 MED

- **✅ list date-tz UTC-midnight FIXED `b8b5e178`** — demand list now uses shared `tashkentRangeBounds`
  (half-open Asia/Tashkent `[gte,lt)`). NOTE: the same UTC-midnight idiom recurs in **~31 other list
  queries** — a separate class sweep (the helper is ready).
- **✅ bulk dup-id FIXED `b8b5e178`** — `runBulk` now dedupes ids first (no same-entity concurrent race).
- **✅ zero-qty BE schema FIXED `b8b5e178`** — `DemandPositionInputSchema.quantity` got `.refine(>0)`;
  live smoke H (qty 0 → HTTP 400). NOTE: likely a class (other doc schemas) — follow-up.
- **✅ CSV export «сум» FIXED `b8b5e178`** — demand list CSV cellText now threads `r.currency`.
- **~~qty precision near Decimal(20,6) ceiling~~ ✅ FIXED earlier (pt3, `18626d51`)** — scaleMinorByQty
  removed the `Number()→Math.round(*1000)`.
- **⏸️ DEFER (money flagship) — COGS=0 on uncovered stock** (`demand.service.ts:627-686,786-790,836`) —
  shipping with `allowNegativeStock` records COGS 0 for uncovered units. Needs a cost-valuation decision
  (weighted-avg, mirroring the loss-COGS fix) + runtime proof. Not a mechanical fix.
- **⏸️ DEFER (concurrency flagship) — post() TOCTOU** (`:461-466,745-748,763-806`) — positions snapshot
  outside the tx, no version guard. (blind-verify REFUTED the stronger double-deduction; narrower race.)
  Needs tx-wrap + version guard + a concurrent test.
- **⏸️ DEFER (concurrency flagship) — delete() TOCTOU** (`:473-485`) — state check outside any tx.
- **⏸️ DEFER (project-wide architecture) — BE error messages hardcoded Latin-uz** (`demand.service.ts`
  291-292,456-457,476,731-733,…) + **createFromCustomerOrder Latin-uz + raw UUID leak** (`:244-264`).
  There is **no server-side request-locale i18n** today — every service throws Latin-uz. Fixing demands
  alone is inconsistent; needs a BE-error-i18n strategy (error codes the FE translates) across all services.

### 🟡 LOW (open)

- positions «Уп.» extra col / missing «Кол-во» (`new/page.tsx:86-100`) — shared sales-side template.
- «Проведено» toggle on /new silently dropped — API always creates draft (`new/page.tsx:337`).
- list sum cell hardcodes 'UZS' (`page.tsx:390`).
- overheadMajor via `Number(bigint)/100` float (`[id]/page.tsx:198-200`).
- edit-save sends quantity as JS number → exponential stringify 400 on large values (`[id]/page.tsx:387-391`).
- `moment` parsed local vs date-only fields parsed UTC-midnight — same-doc tz inconsistency (`new/page.tsx:336`).
- transitions all gated by one `approve` permission — can't separate unpost/cancel (`controller.ts:74-82`).

### ✓ Refuted by blind-verify (8)

3 already-fixed (deliveryPlannedMoment / label / organizationAccountId — confirm the fix holds);
list «Сумма» UZS (displayAs:'none' ignores currency); overhead-currency reconciliation (handled);
double-post double-deduction (state guard exists); FOR UPDATE ordering (serializes correctly);
createFromCO over-ship (per-position remaining is recomputed). Good signal — the refute-default
verify killed plausible-but-wrong findings.

## Honest status

**Phase-2 audit COMPLETE** (6 lenses, blind-verified). **2 HIGH silent-drops FIXED + certified**
(`bb86188f`). **Open: 4 distinct HIGH + 10 MED + 7 LOW.** demands is NOT yet "Phase-2 verified" —
the money-integrity 3-dp class (app-wide), the currency-leak (13 pages), and the OWN-scope authz
gap (project-wide) are the highest-leverage next flagships, each warranting fresh context.
