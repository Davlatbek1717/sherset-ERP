'use client';

import { useTranslations } from 'next-intl';

/**
 * Shared translators for the History (Tarix) timeline action + field labels.
 *
 * Why a shared hook: BOTH `DocumentTabs` and `DetailContentTabs` render an
 * AuditLog feed, and each had its own copy of the translation logic. That copy
 * only normalised the `.` separator, so every audit action whose slug uses `:`
 * (the FSM target state, e.g. `transition:posted`, `set:waiting`,
 * `create:cashout`) or `-` (compound verbs, e.g. `mass-edit`) failed the
 * `action_<key>` lookup and leaked the RAW slug to the user on every posted /
 * cloned / archived / mass-edited document — a Cyrillic UI showing
 * `transition:completed`. Gate-invisible (tc/biome/unit never render the tab).
 *
 * The fix normalises ALL separators to `_` and adds a generic
 * `action_transition` fallback so any FSM state we have not given a dedicated
 * label (e.g. the customer-order long-tail `partially_shipped`, or a future
 * state) still reads as «Статус изменён» / «Holat o'zgardi» rather than a slug.
 *
 * `translateValue` closes the matching leak in the diff BELOW the headline
 * (2026-06-08m): every FSM `transition` writes its diff as
 * `fieldChanges = { from: { before: <oldState>, after: <newState> } }`, where
 * the before/after are RAW enum slugs (`in_progress`, `completed`, `posted`).
 * Those rendered verbatim — a Cyrillic UI showing `Статус: in_progress →
 * completed`. We translate the values through the grounded `states.<entity>`
 * vocabulary (the same per-entity status map the status badge uses), and the
 * synthetic `from` field key through `audit.field_from` («Статус»). Pass the
 * page's `auditEntity` slug so the right per-entity status map is selected.
 */
export function useAuditLabels(entity?: string) {
  const tAudit = useTranslations('audit');
  const tFields = useTranslations('fields');
  const tStates = useTranslations('states');

  const translateAction = (action: string): string => {
    // Audit slugs use `:` for the FSM target state ("transition:posted") and
    // `-`/`.` in compound verbs ("mass-edit"); flatten every separator to `_`
    // to match the flat i18n keys (action_transition_posted, action_mass_edit).
    const key = action.replace(/[-.:]/g, '_');
    if (tAudit.has(`action_${key}` as 'action_create')) {
      return tAudit(`action_${key}` as 'action_create');
    }
    // Any transition we have not given a dedicated label degrades gracefully to
    // a generic "status changed" rather than leaking the raw `transition:<x>`.
    if (action.startsWith('transition') && tAudit.has('action_transition')) {
      return tAudit('action_transition');
    }
    return action;
  };

  const translateField = (field: string): string => {
    // `from` is the synthetic key every FSM transition diff uses
    // (`fieldChanges = { from: { before, after } }`); no entity has a real
    // column called `from`, so this is exclusively the status-change row.
    if (field === 'from' && tAudit.has('field_from' as 'action_create')) {
      return tAudit('field_from' as 'action_create');
    }
    const key = field.replace(/([A-Z])/g, '_$1').toLowerCase();
    return tFields.has(key as 'number') ? tFields(key as 'number') : field;
  };

  // PascalCase auditEntity ("WorkOrder", "CustomerOrder") → snake states key
  // ("work_order", "customer_order"). Slugs that are already snake/lowercase
  // ("online_order", "bom") pass through unchanged — they do not emit FSM
  // transitions, so they never reach the lookup below.
  const stateNamespace = entity
    ? entity.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
    : undefined;

  /**
   * Localise a single audit diff value. Only the FSM transition status value
   * (the `from` field on a `transition:*` entry) is mapped — through the
   * grounded `states.<entity>` vocabulary. Every other field/value returns
   * `undefined` so the timeline renders it with its default formatter.
   */
  const translateValue = (field: string, value: unknown, action: string): string | undefined => {
    if (
      field !== 'from' ||
      typeof value !== 'string' ||
      !action.startsWith('transition') ||
      !stateNamespace
    ) {
      return undefined;
    }
    const stateKey = `${stateNamespace}.${value}` as 'customer_order.draft';
    // Unknown state (entity has no grounded map, or a value we have not mapped)
    // degrades to the raw slug — identical to the pre-fix render, never worse.
    return tStates.has(stateKey) ? tStates(stateKey) : value;
  };

  return { translateAction, translateField, translateValue };
}
