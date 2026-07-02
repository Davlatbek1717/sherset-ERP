# Invoices-in list «Фильтр» parity — «Владелец контрагента» + merge-fix (2026-06-12, 11q)

> **Status: Phase-2 VERIFIED** — BE live API + self-returning DB-probe (smoke 9/9)
> **+ browser (Playwright :3100) RU/UZ render + live `/employees` fetch + live
> `agentOwnerId` forwarding (200).** Money-doc filter conveyor PURCHASE-side sibling
> of supplies (11p) / cash-in (11o) / cash-out (11n) / payments-out (11m) /
> payments-in (11l). One genuinely-live gap closed; two deliberate absences locked.

Commit: see NEXT.md. Files: `apps/api/.../invoice-in.schema.ts` (+agentOwnerId),
`invoice-in.service.ts` (buildListWhere merge), `invoice-in.schema.test.ts` (parse
guards), `apps/web/.../invoices-in/page.tsx` (FE field + picker), new web guard
`apps/web/src/__tests__/invoices-in-filter-fields.test.ts`, new smoke
`tools/scripts/verify-invoice-in-filter-smoke.mjs`.

## §1 Premise — grounded independently, NOT carbon-copied from supplies

The 11p handoff scoped this as "the agentOwnerId+merge sibling, but ground each
model independently — does InvoiceIn have `shared`/`updatedById` columns, are they
written?". Ground-truth (not assumed):

- **§4 capture** `02-module/invoicein/dom/00-clean-default.html` renders the filter
  field labels as `<div class="gwt-Label" title="…">LABEL</div>` (DOM-role, not a
  grep count). The ordered field-label sequence is:
  `Входящий номер · Оплата · Приемка · Товар или группа · Склад · Проект ·
  Контрагент · Группа контрагента · Счет контрагента · Договор ·
  **Владелец контрагента** · Организация · Счет организации · Статус · Проведено ·
  Напечатано · Отправлено · Владелец-сотрудник · Владелец-отдел · Общий доступ ·
  Кто изменил`.
- **«Владелец контрагента»** sits between «Договор» and «Организация» — exactly the
  supplies/cash-in/cash-out placement. → place the FE picker there.
- **Coverage:** `InvoiceInFilterSchema` was already an 18-field panel (the
  purchase-orders gold-standard mirror, same as supplies). The ONLY genuinely-live
  gap vs the §4 capture = `agentOwnerId`. (The leading `Оплата / Приемка / Товар или
  группа` labels are moysklad's UNIFIED «Счета поставщиков» filter contamination —
  cross-document fields, not invoice-in scalars; same class deferred on supplies.)
- **Write-path grep (the 11h dead-control discipline) — divergence check:**
  - **«Владелец контрагента» = `agent.ownerId`** — `Counterparty.ownerId` is a real
    column (`schema.prisma:1448`), written on counterparty create → **LIVE**. Distinct
    from «Владелец-сотрудник» (`InvoiceIn.ownerId`, the invoice's own owner).
  - **«Общий доступ» = `shared`** — `InvoiceIn.shared` column EXISTS
    (`schema.prisma:6292`) but is **never written**: absent from `CreateInvoiceInSchema`
    and never assigned in `create` / `update` / `clone` / `massEditApply` (grep across
    the whole `invoice-in` module: zero `shared:` write). → always DEFAULT false →
    a filter on it would be vacuous → **DEFER** (absence-locked).
  - **«Кто изменил» = `updatedById`** — InvoiceIn has **no `updatedById` column**
    (only `ownerId` / `groupId`). The existing schema NOTE already documents this →
    **DEFER**.

  → Result identical in shape to supplies, but **independently re-grounded** (shared
  is a real column here too, not assumed; updatedById confirmed absent from the model).

## What shipped

1. **BE schema** (`invoice-in.schema.ts`): `agentOwnerId: z.string().uuid().optional()`
   after `agentGroupId`, with the «owner-employee-of-agent vs own-owner» doc-comment.
2. **BE service** (`invoice-in.service.ts`): `buildListWhere` MERGE-fix. Previously a
   single `...(filter.agentGroupId ? { agent: { groupId } } : {})` spread. Adding a
   second `agent: { ownerId }` spread would collide on the `agent` key (object-literal
   last-key-wins → one predicate silently dropped). Merged into a single
   `agentRelation = { agent: { ...groupId, ...ownerId } }` clause (cash-in/cash-out/
   supplies mirror). The `search` OR also references `agent:{name}` but lives in a
   separate `OR[]` level — no collision.
3. **FE** (`invoices-in/page.tsx`): `agentOwnerId`/`agentOwnerLabel` on
   `ExtraFilterFields`; `'agentOwner'` in the `pickerOpen` union; params spread
   `...(filterValues.agentOwnerId ? { agentOwnerId } : {})`; `hasFilter` term; the new
   «Владелец контрагента» field as **field 6** (between Договор and Организация, with
   all subsequent field comments renumbered 7→19); the `agentOwner` `CatalogPicker`
   fetching `/employees` (same reference as «Владелец-сотрудник»).
4. **i18n:** reused `filters.agent_owner` — ru «Владелец контрагента» / uz «Kontragent
   egasi» (already present from supplies; NO new key).
5. **Guards:**
   - `invoice-in.schema.test.ts` — agentOwnerId in the full-set parse; a dedicated
     «independent of ownerId» test; agentOwnerId in the non-uuid reject (+1 net test).
   - `invoices-in-filter-fields.test.ts` (new web guard) — renders `filter-agent-owner`;
     uses `tFilters('agent_owner')`; **forwarding spread anchored as a regex** (a bare
     token would also match the JSX `value={…}` object — the spread proves non-vacuous
     forwarding); picker fetches `/employees`; **absence-locks** «Кто изменил»
     (`updatedById`/`filter-modified-by`) and «Общий доступ» (`shared`/`filter-shared`,
     incl. `not.toMatch(/\bshared\b/)`).

## Verification (Phase-2 — BE runtime + browser)

**Gate (all green):** api tc 0 · web tc 0 · biome 0 (app source) · **api Vitest 2888
(+1, 0 regress)** · **web Vitest 2173 (+8, 0 regress)** · ds untouched.

**Runtime smoke** `tools/scripts/verify-invoice-in-filter-smoke.mjs` — **9/9 PASS**
(4 counterparties × {groupId, ownerId} permutations, 4 InvoiceIn rows, doc OWN
ownerId left null so agentOwnerId is provably the AGENT's owner):
- agentOwnerId=A → {ga, oa} (agent-owned-by-A only)
- agentGroupId=G → {ga, gb}
- **MERGE proof #3** agentGroupId=G & agentOwnerId=A → **{ga} only (size 1)** — the
  overwrite bug would return size 2.
- **MERGE proof #4** agentGroupId=G & agentOwnerId=B → {gb} (real second intersection)
- agentOwnerId=A & state=posted → ∅ (new agent clause ANDs with the top-level scalar,
  doesn't widen it; all test docs are draft)

**Browser (Playwright MCP, :3100 live):**
- **RU:** `lang=ru`; panel renders «Владелец контрагента» in §4 order
  (Договор[14] < Владелец контрагента[15] < Организация[16], `orderingCorrect=true`).
- **Live `/employees` fetch:** opening the picker fired
  `GET /api/v1/employees?search=&limit=20 → 200`.
- **Live forwarding (the non-vacuous proof):** selecting «Admin User» fired
  `GET /api/v1/invoices-in?limit=100&sortBy=moment&sortDir=desc&agentOwnerId=1519595d-…
  → 200` — the picked id reached the live API as `agentOwnerId`, not just a
  guard-locked source string.
- **UZ:** switched the native `<select>` to uz → `lang=uz`; «Kontragent egasi» renders
  between «Shartnoma» and «Tashkilot» (§4 order); no RU leak.
- **Absences:** «Общий доступ» / «Кто изменил» absent in BOTH RU and UZ.
- **Console clean** (only favicon 404).

## Known-equivalent caveat (consistent with siblings)

`SavedFiltersPills` round-trip (`filterFromQueryString`) decodes only the base
`FilterDrawerValues` → an `agentOwnerId` pill is not re-hydrated from a shared URL.
This is true of every FK picker on this page (agentGroupId / contractId / …) — it's a
sibling-wide behavior, not a regression introduced here.

## Next

Money-doc + purchase-doc filter conveyor «Владелец контрагента» + merge is now done
for payments-in/out · cash-in/out · supplies · **invoices-in**. Next:
**(A) invoices-out** — the SALES-side mirror (its own grounding: does InvoiceOut have
`shared`/`updatedById`? agentOwnerId=Counterparty.ownerId same). Then
**(B) «Тип» open-dropdown capture** · **(C) «Ожидание» in-transit** · **(D) vestigial
`stock_minor` DROP** · **(E) box (2/3) GROUNDING** · **(F) Phase-3 master-plan**. Each
capture-grounded, write-path grep FIRST.
