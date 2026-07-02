# users — LIST parity audit (Cohort L12 · Settings-org)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_9bba0f00-850`) — diff + critic both flagged the column mislabel; Opus ground-truthed against `settings/users/[id]` + the i18n catalog.
**Ground-truth (§4):** NO moysklad capture for the settings users-admin list (the `00-module/employee` PNG is the HR «Сотрудники» list, a different entity). Sibling-parity only; the correct label was the already-existing `pages.user_admin.col_position`=«Должность».
**Scope note:** `settings/users` is a documented **V1 read-only stub** — there is no `GET /admin/employees` endpoint, so the page only shows the current user from `/auth/me`. Full employee list/search is a backend feature (Track 3 BE-backlog).

## A. Structural / columns + i18n — 🔴 FIX (job-title column mislabelled «Статус»)
- **Bug:** the `position` column (renders `row.position` = job title) used `header: tFields('state')` = «Статус», duplicating the separate `archived` column (`t('col_state')`=«Статус») — two «Статус» headers, the job title hidden under the wrong one.
- **Fix:** `header: t('col_position')` (the dedicated `pages.user_admin.col_position`=«Должность»/«Lavozim» key already existed, unused). 0 new keys. Removed the now-unused `tFields` translator.
- **Date:** `lastLoginAt` rendered via raw `new Date(x).toLocaleString()` (no locale/TZ/NaN-guard) → shared `formatDate` (cohort date bug-class).

## B. Interactive chrome — 🔴 FIX (inert search box removed)
- **Bug:** `search=""` + `onSearchChange={() => undefined}` + a real `searchPlaceholder` rendered a dead search box (`ListView.tsx:440` renders the box whenever `onSearchChange` is truthy). Unlike task-types, the backend genuinely **cannot** support search here (no employee-list endpoint), and the page shows a single self-row — so the box is inherently meaningless.
- **Fix:** removed the 3 inert search props (the box no longer renders). Inert pagination props left harmless (`hasNext={false}` on a 1-row stub). The `read_only_notice` subtitle already explains the stub state.

## DEFER / Phase-2
- Full users admin list + search = backend feature gap (`GET /admin/employees` + roles endpoints) — Track 3 BE-backlog, NOT a list-axis fix.
- Browser-smoke: confirm the «Должность» header + formatted last-login (runtime-unverified).

## Gates
typecheck 0 (web+api) · biome 0 · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding 106 · web Vitest 1374 (+13, 0 regress) · api Vitest 2607 (+2, 0 regress).
