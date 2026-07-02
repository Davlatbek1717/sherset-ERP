# tracking-codes — LIST parity audit (Cohort L6)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_cabc94da-b58`, 46 agents, 27 confirmed).
**Ground-truth (§4):** INTRINSIC-ONLY — tracking-codes is a CIS/marking admin list («Маркировка (ASL Belgisi)») with NO moysklad catalog sibling; products = chrome convention reference only. The findings are intrinsic correctness bugs a sibling-diff cannot catch.

## A. Structural / pagination — FIXED (🔴 HIGH data-integrity, BE + FE)
**Bug:** the backend `TrackingCodeService.list` did `findMany({ take: 200 })` with **no cursor** and returned `total: items.length` (the capped row-count, NOT a real COUNT); the FE hard-disabled paging (`hasNext={false}`, `onNext={()=>undefined}`) and `LIMIT=50` was inert (never sent). Result: any account with **>200 marking codes** could never reach rows past the first 200, and the displayed total under-reported once >200 codes exist (silent data-completeness loss).
**Fix (mirrors the proven products `product.repository.ts` cursor+count pattern):**
- BE schema (`tracking-code.schema.ts`): added `cursor: z.string().uuid().optional()` + `limit: z.coerce.number().int().min(1).max(200).default(50)` to `TrackingCodeFilterSchema`.
- BE service (`tracking-code.service.ts`): `take: filter.limit + 1` + optional `cursor/skip:1`; compute `hasMore`/`nextCursor` by slicing the +1 row; `total` now = `trackingCode.count({ where })` (real count). Returns `{ items, nextCursor, total }`.
- FE (`tracking-codes/page.tsx`): added `cursor` state, push `limit` + `cursor` into params + queryKey, extended `ListResponse` with `nextCursor?`, wired `hasNext={!!data?.nextCursor}` / `hasPrevious={!!cursor}` / `onNext`/`onPrevious`, and reset cursor on search/sort/filter/clear changes (mirrors products).
- Tests: +2 `tracking-code.schema.test.ts` cases (limit default 50 + coercion; uuid cursor accepted, out-of-range limit + non-uuid cursor rejected). api Vitest 2599→2601.
- **LIMIT=50 NUMBER kept** (the moysklad catalog default page-size is unverifiable from contaminated captures → §4 defer the number); the fix makes 50 actually govern the fetch instead of being inert.

## B. Interactive / sort + column deltas — FIXED (medium)
- Default `sortKey='createdAt'` but **no createdAt column rendered AND no column was `sortable`** → the sort state + `onSortChange` were dead UI (user sorts by an invisible field). Added a sortable **«Создано» (createdAt)** column (`tCommon('created')` + `formatDate`, mirroring products/page.tsx:251-258) and added `createdAt` to the `TrackingCodeRow` interface (the BE already returns it). The default sort is now visible and clickable.

## DEFER / non-issues
- 🟢 Only 3 base columns (CIS код / Тип товара / Статус) — minimal CIS-admin schema; no catalog sibling to diff a richer column-set against. Kept.

## Gates
typecheck 0 (web+api) · biome 0/0 (changed files) · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding ✓ (tracking-codes cursor-pagination + createdAt-column wiring-lock) · web Vitest 1338 pass/1 skip · api Vitest 2601 pass/2 skip (+2 new, no regress).
