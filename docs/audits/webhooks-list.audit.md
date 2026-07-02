# webhooks — LIST parity audit (Cohort L12 · Settings-org)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_9bba0f00-850`) — diff flagged dead cursor pagination (LOW; L6-tracking-codes class). Opus verified the BE returns a real cursor.
**Ground-truth (§4):** NO moysklad capture; webhooks is a partially-bespoke developer-settings list. Sibling-parity (print-templates/attributes for the bespoke shell; projects/mxik for the cursor pattern). No label churn.
**DEDUP:** no detail page (inline `WebhookDialog`). Full audit on the LIST axis.

## A. Structural / columns + i18n — CLEAN
- Columns entity/action(badges)/url/enabled(toggle)/signed/actions; headers via `t()` (`pages.webhook_admin`) — no hardcoded leak. Row actions (deliveries link, edit, delete) use `useApiMutation`/`useDestructiveMutation` → errors surface (critic confirmed).

## B. Interactive chrome — 🔴 FIX (dead cursor pagination)
- **Bug:** `WebhookService.list()` returns a real `{ items, nextCursor, total }` (proper `take: limit+1` + slice + `count`), but the FE `ListResponse` declared only `{ items, total }`, requested `limit=200`, never threaded a cursor, and passed no `hasNext`/`onNext`/`onPrevious` to `ListView` — so rows beyond #200 were unreachable.
- **Fix (mirror projects/mxik):** added `nextCursor?` to `ListResponse`; `cursor` state; `...(cursor ? { cursor } : {})` in params + cursor in queryKey; `hasNext={!!data?.nextCursor}` / `hasPrevious` / `onNext` / `onPrevious`; lowered `LIMIT` 200 → 50 (a real page size); sort change resets the cursor.

## DEFER / Phase-2
- Browser-smoke: with >50 webhooks, confirm next/prev paging works (runtime-unverified).

## Gates
typecheck 0 (web+api) · biome 0 · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding 106 · web Vitest 1374 (+13, 0 regress) · api Vitest 2607 (+2, 0 regress).
