# /enters (Оприходование) module — adversarial QA findings (2026-06-21)

> Source: `enter-module-adversarial-qa` workflow (`wf_2dbf3e03-8cd`, 31 agents,
> 6 finder dimensions × refute-default verify). 25 raw → **24 CONFIRMED · 1 REFUTED**.
> Each finding was read first-hand by a verifier; the operator (Opus) cross-checked
> the HIGHs against the code + the moysklad API doc `_enter.md`.
>
> **Status discipline:** these are *correctness/security/parity* findings, distinct
> from the *visual 1:1* work (list columns/filter/footer — DONE this session). HIGH
> enter-specific items are the next fix targets; family-wide items need a coordinated
> (not enter-only) fix and are flagged as such to avoid inconsistent partial patches.

## HIGH (5)

1. **cross-tenant assortmentId/productId** (family-wide) — `enter.service.ts` create/update
   write `positions.assortmentId`/`productId` with NO `accountId` check; `ensureRefs` only
   validates org+store. The `productId` FK is existence-only (global `Product.id`), so a
   tenant-B product UUID persists → cross-tenant stock/cost write + data leak on GET. Fix:
   `ensureAssortmentsInTenant` (mirror `customer-order.service.ts:1687`). **Family-wide**
   (supply has the same gap — finding #3) → fix as a shared helper across supply/move/enter.
2. **cross-tenant projectId** (family-wide) — create writes `projectId` verbatim; update
   `project: { connect }` with no account scope. `ensureRefs` omits project. Fix: validate
   projectId in-tenant (mirror customer-order `ensureOptionalRefs`).
3. **supply.ensureRefs has the SAME gap** (family-wide) — confirms #1/#2 are a family pattern,
   not enter-specific. The "gold-standard" sibling is itself unguarded.
4. **update() can edit an already-posted Enter** (ENTER-SPECIFIC, concurrency/data-integrity) —
   `update()` checks `existing.applicable` on a STALE pre-tx snapshot; the in-tx WHERE filters
   only `version`, and `post()` (`enter.service.ts:469-477`) sets state/applicable/postedAt/
   sumMinor **without `version: { increment }`**. So a concurrent post between the guard and the
   tx is invisible to the optimistic lock → positions of a posted doc get deleted+recreated while
   stock/sumMinor are already applied → corrupt ledger. Fix: bump `version` in post()/unpost()/
   cancel() header writes, OR add `applicable:false` to the update tx-WHERE.
5. **«Причина» modeled as a document-level enum** (ENTER-SPECIFIC, data-model parity) — our
   `reason` is a required doc-level enum {initial,found,gift,correction,other}. moysklad's
   `_enter.md`: there is NO document-level reason; `reason` is a **per-position `String(255)`**
   («Причина оприходования данной позиции»). Fix = migration (Enter.reason → EnterPosition.reason
   String) + service + create/detail forms + drop the `reasons.enter` enum i18n. **Own flagship.**

## MED (8)

- **unpost()/cancel() reverse stock with no consumption guard** (enter-specific) — goods entered
  then consumed by a Demand can be silently un-entered → negative on-hand. Sibling Supply blocks
  this; Enter doesn't.
- **overhead distribution `QUANTITY` is invented** (family-wide) — moysklad enter overhead =
  only `[weight, volume, price]`. Drop QUANTITY from `EnterOverheadDistributionSchema` + FE select.
- **owner/group/shared («Владелец»/«Отдел»/«Общий доступ») not settable** on create/detail —
  owner auto-stamped to actor; shared/group never exposed. moysklad lets you set «Доступ».
- **FE /new forces cost > 0** (enter-specific) — blocks valid zero-cost Оприходование
  (found/gift). BE + moysklad allow 0. `enters/new/page.tsx:232`.
- **`applicable` («Проведено») dropped on create** (family-wide) — CreateEnterSchema has no
  `applicable`, so Zod strips it; doc always created draft. moysklad default-checks «Проведено»
  and creates the doc POSTED. Needs BE: accept applicable → post-on-create.
- **project picker on /new is unscoped** (defense-in-depth for #2).
- **hardcoded exception strings** in enter.service.ts (family-wide i18n) — transliterated RU/UZ.
- **position assortment never tenant-validated** (dup of #1, FE-reachable).

## LOW (11) — latent / cosmetic

- ~~list has no «Итого» footer~~ — **FIXED this session** (`71ed06a2`: aggregateTotals + footerRow).
- `/new` grand total via JS float `Number(BigInt)/100` (should be BigInt) — `new/page.tsx:189,470`.
- `post()` ignores `rateValue` (no toBaseMinor) — latent, UZS-only today.
- `cancel()` runs Read-Committed while reversing stock (post/unpost use Serializable) — inconsistent.
- positions drop moysklad per-position «Страна»/«ГТД» (Supply models them) — parity gap.
- `code`/`syncId` columns never accepted/returned — partial field coverage.
- list `page.tsx` not in i18n-no-hardcoded gate; hardcoded «сум» literal (mirrors moves).
- user-entered doc number (`name`) on /new silently discarded (auto-generated).
- detail `/[id]` save coerces quantity via JS `Number` (precision >15 digits) — `[id]:237`.
- `overheadCurrency` accepted but unused in cost math.

## Visual-parity gaps (from live grounding — separate track, see PAGE-1TO1-PLAYBOOK.md §D)

LIST = DONE 1:1 (columns · filter panel · footer). CREATE/DETAIL remaining:
- «Валюта документа» field (moysklad shows «сум (UZS)» with ✎) — we don't render it.
- doc-level «Причина» dropdown should be REMOVED (→ per-position column, HIGH #5).
- position table: moysklad shows Наименование▾ · Кол-во · Ячейка · Остаток · Цена▾ · Сумма ·
  Причина оприходования · ГТД · РНПТ · Страна (verify default vs ⚙-optional set).
- meta layout label-LEFT + ✎ edit-pencils + Проект «+»; «Проведено» default-checked;
  toolbar Изменить/Печать/Отправить dropdowns; «Накладные расходы … Распределить по цене» link.
