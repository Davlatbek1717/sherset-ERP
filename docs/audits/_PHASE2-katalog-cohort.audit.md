# Phase-2 QA — Cohort B (Katalog): counterparties · products · projects · stores · uoms (2026-06-10)

**Method:** A-battery (API-adversarial, parallel agent-per-page, Opus) + B-battery (browser/visual).
Operator trust-but-verify on every claim.

**Status: Phase-2 VERIFIED.** All five pages came back **structurally + runtime clean** on the full
battery (A3 rendered-field/include presence, A4 08e-null clearing, archive/restore, audit-label
dictionary resolution, optimistic-lock 409 + Class-A rollback, money BigInt-string safety). **No
HIGH/MEDIUM bugs.** Two LOW residuals on products are documented (not fixed — see below).

---

## counterparties — phone-clear fix confirmed end-to-end (the session's committed fix)

The uncommitted phone-clear fix adopted this session (`f9ba78e1`: the `phone` Zod transform returns
`null` not `undefined`, so the `update()` guard `if (parsed.phone !== undefined)` actually clears the
column) was verified at **three levels**:
- **schema unit** — `counterparty.schema.test.ts` 20/20 (null + whitespace → null; a real number still
  normalises).
- **live API** (A-battery agent) — PATCH `{phone:null}` → GET `phone===null`; PATCH `{phone:'   '}` →
  null; PATCH a real number → normalised `+998…`.
- **🔬 real browser, end-to-end** (operator, Playwright MCP) — cleared the phone field on the actual
  edit form, clicked the real «Saqlash» button, then GET via API → **`phone === null`** (version
  10→11). Proves the full chain: FE form → save handler sends `null` → schema transform → update()
  guard → column cleared.

Also clean on counterparties: the 08e null-class (all 11 `.nullish()` optionals nulled in one PATCH →
all cleared), companyType enum change, archive↔restore flag, and the create/update/archived/restored
audit feed (all action strings dictionary-resolvable, no raw-slug). Bank-account History feed not
re-done (verified 2026-06-08n).

## products — clean edit-flow (re-confirmed), 2 LOW residuals documented

Edit flow was already fully browser-verified in 06e (`c67c78e8`). This pass re-confirmed: GET detail
covers every rendered field incl. the `productFolder`/`owner` includes (no POS-crash-class dropped
include); a fresh ZZ-QA product PATCH with empty optionals null → 200 + nulls cleared (08e guard
holds); the History-after-save UPDATE row exists with BigInt-safe money diff (`buyPrice
{after:'99999',before:'12345'}`). LOW residuals (NOT fixed):
- **stale JSDoc** — page header says "Save calls PUT /products/:id"; the code is `api.patch` /
  `@Patch(':id')`. Comment-only, zero runtime impact. **Deferred to a doc-comment sweep** — a
  standalone fix dragged in an unrelated pre-existing biome `useTemplate` lint on a decimal-helper
  line in the same file (and its `/new` sibling), so a surgical revert kept this QA commit clean.
- **`product.repository.ts` update() returns no relation includes** (unlike findById) — the PATCH
  response is shape-incomplete vs the `ProductDetail` type, but **not user-visible on this page**
  (onSuccess invalidates + refetches via findById). Pattern note for the include-class, not a bug.

## projects · stores · uoms — settings-light, clean

Full battery passed. FSM N/A (archive/restore boolean flips only, code-verified). 08e null-clearing
works (code/description/address/externalCode round-trip + clear). Optimistic-lock 409 + no-leak on
all three. Adversarial extras held: stores self-parent-cycle guard + duplicate-code 409 + DELETE of
an unreferenced own store → 200 (no false 409); uoms duplicate-code 409 on create AND edit, multiple
null-code rows allowed (Postgres NULL-distinct), oversize/empty-name 400s, cross-id GET → 404.

**Parity note (deferred, grounding-gated):** these settings-light pages have **no History tab** — a
consistent sibling-parity choice across all settings catalog detail pages (verified by grep: only the
global `settings/audit-log` page has one). Whether MoySklad shows a per-record «История» for
Проекты/Склады/Ед.изм. is a reference-capture question, not an auto-bug. `projects` also omits an
`externalCode` input that the entity/schema support (round-trips via API, safe — service leaves it
untouched when the FE doesn't send it); possible minor field-omission parity gap, capture-gated.

---

## B-battery (browser, Playwright MCP — live :3100)

- **counterparties detail** renders cleanly (no error boundary); phone-clear exercised end-to-end
  (above).
- (Other catalog pages share the verified detail-form layout; their data contracts were
  API-verified by the A-battery. MCP hard-nav `/auth/refresh` 401 bounce is a known artifact, not a
  bug — see NEXT.md.)

## Hygiene

All ZZ-QA records (this session's leftovers + prior-session orphans across all five entities) swept;
see the Stock+internal cohort audit for the combined sweep report (18 deleted, balances clean).

## Gate

api typecheck 0 · web typecheck 0 · biome 0 · api Vitest 2818 (counterparty schema 20/20 within) ·
web Vitest untouched (no web code changed — products JSDoc reverted).
