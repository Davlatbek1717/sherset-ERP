# enters/[id] — detail page parity audit

- **Module:** `enters` (Оприходование — internal stock-in posting at cost) detail/edit page
  (`apps/web/src/app/(app)/enters/[id]/page.tsx`)
- **Date:** 2026-06-03 (session 2026-06-03e — Cohort B: Stock + internal)
- **Protocol:** Cohort batch audit (`scripts/wf-cohort-detail-audit.js`, run `wf_9832a633-948`, 23-agent:
  premise bias-immunise → per-page capture/sibling diff → completeness critic → blind refute-default verify).
  Operator (Opus) re-verified every candidate against code + backend + i18n.
- **Reference:** ⚠️ **CAPTURE CONTAMINATED** — `docs/moysklad-reference/visual-captures/06-module/enter/`
  exists but the edit/detail DOM (`08-edit-default.html`, `58-detail-default.html`) has `<title>Корзина</title>`
  and renders a **Заказ поставщику** form (Контрагент ×15, Договор ×11, «Заказ поставщику №» heading) — i.e. a
  failed capture, NOT the Оприходование form. So this audit is effectively **sibling-parity** vs the cohort twin
  `losses/[id]` (the other counterparty-less single-warehouse stock doc), with the contaminated capture **discounted**.
  Re-capture needed for true capture-grounding (tracked in NEXT.md).

## Verdict

**Clean structural pass.** enters is a counterparty-less single-warehouse stock-in document and every divergence
vs counterparty docs is a **doc-correct absence**. The blind-verify refuted all capture-driven "missing
counterparty / currency / discount / sidebar" phantoms (the contaminated capture would have manufactured them).
**No confirmed deltas** — no code change this session. The `buyPrice` cost-prefill bug-class was already fixed
upstream (`066d55fb`).

## A. Structural / field deltas

**No structural / field deltas.** Doc-correct, confirmed by premise bias-immunisation:

- No agent/counterparty, no bank-account/contract picker, no currency selector (UZS-only), no discount column — all
  correct for an internal stock doc.
- `reason` enum {initial, found, gift, correction, other} + `overhead` sum & distribution (WEIGHT/PRICE/VOLUME/
  QUANTITY) are **enters-only** cost-allocation fields and correct (i18n keys `reasons.enter.*` + `detail_form.
  overhead_*` exist in ru+uz).
- Positions `mode="qty-cost"`; `onPickProduct` prefills `priceMinor: raw?.buyPrice ?? '0'` (buyPrice bug-class
  already fixed). `sumMinor` cost shown read-only via `formatMoney(..., {displayAs:'none'})` — correct.
- First tab = «Главная» (`positionsLabel={tDetailTabs('main')}`) — correct (first-tab bug-class already swept).

## B. Interactive deltas

**No interactive deltas.** post/unpost FSM (`draft↔posted` via `DOC_STATE_VERB`), clone (`/enters/:id/clone`),
delete (draft-only), and the absence of a «Создать документ» createMenu are all doc-correct and wired. No
dead/unwired buttons. No hardcoded-Uzbek leaks found on this page (contrast internal-orders).

## Confirmed mirrors (correct stock-doc specifics — NOT deltas)

- No `DetailTotalsSidebar` (single-warehouse stock value, not a priced order) — correct; the sidebar belongs only to
  internal-orders in this cohort.
- `overhead` block is enters-only (losses/inventories legitimately lack it).
- `editable = !data.applicable` locks the form when posted (`locked_when_posted` alert) — shared pattern.

## Deferred

- **Capture re-grab** — the 06-module/enter capture is contaminated (see Reference); a clean Оприходование edit-form
  capture is needed to upgrade this from sibling-parity to capture-grounded. Tracked in NEXT.md.

**Gates:** web typecheck 0 · biome 0 · web Vitest 1262 pass/1 skip (no regress) · i18n key-existence ru+uz +
no-hardcoded. **HONEST: Phase-1** — structural pass, NOT browser-smoked. No code change on this page.
