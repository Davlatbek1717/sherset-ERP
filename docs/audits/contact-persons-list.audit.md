# contact-persons — LIST parity audit (Cohort L7 · CRM)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_e11d6251-8c3`, 25 agents, 15 confirmed).
**Ground-truth (§4):** moysklad has **NO standalone contact-person list** (`#contactperson` → sector onboarding splash; contact persons live as a sub-tab inside the Контрагент card — `docs/moysklad-reference/contact-persons/FINDING.md`). So the simpler toolbar (moyskladToolbar + Фильтр + bulk delete/archive, NO import/print/CSV dropdown) is the **deliberate** parity decision, NOT a feature gap. Reference = counterparties chrome only.

## A. Structural / columns + empty-state — FIXED (low) + confirmed mirrors
- **Empty-state:** `pages.contact_persons.empty_rich_*` keys existed with no `richEmpty` prop → wired `richEmpty={{ heading, cta:{label:create_button, href:'/contact-persons/new'} }}`. Descriptive `empty_rich_helper` left for future (ListView helper slot is link-only; no natural secondary link here).
- Confirmed mirrors: column set (name · position · counterparty[«Контрагент» via `tFields('agent')`] · phone · email · state) legitimate. No money column. No import/print/CSV — INTENTIONAL (no standalone moysklad list; counterparties' richer toolbar is NOT a parity baseline here). `LIMIT=25` kept (no moysklad page-size grounding).

## B. Interactive / toolbar chrome — FIXED (low-medium cohort drift)
- Added `onRefresh={() => refetch()}`, `selectionCount={bulk.selectedIds.size}` (bulk wired via `useBulkDocumentActions`), `createPosition="start"` — present only on counterparties across the cohort; the title-bar refresh / selection-counter / create-button position are the dominant convention (even minimal config lists wire onRefresh). The FINDING.md exemptions (no import/print) concern catalog affordances, NOT these toolbar controls.
- Confirmed-correct: filter panel (counterparty/owner/archived), click-to-sort, bulk delete/archive.

## DEFER / refuted
- Simpler toolbar (no import/print/CSV) NOT flagged (FINDING.md). Pagination liveness not browser-verified — Phase-2.

## Gates
typecheck 0 (web) · biome 0 (changed) · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding ✓ (L7 chrome + richEmpty lock) · web Vitest 1349 pass/1 skip (0 regress).
