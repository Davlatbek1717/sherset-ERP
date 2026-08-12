/**
 * Accidental-close guard for Radix `<Dialog.Content>`.
 *
 * Radix closes a dialog on Escape and on any interaction outside the card.
 * That default is wrong for every dialog in this app that holds work in
 * progress: on the shop-floor touch monoblock a brush against the dimmer —
 * or a stray key from the barcode scanner — wiped a half-filled payment form
 * with no undo, and the cashier had to key the whole receipt again (owner's
 * live test, 2026-08-12). A dialog must close only on a deliberate gesture:
 * the ✕, Cancel, or the primary action.
 *
 * Spread it on the `<Dialog.Content>` of any dialog that carries user input:
 *
 * ```tsx
 * <Dialog.Content {...noAccidentalClose} data-test-id="pos-payment">
 * ```
 *
 * `<Modal>` / `<Drawer>` already apply this contract themselves — they expose
 * a `dismissible` prop to opt back out. Overlays that hold nothing (command
 * palette, help panel, nav sheet, filter panel) stay dismissible; mark those
 * with a `dismissible-by-design:` comment so the intent is visible and the
 * convention guard (`apps/web/src/__tests__/dialog-dismissal.test.ts`) can
 * tell "reviewed and deliberate" from "forgotten".
 *
 * Typed structurally, not against Radix's event unions, so the one object
 * fits `onEscapeKeyDown` (KeyboardEvent) and `onInteractOutside`
 * (PointerDownOutside | FocusOutside) alike.
 */
export const noAccidentalClose: {
  onEscapeKeyDown: (event: { preventDefault: () => void }) => void;
  onInteractOutside: (event: { preventDefault: () => void }) => void;
  onOpenAutoFocus: (event: AutoFocusEvent) => void;
} = {
  onEscapeKeyDown: (event) => event.preventDefault(),
  onInteractOutside: (event) => event.preventDefault(),
  onOpenAutoFocus: (event) => parkInitialFocus(event),
};

type AutoFocusEvent = { preventDefault: () => void; currentTarget: unknown };

/**
 * On open, park focus on the dialog card itself instead of the first tabbable
 * child.
 *
 * The second half of the same complaint: Radix hands initial focus to the
 * first focusable element, which in our chrome is the header ✕. The dialog
 * then closes on the very next Enter or Space — and at a till, "the next
 * keystroke" is routinely a barcode scanner firing its trailing Enter into
 * whatever has focus. Focus still stays trapped inside the dialog (Radix's
 * focus scope is untouched), it just starts somewhere that does nothing.
 *
 * A field that asked for focus itself (`autoFocus` — the amount input, a
 * picker's search box) has already taken it by the time this runs, and keeps
 * it: we only step in when nothing inside the dialog claimed focus.
 */
export function parkInitialFocus(event: AutoFocusEvent): void {
  const root = event.currentTarget as HTMLElement | null;
  if (!root || typeof root.focus !== 'function') return;
  const active = typeof document === 'undefined' ? null : document.activeElement;
  if (active && active !== root && root.contains(active)) return;
  event.preventDefault();
  root.focus();
}
