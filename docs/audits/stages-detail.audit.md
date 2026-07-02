# stages/[id] — detail page parity audit

- **Module:** `production/stages` (Этап производства — standalone production stage) detail/edit page
  (`apps/web/src/app/(app)/production/stages/[id]/page.tsx`)
- **Date:** 2026-06-03 (session 2026-06-03f — Cohort C: Production-config)
- **Protocol:** Cohort batch audit (`scripts/wf-cohort-detail-audit.js`, run `wf_9c1c1462-736`, 24-agent:
  premise → diff → completeness critic → blind refute-default verify). **Operator (Opus) re-verified every confirmed
  delta against code + backend (Prisma schema + service serialize) + i18n before applying.**
- **Reference:** ⚠️ **NO moysklad gold capture for the production module.** Sibling-parity vs `production/processes/[id]`
  + `production/boms/[id]` (shared EditForm scaffold) + intrinsic critic.

## Verdict

stages is a config entity: name/code/externalCode/description + cost section (laborCost, materialMarkup%,
standardHourCost, materialStore picker) + performers (allPerformers/distributionRequired/shared + employee picker).
This page had the cohort's most material bugs: **two raw-UUID display bugs on reload** (the loaded materialStore and
the loaded performers rendered their UUIDs instead of names — because the GET shipped only the FK ids), plus the
hardcoded-uz i18n leak class. **All FIXED** (backend include + serialize + FE on the two UUID bugs).

## A. Structural / field deltas

| # | Element | moysklad/expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| S1 | material-store picker on load (page L88/105/270-284; backend `processing-stage.service.ts` findById L50-60 + serialize L195-211) | show the store NAME (like processes prefilling `stageLabel` from the joined relation) | useEffect set `materialStoreId` but **never** `materialStoreLabel` → `CatalogPickerField` value `materialStoreLabel \|\| materialStoreId` rendered the **raw store UUID** until re-picked. Backend findById didn't include the `materialStore` relation. | delta | high | **FIXED** → backend findById **and** create includes `materialStore: { select: { id, name } }`; `serializeDetail` surfaces it; FE adds `materialStore` to `StageDetail`, sets `setMaterialStoreLabel(stage.materialStore?.name ?? '')` on load. |
| S2 | performer chips on load (page L89/106/319-324; backend findById L54 + serialize L209) | show employee NAMES (the picker path already stores `name: item.primary`) | load mapped `performers` (a bare `employeeId[]`) to `{ id, name: id }` → chips rendered **raw employee UUIDs** after reload (only `!allPerformers` stages show this list). Backend serialized `performers` as a bare id array. | delta | high | **FIXED** → backend includes `performers.employee.select.name`; `serializeDetail` returns `performers: [{ id, name }]`; FE `StageDetail.performers: Array<{id,name}>`, load drops the `id→{id,name:id}` map. PATCH path `performers.map(p=>p.id)` unchanged. |

## B. Interactive deltas

Hardcoded-Uzbek i18n leak class (same as boms). **Both FIXED.**

| # | Element | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|
| S3 | performer-remove `aria-label` (L330; /new L235) | `"o'chirish"` (raw uz) | delta | low | **FIXED** → `{tCommon('delete')}`. |
| S4 | required-name concat (L124; /new L77) | `` `${tFields('name')} majburiy` `` | delta | low | **FIXED** → `tCommon('field_required', { field: tFields('name') })`. (/new also gained the missing `tCommon` binding.) |

## Confirmed mirrors (correct stages specifics — NOT deltas)

- Cost section round-trips so'm↔tiyin via `somToTiyin`/`tiyinToSom` (no minor/major coercion bug); `materialMarkup`
  `Math.trunc` matches the backend `z.coerce.number().int()`. All three performer booleans
  (allPerformers/distributionRequired/shared) wired and sent.
- No counterparty/org/currency/totals/print/doc-number — correct config entity.

## Deferred (documented for follow-up)

- **stages writes NO audit log** → History tab vacuously empty; `auditEntity="processingstage"` harmless. Catalog
  change-history = feature, deferred.
- The `(so'm)` suffix on the cost-field labels (`${t('labor_cost')} (so'm)`) is a hardcoded currency-unit string. Not a
  RU-Cyrillic leak and not in the no-hardcoded marker set; low priority — note for a future units-localisation pass.

**Gates:** web tc 0 · api tc 0 · biome 0 (changed) · web Vitest 1262 pass/1 skip · api Vitest 2590 pass/2 skip ·
i18n key-existence ru+uz + no-hardcoded (route now registry-guarded). **HONEST: Phase-1 — NOT browser-smoked.** S1/S2
are backend-grounded (Prisma relations `ProcessingStage.materialStore` @ schema.prisma:3058 + `ProcessingStagePerformer.employee`
@ :3078; both typecheck end-to-end) but the live "open a saved stage with a material store + named performers → names
render" round-trip belongs to Phase-2 QA.
