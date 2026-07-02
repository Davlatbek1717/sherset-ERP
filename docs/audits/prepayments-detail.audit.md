# prepayments/[id] — detail page parity audit

- **Module:** `prepayments` (Предоплата — advance received from a customer) detail page
  (`apps/web/src/app/(app)/prepayments/[id]/page.tsx`)
- **Date:** 2026-06-03 (session 2026-06-03g — Cohort D: Money / returns)
- **Protocol:** Cohort batch audit (`scripts/wf-cohort-detail-audit.js`, run `wf_b388323a-101`, 12-agent:
  premise → per-page diff + completeness critic → blind refute-default verify). **Premise AUTO-CORRECTED the brief's
  reference** (my brief framed prepayments as a `payments-in` twin with an order/invoice allocation grid — FALSE for
  this repo; the page's own header comment says it *"Mirrors counterparty-adjustments/[id] minus direction, plus
  customerOrderId + retail split"* on the **cash-order / retail-split lineage**, NOT payments-in). **Operator (Opus)
  re-verified every confirmed delta against code + backend (zod schema strictness, service truthiness guards, Prisma
  column nullability) before applying.**
- **Reference:** `counterparty-adjustments/[id]` (true structural sibling — same adjustment base, locking, FSM,
  counterparty-balance invalidation) + `cash-in/[id]` for the retail cash/noCash/qr split origin. `payments-in/[id]`
  demoted to **feature-source only** (its single incoming-account + allocation grid would manufacture false
  "missing allocation / missing account" deltas — prepayments uses a retail-method split, not an order allocation).

## Verdict

prepayments is a correct cash-order-lineage advance: the retail split (cash/noCash/qr, BigInt), the optional
`customerOrderId`, the post/unpost/cancel FSM, the `−sumMinor` decrease semantics, and the `applicable`-driven lock
are all right. **One real bug: a wholesale (no-split) save silently 400'd because the PATCH sent `null` for the retail
split fields, which the `.strict()` schema rejects — FIXED.** Two cohort-wide items (History tab empty; org-account
picker scope) are documented as deferred.

## A. Structural / field deltas

| # | Element | moysklad/expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| P1 | retail-split save payload `cashSumMinor`/`noCashSumMinor`/`qrSumMinor` (page.tsx:221-223 PATCH) | a non-nullable `BigInt @default(0)` column cleared by sending `'0'` (string) — the schema accepts a `bigintMinor` string, not `null` | sent `form.cash !== '0' ? form.cash : null` → for a wholesale doc all three are `'0'` so the PATCH carried `cashSumMinor: null, …` → `UpdatePrepaymentSchema` (`.strict()`, `bigintMinor.optional()` = string\|undefined) **rejects null → 400 on EVERY wholesale save** (the in-file `customerOrderId` correctly uses `.nullish()`+`!== undefined`; splits did not). The client guard can't block it — `hasSplit` is false so `splitMismatch` is false. | delta | high | **FIXED** → send `form.cashSumMinor \|\| '0'` (+ twins). `'0'` passes the regex and the service truthiness guard persists `BigInt('0')=0n`. FE-only; `/new` already sent `undefined` (correct). |

## B. Interactive deltas

(no page-unique interactive deltas confirmed — the History-tab and org-account-picker items below are cohort-wide and deferred)

## Confirmed mirrors (correct prepayment specifics — NOT deltas)

- **NO order/invoice allocation grid** — prepayments has only the retail-method split (cash/noCash/qr) + one optional
  `customerOrderId`. The brief's "missing allocation table" framing was a premise bias (payments-in carries that, the
  cash-order lineage does not). Correctly absent.
- `−sumMinor` decrease glyph/colour (`text-brand`), retail-split summary card, `customerOrderId` picker gated on the
  chosen agent, `applicable`-driven full-form lock, `auditEntity="Prepayment"` (correct PascalCase — NOT the
  `work_order`-style slug bug-class), doc-date `moment` sent on `/new` (already correct). All correct.

## Deferred (documented for Phase-2 / backend backlog)

- 🟡 **History (Tarix) tab permanently empty — cohort-wide (prepayments · prepayment-returns · counterparty-adjustments).**
  All three render the History tab (`DetailContentTabs auditEntity="Prepayment"/…`) which fetches
  `/audit-logs?entity=<PascalCase>` (exact-match), but the three services write **zero** `auditLog.create` rows on
  create/update/post/unpost/cancel — so the tab is always empty. The structural siblings DO write (cash-in
  `entity:'CashIn'` via `logAudit`, payment-in `entity:'PaymentIn'`), so this is a genuine **money-doc parity gap**,
  not a catalog-style change-history feature. **NOT fixed here** because the fix is a cross-cutting backend feature:
  the three services' `update`/`transition`/`softDelete` signatures take **no `userId`** (only `create`/`clone` do), so
  audit-logging requires threading `userId` through ~9 methods + 3 controllers + a shared `logAudit` helper —
  too broad/risky to bundle into a parity commit. → Phase-2 backend task; mirror `cash-in.service.ts` (`logAudit`
  + `tx.auditLog.create` at create + every FSM transition; money stays `sumMinor.toString()`, never `Number()`).
  Higher priority than catalog change-history because the money-doc siblings already log.
- 🔴 **org-account picker SCOPE bug-class (money-critical) — already in the Phase-2 QA backlog (~13 pages).**
  `organizationAccountFetcher` (page.tsx:281-290) calls `/organization-accounts` **without** an `organizationId`
  filter → can pick another organization's account. The endpoint already accepts the filter
  (`reference.controller.ts`). prepayments is one of the ~13 affected pages; the cohort-wide sweep + capture is
  deferred to Phase-2 (see NEXT.md QA-backlog).

**Gates:** web tc 0 · api tc 0 · biome 0 (changed) · web Vitest 1264 pass/1 skip · api Vitest 2599 pass/2 skip ·
i18n key-existence ru+uz + no-hardcoded (no new keys). **HONEST: Phase-1 — NOT browser-smoked.** P1 is fully
backend-traced (ran the repo's zod to confirm `null` rejection on the strict schema) but a live "edit a wholesale
prepayment → Save succeeds" smoke is Phase-2 QA.
