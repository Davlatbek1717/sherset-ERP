# Phase-2 audit — History (Tarix) transition-DIFF enum-value i18n leak + mark-printed action leak (app-wide)

**Date:** 2026-06-08m (`davom et`, local Opus, ultracode)
**Status:** ✅ **FIXED + BROWSER-VERIFIED end-to-end** (WorkOrder transition diff, both
locales, full mechanism) + exhaustive unit guard incl. a **self-maintaining source-scan**.
This closes the **documented residual** the 08l action-label fix left open, AND a second
gate-invisible action-label leak (`mark-printed`/`unmark-printed`/`delete-bank-account`) found
by adversarial browsing while verifying the first.

## Item 1 — transition-diff enum-value leak (the 08l residual)

### How it was found
08l localized the History action **headline** (`transition:completed` → «Выполнено») but
explicitly deferred the diff **below** it. Re-opening the same completed work-order
(`/production/work-orders/ТЗ-2026-00001`) → **История** tab, the diff row still read:

```
Выполнено   · Admin User · 27.04.2026 07:46
   from: in_progress→completed        ← raw field key + raw FSM enum slugs
```

A Russian user saw the headline localized but the diff showing raw English-ish slugs and a
raw `from` field key. Gate-invisible: tc/biome/unit never render the tab; the
`i18n-no-hardcoded` gate scans source strings, not runtime audit values.

### Root cause
Every FSM transition across **26 services** writes its audit diff with the identical shape

```ts
fieldChanges = { from: { before: <oldState>, after: <newState> } }
```

where before/after are **raw enum slugs** (`draft`, `posted`, `in_progress`, `completed`, …).
`HistoryTimeline` (design-system) rendered them via the generic `formatValue`, and the field
key `from` via `translateField` — which had no mapping, so it leaked `from:` too. No entity has
a real column called `from`, so the `from` diff key is **exclusively** the transition status row.

### Fix (grounded, app-wide)
- **`useAuditLabels(entity?)`** (hook) gains `translateValue(field, value, action)`: for the
  `from` field of a `transition:*` entry it maps the status slug through the **grounded
  `states.<entity>` vocabulary** — the same per-entity status map the status badge already uses
  (no invention; §4). `translateField('from')` → `audit.field_from` («Статус» / «Holat»). Any
  unknown state degrades to the raw slug — never worse than before.
  - PascalCase auditEntity → snake `states` key is deterministic
    (`WorkOrder`→`work_order`, `CustomerOrder`→`customer_order`).
- **`HistoryTimeline`** (DS): new optional `translateValue` prop; before/after use it, falling
  back to `formatValue` when it returns `undefined` (so non-transition diffs are untouched).
- **Both consumers** (`document-tabs.tsx` + `detail-content-tabs.tsx`) pass `auditEntity` to the
  hook and `translateValue` to the timeline.
- **i18n**: added the only two missing `states.<entity>` maps with a live History page —
  **`states.work_order`** (draft/in_progress/completed/cancelled) + **`states.production`**
  (draft/posted/cancelled) — grounded from existing app vocabulary
  (`pages.work_orders.statuses`, sibling `states.*`). `audit.field_from` ru «Статус» / uz
  «Holat» (grounded to the app's universal `fields.state`).
  - `ServiceRequest` emits transitions but has **no `[id]` detail page** → no History tab ever
    renders it → out of scope (the raw fallback covers it harmlessly).

### Browser-verified (Playwright MCP, live :3100/:4000/:5433)
- **WorkOrder ТЗ-2026-00001, RU:** «Выполнено» → **Статус: В работе→Выполнено** · «В работе» →
  **Статус: Черновик→В работе** (was raw `from: in_progress→completed` / `from: draft→in_progress`).
- **WorkOrder, UZ:** «Bajarildi» → **Holat: Ishda→Bajarildi** · «Ishda» → **Holat: Qoralama→Ishda**.
- Proves the **complete mechanism** end-to-end: field label (`audit.field_from`), value
  translation (`states.work_order`), in both locales, via the `DocumentTabs` consumer. The
  `DetailContentTabs` consumer is browser-verified for translated actions via Item 2 below
  (identical 2-line wiring). Cross-entity `states.<entity>` coverage is unit-locked (11 entities,
  ru+uz).
- This **improves** the 08l long-tail case: even when the headline degrades to generic «Статус
  изменён» (customer-order `partially_shipped` etc., no dedicated action key), the diff now shows
  the precise localized states.

## Item 2 — `mark-printed` / `unmark-printed` / `delete-bank-account` raw action leak (08l miss)

### How it was found
While browser-verifying Item 1 I opened a smoke customer-order's History and saw the headline
**`mark-printed`** rendered **raw** (3×). 08l's action-label fix hand-enumerated the BE slugs and
**missed** these — they leaked raw for months, gate-invisible.

### Scope (definitive cross-check)
A source cross-check of every BE `logAudit`/`auditLog.create` action vs the `audit.action_*`
keys found exactly 3 un-keyed real slugs:
- **`mark-printed`** + **`unmark-printed`** — 9 services (customer-order, demand, invoice-out,
  payroll, processing, purchase-order, purchase-return, sales-return, supply). **User-visible.**
- **`delete-bank-account`** — counterparty. Writes `entity:'Counterparty'` but `entityId =
  bankAccountId`, so it never matches the counterparty History query → currently **orphaned /
  not displayed** (latent BE entityId bug, out of scope). Key added for correctness/future.
- (`cancelled`/`draft`/`unposted` were regex false-positives from a template-literal ternary
  `transition:${cond ? 'unposted' : 'cancelled'}` in `processing.service.ts:1308` — they resolve
  to `transition:*` at runtime.)

### Fix (grounded ru+uz)
- `action_mark_printed` → «Напечатано» / «Chop etildi» (ru reuses the existing app term).
- `action_unmark_printed` → «Отметка о печати снята» / «Chop belgisi olib tashlandi» (parallel to
  `action_transition_unposted` = «Проведение снято»).
- `action_delete_bank_account` → «Банковский счёт удалён» / «Bank hisobi o'chirildi» (grounded to
  the counterparty form's «Банковский счёт» / «Bank hisobi»).

### Browser-verified
Smoke customer-order History (RU): the 3 `mark-printed` rows now render **«Напечатано»** (was raw).

## The real fix for the staleness bug-class — self-maintaining source-scan guard

08l's leak (and this session's `mark-printed` leak) both slipped through because the guard
**hand-listed** the BE slugs and the list went stale. `use-audit-labels.test.tsx` now adds a
**source-scan** that, at test time, walks `apps/api/src/modules`, extracts every audit action
literal (the 3rd `logAudit` arg + `action:` inside `auditLog.create`, handling ternaries and
template literals), and asserts each resolves to a localised label in **both** locales. A newly
added audit action with no i18n key now fails CI immediately — no human bookkeeping. (Non-vacuous:
during development the scan correctly flagged `mark-printed` before the key was added.)

## Guards (apps/web)
- `use-audit-labels.test.tsx` (**+10**, now 15): `translateValue` 11-entity × 2-locale no-leak
  lock + dedicated-label assertions + undefined/degrade/field-label cases + `states` ru⇄uz parity
  + the **source-scan** (sanity floor + ru + uz no-leak).
- `historytimeline-from-ui.test.tsx` (**+3**, now 24): `translateValue` before/after wiring,
  undefined fallback, action passthrough.

## Gate (all green)
- web tc **0** · @moysklad/ui (DS) tc **0** · biome **0 errors** (10 pre-existing nursery warnings)
- web Vitest **1458** (+13, was 1445) · DS Vitest **118** · api **untouched** (2802)

## Residual (documented, DEFER)
- `delete-bank-account` audit is orphaned by a wrong `entityId` (writes `bankAccountId`, History
  queries `counterpartyId`) → never displayed. The i18n key is in place; the BE entityId fix is a
  separate latent-bug item.
- Task transition (`{ from, to }` as flat strings, not `{before,after}` objects) renders **no**
  diff at all (filtered out by the timeline's object-shape guard) — not a raw leak, a minor
  missing-detail UX gap; left as-is.

## Files changed
- `apps/web/src/hooks/use-audit-labels.ts` (+`entity`/`translateValue`/`field_from`)
- `packages/design-system/src/patterns/HistoryTimeline.tsx` (+`translateValue` prop)
- `apps/web/src/components/document-tabs.tsx` · `…/document-detail/detail-content-tabs.tsx` (wiring)
- `apps/web/src/messages/{ru,uz}.json` (+`states.work_order`, `states.production`,
  `audit.field_from`, `action_mark_printed`, `action_unmark_printed`, `action_delete_bank_account`)
- `apps/web/src/hooks/use-audit-labels.test.tsx` · `…/__tests__/historytimeline-from-ui.test.tsx`
