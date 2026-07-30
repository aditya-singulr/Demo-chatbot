import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js rejects a bare "*"; these patterns cover IPv4 and multi-segment hosts.
  // Do not set turbopack.root to this app dir — it breaks CSS @import resolution
  // (resolves from the parent, e.g. /home/ubuntu) when a parent lockfile exists.
  allowedDevOrigins: ["*.*", "*.*.*", "*.*.*.*", "*.*.*.*.*", "*.*.*.*.*.*"],
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization, api-subscription-key" },
        ],
      },
    ];
  },
};

export default nextConfig;
