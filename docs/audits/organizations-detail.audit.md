# settings/organizations — detail parity audit (Cohort L)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Reference:** moysklad capture `00-module/organization` (field grounding) + sibling settings EditForm CRUD (`settings/bank-accounts`, `settings/cash-desks`). Demoted bank-/account-specific fields organizations legitimately lacks.
**Pages:** `settings/organizations/[id]`, `settings/organizations/new`.

## A. Structural / field deltas

- Fields present & i18n'd via `pages.organizations`: name, legalTitle, companyType (ЮЛ/ИП/ФЛ), legalAddress, INN/OKONED/MFO (UZ reqs), email, phone, director, directorPosition, chiefAccountant, externalCode, payerVat. Sections: Основное / UZ реквизиты / Контакты / Руководство / Налоги.
- **§4 grounding note:** the `00-module/organization` capture DOM is **contaminated** (contains positions-grid/retail terms «Кол-во», «Ед. изм.», «На склад», «Смена», «Касса» — not org-form fields). Org field labels therefore CANNOT be reliably re-grounded from it → existing labels (standard moysklad terms) **kept unchanged**, not churned (§4: unreliable capture → don't guess).
- **FIXED — `throw new Error('Nom majburiy')` hardcoded Latin-uz** on BOTH `[id]:98` and `new:51` → `t('name_required')` (mirrors sibling `pages.region_admin.name_required`). Gate-invisible leak (no-hardcoded gate is Cyrillic-only).
- **FIXED — `new` example placeholders** (`'Mening kompaniyam'`, `'MChJ "Kompaniya"'`, `'Toshkent sh., ...'`, INN/email/phone) hardcoded → `pages.organizations.*_placeholder` keys (ru+uz).

## B. Interactive deltas

- Save → PATCH `/admin/organizations/:id` (edit) / POST (new); archive / restore / delete wired with `useDestructiveMutation` confirm. No FSM, no positions, no totals — correct for a settings entity (false-delta traps refuted by premise).
- payerVat default `true` on `/new` — acceptable default; not a parity bug.

## Gates
typecheck 0 · biome 0/0 · i18n-key-existence ru+uz ✓ · no-hardcoded (route now in DONE_ROUTES) ✓ · web Vitest 1306 green (no regress).
