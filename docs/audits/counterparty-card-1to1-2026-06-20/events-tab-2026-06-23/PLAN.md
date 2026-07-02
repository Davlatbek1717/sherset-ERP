# Контрагент card → «События» (Events) tab — live-grounded 1:1 plan (2026-06-23)

User picked the **Hodisalar (События)** tab to make 1:1 first (`/goal` tab-by-tab).
Live-grounded against the REAL climart account (`scripts/ground-counterparty-events-live.mjs`
opened a real counterparty card via the moysklad REST API id → clicked «События»):
`01-events-tab.png`.

## What moysklad's «События» tab actually is (ground truth)

A unified CRM **activity stream**, NOT just an audit log. Layout, top → bottom:

1. **Sub-filter pills** (right-aligned, above the stream):
   - **«Все события»** (active by default) · **«Заметки»** · **«Звонки»** · + a **⚙ gear** dropdown.
   - These filter the stream: All / Notes-only / Calls-only.
2. **«Создать заметку:»** — an inline note composer: a textarea with placeholder
   **«Что произошло?»** (+ presumably a save action on blur / button). Creates a CRM note.
3. **Paginated event list** below («1-1 из 0» when empty). Each entry = a note, a call, or a
   system event (status change, document created, …), newest first.

## What we have now (`apps/web/src/components/counterparty-activity-widget.tsx`, «events» tab)

- ONLY a `HistoryTimeline` of the audit log (`useDocumentHistory('Counterparty', id)`) —
  system events (create / status / field edits). **No sub-filter, no note composer, no calls.**

## Backend inventory (what exists vs what's missing)

- **Звонки (calls)** — `Call` model (`schema.prisma:1220`) + `/calls?counterpartyId=` endpoint
  (`call.controller.ts`, used by `CallsSection`). ✅ data exists.
- **System events** — AuditLog via `useDocumentHistory`. ✅ exists.
- **Заметки (notes)** — **NO MODEL, NO ENDPOINT.** ❌ This is the missing piece: moysklad's
  «Создать заметку» / «Заметки» need a new CRM-note entity.

## Implementation plan (a real flagship — new model + migration)

### Increment A — backend `CounterpartyNote` (mirror the `Call` module)
- **Model** `CounterpartyNote` (schema.prisma, mirror `Call` shape):
  `id · accountId · counterpartyId · authorId(Employee?) · text(String) · archived ·
  createdAt · updatedAt`, indexes `@@index([accountId, counterpartyId, createdAt(Desc)])`,
  `@@map("counterparty_notes")`. Add the back-relations on `Account` / `Counterparty` / `Employee`.
- **Migration** `prisma migrate dev --name add_counterparty_note` (⚠️ FIRST resolve the current
  `packages/db/src/generated` drift so migrate doesn't offer a reset — verify on a clean tree).
- **Module** `apps/api/src/modules/counterparty-note/` (mirror `call/`): schema (Zod
  Create/Update), service (create/list-by-counterparty/archive/delete, tenant-guarded by
  accountId, stamp authorId=userId), controller (`GET /counterparty-notes?counterpartyId=`,
  `POST /counterparty-notes`, `DELETE /:id`), module; register in the app module.
- **Cert**: API POST a note → GET lists it (author + text + createdAt).

### Increment B — FE «События» rebuild
- Sub-filter pills **Все события / Заметки / Звонки** (+ ⚙ deferred) — a segmented control.
- **«Создать заметку»** composer (textarea «Что произошло?» → `POST /counterparty-notes`,
  invalidate the stream). Only when `counterpartyId` (not on /new).
- **Merged stream** for «Все события» = notes + calls + audit events, normalised to a common
  `{ kind, at, who, body, … }` and sorted desc. «Заметки» filters kind=note (with delete),
  «Звонки» filters kind=call (link to /calls/:id).
- i18n: `tab` already has `events_*`; add `events_all` / `events_notes` / `events_calls` /
  `note_compose_placeholder` («Что произошло?») / `note_add` (ru + uz).
- **Cert :3100**: create a note → appears in Все события + Заметки; Звонки shows calls; pager.

## Notes / risks
- ⚠️ **Do NOT run the migration on a dirty `packages/db/src/generated` tree** — `migrate dev`
  may prompt a reset (wipes dev data). Confirm a clean generated-client state first.
- The ⚙ gear (event-type visibility settings) is a later slice — defer (not grounded in depth).
- moysklad also surfaces this stream on documents; out of scope (counterparty card only).
- This is intentionally deferred from the 2026-06-23 session (card regroup + auto-gen + Доступ
  defaults + hint-removal already shipped) — a new model + migration deserves a focused start,
  not a long-session tail (§0 quality rule).
