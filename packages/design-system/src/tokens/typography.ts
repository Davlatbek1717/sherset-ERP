/**
 * Typography tokens — extracted from Moysklad CSS.
 *
 * Primary font family (used 33× in Moysklad stylesheet):
 *   "Helvetica Neue", Helvetica, Arial, "Lucida Grande", sans-serif
 *
 * Secondary (Tahoma, 19× — for tables + dense UI):
 *   Tahoma, Geneva, sans-serif
 *
 * Body size 12-13px — Moysklad's density is tight.
 */

export const fontFamilies = {
  sans: '"Helvetica Neue", Helvetica, Arial, "Lucida Grande", sans-serif',
  dense: 'Tahoma, Geneva, sans-serif',
  mono: '"JetBrains Mono", Menlo, Monaco, Consolas, monospace',
} as const;

export const fontWeights = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

export const fontSizes = {
  xs: '11px', // Moysklad minimum readable
  sm: '12px', // Dense table cells
  base: '13px', // Default body (Moysklad)
  md: '14px', // Slightly larger body
  lg: '16px', // Section titles
  xl: '18px', // Subheadings
  '2xl': '20px', // Page titles
  '3xl': '24px', // Hero titles
} as const;

export const lineHeights = {
  tight: 1.15,
  snug: 1.3,
  normal: 1.45,
  relaxed: 1.6,
} as const;

export const letterSpacings = {
  tight: '-0.01em',
  normal: '0',
  wide: '0.02em',
} as const;

/** Pre-composed typography presets */
export const typography = {
  pageTitle: {
    fontFamily: fontFamilies.sans,
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.tight,
  },
  sectionTitle: {
    fontFamily: fontFamilies.sans,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.snug,
  },
  body: {
    fontFamily: fontFamilies.sans,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.regular,
    lineHeight: lineHeights.normal,
  },
  bodyDense: {
    fontFamily: fontFamilies.dense,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.regular,
    lineHeight: lineHeights.snug,
  },
  caption: {
    fontFamily: fontFamilies.sans,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.regular,
    lineHeight: lineHeights.snug,
  },
  label: {
    fontFamily: fontFamilies.sans,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    lineHeight: lineHeights.snug,
  },
  button: {
    fontFamily: fontFamilies.sans,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
    lineHeight: 1,
  },
  tabular: {
    fontFamily: fontFamilies.mono,
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
  },
} as const;
