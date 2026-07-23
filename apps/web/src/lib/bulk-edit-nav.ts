/**
 * «Массовое редактирование» full-page navigation (moysklad #bulkEdit parity,
 * owner 2026-07-10: the wizard is a SEPARATE PAGE, not a modal).
 *
 * The id set can be up to 100 ids (too long for a query string), so the
 * payload travels via sessionStorage: the list page stashes it and navigates;
 * /bulk-edit reads it back (surviving a refresh, dying with the tab — the
 * same lifetime moysklad's own #bulkEdit state has).
 */

export const BULK_EDIT_STORAGE_KEY = 'bulkEdit';

export interface BulkEditPayload {
  /** Entity slug — must exist in the /bulk-edit page's ENTITY_CONFIG. */
  entity: string;
  /** Target document ids (selection, or the visible page at 0 selection). */
  ids: string[];
  /** List URL to return to on Закрыть / after apply. */
  from: string;
}

export function stashBulkEdit(payload: BulkEditPayload): void {
  sessionStorage.setItem(BULK_EDIT_STORAGE_KEY, JSON.stringify(payload));
}

export function readBulkEdit(): BulkEditPayload | null {
  try {
    const raw = sessionStorage.getItem(BULK_EDIT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BulkEditPayload;
    if (!parsed.entity || !Array.isArray(parsed.ids)) return null;
    return parsed;
  } catch {
    return null;
  }
}
