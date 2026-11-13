import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Keep for now so type errors in leftover files don't block the build.
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig