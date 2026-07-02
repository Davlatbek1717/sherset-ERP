# losses/[id] — detail page parity audit

- **Module:** `losses` (Списание — internal stock write-off) detail/edit page
  (`apps/web/src/app/(app)/losses/[id]/page.tsx`)
- **Date:** 2026-06-03 (session 2026-06-03e — Cohort B: Stock + internal)
- **Protocol:** Cohort batch audit (`scripts/wf-cohort-detail-audit.js`, run `wf_9832a633-948`, 23-agent:
  premise → diff → critic → blind refute-default verify). Operator re-verified candidates against code + i18n.
- **Reference:** ⚠️ **CAPTURE CONTAMINATED** — `docs/moysklad-reference/visual-captures/06-module/loss/`
  edit/detail DOM (`09-edit-default.html`, `40-detail-default.html`) has `<title>Корзина</title>` and renders a
  **Заказ поставщику** form (Контрагент ×15, Договор ×11), not the Списание form → failed capture. Audit is
  effectively **sibling-parity** vs the inverse twin `enters/[id]`, capture discounted. Re-capture needed.

## Verdict

**Clean structural pass.** losses is the inverse twin of enters: same counterparty-less single-warehouse scaffold,
but a **write-off** (−stock at cost-of-goods). Every divergence vs enters/counterparty docs is doc-correct. The
blind-verify refuted the capture-driven counterparty/overhead/editable-cost phantoms. **No confirmed deltas** — no
code change this session.

## A. Structural / field deltas

**No structural / field deltas.** Doc-correct, confirmed by premise bias-immunisation:

- No agent/counterparty/bank/contract/currency/discount — correct (internal doc).
- `reason` enum {damaged, expired, theft, quality, other} (≠ enters' enum — doc-correct; `reasons.loss.*` exist
  ru+uz).
- **No `overhead` block** (write-off has no cost allocation) — correct, NOT a "missing overhead" delta vs enters.
- Positions `mode="qty-only"`: cost is server-derived cost-of-goods, **not** user-entered → no editable cost column,
  `onPickProduct` returns only `productUom`. Correct (NOT a "missing cost prefill" delta vs enters' qty-cost).
- `sumMinor` cost read-only via `formatMoney(..., {displayAs:'none'})`. First tab «Главная» — correct.

## B. Interactive deltas

**No interactive deltas.** post/unpost FSM, clone (`/losses/:id/clone`), delete (draft-only), and no createMenu are
all doc-correct and wired. No dead/unwired buttons. No hardcoded-Uzbek leaks on this page.

## Confirmed mirrors (correct write-off specifics — NOT deltas)

- qty-only positions + no overhead + no editable cost = the defining Списание differences vs enters — all correct.
- No `DetailTotalsSidebar`; `editable=!applicable` posted-lock. Shared scaffold otherwise identical to enters.

## Deferred

- **Capture re-grab** — 06-module/loss capture contaminated (see Reference); clean Списание edit-form capture needed
  for capture-grounding. Tracked in NEXT.md.

**Gates:** web typecheck 0 · biome 0 · web Vitest 1262 pass/1 skip (no regress) · i18n key-existence ru+uz +
no-hardcoded. **HONEST: Phase-1** — structural pass, NOT browser-smoked. No code change on this page.
