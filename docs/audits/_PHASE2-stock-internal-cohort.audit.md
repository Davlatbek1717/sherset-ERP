# Phase-2 QA — Cohort S (Stock + internal): enters · losses · inventories · internal-orders (2026-06-10)

**Method:** «ikki yarim» (`_PHASE2-100-PLAN.md`) — **A-battery** (API-adversarial, parallel
agent-per-page fan-out, Opus) + **B-battery** (browser/visual, Playwright MCP, operator-serial).
Every agent worked read-only-code + live API probe on its own ZZ-QA records, git/file-edit
forbidden. Operator trust-but-verify: every suspected bug ground-truthed by hand; the flagship
fix runtime-proven before commit.

**Status: Phase-2 VERIFIED** (runtime, not just gate-green). 1 HIGH fixed; LOW residuals are
either a project-wide class or grounding-gated (documented, not blindly touched).

---

## 🔴 HIGH — Posted Loss (Списание) recorded ZERO cost-of-goods → inventory valuation drift

**Found by:** losses A-battery agent (A6-DEEP cost-capture probe). **Confirmed by:** operator code
read + live runtime probe. **Class:** buyPrice/cost runtime bug-class (sibling of `066d55fb`);
Phase-1 had called the losses page "clean" — a sibling-diff/intrinsic audit cannot see a
never-populated runtime value.

**Bug:** the Loss form is qty-only — the user never enters a cost — so `LossPosition.costMinor`
is `NULL` on every draft (never set on create or update). `loss.service.ts post()` computed
`costPerUnit = p.costMinor ?? 0n`, i.e. **always 0**. Two consequences:
1. `sumMinor` («Себестоимость списания») was **always 0** on a posted write-off.
2. the stock-cost ledger delta was `costDeltaMinor: -0n`, so a posted write-off dropped **qty**
   but **never decremented `Stock.costBalanceMinor`** → inventory **valuation drift** (quantity
   falls, value stays). Bites every write-off; compounds over time.

**Live repro (pre-fix, agent):** product seeded with FIFO stock @ 50000 tiyin/unit (posted enter
sumMinor=500000); a loss of qty 3 recorded `sumMinor:"0"` instead of the expected 150000.

**Cost model (ground-truthed before fixing — NOT blindly mirrored from demand):**
`Stock.costBalanceMinor` is a **weighted-average** running cost total (stock.service.ts:207-209
"weighted-average per-unit cost"). Inbound **Enter** adds its cost to `costBalanceMinor` via
`applyDeltas` but creates **no supply lot** — so demand's FIFO consumer (`JOIN supply_positions`)
would value Enter-sourced goods at 0. The correct, source-agnostic basis for a write-off is the
balance's weighted-average unit cost (`costBalanceMinor ÷ qty-on-hand`), which is exactly what the
agent's repro expected (150000).

**Fix** (`loss.service.ts` post(), `f-pending`): source the per-unit cost from the already-locked
balance via `computePerUnitCost(costBalanceMinor, qtyOnHand)` (the exact scaled-integer helper from
`demand/fifo-consumer.ts`; returns 0n when qty≤0 ⇒ no basis), freeze it onto each position, and
keep the existing `valueMinor` formula. unpost()/cancel() were **already** reversing from
`p.costMinor` with the identical formula → they become correct for free, and the post↔unpost cost
**zero-sum** is preserved. **Migration-free** (no new table; reversal uses the existing per-position
`costMinor` column).

**Runtime proof (live api+db, operator probe — all PASS):**
- enter qty10 @ 50000 → loss qty3 post → `sumMinor = 150000` (was 0), position `costMinor = 50000`,
  stock qty 10→7.
- a 2nd loss qty2 → `sumMinor = 100000`, position `costMinor` **still 50000** ⇒ the weighted-average
  invariant held (`350000/7 = 50000`) ⇒ `costBalanceMinor` was decremented proportionally/correctly.
- unpost L1 → stock restored; re-post L1 → `sumMinor = 150000` again (round-trip stable).
- full cleanup → product stock back to 0.

**Guard:** `loss-cogs.test.ts` (+4, source-scan style for live-DB logic): asserts the helper import,
the weighted-average sourcing from `costBalanceMinor`, the delta + frozen cost coming from the
computed per-unit, and — **non-vacuously** — that the exact buggy `costMinor: p.costMinor ?? 0n`
persist line is gone (it existed before; unpost/cancel still READ p.costMinor to reverse, which is
correct and deliberately not matched).

**Bug-class breadth (adversarial "where else?"):**
- `purchase-return` post() — **OK**, values the outflow at the user-entered `priceMinor` (populated),
  not the buggy null `costMinor`. Not this class.
- `inventory` shortage — passes `costDeltaMinor: null` deliberately ("cost basis unchanged",
  inventory.service.ts:423/436). Whether a stock-count **shortage** should write off value at cost is
  a **grounding-gated** moysklad-parity question → documented, NOT changed here.
- `move` — store↔store, cost-neutral. N/A.

---

## Other findings — triaged

| # | Page | Severity | Disposition |
|---|---|---|---|
| 1 | losses | LOW | `quantity:'0'` accepted on create/edit while the message says "positive decimal". **NOT loss-specific** — `~13` document position schemas share the `/^\d+(\.\d{1,6})?$/` regex with no `>0` refine (demand·enter·supply·move·invoice-in/out·purchase-return·sales-return·retail·purchase-order·bundle); only bom/processing/cashier-session guard it. **DEFER as a project-wide class** (a one-off loss fix would create the inconsistency the project forbids). |
| 2 | enters | LOW | post() audit `fieldChanges` carries a bare `reason` enum key alongside the `{from}` status diff. **User-invisible** — HistoryTimeline filters non-object diff entries, so it never renders. Cosmetic/dead metadata; left as-is (loss post() is symmetric). |
| 3 | enters, losses | LOW | an **unposted-after-post** draft keeps the last posted `sumMinor` (unpost sets only state/applicable/postedAt). Display-only (a fresh draft shows 0); whether a draft should reset to 0 is a **moysklad-parity / grounding-gated** question (flagged by the enters agent). Not changed (consistent across enter+loss). |
| 4 | inventories | LOW | post→cancel FSM test leaves an **un-deletable cancelled** Inventory (delete requires draft). **Stock-neutral** (post +surplus then cancel reverses). Cleanup-accounting only, not a defect. |
| 5 | products | LOW | stale JSDoc header says "Save calls PUT" — code is `api.patch` / `@Patch(':id')`. Comment-only; **deferred to a doc-comment sweep** (fixing it standalone dragged in an unrelated pre-existing biome `useTemplate` lint in the same file). |

No suspected bugs at all on **internal-orders** (IO-2 externalCode round-trip holds; IO-1 movedSumMinor
is a BigInt-safe string), **inventories** (FSM, audit-label dictionary, optimistic-lock all pass),
or the structural battery (A3 includes, A4 08e-null clearing, A5 audit-label resolution, optimistic
lock) on any of the four pages.

---

## B-battery (browser, Playwright MCP — live :3100)

- **losses detail** renders cleanly (draft «Qoralama», all fields incl. «Tannarx» formatted «0,00» —
  correct for an unposted draft; the posted-cost path is the API-proven fix above). No crash.
- **internal-orders detail (POSTED)** renders read-only; the **IO-1** moved-progress banner shows
  **«Bajarilgan: 0,00 / 2 000,00 сум»** (UZ) / **«Выполнено: 0,00 / 2 000,00 сум»** (RU) — formatted
  money, no raw-minor leak.
- **RU-locale** switch on internal-orders: title «Внутренний заказ … от …» + all field labels
  Cyrillic; **zero Latin-uz leak** (checked a dozen uz field words — none present in RU mode).
- (MCP artifact, not a bug: a hard navigation to a deep detail URL 401s on `/auth/refresh` and
  bounces to /login; clicking «Kirish» lands on the redirect target authenticated. Known, per NEXT.md.)

## Hygiene

All ZZ-QA test records created by the A-battery (+ interrupted-run and prior-session orphans) were
swept: 18 deleted (posted docs unposted first → stock reversed). **Final scan: no posted ZZ-QA
documents remain** ⇒ stock balances uncorrupted. One stock-neutral **cancelled** inventory is
un-deletable by design (documented residual).

## Gate

api typecheck 0 · biome 0 (loss files) · `loss-cogs.test.ts` 4/4 · full api Vitest (regression run —
see commit). web untouched.
