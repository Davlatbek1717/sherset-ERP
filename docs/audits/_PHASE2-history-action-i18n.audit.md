# Phase-2 audit — History (Tarix) tab action-label i18n leak (app-wide)

**Date:** 2026-06-08l (`davom et`, local Opus, ultracode)
**Status:** ✅ **FIXED + BROWSER-VERIFIED end-to-end** (2 consumers × 2 action types × 2
locales) + exhaustive unit guard. Honest scope: the action-label leak is fully closed; one
**documented residual remains** (the transition diff still shows raw `from: state→state` —
enum-value localization is a separate, larger surface — see below).

## How it was found

Phase-2 browser-QA of the production-config cohort. Opened a completed work-order
(`/production/work-orders/ТЗ-2026-00001`) → **История** tab. The transition rows rendered the
**raw audit slug**:

```
transition:completed  · Admin User · 27.04.2026 07:46
transition:in_progress · Admin User · 27.04.2026 07:46
Создано               · Admin User · 27.04.2026 07:45
```

`Создано` (create) was localized but `transition:completed` / `transition:in_progress` were
raw English-ish slugs shown to a Russian user. Gate-invisible: tc/biome/unit never render the
History tab, and the `i18n-no-hardcoded` gate scans source strings, not runtime audit slugs.

## The bug-class (not just transitions)

Both History consumers — `apps/web/src/components/document-tabs.tsx` and
`apps/web/src/components/document-detail/detail-content-tabs.tsx` (used across **39** detail
pages) — carried an identical copy of:

```ts
translateAction={(a) => {
  const key = a.replace(/\./g, '_');          // <-- only normalises '.'
  return tAudit.has(`action_${key}`) ? tAudit(`action_${key}`) : a;  // <-- else RAW slug
}}
```

The audit-action vocabulary (enumerated from `grep -rE "logAudit\(" apps/api/src`) uses `:`
for the FSM target state and `-` in compound verbs, **neither of which the regex normalized**,
and the `audit` namespace only had `action_{create,update,delete,restore}`. So every one of
these leaked the raw slug on the History tab:

| slug | frequency | leaked as |
|------|-----------|-----------|
| `transition:posted` / `:unposted` / `:cancelled` / `:draft` / `:confirmed` / `:sent` / `:in_progress` / `:completed` / `:overdue` / `${dynamic}` | every posted/transitioned doc | raw |
| `mass-edit` | 20 services | raw |
| `clone` | ~17 services | raw |
| `archived` / `restored` | 8 + 8 (catalog/CRM archive-restore) | raw |
| `set:waiting` / `clear:waiting` / `create:cashout` | purchase-order | raw |

`create`/`update`/`delete`/`restore` worked by luck (no separators).

## The fix

1. **Shared hook `apps/web/src/hooks/use-audit-labels.ts`** — `useAuditLabels()` returning
   `{ translateAction, translateField }`, used by BOTH consumers (dedups the two copies and
   fixes both at once). `translateAction` now:
   - normalizes **all** separators `[-.:]` → `_` (so `transition:posted`→`action_transition_posted`,
     `mass-edit`→`action_mass_edit`, `set:waiting`→`action_set_waiting`);
   - falls back to a generic **`action_transition`** («Статус изменён» / «Holat o'zgardi») for
     any transition state without a dedicated key — so the customer-order long-tail
     (`transition:partially_shipped`, `:paid`, …) and any future state degrade gracefully, never
     to a raw slug.
2. **Grounded i18n keys** added to `audit` namespace in `ru.json` + `uz.json` (16 each):
   `action_transition` + 9 `action_transition_<state>` + `action_mass_edit` + `action_clone`
   + `action_archived` + `action_restored` + `action_set_waiting` + `action_clear_waiting` +
   `action_create_cashout`.

### §4 grounding

No moysklad capture of the History/audit tab exists (it is our implementation of moysklad's
«Изменения» audit), so per CLAUDE.md §4 the labels reuse the **existing app vocabulary** (the
parity baseline), not invented terms:

- `transition_posted`→«Проведено» / «O'tkazildi» = exact existing `action_demand_post`
- `transition_unposted`→«Проведение снято» / «O'tkazish bekor qilindi» = `action_demand_unpost`
- `transition_cancelled`→«Отменено» / «Bekor qilindi» = `action_demand_cancel`
- `transition_in_progress`→«В работе» / «Ishda», `transition_completed`→«Выполнено» / «Bajarildi»
  = `pages.work_orders.statuses.*`
- `transition`→«Статус изменён» / «Holat o'zgardi» = existing `action_customer_order_transition`
- `mass_edit`→«Массовое редактирование» / «Ommaviy tahrirlash» = existing `bulk_mass_edit`
- `restored`→«Восстановлено» / «Tiklandi» = existing `action_restore`
- `confirmed`/`sent`/`overdue` = neuter past-tense form of the existing `states.*` adjectives
  («Подтверждён»→«Подтверждено», «Отправлен»→«Отправлено», «Просрочен»→«Просрочено»; uz
  `states.*` already use the action form Yuborildi / Tasdiqlangan / Muddati o'tdi)

## Verification

**Browser (live, Playwright MCP) — verified across the full matrix:**
- `DocumentTabs` consumer (work-order, ru): `transition:completed`→**Выполнено**,
  `transition:in_progress`→**В работе**, `create`→**Создано**.
- `DetailContentTabs` consumer (demand `06847`, ru): `mass-edit`→**Массовое редактирование** (×2).
- UZ locale (work-order): **Bajarildi** / **Ishda** / **Yaratildi**.

**Unit guard `apps/web/src/hooks/use-audit-labels.test.tsx` (+5):**
- every BE action slug (23 enumerated) resolves to a non-raw label in BOTH uz and ru;
- dedicated states + `mass-edit`/`clone`/`archived` map to their exact labels (ru);
- an unmapped transition state (`transition:partially_shipped`) + bare `transition` degrade to
  «Статус изменён»;
- `audit.action_*` key parity between ru and uz.

**Gates:** web tc0 · biome0 (6 files) · web Vitest **1445** (+5, 0 regress, was 1440). No API
change (this is web-only) → api gates unaffected (api Vitest 2802 stands from 08k).

## Residual (DEFER — documented, not a hidden caveat)

The transition diff detail still renders raw: `from: in_progress→completed`. Two parts:
1. The diff **field key** is literally `from` (the BE writes `fieldChanges = { from: {before, after} }`
   in every transition `logAudit` call) → `translateField('from')` finds no `fields.from` key →
   raw «from».
2. The diff **values** are raw FSM enum names (`in_progress`, `completed`, `posted`, …).

Localizing enum *values* inside arbitrary audit diffs is a separate, much larger surface (it
needs a value-translation layer keyed by (entity, field), since the same value space differs
per entity). The headline user-facing leak — the **bold action label** — is fixed; the diff is
secondary technical audit detail. Tracked as a Phase-2/BE-backlog follow-up.
