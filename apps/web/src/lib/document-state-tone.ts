/**
 * Canonical cross-entity document state → Badge tone — single source of truth.
 *
 * WHY THIS EXISTS
 * Before 2026-06-10 every document list/detail page declared its own local
 * `const STATE_TONE = { ... }` map (54 copies + 1 `PO_STATE_TONE`). A
 * cross-entity audit of all of them showed the convention was already ~95%
 * uniform — `draft→neutral` (×50), `cancelled→destructive` (×50),
 * `paid→success`, `partially_*→warning`, etc. all agreed — but the
 * duplication meant any new state or recolour had to be hand-applied 55×, and
 * two states had silently drifted (see OVERRIDES below). This module makes the
 * convention uniform *by construction*: every page imports `documentStateTone`
 * and a source-scan guard (`document-state-tone.test.ts`) bans re-declaring a
 * local `STATE_TONE` map, so drift can never reappear.
 *
 * SEMANTIC RULE (how a new state picks its tone)
 *   neutral     — not-yet-acted / draft / archived-but-not-an-outcome
 *   brand       — issued / acknowledged / in-flight (active, not yet terminal)
 *   warning     — needs attention: partially done, pending, awaiting payment
 *   info        — informational acknowledgement (accepted, in progress)
 *   success     — terminal happy outcome (posted-done, paid, fully shipped, closed-fulfilled)
 *   destructive — terminal failure / cancelled / rejected / overdue
 *
 * This is an INTERNAL semantic convention (it encodes our own state lifecycle),
 * NOT a pixel-grounded claim against a moysklad capture. The two OVERRIDES
 * below are flagged for grounding before being treated as canonical.
 */

import type { StateTone } from '@/components/document-detail';

export type { StateTone };

/**
 * The canonical map. Keyed by the union of every document state used anywhere
 * in the app; each page uses a subset. Adding a state? Add it here once.
 */
export const DOCUMENT_STATE_TONE: Record<string, StateTone> = {
  // not-yet-acted
  draft: 'neutral',
  // in-flight / acknowledged
  confirmed: 'brand',
  sent: 'brand',
  // needs attention
  awaiting_payment: 'warning',
  partially_paid: 'warning',
  partially_shipped: 'warning',
  partially_received: 'warning',
  pending: 'warning',
  refunded: 'warning',
  // informational
  accepted: 'info',
  in_progress: 'info',
  // terminal success
  posted: 'success',
  paid: 'success',
  fully_shipped: 'success',
  fully_received: 'success',
  completed: 'success',
  converted: 'success',
  closed: 'success',
  open: 'success',
  // terminal failure
  rejected: 'destructive',
  overdue: 'destructive',
  cancelled: 'destructive',
};

/**
 * Invoice family (`invoices-in`, `invoices-out`) override.
 * For an invoice, `posted` means "issued, awaiting payment" — an *intermediate*
 * state whose terminal-done counterpart is `paid` (success). So `posted` stays
 * `brand` (active) here, NOT the `success` it carries for stock documents where
 * posting IS the terminal action.
 *
 * GROUNDING-FLAGGED: this preserves the pre-existing per-page behaviour. Confirm
 * against a moysklad invoice capture (the state-pill colour for a posted,
 * unpaid invoice) before promoting it to / demoting it from canonical.
 */
export const INVOICE_STATE_TONE: Record<string, StateTone> = {
  posted: 'brand',
};

/**
 * Retail-shift (`retail/sessions`) override.
 * A `closed` shift was simply ended/archived — it is not a "success" outcome the
 * way a `closed` (fulfilled) customer/purchase order is. So `closed` stays
 * `neutral` here, NOT the `success` it carries for orders.
 *
 * GROUNDING-FLAGGED: preserves pre-existing behaviour; confirm against a
 * moysklad closed-shift capture before treating as canonical.
 */
export const RETAIL_SESSION_STATE_TONE: Record<string, StateTone> = {
  closed: 'neutral',
};

/**
 * Kunlik KPI qabul (`/menejer`) override — TZ 4M.2 FSM holatlari.
 *
 * Uch holat kanonik jadvaldan farq qiladi va farq ATAYLAB:
 *   `accepted`  — hujjatlarda «axborot uchun tasdiq» (info), bu yerda esa
 *                 TERMINAL natija: kun yopildi va oylikka kiradi → success;
 *   `stale`     — kanonikda umuman yo'q. Qabul qilingandan keyin manba hujjat
 *                 o'zgargan kun — e'tibor talab qiladi → warning;
 *   `escalated` — kanonikda yo'q. Menejer javob bermagani uchun EGAGA o'tgan
 *                 kun — bu nosozlik signali → destructive.
 * `pending` (warning), `rejected` (destructive) va `computed` (noma'lum →
 * neutral) kanonikdan keladi — ular aynan mos tushadi.
 *
 * Kanonik jadvalga QO'SHILMAYDI: bular hujjat holatlari emas, KPI kunining
 * holatlari; `document-state-tone.test.ts` kanonik ro'yxatni qulflab turadi.
 */
export const KPI_DAY_STATE_TONE: Record<string, StateTone> = {
  accepted: 'success',
  stale: 'warning',
  escalated: 'destructive',
};

/**
 * Resolve a document `state` slug to its Badge tone.
 *
 * @param state     the document's state slug (null/undefined → `neutral`)
 * @param overrides optional per-family override map (e.g. {@link INVOICE_STATE_TONE});
 *                  an override entry wins over the canonical map.
 *
 * Unknown states fall back to `neutral` — the same default the old per-page
 * `STATE_TONE[state] ?? 'neutral'` lookups used.
 */
export function documentStateTone(
  state: string | null | undefined,
  overrides?: Readonly<Record<string, StateTone>>,
): StateTone {
  if (state == null) return 'neutral';
  return overrides?.[state] ?? DOCUMENT_STATE_TONE[state] ?? 'neutral';
}
