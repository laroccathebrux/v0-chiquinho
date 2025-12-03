import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Required for Next.js 16 with Turbopack
  turbopack: {},
  webpack: (config, { isServer }) => {
    // Handle pdfjs-dist canvas dependency
    if (isServer) {
      config.externals = config.externals || []
      config.externals.push({
        canvas: "commonjs canvas",
      })
    }

    // Ignore canvas module in client bundle
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    }

    return config
  },
  // Ensure pdfjs-dist is transpiled properly
  transpilePackages: ["pdfjs-dist"],
}

export default nextConfig
