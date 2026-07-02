# processing-orders — LIST parity audit (Cohort L5)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_68a1e798-7d2`, 41 agents, 25 confirmed).
**Ground-truth (§4):** **NO clean capture** — `10-module/productionorder/*` is CONTAMINATED (renders «Заказы покупателей»). Deltas are sibling-parity against the twin `processings` (same no-currency money model, FSM-3-state, bulk+mass-edit) + cohort-family date grounding.

## A. Structural / column deltas (FIXED)

- **doc-number column** raw `'№'` string literal → `tFields('number')` («№», same glyph) — i18n discipline (gate-blind literal). DOM-grounded on the twin processings.
- **date column** `tFields('moment')` («Дата») → `tFields('time')` («Время») — cohort-wide date bug-class; both captured production-doc siblings (processings, work-orders) ground «Время». processing-orders has no own capture → family-parity.

## B. Interactive / data deltas (FIXED)

- 🟢 **`microqtyToWhole` precision bug** — was `Number(microqty)/1_000`, which loses precision once the ×1000 microqty BigInt exceeds `Number.MAX_SAFE_INTEGER`. Replaced with the BigInt-safe digit-walking implementation already used by the `processings` twin (intrinsic critic finding, not a label delta).

## DEFER (Phase-2 / capture + BE — documented, not fixed)

- 🟡 **Page title «Заказы на переработку» → «Заказы на производство»** — the live moysklad **menu** (visible in all 4 clean L5 captures) shows «Заказы на производство», not «…переработку». However processing-orders has **no dedicated list capture** (the one capture is contaminated) to confirm the page H1, and the term ripples through the entity title used in filters/pickers across `processings` + `processing-orders`. Per CLAUDE.md §4 (DEFER when not DOM-role grounded for that page) → **re-capture the «Заказы на производство» list in Phase-2 and apply the title fix then.**
- 🟡 **Hardcoded `'UZS'`** money cell — BE-consistent: `processing-order.controller.ts` has **no currency column** (defaults UZS for the label). Currency column = BE feature-gap, NOT the L4 `r.currency` fix.
- 🟡 **Column-set realignment (quantity/store/date)** — no clean capture; column set is sibling-derived. Confirm in Phase-2 with a clean capture.

## Gates
typecheck 0 · biome 0/0 (staged) · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding ✓ (№/date wiring-lock) · web Vitest 1331 pass/1 skip (no regress).
