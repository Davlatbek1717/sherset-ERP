/**
 * Canonical domain-status → Badge tone maps — single source of truth (UI Convention 6).
 *
 * WHY THIS EXISTS
 * Convention 1 consolidated DOCUMENT-FSM states ({@link ./document-state-tone})
 * and Convention 7 the archived/active flag ({@link ./archived-tone}). But every
 * NON-document status vocabulary — call status, HR task status, telegram message
 * delivery, email/webhook delivery, service-request status/priority, mxik source,
 * sales-channel kind, audit action, ABC class, money flow direction, … — still
 * lived in per-page `statusTone()` helpers and `*_TONE` maps. A 2026-06-10 recon
 * (5-agent discovery sweep) found 38 such surfaces: several byte-identical
 * duplicate pairs (calls list ↔ calls-section, hr/my-tasks ↔ logs-table,
 * email-log ↔ webhook-deliveries, tasks list ↔ detail) and four REAL drifts the
 * duplication had already caused (see UNIFICATIONS below). Same root cause, same
 * cure: one shared map per domain, a drift-lock source-scan
 * (`domain-status-tone.test.ts`) banning local re-declarations.
 *
 * DESIGN RULE (per the convention registry, docs/audits/_UI-CONVENTIONS.md):
 * each domain keeps ITS OWN map — vocabularies are NOT merged into one table,
 * because the same word legitimately carries different tones in different
 * domains (`sent` = success for a delivered message, but neutral for an HR task
 * awaiting an answer, and brand for a document-FSM state; `cancelled` = neutral
 * for a call, destructive for a service request).
 *
 * UNIFICATIONS (the four deliberate cross-surface fixes, 2026-06-10; every other
 * map below is byte-preserving on its closed vocabulary):
 *   1. opportunity `open` → `info` everywhere. The detail page used `brand` only
 *      because the pre-Convention-1 `StateTone` union lacked `info` (its comment
 *      said so); Convention 1 widened the union, so the constraint is gone.
 *   2. money flow `out` → `destructive` everywhere. bank-import badged outgoing
 *      rows `warning` while the /money list badged outgoing documents
 *      `destructive` — identical semantics, one tone wins (the main money list's).
 *   3. ABC class → the dedicated ABC report's map (A success / B warning /
 *      C destructive). The inventerizatsiya cycle-view coloured the same A/B/C
 *      with raw emerald/indigo/slate pills. GROUNDING-FLAGGED: `C → destructive`
 *      is semantically aggressive (a C class is low-revenue, not an error) —
 *      these are our own non-parity analytics pages, so a future deliberate
 *      recolour (e.g. C → neutral) is a product decision; until then the
 *      incumbent report map is canonical.
 *   4. channel sync `lastSyncOk === null` → NO badge. The channels list treated
 *      null (never evaluated) as falsy → destructive; the channel detail page
 *      guarded `!== null` and showed nothing. Unknown is not an error — the
 *      detail behaviour is canonical.
 */

import type { StateTone } from '@/components/document-detail';

export type { StateTone };

/** Shared lookup: explicit map hit, else `neutral` (same fallback every old per-page helper used). */
function resolve(
  map: Readonly<Record<string, StateTone>>,
  key: string | null | undefined,
): StateTone {
  if (key == null) return 'neutral';
  return map[key] ?? 'neutral';
}

// ---------------------------------------------------------------------------
// CRM
// ---------------------------------------------------------------------------

/** Call lifecycle (`scheduled | completed | missed | cancelled`). `cancelled` is neutral here (a dropped plan, not a failure) — unlike service requests. */
export const CALL_STATUS_TONE: Record<string, StateTone> = {
  scheduled: 'warning',
  completed: 'success',
  missed: 'destructive',
  cancelled: 'neutral',
};
export const callStatusTone = (s: string | null | undefined): StateTone =>
  resolve(CALL_STATUS_TONE, s);

/** Call direction (`in | out`) — categorical, not lifecycle. */
export const CALL_DIRECTION_TONE: Record<string, StateTone> = {
  in: 'info',
  out: 'success',
};
export const callDirectionTone = (d: string | null | undefined): StateTone =>
  resolve(CALL_DIRECTION_TONE, d);

/** CRM task status (`open | in_progress | done | cancelled`). */
/** Omborchi topshirig'i (joylashtirish/yig'ish) — /restock-tasks, /omborchi. */
export const RESTOCK_STATUS_TONE: Record<string, StateTone> = {
  pending: 'neutral',
  in_progress: 'info',
  done: 'success',
};
export const restockStatusTone = (s: string | null | undefined): StateTone =>
  resolve(RESTOCK_STATUS_TONE, s);

export const TASK_STATUS_TONE: Record<string, StateTone> = {
  open: 'info',
  in_progress: 'warning',
  done: 'success',
  cancelled: 'neutral',
};
export const taskStatusTone = (s: string | null | undefined): StateTone =>
  resolve(TASK_STATUS_TONE, s);

/** Opportunity status (`open | won | lost`). UNIFICATION 1: `open → info` on list AND detail (the detail's old `brand` was a stale type-constraint workaround). */
export const OPPORTUNITY_STATUS_TONE: Record<string, StateTone> = {
  open: 'info',
  won: 'success',
  lost: 'destructive',
};
export const opportunityStatusTone = (s: string | null | undefined): StateTone =>
  resolve(OPPORTUNITY_STATUS_TONE, s);

/** Service-request status. `cancelled` is destructive here (an aborted customer issue) — unlike calls/tasks; per-domain semantics, deliberate. */
export const SERVICE_REQUEST_STATUS_TONE: Record<string, StateTone> = {
  new: 'info',
  in_progress: 'warning',
  waiting_customer: 'warning',
  resolved: 'success',
  closed: 'neutral',
  cancelled: 'destructive',
};
export const serviceRequestStatusTone = (s: string | null | undefined): StateTone =>
  resolve(SERVICE_REQUEST_STATUS_TONE, s);

/** Service-request priority (`low | normal | high | critical`). */
export const SERVICE_REQUEST_PRIORITY_TONE: Record<string, StateTone> = {
  low: 'neutral',
  normal: 'neutral',
  high: 'warning',
  critical: 'destructive',
};
export const serviceRequestPriorityTone = (p: string | null | undefined): StateTone =>
  resolve(SERVICE_REQUEST_PRIORITY_TONE, p);

// ---------------------------------------------------------------------------
// HR
// ---------------------------------------------------------------------------

/** HR task-log answer status. `sent` = awaiting an answer → neutral (NOT the delivery-domain success). */
export const HR_TASK_LOG_STATUS_TONE: Record<string, StateTone> = {
  answered_yes: 'success',
  answered_text: 'success',
  approved: 'success',
  answered_no: 'destructive',
  rejected: 'destructive',
  failed: 'destructive',
  pending_review: 'warning',
  sent: 'neutral',
};
export const hrTaskLogStatusTone = (s: string | null | undefined): StateTone =>
  resolve(HR_TASK_LOG_STATUS_TONE, s);

/** Davomat kunlik status (`present | late | absent | dayoff`) — HR xodim «Davomat» tab. */
export const ATTENDANCE_DAY_STATUS_TONE: Record<string, StateTone> = {
  present: 'success',
  late: 'warning',
  absent: 'destructive',
  dayoff: 'neutral',
};
export const attendanceDayStatusTone = (s: string | null | undefined): StateTone =>
  resolve(ATTENDANCE_DAY_STATUS_TONE, s);

/** Telegram message delivery (`pending | retry | sent | failed`). `sent` = delivered → success. */
export const HR_MESSAGE_STATUS_TONE: Record<string, StateTone> = {
  sent: 'success',
  pending: 'neutral',
  // Faza 28: exclusive claim held, MTProto call in flight.
  sending: 'info',
  retry: 'warning',
  failed: 'destructive',
};
export const hrMessageStatusTone = (s: string | null | undefined): StateTone =>
  resolve(HR_MESSAGE_STATUS_TONE, s);

/** HR task-template trigger priority (`urgent | high | normal/low → neutral`). */
export const HR_TASK_PRIORITY_TONE: Record<string, StateTone> = {
  urgent: 'destructive',
  high: 'warning',
};
export const hrTaskPriorityTone = (p: string | null | undefined): StateTone =>
  resolve(HR_TASK_PRIORITY_TONE, p);

/** Payroll bonus/fine kind. */
export const BONUS_FINE_TONE: Record<string, StateTone> = {
  bonus: 'success',
  fine: 'destructive',
};
export const bonusFineTone = (kind: string | null | undefined): StateTone =>
  resolve(BONUS_FINE_TONE, kind);

// --- Loyalty (MASTER-TODO #10) --------------------------------------------
// These lived as TWO byte-identical private copies — `TYPE_TONE`/`STATUS_TONE`
// in loyalty-operations/page.tsx and `LOYALTY_*_TONE` in
// counterparty-activity-widget.tsx. Identical today, free to diverge tomorrow:
// precisely the drift this module exists to prevent (the same widget renders a
// loyalty badge next to the list's, so a one-sided recolour would be visible).

/** Loyalty operation kind — points earned vs spent. */
export const LOYALTY_TYPE_TONE: Record<string, StateTone> = {
  EARNING: 'success',
  SPENDING: 'neutral',
};
export const loyaltyTypeTone = (t: string | null | undefined): StateTone =>
  resolve(LOYALTY_TYPE_TONE, t);

/** Loyalty operation status. */
export const LOYALTY_STATUS_TONE: Record<string, StateTone> = {
  COMMITTED: 'success',
  PENDING: 'warning',
  CANCELLED: 'destructive',
};
export const loyaltyStatusTone = (s: string | null | undefined): StateTone =>
  resolve(LOYALTY_STATUS_TONE, s);

/**
 * Debt-collection call outcome (Sherset «Qarz undirish», TZ §3.5).
 * `callback` is deliberately neutral — a scheduled call-back is not a failure,
 * it is the normal continuation of the collection loop.
 */
export const DEBT_CALL_OUTCOME_TONE: Record<string, StateTone> = {
  paid_full: 'success',
  paid_partial: 'warning',
  not_paid: 'destructive',
  callback: 'neutral',
};
export const debtCallOutcomeTone = (o: string | null | undefined): StateTone =>
  resolve(DEBT_CALL_OUTCOME_TONE, o);

/**
 * Debt repayment status.
 *
 * Deliberately its OWN map rather than reusing `DOCUMENT_STATE_TONE`
 * (`paid`/`partially_paid`): a debt's vocabulary is `paid | partial | unpaid`
 * and `unpaid` is the NORMAL resting state of an open debt — neutral, not the
 * `destructive` an unpaid *document* would warrant. Same colours as the
 * page-local helper this replaced.
 */
export const DEBT_STATUS_TONE: Record<string, StateTone> = {
  paid: 'success',
  partial: 'warning',
  unpaid: 'neutral',
};
export const debtStatusTone = (s: string | null | undefined): StateTone =>
  resolve(DEBT_STATUS_TONE, s);

/**
 * Driver live-tracking status (`hr/drivers/live`).
 *
 * `unknown` is `info`, not `warning`: a driver whose last ping cannot be
 * classified is not a problem to act on — only genuinely `stopped` is. Landed
 * as a page-local map with the driver-tracking feature (`f0dd781`) and pulled
 * in here by the same drift-lock that owns the rest (MASTER-TODO #10).
 */
export const DRIVER_STATUS_TONE: Record<string, StateTone> = {
  moving: 'success',
  stopped: 'warning',
  unknown: 'info',
  offline: 'neutral',
};
export const driverStatusTone = (s: string | null | undefined): StateTone =>
  resolve(DRIVER_STATUS_TONE, s);

/**
 * Active/inactive record (`isActive` flags, attendance "working", …) —
 * the boolean sibling of {@link ../lib/archived-tone} (which covers the
 * `archived` vocabulary): active → success, inactive → neutral.
 */
export function activeTone(active: boolean): StateTone {
  return active ? 'success' : 'neutral';
}

/** System-defined vs custom record (role `isSystem`, role `isDefault`): system → brand (it is a *kind*, not an active-state — so brand, not success). */
export function systemTone(system: boolean): StateTone {
  return system ? 'brand' : 'neutral';
}

// ---------------------------------------------------------------------------
// Settings / integrations
// ---------------------------------------------------------------------------

/** Outbound delivery status — email log + webhook deliveries (same vocabulary, was two copy-pasted helpers). */
export const DELIVERY_STATUS_TONE: Record<string, StateTone> = {
  sent: 'success',
  pending: 'warning',
  // Faza 28: a worker holds an exclusive claim on the row and is talking to
  // the provider right now. In flight ≠ waiting ⇒ `info`, not `warning`.
  sending: 'info',
  dead: 'destructive',
  failed: 'destructive',
};
export const deliveryStatusTone = (s: string | null | undefined): StateTone =>
  resolve(DELIVERY_STATUS_TONE, s);

/** Audit-log action → tone. Substring matching ON PURPOSE (actions are compound slugs like `transition:posted`, `bulk-delete`). Branch order is load-bearing. */
export function auditActionTone(action: string): StateTone {
  if (action.includes('create')) return 'success';
  if (action.includes('delete') || action.includes('cancel')) return 'destructive';
  if (action.includes('post') || action.includes('transition')) return 'info';
  if (action.includes('update') || action.includes('archive') || action.includes('restore')) {
    return 'warning';
  }
  return 'neutral';
}

/** MXIK code source (`soliq` registry | `manual` entry | `override`). */
export const MXIK_SOURCE_TONE: Record<string, StateTone> = {
  soliq: 'success',
  manual: 'brand',
  override: 'warning',
};
export const mxikSourceTone = (s: string | null | undefined): StateTone =>
  resolve(MXIK_SOURCE_TONE, s);

/** Sales-channel kind — categorical channel colouring (not good/bad). */
export const CHANNEL_KIND_TONE: Record<string, StateTone> = {
  telegram: 'info',
  instagram: 'warning',
  website: 'success',
  marketplace_uzum: 'info',
  marketplace_olcha: 'warning',
  custom: 'neutral',
};
export const channelKindTone = (k: string | null | undefined): StateTone =>
  resolve(CHANNEL_KIND_TONE, k);

/**
 * Channel sync health. UNIFICATION 4: `null` (never evaluated) → `null` = render
 * NO badge — unknown is not an error. `true → success`, `false → destructive`.
 */
export function syncStatusTone(lastSyncOk: boolean | null | undefined): StateTone | null {
  if (lastSyncOk == null) return null;
  return lastSyncOk ? 'success' : 'destructive';
}

// ---------------------------------------------------------------------------
// Money / reports
// ---------------------------------------------------------------------------

/** Money flow direction. UNIFICATION 2: `out → destructive` everywhere (bank-import previously used `warning`). */
export const MONEY_FLOW_TONE: Record<string, StateTone> = {
  in: 'success',
  out: 'destructive',
};
export const moneyFlowTone = (d: string | null | undefined): StateTone =>
  resolve(MONEY_FLOW_TONE, d);

/** Bank-import statement lifecycle (`committed | cancelled | parsed/pending → neutral`). */
export const BANK_IMPORT_STATE_TONE: Record<string, StateTone> = {
  committed: 'success',
  cancelled: 'destructive',
};
export const bankImportStateTone = (s: string | null | undefined): StateTone =>
  resolve(BANK_IMPORT_STATE_TONE, s);

/**
 * ABC class. UNIFICATION 3 — canonical = the dedicated ABC report's map.
 * GROUNDING-FLAGGED: `C → destructive` is aggressive (C = low revenue, not an
 * error); softening it is an explicit product decision — change it HERE once.
 */
export const ABC_CLASS_TONE: Record<string, StateTone> = {
  A: 'success',
  B: 'warning',
  C: 'destructive',
};
export const abcClassTone = (c: string | null | undefined): StateTone => resolve(ABC_CLASS_TONE, c);

/** Counterparty legal status (`Juridical` entity → brand | `Natural` person → success) — categorical, mirrors the old blue/emerald pills. */
export const LEGAL_STATUS_TONE: Record<string, StateTone> = {
  Juridical: 'brand',
  Natural: 'success',
};
export const legalStatusTone = (s: string | null | undefined): StateTone =>
  resolve(LEGAL_STATUS_TONE, s);

/** Counterparty balance side (`debtor` owes us → success | `creditor` we owe → destructive | `settled`). */
export const BALANCE_SIDE_TONE: Record<string, StateTone> = {
  debtor: 'success',
  creditor: 'destructive',
  settled: 'neutral',
};
export const balanceSideTone = (s: string | null | undefined): StateTone =>
  resolve(BALANCE_SIDE_TONE, s);

/** Inventory cycle-count priority (`overdue | due_today | due_soon`). */
export const INVENTORY_PRIORITY_TONE: Record<string, StateTone> = {
  overdue: 'destructive',
  due_today: 'warning',
  due_soon: 'info',
};
export const inventoryPriorityTone = (p: string | null | undefined): StateTone =>
  resolve(INVENTORY_PRIORITY_TONE, p);

/**
 * Kunlik KPI qabul holati (4M.2 · `daily-kpi-fsm.ts` dagi DAILY_KPI_STATE).
 *
 * `stale` va `escalated` — OGOHLANTIRISH: ikkalasi ham menejer aralashuvini
 * talab qiladi. `force_accepted` — `brand`, chunki u qabul qilingan, lekin
 * ODATIY yo'l bilan emas (egasi majburiy yopgan) va bu ko'rinib turishi kerak.
 */
export const DAILY_KPI_STATE_TONE: Record<string, StateTone> = {
  computed: 'neutral',
  pending: 'info',
  accepted: 'success',
  rejected: 'destructive',
  escalated: 'warning',
  force_accepted: 'brand',
  stale: 'warning',
};
export const dailyKpiStateTone = (s: string | null | undefined): StateTone =>
  resolve(DAILY_KPI_STATE_TONE, s);

/**
 * Jonli holat qatorining diqqat darajasi (4M.4 · `live-status.ts` dagi ATTENTION).
 *
 * `alert` — aralashuv KERAK (kechikish, 12 soatdan uzoq smena, qotib qolgan
 * yig'ish), shuning uchun `destructive`. `ok` ataylab rangsiz: bu ekran
 * «hammasi joyida» demaydi, normal qator faqat kontekst uchun turadi.
 */
export const LIVE_ATTENTION_TONE: Record<string, StateTone> = {
  alert: 'destructive',
  info: 'info',
  ok: 'neutral',
};
export const liveAttentionTone = (a: string | null | undefined): StateTone =>
  resolve(LIVE_ATTENTION_TONE, a);

/**
 * Xodim majburiyati turi (4M.4 · `accountability.ts` dagi DUTY).
 *
 * PUL majburiyatlari (`open_shift`, `cash_on_hand`) — `destructive`: yo'qolgan
 * pulni qaytarib bo'lmaydi. Yig'ish va qabul qilinmagan KPI kunlari kutishi
 * mumkin, shuning uchun pastroq daraja.
 */
export const DUTY_KIND_TONE: Record<string, StateTone> = {
  open_shift: 'destructive',
  cash_on_hand: 'destructive',
  picking_open: 'warning',
  kpi_pending: 'info',
  // Jihoz (MK05) — `warning`: pul emas, lekin yo'qolsa qaytmaydi.
  equipment_out: 'warning',
};
export const dutyKindTone = (k: string | null | undefined): StateTone => resolve(DUTY_KIND_TONE, k);

/**
 * Jihoz holati (MK05 · `equipment.ts` dagi `EQUIPMENT_STATUS`).
 *
 * `lost` — `destructive`: yo'qolgan jihoz qaytmaydi. `assigned` neytral:
 * xodimda turishi normal holat, muammo emas.
 */
export const EQUIPMENT_STATUS_TONE: Record<string, StateTone> = {
  in_stock: 'success',
  assigned: 'info',
  repair: 'warning',
  written_off: 'neutral',
  lost: 'destructive',
};
export const equipmentStatusTone = (s: string | null | undefined): StateTone =>
  resolve(EQUIPMENT_STATUS_TONE, s);

/**
 * Zaxira signali turi (4M.8 · `stock-signals.ts` dagi STOCK_SIGNAL).
 *
 * `stockout_risk` — `destructive`: tugagan tovar sotuvni BUGUN to'xtatadi.
 * `dead_money` — `warning`: pul qotgan, lekin yo'qolmagan. `overstock` —
 * `info`: sekin muammо, e'tibor talab qiladi-yu shoshilinch emas.
 */
export const STOCK_SIGNAL_TONE: Record<string, StateTone> = {
  stockout_risk: 'destructive',
  dead_money: 'warning',
  overstock: 'info',
};
export const stockSignalTone = (k: string | null | undefined): StateTone =>
  resolve(STOCK_SIGNAL_TONE, k);
