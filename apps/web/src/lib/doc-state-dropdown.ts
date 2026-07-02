/**
 * Shared helpers for the moysklad-parity inline state-change dropdown
 * («Новый ▾») in document detail headers.
 *
 * Most FSM documents share the same three manually-settable workflow
 * states — draft / posted / cancelled — wired to verb-based transition
 * endpoints (post / unpost / cancel). This module centralises the colour
 * palette + state→verb map so each detail page doesn't repeat them.
 *
 * Pages with non-standard FSMs (customer-orders' 8 state-slug states,
 * purchase-orders' confirm/unconfirm verbs, inventory's no-unpost) pass
 * their own maps instead.
 */

/** Standard draft/posted/cancelled colour swatches (tenant State.color
 *  parity — neutral grey / green / red). */
export const DOC_STATE_COLOR: Record<string, string> = {
  draft: '#9ca3af',
  posted: '#16a34a',
  cancelled: '#e92919',
};

/** Standard state→verb map for post/unpost/cancel FSM documents. */
export const DOC_STATE_VERB: Record<string, string> = {
  draft: 'unpost',
  posted: 'post',
  cancelled: 'cancel',
};

export interface DocStateMenuItem {
  slug: string;
  label: string;
  color?: string | null;
}

/**
 * Build the `stateMenuItems` array for a standard draft/posted/cancelled
 * document. `labelFor` localises each slug (the page's
 * `useTranslations('states.<doc>')`).
 */
export function buildDocStateMenu(
  slugs: readonly string[],
  labelFor: (slug: string) => string,
  colorMap: Record<string, string> = DOC_STATE_COLOR,
): DocStateMenuItem[] {
  return slugs.map((slug) => ({
    slug,
    label: labelFor(slug),
    color: colorMap[slug],
  }));
}
