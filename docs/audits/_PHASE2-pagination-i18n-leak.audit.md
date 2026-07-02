# Phase-2 audit — list-pager i18n leak (design-system-default-leak bug-class)

**Date:** 2026-06-08 (`davom et`, local Opus, ultracode)
**Status:** ✅ Phase-1 structural + **component/unit-verified** (the guard test renders the
real `ListView` and asserts the moysklad-parity pager DOM; the provider-injection test
proves the localized labels flow through). **Browser-smoke owed** (Phase-2 RU/UZ footer
render) — added to QA-backlog. Honest label: this is a focused i18n/parity unit fix with a
render-level guard, not a full end-to-end browser pass.

## The bug-class

`packages/design-system/src/navigation/Pagination.tsx` is locale-agnostic (the `@moysklad/ui`
package has no i18n context), so its **defaults are hardcoded** — exactly the
design-system-default-leak class already fixed for `ModalLabelsProvider`,
`ConfirmDialog`, and `CatalogPicker`. Two leaks, in opposite directions, both gate-invisible
(the `i18n-no-hardcoded` gate scans only `apps/web` and only for Cyrillic):

1. **Default (text) pager → Latin-uz leaks into the RU UI.** The non-`moyskladStyle` branch
   renders hardcoded `«Jami: N ta yozuv … Oldingi / Keyingi»`. `ListView` selected this
   branch via `moyskladStyle={moyskladToolbar}`, so every list page that does **not** opt
   into the moysklad toolbar (~9–19 pages: settings/users, settings/webhooks, retail/sales,
   ecommerce/*, settings/{stores,mxik,cash-desks,bank-accounts,price-types}, …) showed
   Latin-uz pagination even in Russian. (Found by the 2026-06-08d browser-QA session.)
2. **`moyskladStyle` range connector → Russian leaks into the UZ UI.** The icon-only branch
   hardcoded `ofLabel = 'из'`, and `ListView` never passed `ofLabel`, so all ~57 toolbar
   pages rendered the Russian «из» connector («1-100 из 27 338») even in the Uzbek UI. The
   icon buttons' `aria-label`s were English ("first/prev/next/last") on every page.

## §4 grounding — moysklad pagination is icon-only

Capture `00-module/currency/dom/00-clean-default.html`:

```
<td class="pages"><div class="gwt-HTML">1-1 из 0</div></td>
<td class="next-page"><img …></td>     ← image button, NOT text
```

`b-paginator` / `footer-pager-wrap`, **zero** «Предыдущая/Следующая» text. So moysklad
renders pagination as icon buttons + an «N-N из total» range — exactly the `moyskladStyle`
path. The default text pager («Oldingi/Keyingi») was therefore **both a parity gap and an
i18n leak**, which is why the right fix is to converge every list on `moyskladStyle`.

## Fix

- **`Pagination.tsx`** — added `PaginationLabels` + `PaginationLabelsProvider`
  (mirrors `ModalLabelsProvider`). The `moyskladStyle` branch resolves the connector and the
  four icon-button `aria-label`s as **`prop ?? context ?? hard-fallback`**. Dropped the
  `ofLabel = 'из'` destructuring default (it shadowed the context); the hard fallback stays
  «из» + English aria so standalone/test renders are unchanged.
- **`ListView.tsx`** — `moyskladStyle={moyskladToolbar}` → always `moyskladStyle`. Every list
  now renders the icon-only moysklad pager; the Latin-uz text pager is gone app-wide.
  (`onFirst`/`onLast` gating left tied to `moyskladToolbar` — minimal blast radius.)
- **`layout.tsx`** — mounts `<PaginationLabelsProvider>` with `getTranslations('pagination')`
  (`of/first/previous/next/last`), beside the existing label providers.
- **i18n** — new `pagination` namespace: ru `из / Первая страница / Предыдущая страница /
  Следующая страница / Последняя страница`; uz `dan / Birinchi sahifa / Oldingi sahifa /
  Keyingi sahifa / Oxirgi sahifa`.

## Guard test (`navigation-from-ui.test.tsx`, +7)

- provider injects the uz connector «dan» (not «из») into the range;
- provider injects localized aria onto the icon buttons (English defaults gone);
- explicit `ofLabel` prop still wins over the provider;
- no-provider standalone still falls back to «из» + English aria (parity with old tests);
- **`ListView` renders the «1-N из total» range and NOT the `«Jami:»`/`«Oldingi sahifa»`
  text pager** (the real leak-fix proof);
- regression locks: `ListView.tsx` must not re-couple `moyskladStyle={moyskladToolbar}`;
  the `pagination` i18n keys exist in both locales with no cross-locale leak (ru.of=«из»,
  uz.of≠«из», uz aria not Cyrillic).

## Gate

tc0 (web + design-system) · biome (changed files auto-formatted; remaining 2 = pre-existing
`useSortedClasses` *warn*) · **web Vitest 1439 (+7, 0 regress)** · api untouched.

## Residual / owed

- **Browser-smoke (Phase-2):** load a list in RU then UZ, confirm the footer reads
  «1-N из total» (ru) / «1-N dan total» (uz) with icon-only buttons. Owed.
- The default (text) `Pagination` branch stays in the component for reusability (now
  app-dead, test-locked); it was left byte-stable rather than deleted.
- `onLast` semantics for cursor pagination remain "one page forward" (pre-existing, shared
  with the 57 toolbar pages) — not touched here.
