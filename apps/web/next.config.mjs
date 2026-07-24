import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Deploy-speed (perf audit 2026-07-23): `next build` on the CPU-contended
  // multi-tenant VPS is the deploy long-pole. The deploy gate ALREADY runs
  // `turbo run typecheck` (tsc) and biome separately (CLAUDE.md §1), so
  // re-type-checking + re-linting inside `next build` is pure duplication on
  // the slowest possible machine. Skip both IN THE BUILD — the standalone
  // typecheck/biome gates remain the safety net (they MUST keep running
  // pre-deploy). This does not weaken type-safety; it stops paying for it twice.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // Bundle-size (perf audit 2026-07-23): tree-shake barrel imports so a page
  // that uses one helper doesn't ship the whole package. Matters for cold-load
  // over the Germany→UZ distance (less JS to pull). These packages have large
  // barrels (date-fns = hundreds of modules, recharts = full chart lib); Next
  // rewrites `import { x } from 'pkg'` to the direct submodule path.
  experimental: {
    optimizePackageImports: ['recharts', 'date-fns', 'date-fns-tz', 'lucide-react'],
  },
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
