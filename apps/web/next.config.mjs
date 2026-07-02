import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow a side-by-side build dir so a throwaway `next dev` (cert/review) can run
  // WITHOUT clobbering the prod `dev:fast` server's `.next` (they share the dir and
  // corrupt each other's chunks otherwise). Default unchanged → zero prod impact.
  distDir: process.env.NEXT_DISTDIR || '.next',
  // Hide the Next.js dev-mode indicator (the floating «N» logo button) — it only
  // appears under `next dev` (never in production) but it overlaps the document
  // editor's bottom-right during live moysklad-parity review.
  devIndicators: false,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_ORIGIN ?? 'http://localhost:4000'}/api/:path*`,
      },
    ];
  },
  async redirects() {
    return [
      { source: '/sales-funnel', destination: '/opportunities', permanent: false },
      { source: '/stock-balance', destination: '/reports/stock-balance', permanent: false },
    ];
  },
};

export default withNextIntl(nextConfig);
