# Counterparty «Группы» subsystem — design (2026-06-18)

The final «100%» item from the audit (mass-edit «Добавить/Убрать группы») turns out to
require a whole new subsystem, because moysklad's counterparty **«Группы»** is a concept
our model lacks entirely.

## Grounded facts (live on climart 2026-06-18)
- Counterparty «Группы» = flat, account-scoped, **named groups**, **many-to-many** (a
  counterparty belongs to several at once — "усто сантехник", "Муйдин ака сантехник";
  the mass-edit «Установить / Добавить / Убрать группы» modes confirm m2m). No folder tree.
- «Группы» is SEPARATE from «Владелец-отдел» (the single access department).

## Current model (the mismatch)
- `Group` = the access **DEPARTMENT** («Отдел»): related to EVERY entity (counterparties,
  products, moves, cash, orgs, stores…), drives the OWN_GROUP permission scope. Touching it
  is security-sensitive.
- `Counterparty.groupId` → single `Group` (the dept). The list «Группы» column renders
  `cp.group.name` — i.e. it shows the **department**, a MISLABEL vs moysklad's «Группы».
- We have NO counterparty-group entity. (Products have `ProductFolder`; counterparties have
  nothing equivalent.)

## Design
1. NEW entity `CounterpartyGroup { id, accountId, name, index, timestamps }` (flat, like a
   tag/named group) + many-to-many `Counterparty ↔ CounterpartyGroup` (Prisma implicit m2m
   `groups CounterpartyGroup[]` or an explicit join with @@unique).
2. KEEP `Group`/`groupId` UNCHANGED as «Владелец-отдел» (do NOT touch the access system).
3. Migration: create the table + join. Backfill decision (NEEDS A CALL): the demo «усто
   сантехник» is currently stored as a DEPARTMENT (`groupId`). Either (a) leave depts alone
   and start counterparty-groups empty, or (b) seed counterparty-groups from the existing
   dept names so the list looks unchanged. Recommend (b) for the demo only, via a seed/script.
4. BE:
   - CounterpartyGroup CRUD (list/create/rename/delete), account-scoped.
   - Counterparty list `include: { groups }`; the «Группы» column → memberships (fixes the
     mislabel). Add a «Группы» membership filter (`groups: { some: { id } }`).
   - Mass-edit «Группы» 3 modes: Установить (`set`), Добавить (`connect`), Убрать
     (`disconnect`) — extend BulkUpdateCounterpartySchema.patch with `{ groupsMode, groupIds }`.
   - Create/update counterparty: set memberships.
5. FE:
   - List «Группы» column renders the membership pills (currently the dept pill).
   - Filter «Группы» (multi-select).
   - Mass-edit modal: the 3 group-mode controls (replaces the deferred note).
   - Detail/create form: «Группы» multi-select + inline create-group.

## Scope / risk
- 4–6 flagships of work; touches schema (additive — low risk), but ALSO changes the existing
  list «Группы» column behaviour (dept → memberships) and adds a group-management UI.
- Best done as a dedicated, carefully-tested effort (the access-scope `Group` stays untouched,
  but the data-model correction + migration deserve their own QA pass — NOT rushed at the tail
  of a long session, per the quality-first rule).
