# retail/sales/[id] — detail page parity audit

- **Module:** `retail/sales` (Розничная продажа / Чек — read-only POS receipt) detail page
  (`apps/web/src/app/(app)/retail/sales/[id]/page.tsx`)
- **Date:** 2026-06-03 (session 2026-06-03h — Cohort E: Retail)
- **Protocol:** Cohort batch audit (`scripts/wf-cohort-detail-audit.js`, run `wf_30430cdc-058`, 18-agent:
  premise → diff + completeness critic → blind refute-default verify). **Premise auto-corrected the reference** to the
  GOLD CAPTURE `08-module/retaildemand` and demoted `demands/[id]` (the wholesale Отгрузка EditForm) to feature-source
  only — diffing the receipt against an editable doc would manufacture false "missing toolbar/save/FSM/PositionEditor/
  pickers" deltas. **Operator (Opus) re-verified every confirmed delta + grounded every RU label against the captures +
  existing namespaces before applying** (no guessed translations).
- **Reference:** GOLD CAPTURE `08-module/retaildemand` (Продажи) — read-only parity baseline; `demands/[id]` =
  feature-source only.

## Verdict

retail/sales is a correctly-scoped read-only POS receipt: meta grid + positions table + payment split (cash/card/
change) + print link + History tab. All API wiring is right and `auditEntity="retail_sale"` is correctly
vacuously-empty (the retail-sale service writes no audit log — NOT a work-orders-style PascalCase slug data-loss; not
"fixed"). **One real bug: nearly every visible label was a HARDCODED Latin-Uzbek literal that leaks into the RU build
(the no-hardcoded gate only catches Cyrillic) — FIXED.** Money display was also UZS-hardcoded — now uses the till
currency.

## A. Structural / field deltas

| # | Element | moysklad/expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| RS1 | every meta/table/payment/chrome label (L82 `← Smena`, L102 `Sana`, L106 `Kassa`, L110 `Kassir`, L115 `Mijoz`, L121 `Qaytarish asos`, L132 `Tashqi kod`, table `Tovar/Miqdor/Narx/Jami`, payment `Jami/Naqd/Karta/Qaytim`, L214 `🖨 Chop etish`) | i18n via `t()/tFields()/tCommon()` so RU locale renders Russian | hardcoded Latin-Uzbek string literals — only the title/status-badge/loading used i18n; in RU locale all these stayed Uzbek = parity break (documented EditForm uz-leak bug-class; leaks because the no-hardcoded gate is Cyrillic-only) | delta | high | **FIXED** → reused existing keys (`retail_sales.moment/cash_desk/agent`, `fields.product/quantity/price/sum/external_code`, `payment_dialog.cash/card/change`, new `common.print`) + new `retail_sales.{cashier,total,refund_basis,shift}`. ru+uz added. |
| RS2 | money rendering (positions + payment summary, formatMoney calls) | the receipt's till currency (`sale.session.cashDesk.currency`) drives the suffix | every `formatMoney(...)` called with no currency → always defaulted to UZS `сум` regardless of the cash desk's currency | delta | low | **FIXED** → thread `const currency = sale.session.cashDesk.currency` into every formatMoney call (suffix now correct for non-UZS tills; `formatMoney` scale is fixed /100 by design, out of scope). |

## B. Interactive deltas

(none — a read-only receipt has no save/delete/FSM/edit interactions; print links to the real `/print/retail-sale/[id]` route)

## Confirmed mirrors (correct retail-sale specifics — NOT deltas)

- **No DetailToolbar/DetailHeader, no save/cancel/delete, no FSM transition buttons, no PositionEditor, no
  counterparty/org/store/contract/project pickers, no DetailTotalsSidebar/VAT lines, no create-menu/email** — all
  legitimate: a retail sale is an immutable POS receipt the back-office only VIEWS (the wholesale Отгрузка scaffolding
  is feature-source, not a parity baseline).
- `agent` (Mijoz) + `refundedFrom` (Qaytarish asos) render only when present (optional / refund-only) — correct
  conditional absence. Refund mirror sale stores POSITIVE amounts so the `> 0n` payment branches display for refunds.
- `auditEntity="retail_sale"` → History tab vacuously empty (no audit writer) — known, correct, not flagged.

## Deferred (documented for Phase-2)

- 🟢 No deferrals specific to this page. The hardcoded-uz bug-class has no dedicated source-scan gate (Latin-uz is hard
  to detect without false positives); covered here by the i18n key-existence gate + manual grep (0 literals remain).

**Gates:** web tc 0 · biome 0 (changed) · web Vitest 1264 pass/1 skip · i18n key-existence ru+uz + no-hardcoded
(+11 new keys across common/retail_sales/cashier_sessions/z_report, all in both locales). **HONEST: Phase-1 — NOT
browser-smoked.** A live "switch to RU locale → all receipt labels render Russian" smoke is Phase-2 QA.
