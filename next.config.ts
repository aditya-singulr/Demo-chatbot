import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Parent dirs may have other lockfiles (e.g. /home/ubuntu/pnpm-lock.yaml).
  // Pin the app root so Turbopack doesn't pick the wrong workspace.
  turbopack: {
    root: path.join(__dirname),
  },
  // Allow HMR /dev resources when the UI is opened via a public host/IP.
  allowedDevOrigins: ["54.92.220.141"],
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
