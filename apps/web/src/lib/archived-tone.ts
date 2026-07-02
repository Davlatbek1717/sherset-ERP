/**
 * Canonical archived/active record → Badge tone — single source of truth.
 *
 * WHY THIS EXISTS (UI Convention 7)
 * Before 2026-06-10 ~39 list / detail / component surfaces hardcoded the same
 * archived→tone mapping, in three shapes:
 *   - a `stateTone` ternary      `archived ? 'neutral' : 'success'`
 *   - a conditional badge PAIR   `{archived ? <Badge tone="neutral"> : <Badge tone="success">}`
 *   - an archived-only badge      `{archived && <Badge tone="neutral">}`
 * The convention was uniform — an archived record is `neutral` (muted, filed
 * away, not an outcome) and a live record is `success` — EXCEPT one silent
 * drift: `settings/label-templates` coloured an archived row `destructive`
 * (red), which has no semantic basis (an archived template is not "dangerous").
 * Just like the duplicated document-state maps that drifted before it
 * ({@link ./document-state-tone}), the duplication is the root cause. Routing
 * every surface through this helper makes the convention uniform *by
 * construction*; a source-scan guard (`archived-tone.test.ts`) bans
 * re-introducing a hardcoded archived→tone pair.
 *
 * SEMANTIC RULE
 *   archived / inactive record   → `neutral`  (muted — filed away, not an outcome)
 *   active (non-archived) record → `success`  (live, in use)
 *
 * NOT for:
 *   - document FSM states → use {@link documentStateTone};
 *   - domain-status vocabularies (calls / HR / tasks / opportunities) → their
 *     own per-domain maps (Convention 6);
 *   - value-sign colouring (money ±, KPI thresholds, attendance presence);
 *   - "archived-precedence" composites where the NON-archived branch is a
 *     dynamic domain status, e.g. opportunities
 *     `archived ? 'neutral' : statusTone(status)` — those keep their inline
 *     ternary (the non-archived tone is not a constant `success`). The archived
 *     branch there still resolves to `neutral`, the same value this helper
 *     returns, so the convention is honoured; it simply cannot be reduced to a
 *     single call.
 */

import type { StateTone } from '@/components/document-detail';

/**
 * Resolve a record's archived flag to its Badge tone.
 *
 * @param archived whether the record is archived (`true`) or live (`false`)
 */
export function archivedTone(archived: boolean): StateTone {
  return archived ? 'neutral' : 'success';
}
