# Supplies list «Фильтр» parity — «Владелец контрагента» + merge-fix (2026-06-12)

**Status: Phase-2 VERIFIED — BE runtime (live smoke 10/10) + browser RU/UZ render
+ live end-to-end forwarding (Playwright).**
Purchase-side sibling of the money-doc filter conveyor (payments-in 11l →
payments-out 11m → cash-out 11n → cash-in 11o). Continues backlog
**(A) filter-field parity** — first of the supply/invoice document family.

Commit: (see git log). Doc companion to the BE/web guards + runtime smoke.

---

## §1 Premise — grounded, NOT assumed

The 11o hand-off named "(A) supplies/invoices filter-parity (~18→24/25),
write-path grep FIRST (gap'ning ko'pi dead/computed)". The supplies panel was
**already rich — 18 fields** mirroring the purchase-orders gold standard (24/24).
So the "18→24" nominal gap is NOT six missing live fields; per §1 discipline most
of it is dead/computed/no-column. Grounded every candidate before touching code:

1. **§4 DOM-role (not grep-count).**
   `02-module/supply/dom/00-clean-default.html` renders the filter labels as
   `<div class="gwt-Label">…</div>`. Extracting them shows the supply filter
   surfaces — among the universal document-filter fields — «Владелец
   контрагента», «Общий доступ» and «Кто изменил» that our 18-field panel lacks.
   (The other capture labels — «Товар или группа», «Тип возврата», «Оплата» — are
   cross-doc-type contamination from moysklad's *unified* filter chrome, which
   renders every possible field; they are customer-order/return fields, not
   supply fields.) «Владелец контрагента» sits between «Договор» and
   «Организация», identical to the purchase-orders gold standard.
2. **Write-path grep FIRST — separates the one live field from two dead ones.**
   - **«Владелец контрагента» → `agentOwnerId` = `agent.ownerId`** — `agentId`
     is a `Counterparty` FK and `Counterparty.ownerId` is a real column written
     on create (proven across the money-doc conveyor). **LIVE.** The only
     genuinely-missing live field.
   - **«Общий доступ» → `shared`** — `Supply.shared` (`schema.prisma:4764`)
     **exists as a column but is NEVER written**: it is absent from
     `CreateSupplySchema`/`UpdateSupplySchema` and from the mass-edit patch
     (`ownerId`/`projectId`/`description` only). It is always `DEFAULT false`, so
     a filter on it would be a dead 11h control (matches nothing meaningful).
     **DEFER** (absence-locked).
   - **«Кто изменил» → `updatedById`** — Supply has **no such column** (only
     `ownerId`/`groupId`). The schema already documented this skip. **DEFER**
     (absence-locked).

So the genuine LIVE gap is exactly one field, `agentOwnerId` — a carbon mirror
of the cash-in 11o flagship, but for a purchase document.

---

## What shipped

1. **«Владелец контрагента» → `agentOwnerId`** = `agent.ownerId` (the supplier
   counterparty's owner EMPLOYEE) — distinct from `ownerId` («Владелец-
   сотрудник» = the supply's own owner). Added to `SupplyFilterSchema` (uuid,
   optional) and surfaced server-side via the merged `agent` clause in
   `buildListWhere`. FE: an `/employees` picker control inserted between
   «Договор» and «Организация» (§4 order) + forwarded into the request params via
   the `...(filterValues.agentOwnerId ? { agentOwnerId } : {})` spread + added to
   `hasFilter`.

2. **`buildListWhere` MERGE-fix (proactive).** Before, the only `agent` predicate
   was `agentGroupId → { agent: { groupId } }` (one clause, no merge needed; the
   `search`-OR's `agent: { name }` lives inside the OR array, a different level —
   no collision). Adding `agentOwnerId` as a *second* `agent: {}` spread would
   silently overwrite under object-literal last-key-wins, dropping one predicate.
   Merged both into ONE clause:
   ```ts
   const agentRelation =
     filter.agentGroupId || filter.agentOwnerId
       ? { agent: { ...(agentGroupId ? { groupId } : {}), ...(agentOwnerId ? { ownerId } : {}) } }
       : {};
   ```
   (Mirror of cash-in / cash-out / payments-out.)

3. **i18n** — reused existing `filters.agent_owner` (ru «Владелец контрагента» /
   uz «Kontragent egasi»). No new keys.

4. **Deliberate absences locked** — `Supply.shared` (dead column) and
   `updatedById` (no column) are NOT surfaced; the web guard `not.toContain`s
   their test-ids/keys so a future "just mirror the gold standard" edit cannot
   reintroduce them as dead controls. The panel-order comment + the
   `SupplyFilterSchema` NOTE document both.

---

## Verification (Phase-2 — BE + buildListWhere runtime-verified)

- **api tc 0 · web tc 0 · biome 0** (5 source files; the smoke script carries the
  usual 2 `noConsoleLog` warnings — CLI-script exemption).
- **api Vitest 2887 (+1, 0 regress)** — `supply.schema.test.ts`: agentOwnerId
  accepted in the full filter set + parsed independently of `ownerId` +
  non-uuid rejected.
- **web Vitest 2165 (+8, 0 regress)** — new `supplies-filter-fields.test.ts`:
  renders `filter-agent-owner` + i18n key · **absence locks** (no
  `filter-modified-by`/`updatedById`; no `filter-shared`/`\bshared\b`) ·
  no-regression of the 19 pre-existing controls · forwarding anchored on the
  `...(filterValues.agentOwnerId ? { agentOwnerId: filterValues.agentOwnerId })`
  spread (non-vacuous — the JSX `value={…{ id: … }}` builds a different object) ·
  query-key includes `params.toString()` · picker fetches `/employees`.
- **runtime 10/10** (`tools/scripts/verify-supply-filter-smoke.mjs`, live dev API
  + self-returning DB probe; TOKEN lives in `description`, a supply search-OR
  field):
  1. `agentOwnerId=A` → {ga, oa} (the rows whose AGENT is owned by A)
  2. `agentGroupId=G` → {ga, gb} (pre-existing clause still works post-merge)
  3. **MERGE:** `agentGroupId=G & agentOwnerId=A` → {ga} only (AND, not overwrite)
  4. **MERGE-2:** `agentGroupId=G & agentOwnerId=B` → {gb} only (distinct
     intersection — proves a real AND, not last-key-wins)
  5. `agentOwnerId=A & state=posted` → ∅ (test docs are draft — the agent clause
     ANDs with the top-level scalar, doesn't widen).
  The doc's OWN `ownerId` was left null on every fixture, so the narrowing is
  provably by the AGENT's owner, not «Владелец-сотрудник».

- **Browser-verified (Playwright, :3100, live dev):**
  - **RU** (`htmlLang=ru`): the panel renders «Владелец контрагента» with the
    exact §4 label, in the §4 order — `Договор` (idx 98) < `Владелец контрагента`
    (107) < `Организация` (129). The two deliberate absences confirmed in the
    rendered DOM: «Общий доступ» and «Кто изменил» are NOT present.
  - **End-to-end forwarding:** opened the picker (modal title «Владелец
    контрагента», fetched `/employees` → "Admin User", "first"), selected
    "Admin User" → the app fired
    `GET /api/v1/supplies?…&agentOwnerId=1519595d-… → 200 OK`. The FE param
    spread reaches the API live — not just source-locked by the guard.
  - **UZ** (`htmlLang=uz`, native locale-select change): the panel renders
    «Kontragent egasi»; the deliberate absences still hold.
  - Console: only a pre-existing `favicon.ico` 404 — no error from the filter.

The SavedFiltersPills round-trip (`filterFromQueryString`) decodes only the base
`FilterDrawerValues` fields, so `agentOwnerId` is not restored from a saved pill
— but neither are any of the other extra FK pickers (agentGroupId, contractId,
…). Consistent with the existing siblings; not a regression (out of scope here).

---

## Next

- **invoices-in** then **invoices-out** — the immediate purchase/invoice
  siblings. Each has the SAME 18-field panel + the SAME `agentGroupId → {agent}`
  merge scenario, but ground each independently (does each model have `shared` /
  `updatedById` columns, and are they written?) before mirroring — divergences
  are likely (e.g. InvoiceIn surfaces «Склад»; the dead/live status of `shared`
  may differ per model). agentOwnerId itself is identical (all → Counterparty.ownerId).
- Then: «Тип» open-dropdown capture · «Ожидание» in-transit · vestigial
  `stock_minor` DROP · box (2/3) grounding · Phase-3 master-plan.

**Lesson re-confirmed:** column-exists ≠ live. Supplies *looked* like it just
needed three fields to match the gold standard; the write-path grep showed two of
the three (`shared`, `updatedById`) are dead/absent, leaving exactly one live gap.
Grep the write-path BEFORE mirroring a sibling — a rendered control wired to a
never-written column is worse than no control (the 11h dead-filter class).
