# settings/uoms/[id] — detail page parity audit

Audited 2026-06-01. System-catalog detail (Единица измерения, Настройки → Справочники →
Единицы измерения). 5th catalog card. Reference = live `--detail` capture
(`docs/moysklad-reference/uoms/detail/`, route `#uom`). Method:
`pnpm capture-moysklad uoms --detail` → direct Opus judgment (3-field card, no workflow needed).

## Verdict
moysklad's uom card has exactly THREE fields: **«Полное наименование» · «Краткое наименование» ·
«Цифровой код»** — and NO «Описание». Our model conflates this into a single `name` + `code` +
an extra `description`. **2 clean fixes applied**: removed the extra «Описание» (list + edit + new;
moysklad's uom has none) and relabeled `col_code` «Код» → «Цифровой код» (confirmed: our code IS
the numeric OKEI code — the new-form placeholder is "796" = шт). The core delta — moysklad's
**full-name / short-name split** — is a DATA-MODEL gap (backend): our single `name` holds the SHORT
name (placeholder examples «шт, кг, л»), and we have no «Полное наименование» field. Deferred to a
backend uom-parity task. Browser-smoke NOT done.

## A. Structural
| Item | moysklad | ours (resolved RU) | status | sev | action |
|---|---|---|---|---|---|
| «Полное наименование» (full name) | Полное наименование | — (we only have short `name`) | missing_in_ours | high | DEFER — backend: add fullName field (data-model gap) |
| «Краткое наименование» (short name) | Краткое наименование | `name` labeled «Название» | delta | medium | DEFER — our single `name` IS the short name (placeholder «шт, кг, л»); correct fix = split + relabel «Краткое наименование» alongside a new «Полное наименование». Relabeling now (without the full-name field) would mislead → tied to the backend split. |
| «Цифровой код» (numeric code) | Цифровой код | was «Код» | delta | medium | **FIXED → «Цифровой код»** (ru) / «Raqamli kod» (uz). Confirmed numeric: new-form code placeholder = "796" (OKEI). |
| «Описание» field | — (absent) | «Описание» (Input + list column) | extra_in_ours | medium | **FIXED — removed from list + edit + new** (backend column kept; moysklad uom has no description) |
| Field layout | 3 stacked fields | name+code 2-col grid | delta | low | DEFER — re-stack after the name-split |
| Page title | — (titleless; name inline) | «Редактирование единицы измерения» | delta | low | DEFER — generic EditForm chrome model |

## B. Interactive
| Item | moysklad | ours (resolved RU) | status | sev | action |
|---|---|---|---|---|---|
| Save / Close | Сохранить / Закрыть | Сохранить / Закрыть (useEditFormLabels) | match | — | ✓ (fixed in `bb604bf8`) |
| Delete action | «Удалить единицу измерения» (entity-specific) | «Удалить» (common.delete) + confirm «Удалить "{name}"?» | delta | low | DEFER — moysklad uses an entity-specific delete label; ours is the shared generic. Low priority. |
| «Изменить» ▾ dropdown | (capture timed out — uom toolbar may lack the «Изменить» grouping) | standalone Delete button | uncertain | low | — (dropdown capture timed out; not confirmed) |
| «Изменения» / «Показатели» | present (toolbar) | — | missing_in_ours | low | DEFER — history/metrics widgets |
| i18n-sweep | n/a | all labels via t()/tCommon/tForm | match | — | clean (no hardcoded leaks; uom pages were already i18n'd) |

## Fixed this session (commit pending)
- **Removed the extra «Описание»** from `settings/uoms/[id]`, `settings/uoms/new`, and the
  `settings/uoms` LIST column (state + mutation body + FormField + list column). Backend `Uom.description`
  column kept (API-level). moysklad's uom card/model has no description.
- **`pages.uom_admin.col_code` «Код» → «Цифровой код»** (ru) / «Kod» → «Raqamli kod» (uz). Confirmed our
  code is the numeric OKEI code (new-form placeholder "796").

Gates: web typecheck 0 · biome clean · web tests (run before commit). Browser-smoke NOT done.

## DEFER — backend data-model task (the core uom parity gap)
moysklad uom = **{Полное наименование, Краткое наименование, Цифровой код}**. Our model = `{name (=short),
code (=numeric), description (removed), externalCode, shared}`. To reach true 1:1 the backend needs a
`fullName` field (and the UI a «Полное наименование» input + «Краткое наименование» relabel of the current
`name`). This is a coordinated Prisma + service + DTO + UI change; deferred as a dedicated uom-parity task.
Also DEFER: entity-specific delete label «Удалить единицу измерения», history/metrics toolbar widgets,
field re-stacking. None block the two label/extra fixes shipped here.
