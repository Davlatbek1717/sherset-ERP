# Sprint 1 — Product Vertical Slice

> ⚠️ **HISTORICAL — SUPERSEDED**
> Sprint 1 yakunlangan 2026-04-19 da. Product vertical slice qurildi va kelgusi
> Sprint 2/3/4 lar ustiga qurildi. Joriy holat uchun: `RESUME.md` →
> `docs/HANDOFF.md` ga qarang.
> Bu hujjat tarixiy yozuv sifatida saqlanadi.

**Started:** 2026-04-19
**Status:** Code written, awaiting install + real DB run

## What was built

### Backend (`apps/api/`)

- NestJS 10 with Fastify adapter
- `/api/v1/health` endpoint
- `/api/v1/products` full CRUD:
  - `GET /products` — list with search, filter, pagination (cursor)
  - `GET /products/:id` — detail with folder + owner relations
  - `POST /products` — create, Zod-validated
  - `PATCH /products/:id` — partial update, tracks field diff
  - `POST /products/:id/archive` — archive toggle
  - `POST /products/:id/restore` — un-archive
  - `DELETE /products/:id` — soft delete
- Business validation:
  - GTIN required if trackingType set (marking rule)
  - VAT sanity (need rate OR useParentVat OR vatEnabled=false)
  - MXIK format (17 digits)
- Audit logging on create/update/archive/delete
- Multi-tenant filter on all queries (accountId)
- Unit tests for service (5 test cases)

### Database (`packages/db/`)

- Prisma schema with 8 tables:
  - Account (tenant root)
  - Employee
  - Organization (with UZ fields: legalTitle, companyType='legalUZ', uzRequisites, director, etc.)
  - Store
  - ProductFolder (hierarchical, self-referencing)
  - Counterparty (with UZ fields)
  - Product (full field set from live API verification)
  - AuditLog (append-only per ADR-0005)
- Money stored as BigInt (tiyin minor units)
- Soft delete on Product (deletedAt)
- Multi-tenant via accountId on every row
- Proper indexes for hot paths (accountId+archived, search)

### Frontend (`apps/web/`)

- Next.js 15 with App Router
- Tailwind + shadcn primitives (Button, Input, Label, Table)
- TanStack Query for data fetching
- react-hook-form + Zod for forms

Pages:
- `/` — landing
- `/products` — **ListView** (Pattern 01): search, active/archive filter, table
- `/products/new` — **EditForm** (Pattern 03): all main fields with validation
- `/products/[id]` — **DetailView** (Pattern 02): 3-section layout, archive/restore/delete actions

All pages use Moysklad-compatible `data-test-id` (E2E parity).

### Testing

- `apps/api/src/modules/product/product.service.test.ts` — 5 unit tests
- `apps/web/tests/e2e/product-crud.spec.ts` — 3 E2E tests:
  - Full CRUD flow (create → archive → restore → delete)
  - Validation errors on empty form
  - Search filter

## How to run

### Prerequisites
- PostgreSQL 14+ running locally
- Node 20+ with pnpm 9+

### Setup
```bash
# Install dependencies
pnpm install

# Copy env
cp packages/db/.env.example packages/db/.env
# Edit packages/db/.env — set DATABASE_URL to your local Postgres

# Run migration + generate Prisma client
pnpm --filter @moysklad/db generate
pnpm --filter @moysklad/db migrate

# Seed dev data
pnpm --filter @moysklad/db seed
```

### Development
```bash
# Terminal 1 — API (port 4000)
pnpm --filter @moysklad/api dev

# Terminal 2 — Web (port 3000)
pnpm --filter @moysklad/web dev
```

Open http://localhost:3000

### Testing
```bash
# API unit tests
pnpm --filter @moysklad/api test

# Web E2E (requires running API + web)
pnpm --filter @moysklad/web test:e2e
```

## File structure

```
apps/
  api/
    src/
      main.ts
      app.module.ts
      health.controller.ts
      prisma/
        prisma.module.ts
        prisma.service.ts
      modules/
        product/
          product.module.ts
          product.controller.ts
          product.service.ts
          product.service.test.ts
          product.repository.ts
          product.schema.ts
  web/
    src/
      app/
        layout.tsx
        page.tsx
        globals.css
        products/
          page.tsx
          new/page.tsx
          [id]/page.tsx
      components/ui/
        button.tsx
        input.tsx
        label.tsx
        table.tsx
      lib/
        utils.ts
        api-client.ts
        query-client.tsx
    tests/e2e/
      product-crud.spec.ts

packages/
  db/
    prisma/
      schema.prisma
      seed.ts
    src/
      client.ts
      index.ts
```

## Next steps

1. **Install deps + first migration** (user runs):
   ```bash
   pnpm install
   # set up Postgres locally
   pnpm --filter @moysklad/db migrate
   ```

2. **Manual smoke test:**
   - Start API + Web
   - Open http://localhost:3000
   - Create a product
   - Archive it
   - Restore it
   - Delete it

3. **Run E2E tests:**
   ```bash
   pnpm --filter @moysklad/web test:e2e
   ```

4. **Sprint 2 planning** (next session):
   - Auth: JWT + user session
   - ProductFolder CRUD (hierarchy UI)
   - Counterparty module
   - CatalogPicker (Pattern 05) for selecting products from orders
   - Real multi-user with permissions

## Known gaps (intentionally deferred)

- Auth (hardcoded DEV_ACCOUNT_ID/DEV_USER_ID in controller) — Sprint 2
- ProductFolder CRUD (only seed creates one) — Sprint 2
- Counterparty module — Sprint 2
- Print templates integration — Sprint 3
- Soliq.uz EHF submission for InvoiceOut — Sprint 3
- Retail POS — Sprint 5

These are all documented in discovery phase. Implementation comes per-Sprint.

## Commit timeline

- `[first]` Sprint 1.0-1.2: Monorepo + Prisma + NestJS Product module
- `[second]` Sprint 1.3-1.7: Next.js + Product pages (List/New/Detail)
- `[third]` Sprint 1.8: E2E test + unit tests
- `[this]` Sprint 1.9: Documentation + review

## Discovery references used

- `docs/moysklad-reference/data-model/entity-schemas/product.json` — 51 fields
- `docs/moysklad-reference/patterns/01-list-view.md`
- `docs/moysklad-reference/patterns/02-detail-view.md`
- `docs/moysklad-reference/patterns/03-edit-form.md`
- `docs/moysklad-reference/business-rules/permissions.md`
- `docs/moysklad-reference/business-rules/audit.md`
- `docs/moysklad-reference/business-rules/vat-cascade.md`
- `docs/moysklad-reference/uz-extensions.md`
- `docs/adr/0001-0006-*.md` — architecture decisions
