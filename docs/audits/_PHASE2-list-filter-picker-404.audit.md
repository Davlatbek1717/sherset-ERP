# Phase-2 flagship — list-page filter pickers called dead endpoints (63 silent 404s)

**Session:** 2026-06-06 (`davom et`, local Opus, ultracode). **Status:** runtime-verified (browser).

## Bug-class

The FE api-client sends string paths (`api.get('/users')`); the NestJS backend declares routes
with method decorators (`@Get(':id')`). **There is no type-level link between the two**, so a
path/method mismatch is invisible to typecheck, lint and every unit test — it only 404/405s at
runtime, which the Phase-1 structural audit conveyor never exercised. Two prior browser-QA
sessions found one instance each (api.delete Content-Type → 400; `api.put('/products/:id')` →
@Patch-only → silent 404). This session generalised the class with a deterministic FE↔BE
contract matcher (446 FE write-calls × 961 BE routes) and found a **third, larger class**.

## Finding — list-page filter pickers (detail forms were already correct)

The document **detail forms** use the working reference endpoints. The corresponding **list-page
extended-filter pickers** were written against never-implemented paths and never browser-tested,
so each 404s and leaves the filter picker silently empty in the browser:

| Picker (list filter) | Dead path (live 404) | Correct endpoint | Sites |
|---|---|---|---|
| Owner / responsible employee | `GET /users?search=` | `GET /employees?search=` (`@Get('employees')`, reference.controller, `{items:[{id,name}]}`) | **49** / 29 files |
| Organization account | `GET /organizations/:id/accounts` | `GET /organization-accounts?organizationId=` | **7** |
| Counterparty (agent) account | `GET /counterparties/:id/accounts` | `GET /counterparties/:id/bank-accounts` (raw array, client-filter) | **7** |

Total: **63 silent-404 call-sites.** The BE filter params (`ownerId`, `organizationAccountId`,
`agentAccountId`) are already wired into every list service's Prisma `where` — so the filters work
end-to-end the moment the picker returns real ids; only the picker fetch was dead.

### Shape-aware notes (not pure path swaps)

- **Owner** — pure path swap; `/employees` returns the same `{items:[{id,name}]}` shape.
- **Org-account** — also realign the mapping to the canonical detail fetcher: default accounts have
  `accountNumber=null`, so map `primary: accountNumber || name` (else a blank/null row — the exact
  `1f5bb451` class). Add `name` to the response type; params build organizationId + search + limit.
- **Agent-account** — `/bank-accounts` returns a **raw array** (no `{items}`, no `search` param) →
  client-filter by accountNumber/bankName, mirroring `customer-orders/[id]` `agentAccountFetcher`.

## Long-tail (matcher candidates) — all NOISE

7 other flagged candidates (cashier-session `/${id}/${action}`, analitika counts, customer-order
`aggregate/totals`, opportunities `board`, hr-attendance, hr moysklad-agents, generic bulk hook)
were adversarially verified (read both sides + live curl) as matcher artifacts — the routes exist;
404s seen were *service* NotFound for fake ids (distinguished from routing-404 by response body).

## Permanent guard

`apps/web/src/__tests__/api-contract.test.ts` cross-references every statically-resolvable FE
`api.*` call against the controller route table and fails on any METHOD_MISMATCH / NO_ROUTE.
Supersedes the narrow `catalog-api-method.test.ts` (4 pages). Irreducibly-dynamic calls (complex
template paths, generic `/${entity}/bulk-*`) are skipped; the two live-verified id/action routes
are explicitly allow-listed. Proven non-vacuous (a probe dead-route makes it fail with a precise
site message).

## Browser verification (live: web 3100 · api 4000 · db 5433)

- **Before** (owner): customer-orders → open "Egasi-xodim" filter → network `GET /users?search= → 404`,
  console `Error: Cannot GET /api/v1/users... at CatalogPicker.useEffect` → empty picker.
- **After** (owner): `GET /employees?search= → 200`, picker lists "Admin User", "first".
- **After** (org-account): select org → open "Tashkilot hisobi" →
  `GET /organization-accounts?search=&limit=50&organizationId=… → 200`, picker shows **"Asosiy
  hisob"** (the `accountNumber=null` default → name fallback working), and `organizationId` is
  applied to the list query (`GET /customer-orders?…&organizationId=… → 200`).
- **Agent-account**: endpoint live 200 (seed has no counterparty bank accounts → empty, no error).

## Gates

typecheck 0 (web) · biome 0 · web Vitest **1400** (+1 guard, 0 regress). No BE files changed.
2 of 3 classes browser-verified live (56/63 sites); agent-account endpoint-verified.
