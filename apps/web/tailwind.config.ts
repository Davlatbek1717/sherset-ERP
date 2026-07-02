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
      },
    },
  },
  plugins: [],
};

export default config;
