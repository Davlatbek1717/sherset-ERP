# Org-accounts inline editor — Adversarial QA (2026-06-21)

Workflow `wf_d62c11a8-415` (5 review lenses × refute-default verify, 20 agents).
Feature: organization settlement accounts («Расчётные счета») edited inline on the
org form; one «Сохранить» saves org + accounts atomically (`syncAccounts`).

## Confirmed findings (9)

### MEDIUM
1. **Delete guard misses ~20 FK references** (`organization.service.ts:188-203`).
   Delete blocks only on `balanceMinor!==0` OR a `MoneyOperation`. But ~20 tables
   reference `OrganizationAccount` with `onDelete: SetNull` (Demand, Supply,
   CustomerOrder, PurchaseOrder, PaymentIn/Out, Contract, RetailStore, …). A DRAFT
   doc stores `organizationAccountId` with NO MoneyOperation/balance → removing the
   card silently NULLs the doc's account binding (data loss, no error). Pre-existing
   (standalone delete shares it); inline replace-semantics widens the trigger.
   **FIX: archive (soft-delete) a removed EXISTING account instead of hard-deleting →
   preserves all FK bindings, no SetNull, recoverable in Bank hisoblari → Arxivda.**
2. **Per-account update has no optimistic-lock** (`:218-222`). Inline update omits
   `version` in the WHERE; the standalone endpoint guards it. Concurrent edit via the
   standalone bank-accounts page → org-save clobbers it (lost update of bank metadata
   + default flag). **FIX: thread `version` through the schema + WHERE; P2025→409.**
3. **Currency change orphans default + wrong BE tiebreak** (FE `editor.tsx:86-101,159` ;
   BE `:233-248`). Changing a default card's currency to collide with another default
   leaves TWO checked radios; BE normalize keeps oldest `createdAt`, not the user's
   pick. **FIX (FE): re-normalize one-default-per-currency on currency change.**
4. **Remove has no confirm; a guarded account blocks the whole org save**
   (`editor.tsx:103`). The coupling half is FIXED by #1 (archive never throws → the
   org save can't be blocked). The confirm half is intentionally NOT added: moysklad's
   ✕ on a «Расчётный счёт» card removes immediately (form-staged, persisted only on
   «Сохранить»), and with #1 the removal is now a recoverable ARCHIVE — so a confirm
   would diverge from moysklad for no safety gain. Matched moysklad.
5. **Save-error doesn't revert/refetch optimistic state** (`page.tsx:191-198`).
   Removed card stays gone in the UI on a non-conflict error. **MITIGATED by #1**
   (remove no longer throws); auto-refetch on error would discard the user's other
   edits, so kept standard "keep edits + show error" behavior. DEFER.

### LOW
6. **Add button no 50-cap** → raw EN Zod 400. **FIX: disable «+» at 50.**
7. **Whitespace-only name passes BE** (`schema.ts:29`, FE-only trim). Pre-existing
   pattern. **FIX: trim name server-side + reject blank.**
8. **Currency change → two checked radios** (FE half of #3). **FIX by #3.**
9. **Default radio can't be unset** (`editor.tsx:91-101`). Matches moysklad's radio
   UI; "no default" is rare + workaround exists. DEFER (debatable parity).

## Applied this commit
#1 (archive-on-remove), #2 (per-account version lock), #3/#8 (FE currency-default
normalize), #6 (add cap), #7 (server-side name trim).
#4 coupling fixed by #1; #4 confirm matched-to-moysklad (no confirm, recoverable archive).
Deferred (documented): #5 (standard keep-edits-on-error), #9 (radio matches moysklad).
