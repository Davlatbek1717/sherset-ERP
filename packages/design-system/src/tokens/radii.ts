/**
 * Border radius tokens — Moysklad uses minimal rounding (2-4px max).
 * GWT-era look: mostly square corners.
 */

export const radii = {
  none: '0',
  sm: '2px',
  default: '3px', // Moysklad default
  md: '4px',
  lg: '6px',
  xl: '8px',
  full: '9999px',
} as const;

export type Radius = keyof typeof radii;
