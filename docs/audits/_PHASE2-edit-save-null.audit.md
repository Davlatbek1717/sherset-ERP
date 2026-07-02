# Phase-2 audit — edit-save 400 on a cleared optional field (null bug-class)

**Date:** 2026-06-08 (`davom et`, local Opus, ultracode)
**Status:** ✅ Phase-2 — runtime-verified at the API contract layer (deterministic schema
tests + live api+db PATCH battery). Not a render/pixel browser pass, but this bug lives
entirely in the request→schema contract, so the API-level proof IS the ground truth; one
representative was also browser-verified earlier (catalog F-PUT, 2026-06-06e).

## The bug-class

Detail **edit** forms hand-build their PATCH payload and clear an empty optional field by
sending `null` (e.g. `description: form.description || null`, `priceTypeId: v.priceTypeId
|| null`). The API Update schema is almost always `Create<X>Schema.partial().extend({
version })`. Zod's `.partial()` makes every field `T | undefined` — it does **not** add
`null`. So a Create field declared `z.string().optional()` still **rejects** `null` in the
partial Update schema:

```
"Expected string, received null"  → 400 Bad Request
```

The field is only null-safe if its zod def has `.nullable()`/`.nullish()`. The bug is
**gate-invisible** (typecheck, biome, unit tests all pass) and **silently blocks the
user's Save** — and it bites the *common* case, because most records leave most optional
fields blank. It had already recurred once: customer-orders had `externalCode` fixed to
`.nullish()` in the sales/purchase sweep but the same form's `description` was missed
(`_PHASE2-catalog-cohort.audit.md` first found the class on the catalog `Update*` schemas).

## Method — 53-page sweep

A Workflow fanned out one Opus agent per detail page (`app/(app)/**/[id]/page.tsx` that
calls `api.patch`), each tracing **every field the FE save sends as null** against the
**Update-schema nullability** (and the Prisma column nullability where relevant). 37/53
completed before a session limit froze further fan-out; the remaining 16 were audited
serially in the main loop (grep FE null-sends → cross-check schema/Prisma). **All 53 pages
covered.** Every candidate was ground-truthed by reading the cited file:lines (not trusting
the agent) and live-confirmed against the running API.

## Findings — 13 confirmed bugs across 3 entities (all fixed)

### 1. counterparties — 11 fields 🔴 (severe: broke edit-save for ~every counterparty)
`counterparties/[id]/page.tsx:201-213` sends all of these as `v.X || null` on **every**
save; `CreateCounterpartySchema` had each as bare `.optional()` (Update = `.partial().extend`).
Clearing **any one** → 400, and since most counterparties leave several of these blank, the
edit form was effectively unusable.

| field | was | now |
|---|---|---|
| legalTitle, legalAddress, actualAddress, fax, code, externalCode, discountCardNumber, description | `z.string()…optional()` | `.nullish()` |
| email | `…optional().or(z.literal(''))` | `…nullish().or(z.literal(''))` |
| phone | `z.string().max(40).optional().transform(…)` | `…nullish().transform(…)` (transform already maps null→undefined) |
| priceTypeId | `uuid.optional()` | `uuid.nullish()` (service null→`{ disconnect: true }`) |

All 11 Prisma columns are nullable (`String?` / `priceTypeId String? @onDelete SetNull`);
the service applies each null cleanly. Fix is purely schema-level.
**Live battery:** create → PATCH all-11-null → **200**, GET shows fields persisted null +
priceType disconnected (no silent drop).

### 2. customer-orders — `description` 🔴
`customer-orders/[id]/page.tsx:389` ALWAYS sends `description: form.description || null`.
`description: z.string().optional()` → 400 on an empty-description save. `externalCode`
(line 48) was fixed in the prior sweep; `description` was the missed straggler.
Column `String?`. → `.nullish()`. **Live:** PATCH description:null → **200**.

### 3. tracking-codes — `cis1162` 🔴
`tracking-codes/[id]/page.tsx:67` sends `cis1162: cis1162.trim() || null`.
`cis1162: z.string().max(255).optional()` → 400 when «КИЗ (1162)» is cleared.
Column `cis_1162 String?`. → `.nullish()`. **Live:** PATCH cis1162:null → **200**.

## The other 50 pages — verified SAFE (no change)

- **Already `.nullish()`/`.nullable()`** (prior sweeps): bundles/services/variants (shared
  product schema), cash-in/out, payment-in/out, prepayment(-return), counterparty-adjustment,
  demands, invoices-in/out, supply, purchase-order, sales-return, purchase-return, discounts,
  ecommerce/channels, enters/losses/moves/inventories/internal-orders, opportunities,
  pipelines, contact-persons, products, price-lists, processing(-order)s, production/boms,
  processes, stages, price-types (`externalCode .nullish()`), settings/custom-entities.
- **Update schema re-declares fields `.nullable().optional()`** (settings fix pattern):
  regions, projects, tax-rates, uoms, expense-items, publications, label-templates,
  bank-accounts, cash-desks.
- **`optionalEmpty()` helper = `z.preprocess('' → null, z.string().nullish())`** (accepts
  null): stores, productions, print-templates, organizations (admin).
- **FE sends `|| undefined` (omitted, never null)**: organizations, price-types, payrolls.

## Guards (regression)

- `counterparty.schema.test.ts` — one assertion per cleared field (8 text + priceTypeId +
  email[null/''/valid] + phone) + `name` still rejects null + Create accepts null.
- `customer-order.schema.test.ts` — `description: null` accepted (next to the existing
  externalCode regression test).
- `tracking-code.schema.test.ts` — `cis1162: null` accepted.

## Gates
api `tsc --noEmit` 0 · biome 0 (changed files, `--write` reformatted one long test line) ·
api Vitest no regression (+16 new assertions) · web untouched.

## Residual / not in scope
- The `phone` field on counterparty: clearing it leaves the prior value (transform maps
  empty/null → undefined → service skips it). Pre-existing behavior — not a 400, not a 500;
  a true "clear phone" would need the transform to emit `null`. Noted, not changed.
- Create-path: making these `.nullish()` also lets Create accept explicit null — harmless
  (null === absent for an optional nullable column); matches the customer-order precedent.
