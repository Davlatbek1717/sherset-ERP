# organizations — LIST parity audit (Cohort L12 · Settings-org)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_9bba0f00-850`) — diff flagged the INN search-scope honesty gap (MED). Opus verified the field storage.
**Ground-truth (§4):** capture CONTAMINATED (`00-module/organization` body = «Заказы покупателей»). Sibling-parity only; **no label churn**.
**DEDUP:** detail-audited in cohort L. This pass = LIST axis.

## A. Structural / columns + i18n — CLEAN
- i18n-keyed headers (`pages.organizations`); real cursor pagination (`hasNext={!!data?.nextCursor}` + `count`); no money column (correct for a settings catalog). Row → `/settings/organizations/[id]`.

## B. Interactive chrome — 🔴 FIX (search placeholder vs BE scope, honesty)
- **Bug:** the placeholder promises «Название или ИНН» / «Nom yoki STIR», and the FE threads `search`, BUT `OrganizationService.list()` ORed `name` + `legalTitle` only — typing an INN returned nothing.
- **Storage detail:** INN lives in the `uzRequisites` JSON column (`{ inn: "STIR", ... }`), not a scalar field.
- **Fix (extend BE, no label churn — §4-safe since capture is contaminated):** added `{ uzRequisites: { path: ['inn'], string_contains: filter.search } }` to the search OR (Prisma JSON-path filter; INN is digits so case is moot). moysklad's org list searches by INN — now honest + parity-matching.
- **Test:** `organization.schema.test.ts` +1 source-scan REGRESSION-LOCK (search OR must include the uzRequisites.inn JSON path).

## DEFER / Phase-2
- Browser-smoke: type an organization INN → list filters (runtime-unverified); confirm JSON-path filter performance on a real dataset.

## Gates
typecheck 0 (web+api) · biome 0 · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding 106 · web Vitest 1374 (+13, 0 regress) · api Vitest 2607 (+2, 0 regress).
