# B6 S15 — counterparties/[id] «Доступ» section editors (2026-06-13)

> **Commit `fc9833ac`.** `davom et` (lokal Opus, ultracode). Phase-1 structural +
> BE write-path live-smoked (api:4000+DB 8/8); browser-render cert = QA-backlog
> (Playwright profile locked by a parallel session — not killed, to avoid
> disrupting the user's parallel work).

## Why this slice

The B6 counterparty-card refactor proceeds in bounded left-column slices (after
S13 «Статус» editable dropdown, `f1249103`). S15 = the «Доступ» section.

**§4 DOM-grounding (gold standard, not sibling-inferred):** the real counterparty
edit capture `docs/moysklad-reference/counterparties/detail/edit-default.html:175`
carries `>Доступ<` (section header) with `>Сотрудник<` (owner) · `>Отдел<` (group)
· `>Общий доступ<` (shared) as element-content (DOM-role, not banner/grep-count).
The clone rendered none of these editors.

## The handoff was wrong about ownerId (caught by write-path grep BIRINCHI)

NEXT.md claimed *"schema `ownerId/groupId/shared` qabul qiladi; service
`connect/disconnect`+`data.shared` yozadi"*. Grounding against the actual code:

- `groupId` + `shared` write-paths **were** wired (`counterparty.service.ts`
  update connect/disconnects group; `data.shared` set). ✅
- `ownerId` was **NOT** writable. The `ownerId` at `counterparty.schema.ts:128`
  is in the **Filter** schema (list filtering), not Create/Update. `create()`
  forced `ownerId: userId`; `update()` never handled it. ❌

This is exactly the CLAUDE.md §2 lesson ("handoff da'vosiga ishonma — write-path
grep BIRINCHI"). `Counterparty.ownerId` is nullable (`@onDelete SetNull`), so an
owner can be set, changed, or cleared.

## Fix

**BE** (`counterparty.schema.ts` + `counterparty.service.ts`):
- `ownerId: uuid.nullish()` added to `CreateCounterpartySchema` (writable +
  clearable — a bare `.optional()` would 400 the editor's clear→null, the same
  class as the `legalTitle` nullish note).
- `groupId` relaxed `.optional()` → `.nullish()` so the group picker's clear
  reaches the service (service disconnect was already there).
- `update()`: `if (parsed.ownerId !== undefined) data.owner = parsed.ownerId ?
  { connect } : { disconnect: true }` — mirrors groupId.
- `create()`: `ownerId: parsed.ownerId ?? userId` — honours an explicit owner,
  defaults to the creator (moysklad behaviour; byte-identical for existing /new
  callers that don't send ownerId).

**FE** (`counterparties/[id]/page.tsx`):
- `«Доступ»` `FormSection` with an Employee picker (`/employees`), a Group picker
  (`/groups`) — mirroring the counterparties list filter's owner/group pickers —
  and a shared `Checkbox`.
- All three managed **outside RHF** (mirrors `tags`/`stateId`); `accessChanged`
  keeps Save live on an access-only edit; `ownerId/groupId/shared` threaded into
  the PATCH payload. `CounterpartyDetail` gains the `shared` field.
- i18n ru+uz (10 keys): «Доступ»/Kirish · «Сотрудник»/Xodim · «Отдел»/Bo'lim ·
  «Общий доступ»/Umumiy kirish + picker placeholders/titles/search.

**Guard** (`counterparty-access-section.test.ts`, +4): FE renders the 3 editors
sourced from /employees+/groups + threads ownerId/groupId/shared + accessChanged
in isDirty; BE schema `ownerId/groupId` `.nullish()` + update connect/disconnects
owner + create owner-fallback. Non-vacuous (fails on pre-slice source).

## Gate + runtime

- api tc0 · web tc0 · biome0 (changed) · web Vitest counterparty 6/6 (incl new
  4-assert guard) · api Vitest counterparty 62/62 · i18n 10/10 ru+uz.
- **Live `scripts/verify-counterparty-access-smoke.mts` (api:4000+DB) 8/8:**
  create defaults owner to creator · PATCH {ownerId:null, shared:true} → 200,
  owner disconnected + shared set, v1→2 · GET nested reflects (owner:null,
  shared:true) · PATCH {ownerId:emp} → 200, owner connected, v2→3 (the NEW
  write-path) · GET nested owner.id===emp · PATCH {shared:false} → 200 ·
  **ADVERSARIAL** PATCH bad ownerId → **400 BAD_REFERENCE** (the new owner
  connect is covered by the 11ac `mapVersionedUpdateError` classifier exactly like
  a bad group connect — degrades safely, never raw 500) · explicit ZERO 5xx.
  - (Group-connect asserted-as-skipped: no groups seeded in this DB; the group
    connect/disconnect path is pre-existing + the `.nullish()` relaxation is the
    same Zod change proven on the owner path.)

## Honest status

**Phase-1 structural + write-path live-smoked.** Browser-render cert (the
«Доступ» section painting in the real page, picker dialogs opening) = QA-backlog
item — Playwright was unavailable this session (profile locked by a parallel
session). The BE write-path (the actual correctness surface) is fully live-smoked.

## Lesson

Ground every handoff write-path claim against the actual Create/Update schema —
a field in the *Filter* schema is not a writable field. `ownerId` looked wired
(it's all over the codebase) but was read-only on the counterparty write-path.
