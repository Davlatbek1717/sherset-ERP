# tracking-codes/[id] — detail page parity audit

- **Module:** `tracking-codes` (Маркировка / коды маркировки — CIS marking codes, «Честный знак» / ASL Belgisi) detail page
  (`apps/web/src/app/(app)/tracking-codes/[id]/page.tsx`)
- **Date:** 2026-06-03 (session 2026-06-03i — Cohort F: Catalog items)
- **Protocol:** Cohort batch audit (`scripts/wf-cohort-detail-audit.js`, run `wf_6efce153-ac6`, 28-agent:
  premise → per-page diff + completeness critic → blind refute-default verify). **No moysklad gold capture and no
  catalog sibling exist** (moysklad's real marking surface is read-only/scan-driven); the premise demoted `products/[id]`
  to feature-source only and the page was judged on **internal correctness, NOT products-parity**. Operator (Opus)
  ground-truthed the one finding (shared-hook leak) before applying.
- **Reference:** none (bespoke CIS admin form). Backend: `GET/PATCH/DELETE /tracking-codes/:id` (fields: `cis`,
  `cis1162`, `type` enum, `status` enum).

## Verdict

tracking-codes is internally correct: every label/option/validation message is already `t()`-wired with both
ru+uz keys (`pages.tracking_code_admin.*`), the `type` enum (8 members) and `status` enum (3 members) match the
backend, `cis` required-validation fires, and delete uses the `runDestructive` ConfirmDialog (not `window.confirm`).
**No page-specific delta.** The single confirmed issue is a **cohort-wide shared-hook leak** (not specific to this page):
`useDestructiveMutation` hardcoded Latin-Uzbek defaults for the confirm-dialog body, both buttons and the success/error
toasts, which leaked into the RU locale on **every** destructive action app-wide — FIXED centrally.

## A. Structural / field deltas

| # | Element | expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| T1 | delete confirm-dialog body + confirm/cancel labels + success/error toasts (via the shared `useDestructiveMutation` hook) | localized via `t()` with ru+uz keys | the shared hook hardcoded Latin-Uzbek defaults (`"Bu amalni qaytarib bo'lmaydi."`, `"O'chirish"`, `'Bekor qilish'`, `"Muvaffaqiyatli o'chirildi"`, `'Bajarilmadi'`) → leak into RU on **~60 callers** (Cyrillic-only gate misses Latin-uz) | delta (shared) | medium | **FIXED in the shared hook** → `useTranslations('common')`: `action_irreversible` (new), `delete`, `cancel`, `deleted`, `action_failed`. Page needs no change (it correctly delegates). |

## B. Interactive deltas

(none — `cis` required check throws `t('cis_required')`; delete routes through `runDestructive` → `DELETE /tracking-codes/:id`;
PATCH round-trips `cis/cis1162/type/status`. The `type`/`status` `NativeSelect` option sets match the backend enums.)

## Confirmed mirrors (correct CIS-admin specifics — NOT deltas)

- No products-parity fields (name/price/article/unit/folder/barcodes/etc.) — a marking code is not a catalog item;
  judging it against products would be 100% noise.
- Hard `DELETE` (no archive/restore) is correct for a marking code (it has no soft-delete lifecycle).
- `cis`, `cis1162`, `type` (SHOES/TOBACCO/MEDICINES/PERFUME/TIRES/DAIRY/WATER/BEER), `status` (ACTIVE/RETIRED/TRANSFERRED)
  are intentional CIS domain fields, fully enumerated and matching the backend.

## Deferred (documented for Phase-2)

- 🟢 None for the page itself. The shared-hook fix (T1) changes RU rendering on every destructive action across the app;
  unit-tested in the uz locale (behavior byte-identical) — a live "RU-locale delete shows Russian confirm/buttons/toast"
  smoke is Phase-2 QA.

**Gates:** web tc 0 · biome 0 (changed) · web Vitest 1268 pass/1 skip (0 regress; `use-destructive-mutation.test.tsx`
updated for the localized defaults) · i18n key-existence ru+uz + no-hardcoded (tracking-codes route now registered).
**HONEST: Phase-1 — NOT browser-smoked.**
