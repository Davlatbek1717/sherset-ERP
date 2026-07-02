# tasks — LIST parity audit (Cohort L7 · CRM)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_e11d6251-8c3`, 25 agents, 15 confirmed).
**Ground-truth (§4):** NO moysklad capture for tasks → SIBLING-PARITY only (opportunities is the closest CRM sibling). The PILL sub-tabs (active/archived · ownership mine/team/all · status) are a tasks-specific UX and were NOT flagged (no moysklad grounding to contradict). `/tasks/page.tsx` is top-level (distinct from `hr/tasks`).

## A. Structural / column format + empty-state — FIXED (low/medium)
- **Date format dedup:** page defined a **local `formatDate`** — misleadingly named, it actually rendered **date-only** (`toLocaleDateString('ru-RU', …)`), a dup of the shared `formatDateOnly`. Deleted; imported shared `formatDate` + `formatDateOnly` (adds the NaN-guard).
- **Two date columns split to match the cohort:** **`dueAt`** (due date) → `formatDateOnly` (date-only, unchanged output) · **`createdAt` «Создано»** → shared `formatDate` (now **date+time**, parity with all 8 sibling lists; was date-only). The createdAt add-time is the deliberate change; dueAt stays date-only.
- **Empty-state:** `pages.tasks.empty_rich_*` keys existed with no `richEmpty` prop → wired `richEmpty={{ heading, cta:{label:create_button, href:'/tasks/new'} }}`. Descriptive `empty_rich_helper` left for future (ListView helper is link-only).
- Money: N/A (no money column).

## B. Interactive / toolbar chrome — FIXED (low-medium cohort drift)
- Added `onRefresh={() => refetch()}`, `selectionCount={bulk.selectedIds.size}` (bulk wired via `useBulkDocumentActions`), `createPosition="start"` — same cohort drift as opportunities (present only on counterparties; dominant across 30-40 pages).
- Confirmed-correct: pill filters (status/ownership/archived) + inline filter panel (period/due/type/assignee/agent/updated), click-to-sort, status/priority badge mapping. `useBulkDocumentActions({hasFSM:false, hasArchive:true})` correct for a non-FSM CRM entity.

## DEFER / refuted
- Pill sub-tabs NOT flagged (no moysklad capture to contradict). Pagination liveness not browser-verified — Phase-2. `LIMIT=25` kept.

## Gates
typecheck 0 (web) · biome 0 (changed) · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding ✓ (L7 date-helper + chrome + richEmpty lock) · web Vitest 1349 pass/1 skip (0 regress).
