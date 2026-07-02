# Cash-in list «Фильтр» parity — «Владелец контрагента» + merge-fix (2026-06-12)

**Status: Phase-2 (BE runtime-verified) — browser render NOT live-pixel-verified.**
Sibling of cash-out (11n) / payments-out (11m) / payments-in (11l). Continues
backlog **(A) filter-field parity** — the money-doc filter conveyor
(payments-in → payments-out → cash-out → **cash-in**).

Commit: (see git log). Doc companion to the BE/web guards + runtime smoke.

---

## §1 Premise — grounded, NOT assumed

The 11n hand-off predicted: "cash-in (приходный ордер) has NO «Статья расходов»
(no expense item) — check the cashin capture; if «Владелец контрагента» is its
only gap, mirror just that." Grounded all three claims before touching code:

1. **§4 DOM-role (not grep-count).** `07-module/cashin/dom/00-clean-default.html`
   renders the filter labels as `<div class="gwt-Label" title="…">`. The cashin
   panel order is `… Контрагент · Группа контрагента · Договор · **Владелец
   контрагента** · Организация · …` — i.e. «Владелец контрагента» sits between
   «Договор» and «Организация», identical to cash-out. Confirmed present as a
   field label, exactly one gap vs our FE.
2. **Write-path grep FIRST.** The existing `CashInFilterSchema` was already rich
   (agentGroupId, organizationId, cashDeskId, contractId, projectId,
   salesChannelId, groupId, ownerId, paymentPurpose, applicable, momentFrom/To,
   updatedFrom/To, sumMinorFrom/To) and `buildListWhere` already wired every one.
   The **only** absent field matching the capture was `agentOwnerId`.
3. **Backing column exists.** `Counterparty.ownerId` is a real column
   (`schema.prisma:215`), written on create — so `agent: { ownerId }` is a LIVE
   filter, not a dead 11h control. (Contrast: cash-out's «Статья расходов» was a
   dead column needing a write-path; cash-in has nothing analogous.)

**Two deliberate absences** (an income doc, ПКО — diverges from the cash-out
mirror; the web guard locks both so a future "just mirror cash-out" edit can't
reintroduce them):

- **«Статья расходов» (expenseItem)** — exists only on the money-OUT docs
  (CashOut / PaymentOut). CashIn has no `expenseItem` column; a filter or
  doc-form picker for it would be dead. (The cash-out 11n distinguishing fix —
  making `expenseItem` live — has NO cash-in analogue.)
- **«Счёт организации» (organizationAccountId)** — cash docs use «Касса», a cash
  desk, not a bank account. CashIn has no `organizationAccountId` column.

`CashInFilterSchema` already documented these skips in a NOTE; the comment was
extended for `agentOwnerId`.

---

## What shipped

1. **«Владелец контрагента» → `agentOwnerId`** = `agent.ownerId` (the
   counterparty's owner EMPLOYEE) — distinct from `ownerId` («Владелец-
   сотрудник» = the cash order's own owner). Added to `CashInFilterSchema`
   (uuid, optional) + a new `agent: { ownerId }` predicate in `buildListWhere`.
   FE: an `/employees` picker control inserted between «Договор» and
   «Организация» (§4 order) + forwarded into `paramsRecord`.

2. **`buildListWhere` MERGE-fix (proactive).** Before, the only `agent` predicate
   was `agentGroupId → { agent: { groupId } }` (one clause, no merge needed).
   Adding `agentOwnerId` as a *second* `agent: {}` spread would silently overwrite
   under object-literal last-key-wins — dropping one predicate. Merged both into
   ONE clause:
   ```ts
   ...(filter.agentGroupId || filter.agentOwnerId
     ? { agent: { ...(agentGroupId ? { groupId } : {}), ...(agentOwnerId ? { ownerId } : {}) } }
     : {}),
   ```
   (Mirror of cash-out / payments-out.)

3. **i18n** — reused existing `filters.agent_owner` (ru «Владелец контрагента» /
   uz «Kontragent egasi»). No new keys.

---

## Verification (Phase-2 — BE + buildListWhere runtime-verified)

- **api tc 0 · web tc 0 · biome 0** (5 source files; the smoke script carries the
  usual 2 `noConsoleLog` warnings — CLI-script exemption).
- **api Vitest 2886 (+2, 0 regress)** — `cash-in.schema.test.ts`: agentOwnerId
  accepted as uuid + non-uuid rejected.
- **web Vitest 2157 (+8, 0 regress)** — new `cash-in-filter-fields.test.ts`:
  renders `filter-agent-owner` + i18n key · **absence locks** (no expenseItem,
  no organizationAccountId/filter-org-account) · no-regression of the 15
  pre-existing controls · forwarding anchored on the `paramsRecord.agentOwnerId =
  extFilter.agentOwnerId` assignment (non-vacuous) · query-key includes extFilter
  · picker fetches `/employees`.
- **runtime 10/10** (`tools/scripts/verify-cash-in-filter-smoke.mjs`, live dev API
  + self-returning DB probe):
  1. `agentOwnerId=A` → {ga, oa} (the rows whose AGENT is owned by A)
  2. `agentGroupId=G` → {ga, gb} (pre-existing clause still works post-merge)
  3. **MERGE:** `agentGroupId=G & agentOwnerId=A` → {ga} only (AND, not overwrite)
  4. **MERGE-2:** `agentGroupId=G & agentOwnerId=B` → {gb} only (distinct
     intersection — proves a real AND, not last-key-wins)
  5. `agentOwnerId=A & state=posted` → ∅ (test docs are draft — the agent clause
     ANDs with the top-level scalar, doesn't widen).
  Every query also carried `search=TOKEN`, so checks incidentally prove the new
  `agent:{}` clause coexists with the `search` OR clause (different keys).

**Honest caveat:** Browser render NOT live-pixel-verified (Playwright MCP not
connected). FE control is source-locked (web guard) + i18n resolves to the
§4-grounded RU/UZ strings + the BE narrowing is runtime-proven. Like 11m/11n.

---

## Next

- **supplies / invoices** filter-parity (~18 → 24/25), capture-grounded, grep
  write-paths FIRST (most of the coverage-map gap is dead/computed fields).
- The money-doc filter conveyor (payments-in/out, cash-in/out) is now COMPLETE
  for the «Владелец контрагента» + merge-fix pattern. cash-in carried no
  «Статья расходов» analogue (income doc), so no dead-column make-live here.

**Lesson re-confirmed:** a sibling is not a carbon copy — the cash-out 11n
distinguishing fix (dead expenseItem → live) had NO cash-in counterpart; grep
the schema/write-path to learn which fields are real, dead, or absent before
mirroring. Here the premise prediction held exactly: one live gap
(`agentOwnerId`), two deliberate absences locked by guard.
