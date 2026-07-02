# Phase-2 QA — Production owed smokes + retail register cash-scale bug-class (2026-06-08o)

> **Mode:** local Opus, ultracode. Live stack: web :3100 · api :4000 · db `moysklad_dev` :5433 · Playwright MCP.
> **Anti-confabulation baseline (run FIRST):** optimistic-lock harness **180/180** (30 entities live green) + git log matches
> NEXT.md's claimed commits (`b23bd63c`…). The session-start-audit *workflow* was interrupted by the user re-issuing
> `davom et` (the interrupt killed the 3 in-flight audit agents before synthesis); its purpose was substituted with the
> direct verification above + the per-fix runtime proofs below.

## Part A — Production/catalog owed smokes (Phase-1 fixes → runtime-CONFIRMED)

All three were already Phase-1 *fixed*; the owed work was real-browser confirmation that the fix holds end-to-end.

| Smoke | What | Result |
| --- | --- | --- |
| **B4** | Save BOM with `outputQty=0` → localized rejection | ✅ FE blocks at `/production/boms/new`: «Количество должно быть больше 0», **no POST fired** (network confirmed). Adversarial **API-direct** probe: `POST /boms {outputQty:'0'}` → **400** «outputQty must be > 0»; `'-1'` → **400** (the backend `.refine(v>0)` closes API callers too). |
| **P1** | Submit empty/invalid process → localized error banner (not the old «Этапов: 1» count label) | ✅ All 3 sub-cases at `/production/processes/new`, **visible red banner**, no POST: **P1c** empty name → «Название — обязательное поле»; **P1b** unpicked stage → «Выберите этап» (distinct from the «Выбрать этап» button label); **P1a** 0 stages → «Добавьте хотя бы один этап» (count label correctly reads «Этапов: 0»). |
| **S1/S2** | A saved stage with a materialStore + named performers (`allPerformers=false`) → store NAME + performer NAMES render, not UUIDs | ✅ Created such a stage, **fresh GET reload** of `/production/stages/[id]`: materialStore = «Asosiy ombor», performer chip = «Admin User», **zero UUIDs anywhere on the page**. Backend `findById` includes `materialStore.name` + `performers.employee.name`; serialize surfaces them; FE sets the labels on load. |

No new bugs in A — all Phase-1 fixes hold.

## Part B — 🟠 NEW BUG (found by adversarial exploration): retail register cash-entry money-scale class

**Where:** `apps/web/src/app/(app)/retail/page.tsx` — open-shift (`openingCashMinor`) + close-shift (`closingCashMinor`).

**Bug (the follow-through of 08k's POS-register *drawer* fix):** both cash entries converted major→minor with a hardcoded
`String(Number.parseInt(x || '0', 10) * 100)`. Two defects:

1. **Decimal truncation (LIVE, all 2-decimal/UZS desks):** both inputs are free-form `type="number"` that accept decimals.
   `parseInt("150.50")` → 150 → 15000 — the 50 tiyin is **silently dropped**. A real data-integrity bug today.
2. **Hardcoded `*100` (latent):** assumes a 2-decimal currency; a 0-decimal desk (JPY) is inflated 100×.

The register *drawer* (line ~334) was already hardened in 08k to `Money.fromMajor(drawerAmount, tillCurrency).toMinor()`;
the two shift-cash entries were the un-hardened siblings (gate-invisible: tc/biome/unit never exercised the conversion).

**Fix:** both entries now use `Money.fromMajor(<entry> || '0', <deskCurrency>).toMinor().toString()`:
- **close-shift** → `tillCurrency` (already derived from `session.cashDesk.currency`, line 228).
- **open-shift** → currency derived from the **selected** desk: `isCurrencyCode(cashDesks…find(d=>d.id===cashDeskId)?.currency) ? … : 'UZS'`.

**🔬 Browser-verified end-to-end (live register, real DB):**
- Close current UZS session with closingCash **"150.50"** → stored `closingCashMinor` = **15050** (decimal preserved; old code → 15000).
- Open a session on a **JPY** desk (created for the test) with openingCash **"150"** → stored `openingCashMinor` = **150**
  (JPY 0-decimal; old `*100` → 15000, a 100× inflation). This proves both the per-desk currency derivation and the scale.
- Env restored: JPY session closed, fresh UZS Smoke-kassa session opened, JPY desk archived (active desks back to UZS×2).

**Guard:** `apps/web/src/__tests__/retail-cash-scale.test.ts` (+3) — source-scan: both entries use `Money.fromMajor`, open-shift
derives currency via `isCurrencyCode(deskCurrency)`, and the buggy `parseInt(...)*100` is gone (non-vacuous: matched pre-fix).

**Out of scope (deliberately NOT changed), documented:**
- `components/pos/payment-dialog.tsx` is **not** in this bug-class: its keypad is **integer-only** (no decimal entry possible),
  so there is no truncation bug, and it does not receive a currency. Its only theoretical issue is the JPY scale —
- The design-system **`formatMoney` hardcodes `/100`** (`packages/design-system/src/lib/format.ts`): the *display* layer
  assumes 2-decimal currencies everywhere (the `currency` arg only changes the suffix, not the scale). So a non-2-decimal
  desk (JPY) is not yet correctly *displayable* anywhere, and 2-decimal non-UZS desks (USD/EUR) show a wrong suffix when
  callers don't thread `currency`. **Full non-2-decimal / non-UZS currency support is a separate, grounding-gated DS effort**
  (does moysklad even offer non-UZS retail desks? parity capture needed) — NOT done blind here. The cash-WRITE path is now
  correct; the DISPLAY path remains a known limitation.

## RS4 status

RS4 ("non-UZS cash desk → right currency suffix") was the trigger that surfaced Part B. Reframed honestly:
- ✅ **Cash-write scale** is now currency-aware and **browser-verified** (JPY open 150→150; UZS close 150.50→15050).
- 🟡 **Currency suffix / display** remains blocked on the DS `formatMoney /100` assumption (see above) — deferred.

## Gate

web typecheck **0** · biome **0** (2 files) · web Vitest **1461 (+3, 0 regress)** · api untouched (**2805**).
