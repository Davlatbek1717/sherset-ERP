# Phase-2 browser QA — catalog cohort (products edit + bundles/services/variants)

**Session:** 2026-06-06e (`davom et`, local Opus, ultracode). **Status:** runtime-verified (real browser).
**Commit:** `c67c78e8`. **Stack:** web `:3100` · api `:4000` · db `moysklad_dev@:5433`. **Login:** Admin User.

Phase-2 QA of the catalog cohort owed smokes (NEXT.md QA-backlog → "Catalog items (4)" + the F-PUT
product-edit smoke). All six documented smokes browser-checked; **four real runtime bugs found and
fixed** — each invisible to typecheck / lint / unit tests and reproducible only in a live browser
(the Phase-1 structural conveyor never exercises them).

## Smokes — results

| Smoke | What | Result |
|---|---|---|
| **F-PUT** (HIGH) | edit a product + Save → succeeds | ✅ after BUG1 fix — method already PATCH (no 404); save was 400 |
| **F1** | edit bundle + service → History/Tarix shows rows | ✅ save 200 + History rows (`entity=Product`) after BUG1+BUG2 |
| **F2** | open a variant → buy-price labelled «Закупочная цена» | ✅ «Xarid narxi» / «Закупочная цена» (not «Создано») + variant null-field save 200 |
| **F3** | RU locale → all catalog pages render Russian | ✅ after BUG4 fix (3 /new headers); product/bundle/service/variant [id]+/new all RU |
| **F4** | malformed bundle price → localized error, not SyntaxError | ✅ «Faqat raqam», no POST, no SyntaxError (regex guard + BigInt) |
| **F5** | delete in RU → confirm dialog + toast Russian, no `window.confirm` | ✅ ConfirmDialog (DOM `role=dialog`) "Удалить …?" / "Это действие необратимо." / "Отмена"/"Удалить"; toast `common.deleted`="Удалено"; DELETE 200 |

## Bugs found + fixed

### BUG1 (HIGH) — edit save 400 on any empty optional field
**Repro:** open a seeded product (or service/bundle/variant), Save → `PATCH /products/:id` → **400**:
`article: Expected string, received null; description: …; country/productFolderId/supplierId/mxikCode:
Expected string, received null; weightG/volumeML: Expected number, received null; paymentItemType:
Expected enum, received null`.

**Root cause (bug-class):** the EDIT forms PATCH the full object and serialize an empty optional field
as explicit `null` to clear it; the CREATE forms omit empties (`undefined`). `UpdateProductSchema =
CreateProductSchema.partial()` and `UpdateVariantSchema = CreateVariantSchema.partial()` — `.partial()`
adds `.optional()` (accepts undefined) but **not** `.nullable()` (rejects null). So create worked and
**edit 400'd for every product/service/bundle (via `/products`) and variant (via `/variants`)** that
had an empty optional field. The previous session's `catalog-api-method.test.ts` guarded the method
(PUT→PATCH) but the real edit-save was never browser-tested.

**Fix (schema-only; backend already null-safe):** `.nullish()` on the editable optional fields in
`product.schema.ts` (code/externalCode/article/description/country/productFolderId/groupId/supplierId/
minPrice/buyPrice/weightG/volumeML/uom/taxSystem/paymentItemType/mxikCode/trackingType/gtin) and
`variant.schema.ts` (code/externalCode/barcode/buyPrice/minPrice/weightG/volumeML). The Prisma columns
are nullable; `product.repository.ts.update()` / `variant.service.ts.update()` already use
`if (x !== undefined) data.x = x` + relation `connect/disconnect`, so `null` flows straight through and
**clears** the field. `minimumBalanceMinor` (product) and `name` (variant) are **non-nullable** columns
→ kept `.optional()` (typecheck caught the over-widening; reverted those two).

**Browser:** product edit → 200 + persists (`name` round-trips, all-null optionals accepted); empty
required name blocked client-side ("Nomi majburiy", no network call); service/bundle/variant edit → 200;
variant clear `{code:null,barcode:null}` → 200.

### BUG2 — History (Tarix) tab stale after a save
**Repro:** edit + Save, then open the History tab → shows pre-edit data (or empty) until a full reload.
**Root cause:** the save mutation invalidated `['product', id]` / `['products']` but never
`['audit-logs', entity, entityId]`. The History query (`use-document-history.ts`) is mounted **eagerly**
by the detail tab strip (`document-tabs.tsx` / `detail-content-tabs.tsx`, not lazily), so a mounted
react-query observer never refetches on stale alone — only on invalidate/focus/reconnect.
**Fix:** `useApiMutation` + `useSaveMutation` now `qc.invalidateQueries({ queryKey: ['audit-logs'] })`
on success (the two in-place write wrappers; deletes navigate away so `useDestructiveMutation` is
unaffected). Invalidating a non-mounted audit query is a cheap no-op → safe for all ~100 call-sites.
**Browser:** after a save the new History row appears with **no reload** (product + service + bundle).

### BUG3 — Save on a /new page created the document TWICE
**Repro:** fill bundles/new, click Save **once** → **two** `POST /products` (201) → **two** bundles.
**Root cause:** the create pages wrap the body in `<form onSubmit={save}>` for Enter-submit, and the
shared `DetailToolbar` Save button had no `type` → HTML default `type="submit"`. One click fired both
its `onClick` (=`onSave`=`handleSave`) **and** the native form submit → `createMut.mutate()` twice.
`isSaving`/`isPending` can't guard it (the double-fire is synchronous, before React re-renders). The
product `[id]` edit page didn't double-fire because it isn't wrapped in a `<form>`.
**Scope:** all 10 create pages wrap a form + use DetailToolbar (products/bundles/services/variants +
pipelines/contact-persons/opportunities/tasks/counterparties/calls).
**Fix:** `DetailToolbar` Save + Close are `type="button"` (a toolbar action driven by onClick must never
implicitly submit a form). Prev/Next were already `type="button"`. Global `Button` default left
unchanged (the login form etc. rely on submit). **Browser:** one click → one POST → one bundle.

### BUG4 — catalog /new headers leak Latin-uz into the RU locale
**Repro:** RU locale + bundles/new → heading "Yangi komplekt" + state badge "Yangi" (Uzbek).
**Root cause:** `bundles/new`, `services/new`, `variants/new` passed hardcoded Latin-uz to
`<DetailHeader>` (`titlePrefix`/`stateLabel`/`customTitle` = "Komplekt"/"Yangi"/"Yangi komplekt", …).
`products/new` was already i18n'd. The no-hardcoded i18n gate is Cyrillic-only and only scans document
forms, so these leaked. `customTitle` is the rendered heading + `stateLabel` the state badge;
`titlePrefix` is dead when `customTitle` is set (`detail-header.tsx:121` `customTitle ?? …`) but was
still a uz literal.
**Fix:** i18n via existing keys — `customTitle`/`titlePrefix` → `t('new_title')` (per-namespace, already
"Новый комплект"/"Новая услуга"/"Новая модификация"), `stateLabel` → `tCommon('new_state')`
("Новый"/"Yangi", already present). **Zero new i18n keys.** **Browser (RU):** "Новый комплект" /
"Новая услуга" / "Новая модификация"; all form labels Russian.

## Guards added (non-vacuous)

- `apps/api/.../product.schema.test.ts` (new) + `variant.schema.test.ts` — `Update*` **accept** null on
  the editable optional fields and still **reject** null on the non-nullable ones (name,
  minimumBalanceMinor); non-null validation (country regex, mxik 17-digit) still applies.
- `use-api-mutation.test.tsx` + `use-save-mutation.test.tsx` — assert `invalidateQueries({queryKey:
  ['audit-logs']})` fires on success (spy on a passed QueryClient).
- `detail-toolbar.test.tsx` — Save/Close are `type="button"`; a Save click **inside a `<form>`** does
  NOT fire the form's `onSubmit` (the double-create proof).
- `catalog-new-header-i18n.test.ts` (new) — source-scan: the /new pages' `titlePrefix`/`stateLabel`/
  `customTitle` are `{expression}`s, never string literals.

## Gates
typecheck 0 (web+api) · biome 0 · **api Vitest 2647 (+7)** · **web Vitest 1416 (+16)** · 0 regressions.

## Out-of-scope follow-ups (flagged, NOT fixed this session)

1. **`ColumnCustomizer` default label `'Ustunlar'`** (`packages/design-system/src/patterns/
   ColumnCustomizer.tsx:39`) leaks Latin-uz into the RU locale on the column-config button of **every
   list page** (~40 pages). The component's own doc says "defaults to gear icon only" — the default
   contradicts it. Fix = either icon-only default (needs moysklad capture to confirm parity) or pass a
   localized `label` from each consuming page. Cross-cutting; belongs in a list-toolbar i18n sweep.
2. **`GET /notifications?unreadOnly=true&limit=10` and `GET /tasks/badge-count` return 500** on every
   page (header polling). App-wide, unrelated to catalog or this session's changes (likely a seed/env
   issue) — needs its own investigation.
3. **Product edit has no optimistic lock** — `UpdateProductSchema`/repo have no version field, so two
   concurrent editors = last-write-wins (silent lost update). Data-integrity gap, pre-existing.
4. **Whitespace-only product name** — FE `min(1)` and BE `z.string().min(1)` both accept `" "` (no
   `.trim()`), so a space-only name can persist. Minor.
5. **`tracking-codes`** — not browser-detail-QA'd this session (no owed F-smoke; Phase-1 was intrinsic-
   only). Catalog list-axis was covered in cohort L6.
6. **History `salePrices` field-diff** renders raw JSON (not a human diff) — cosmetic, low severity.
