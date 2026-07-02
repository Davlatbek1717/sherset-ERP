# Phase-2 — ConfirmDialog-inside-Modal bug (z-index + pointer-events + auto-close)

**Status:** **Phase-2 BROWSER-VERIFIED** (real Chrome via Playwright MCP; live web+api+db).
**Date:** 2026-06-08j (`davom et`, local Opus, ultracode).
**Discovered by:** Phase-2 browser-QA of the optimistic-lock conflict dialogs (draining the
browser-smoke debt the session-start audit flagged as the #1 standing risk). The `hr-employee`
edit **modal** is the first lock surface whose conflict dialog opens from inside a Radix `Modal`
— and that exposed a general design-system bug.

## The bug (HIGH — a confirm dialog opened from inside any modal was unusable)

When a `ConfirmDialog` (`useConfirm`) is invoked from **within an open Radix `Modal`** — e.g. the
optimistic-lock conflict-reload prompt fired from the `hr-employee` edit modal, **or any in-modal
delete prompt** — three independent defects stacked:

1. **Hidden behind the modal (z-index).** `ConfirmDialog` used `z-[var(--ms-z-modal)]` (400), the
   **same** z as `Modal`'s panel. The Radix modal portals to `<body>`-end (later in DOM), so at
   equal z it painted **over** the confirm dialog → the dialog was invisible.
2. **Unclickable (pointer-events).** Even forced above the modal, the dialog stayed unclickable: a
   Radix modal sets **`pointer-events: none` on `<body>`** while open. The confirm overlay renders
   as a `<body>` child *outside* the modal tree, so it **inherited** that lock — every click passed
   straight through to the modal underneath (`document.elementsFromPoint` over the confirm button
   returned the modal's form grid; Playwright `click` timed out: "subtree intercepts pointer
   events").
3. **Closed the host modal (Radix interact-outside).** Once clickable, any click on the confirm
   dialog (reload **or** cancel) is an "interaction outside" for the Radix modal → Radix's default
   `onPointerDownOutside` fired `onOpenChange(false)` → the **host modal closed**, defeating both
   intents: reload should re-seed the *still-open* modal; cancel should leave the form intact so the
   user can copy their edits out.

Net effect before the fix: a real user hitting an optimistic-lock conflict in the `hr-employee`
modal saw **only the modal** (dialog hidden behind it); clicking Save again re-fired the hidden
409 dialog → **the conflict was unresolvable from the UI**. Invisible to every existing gate
(typecheck / biome / unit / the api+db lock harness were all green) — a real-browser layout +
event-routing bug. The 08d customer-order conflict E2E could not catch it (full-page form, no modal).

## Root cause + fix (design-system, 4 files)

| # | File | Change |
|---|------|--------|
| 1 | `packages/design-system/src/globals.css` | new token `--ms-z-confirm: 450` (between modal 400 and popover 500) |
| 2 | `packages/design-system/src/tokens/z-indices.ts` | `confirm: 450` (keeps the TS scale in sync with the CSS) |
| 3 | `packages/design-system/src/feedback/ConfirmDialog.tsx` | overlay `z-[var(--ms-z-modal)]` → `z-[var(--ms-z-confirm)]` **and** add `pointer-events-auto` (override the inherited body lock) |
| 4 | `packages/design-system/src/feedback/Modal.tsx` | `Dialog.Content onInteractOutside` guard: `e.preventDefault()` when the interaction targets a `[data-testid="confirm-dialog"]` — keep the modal open when a confirm is layered above it |

This is a **general** fix: every confirm/conflict/delete dialog invoked from inside **any** Radix
`Modal` app-wide now paints above the modal, is clickable, and leaves the host modal open.

## Verification

- **Browser, end-to-end (the authoritative evidence)** — `hr-employee` edit modal, real Chrome:
  open modal (vN) → out-of-band `PUT(vN)` bumps server to vN+1 → edit + Save (stale vN) → **409** →
  conflict dialog now **paints on top** (screenshot) and **is clickable** (`elementsFromPoint` over
  the reload button returns `confirm-confirm`; Playwright click succeeds) → "Обновить данные" →
  **modal stays open** + **re-seeds via `findOne`** to the server copy (stale edit discarded) →
  fresh edit + Save → **200, persisted** (verified vN+1 → vN+2 over the api). Ran the full cycle
  across v3→v6.
- **Regression — non-modal confirm dialog unaffected:** the `roles` config detail page (full-page
  form, `useConflictReload` + `[data]`-effect re-hydrate) re-verified **after** the design-system
  changes: 409 → dialog → reload → re-hydrate (stale edit discarded) → still works. (Also represents
  the `analitika/staff` full-page form, same pattern — its re-key remount browser-smoke stays owed,
  low-risk.)
- **Guard test (CSS half, jsdom):** `confirmdialog-from-ui.test.tsx` +1 — asserts the overlay carries
  `z-[var(--ms-z-confirm)]` (not `z-[var(--ms-z-modal)]`) **and** `pointer-events-auto`.
- **The Radix interact-outside half is NOT unit-tested** (jsdom does not populate Radix's
  `event.detail.originalEvent.target` like a real browser, so the guard can't be faithfully
  exercised). Documented as a note in `modal-from-ui.test.tsx`; covered by the browser E2E above.

**Gates:** ds typecheck 0 · web typecheck 0 · biome 0 new (4 pre-existing nursery class-sort
warnings on untouched lines) · web Vitest Modal 19 + ConfirmDialog 21 (+1 guard) green.

## Scope note

Found while draining the optimistic-lock conflict-dialog browser-smoke debt. The `roles` (config,
full-page) conflict dialog and the `hr-employee` (modal) conflict dialog are now **Phase-2
browser-verified**. The other 8 lock conflict surfaces are full-page detail forms (same pattern as
`roles`/customer-order, both browser-verified) — covered by representative; not individually
browser-smoked. The `hr-employee`/`staff` Employee-pair FE is no longer "structural only" for the
modal surface.
