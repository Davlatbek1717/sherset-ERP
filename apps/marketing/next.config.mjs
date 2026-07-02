/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // Static export — produces a /out directory of HTML/CSS/JS
  // suitable for any static host (Cloudflare Pages, Nginx, S3+CloudFront).
  // Marketing has no server-rendered routes; the app behind /app runs from
  // a separate origin so the marketing build can ship as pure static assets.
  reactStrictMode: true,
  images: {
    // The static export adapter doesn't support next/image's default
    // optimisation pipeline; fall back to unoptimised <img> for marketing.
    unoptimized: true,
  },
};

export default nextConfig;
