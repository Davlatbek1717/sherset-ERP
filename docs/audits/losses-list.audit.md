# losses — LIST parity audit (Cohort L4)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_a606f369-20b`). **Ground-truth (§4):** capture `06-module/loss/dom-default.html` SORTABLE grid header row (DOM-role, read myself): `№ · Время · Со склада · Организация · Сумма · Отправлено · Напечатано · Комментарий` — Списание = write-OFF, so SOURCE store «Со склада» only, NO «На склад», NO counterparty.

## A. Structural / column deltas (FIXED)

- **date** `tFields('moment')` («Дата») → `tFields('time')` («Время») [cohort-wide bug-class].
- **money** `tFields('cost')` («Себестоимость») → `tFields('sum')` («Сумма») [grid header is «Сумма»; LossRow has only `sumMinor`=doc total, no unit cost].
- **store** `tFields('store')` («Склад») → `tFields('store_from')` («Со склада») — write-OFF source direction (DOM-role grid header «Со склада»).
- **positions** hardcoded `'Pos.'` → `tFields('positions_count')` («Позиции»).
- **«Организация» column added (MED)** — same omission as enters; `LossRow` carries organization and `loss.service` selects + sorts by it. Added default `organization` column + `'organization'` to defaults.
- **«Причина» removed from default-visible (MED)** — not a moysklad loss-grid column; removed from default-visible, kept the column def for the ⚙ gear.

Net default grid now: `№ · Время · Со склада · Организация · Сумма`.

## B. Interactive / data deltas (FIXED)

- **money cell currency** `'UZS'` → `r.currency` (+ `currency: string` on `LossRow`; BE returns it). Fixes CSV-export suffix for non-UZS rows; mirrors internal-orders.

## DEFER (Phase-2 / BE feature)

- 🟡 «Массовое редактирование» disabled (cohort-wide; needs BE endpoint + modal + keys).
- 🟡 Missing trailing «Отправлено»/«Напечатано»/«Комментарий» columns (BE-include).

## Gates
typecheck 0 · biome 0/0 · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding ✓ · web Vitest 1319 pass/1 skip (no regress).
