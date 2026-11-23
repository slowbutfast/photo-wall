import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  serverExternalPackages: ['@libsql/client', 'libsql'],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
