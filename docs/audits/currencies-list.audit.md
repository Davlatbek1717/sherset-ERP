# currencies — LIST parity audit (Cohort L11 · Settings-finance)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_4725376c-9cd`). Critic-vetted CLEAN; ground-truthed by Opus.
**Ground-truth (§4):** a currency capture EXISTS (`00-module/currency`) but is **CONTAMINATED** — `screenshots/01-default.png` = «Корзина» trash list + a "Сохранение изменений" modal; `04-default.png` = an «Входящий платёж» form. Neither shows the «Валюты» list → treated as NO usable capture: sibling-parity ONLY, no label churn, no GROUNDING entry. This is the L8 lesson restated (`<title>`/sidebar match ≠ clean — read the BODY).
**Shape:** BESPOKE `<table>` (NOT `ListView`) — inline-CRUD with add-form + per-row rate edit + archive/restore/delete + a wired «Изменить ▾» bulk dropdown. Sibling = `settings/exchange-rates` (other bespoke-table finance page) / `settings/price-types` (inline-CRUD feature-source).

## A. Structural / columns + i18n — CLEAN
- Columns code/name(+archived badge)/rate/type/flags(default/system/indirect badges) + per-row actions; all strings via `t('pages.currencies.*')`/`tCommon()` — no hardcoded leak. `1/x` indirect badge is math notation, not translatable text.
- **`rate` is an EXCHANGE RATE (decimal string), NOT money-minor** → raw display correct; `formatMoney` legitimately N/A (refuted).

## B. Interactive / inline-CRUD chrome — CLEAN (no silent failure)
- `createMut`/`patchMut`(rate)/`archiveMut`/`deleteMut` all have `onError → setError(e.message)` — no silent failure. Rate edit is gated by `rateLocked` (default || AUTO) so AUTO/base rows can't submit a manual rate.
- Bulk dropdown (`CurrencyBulkActionsDropdown`) wired to `/currencies/bulk-{delete,archive,restore}`; «Массовое редактирование» is an intentional disabled label-parity placeholder (documented — our Currency model lacks the Доступ block moysklad's mass-edit touches).

## DEFER / Phase-2
- `code`/`isoCode` are free-text 3-char uppercase inputs (no ISO-set validation) — consistent with the sibling; not churned. Add-form / rate-edit / archive / delete round-trip browser-smoke = Phase-2.

## Gates
typecheck 0 (web) · biome 0 · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · web Vitest 1361 (0 regress). No code change on this page (audit-only).
