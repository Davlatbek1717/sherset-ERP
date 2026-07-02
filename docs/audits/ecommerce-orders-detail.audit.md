# ecommerce/orders/[id] — detail page parity audit

- **Module:** `ecommerce/orders` (Заказы интернет-магазина — an imported online order) detail page
  (`apps/web/src/app/(app)/ecommerce/orders/[id]/page.tsx`; no `/new` — orders are imported)
- **Date:** 2026-06-04 (Cohort H — e-commerce/pricing)
- **Protocol:** Cohort batch audit (`wf_48fd9e45-543`). Premise treated this as a READ-MOSTLY imported order and demoted
  `customer-orders/[id]` to feature-source only (an imported order legitimately lacks manual create / editable positions /
  clone / print / posting-FSM). Operator ground-truthed each delta + the backend audit-write gap.
- **Reference:** `customer-orders/[id]` (displayed order-meta only) + capture: none (sibling-parity + critic).

## Verdict

ecommerce/orders is a correctly-scoped read-mostly imported-order view (customer + items + sum + accept/reject/convert
lifecycle). Two small fixes (uz status typo, money formatter). The History tab is a **BE feature-gap** (deferred).

## A. Structural / field deltas

| # | Element | expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| H-OR2 | uz status label `converted` | «Aylantirildi» (matches «Qabul qilindi»/«Rad etildi») | `"converted": "Aylantirild"` (truncated, missing -i) | delta | low | **FIXED** → `uz.json` «Aylantirildi». |
| H-OR3 | sum display | minor-unit BigInt → `formatMoney` (moysklad «64 000,00» format) | local `formatSum` used `Number(sumMinor)/100` + `toLocaleString('uz-UZ')` (float + wrong separators) | delta | low | **FIXED** → shared `formatMoney(data.sumMinor, data.currency)`; deleted the local helper. |

## B. Interactive deltas

| # | Element | expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| H-OR1 | History/Tarix tab | populated change history | `auditEntity="online_order"` (snake_case) AND `online-order.service` writes **zero** auditLog → History permanently empty | delta | med | **DEFERRED (BE feature-gap)** — like cohort-D money-docs / variants: the service writes no audit on accept/reject/convert. The FE slug is also non-conventional, but fixing it without a BE write is guessing → left as-is. Needs: thread `userId` + `auditLog.create` in the service (then align the slug). |

## Confirmed mirrors (correct imported-order specifics — NOT deltas)

- No manual create form, editable PositionEditor, clone, print, or posting-FSM — correct for an imported order
  (the service exposes only list/accept/reject/convertToCustomerOrder). Counterparty meta is display-only.

## Deferred (Phase-2 / BE)

- 🟡 **H-OR1** online-order History — BE audit-write feature (no auditLog on the service). Also confirm
  `convertToCustomerOrder` is no longer a stub before relying on that button.

**Gates:** web tc 0 · biome 0 (one scoped `noArrayIndexKey` ignore on the static items list) · web Vitest no-regress ·
i18n key-existence ru+uz + no-hardcoded (route registered). **HONEST: Phase-1 — NOT browser-smoked.**
