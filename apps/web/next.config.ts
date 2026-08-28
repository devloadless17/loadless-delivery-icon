import withSerwistInit from '@serwist/next';
import type { NextConfig } from 'next';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:4100';

const withSerwist = withSerwistInit({
  swSrc: 'src/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV !== 'production',
});

const nextConfig: NextConfig = {
  // standalone only for the Docker image; `next start` (e2e, ad-hoc) needs default output
  output: process.env.STANDALONE_OUTPUT ? 'standalone' : undefined,
  // Socket.IO handshakes hit /socket.io/?EIO=4 — Next's trailing-slash 308
  // would break them before the rewrite proxy runs.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    // Dev + prod parity: the browser always talks same-origin; /api and
    // /socket.io are proxied (Next in dev, Caddy in prod handles it upstream).
    return [
      { source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` },
      { source: '/socket.io/:path*', destination: `${API_ORIGIN}/socket.io/:path*` },
    ];
  },
};

export default withSerwist(nextConfig);
