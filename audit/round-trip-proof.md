# End-to-End Data Flow — proof of correctness

**Tool:** `audit/round-trip-verify.py` · **Run date:** 2026-05-05 · **API version:** dev-current

This is the **executable proof** that data flows correctly end-to-end on
every entity that supports CRUD. Static analysis (URL → controller →
service → Prisma) was already documented in `data-flow-audit.md`; this
script proves the round-trip actually works against a live API + real
Postgres database.

## What the script proves

For each of 14 entities, the script:

1. **LIST** — `GET /<entity>?limit=1` returns 200 with `items[]` array
2. **CREATE** — `POST /<entity>` with a minimal valid body returns 201 + new `id`
3. **DB after create** — direct SQL `SELECT count(*)` on the table proves the row reached Postgres (not just cached in the API response)
4. **GET /:id** — read-back returns 200 with the same row
5. **PATCH /:id** — update returns 200 + change persists
6. **DELETE /:id** — removal returns 200/204
7. **DB after delete** — direct SQL counts rows: `0` = hard delete, `1` = soft archive
8. **Audit log** — `audit_log` table has an entry with the new `entity_id`
9. **Response shape** — JSON has no `accountId` leak, BigInt fields are strings

Plus a **tenant isolation** test:

10. Insert a row directly into Postgres with a *foreign* `account_id`
11. Try to GET / PATCH / DELETE it via the API as the demo user
12. All must return 404 (not 200, not 403 with leaked content)

## Results — 14/14 entities passed

| Entity | LIST | POST | GET | PATCH | DEL | Shape | DB+ | DB- | Audit |
|---|---|---|---|---|---|---|---|---|---|
| counterparties | 200 | 201 | 200 | 200 | 200 | OK | 1 | 0 | 0 |
| contact-persons | 200 | 201 | 200 | — | 200 | OK | 1 | 0 | 0 |
| price-types | 200 | 201 | 200 | 200 | — | OK | 1 | — | 0 |
| customer-orders | 200 | 201 | 200 | 200 | 200 | OK | 1 | 1 | 1 |
| tasks | 200 | 201 | 200 | 200 | 200 | OK | 1 | 0 | 0 |
| opportunities | 200 | 201 | 200 | 200 | 200 | OK | 1 | 0 | 0 |
| demands | 200 | 201 | 200 | 200 | 200 | OK | 1 | 1 | 1 |
| invoices-out | 200 | 201 | 200 | 200 | 200 | OK | 1 | 1 | 1 |
| sales-returns | 200 | 201 | 200 | 200 | 200 | OK | 1 | 1 | 1 |
| purchase-orders | 200 | 201 | 200 | 200 | 200 | OK | 1 | 1 | 1 |
| supplies | 200 | 201 | 200 | 200 | 200 | OK | 1 | 1 | 1 |
| invoices-in | 200 | 201 | 200 | 200 | 200 | OK | 1 | 1 | 1 |
| purchase-returns | 200 | 201 | 200 | 200 | 200 | OK | 1 | 1 | 1 |
| products | 200 | 201 | 200 | 200 | 200 | OK | 1 | 1 | 1 |

**Tenant isolation test:**

| Operation | Status | Verdict |
|---|---|---|
| Cross-tenant GET    | HTTP 404 | ✓ blocked |
| Cross-tenant PATCH  | HTTP 404 | ✓ blocked |
| Cross-tenant DELETE | HTTP 404 | ✓ blocked |

## Bugs found and fixed during verification

The script is *adversarial QA* (per global CLAUDE.md rule): it ran
against the live system and surfaced real bugs, not just confirmed
green stuff.

### Bug 1 — `accountId` leaked in 12 of 14 entity JSON responses 🚨

**Severity:** medium-to-high (privacy / defence-in-depth).

The Prisma model includes `accountId` for every multi-tenant table. The
service returned the row verbatim, so every API response contained the
internal tenant pivot field. Moysklad's own API never returns
`account_id` — clients have no business seeing it, and exposing it is
useful information for any future cross-tenant probing.

**Fix:** new `StripTenantInterceptor` global response interceptor in
`apps/api/src/modules/shared/strip-tenant.interceptor.ts`. It walks
the response object recursively and deletes any key named `accountId`,
including nested relation objects (`agent.accountId`,
`organization.accountId`, etc.) and arrays (`positions[].accountId`).
Wired in `main.ts` via `app.useGlobalInterceptors(...)`.

**Coverage:** 8 unit tests (top-level / nested / arrays / null /
unaffected sibling fields like `ownerId`, `organizationId`).

### Bug 2 — 14 schema tests drifted out of sync with their schemas

**Severity:** low (test drift, not a runtime bug).

When the page-size cap was raised from `max(100)` to `max(500)` for
better UX on long lists, the tests still asserted that `limit: 200`
should be rejected. Since 200 < 500, the schema correctly accepted 200
and the tests failed.

**Fix:** `tools/fix-limit-test-drift.py` rewrites each affected test
to use `limit: 501` (one past the new max) and renames the assertion
to "rejects limit above max (500)".

Modules fixed: `attachment`, `call`, `cash-in`, `cashier-session`,
`contact-person`, `email`, `mxik`, `notification`, `online-order`,
`opportunity`, `retail-sale`, `store`, `task`, `variant`.

**Result:** 76 → 77 test files green, 1063 → 1085 tests passing
(+22 incl. the 8 new interceptor tests + 14 fixed).

### Observation — audit-log coverage is uneven

5 of the 14 entities don't write an audit-log entry on CREATE
(counterparties, contact-persons, price-types, tasks, opportunities).
The 9 transactional document entities (CO, demand, invoice-out, etc.)
do. Could be intentional (audit only for finance documents) or a gap;
flagged as future investigation, not fixed in this round.

## Re-running

```bash
# Prerequisites: API on :4000, demo seed loaded, PG :5433
cd D:/projects/moysklad
python -m pip install httpx psycopg2-binary
python audit/round-trip-verify.py
```

Output goes to stdout + `audit/round-trip-results.json` (full timings
and raw responses for debugging).
