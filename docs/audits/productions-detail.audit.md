# productions/[id] — detail page parity audit

- **Module:** `productions` (Производство / production output document) detail page.
- **Date:** 2026-06-03d
- **Method:** **cohort batch audit** (`scripts/wf-cohort-detail-audit.js`, run `wf_b0d5474e-6de`) — production
  family {processing-orders, processings, productions} vs **moves/[id]** scaffolding sibling. Premise
  auto-corrected the reference + immunised 13 bias traps; per-page diff → completeness critic → blind
  direction-aware verify. Every confirmed delta re-verified by hand against backend ground truth.
- **Reference:** no fresh capture (production detail route-walled); sibling-parity vs `moves/[id]` for scaffolding
  (toolbar/header/FSM/store), production-specifics judged intrinsically.

## Verdict

Structurally a correct internal manufacturing doc. Almost every divergence vs moves is a **doc-correct absence**
(no counterparty/contract/accounts/sale-price/VAT/email; first tab is a **child processing-orders list**, not a
position table — so the «Главная» first-tab label stays **DEFERRED**, confirmed by the premise as doc-correct). **Two
real bugs found + FIXED** — one display/structural (P2 → A below), one wiring/interactive (P1 → B below).

## A. Structural / field deltas

**One display bug found + FIXED:**

| # | Element | moysklad/expected | ours | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| P2 | Child processing-orders table «Кол-во» | whole units (`quantity / 1000`) | rendered `{po.quantity}` RAW — quantity is stored ×1000 (`production.service.ts:31,51` divide; `findById:160-169` returns raw) → **1000× too large** | delta | **high** | **FIXED** → `{(Number(po.quantity) / 1_000).toString()}` |

Doc-correct (no fix): absent counterparty/contract/accounts/salesChannel/price/VAT/email; `relatedGroups=[]`;
shared `states.processing_order` + `pages.processing_order` namespaces (with processing-orders); first tab = child
list (no «Главная»/PositionEditor/totals sidebar).

## B. Interactive deltas

**One wiring bug found + FIXED:**

| # | Element | moysklad/expected | ours | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| P1 | «Изменить ▾» → clone (Сделать копию) | wired (backend `POST /productions/:id/clone` EXISTS, controller:69) | `DetailToolbar` omitted `onClone`; no `cloneMut` — productions was the ONLY production-family page missing it (moves/processing-orders/processings all wire it) | delta | med | **FIXED** → added `cloneMut` + `onClone` (mirror moves/[id]:206) |

Doc-correct (no fix): no `createMenu` (Производство has no forward child-doc); FSM post/unpost transitions + delete
all wired.

## Gates
web typecheck 0 · biome 0 · web Vitest 1262/1263 pass (no regress).
**HONEST: Phase-1** — NOT browser-smoked (the 1000× fix + clone button are runtime-unverified; backend clone
endpoint confirmed present, quantity ×1000 confirmed by the service formula + the list path that already divides).

## Deferred
- First-tab «Главная» label — needs a real moysklad production-detail capture (first tab is a child-orders list,
  not goods — over-reach guard holds).
