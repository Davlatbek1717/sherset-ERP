# Invoices-out list «Фильтр» parity — Phase-2 VERIFIED (2026-06-12, session 11r)

**Commit:** `daefec86`
**Status:** **Phase-2 VERIFIED** — BE live smoke 9/9 + browser RU/UZ + live forwarding (agentOwnerId + storeId both → GET 200, AND together).

SALES-side mirror of the money-doc filter conveyor (payments-in → payments-out →
cash-out → cash-in → supplies → invoices-in → **invoices-out**). Per the 11q
handoff requirement, **InvoiceOut was grounded INDEPENDENTLY** (per-model, not a
carbon copy of invoices-in) — column existence ≠ live, and the FE shape differs.

---

## §1 PREMISE — independent grounding of each field

`InvoiceOutFilterSchema` was already rich (~18 wired fields, the money-doc gold
standard). The one genuinely-live gap vs the moysklad §4 filter panel = **«Владелец
контрагента»** (agent owner employee). Two other capture labels are deliberately
absent (dead/no-column).

| moysklad field | our mapping | verdict | evidence |
|---|---|---|---|
| «Владелец контрагента» | `agentOwnerId` = `agent.ownerId` | **LIVE — added** | `Counterparty.ownerId` real column (`schema.prisma:1448`), written on CP create → narrows live |
| «Общий доступ» | `shared` | **DEAD → DEFER** | `InvoiceOut.shared` column EXISTS (model block line 55) but NEVER written — tight grep `\bshared\s*:` across the whole module = NONE; not a MassEditBase field → always default `false` |
| «Кто изменил» | `updatedById` | **NO COLUMN → DEFER** | InvoiceOut has only `ownerId` / `groupId`, no `updatedById` |

**§4 DOM-role grounding** (`03-module/invoiceout/dom/00-clean-default.html`): the
filter sidebar renders `<div class="gwt-Label" title="…">` field labels. The main
contiguous block is:

```
Контрагент → Группа контрагента → Договор → ВЛАДЕЛЕЦ КОНТРАГЕНТА → Организация →
Счёт организации → Статус → Проведено → Напечатано → Отправлено → Канал продаж →
Владелец-сотрудник → Владелец-отдел → Общий доступ → Когда изменен → Кто изменил → … → Сумма
```

→ «Владелец контрагента» sits between **Договор** and **Организация** (same order as
every money-doc sibling). Field-role, not banner (`title=` + `>label<`).

`agentOwnerId` is distinct from «Владелец-сотрудник» (`ownerId`, the invoice's OWN
owner) — the smoke leaves each doc's own `ownerId=null` so the filter is provably
the AGENT's owner.

---

## (1) «Владелец контрагента» → agentOwnerId

- **schema:** added `agentOwnerId: z.string().uuid().optional()` after `agentGroupId`.
- **FE:** new `InlineFilterPanel.Field` between Договор and Организация; `/employees`
  picker (reused, same reference as «Владелец-сотрудник»); `extFilter.agentOwnerId`
  forwarded via `paramsRecord.agentOwnerId`; `hasFilter` updated.
- **i18n:** `filters.agent_owner` reused (ru «Владелец контрагента» / uz «Kontragent
  egasi») — NO new key.

## (2) buildListWhere MERGE-fix

Previously a single un-merged spread `...(agentGroupId ? { agent: { groupId } } : {})`.
Adding `agentOwnerId` as a second `agent:{}` spread would collide on the `agent` key
(object-literal last-key-wins → one predicate silently dropped). Merged into one
`agentRelation = { agent: { ...groupId, ...ownerId } }` clause (the supplies /
invoices-in fix). The `search` OR's `agent:{name}` is a different level — no collision.

## (3) +1 minor — un-orphaned «Склад» picker (adversarial-QA find)

Lens B (full §4 panel enumeration vs FE controls) surfaced a real pre-existing gap:
the `/stores` picker dialog (`pickerOpen === 'store'`, writes `filterValues.storeId`)
existed but was **ORPHANED** — nothing called `setPickerOpen('store')`, so the §4
«Склад» filter field was unreachable from the UI (dead code + missing parity field).
The sibling invoices-in DOES render Склад. Fix: added the field + opener at the
**invoices-in-grounded position** (after Счёт организации, before Проект — the §4
position of Склад was ambiguous from the contaminated multi-doc capture, so the
directly-grounded purchase sibling was used as the parity baseline, per CLAUDE.md §4).
`storeId` was already in the schema + buildListWhere + paramsRecord — only the
field/opener were missing. Browser-proven `storeId` forwards live.

---

## Gate (all green)

- api typecheck 0 · web typecheck 0 · biome 0 errors (console.log warns in the smoke
  script are warn-level, same as every sibling smoke).
- **api Vitest 2889 (+1, 0 regress)** — invoice-out schema agentOwnerId independence test.
- **web Vitest 2182 (+9, 0 regress)** — `invoices-out-filter-fields.test.ts` (field
  render · i18n key · agentOwnerId forwarding non-vacuous · query-key · /employees
  picker · absence-lock for shared + updatedById · store-opener non-orphan).
- **live smoke 9/9** (`tools/scripts/verify-invoice-out-filter-smoke.mjs`): agentOwnerId
  narrows (ga, oa) · agentGroupId narrows (ga, gb) · MERGE G∩A → only ga · MERGE G∩B →
  only gb (real intersection, not overwrite) · agentOwnerId & state=posted → ∅ (ANDs
  with the scalar state clause, doesn't widen).

## Browser (Playwright, :3100 live)

- **RU**: Договор → **Владелец контрагента** → Организация · Счёт организации → **Склад**
  → Проект (field-order via DOM test-id order + rendered RU labels).
- **UZ**: **Kontragent egasi** · **Ombor** (same order).
- **Live forwarding**: opened the agent-owner picker → `GET /employees?search=&limit=20
  → 200` → selected «Admin User» → app sent `GET /invoices-out?…&agentOwnerId=1519595d-…
  → 200`. Then store picker → `/stores` → «Asosiy ombor» → `GET /invoices-out?…&storeId=
  26f77f5b-…&agentOwnerId=1519595d-… → 200` (both AND together). FE forwarding is LIVE,
  not just guard-locked.
- **Absences**: «Общий доступ» and «Кто изменил» render in NEITHER RU nor UZ.
- **Console**: only a pre-existing favicon 404 + Radix `DialogContent` a11y warnings
  (fire for any CatalogPicker, app-wide pre-existing) — none from this change.

> Note: `1519595d-5c88-4337-bba0-0385a4c2b1ed` is Admin User's employee UUID — the
> same `1519595d` the preflight false-positively flagged as a "missing git hash" in
> the 11q handoff (it was an agentOwnerId value in a captured network log, not a commit).

---

## ➡️ Next `davom et`

Money-doc filter conveyor is now done for both invoice sides. Candidates (each
capture-grounded, write-path grep FIRST):
- **(A)** «Тип» open-dropdown capture (products KIND_OPTIONS ground)
- **(B)** «Ожидание» in-transit (PO → Stock.inTransitQty)
- **(C)** vestigial `stock_minor` 3-column DROP
- **(D)** box (2/3) GROUNDING
- **(E)** Phase-3 master-plan

### Lesson
The «18→24» coverage gap is mostly DEAD/computed — write-path grep BEFORE wiring.
And adversarial panel-completeness (enumerate §4 vs FE controls) catches orphaned
pickers: the «Склад» dialog had been shipped but had no opener — invisible to
typecheck/lint/render-tests, a dead-code + missing-parity-field two-fer.
