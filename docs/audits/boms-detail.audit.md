# boms/[id] — detail page parity audit

- **Module:** `production/boms` (Техкарта / Спецификация / BOM) detail/edit page
  (`apps/web/src/app/(app)/production/boms/[id]/page.tsx`)
- **Date:** 2026-06-03 (session 2026-06-03f — Cohort C: Production-config)
- **Protocol:** Cohort batch audit (`scripts/wf-cohort-detail-audit.js`, run `wf_9c1c1462-736`, 24-agent:
  premise → per-page diff → completeness critic → blind refute-default verify). **Operator (Opus) re-verified every
  confirmed delta against the page code + backend schema/service + i18n (ru+uz) before applying** — no blind apply.
- **Reference:** ⚠️ **NO moysklad gold capture exists for the production module** (verified: `progress.json`
  `moysklad_reference` has zero production modules). Audit is **sibling-parity** vs the two EditForm config twins
  (`production/stages/[id]`, `production/processes/[id]`) for the shared scaffold + **intrinsic completeness-critic**.
  `bundles/[id]` was demoted to feature-source only (it uses DetailHeader/DocumentDetail + a separate
  `PUT /bundles/:id/components` endpoint — a different architecture, not a parity baseline).

## Verdict

boms is a counterparty-less catalog config entity (output product + outputQty + inline components list +
read-only standardCost; EditForm shell with archive/restore + DocumentTabs). The sibling-diff correctly refuted the
config-absence phantoms (no counterparty/org/currency/totals/print/doc-number, no `code`/`shared` field — all
backend-confirmed legitimate). Real findings: **1 data-integrity invariant gap (outputQty/qty `0` accepted) + the
cohort-wide hardcoded-Uzbek i18n leak class — all FIXED this session.**

## A. Structural / field deltas

| # | Element | moysklad/expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| B4 | `outputQty` (+ component `qty`) positivity (page L84/235-243, saveMut L139-146; backend `bom.schema.ts:18-23,36-40`) | a produced-batch / component qty of `0` is semantically invalid; the schema error string already promises "must be a positive decimal" | regex `/^\d+(\.\d{1,6})?$/` **accepts `'0'`**; FE guards component qty>0 (L145) but **never outputQty** → a 0-output BOM saves silently, then fails LATE at work-order completion (`work-order.service.ts:412` divide-by-zero guard throws) | delta | med | **FIXED** → backend `.refine((v) => Number(v) > 0)` on outputQty **and** component qty (closes API-direct callers too); FE adds `if (Number(outputQty) <= 0) throw t('err_qty_positive')` on both `[id]` + `/new`. +2 schema tests (`bom.schema.test.ts`: outputQty `'0'` + qty `'0'`/`'0.000000'` rejected). |

## B. Interactive deltas

All below are the **hardcoded-Uzbek i18n leak bug-class** (`bb604bf8` family) — raw uz literals in `throw new Error(...)`
validators + delete `aria-label`s that render verbatim on the RU locale. Cohort-invisible to a sibling-diff; the critic
surfaced them. boms is the only one of the three config siblings that hardcoded its *list-row* validation. **All FIXED**
on both `[id]` and `/new`.

| # | Element | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|
| B1 | component-loop validators (L144-145) | `'Har komponentda mahsulot tanlang'`, `"Miqdor 0 dan katta bo'lsin"` (raw uz) | delta | med | **FIXED** → `t('err_no_product')` / `t('err_qty_positive')`; added `pages.boms.err_no_product` (ru «Выберите товар в каждом компоненте») + `err_qty_positive` (ru «Количество должно быть больше 0») in ru+uz. |
| B2 | remove-component `aria-label` (L314) | `"Qatorni o'chirish"` (raw uz) | delta | low | **FIXED** → `{tCommon('delete')}` (key already exists). RU screen-reader heard Uzbek. |
| B3 | required-field concat (L141-142) | `` `${tFields('name')} majburiy` `` / `` `${t('output_product')} majburiy` `` (translated label + hardcoded uz suffix → "Название majburiy" on RU) | delta | low | **FIXED** → `tCommon('field_required', { field: … })`; added parameterized `common.field_required` (ru «{field} — обязательное поле» / uz «{field} majburiy») in ru+uz. |

## Confirmed mirrors (correct boms specifics — NOT deltas)

- No agent/org/contract, no currency selector, no totals/VAT sidebar, no print/email/createDoc menu, no doc-number/date
  header — all correct for a catalog config entity (refuted as phantoms via premise bias-immunisation).
- No `code` and no `shared` field — backend `CreateBomSchema` has neither column; boms is legitimately leaner than
  stages/processes. `standardCost` read-only via `formatMoney(standardCostMinor)` — correct (computed, not editable).
- Components saved INLINE in the EditForm submit (not via a separate endpoint like bundles) — different but legitimate.
- `buyPrice` cost-prefill already fixed `066d55fb` (boms was one of the 5). CatalogPicker auto-closes via `onClose`.

## Deferred (documented for follow-up)

- **boms writes NO audit log** (`bom.service.ts` has no `auditLog.create`) → the History/Tarix tab is **vacuously
  empty**. `auditEntity="bom"` is internally harmless (no rows to mismatch). Adding change-history to the 3 config
  services is a **feature** (moysklad does show catalog history) — deferred, not a Phase-1 parity-display bug.

**Gates:** web tc 0 · api tc 0 · biome 0 (changed files) · web Vitest 1262 pass/1 skip · api Vitest 2590 pass/2 skip
(+2 new) · i18n key-existence ru+uz (+3 keys: `common.field_required`, `pages.boms.err_no_product`, `err_qty_positive`)
+ no-hardcoded (route now registry-guarded). **HONEST: Phase-1 — NOT browser-smoked.** The outputQty refine + i18n are
backend/key-grounded; a live "save BOM with outputQty=0 → rejected with localised message" smoke is Phase-2 QA.
