import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use Turbopack (Next.js 16 default)
  // PDF.js is loaded from CDN, so no special bundler config needed
  turbopack: {},
};

export default nextConfig;
