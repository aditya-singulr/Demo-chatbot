import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Parent dirs may have other lockfiles (e.g. /home/ubuntu/pnpm-lock.yaml).
  turbopack: {
    root: path.join(__dirname),
  },
  // Next.js rejects a bare "*"; these patterns cover IPv4 and multi-segment hosts.
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
