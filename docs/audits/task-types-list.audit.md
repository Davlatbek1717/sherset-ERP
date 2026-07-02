# task-types — LIST parity audit (Cohort L12 · Settings-org)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_9bba0f00-850`) — diff + critic flagged the dead search box + silent-failure row actions (HIGH/MED). Opus verified the BE supports search.
**Ground-truth (§4):** NO moysklad capture for «Типы задач». Sibling-parity (regions/custom-entities are the WIRED simple-catalog siblings). The search placeholder is a generic settings-list hint (name-only search), not an invented moysklad term.
**DEDUP:** task-types is a self-contained inline-CRUD catalog (no detail page). Full audit on the LIST axis.

## A. Structural / columns + i18n — CLEAN + 1 fix
- Columns name(color-dot link→modal)/color/position/state(badge)/actions; headers via `t()`/`tFields()` — no hardcoded leak. Default sort `position` asc (correct for a hand-ordered lookup).
- **Validation message fix:** `submit()` showed the bare field LABEL `t('name')`=«Название» as the empty-name error → added `task_types.name_required`=«Название обязательно»/«Nomi majburiy».

## B. Interactive chrome — 🔴 FIX (dead search box WIRED + silent-failure)
- **Dead search box (L10-sessions/L11-tax-rates class):** `search=""` + `onSearchChange={() => undefined}` (no `searchPlaceholder`, so the inert box even showed the Latin-uz default `'Qidirish...'`). The BE `TaskTypeService.list()` **already supports** `filter.search` → `{ name: { contains, mode: 'insensitive' } }` (verified at source) — the FE just never threaded it.
  - **Fix (mirrors regions/custom-entities):** `searchInput` state + `useDebounce(300)` + `...(search ? { search } : {})` in params + `search` in queryKey + `onSearchChange={(v) => setSearchInput(v)}` + `searchPlaceholder={t('search_placeholder')}` («По названию...») + search-aware `emptyTitle={search ? tCommon('no_results') : t('empty')}`.
- **Silent failure:** `archiveMut`/`deleteMut` used raw `useMutation` with only `onSuccess` (no `onError`) → a failed archive/delete gave no feedback. Switched both to `useApiMutation` (auto-toasts `common.action_failed`, mirrors webhooks/print-templates). `upsertMut` keeps its modal `onError`.

## DEFER / Phase-2
- Pagination: BE `take:200`, FE `hasNext={false}` — low-cardinality lookup (4 seeded defaults + a few user types) → DEFER class.
- Browser-smoke: type a name fragment → list filters; trigger a failing archive → error toast (runtime-unverified).

## Gates
typecheck 0 (web+api) · biome 0 · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding 106 · web Vitest 1374 (+13, 0 regress) · api Vitest 2607 (+2, 0 regress).
