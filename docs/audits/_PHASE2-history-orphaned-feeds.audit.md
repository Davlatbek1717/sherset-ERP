# Phase-2 — Orphaned / unrendered History feeds (counterparty bank accounts + Task transitions)

**Date:** 2026-06-08n (`davom et`, local Opus, ultracode)
**Status:** ✅ **FIXED + LIVE api+db smoke (10/10) + BROWSER-VERIFIED end-to-end in BOTH locales.**

Two gate-invisible History-feed defects, both in the same family as the 08g (empty-History)
and 08l/08m (raw-slug / unrendered-diff) work: an audit row is written but never reaches the
user — either because it targets an entity/id no page queries, or because its `fieldChanges`
shape is filtered out before render.

Session-start audit returned **GO** (4-agent, zero DONE-drift); it independently confirmed both
of these were genuinely still-owed (the `delete-bank-account` BE fix was on the carried-forward
"aging without a cohort trigger" list, not silently closed).

---

## Item 1 — Counterparty bank-account audits were orphaned from the counterparty History

### The bug (a 3-instance bug-class, not the documented 1-line residual)
The counterparty `[id]` page renders bank accounts **read-only** ("managed separately in
moysklad") and its History tab is the **parent counterparty's** feed:
`<DocumentTabs auditEntity="Counterparty" entityId={data.id} />` → queries
`GET /audit-logs?entity=Counterparty&entityId=<counterpartyId>`.

The three nested bank-account endpoints (`POST/PATCH/DELETE /counterparties/:id/bank-accounts`)
all wrote audit rows that **no page ever queries**:

| op | wrote | result |
|----|-------|--------|
| create | `entity:'CounterpartyAccount'`, `entityId=<bankAccountId>` | orphaned (no `CounterpartyAccount` detail page exists) |
| update | `entity:'CounterpartyAccount'`, `entityId=<bankAccountId>` | orphaned |
| delete | `entity:'Counterparty'` (right), `entityId=<bankAccountId>` (wrong) | orphaned — entity matches, id doesn't |

The 08m residual flagged only the delete `entityId`. Per the project's bug-class discipline
("what pattern is this an instance of, where else does it repeat?"), the delete bug is **one of
three** instances of the same pattern: bank-account audits don't reach the counterparty History.
A source check confirmed **nothing in `apps/` ever reads `entity='CounterpartyAccount'`** — those
rows are write-only orphans.

### Fix (mirrors the 08g bundle component-list parent-feed pattern)
All three now log under the **parent counterparty** (`entity='Counterparty'`,
`entityId=<counterpartyId>`) with **distinct, localizable verbs** and a clean single-summary diff:

- `create-bank-account` → `fieldChanges = { bankAccount: { before: null, after: "<acc#> · <bank>" } }`
- `update-bank-account` → `{ bankAccount: { before: <oldSummary>, after: <newSummary> } }`
- `delete-bank-account` → `{ bankAccount: { before: <oldSummary>, after: null } }`

A single `bankAccount` summary field (vs. a granular per-column diff) was chosen deliberately:
`translateField` falls back to the raw field name for any `fields.<key>` it doesn't have, and
only `currency` exists for the bank-account columns (`mfo`/`swift`/`correspondentAccount`/… are
all missing) — so a granular diff would **leak raw English field names**. One `fields.bank_account`
key keeps the diff localized and leak-free. The summary value (`accountNumber · bankName`) is
locale-neutral data.

### i18n (grounded ru+uz — no invention)
- `audit.action_create_bank_account` → «Банковский счёт добавлен» / «Bank hisobi qo'shildi»
- `audit.action_update_bank_account` → «Банковский счёт изменён» / «Bank hisobi o'zgartirildi»
- `audit.action_delete_bank_account` → «Банковский счёт удалён» / «Bank hisobi o'chirildi» (08m)
- `fields.bank_account` → «Банковский счёт» / «Bank hisobi» (grounds to the counterparty form's
  «Банковский счёт» section / `bank_section_title`)

The 08m **self-maintaining source-scan** in `use-audit-labels.test.tsx` automatically requires
i18n keys for the two NEW slugs (`create-bank-account`, `update-bank-account`) — verified it
**non-vacuously** collects them from `counterparty.service.ts` at test time (a missing key would
fail CI immediately).

### Verified
- **Gate:** api tc0 · web tc0 · biome0 · api Vitest **2805** (+3) · web Vitest **1458** (0 regress)
- **Live api+db smoke (10/10):** create counterparty → add/edit/delete bank account →
  `GET /audit-logs?entity=Counterparty&entityId=<cp>` returns all three rows, **every one with
  `entityId = counterpartyId`**, with readable before→after summaries (account number present).
- **Browser (RU):** История → «Банковский счёт изменён» / «…добавлен» with
  «Банковский счёт: 20208… · Ipak Yo'li Bank → 20208… · Asaka Bank».
- **Browser (UZ):** Tarix → «Bank hisobi o'zgartirildi» / «…qo'shildi» with «Bank hisobi: …».

---

## Item 2 — Task transition diff rendered NO status change (08m residual b)

### The bug
`task.service.ts` transition wrote `fieldChanges = { from: <status>, to: <status> }` — **flat
strings**. The History timeline filters each change with `typeof change === 'object'`, so the flat
`from`/`to` values were dropped → the Task transition row showed its headline but **no status
diff** at all (every other FSM doc shows «Статус: X → Y»). It was the only transition writer
using the flat shape; the **26 other services** (e.g. `cash-in.service.ts:499`) use
`from: { before, after }`.

### Fix
- `task.service.ts` transition now writes the cohort-standard `from: { before, after }` object
  shape. This both **passes** the timeline's object guard AND lets the 08m
  `useAuditLabels.translateValue` map the before/after through the grounded `states.<entity>`
  vocabulary.
- Added `states.task` (ru+uz) mirroring the form's grounded `pages.tasks.statuses` map
  (open=«Открыта»/«Ochiq», in_progress=«В работе»/«Jarayonda», done=«Выполнена»/«Bajarildi»,
  cancelled=«Отменена»/«Bekor qilindi») — §4 grounded, the same vocabulary the status badge uses.

### Verified
- **Gate:** api tc0 · web tc0 · biome0 (Task entity added to the cross-entity `translateValue`
  no-raw-leak guard + `states` ru⇄uz parity lock).
- **Live api+db smoke:** create task → `POST /tasks/:id/transition {status:'in_progress'}` →
  `fieldChanges = { from: { before: 'open', after: 'in_progress' } }` (object shape proven).
- **Browser (UZ):** Tarix → «Holat o'zgardi» + **«Holat: Ochiq → Jarayonda»** (was: no diff).
- **Browser (RU):** История → «Статус изменён» + **«Статус: Открыта → В работе»** (was: no diff).

---

## Residual (documented, DEFER)
- `delete-bank-account` i18n key + entityId are now both correct; nothing left there.
- The counterparty bank-account CRUD has **no FE UI** (the detail table is read-only — moysklad
  manages bank accounts in-form, we don't yet). The audit feed is correct for the API path / any
  future FE / import; building the in-form editor is a separate feature, not an audit gap.

## Files
- `apps/api/src/modules/counterparty/counterparty.service.ts` (3 bank-account audit writes + `bankAccountSummary` helper)
- `apps/api/src/modules/task/task.service.ts` (transition diff shape)
- `apps/api/src/modules/audit-log/document-history.test.ts` (+counterparty bank-account feed regression-lock, +3)
- `apps/web/src/hooks/use-audit-labels.test.tsx` (Task added to cross-entity coverage + parity lock)
- `apps/web/src/messages/{ru,uz}.json` (+`audit.action_{create,update}_bank_account`, `fields.bank_account`, `states.task`)
