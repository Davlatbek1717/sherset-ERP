import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}', '../../packages/design-system/src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
    },
    extend: {
      fontFamily: {
        sans: ['var(--ms-font-sans)'],
        mono: ['var(--ms-font-mono)'],
        // POS mahsulot nomlari uchun (P04, 2026-08-13) — globals.css'dagi
        // --pos-font-product (Segoe UI zanjiri).
        pos: ['var(--pos-font-product)'],
      },
      /* OWNER OVERRIDE 2026-07-14: default `border`/`divide` utilities render
       * 1.5px (was 1px) so separators don't melt into the white background.
       * Explicit widths (border-2, border-t-2, …) are untouched. */
      borderWidth: {
        DEFAULT: '1.5px',
      },
    },
  },
  plugins: [],
};

export default config;
