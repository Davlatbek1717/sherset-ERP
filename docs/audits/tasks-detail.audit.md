# tasks/[id] — detail page parity audit

- **Module:** `tasks` (Задачи / CRM task — status/assignee/deadline) detail page
  (`apps/web/src/app/(app)/tasks/[id]/page.tsx` + `/new`)
- **Date:** 2026-06-04 (Cohort G — CRM)
- **Protocol:** Cohort batch audit (`wf_85fba5eb-9ba`). Premise: tasks is a CRM task (no money/positions/counterparty
  doc-scaffold); its transition is a status FSM (open→done/cancelled), not a posting FSM. `auditEntity="Task"` already
  correct (fixed in cohort C — not re-flagged). Operator ground-truthed each delta.
- **Reference:** `opportunities/[id]` (CRM sibling) + GOLD capture `11-module/task`.

## Verdict

tasks is a correctly-scoped CRM task (status/priority/assignee/due-date + status-FSM). One real **HIGH data-integrity
bug**: the Edit button created a DUPLICATE task instead of editing — FIXED. Plus Latin-uz leaks on the `/new` (edit)
page — FIXED.

## A. Structural / field deltas

| # | Element | expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| T2 | `/tasks/new` (Edit target) Latin-uz | i18n via t() | `` `${t('fields.title')} majburiy` ``, `titlePrefix="Vazifa"`, `stateLabel="Yangi"`, `customTitle="Yangi vazifa"` | delta | medium | **FIXED** → `tCommon('field_required',{field:t('fields.title')})`, `titlePrefix={t('title')}`, `stateLabel={tCommon('new_state')}` (or status when editing), `customTitle={editId?…:t('new_title')}`. +`common.new_state`. |
| T3 | `auditEntity` | match backend | `"Task"` == `task.service` entity (cohort C) | mirror | — | **CORRECT** — not changed. |
| T4 | header datetime helper | shared `formatDate` (comma-stripped) from `@moysklad/ui` | local `formatDate` using `toLocaleString('ru-RU')` (no comma-strip) | delta | low | **DEFERRED** — display-format nuance; swap to the shared helper in a follow-up (not an i18n leak). |

## B. Interactive deltas

| # | Element | expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| T1 | Edit button | open the task pre-loaded and PATCH `/tasks/:id` on save | `tasks/[id]` Edit routed to `/tasks/new?taskId=…`, but `/tasks/new` read only `assigneeId`, never `taskId` → opened a BLANK form and POSTed → a DUPLICATE task; the original was never updated | delta | high | **FIXED (data-integrity)** → made `/tasks/new` edit-aware: `useQuery` loads the task by `taskId`, seeds the form, and the mutation `PATCH`es `/tasks/:id` when `taskId` is present (route + `UpdateTaskSchema` exist); else POST. |

## Confirmed mirrors (correct task specifics — NOT deltas)

- No money/positions/counterparty doc-scaffold — correct. The status transition (`POST /tasks/:id/transition`) is a CRM
  status FSM, not a doc-posting FSM, and is correctly wired (not a dead button).

## Deferred

- 🟡 **T4** local `formatDate` → shared `@moysklad/ui formatDate` (comma-stripped, matches every other detail page).
  Low, display-only; follow-up.

**Gates:** web tc 0 · biome 0 · web Vitest no-regress · i18n key-existence ru+uz + no-hardcoded (tasks route registered).
**HONEST: Phase-1 — NOT browser-smoked.** Live smokes owed: Edit a task → it loads + PATCHes (no duplicate); RU locale →
new/edit page labels Russian.
