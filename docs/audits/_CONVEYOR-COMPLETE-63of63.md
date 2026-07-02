# Detail-Audit Conveyor — COMPLETE (63/63, Phase-1) — Consolidation Report

**Date:** 2026-06-04 · **Scope:** all 63 moysklad-parity detail pages, cohorts A–L.
**Status (honest):** **Phase-1 — strukturaviy parity audit, runtime-tasdiqlanmagan. browser-smoke YO'Q for any page.**
This is NOT "production-ready" / "verified". It is structural parity + gate-green. Phase-2 (browser QA) is the next, separate effort.

---

## 1. What "Phase-1 complete" means

Every one of the 63 `*/[id]/page.tsx` detail surfaces (+ their `/new` twins where present) was put through the
cohort-dvigatel (`scripts/wf-cohort-detail-audit.js`): premise bias-immunization + reference auto-correction → per-page
sibling-parity diff → cohort completeness-critic (intrinsic/runtime bugs the diff can't see) → blind refute-default
verification of every candidate. Each **confirmed** delta was ground-truthed by me (DOM-role per CLAUDE.md §4, not
grep-count), fixed, and locked behind a gate. **No page was browser-smoke tested** — runtime correctness (the real
Save/transition/concurrency behaviour) is Phase-2.

Gate on every unit: `typecheck 0 · biome 0/0 · i18n-key-existence ru+uz · i18n-no-hardcoded · label-grounding · web Vitest (no regress)`.

## 2. Cohorts (A → L)

| Cohort | Family | Reached | Headline finds |
|---|---|---|---|
| A | docs/seed (retrofitted) | 21/63 | conveyor + anti-confab process established |
| B | stock + internal | 25/63 | internal-orders money-format / external-code / Latin-uz leaks |
| C | production-config | 29/63 | **auditEntity slug≠service → empty History** (bug-class); stages UUID→name |
| D | money / returns | 32/63 | **retail-split `null`→400 (every wholesale Save)**; refund-currency over-refund; remaining-to-return net |
| E | retail | 34/63 | **hardcoded Latin-uz leak (gate-invisible)**; drawer comment; Money.fromMajor |
| F | catalog items | 38/63 | **products `api.put`→404 (reference page never self-audited)**; auditEntity; variant buy-price label |
| G | CRM | 42/63 | **opportunities contact-person WIPE-on-load**; **tasks Edit→DUPLICATE**; opportunities slug |
| H | e-commerce / pricing | 46/63 | channels settings-guard + external-clearing; orders formatMoney; price-lists i18n |
| I | HR | 48/63 | payroll currency-threading; employee role-aria i18n |
| J | analytics | 51/63 | **money float bug-class (`Number(minor)/100`+«so'm»→formatMoney)**; state-label; UTC-date |
| K | settings-finance | 56/63 | bank-accounts/cash-desks Latin-uz leak → i18n |
| L | settings-org | **63/63** | **publications + label-templates whole-page Latin-uz (ZERO useTranslations)**; silent-failure mutations; doc-type label parity; a11y |

## 3. Bug-classes discovered — and the guard that now prevents each

1. **auditEntity slug ≠ backend service entity → permanently-empty History.** (C/F/G) — fixed per-page; slug rule documented.
2. **doc-date silently discarded on `/new` (moment field).** (payments) — source-scan guard test.
3. **totals VAT double-count** (`vatIncluded` default) across 9 pages — shared `docTotals` helper + test.
4. **`clone()` dropping a FK → advance-allocation data-loss.** — regression tests.
5. **Reference page never self-audited** → `products` `api.put` vs `@Patch`-only controller = every Save 404. — `catalog-api-method.test.ts` source-scan guard. **Lesson: ground-truth the reference page too.**
6. **Hardcoded Uzbek-LATIN i18n leak** — invisible because `i18n-no-hardcoded` is Cyrillic-only. Swept cohort-by-cohort; locked via the `DONE_ROUTES` registry (now incl. all settings-org routes). Cohort L was the worst case: 4 whole pages with zero `useTranslations`.
7. **Label-grounding: grep-count ≠ DOM-role.** (the "did quality drop 1%?" find) — `label-grounding.test.ts` (GROUNDING-LOCK + REGRESSION-LOCK), CLAUDE.md §4 discipline, re-runnable `wf-label-grounding-audit.js`.
8. **Money float** (`Number(minor)/100`) → drift — `formatMoney` (BigInt-safe).
9. **Silent-failure mutations** (no `onError` → swallowed errors). (L) — `setError` wired.
10. **Capture contamination** (a captured DOM containing another page's grid terms) — §4: unreliable capture → don't churn labels; use products-reference or DEFER.

## 4. Process artifacts created

- `scripts/wf-cohort-detail-audit.js` — the cohort-dvigatel (premise → diff → critic → blind-verify, self-vetting).
- `scripts/wf-label-grounding-audit.js` — re-runnable DOM-role label re-audit.
- `apps/web/src/__tests__/label-grounding.test.ts`, `catalog-api-method.test.ts`, doc-date + docTotals guards.
- CLAUDE.md §1 (two-phase audit protocol) + §4 (label-grounding discipline).
- `docs/audits/*-detail.audit.md` — 63 audit docs; `docs/progress.json` = 63/63.

## 5. Phase-2 QA backlog (NOT done — the honest debt)

- **Browser-smoke for all 63 pages** — real Save/edit/transition/concurrency in a live browser (the "browser-smoke YO'Q" debt on every unit).
- **Adversarial QA per cohort** — concurrency / timeout / data-integrity (Decimal vs float) / edge (null/unicode/overflow) / authorization (role matrix), per global CLAUDE.md.
- **BE auditLog-write feature** — money-docs, variants, online-orders, price-lists write 0 `auditLog` → History tabs empty (needs `userId` threading + `auditLog.create`).
- **users/[id] edit + role assignment** — backend endpoints missing (GET `/admin/employees/:id`, GET `/admin/roles`, POST roles, PATCH, archive/restore).
- Misc deferred: opportunities reopen-control, tasks/analytics shared date helper, bank-account missing fields, currency-change guard, tax-rate 409-map, hr/employees permissions+salary subroutes.

**Bottom line:** structural parity is complete and gate-protected across all 63 pages. Runtime correctness is the remaining
work, and it is genuinely remaining — Phase-2, by cohort, in a live browser.
