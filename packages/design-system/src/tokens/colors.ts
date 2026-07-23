/**
 * Color tokens — extracted from REAL Moysklad CSS
 * (cdn-static.moysklad.ru/app/cdn/r1657/_common.css).
 *
 * Primary blue #186999 is used 145× in Moysklad's stylesheet — THE
 * canonical brand color. All other tokens sampled from their palette.
 */

export const palette = {
  // Brand — Moysklad blue (primary action, links, selected state)
  brand: {
    50: '#ecf8ff', // very light background tint
    100: '#e4f1fa', // light background
    200: '#dae7f5', // soft surface
    300: '#76acd3', // light accent
    400: '#4893c3', // medium
    500: '#186999', // PRIMARY — Moysklad's core brand blue
    600: '#1f75a8', // hover
    700: '#2076a9', // active
    800: '#0e4875', // darker
    900: '#091739', // DARK NAVY — app bar background
  },
  // Accent — bright cyan-blue (hyperlinks, call-to-action)
  accent: {
    400: '#3ec5ff',
    500: '#2f9bff',
    600: '#036ce5',
  },
  // Neutral grays — Moysklad's gray scale
  neutral: {
    0: '#ffffff',
    50: '#f7f7f7', // bg lightest
    100: '#f2f2f2', // bg light
    150: '#ededed',
    200: '#e6e6e6', // border default
    300: '#d6d6d6', // border stronger
    400: '#bfbfbf', // border strong
    500: '#909090', // text muted
    600: '#808080', // text secondary
    700: '#767676', // text
    800: '#5f6d79',
    900: '#313131', // text primary
    1000: '#091739', // dark bg (navy)
  },
  // Success — Moysklad green
  success: {
    50: '#dff3df',
    100: '#cce255', // lime for badges
    500: '#369a1e',
    700: '#2a7517',
  },
  // Warning — Moysklad orange/yellow
  warning: {
    50: '#ffe6d5',
    100: '#fffb8c',
    500: '#f88001',
    600: '#db7609',
    700: '#d1622a',
  },
  // Destructive — Moysklad red
  destructive: {
    50: '#ffe3e0',
    100: '#ee644a',
    500: '#ce1b1b',
    600: '#e92919',
    700: '#a81313',
  },
  // Info — same as brand blue family
  info: {
    50: '#e4f1fa',
    100: '#dae7f5',
    500: '#186999',
    700: '#0e4875',
  },
} as const;

/**
 * Semantic tokens — context-aware aliases.
 * Always use these in components, NEVER raw palette values.
 */
export const semanticColors = {
  light: {
    // App-level
    'bg-app': palette.neutral[50],
    'bg-surface': palette.neutral[0],
    'bg-surface-elevated': palette.neutral[0],
    'bg-muted': palette.neutral[100],
    'bg-hover': palette.brand[100],
    'bg-selected': palette.brand[200],
    'bg-navbar': palette.brand[900], // dark navy for top navigation

    // Text
    'text-primary': palette.neutral[900],
    'text-secondary': palette.neutral[700],
    'text-muted': palette.neutral[500],
    'text-disabled': palette.neutral[400],
    'text-inverse': palette.neutral[0],
    'text-brand': palette.brand[500],
    'text-link': palette.accent[600],
    'text-success': palette.success[700],
    'text-warning': palette.warning[700],
    'text-destructive': palette.destructive[500],

    // Borders
    'border-default': palette.neutral[200],
    'border-strong': palette.neutral[400],
    'border-focus': palette.brand[500],

    // Actions
    'action-primary': palette.brand[500],
    'action-primary-hover': palette.brand[600],
    'action-primary-active': palette.brand[700],
    'action-destructive': palette.destructive[500],
    'action-destructive-hover': palette.destructive[600],
  },
  dark: {
    'bg-app': palette.neutral[1000],
    'bg-surface': '#1a2744',
    'bg-surface-elevated': '#243457',
    'bg-muted': '#1a2744',
    'bg-hover': '#2a3d67',
    'bg-selected': '#2a4c7a',
    'bg-navbar': palette.brand[900],

    'text-primary': '#f0f4fa',
    'text-secondary': '#c0cbdb',
    'text-muted': '#8092ab',
    'text-disabled': '#5b6a83',
    'text-inverse': palette.neutral[900],
    'text-brand': palette.brand[300],
    'text-link': palette.accent[400],
    'text-success': palette.success[500],
    'text-warning': palette.warning[500],
    'text-destructive': palette.destructive[100],

    'border-default': '#2a3d67',
    'border-strong': '#3d527d',
    'border-focus': palette.brand[400],

    'action-primary': palette.brand[500],
    'action-primary-hover': palette.brand[400],
    'action-primary-active': palette.brand[300],
    'action-destructive': palette.destructive[500],
    'action-destructive-hover': palette.destructive[600],
  },
} as const;

export type SemanticColorToken = keyof typeof semanticColors.light;
