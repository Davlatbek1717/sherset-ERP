# retail/sessions/[id] — detail page parity audit

- **Module:** `retail/sessions` (Кассовая смена — read-only cashier shift summary + z-report + drawer cash ops) detail
  page (`apps/web/src/app/(app)/retail/sessions/[id]/page.tsx`; API route `/cashier-sessions` + `/retail-sales/z-report`)
- **Date:** 2026-06-03 (session 2026-06-03h — Cohort E: Retail)
- **Protocol:** Cohort batch audit (`scripts/wf-cohort-detail-audit.js`, run `wf_30430cdc-058`, 18-agent:
  premise → diff + completeness critic → blind refute-default verify). **Premise** used the GOLD CAPTURE
  `08-module/retailshift` as the baseline (no editable code sibling exists). **Operator (Opus) re-verified every
  confirmed delta + grounded every RU label against the captures + `pages.retail`/`payment_dialog` namespaces + verified
  the drawer-comment backend support and the `@moysklad/money` helper before applying.**
- **Reference:** GOLD CAPTURE `08-module/retailshift` (Смены) + `08-module/retaildrawercashin` (drawer dialog —
  confirms the «Комментарий» field). No editable code sibling.

## Verdict

retail/sessions is intrinsically sound as a read-only shift summary: API routes wired (`/cashier-sessions` detail +
drawer-in/out/get, `/retail-sales/z-report`), state-gated layout correct (cash reconciliation only when CLOSED, drawer
ops only when OPEN), discrepancy colour/sign correct. **Real fixes: (RS1 HIGH) the same hardcoded-Latin-uz leak as
retail/sales; (RS2 MED) the drawer Внесение/Изъятие dialog dropped the «Комментарий» the backend already accepts;
(RS3 LOW) the drawer amount was converted to minor units via float `Number()*100`; (RS4 LOW) money ignored the till
currency — all FIXED.**

## A. Structural / field deltas

| # | Element | moysklad/expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| RS1 | meta + z-report + cash-recon + drawer labels (L152 `Ombor`, `Tashkilot`, `Tashqi kod`, `Sof sotuv`, `Ochilish/Yopilish/Kutilgan kassasi`, `Kassa operatsiyalari`, `Summa`, `+ Naqd kiritish`, `− Naqd olish`, `Bu smenaning sotuv ro'yxati`, and the inline ` ta ` piece-unit) | i18n via `t()/tZ()/tFields()/tCommon()` | hardcoded Latin-Uzbek literals (the page i18n'd opened_at/closed_at/discrepancy/z-report rows but not these) → RU locale renders Uzbek = parity break | delta | high | **FIXED** → reused `fields.store/organization/external_code/sum`, exact `pages.retail` cash terms duplicated into `cashier_sessions.{opening_cash,closing_cash,expected_cash}`, new `cashier_sessions.{cash_operations,drawer_in,drawer_out,drawer_comment,session_sales_link}`, `z_report.net_sales`, `common.pcs`. ru+uz (capture-grounded RU: «Выручка», «Внесение»/«Изъятие»). |
| RS4 | money rendering (z-report + cash-recon + drawer-ops formatMoney) | the till currency (`session.cashDesk.currency`) drives the suffix | all `formatMoney(...)` defaulted to UZS `сум` | delta | low | **FIXED** → thread `currency = session.cashDesk.currency` into every formatMoney call. |

## B. Interactive deltas

| # | Element | moysklad/expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| RS2 | drawer Внесение/Изъятие input (L99-106 POST body) | moysklad's drawer dialog carries a «Комментарий» (confirmed in `retaildrawercashin` capture); the BE `DrawerCashSchema` already accepts `description` (schema L60) and the ops-list already renders `o.description` | the FE posted `{ sumMinor }` only — no comment input, so the supported field was unreachable (feature-gap) | delta | medium | **FIXED** → added a `drawerComment` state + a «Комментарий» Input; both mutations now send `description`; `afterDrawer` clears it. FE-only (backend already end-to-end). |
| RS3 | drawer major→minor conversion (L108-109) | exact currency-aware conversion | `String(BigInt(Math.round(Number(drawerAmount) * 100)))` — float coercion before BigInt + hardcoded `*100` (wrong scale for non-2dp currencies) | delta | low | **FIXED** → `Money.fromMajor(drawerAmount, tillCurrency).toMinor()` from `@moysklad/money` (string-decimal, banker's rounding, correct per-currency scale; `isCurrencyCode` narrows the till code with a UZS fallback). |

## Confirmed mirrors (correct shift specifics — NOT deltas)

- State-gated layout is correct: cash reconciliation (opening/closing/expected/discrepancy) renders only when
  `state==='closed' && expectedCashMinor`; drawer cash-in/out only when `state==='open'`. The drawer buttons correctly
  disable on empty/≤0 and while pending. Z-report overlaps SessionDetail totals intentionally (same aggregation).
- No EditForm / save / delete / FSM-transition / positions-editor — correct for a read-only shift summary.

## Deferred (documented for Phase-2)

- 🟡 **z-report `cashReturnsMinor` / `cardReturnsMinor` fetched but not rendered** (interface L64-65; the render shows
  only the combined returns count+sum). Whether moysklad's Z-отчёт breaks returns down by cash/card is **uncertain**
  (no clean capture of that block) → Phase-2 QA with a closed-shift capture; low value, money-safe.
- 🟢 «От кого»/«Основание» drawer fields seen in the capture are NOT added — the BE has only `description`; adding them
  would need backend columns (separate feature). The acquiring-bank / discount-commission shift totals the critic
  raised are LIST column-config («Другие поля»), not detail-page fields — refuted as a detail delta.

**Gates:** web tc 0 · biome 0 (changed) · web Vitest 1264 pass/1 skip · i18n key-existence ru+uz + no-hardcoded.
**HONEST: Phase-1 — NOT browser-smoked.** Live smokes owed (Phase-2): RU locale renders all labels Russian; a drawer
Внесение with a comment persists + shows; a half-tiyin / non-UZS-till amount converts exactly via Money.fromMajor.
