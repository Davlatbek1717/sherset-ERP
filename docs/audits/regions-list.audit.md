# regions — LIST parity audit (Cohort L12 · Settings-org)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_9bba0f00-850`) — diff flagged the search-scope honesty gap (MED, L11-tax-rates class inverted). Opus verified the model.
**Ground-truth (§4):** NO moysklad capture. `settings/regions` = «Регионы» (the 14 seeded Uzbekistan regions, e.g. UZ-TA). The `code` column is a meaningful search target. Sibling = custom-entities. **No label churn** (no capture).
**DEDUP:** detail-audited in cohort L. This pass = LIST axis.

## A. Structural / columns + i18n — CLEAN
- Columns name(link)/code/externalCode(per the schema) with i18n-keyed headers (`pages.region_admin`); no hardcoded leak. Default sort `name` asc.

## B. Interactive chrome — 🔴 FIX (search placeholder vs BE scope, honesty)
- **Bug:** the search box placeholder promises «По названию или коду» / «Nom yoki kod bo'yicha», and the FE threads `search` correctly, BUT `RegionService.list()` built the where clause from `name` only — so typing a code (e.g. «UZ-TA») silently returned nothing.
- **Fix (extend BE, no label churn — §4-safe since there is no capture):** `where.OR = [{ name: { contains, mode:'insensitive' } }, { code: { contains, mode:'insensitive' } }]`, mirroring the country list. The placeholder is now honest.
- **Test:** `region.schema.test.ts` +1 source-scan REGRESSION-LOCK (`list()` must OR over name AND code).

## DEFER / Phase-2
- Pagination: BE `take:200`, FE `hasNext={false}` — 14 seeded regions (low-cardinality) → DEFER class.
- Browser-smoke: type a region code → list filters (runtime-unverified).

## Gates
typecheck 0 (web+api) · biome 0 · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding 106 · web Vitest 1374 (+13, 0 regress) · api Vitest 2607 (+2, 0 regress).
