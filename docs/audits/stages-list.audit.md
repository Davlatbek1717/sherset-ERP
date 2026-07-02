# production/stages — LIST parity audit (Cohort L5)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_68a1e798-7d2`, 41 agents, 25 confirmed cohort-wide).
**Ground-truth (§4):** **NO moysklad capture** for the «Этапы» list (no `stage` capture dir). Audited by catalog-sibling parity against `processes`/`boms` (premise demoted document lists to non-reference; archived inline filter + name/code/count/labor-cost catalog shape is legitimate).

## A. Structural / column deltas

- **No confirmed Phase-1 column/label deltas.** The engine raised no `stages` candidates that survived blind-verify; the page already mirrors the catalog-sibling chrome (ListView + archived inline filter, name/code/labor-cost/used-in/state columns). The `'№'`/date bug-classes do not apply (stages is a name/code catalog with no doc-number or doc-date cell). moysklad has no «Этапы» capture → no label churn per §4.

## B. Interactive / data deltas

- **No confirmed Phase-1 interactive deltas.** `onRefresh`, `createPosition="start"`, and `formatMoney` base-currency labor cost already match the catalog siblings; no bulk (BE has no mass-edit). Row selection + «Изменить» = DEFER (BE).

## DEFER (Phase-2 — documented)

- 🟡 **moysklad column set unconfirmed** — no «Этапы» capture exists; the current columns (Наименование/Код/«Оплата труда»/«В техпроцессах»/Статус) are sibling-derived. Re-capture the «Этапы» list in Phase-2 to confirm column order/labels; per CLAUDE.md §4 no label churn applied without DOM-role grounding.
- 🟡 **Row selection + «Изменить»** — likely present in moysklad (siblings show it); our list has none, BE has no mass-edit → Phase-2/BE.

## Gates
typecheck 0 · biome 0/0 (staged) · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding ✓ · web Vitest 1331 pass/1 skip (no regress).
