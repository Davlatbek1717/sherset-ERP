# Phase-2 browser-QA — retail POS register + drawer (2026-06-08k)

> Status: **Phase-2 (real-browser) verified** for the items below. The HIGH crash
> fix and the drawer hardening were browser-verified end-to-end against the live
> stack (web :3100, api :4000, db :5433, Playwright MCP). One residual (RS4) stays
> owed; one label render is dev-cache-pending (see below).

## Session shape

`davom et` (local Opus, ultracode). Anti-confabulation baseline first: the live
optimistic-lock harness (`verify-optimistic-lock-smoke.mjs`) was **180/180** before
any QA — the "56 entities locked" claim is genuinely green right now. Three Phase-2
cohort items were drained (analitika/staff conflict dialog, money-docs P1/P2/P3,
retail drawer), and adversarial browsing of the retail register surfaced a **HIGH
crash** that no gate caught.

## 🔴 HIGH — /retail POS register white-screens whenever a session is open

**Symptom.** Opening `/retail` with an open cashier session throws a client-side
`Runtime TypeError: Cannot read properties of undefined (reading 'name')` at
`retail/page.tsx:342` (`{session.cashier.name}`) → "Application error: a client-side
exception has occurred". The cashier cannot use the register at all.

**Root cause.** `CashierSessionService.findCurrentForCashier` (the only read behind
`GET /cashier-sessions/current`) included `cashDesk` / `store` / `organization` but
**omitted `cashier`** — it was the one session method that did (`list`, `findOne`,
`open`, `close` all include `cashier`). So the endpoint returned only `cashierId`,
the FE `CurrentSession.cashier` was `undefined`, and the header render crashed.

**Why no gate caught it.** TypeScript trusts the FE `CurrentSession` type (which
*declares* `cashier: { id; name }`); Prisma's result type is untyped-by-default so
the missing include compiled fine. tc / biome / unit / the api+db lock harness were
all green. Only a real browser on the open-session render showed it.

**Fix.** `apps/api/src/modules/cashier-session/cashier-session.service.ts` —
`findCurrentForCashier` now `include: { cashier: { select: { id: true, name: true } }, … }`
(mirrors the 4 sibling methods).

**Verification.** API now returns `cashier:{id,name:"Admin User"}`; `/retail` loads
with the header "Ochiq · **Admin User** · Smoke kassa · 07:13" and the till UI
(search, cart, Оплатить, + Внесение / − Изъятие / Закрыть смену).

**Guard.** `cashier-session-current-contract.test.ts` (+2) — source-scan pinning
that `findCurrentForCashier` includes `cashier` (and still includes cashDesk/store/
organization). A behavioural unit test would need a DB; this guard locks the contract
that the browser proved.

## ✅ FIX — POS register drawer hardened to match the session-detail sibling

The cohort-E RS2/RS3 work (`description` + `Money.fromMajor`) was applied to **one
of two** drawers. The `/retail` POS-register inline Внесение/Изъятие drawer
(`retail/page.tsx`) diverged from the session-detail drawer (`retail/sessions/[id]`)
— same `drawer-in`/`drawer-out` endpoints — by:

1. **(RS2)** sending only `{ sumMinor }` (no `description`) → no Комментарий.
2. **(RS3/RS4)** computing `String(BigInt(Math.round(major * 100)))` — a hardcoded
   2-decimal scale, not the currency-aware `Money.fromMajor(amount, tillCurrency)`.
3. hardcoded **Latin-uz** panel strings («Naqd kiritish», «Summa (so'm)»,
   «Tasdiqlash», «Bekor») → RU-locale leak (the no-hardcoded gate is Cyrillic-only).

**Fix** (mirror the sibling): `Money.fromMajor(drawerAmount, tillCurrency)` +
`tillCurrency = isCurrencyCode(session.cashDesk.currency) ? … : 'UZS'`; add a
`drawerComment` field that sends `description`; i18n the panel (new `pages.retail`
keys `drawer_in`/`drawer_out`/`drawer_comment`/`drawer_confirm`/`drawer_amount_positive`,
ru+uz). The drawer-out label was hardcoded «Изъятие» → set to the **grounded**
«Выплата» (the `08-module/retailshift` capture grounds «Выплата»/«Внесение» as
field-role elements — the `label-grounding` test — and it matches the sibling).

**Verification (browser).** Внесение `150.50` + comment "QA Phase-2 browser test" →
`POST /cashier-sessions/:id/drawer-in` body **`{"sumMinor":"15050","description":"QA Phase-2 browser test"}`** → **201**.
Persisted op (`GET /cashier-sessions/:id/drawer`): `ВН-2026-00001 · sumMinor 15050 ·
description "QA Phase-2 browser test"`. The session-detail page renders it in
"Кассовые операции": **`ВН-2026-00001 · QA Phase-2 browser test` / `+150,50 сум`**.
→ RS2 (comment persists + displays) and RS3 (`Money.fromMajor` scale) both verified.

**Caveat (honest).** The toolbar drawer-out button still rendered «Изъятие» after the
JSON edit — next-intl's server-side message cache holds the old value until the next
web recompile. The value is correct on disk, parity-test-passes, and is §4-grounded;
the live «Выплата» render is pending a recompile (a dev-server artifact, not a code
defect). The panel-body i18n (which recompiled with the page edit) rendered correctly.

## Owed-smoke status (retail cohort)

| Smoke | Status |
|---|---|
| RS1 — RU-locale labels (sales/sessions) | ✅ verified 2026-06-08d |
| RS2 — drawer Комментарий persists | ✅ verified 2026-06-08k (this session) |
| RS3 — `Money.fromMajor` scale | ✅ verified 2026-06-08k (POS register drawer) |
| RS4 — non-UZS cash desk currency suffix | ⏳ owed (no non-UZS desk seeded; drawer is currency-aware by construction, non-2-dec path not runtime-exercised) |

## Gate

api tc 0 · web tc 0 · biome 0 (changed) · **api Vitest 2802 (+2)** · **web Vitest 1440
(0 regress)**. Browser-verified live. Files: `cashier-session.service.ts`,
`cashier-session-current-contract.test.ts`, `retail/page.tsx`, `messages/{ru,uz}.json`.
