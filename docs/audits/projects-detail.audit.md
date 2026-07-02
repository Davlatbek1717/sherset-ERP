# settings/projects/[id] — detail page parity audit

Audited 2026-06-01. Catalog-card detail (Проект, Настройки → Справочники → Проекты).
Third catalog-card detail after counterparties + products. Mirror create page:
`settings/projects/new`. Reference = live `--detail` capture
(`docs/moysklad-reference/projects/detail/`: edit-default.html 76KB + edit-default.png +
edit-dropdown-izmenit menu dump). Method: `pnpm capture-moysklad projects --detail` →
3-dimension `wf-projects-detail-audit.js` fact-gather (fields / actions / i18n-sweep) →
Opus judged.

## Verdict

A SIMPLE single-section catalog card: moysklad's project form is exactly THREE fields
(«Наименование» required · «Код» · «Описание»). The three field labels already matched
char-for-char. Two real, high-value deltas were found and fixed:

1. **Extra «Внешний код» field** — moysklad's project card has no external-code input
   (grep "Внешн" in edit-default.html = empty); ours rendered one on both `[id]` and
   `new`. Removed from both → exact 3-field parity.
2. **🔴 SYSTEMIC i18n leak in the shared `<EditForm/>` pattern** — its prop defaults are
   Uzbek (`saveLabel='Saqlash'`, `cancelLabel='Bekor qilish'`, Alert `title="Xato"`).
   Both project pages render `<EditForm/>` without passing labels, so the RU UI showed
   Uzbek Save/Close/Error. moysklad = «Сохранить» / «Закрыть» / (RU error). Fixed via a
   new `useEditFormLabels()` hook (spread into both pages) + a new `errorTitle` prop on
   EditForm + `common.error_title` i18n key. **This leak affects ~35 EditForm pages — the
   remaining 33 are fixed in a dedicated systemic sweep (see "Next / systemic sweep").**

Browser-smoke NOT done (pure i18n/label/field-removal change; full web suite green).

## A. Structural

| Item | moysklad | ours (resolved RU) | status | sev | action |
|---|---|---|---|---|---|
| Field «Наименование» (required) | Наименование | Наименование (pages.projects.col_name, required) | match | — | — |
| Field «Код» | Код | Код (col_code) | match | — | — |
| Field «Описание» | Описание | Описание (col_description) | match | — | — |
| Field «Внешний код» | — (absent) | Внешний код (external_code) | extra_in_ours | high | **FIXED — removed from [id] + new** |
| Field layout | 3 stacked fields | was name + [code\|externalCode grid] + desc | delta | low | **FIXED — code now full-width stacked** |
| Section header above fields | — (none) | «Основное» (form.section_main FormSection) | delta | low | DEFER — cosmetic grouping; FormSection is the shared layout wrapper |
| Page title heading | — (name input IS the title) | «Редактировать проект» (EditForm title) | delta | low | DEFER — generic EditForm chrome model (all settings pages) |
| Status badge (active) | — (no active badge) | «Активен» Badge | extra_in_ours | low | DEFER — harmless affordance, consistent across our detail pages |
| Archived banner | «Проект находится в архиве» | «В архиве» Badge | delta | low | DEFER — different affordance (banner vs badge) |
| Breadcrumb | not visible in capture | «Проекты» › name | uncertain | low | — (reference titleless toolbar; can't confirm) |

## B. Interactive

| Item | moysklad | ours (resolved RU) | status | sev | action |
|---|---|---|---|---|---|
| Save button | Сохранить | was «Saqlash» (EditForm uz default) | delta | high | **FIXED — useEditFormLabels → common.save «Сохранить»** |
| Close/Cancel button | Закрыть | was «Bekor qilish» (EditForm uz default) | delta | high | **FIXED — useEditFormLabels → common.close «Закрыть» (uz «Yopish»)** |
| Error Alert title | (RU inline) | was «Xato» (EditForm hardcoded) | delta | medium | **FIXED — errorTitle prop → common.error_title «Ошибка»** |
| «Удалить» | Удалить (in «Изменить» ▾) | Удалить (common.delete, standalone button) | delta | medium | label match; placement differs — DEFER (no «Изменить» dropdown in EditForm) |
| «Изменить» ▾ dropdown | Изменить ▾ {Удалить, Копировать} | — (standalone buttons) | missing_in_ours | medium | DEFER — EditForm has no «Изменить» grouping pattern |
| «Копировать» | Копировать (enabled) | — (absent) | missing_in_ours | medium | DEFER — no clone backend (project controller comment confirms; list dropdown = disabled placeholder) |
| «Поместить в архив» | Поместить в архив | «Поместить в архив» (common.archive) | match | — | **FIXED — backlog #9 closed `c2aa5722` (2026-06-01): common.archive RU «Архивировать»→«Поместить в архив» app-wide; this page renders `tCommon('archive')` @line 132 so the centralized fix applies** |
| Restore (archived) | Извлечь из архива | «Извлечь из архива» (common.restore) | match | — | **FIXED — same `c2aa5722` sweep: common.restore RU «Восстановить»→«Извлечь из архива»; page renders `tCommon('restore')` @line 123** |
| «Изменения» change-history widget | Изменения + author + timestamp | — | missing_in_ours | low | DEFER — CRM/history widget (same class as counterparties right-widget) |
| Help «?» icon | present | — | missing_in_ours | low | DEFER — cosmetic help affordance |
| «Задачи» / «Показатели» per-card row | unconfirmed (nav-menu matches only) | — | uncertain | low | — (not a verifiable card-level delta in this DOM) |

## Fixed this session (commit pending)

- **Removed the extra «Внешний код» field** from `settings/projects/[id]/page.tsx` and
  `settings/projects/new/page.tsx` (state + mutation body + FormField), and re-stacked
  «Код» full-width → exact moysklad 3-field card. Backend `Project.externalCode` column
  left intact (API-level field; just not shown on the card, matching moysklad).
- **`useEditFormLabels()` hook** (`apps/web/src/hooks/use-edit-form-labels.ts`) — returns
  `{saveLabel: common.save, cancelLabel: common.close, errorTitle: common.error_title}`;
  spread into both project pages. UZ save/error unchanged; UZ cancel intentionally
  «Bekor qilish»→«Yopish» to match moysklad «Закрыть».
- **`errorTitle?` prop on `<EditForm/>`** (`packages/design-system/src/patterns/EditForm.tsx`,
  default `'Xato'` keeps the existing component test green) → Alert title localizes.
- **`common.error_title`** added to ru.json («Ошибка») + uz.json («Xato»).

Gates: web typecheck 0 · ui typecheck 0 · biome clean (2 pre-existing class-sort warnings
in EditForm's unchanged SaveIcon/cancel-link lines, unrelated) · web 1214 pass / 1 skip
(no regress). Browser-smoke NOT done.

## Systemic sweep — ✅ DONE (same session, separate commit)

`<EditForm/>` Uzbek-default leak affected **35 pages** total (grepped). projects (2) fixed
here; the **33 remaining** EditForm pages were wired with `{...useEditFormLabels()}` via the
`wf-editform-i18n-sweep.js` workflow (33 edit→verify pipelines, 0 verify failures) — same
precedent as the PositionEditor i18n sweep. Pages: discounts, ecommerce/channels,
production/{boms,processes,stages}, settings/{bank-accounts,cash-desks,custom-entities,email,
expense-items,organizations,price-types,regions,stores,tax-rates,uoms}, tracking-codes (each
`new` + `[id]`, plus settings/email). Bonus: fixed 2 pre-existing `noGlobalIsNan` biome errors
in tax-rates (surfaced because the files re-entered lint scope). All 35 EditForm pages now
import + call + spread the hook (grep-verified). Gates: web typecheck 0 · biome clean
(4 pre-existing class-sort warnings) · web 1214 pass / 1 skip.

Out-of-scope leaks NOTED for later (agents flagged, NOT fixed — not EditForm labels):
hardcoded `label="Tavsif / Описание"` in expense-items new+[id]; hardcoded Uzbek validation
throw-messages in settings/email + stores/new ("Nom majburiy" etc.). Track as future i18n work.

## Deferred — shared / backend / chrome-model (rationale above)

Section header «Основное» · static page-title heading · «Изменить» ▾ grouping · «Копировать»
(no clone backend) · ~~archive/restore labels (backlog #9, shared common.archive/restore)~~ ✅ FIXED `c2aa5722` (2026-06-03 audit gap-close) ·
archived banner sentence · «Изменения» history widget · help icon · active-state badge.
None block parity of the core editable form, which is now char-for-char + 3-field exact.
