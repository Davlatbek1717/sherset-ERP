/**
 * Z-index scale. Use only these values — never raw numbers in components.
 */

export const zIndices = {
  base: 0,
  raised: 10,
  dropdown: 100,
  sticky: 200,
  overlay: 300,
  modal: 400,
  /** Confirm/conflict dialogs outrank modals — they can be invoked from inside
   *  an open Modal (optimistic-lock conflict reload, in-modal delete prompt). */
  confirm: 450,
  popover: 500,
  tooltip: 600,
  toast: 700,
  max: 9999,
} as const;

export type ZIndex = keyof typeof zIndices;
